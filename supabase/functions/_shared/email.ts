// Email di conferma con il QR di ogni biglietto (allegati PNG) tramite Resend.
// Variabili: RESEND_API_KEY, EMAIL_FROM (es. "City Pulse <biglietti@citypulse.it>")
import QRCode from "npm:qrcode@1.5.4";
import { admin, SITE_URL } from "./clients.ts";

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const euro = (c: number) => "€" + (c / 100).toFixed(2).replace(".", ",");

async function send(to: string, subject: string, html: string, attachments: { filename: string; content: string; content_id?: string }[] = []) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("RESEND_API_KEY mancante");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: Deno.env.get("EMAIL_FROM") ?? "City Pulse <biglietti@citypulse.it>", to: [to], subject, html, attachments }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.message ?? `Resend ${r.status}`);
  return j.id as string;
}

const frame = (title: string, inner: string) => `<!doctype html><html><body style="margin:0;background:#f2f0ef;font-family:Arial,Helvetica,sans-serif;color:#171717">
<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:16px;overflow:hidden">
<tr><td style="background:#D00000;padding:20px 24px;color:#fff"><img src="${SITE_URL}/img/logo-sm.jpg" width="44" height="44" alt="City Pulse" style="border-radius:10px;vertical-align:middle"> <b style="font-size:20px;vertical-align:middle;margin-left:8px">CITY PULSE</b></td></tr>
<tr><td style="padding:24px"><h1 style="font-size:22px;margin:0 0 12px">${title}</h1>${inner}</td></tr>
<tr><td style="padding:16px 24px;background:#171717;color:#fff;font-size:12px">Vivi il battito della tua città. · Una produzione JH STUDIOS</td></tr>
</table></td></tr></table></body></html>`;

