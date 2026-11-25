// Notifiche push.
// 1) Cron (ogni 10 minuti, chiamata con la service role): promemoria 2 ore prima
//    a chi ha un biglietto, più gli avvisi in coda (nuove date degli artisti seguiti). POST {}  con header Authorization: Bearer <SERVICE_ROLE_KEY>
// 2) Organizzatore: avviso a tutti i partecipanti (cambio orario, gate, maltempo).
//    POST { event_id, title, body }  con il token dell'utente organizzatore
import webpush from "npm:web-push@3.6.7";
import { cors, json, fail } from "../_shared/cors.ts";
import { admin, getUser, canManageOrg, SITE_URL } from "../_shared/clients.ts";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:info@citypulse.it",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

async function pushToUsers(userIds: string[], payload: (lang: string) => object) {
  if (!userIds.length) return 0;
  const { data: subs } = await admin.from("push_subscriptions").select("*").in("user_id", userIds);
  let sent = 0;
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        JSON.stringify(payload(s.lang)), { TTL: 3600 });
      sent++;
    } catch (e: any) {
      // abbonamento scaduto o revocato: lo elimino
      if (e?.statusCode === 404 || e?.statusCode === 410) await admin.from("push_subscriptions").delete().eq("id", s.id);
    }
  }
  return sent;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const auth = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  const body = await req.json().catch(() => ({}));

  // ----- Avviso dell'organizzatore -----
  if (body.event_id) {
    const user = await getUser(req);
    if (!user) return fail("Accedi per continuare", 401);
    const { data: ev } = await admin.from("events").select("id, slug, title, organizer_id").eq("id", body.event_id).single();
    if (!ev || !(await canManageOrg(user.id, ev.organizer_id))) return fail("Non autorizzato", 403);
    const { data: t } = await admin.from("tickets").select("user_id").eq("event_id", ev.id).neq("status", "void");
    const ids = [...new Set((t ?? []).map((x: { user_id: string }) => x.user_id))] as string[];
    const sent = await pushToUsers(ids, () => ({
      title: String(body.title ?? ev.title).slice(0, 60),
      body: String(body.body ?? "").slice(0, 160),
      url: `${SITE_URL}/#evento-${ev.slug ?? ev.id}`,
    }));
    return json({ sent });
  }

  // ----- Promemoria automatico (solo con service role) -----
  if (auth !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return fail("Non autorizzato", 401);
  const from = new Date(Date.now() + 110 * 60000).toISOString();
  const to = new Date(Date.now() + 130 * 60000).toISOString();
  const { data: evs } = await admin.from("events").select("id, slug, title, title_en, venue_name, starts_at")
    .eq("status", "published").gte("starts_at", from).lte("starts_at", to);
  let sent = 0;
  for (const ev of evs ?? []) {
    const { data: tickets } = await admin.from("tickets").select("id, user_id").eq("event_id", ev.id).eq("status", "valid");
    const fresh: string[] = [];
    for (const t of tickets ?? []) {
      const { error } = await admin.from("notification_log").insert({ ticket_id: t.id, kind: "reminder_2h" });
      if (!error) fresh.push(t.user_id); // già inviato → violazione unique → salto
    }
    const time = new Date(ev.starts_at).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" });
    sent += await pushToUsers([...new Set(fresh)], (lang) => lang === "en"
      ? { title: `${ev.title_en ?? ev.title} starts at ${time}`, body: `${ev.venue_name} · your QR ticket is ready in the app`, url: `${SITE_URL}/#biglietti` }
      : { title: `${ev.title} alle ${time}`, body: `${ev.venue_name} · il tuo biglietto QR è pronto nell'app`, url: `${SITE_URL}/#biglietti` });
  }
  // Avvisi in coda (es. "nuova data" degli artisti seguiti)
  const { data: queued } = await admin.rpc("take_notifications", { p_limit: 300 });
  for (const n of (queued ?? []) as any[]) {
    sent += await pushToUsers([n.user_id], (lang) => ({
      title: lang === "en" && n.title_en ? n.title_en : n.title,
      body: (lang === "en" && n.body_en ? n.body_en : n.body) ?? "",
      url: `${SITE_URL}${n.url ?? "/#esplora"}`,
    }));
  }
  return json({ events: evs?.length ?? 0, queued: queued?.length ?? 0, sent });
});
