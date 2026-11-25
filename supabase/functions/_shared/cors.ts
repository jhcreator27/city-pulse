// Intestazioni CORS: consenti solo il dominio dell'app (SITE_URL)
const SITE = Deno.env.get("SITE_URL") ?? "*";
export const cors = {
  "Access-Control-Allow-Origin": SITE,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
export const fail = (message: string, status = 400) => json({ error: message }, status);
