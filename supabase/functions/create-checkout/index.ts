// POST /functions/v1/create-checkout
// Body biglietti:   { kind:"tickets", event_id, items:[{ticket_type_id, qty}], buyer:{name,email,phone},
//                     code?, source?, age_range?, origin?, lang }
// Body rivendita:   { kind:"resale", listing_id, buyer:{name,email,phone}, lang }
// Cena (facoltativa nei biglietti): dinner:{ offer_id, slot, people }
// Body promozione:  { kind:"promotion", event_id, package:"boost"|"weekend"|"premium", lang }
// Risposta: { url } (pagina di pagamento Stripe) oppure { free:true, tickets:n }
import { cors, json, fail } from "../_shared/cors.ts";
import { admin, stripe, getUser, canManageOrg, PACKAGES, SITE_URL, BOOKING_FEE_CENTS } from "../_shared/clients.ts";
import { sendTicketsEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("Metodo non consentito", 405);

  const user = await getUser(req);
  if (!user) return fail("Accedi per continuare", 401);

  let body: any;
  try { body = await req.json(); } catch { return fail("Richiesta non valida"); }
  const lang = body.lang === "en" ? "en" : "it";

  if (body.kind === "resale" && body.listing_id) {
    const { data: l } = await admin.from("resale_listings").select("event_id").eq("id", body.listing_id).single();
    if (!l) return fail("Biglietto non più disponibile", 404);
    body.event_id = l.event_id;
  }
  const { data: ev } = await admin.from("events")
    .select("id, slug, title, title_en, organizer_id, status, ends_at, ticketing_mode, partner_url")
    .eq("id", body.event_id).single();
  if (!ev) return fail("Evento non trovato", 404);
  const evUrl = `${SITE_URL}/#evento-${ev.slug ?? ev.id}`;

  // ---------- Promozione "In evidenza" (incasso di City Pulse) ----------
  if (body.kind === "promotion") {
    const pkg = PACKAGES[body.package];
    if (!pkg) return fail("Pacchetto non valido");
    if (!(await canManageOrg(user.id, ev.organizer_id))) return fail("Non autorizzato", 403);
    const { data: order, error } = await admin.from("orders").insert({
      kind: "promotion", user_id: user.id, event_id: ev.id, status: "pending",
      subtotal_cents: pkg.cents, total_cents: pkg.cents, application_fee_cents: pkg.cents,
      promo_package: body.package, buyer_email: user.email,
    }).select().single();
    if (error) return fail(error.message);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: lang,
      customer_email: user.email,
      line_items: [{ quantity: 1, price_data: { currency: "eur", unit_amount: pkg.cents,
        product_data: { name: `${pkg.name} · ${ev.title}` } } }],
      metadata: { order_id: order.id, kind: "promotion" },
      client_reference_id: order.id,
      success_url: `${SITE_URL}/#org-promo`,
      cancel_url: `${SITE_URL}/#org-promo`,
      invoice_creation: { enabled: true },
    });
    await admin.from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
    return json({ url: session.url });
  }

  // ---------- Biglietti ----------
  if (ev.ticketing_mode === "partner") return json({ redirect: ev.partner_url });
  const buyer = body.buyer ?? {};
  if (!buyer.name || !buyer.email) return fail("Nome ed email obbligatori");

  const resale = body.kind === "resale";
  const { data: reserved, error } = resale ? await admin.rpc("reserve_resale", {
    p_user: user.id, p_listing: body.listing_id,
    p_buyer_name: String(buyer.name).slice(0, 80), p_buyer_email: String(buyer.email).slice(0, 120),
    p_buyer_phone: buyer.phone ? String(buyer.phone).slice(0, 30) : null, p_booking_fee_cents: BOOKING_FEE_CENTS,
  }) : await admin.rpc("reserve_order", {
    p_user: user.id, p_event: ev.id, p_items: body.items ?? [],
    p_buyer_name: String(buyer.name).slice(0, 80), p_buyer_email: String(buyer.email).slice(0, 120),
    p_buyer_phone: buyer.phone ? String(buyer.phone).slice(0, 30) : null,
    p_booking_fee_cents: BOOKING_FEE_CENTS,
    p_code: body.code ? String(body.code).slice(0, 24) : null,
    p_source: body.source ? String(body.source).slice(0, 30) : null,
    p_age_range: ['<18', '18-24', '25-34', '35-44', '45-54', '55+'].includes(body.age_range) ? body.age_range : null,
    p_origin: body.origin ? String(body.origin).slice(0, 60) : null,
  });
  if (error) return fail(error.message);
  let order = reserved;
  // pacchetto cena: si aggiunge all'ordine (posti a tavola controllati dal database)
  if (!resale && body.dinner?.offer_id) {
    const { data: o2, error: e3 } = await admin.rpc("add_dinner", {
      p_order: order.id, p_offer: body.dinner.offer_id, p_slot: String(body.dinner.slot ?? ""), p_people: Number(body.dinner.people) || 1,
    });
    if (e3) { await admin.rpc("cancel_order", { p_order: order.id, p_status: "failed" }); return fail(e3.message, 409); }
    order = o2;
  }

  // Evento gratuito: biglietti emessi subito
  if (order.total_cents === 0) {
    const { data: n, error: e2 } = await admin.rpc("complete_order", { p_order: order.id, p_payment_intent: null, p_free: true });
    if (e2) return fail(e2.message);
    await sendTicketsEmail(order.id).catch(() => { });
    return json({ free: true, tickets: n });
  }

  const { data: org } = await admin.from("organizers").select("stripe_account_id, stripe_ready").eq("id", ev.organizer_id).single();
  if (!org?.stripe_account_id || !org.stripe_ready) {
    await admin.rpc("cancel_order", { p_order: order.id, p_status: "failed" });
    return fail("L'organizzatore non ha ancora attivato i pagamenti", 409);
  }

  try {
    const expires = Math.floor(Date.now() / 1000) + 31 * 60; // Stripe: minimo 30 minuti
    const title = lang === "en" && ev.title_en ? ev.title_en : ev.title;
    let dinnerName = "";
    if (order.dinner_cents > 0) {
      const { data: b } = await admin.from("dinner_bookings").select("slot, people, dinner_offers(title, restaurants(name, organizer_id, organizers(stripe_ready)))").eq("order_id", order.id).single();
      const r = (b as any)?.dinner_offers?.restaurants;
      if (!r?.organizers?.stripe_ready) throw new Error("Il ristorante non ha ancora attivato i pagamenti");
      dinnerName = `${r.name}, ${b!.slot}, ${b!.people} ${b!.people === 1 ? (lang === "en" ? "person" : "persona") : (lang === "en" ? "people" : "persone")}`;
    }
    // Codice sconto City Pulse → coupon Stripe monouso dello stesso importo
    const discounts = order.discount_cents > 0
      ? [{ coupon: (await stripe.coupons.create({ amount_off: order.discount_cents, currency: "eur", duration: "once", max_redemptions: 1,
          name: lang === "en" ? "Discount" : "Sconto" })).id }]
      : undefined;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      locale: lang,
      customer_email: buyer.email,
      discounts,
      line_items: [
        // con gli scaglioni i biglietti dello stesso tipo possono avere prezzi diversi: una riga per tipo
        ...order.items.map((it: any) => (it.line_cents % it.qty === 0
          ? { quantity: it.qty, price_data: { currency: "eur", unit_amount: it.line_cents / it.qty, product_data: { name: `${it.name} · ${title}` } } }
          : { quantity: 1, price_data: { currency: "eur", unit_amount: it.line_cents, product_data: { name: `${it.qty}× ${it.name} · ${title}` } } })),
        ...(order.dinner_cents > 0 ? [{ quantity: 1, price_data: { currency: "eur", unit_amount: order.dinner_cents,
          product_data: { name: `${lang === "en" ? "Dinner" : "Cena"} · ${dinnerName}` } } }] : []),
        { quantity: 1, price_data: { currency: "eur", unit_amount: order.booking_fee_cents,
          product_data: { name: lang === "en" ? "Booking fee" : "Diritto di prevendita" } } },
      ],
      // con la cena il pagamento si divide tra organizzatore e ristorante (trasferimenti separati, vedi stripe-webhook);
      // altrimenti va tutto all'organizzatore meno la quota City Pulse
      payment_intent_data: order.dinner_cents > 0
        ? { transfer_group: order.id, metadata: { order_id: order.id } }
        : {
          application_fee_amount: order.application_fee_cents,       // quota City Pulse
          transfer_data: { destination: org.stripe_account_id },      // il resto all'organizzatore
          metadata: { order_id: order.id },
        },
      metadata: { order_id: order.id, kind: "tickets" },
      client_reference_id: order.id,
      expires_at: expires,
      success_url: `${SITE_URL}/#biglietti`,
      cancel_url: evUrl,
    });
    await admin.from("orders").update({
      stripe_session_id: session.id, expires_at: new Date(expires * 1000).toISOString(),
    }).eq("id", order.id);
    return json({ url: session.url });
  } catch (e) {
    await admin.rpc("cancel_order", { p_order: order.id, p_status: "failed" });
    return fail((e as Error).message, 502);
  }
});
