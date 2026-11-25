// Pagine indicizzabili da Google per eventi, luoghi e artisti (HTML generato sul server).
// Funzioni pure: niente accesso a rete o database, così si possono testare da sole.
import { VENUES, ARTISTS } from "./places.ts";

export type Ev = {
  id: string; slug: string | null; title: string; title_en?: string | null; description?: string | null; description_en?: string | null;
  category: string; starts_at: string; ends_at: string; venue_name: string; zone?: string | null; address?: string | null;
  lat?: number | null; lng?: number | null; cover_url?: string | null; age?: string | null; accessible?: boolean | null;
  lineup?: { time?: string; label?: string; name: string; genre?: string; main?: boolean }[] | null;
  status?: string; ticketing_mode?: string; partner_url?: string | null; organizer_name?: string | null;
  tickets?: { name: string; price_cents: number; current_price_cents?: number; available: number }[];
};

const CAT: Record<string, [string, string]> = { musica: ["Musica", "Music"], teatro: ["Teatro", "Theatre"], food: ["Sagre & Food", "Food festivals"], feste: ["Feste", "Festivals"], movida: ["Movida", "Nightlife"], mostre: ["Mostre", "Exhibitions"], sport: ["Sport", "Sport"] };
export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const jsonld = (o: unknown) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, "\\u003c")}</script>`;
export const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const euro = (c: number) => "€" + (c / 100).toLocaleString("it-IT", { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 });
function when(iso: string, lang: string) {
  return new Date(iso).toLocaleString(lang === "en" ? "en-GB" : "it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export const venueFor = (name: string) => VENUES.find((v) => v.name === name);

function shell(o: { site: string; lang: string; title: string; desc: string; path: string; image: string; body: string; ld: unknown[]; type?: string }) {
  const url = o.site + o.path;
  const alt = o.lang === "en" ? url.replace(/\?lang=en$/, "") : url + "?lang=en";
  return `<!DOCTYPE html>
