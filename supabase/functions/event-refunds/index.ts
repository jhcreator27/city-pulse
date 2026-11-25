// Esegue i rimborsi in coda (eventi annullati, richieste dopo un rinvio).
// Chiamata dal cron ogni 5 minuti con la service role key.
// Rimborso completo all'acquirente: la quota passata all'organizzatore viene ripresa (reverse_transfer)
// e anche la commissione City Pulse viene restituita (refund_application_fee).
import { admin, stripe } from "../_shared/clients.ts";
import { json, fail } from "../_shared/cors.ts";
import { sendNoticeEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if ((req.headers.get("Authorization") ?? "").replace("Bearer ", "") !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return fail("Non autorizzato", 401);
  const { data: list, error } = await admin.rpc("take_refunds", { p_limit: 50 });
  if (error) return fail(error.message, 500);
  let ok = 0, ko = 0;
  for (const r of (list ?? []) as any[]) {
    try {
      if (!r.payment_intent) throw new Error("Pagamento non trovato");
      const { data: o } = await admin.from("orders").select("stripe_transfers").eq("id", r.order_id).single();
      // pacchetto cena: il pagamento è stato diviso con trasferimenti separati, che vanno ripresi uno per uno
      const split = Array.isArray(o?.stripe_transfers) && o!.stripe_transfers.length > 0;
      const ref = await stripe.refunds.create(split
        ? { payment_intent: r.payment_intent, metadata: { order_id: r.order_id, refund_id: r.refund_id } }
        : { payment_intent: r.payment_intent, reverse_transfer: true, refund_application_fee: true, metadata: { order_id: r.order_id, refund_id: r.refund_id } },
        { idempotencyKey: `refund-${r.refund_id}` });
      if (split) for (const tr of o!.stripe_transfers as string[]) {
        await stripe.transfers.createReversal(tr, {}, { idempotencyKey: `rev-${r.refund_id}-${tr}` }).catch(() => { });
      }
      await admin.from("refunds").update({ status: "done", stripe_refund: ref.id, done_at: new Date().toISOString() }).eq("id", r.refund_id);
      await sendNoticeEmail(r.order_id, "refund", "Rimborso effettuato · City Pulse",
        `Abbiamo rimborsato € ${(r.amount_cents / 100).toFixed(2).replace(".", ",")} sul metodo di pagamento usato. L'accredito può richiedere alcuni giorni lavorativi.`);
      ok++;
    } catch (e) {
      await admin.from("refunds").update({ status: "failed", error: (e as Error).message }).eq("id", r.refund_id);
      ko++;
    }
  }
  // rivendita sicura: il venditore riceve indietro il prezzo del biglietto rivenduto (rimborso parziale del suo ordine)
  const { data: pays } = await admin.rpc("take_resale_payouts", { p_limit: 50 });
  let resold = 0;
  for (const p of (pays ?? []) as any[]) {
    try {
      if (!p.payment_intent) throw new Error("Pagamento non trovato");
      const ref = await stripe.refunds.create({
        payment_intent: p.payment_intent, amount: p.amount_cents, reverse_transfer: true, refund_application_fee: true,
        metadata: { order_id: p.order_id, resale_payout: p.payout_id },
      }, { idempotencyKey: `resale-${p.payout_id}` });
      await admin.from("resale_payouts").update({ status: "done", stripe_refund: ref.id, done_at: new Date().toISOString() }).eq("id", p.payout_id);
      await sendNoticeEmail(p.order_id, "resale_refund", "Biglietto rivenduto · City Pulse",
        `Il tuo biglietto è stato rivenduto: ti rimborsiamo € ${(p.amount_cents / 100).toFixed(2).replace(".", ",")} sul metodo di pagamento usato. Il diritto di prevendita non è rimborsabile.`);
      resold++;
    } catch (e) {
      await admin.from("resale_payouts").update({ status: "failed", error: (e as Error).message }).eq("id", p.payout_id);
    }
  }
  // i biglietti vengono annullati dal webhook charge.refunded (solo per i rimborsi completi)
  return json({ refunded: ok, failed: ko, resale_payouts: resold });
});
