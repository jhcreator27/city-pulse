// Webhook Stripe → conferma pagamenti, scadenze, rimborsi, stato account organizzatori.
// Da registrare in Stripe con gli eventi: checkout.session.completed,
// checkout.session.async_payment_succeeded, checkout.session.expired,
// checkout.session.async_payment_failed, charge.refunded, account.updated
// (per account.updated attiva "Listen to events on Connected accounts").
import Stripe from "npm:stripe@17.7.0";
import { admin, stripe } from "../_shared/clients.ts";
import { sendTicketsEmail } from "../_shared/email.ts";

const crypto = Stripe.createSubtleCryptoProvider();

// Pacchetto cena + evento: il pagamento è sul conto City Pulse, poi si divide.
// All'organizzatore: biglietti meno la sua commissione; al ristorante: cena meno la sua commissione.
async function splitDinnerPayment(orderId: string, paymentIntent: string) {
  const { data: o } = await admin.from("orders").select("id, total_cents, booking_fee_cents, dinner_cents, dinner_fee_cents, application_fee_cents, stripe_transfers, events(organizer_id)").eq("id", orderId).single();
  if (!o || !o.dinner_cents || (Array.isArray(o.stripe_transfers) && o.stripe_transfers.length)) return;
  const pi = await stripe.paymentIntents.retrieve(paymentIntent);
  const charge = pi.latest_charge as string;
  const { data: org } = await admin.from("organizers").select("stripe_account_id").eq("id", (o as any).events.organizer_id).single();
  const { data: b } = await admin.from("dinner_bookings").select("dinner_offers(restaurants(organizers(stripe_account_id)))").eq("order_id", orderId).single();
  const rest = (b as any)?.dinner_offers?.restaurants?.organizers?.stripe_account_id;
  const ticketsNet = o.total_cents - o.dinner_cents - (o.application_fee_cents - o.dinner_fee_cents);
  const dinnerNet = o.dinner_cents - o.dinner_fee_cents;
  const ids: string[] = [];
  if (org?.stripe_account_id && ticketsNet > 0) ids.push((await stripe.transfers.create({ amount: ticketsNet, currency: "eur", destination: org.stripe_account_id, source_transaction: charge, transfer_group: orderId, metadata: { order_id: orderId, part: "tickets" } }, { idempotencyKey: `tr-t-${orderId}` })).id);
  if (rest && dinnerNet > 0) ids.push((await stripe.transfers.create({ amount: dinnerNet, currency: "eur", destination: rest, source_transaction: charge, transfer_group: orderId, metadata: { order_id: orderId, part: "dinner" } }, { idempotencyKey: `tr-d-${orderId}` })).id);
  await admin.from("orders").update({ stripe_transfers: ids }).eq("id", orderId);
}
const SECRET = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

Deno.serve(async (req) => {
  const sig = req.headers.get("Stripe-Signature");
  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig!, SECRET, undefined, crypto);
  } catch (e) {
    return new Response(`Firma non valida: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.payment_status !== "paid") break; // pagamenti differiti: arriverà async_payment_succeeded
        const orderId = s.metadata?.order_id;
        if (orderId) {
          const { error } = await admin.rpc("complete_order", {
            p_order: orderId, p_payment_intent: (s.payment_intent as string) ?? null, p_free: false,
          });
          if (error) throw error;
          if (s.metadata?.kind === "tickets") {
            await splitDinnerPayment(orderId, s.payment_intent as string).catch((e) => console.error("trasferimenti cena", e));
            await sendTicketsEmail(orderId).catch(() => { });
          }
        }
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.metadata?.order_id) {
          await admin.rpc("cancel_order", {
            p_order: s.metadata.order_id, p_status: event.type.endsWith("expired") ? "expired" : "failed",
          });
        }
        break;
      }
      case "charge.refunded": {
        const c = event.data.object as Stripe.Charge;
        if (c.refunded && c.payment_intent) await admin.rpc("refund_order", { p_payment_intent: c.payment_intent as string });
        break;
      }
      case "account.updated": {
        const a = event.data.object as Stripe.Account;
        await admin.from("organizers").update({ stripe_ready: !!(a.charges_enabled && a.payouts_enabled) })
          .eq("stripe_account_id", a.id);
        break;
      }
    }
  } catch (e) {
    // 500 → Stripe ritenta automaticamente
    return new Response(`Errore: ${(e as Error).message}`, { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
});
