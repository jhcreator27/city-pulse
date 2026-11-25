import Stripe from "npm:stripe@17.7.0";
import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.49.1";

export const SITE_URL = Deno.env.get("SITE_URL")!;
export const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2025-02-24.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

// Client con service role: bypassa RLS, solo lato server
export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

// Utente che fa la richiesta (dal token JWT nell'header Authorization)
export async function getUser(req: Request): Promise<User | null> {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

export async function canManageOrg(userId: string, orgId: string): Promise<boolean> {
  const { data } = await admin.from("organizer_members").select("role")
    .eq("organizer_id", orgId).eq("user_id", userId).maybeSingle();
  if (data && ["owner", "manager"].includes(data.role)) return true;
  const { data: p } = await admin.from("profiles").select("role").eq("id", userId).single();
  return p?.role === "admin";
}

// Pacchetti "In evidenza" (prezzo in centesimi, giorni)
export const PACKAGES: Record<string, { name: string; cents: number; days: number }> = {
  boost: { name: "Spinta 24h", cents: 900, days: 1 },
  weekend: { name: "Weekend in vetrina", cents: 2900, days: 3 },
  premium: { name: "Settimana Premium", cents: 5900, days: 7 },
};
export const BOOKING_FEE_CENTS = Number(Deno.env.get("BOOKING_FEE_CENTS") ?? 150);
