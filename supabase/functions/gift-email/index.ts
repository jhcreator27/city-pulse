// POST /functions/v1/gift-email  { gift_id }
// Manda a chi riceve il regalo l'email con il link per accettarlo. Solo chi regala può chiederla.
import { cors, json, fail } from "../_shared/cors.ts";
import { admin, getUser } from "../_shared/clients.ts";
import { sendGiftEmail } from "../_shared/email.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return fail("Accedi per continuare", 401);
  const { gift_id } = await req.json().catch(() => ({}));
  const { data: g } = await admin.from("ticket_gifts").select("from_user, status").eq("id", gift_id).single();
  if (!g || g.from_user !== user.id) return fail("Regalo non trovato", 404);
  if (g.status !== "pending") return fail("Regalo non più attivo", 409);
  await sendGiftEmail(gift_id);
  return json({ sent: true });
});
