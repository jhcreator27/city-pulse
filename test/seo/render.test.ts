// node --experimental-strip-types test/seo/render.test.ts
import { eventPage, venuePage, artistPage, sitemap } from "../../supabase/functions/_shared/seo-render.ts";
import { writeFileSync } from "node:fs";
const site = "https://citypulse.it";
const ev: any = {
  id: "e1", slug: "indie-night-castello", title: "Indie Night al Castello", title_en: "Indie Night at the Castle",
  description: "Una notte di musica indipendente <sotto> le stelle.", category: "musica",
  starts_at: "2026-11-28T20:00:00Z", ends_at: "2026-11-29T00:00:00Z", venue_name: "Castello a Mare", zone: "La Cala",
  address: "Via Filippo Patti", age: "18+ anni", accessible: false, status: "published", ticketing_mode: "city_pulse",
  organizer_name: "JH STUDIOS Live",
  lineup: [{ time: "21:00", name: "Giulia & The Echoes", genre: "Dream pop" }, { time: "23:15", name: "Cosmo Elettrico", genre: "Synth-pop", main: true }],
  tickets: [{ name: "Ingresso Standard", price_cents: 1800, current_price_cents: 1500, available: 14 }, { name: "VIP", price_cents: 3200, available: 0 }],
};
const fail = (m: string) => { console.error("FALLITO:", m); process.exit(1); };
const ld = (h: string) => [...h.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map((m) => JSON.parse(m[1].replace(/\\u003c/g, "<")));
for (const lang of ["it", "en"]) {
  const h = eventPage(ev, site, lang);
  const [e, bc] = ld(h);
  if (e["@type"] !== "Event" || !e.startDate || !e.location?.address?.addressLocality) fail("JSON-LD Event incompleto");
  if (e.offers.length !== 2 || e.offers[0].price !== "15.00" || !e.offers[1].availability.endsWith("SoldOut")) fail("offerte");
  if (e.performer.length !== 2) fail("performer");
  if (bc["@type"] !== "BreadcrumbList" || bc.itemListElement.length !== 3) fail("breadcrumb");
  if (!h.includes('rel="canonical"') || !h.includes('hreflang') || !h.includes('og:image')) fail("meta");
  if (h.includes("<sotto>")) fail("testo non protetto");
  if (lang === "en" && !h.includes("Indie Night at the Castle")) fail("titolo inglese");
  writeFileSync(`/tmp/seo-evento-${lang}.html`, h);
}
const v = venuePage("castello-a-mare", [ev], site)!; if (!ld(v)[0].event.length) fail("luogo senza eventi");
writeFileSync("/tmp/seo-luogo.html", v);
const a = artistPage("cosmo-elettrico", [ev], site)!; if (ld(a)[0]["@type"] !== "PerformingGroup" || !ld(a)[0].event.length) fail("artista");
writeFileSync("/tmp/seo-artista.html", a);
if (venuePage("non-esiste", [ev], site) !== null || artistPage("nessuno", [ev], site) !== null) fail("404 attesi");
const sm = sitemap([ev], site); writeFileSync("/tmp/sitemap.xml", sm);
if (!sm.includes("/evento/indie-night-castello") || !sm.includes("/artista/giulia-and-the-echoes") || !sm.includes("/luogo/teatro-massimo")) fail("sitemap");
console.log("SEO: tutti i controlli superati");