// Biglietti emessi per un ordine (idempotente grazie a email_log)
export async function sendTicketsEmail(orderId: string) {
  const { data: o } = await admin.from("orders").select("*, events(title, title_en, slug, id, starts_at, venue_name, address)").eq("id", orderId).single();
  if (!o?.buyer_email) return;
  const { data: done } = await admin.from("email_log").select("id").eq("order_id", orderId).eq("kind", "tickets").maybeSingle();
  if (done) return;
  const { data: tickets } = await admin.from("tickets").select("code, qr_token, holder_name, ticket_types(name)").eq("order_id", orderId);
  const { data: prof } = await admin.from("profiles").select("lang").eq("id", o.user_id).single();
  const en = prof?.lang === "en";
  const ev = o.events;
  const when = new Date(ev.starts_at).toLocaleString(en ? "en-GB" : "it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const attachments: { filename: string; content: string; content_id?: string }[] = [];
  let rows = "";
  for (const [i, t] of (tickets ?? []).entries()) {
    const png = await QRCode.toDataURL(t.qr_token, { errorCorrectionLevel: "M", margin: 2, width: 360 });
    const cid = `qr${i}`;
    attachments.push({ filename: `biglietto-${t.code}.png`, content: png.split(",")[1], content_id: cid });
    rows += `<tr><td style="padding:12px 0;border-top:1px solid #eee"><img src="cid:${cid}" width="140" height="140" alt="QR ${esc(t.code)}"></td><td style="padding:12px;border-top:1px solid #eee"><b>${esc((t as any).ticket_types?.name)}</b><br>#${esc(t.code)}<br><span style="color:#666">${esc(t.holder_name ?? o.buyer_name)}</span></td></tr>`;
  }
  const title = en ? "Your tickets are ready" : "I tuoi biglietti sono pronti";
  const html = frame(title, `<p style="margin:0 0 4px"><b>${esc(en && ev.title_en ? ev.title_en : ev.title)}</b></p>
<p style="margin:0 0 16px;color:#444">${esc(when)} · ${esc(ev.venue_name)}${ev.address ? ", " + esc(ev.address) : ""}, Palermo</p>
<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>
<p style="margin:16px 0">${en ? "Show the QR at the entrance (also from the app, even offline). Each QR is valid for one entry." : "Mostra il QR all'ingresso (anche dall'app, pure senza rete). Ogni QR vale per un ingresso."}</p>
<p><a href="${SITE_URL}/#biglietti" style="display:inline-block;background:#D00000;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold">${en ? "Open my tickets" : "Apri i miei biglietti"}</a></p>
<p style="color:#666;font-size:12px">${en ? "Order" : "Ordine"} ${esc(o.id.slice(0, 8).toUpperCase())} · ${en ? "Total" : "Totale"} ${euro(o.total_cents)}</p>`);
  try {
    const id = await send(o.buyer_email, `${title} · ${ev.title}`, html, attachments);
    await admin.from("email_log").insert({ order_id: orderId, kind: "tickets", recipient: o.buyer_email, provider_id: id });
  } catch (e) {
    await admin.from("email_log").insert({ order_id: orderId, kind: "tickets", recipient: o.buyer_email, status: "failed", error: (e as Error).message });
  }
}

// Regalo: email a chi riceve il biglietto, con il link per accettarlo
export async function sendGiftEmail(giftId: string) {
  const { data: g } = await admin.from("ticket_gifts").select("id, to_email, token, message, status, from_user, tickets(events(title, starts_at, venue_name))").eq("id", giftId).single();
  if (!g || g.status !== "pending") return;
  const { data: from } = await admin.from("profiles").select("full_name").eq("id", g.from_user).single();
  const ev = (g as any).tickets?.events;
  const when = new Date(ev.starts_at).toLocaleString("it-IT", { timeZone: "Europe/Rome", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  const who = esc(from?.full_name ?? "Un amico");
  const html = frame(`${who} ti ha regalato un biglietto`, `<p style="margin:0 0 4px"><b>${esc(ev.title)}</b></p><p style="margin:0 0 12px;color:#444">${esc(when)} · ${esc(ev.venue_name)}, Palermo</p>
${g.message ? `<p style="background:#fff7e0;border-radius:12px;padding:12px;margin:0 0 16px">“${esc(g.message)}”</p>` : ""}
<p>Accetta il regalo con l'account City Pulse collegato a <b>${esc(g.to_email)}</b>: il biglietto con il QR comparirà nell'app.</p>
<p><a href="${SITE_URL}/#regalo-${g.token}" style="display:inline-block;background:#D00000;color:#fff;padding:12px 18px;border-radius:12px;text-decoration:none;font-weight:bold">Accetta il regalo</a></p>
<p style="color:#666;font-size:12px">Non conosci chi te lo manda? Ignora questa email: il biglietto resta a lui.</p>`);
  try {
    const id = await send(g.to_email, `${from?.full_name ?? "Un amico"} ti ha regalato un biglietto · ${ev.title}`, html);
    await admin.from("email_log").insert({ kind: "gift", recipient: g.to_email, provider_id: id });
  } catch (e) {
    await admin.from("email_log").insert({ kind: "gift", recipient: g.to_email, status: "failed", error: (e as Error).message });
  }
}

// Avviso via email per annullamento / rinvio / rimborso
export async function sendNoticeEmail(orderId: string, kind: "event_cancelled" | "event_postponed" | "refund" | "resale_refund", title: string, body: string) {
  const { data: o } = await admin.from("orders").select("buyer_email, events(slug, id)").eq("id", orderId).single();
  if (!o?.buyer_email) return;
  try {
    const id = await send(o.buyer_email, title, frame(esc(title), `<p>${esc(body)}</p><p><a href="${SITE_URL}/#evento-${(o as any).events?.slug ?? (o as any).events?.id}" style="color:#C40000">City Pulse</a></p>`));
    await admin.from("email_log").insert({ order_id: orderId, kind, recipient: o.buyer_email, provider_id: id });
  } catch (e) {
    await admin.from("email_log").insert({ order_id: orderId, kind, recipient: o.buyer_email, status: "failed", error: (e as Error).message });
  }
}
