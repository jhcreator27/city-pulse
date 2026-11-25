// POST /functions/v1/connect-onboarding  { organizer_id }
// Crea (se manca) l'account Stripe Express dell'organizzatore e restituisce
// il link per completare i dati (IBAN, documento). Al ritorno lo stato si
// aggiorna con il webhook account.updated, o subito chiamando di nuovo con { check:true }.
import { cors, json, fail } from "../_shared/cors.ts";
import { admin, stripe, getUser, canManageOrg, SITE_URL } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return fail("Accedi per continuare", 401);
  const { organizer_id, check } = await req.json().catch(() => ({}));
  if (!organizer_id || !(await canManageOrg(user.id, organizer_id))) return fail("Non autorizzato", 403);

  const { data: org } = await admin.from("organizers").select("id, name, stripe_account_id").eq("id", organizer_id).single();
  if (!org) return fail("Organizzatore non trovato", 404);

  let accountId = org.stripe_account_id as string | null;
  if (!accountId) {
    const acct = await stripe.accounts.create({
      type: "express",
      country: "IT",
      email: user.email,
      business_profile: { name: org.name, mcc: "7922", product_description: "Eventi e spettacoli a Palermo venduti su City Pulse" },
      capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
      metadata: { organizer_id: org.id },
    });
    accountId = acct.id;
    await admin.from("organizers").update({ stripe_account_id: accountId }).eq("id", org.id);
  }

  if (check) {
    const a = await stripe.accounts.retrieve(accountId);
    const ready = !!(a.charges_enabled && a.payouts_enabled);
    await admin.from("organizers").update({ stripe_ready: ready }).eq("id", org.id);
    return json({ ready });
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${SITE_URL}/#org-pagamenti`,
    return_url: `${SITE_URL}/#org-pagamenti`,
  });
  return json({ url: link.url });
});