<html lang="${o.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title)}</title>
<meta name="description" content="${esc(o.desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="alternate" hreflang="${o.lang === "en" ? "it" : "en"}" href="${esc(alt)}">
<link rel="alternate" hreflang="${o.lang}" href="${esc(url)}">
<meta name="theme-color" content="#D00000">
<meta property="og:type" content="${o.type ?? "website"}">
<meta property="og:site_name" content="City Pulse">
<meta property="og:locale" content="${o.lang === "en" ? "en_GB" : "it_IT"}">
<meta property="og:title" content="${esc(o.title)}">
<meta property="og:description" content="${esc(o.desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(o.image)}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${o.site}/icons/icon-192.png">
<link rel="stylesheet" href="${o.site}/css/app.css">
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
${o.ld.map(jsonld).join("\n")}
<style>.seo{max-width:720px;margin:0 auto;padding:0 16px 48px}.seo header{display:flex;align-items:center;gap:10px;padding:14px 0;border-bottom:1px solid var(--line)}.seo header img{width:40px;height:40px;border-radius:10px}.seo .cover{width:100%;aspect-ratio:16/9;object-fit:cover;border-radius:18px;margin-top:16px}.seo dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:14px 0}.seo dt{color:var(--mut);font-weight:700}.seo dd{margin:0}.seo li{margin:6px 0}.seo footer{margin-top:40px;color:var(--mut);font-size:13px}</style>
</head>
<body><div class="seo"><header><a href="${o.site}/" class="row" style="gap:10px"><img src="${o.site}/img/logo-sm.jpg" alt="City Pulse"><b class="ant" style="font-size:20px">CITY PULSE</b></a><span class="sp"></span><a class="link" href="${esc(alt)}">${o.lang === "en" ? "Italiano" : "English"}</a></header>
<main>${o.body}</main>
<footer>${o.lang === "en" ? "Feel the pulse of your city." : "Vivi il battito della tua città."} · ${o.lang === "en" ? "A JH STUDIOS production" : "Una produzione JH STUDIOS"}</footer></div></body></html>`;
}

export function eventPage(e: Ev, site: string, lang = "it", src?: string | null) {
  const en = lang === "en";
  const id = e.slug ?? e.id;
  const title = (en && e.title_en) || e.title;
  const desc = ((en && e.description_en) || e.description || "").trim();
  const v = venueFor(e.venue_name);
  const cat = (CAT[e.category] ?? [e.category, e.category])[en ? 1 : 0];
  const image = e.cover_url || `${site}/img/og-default.jpg`;
  const free = e.ticketing_mode === "free" || (e.tickets ?? []).every((t) => (t.current_price_cents ?? t.price_cents) === 0);
  const appUrl = `${site}/${src && /^[a-z0-9_-]{1,30}$/.test(src) ? "?s=" + src : ""}#evento-${id}`;
  const buyUrl = e.ticketing_mode === "partner" && e.partner_url ? e.partner_url : appUrl;
  const metaDesc = `${when(e.starts_at, lang)} · ${e.venue_name}, Palermo. ${desc}`.slice(0, 155);
  const ld: unknown[] = [{
    "@context": "https://schema.org", "@type": "Event", name: title, description: desc || undefined,
    startDate: e.starts_at, endDate: e.ends_at,
    eventStatus: e.status === "cancelled" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    image: [image], url: `${site}/evento/${id}`, inLanguage: lang, isAccessibleForFree: free || undefined,
    location: {
      "@type": "Place", name: e.venue_name,
      address: { "@type": "PostalAddress", streetAddress: e.address || v?.address || undefined, addressLocality: "Palermo", addressRegion: "PA", addressCountry: "IT" },
      ...(e.lat && e.lng ? { geo: { "@type": "GeoCoordinates", latitude: e.lat, longitude: e.lng } } : {}),
    },
    organizer: { "@type": "Organization", name: e.organizer_name || "City Pulse", url: site },
    performer: (e.lineup ?? []).filter((l) => l.name).map((l) => ({ "@type": "PerformingGroup", name: l.name })),
    offers: (e.tickets ?? []).map((t) => ({
      "@type": "Offer", name: t.name, price: ((t.current_price_cents ?? t.price_cents) / 100).toFixed(2), priceCurrency: "EUR",
      availability: t.available > 0 ? "https://schema.org/InStock" : "https://schema.org/SoldOut", url: buyUrl, validFrom: undefined,
    })),
  }, {
    "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "City Pulse", item: site + "/" },
      ...(v ? [{ "@type": "ListItem", position: 2, name: v.name, item: `${site}/luogo/${v.id}` }] : []),
      { "@type": "ListItem", position: v ? 3 : 2, name: title, item: `${site}/evento/${id}` },
    ],
  }];
  const body = `${e.cover_url ? `<img class="cover" src="${esc(e.cover_url)}" alt="${esc(title)}">` : ""}
<p class="tag r" style="margin-top:16px;display:inline-flex">${esc(cat)}</p>
<h1 style="margin-top:8px">${esc(title)}</h1>
<dl><dt>${en ? "When" : "Quando"}</dt><dd><time datetime="${esc(e.starts_at)}">${esc(when(e.starts_at, lang))}</time></dd>
<dt>${en ? "Where" : "Dove"}</dt><dd>${v ? `<a class="link" href="${site}/luogo/${v.id}${en ? "?lang=en" : ""}">${esc(e.venue_name)}</a>` : esc(e.venue_name)}${e.address ? ", " + esc(e.address) : ""}, Palermo</dd>
${e.age ? `<dt>${en ? "Age" : "Età"}</dt><dd>${esc(e.age)}</dd>` : ""}
<dt>${en ? "Access" : "Accesso"}</dt><dd>${e.accessible ? (en ? "Full disabled access" : "Accesso totale per disabili") : (en ? "Ask the organiser" : "Chiedi all'organizzatore")}</dd></dl>
${desc ? `<p>${esc(desc)}</p>` : ""}
${(e.lineup ?? []).length ? `<h2>${en ? "Line-up" : "Programma"}</h2><ul>${e.lineup!.map((l) => `<li><b>${esc(l.time ?? "")}</b> · <a class="link" href="${site}/artista/${slugify(l.name)}${en ? "?lang=en" : ""}">${esc(l.name)}</a>${l.genre ? " — " + esc(l.genre) : ""}</li>`).join("")}</ul>` : ""}
${(e.tickets ?? []).length ? `<h2>${en ? "Tickets" : "Biglietti"}</h2><ul>${e.tickets!.map((t) => `<li>${esc(t.name)}: <b>${(t.current_price_cents ?? t.price_cents) ? euro(t.current_price_cents ?? t.price_cents) : (en ? "Free" : "Gratis")}</b>${t.available > 0 ? "" : (en ? " · sold out" : " · esaurito")}</li>`).join("")}</ul>` : ""}
<p style="margin-top:20px"><a class="btn" href="${esc(buyUrl)}">${free ? (en ? "Book on City Pulse" : "Prenota su City Pulse") : (en ? "Buy tickets" : "Acquista i biglietti")}</a> <a class="btn sec2" href="${esc(appUrl)}">${en ? "Open in the app" : "Apri nell'app"}</a></p>`;
  return shell({ site, lang, title: `${title} · ${e.venue_name}, Palermo | City Pulse`, desc: metaDesc, path: `/evento/${id}${en ? "?lang=en" : ""}`, image, body, ld, type: "website" });
}

