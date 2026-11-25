// Pagine pubbliche indicizzabili: /evento/<slug>, /luogo/<id>, /artista/<slug>, /sitemap.xml
// L'hosting del sito inoltra questi indirizzi qui (vedi web/vercel.json o web/_redirects).
// Chiamata: GET /functions/v1/seo?path=/evento/indie-night-castello&lang=en
import { createClient } from "npm:@supabase/supabase-js@2.49.1";
import { eventPage, venuePage, artistPage, sitemap, type Ev } from "../_shared/seo-render.ts";

const SITE = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });

async function loadEvents(): Promise<Ev[]> {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString();
  const [{ data: evs }, { data: tts }, { data: prices }] = await Promise.all([
    db.from("public_events").select("*").gte("ends_at", since).order("starts_at").limit(500),
    db.from("ticket_types").select("id, event_id, name, price_cents, quantity, sold, reserved, is_addon"),
    db.from("ticket_prices").select("*"),
  ]);
  return (evs ?? []).map((e: any) => ({
    ...e,
    tickets: (tts ?? []).filter((t: any) => t.event_id === e.id && !t.is_addon).map((t: any) => ({
      name: t.name, price_cents: t.price_cents,
      current_price_cents: (prices ?? []).find((p: any) => p.ticket_type_id === t.id)?.current_price_cents ?? t.price_cents,
      available: t.quantity - t.sold - t.reserved,
    })),
  }));
}

const page = (html: string, status = 200, type = "text/html; charset=utf-8") =>
  new Response(html, { status, headers: { "Content-Type": type, "Cache-Control": "public, max-age=300, s-maxage=900" } });

Deno.serve(async (req) => {
  const u = new URL(req.url);
  const path = (u.searchParams.get("path") ?? "/").replace(/\/+$/, "") || "/";
  const lang = u.searchParams.get("lang") === "en" ? "en" : "it";
  const events = await loadEvents();
  const [, kind, id] = path.split("/");

  if (path === "/sitemap.xml") return page(sitemap(events, SITE), 200, "application/xml; charset=utf-8");
  if (kind === "evento" && id) {
    const e = events.find((x) => x.slug === id || x.id === id);
    if (e) return page(eventPage(e, SITE, lang, u.searchParams.get("s")));
  }
  if (kind === "luogo" && id) { const h = venuePage(id, events, SITE, lang); if (h) return page(h); }
  if (kind === "artista" && id) { const h = artistPage(id, events, SITE, lang); if (h) return page(h); }
  // non trovato (o evento passato): 404 con collegamento all'app, così Google rimuove la pagina
  return page(`<!DOCTYPE html><html lang="${lang}"><meta charset="utf-8"><meta name="robots" content="noindex"><title>City Pulse</title><p>${lang === "en" ? "Page not found." : "Pagina non trovata."} <a href="${SITE}/#esplora">City Pulse</a></p></html>`, 404);
});
