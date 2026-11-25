// POST /functions/v1/delete-account  { confirm: "CANCELLA" }
// Cancella i dati personali dell'utente (diritto all'oblio, GDPR art. 17).
// Gli ordini restano in forma anonima per gli obblighi fiscali; l'accesso viene disattivato.
import { cors, json, fail } from "../_shared/cors.ts";
import { admin, getUser } from "../_shared/clients.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const user = await getUser(req);
  if (!user) return fail("Accedi per continuare", 401);
  const body = await req.json().catch(() => ({}));
  if (body.confirm !== "CANCELLA" && body.confirm !== "DELETE") return fail("Conferma mancante");
  const { error } = await admin.rpc("anonymize_user", { p_user: user.id });
  if (error) return fail(error.message, 409);
  // email e accesso: l'utente non può più entrare, l'email torna libera per una nuova registrazione
  await admin.auth.admin.updateUserById(user.id, {
    email: `cancellato-${user.id}@utenti.citypulse.invalid`, phone: "", user_metadata: {}, ban_duration: "876000h",
  });
  await admin.auth.admin.signOut(user.id).catch(() => { });
  return json({ deleted: true });
});