export function venuePage(vid: string, events: Ev[], site: string, lang = "it") {
  const v = VENUES.find((x) => x.id === vid);
  if (!v) return null;
  const en = lang === "en";
  const desc = en ? v.description_en : v.description;
  const L = events.filter((e) => e.venue_name === v.name);
  const ld = [{
    "@context": "https://schema.org", "@type": "Place", name: v.name, description: desc, url: `${site}/luogo/${v.id}`,
    address: { "@type": "PostalAddress", streetAddress: v.address.replace(/, Palermo$/, ""), addressLocality: "Palermo", addressRegion: "PA", addressCountry: "IT" },
    event: L.map((e) => ({ "@type": "Event", name: (en && e.title_en) || e.title, startDate: e.starts_at, url: `${site}/evento/${e.slug ?? e.id}` })),
  }];
  const body = `<p class="tag y" style="margin-top:16px;display:inline-flex">${esc(v.zone)}</p><h1 style="margin-top:8px">${esc(v.name)}</h1><p>${esc(desc)}</p><p class="mut">${esc(v.address)}</p>
<p><a class="btn sec2 sm" href="https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(v.name + ", " + v.address)}">${en ? "Directions" : "Indicazioni"}</a></p>
<h2>${en ? "Upcoming events" : "Prossimi eventi"}</h2>${L.length ? `<ul>${L.map((e) => `<li><a class="link" href="${site}/evento/${e.slug ?? e.id}${en ? "?lang=en" : ""}">${esc((en && e.title_en) || e.title)}</a> · <time datetime="${esc(e.starts_at)}">${esc(when(e.starts_at, lang))}</time></li>`).join("")}</ul>` : `<p>${en ? "No events scheduled at the moment." : "Nessun evento in programma al momento."}</p>`}
<p><a class="btn" href="${site}/#luogo-${v.id}">${en ? "Open in the app" : "Apri nell'app"}</a></p>`;
  return shell({ site, lang, title: `${v.name}, Palermo · ${en ? "events and how to get there" : "eventi e come arrivare"} | City Pulse`, desc: (desc ?? "").slice(0, 155), path: `/luogo/${v.id}${en ? "?lang=en" : ""}`, image: `${site}/img/og-default.jpg`, body, ld });
}

export function artistPage(aslug: string, events: Ev[], site: string, lang = "it") {
  const en = lang === "en";
  const L = events.filter((e) => (e.lineup ?? []).some((l) => slugify(l.name) === aslug));
  const name = L.flatMap((e) => e.lineup ?? []).find((l) => slugify(l.name) === aslug)?.name
    ?? Object.keys(ARTISTS).find((n) => slugify(n) === aslug);
  if (!name) return null;
  const info = ARTISTS[name];
  const genre = info?.[0] ?? L.flatMap((e) => e.lineup ?? []).find((l) => l.name === name)?.genre ?? "";
  const bio = info ? (en ? info[2] : info[1]) : "";
  const ld = [{
    "@context": "https://schema.org", "@type": "PerformingGroup", name, genre: genre || undefined, description: bio || undefined, url: `${site}/artista/${aslug}`,
    event: L.map((e) => ({ "@type": "Event", name: (en && e.title_en) || e.title, startDate: e.starts_at, location: { "@type": "Place", name: e.venue_name, address: "Palermo" }, url: `${site}/evento/${e.slug ?? e.id}` })),
  }];
  const body = `<h1 style="margin-top:16px">${esc(name)}</h1>${genre ? `<p class="tag" style="display:inline-flex">${esc(genre)}</p>` : ""}${bio ? `<p>${esc(bio)}</p>` : ""}
<h2>${en ? "Dates in Palermo" : "Date a Palermo"}</h2>${L.length ? `<ul>${L.map((e) => `<li><a class="link" href="${site}/evento/${e.slug ?? e.id}${en ? "?lang=en" : ""}">${esc((en && e.title_en) || e.title)}</a> · ${esc(e.venue_name)} · <time datetime="${esc(e.starts_at)}">${esc(when(e.starts_at, lang))}</time></li>`).join("")}</ul>` : `<p>${en ? "No dates announced." : "Nessuna data annunciata."}</p>`}
<p><a class="btn" href="${site}/#artista-${aslug}">${en ? "Follow in the app" : "Segui nell'app"}</a></p>`;
  return shell({ site, lang, title: `${name} · ${en ? "concerts in Palermo" : "concerti a Palermo"} | City Pulse`, desc: (bio || `${name} ${en ? "live in Palermo" : "dal vivo a Palermo"}`).slice(0, 155), path: `/artista/${aslug}${en ? "?lang=en" : ""}`, image: `${site}/img/og-default.jpg`, body, ld });
}

export function sitemap(events: Ev[], site: string) {
  const now = new Date().toISOString().slice(0, 10);
  const urls: [string, string][] = [[`${site}/`, "daily"]];
  for (const e of events) urls.push([`${site}/evento/${e.slug ?? e.id}`, "daily"]);
  for (const v of VENUES) urls.push([`${site}/luogo/${v.id}`, "weekly"]);
  const artists = new Set(events.flatMap((e) => (e.lineup ?? []).map((l) => slugify(l.name))).filter(Boolean));
  for (const a of artists) urls.push([`${site}/artista/${a}`, "weekly"]);
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.map(([u, f]) => `<url><loc>${esc(u)}</loc><lastmod>${now}</lastmod><changefreq>${f}</changefreq><xhtml:link rel="alternate" hreflang="it" href="${esc(u)}"/><xhtml:link rel="alternate" hreflang="en" href="${esc(u + "?lang=en")}"/></url>`).join("\n")}
</urlset>`;
}
