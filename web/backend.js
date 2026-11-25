// =====================================================================
// CITY PULSE · collegamento al server (Supabase + Stripe)
// Si attiva solo se config.js contiene supabaseUrl e supabaseAnonKey.
// Senza configurazione l'app resta in modalità demo (dati locali).
// =====================================================================
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';

const CFG = window.CP_CONFIG;
const TZ = 'Europe/Rome';
const CAT_ICON = { musica: 'music_note', teatro: 'theater_comedy', food: 'restaurant', feste: 'celebration', movida: 'nightlife', mostre: 'palette', sport: 'directions_run' };
const COLORS = ['#E00000', '#171717', '#7a5a00', '#a80000', '#5a3d00', '#333'];

let A;          // CP_APP: stato e funzioni dell'interfaccia
let sb;         // client Supabase
const CPB = window.CPB = {
  enabled: true, user: null, profile: null, orgs: [], stats: {}, raw: {}, views: {},
  staffEv: null, staffList: [], lastPass: null, feedSub: null,
};
const en = () => A.LANG === 'en';
const T = (it, eng) => (en() ? eng : it);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- date e fuso orario di Roma ----------
function romeParts(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}
function romeToISO(dateISO, time) {
  const [y, m, d] = dateISO.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, h, mi);
  const p = romeParts(new Date(guess).toISOString());
  const asUTC = Date.UTC(...p.date.split('-').map((v, i) => i === 1 ? v - 1 : +v), ...p.time.split(':').map(Number));
  return new Date(guess - (asUTC - guess)).toISOString();
}

// ---------- mapping DB → formato dell'interfaccia ----------
function mapEvent(r, tts) {
  const s = romeParts(r.starts_at), e = romeParts(r.ends_at);
  const tiers = (tts || []).filter(t => !t.hidden).sort((a, b) => a.sort - b.sort)
    .map(t => [t.name, t.price_cents / 100, t.quantity, t.description || '', t.id, t.is_addon]);
  const steps = {}; for (const t of (tts || [])) if ((t.price_steps || []).length) steps[t.name] = t.price_steps.map(x => [x.up_to, x.price_cents / 100]);
  return {
    id: r.slug || r.id, uuid: r.id, organizer_id: r.organizer_id,
    t: en() && r.title_en ? r.title_en : r.title, title_it: r.title, title_en: r.title_en,
    d: (en() && r.description_en ? r.description_en : r.description) || '', d_it: r.description, d_en: r.description_en,
    cat: r.category, img: '', photo: r.cover_url || '', ico: CAT_ICON[r.category] || 'event',
    dateISO: s.date, time: s.time, end: e.time,
    zone: r.zone || '', venue: r.venue_name, addr: r.address || '', x: +r.map_x || 52, y: +r.map_y || 56,
    price: (r.min_price_cents ?? 0) / 100, ppl: r.going_count ?? 0, cap: r.capacity, age: r.age, acc: r.accessible ? 1 : 0,
    lu: (r.lineup || []).map(l => [l.time, l.label || 'Live', l.name, l.genre || '', l.main ? 1 : 0]),
    tiers, steps, partner: r.ticketing_mode === 'partner' ? r.partner_url : null, featured: !!r.featured,
    stx: r.status === 'cancelled' ? { st: 'cancelled', reason: r.cancel_reason || '' } : r.postponed_from ? { st: 'postponed', reason: r.cancel_reason || '', from: (() => { const p = romeParts(r.postponed_from); return `${new Date(p.date + 'T00:00').toLocaleDateString(en() ? 'en-GB' : 'it-IT', { weekday: 'short', day: 'numeric', month: 'short' })} · ${p.time}`; })(), until: r.refund_deadline } : null,
    reqPhone: !!r.require_phone, outdoor: r.outdoor ? 1 : 0, lat: r.lat ?? null, lng: r.lng ?? null,
    seatsLeft: r.status === 'published' && r.ticketing_mode !== 'partner' && r.seats_left != null ? r.seats_left : null, resaleCount: r.resale_count || 0,
    draft: r.status === 'draft' ? 1 : 0, org: CPB.orgs.some(o => o.id === r.organizer_id) ? 1 : 0, friends: [],
  };
}

// ---------- caricamento dati ----------
async function loadEvents() {
  const since = new Date(Date.now() - 60 * 864e5).toISOString();
  const [{ data: pub, error }, { data: tts }] = await Promise.all([
    sb.from('public_events').select('*').gte('ends_at', since).order('starts_at'),
    sb.from('ticket_types').select('*'),
  ]);
  if (error) throw error;
  let rows = pub || [];
  // bozze e eventi del proprio team (non presenti nella vista pubblica)
  if (CPB.orgs.length) {
    const { data: mine } = await sb.from('events').select('*').in('organizer_id', CPB.orgs.map(o => o.id));
    for (const m of mine || []) if (!rows.find(r => r.id === m.id)) rows.push({ ...m, min_price_cents: 0, going_count: 0, featured: false });
  }
  CPB.raw.events = rows; CPB.raw.tts = tts || [];
  try { localStorage.setItem('cp2_cache_events', JSON.stringify({ rows, tts })); } catch { }
  applyEvents();
}
function applyEvents() {
  const { rows, tts } = { rows: CPB.raw.events || [], tts: CPB.raw.tts || [] };
  const list = rows.map(r => mapEvent(r, tts.filter(t => t.event_id === r.id)));
  A.EV.splice(0, A.EV.length, ...list);
  for (const k of Object.keys(A.PROMO)) delete A.PROMO[k];
  for (const e of A.EV) {
    A.prep(e);
    if (e.featured) A.PROMO[e.id] = { until: new Date(Date.now() + 864e5).toISOString() };
  }
  A.relabel();
}
async function loadMine() {
  const S = A.S;
  if (!CPB.user) { S.tickets = []; S.fav = new Set(); S.going = new Set(); return; }
  const byUuid = id => A.EV.find(e => e.uuid === id);
  const [{ data: tk }, { data: fav }, { data: go }, { data: rf }] = await Promise.all([
    sb.from('my_tickets').select('*').order('created_at', { ascending: false }),
    sb.from('favorites').select('event_id'),
    sb.from('going').select('event_id').eq('user_id', CPB.user.id),
    sb.from('refunds').select('order_id, status'),
  ]);
  const RF = Object.fromEntries((rf || []).map(r => [r.order_id, r.status === 'done' ? 'done' : r.status === 'failed' ? 'pending' : 'pending']));
  S.tickets = (tk || []).filter(t => (t.status !== 'void' || RF[t.order_id]) && byUuid(t.event_id)).map(t => ({
    id: t.id, order: t.order_id, refund: RF[t.order_id] || null, code: t.code, qr: t.qr_token, ev: byUuid(t.event_id).id, holder: t.holder_name || CPB.displayName(),
    items: [[t.ticket_type, 1, t.price_cents / 100]], total: t.price_cents / 100, used: t.status === 'used',
    when: new Date(t.created_at).toLocaleString('it-IT', { timeZone: TZ }), pay: t.price_cents ? 'Stripe' : T('Prenotazione gratuita', 'Free booking'),
    origin: t.origin, gift: t.gift ? { id: t.gift.id, to: t.gift.to, status: 'pending' } : null,
    resale: t.resale && t.resale.status !== 'sold' ? { id: t.resale.id, price: t.resale.price_cents / 100, status: t.resale.status } : null,
    dinner: t.dinner ? { n: t.dinner.restaurant, title: t.dinner.title, addr: t.dinner.address, slot: t.dinner.slot, people: t.dinner.people, code: t.dinner.code } : null,
  }));
  const { data: wl } = await sb.rpc('my_waitlist');
  pub.wait = Object.fromEntries((wl || []).map(w => [w.event_id, { qty: w.qty, pos: w.queue_pos, status: w.status, until: w.offered_until }]));
  S.fav = new Set((fav || []).map(f => byUuid(f.event_id)?.id).filter(Boolean));
  const [{ data: af }, { data: nq }] = await Promise.all([
    sb.from('artist_follows').select('artist_slug'),
    sb.from('notification_queue').select('*').eq('kind', 'new_date').order('created_at', { ascending: false }).limit(30),
  ]);
  S.follow = new Set((af || []).map(x => x.artist_slug));
  S.alerts = (nq || []).map(n => ({ a: '', n: (A.LANG === 'en' && n.title_en ? n.title_en : n.title).replace(/^(Nuova data|New date): /, ''), ev: (n.url || '').split('#evento-')[1] || '', t: A.LANG === 'en' && n.body_en ? n.body_en : n.body, at: Date.parse(n.created_at) }));
  S.going = new Set((go || []).map(f => byUuid(f.event_id)?.id).filter(Boolean));
  try { localStorage.setItem('cp2_cache_tickets', JSON.stringify(S.tickets)); } catch { }
}
async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  CPB.user = session?.user || null;
  CPB.profile = null; CPB.orgs = [];
  if (!CPB.user) return;
  await sb.rpc('accept_invites').then(() => { }, () => { });
  const [{ data: p }, { data: m }] = await Promise.all([
    sb.from('profiles').select('*').eq('id', CPB.user.id).single(),
    sb.from('organizer_members').select('role, gate, organizers(id, name, verified, stripe_ready, billing, status)').eq('user_id', CPB.user.id),
  ]);
  CPB.profile = p;
  CPB.orgs = (m || []).filter(x => x.organizers).map(x => ({ ...x.organizers, member_role: x.role, gate: x.gate }));
  CPB.gate = CPB.orgs[0]?.gate || 'Gate A';
  if (p?.lang && p.lang !== A.LANG) { /* rispetta la lingua scelta nel dispositivo */ }
}
async function refreshAll() {
  await loadProfile();
  try { await loadEvents(); }
  catch (err) {
    // offline: uso la copia salvata
    const c = JSON.parse(localStorage.getItem('cp2_cache_events') || 'null');
    if (c) { CPB.raw.events = c.rows; CPB.raw.tts = c.tts; applyEvents(); }
    A.toast(T('Sei offline: mostro i dati salvati', 'You are offline: showing saved data'), 'cloud_off');
  }
  try { await loadMine(); }
  catch { A.S.tickets = JSON.parse(localStorage.getItem('cp2_cache_tickets') || '[]'); }
  A.save = () => { };   // in modalità server niente salvataggi demo nel browser
  A.render(true);
}

// ---------- account ----------
CPB.displayName = () => CPB.profile?.full_name || CPB.user?.email?.split('@')[0] || T('Ospite', 'Guest');
CPB.headerUser = () => CPB.user
  ? `<a class="av" href="#profilo" aria-label="Profilo"><span class="fav-i" style="background:#E00000;width:40px;height:40px;margin:0;font-size:14px">${esc(CPB.displayName().split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase())}</span></a>`
  : `<button class="btn sm" data-act="login">${T('Accedi', 'Log in')}</button>`;
function loginSheet(next) {
  try { sessionStorage.setItem('cp_after_login', next || location.hash.slice(1)); } catch { }
  A.sheet(`<div class="grab"></div><h2>${T('Accedi a City Pulse', 'Log in to City Pulse')}</h2>
  <p class="mut sm" style="margin:4px 0 14px">${T('Serve per comprare biglietti, salvare eventi e scrivere recensioni.', 'Needed to buy tickets, save events and write reviews.')}</p>
  <div class="lst"><button class="pay" data-act="oauth" data-p="google"><span class="ic" style="background:#fff;border:1px solid var(--line);font-weight:800">G</span><span class="sp"><b>${T('Continua con Google', 'Continue with Google')}</b></span></button>
  <button class="pay" data-act="oauth" data-p="apple"><span class="ic" style="background:#171717;color:#fff"><span class="ms" aria-hidden="true">phone_iphone</span></span><span class="sp"><b>${T('Continua con Apple', 'Continue with Apple')}</b></span></button></div>
  <form id="cp-login" style="margin-top:16px"><label class="lb" for="lg-mail">${T('Oppure con la tua email', 'Or with your email')}</label><div class="input"><span class="ms" aria-hidden="true">mail</span><input id="lg-mail" type="email" autocomplete="email" required placeholder="nome@email.it"></div>
  <button class="btn w" style="margin-top:12px" type="submit">${T('Inviami il link di accesso', 'Send me a login link')}</button></form>
  <p class="xs mut" style="margin-top:12px">${T('Continuando accetti i Termini e l’Informativa privacy di City Pulse.', 'By continuing you accept the City Pulse Terms and Privacy policy.')}</p>`);
}
CPB.requireLogin = next => { if (CPB.user) return true; loginSheet(next); return false; };

// ---------- vendite / statistiche organizzatori ----------
CPB.orgEvents = () => A.EV.filter(e => e.org);
CPB.salesOf = e => {
  const st = CPB.stats[e.uuid];
  if (!st) { loadStats(e.uuid); return { tiers: (e.tiers || []).map(t => [t[0], t[1], 0, 'x']), sold: 0, gross: 0, days: new Array(14).fill(0), cap: e.cap || 1, inn: 0 }; }
  return {
    tiers: st.tiers.map(t => [t.name, t.price_cents / 100, t.sold, 'x']),
    sold: st.sold, gross: st.gross_cents / 100, cap: st.capacity, inn: st.checked_in,
    days: (st.daily || []).map(d => d.n),
  };
};
const pending = new Set();
let statsTimer;
async function loadStats(uuid, force) {
  if (!uuid || (pending.has(uuid) && !force)) return;
  pending.add(uuid);
  const { data } = await sb.rpc('org_event_stats', { p_event: uuid });
  if (data) { CPB.stats[uuid] = data; clearTimeout(statsTimer); statsTimer = setTimeout(() => A.rr(), 120); }
}
function watchOrgRealtime() {
  if (CPB.feedSub || !CPB.orgs.length) return;
  CPB.feedSub = sb.channel('org-live')
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'status=eq.paid' }, p => {
      const e = A.EV.find(x => x.uuid === p.new.event_id); if (!e) return;
      const it = (p.new.items || [])[0] || {};
      A.S.feed.unshift({ q: (p.new.items || []).reduce((a, i) => a + i.qty, 0), tier: it.name || '', ev: e.t, amt: p.new.subtotal_cents / 100, at: A.now() });
      loadStats(e.uuid, true); pending.delete(e.uuid);
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'checkins' }, p => {
      const e = A.EV.find(x => x.uuid === p.new.event_id); if (e) { pending.delete(e.uuid); loadStats(e.uuid, true); }
    })
    .subscribe();
}

// ---------- salvataggio evento (area organizzatori) ----------
async function dataURLtoBlob(u) { return (await fetch(u)).blob(); }
async function saveEvent(asDraft) {
  A.keepDraft();
  const D = A.S.draft; const org = CPB.orgs[0];
  if (!org) { orgSignup(); return; }
  if (!asDraft && (!D.t.trim() || !D.dateISO || !D.time || !(+D.cap > 0) || !D.tiers.some(t => String(t[0]).trim()))) {
    A.toast(T('Completa titolo, data, orario, biglietti e capienza', 'Fill in title, date, time, tickets and capacity'), 'error'); return;
  }
  A.toast(T('Salvataggio in corso…', 'Saving…'), 'cloud_upload');
  try {
    const old = D.id ? A.E(D.id) : null;
    let cover = D.photo || '';
    if (cover.startsWith('data:')) {
      const path = `${org.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('covers').upload(path, await dataURLtoBlob(cover), { contentType: 'image/jpeg' });
      if (error) throw error;
      cover = sb.storage.from('covers').getPublicUrl(path).data.publicUrl;
    }
    const startISO = romeToISO(D.dateISO, D.time);
    let endISO = romeToISO(D.dateISO, D.end || D.time);
    if (endISO <= startISO) endISO = new Date(new Date(endISO).getTime() + 864e5).toISOString();
    const lineup = D.lu.filter(l => String(l[2]).trim()).map((l, i, a) => ({ time: l[0] || D.time, label: i === 0 ? 'Opening' : (i === a.length - 1 && a.length > 2 ? 'Closing' : 'Live'), name: String(l[2]).trim(), genre: String(l[3] || '').trim() }));
    const row = {
      organizer_id: old?.organizer_id || org.id, title: D.t.trim() || T('Evento senza titolo', 'Untitled event'), description: D.d.trim(), category: D.cat,
      starts_at: startISO, ends_at: endISO, venue_name: D.vk === 'altro' ? D.venue.trim() : D.venue, zone: D.zone, address: D.addr,
      map_x: D.x, map_y: D.y, cover_url: cover || null, capacity: +D.cap, age: D.age, accessible: !!D.acc, lineup,
      status: asDraft ? 'draft' : 'published',
      ticketing_mode: D.mode || 'city_pulse', partner_url: D.mode === 'partner' ? (D.purl || null) : null,
    };
    let id = old?.uuid;
    if (id) { const { error } = await sb.from('events').update(row).eq('id', id); if (error) throw error; }
    else {
      row.slug = (D.t || 'evento').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '-' + Math.random().toString(36).slice(2, 6);
      const { data, error } = await sb.from('events').insert(row).select('id').single(); if (error) throw error; id = data.id;
    }
    // tipi di biglietto: aggiorna per nome, aggiungi i nuovi, togli i non venduti rimossi
    const existing = CPB.raw.tts.filter(t => t.event_id === id && !t.hidden);
    const wanted = D.tiers.filter(t => String(t[0]).trim()).map((t, i) => ({ name: String(t[0]).trim(), price_cents: Math.round((+t[1] || 0) * 100), quantity: Math.max(0, +t[2] || 0), sort: i }));
    for (const w of wanted) {
      const ex = existing.find(x => x.name === w.name);
      const { error } = ex ? await sb.from('ticket_types').update({ price_cents: w.price_cents, quantity: Math.max(w.quantity, ex.sold + ex.reserved), sort: w.sort }).eq('id', ex.id)
        : await sb.from('ticket_types').insert({ ...w, event_id: id });
      if (error) throw error;
    }
    for (const ex of existing) if (!wanted.find(w => w.name === ex.name) && ex.sold + ex.reserved === 0) await sb.from('ticket_types').delete().eq('id', ex.id);
    A.S.draft = null;
    await loadEvents();
    const ev = A.EV.find(e => e.uuid === id);
    A.toast(asDraft ? T('Bozza salvata', 'Draft saved') : T('Pubblicato! Ora lo vedono tutti', 'Published! Everyone can see it now'), 'publish');
    location.hash = 'org-ev-' + (ev?.id || id);
  } catch (err) { A.toast((err.message || String(err)).slice(0, 120), 'error'); }
}
function orgSignup() {
  A.sheet(`<div class="grab"></div><h2>${T('Diventa organizzatore', 'Become an organiser')}</h2><p class="mut sm">${T('Crea il profilo con cui pubblicherai i tuoi eventi su City Pulse.', 'Create the profile you will publish your events with.')}</p>
  <form id="cp-orgsignup"><label class="lb" for="og-name">${T('Nome organizzatore o locale', 'Organiser or venue name')}</label><div class="input"><input id="og-name" required maxlength="60" placeholder="JH STUDIOS Live"></div>
  <label class="chk"><input type="checkbox" required id="og-ok">${T('Dichiaro di avere titolo per organizzare e vendere gli eventi che pubblicherò', 'I confirm I am entitled to organise and sell the events I publish')}</label>
  <button class="btn w" style="margin-top:14px" type="submit">${T('Crea profilo', 'Create profile')}</button></form>`);
}

// ---------- scanner a fotocamera ----------
let scanStream = null, scanLoop = null, scanBusy = false, detector = null, jsQR = null;
async function startScanner() {
  const video = document.getElementById('cam'); if (!video) return;
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
  } catch { A.toast(T('Consenti l’uso della fotocamera per scansionare', 'Allow camera access to scan'), 'no_photography'); return; }
  video.srcObject = scanStream; await video.play();
  if ('BarcodeDetector' in window) { try { detector = new window.BarcodeDetector({ formats: ['qr_code'] }); } catch { detector = null; } }
  if (!detector && !jsQR) {
    await new Promise((ok, ko) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js'; s.onload = ok; s.onerror = ko; document.head.append(s); });
    jsQR = window.jsQR;
  }
  const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
  document.getElementById('cam-wrap')?.classList.add('on');
  scanLoop = setInterval(async () => {
    if (scanBusy || video.readyState < 2) return;
    let text = null;
    try {
      if (detector) { const r = await detector.detect(video); text = r[0]?.rawValue; }
      else { canvas.width = video.videoWidth; canvas.height = video.videoHeight; ctx.drawImage(video, 0, 0); const img = ctx.getImageData(0, 0, canvas.width, canvas.height); text = jsQR(img.data, img.width, img.height)?.data; }
    } catch { }
    if (text) { scanBusy = true; await validate(text, 'qr'); setTimeout(() => { scanBusy = false; }, 1600); }
  }, 220);
}
function stopScanner() {
  clearInterval(scanLoop); scanLoop = null;
  scanStream?.getTracks().forEach(t => t.stop()); scanStream = null;
  document.getElementById('cam-wrap')?.classList.remove('on');
}
function beep(ok) {
  try { const c = new AudioContext(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = ok ? 880 : 220; o.connect(g); g.connect(c.destination); g.gain.value = .15; o.start(); o.stop(c.currentTime + (ok ? .12 : .35)); } catch { }
  try { navigator.vibrate?.(ok ? 80 : [120, 60, 120]); } catch { }
}
const RES_ = () => ({ ok: ['verified', T('Biglietto valido', 'Valid ticket')], already_used: ['block', T('Già entrato', 'Already entered')], invalid: ['gpp_bad', T('QR non valido', 'Invalid QR')], wrong_event: ['event_busy', T('Biglietto di un altro evento', 'Ticket for another event')], void: ['cancel', T('Biglietto annullato', 'Ticket cancelled')] });
async function validate(token, method) {
  const ev = CPB.staffEv; if (!ev) return;
  const { data, error } = await sb.rpc('validate_ticket', { p_token: token.trim(), p_event: ev.uuid, p_gate: CPB.gate || 'Gate A', p_method: method });
  if (error) { A.toast(error.message, 'error'); return; }
  CPB.lastScan = { ...data, at: A.now() };
  beep(data.ok);
  const box = document.getElementById('scan');
  const RES = RES_(); const r = RES[data.result] || RES.invalid;
  if (box) box.insertAdjacentHTML('beforeend', `<div class="res ${data.ok ? 'ok' : 'ko'}"><div><span class="ms fill" aria-hidden="true">${r[0]}</span>${esc(r[1])}${data.name ? `<div style="font-size:15px;font-weight:600;margin-top:4px">${esc(data.name)}</div>` : ''}</div></div>`);
  await loadStaffList();
  setTimeout(() => { if (location.hash === '#staff') { const keep = !!scanStream; renderKeepCam(keep); } }, 1400);
}
function renderKeepCam(keep) {
  // ridisegna senza spegnere la fotocamera
  const old = document.getElementById('cam'); const stream = scanStream;
  A.render(true);
  if (keep && stream) { const v = document.getElementById('cam'); if (v) { v.srcObject = stream; v.play(); document.getElementById('cam-wrap')?.classList.add('on'); } }
}
async function loadStaffList() {
  const ev = CPB.staffEv; if (!ev) return;
  const { data } = await sb.from('staff_tickets').select('*').eq('event_id', ev.uuid).order('holder_name');
  CPB.staffList = data || [];
}
function staffEvents() {
  const today = A.ymd(A.TODAY);
  return A.EV.filter(e => e.org && !e.draft && (e.dateISO >= today || e.off >= -1)).sort((a, b) => a.off - b.off);
}
function staffHead(label) {
  const ev = CPB.staffEv; const L = CPB.staffList.filter(t => !t.ticket_type.startsWith('Accredito'));
  const inside = CPB.staffList.filter(t => t.status === 'used').length, tot = CPB.staffList.length || 1;
  const p = Math.round(inside / Math.max(ev?.cap || tot, 1) * 100);
  const opts = staffEvents().map(e => `<option value="${e.uuid}" ${e.uuid === ev?.uuid ? 'selected' : ''}>${esc(e.t)} · ${e.day}</option>`).join('');
  return `<div class="stf"><div class="lv"><span class="livedot"></span>LIVE CHECK-IN • ${label}</div>
  <label class="input" style="margin-top:8px;background:rgb(255 255 255/.12);min-height:44px"><select id="stf-ev" style="color:#fff">${opts}</select></label>
  <div class="row" style="margin-top:12px;align-items:baseline"><b style="font-size:30px;color:var(--gold)">${inside}</b><span style="opacity:.85">/ ${CPB.staffList.length} ${T('biglietti emessi', 'tickets issued')}</span><span class="sp"></span><b>${p}%</b></div>
  <div class="meter" style="background:rgb(255 255 255/.15)"><i style="width:${p}%"></i></div><div class="xs" style="opacity:.85">${T('Capienza', 'Capacity')} ${ev?.cap || '—'} · ${CPB.gate || 'Gate A'}</div></div>`;
}

// ---------- viste che in modalità server usano i dati reali ----------
CPB.views.staff = () => {
  if (!CPB.user) { setTimeout(() => loginSheet('staff'), 50); return A.sub(T('Check-in', 'Check-in'), 'profilo') + `<div class="wrap"><div class="empty card sec">${T('Accedi con l’account dello staff', 'Log in with your staff account')}</div></div>`; }
  if (!CPB.staffEv) CPB.staffEv = staffEvents()[0] || null;
  if (!CPB.staffEv) return A.sub('Check-in', 'profilo') + `<div class="wrap"><div class="empty card sec"><span class="ms" aria-hidden="true">event_busy</span><b>${T('Nessun evento da gestire', 'No events to manage')}</b><p class="sm">${T('Chiedi all’organizzatore di aggiungerti al team come staff.', 'Ask the organiser to add you to the team as staff.')}</p></div></div>` + A.staffNav('staff');
  const RES = RES_(); const L = CPB.lastScan; const r = L ? (RES[L.result] || RES.invalid) : null;
  return A.sub(T('Check-in', 'Check-in'), 'profilo', `<span class="tag ok"><span class="ms" aria-hidden="true">cloud_done</span>Online</span>`) + `<div class="wrap">${staffHead('SCANNER')}
  <div class="scan sec" id="scan" style="margin-top:12px"><div id="cam-wrap" class="camwrap"><video id="cam" playsinline muted></video></div><span class="st">QR SCANNER</span><div class="fr"><i></i><i></i><i></i><i></i></div><div class="ln"></div>
  <div class="hint">${scanStream ? T('Inquadra il QR del biglietto', 'Point at the ticket QR') : T('Tocca “Avvia fotocamera” per scansionare', 'Tap “Start camera” to scan')}</div></div>
  <div class="grid2" style="margin-top:10px"><button class="btn" data-act="cam-start"><span class="ms" aria-hidden="true">photo_camera</span>${T('Avvia fotocamera', 'Start camera')}</button><button class="btn sec2" data-act="cam-stop"><span class="ms" aria-hidden="true">videocam_off</span>${T('Ferma', 'Stop')}</button></div>
  <form id="cp-manual" class="row" style="margin-top:10px"><label class="input sp"><span class="ms" aria-hidden="true">pin</span><input id="man-code" placeholder="CP-XXXXXXXX" autocomplete="off" autocapitalize="characters" aria-label="${T('Codice biglietto', 'Ticket code')}"></label><button class="btn sec2" type="submit">${T('Verifica', 'Check')}</button></form>
  ${L ? `<section class="card pad sec"><div class="row"><div class="sp"><div class="xs b mut">${T('ULTIMA SCANSIONE', 'LAST SCAN')}</div><h2>${esc(L.name || '—')}</h2></div><span class="tag ${L.ok ? 'ok' : 'lr'}"><span class="ms" aria-hidden="true">${r[0]}</span>${esc(r[1])}</span></div><div class="kv" style="background:var(--soft);border-radius:14px;padding:12px;margin-top:12px"><div><small>${T('Tipologia', 'Type')}</small><b>${esc(L.type || '—')}</b></div><div><small>${T('Orario', 'Time')}</small><b>${L.at}</b></div><div><small>${T('Codice', 'Code')}</small><b style="color:var(--redtx)">#${esc(L.code || '—')}</b></div><div><small>Gate</small><b>${esc(CPB.gate || 'Gate A')}</b></div></div></section>` : ''}
  <a class="btn sec2 w sec" href="#accrediti"><span class="ms" aria-hidden="true">list_alt</span>${T('Lista accrediti', 'Guest list')}</a></div>` + A.staffNav('staff');
};
CPB.views.accrediti = () => {
  if (!CPB.staffEv) return CPB.views.staff();
  const q = (CPB.aq || '').toLowerCase(), f = CPB.af || 'tutti';
  const L = CPB.staffList.filter(t => (f === 'tutti' || (f === 'wait' && t.status === 'valid') || (f === 'ok' && t.status === 'used')) && (!q || `${t.holder_name} ${t.code} ${t.ticket_type}`.toLowerCase().includes(q)));
  const row = t => `<div class="att"><div class="row"><div class="sp"><div class="nm">${esc(t.holder_name || '—')}</div><div class="sm"><b>${esc(t.ticket_type)}</b> <span class="mut">• #${esc(t.code)}</span></div></div><span class="xs b ${t.status === 'used' ? 'st-ok' : t.status === 'void' ? 'st-warn' : 'st-wait'}">${t.status === 'used' ? T('Entrato', 'In') + ' ' + new Date(t.checked_in_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) : t.status === 'void' ? T('Annullato', 'Void') : T('Da convalidare', 'To validate')}</span></div>
   <div style="margin-top:10px">${t.status === 'used' ? `<button class="btn sec2 sm" data-act="cp-undo" data-id="${t.id}"><span class="ms" aria-hidden="true">undo</span>${T('Annulla ingresso', 'Undo entry')}</button>` : t.status === 'valid' ? `<button class="btn sm" data-act="cp-valid" data-code="${esc(t.code)}"><span class="ms" aria-hidden="true">verified</span>${T('Convalida ingresso', 'Validate entry')}</button>` : ''}</div></div>`;
  return A.sub(T('Lista accrediti', 'Guest list'), 'staff') + `<div class="wrap">${staffHead(T('ACCREDITI', 'GUEST LIST'))}
  <label class="input search" style="margin-top:14px"><span class="ms" aria-hidden="true">search</span><input id="cp-aq" type="search" placeholder="${T('Nome, codice o tipologia', 'Name, code or type')}" value="${esc(CPB.aq || '')}"></label>
  <div class="chips" style="margin-top:12px">${[['tutti', T('Tutti', 'All')], ['wait', T('Da convalidare', 'To validate')], ['ok', T('Già entrati', 'Already in')]].map(([k, l]) => `<button class="chip s ${f === k ? 'on' : ''}" data-act="cp-af" data-k="${k}">${l}</button>`).join('')}</div>
  <div class="card" style="margin-top:12px">${L.slice(0, 200).map(row).join('') || `<div class="empty">${T('Nessun partecipante trovato.', 'No attendees found.')}</div>`}</div>
  ${L.length > 200 ? `<p class="xs mut">${T('Mostrati i primi 200: usa la ricerca.', 'Showing the first 200: use search.')}</p>` : ''}
  <button class="btn gold w sec" data-act="newguest"><span class="ms" aria-hidden="true">person_add</span>${T('Nuovo ospite · accredito rapido', 'New guest · quick registration')}</button></div>` + A.staffNav('accrediti');
};
CPB.views.cronologia = () => {
  if (!CPB.staffEv) return CPB.views.staff();
  const G = CPB.passes || [];
  return A.sub(T('Cronologia pass', 'Pass history'), 'staff') + `<div class="wrap">${staffHead('DESK')}
  <div class="feed sec" style="margin-top:14px">${G.map(g => `<div class="it card pad"><div class="row"><b style="color:var(--redtx)">${new Date(g.created_at).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}</b><span class="tag ly">${esc(g.type)}</span><span class="sp"></span><span class="xs b">${g.pax} pax</span></div><h3 style="margin:6px 0 2px">${esc(g.name)}</h3>${g.note ? `<div class="mut sm">${esc(g.note)}</div>` : ''}<div class="xs mut" style="margin-top:6px">#${esc(g.code)} • ${esc(g.issued_by || '')}</div><div class="row sm b ${g.checked_in ? 'st-ok' : 'st-wait'}" style="margin-top:8px;gap:4px"><span class="ms" aria-hidden="true">${g.checked_in ? 'check_circle' : 'hourglass_top'}</span>${g.checked_in ? T('Entrato', 'Entered') : T('Da convalidare', 'To validate')}</div></div>`).join('') || `<div class="empty card">${T('Nessun pass emesso.', 'No passes issued.')}</div>`}</div>
  <button class="btn gold w sec" data-act="newguest"><span class="ms" aria-hidden="true">add_circle</span>${T('Emetti pass', 'Issue pass')}</button></div>` + A.staffNav('cronologia');
};
CPB.views['pass-ospite'] = () => {
  const g = CPB.lastPass; if (!g) return CPB.views.cronologia();
  return A.sub(T('Pass ospite', 'Guest pass'), 'accrediti') + `<div class="wrap"><article class="tkt" style="margin-top:14px"><div class="top2"><span class="tag" style="background:var(--gold);color:#171717">${esc(g.type)}</span><h2>${esc(g.name)}</h2><div style="opacity:.9">${esc(CPB.staffEv?.t || '')} · ${g.pax} ${T('ingressi', 'entries')}</div></div>
  <div class="cut"></div><div class="pad" style="text-align:center"><div class="qr">${A.qr(g.qr_token)}</div><div class="code" style="margin-top:12px">#${esc(g.code)}</div></div></article>
  <div class="grid2 sec"><a class="btn sec2" target="_blank" rel="noopener" href="https://wa.me/?text=${encodeURIComponent('City Pulse · ' + (CPB.staffEv?.t || '') + ' · ' + g.name + ' · #' + g.code)}"><span class="ms" aria-hidden="true">chat</span>WhatsApp</a><button class="btn sec2" data-act="copy" data-txt="${esc(g.code)}"><span class="ms" aria-hidden="true">content_copy</span>${T('Copia codice', 'Copy code')}</button></div>
  <button class="btn gold w sec" data-act="newguest"><span class="ms" aria-hidden="true">person_add</span>${T('Prossimo accredito', 'Next registration')}</button></div>` + A.staffNav('accrediti');
};
CPB.views['org-pagamenti'] = () => {
  const o = CPB.orgs[0];
  if (!o) { setTimeout(orgSignup, 50); return A.orgHead(T('Pagamenti', 'Payouts')) + `<div class="wrap"><div class="empty card sec">${T('Crea prima il profilo organizzatore.', 'Create your organiser profile first.')}</div></div>` + A.orgNav('org'); }
  return A.orgHead(T('Pagamenti', 'Payouts')) + `<div class="wrap"><section class="card pad sec" style="margin-top:14px"><div class="row"><h3 class="sp">${esc(o.name)}</h3>${o.stripe_ready ? `<span class="tag ok"><span class="ms" aria-hidden="true">check_circle</span>${T('Pagamenti attivi', 'Payouts active')}</span>` : `<span class="tag lr">${T('Da attivare', 'Not active')}</span>`}</div>
  <p class="mut sm">${T('City Pulse usa Stripe: incassi con carta, Apple Pay e Google Pay e ricevi il netto (incasso meno il 5%) direttamente sul tuo conto, in automatico.', 'City Pulse uses Stripe: take card, Apple Pay and Google Pay payments and receive the net (revenue minus 5%) straight to your bank account.')}</p>
  <button class="btn w" data-act="cp-connect"><span class="ms" aria-hidden="true">account_balance</span>${o.stripe_ready ? T('Gestisci dati di pagamento', 'Manage payout details') : T('Attiva i pagamenti con Stripe', 'Activate payouts with Stripe')}</button>
  <button class="btn sec2 w" style="margin-top:10px" data-act="cp-connect-check"><span class="ms" aria-hidden="true">sync</span>${T('Verifica stato', 'Check status')}</button></section></div>` + A.orgNav('org');
};
// Area organizzatori: accesso e profilo obbligatori, poi le viste standard con dati reali
let stripeWarned = false;
function orgGate() {
  if (!CPB.user) { setTimeout(() => loginSheet('org'), 50); return A.orgHead(T('Area organizzatori', 'Organiser area')) + `<div class="wrap"><div class="empty card sec">${T('Accedi per gestire i tuoi eventi.', 'Log in to manage your events.')}</div></div>`; }
  if (!CPB.orgs.length) return A.orgHead(T('Area organizzatori', 'Organiser area')) + `<div class="wrap"><div class="empty card sec"><span class="ms" aria-hidden="true">storefront</span><b>${T('Pubblica i tuoi eventi su City Pulse', 'Publish your events on City Pulse')}</b><button class="btn sm" data-act="cp-orgsignup" style="margin-top:10px">${T('Diventa organizzatore', 'Become an organiser')}</button></div></div>`;
  watchOrgRealtime();
  if (!CPB.orgs[0].stripe_ready && !stripeWarned) { stripeWarned = true; setTimeout(() => A.toast(T('Attiva i pagamenti in Area organizzatori → Pagamenti', 'Activate payouts in Organiser area → Payouts'), 'account_balance'), 300); }
  return null;
}
for (const k of ['org', 'org-eventi', 'org-nuovo', 'org-promo']) CPB.views[k] = orgGate;

// ---------- azioni intercettate ----------
CPB.intercept = (act, el) => {
  const S = A.S;
  switch (act) {
    case 'login': loginSheet(); return true;
    case 'oauth': sb.auth.signInWithOAuth({ provider: el.dataset.p, options: { redirectTo: CFG.siteUrl || location.origin + location.pathname } }); return true;
    case 'logout': sb.auth.signOut().then(() => { location.hash = 'esplora'; location.reload(); }); return true;
    case 'fav': case 'going': {
      if (!CPB.requireLogin()) return true;
      const e = A.E(el.dataset.id); const set = act === 'fav' ? S.fav : S.going; const table = act === 'fav' ? 'favorites' : 'going';
      const q = set.has(e.id) ? sb.from(table).delete().eq('event_id', e.uuid).eq('user_id', CPB.user.id) : sb.from(table).insert({ user_id: CPB.user.id, event_id: e.uuid });
      q.then(({ error }) => error && A.toast(error.message, 'error'));
      return false; // l'interfaccia aggiorna lo stato e mostra il messaggio
    }
    case 'buy': {
      const e = A.E(el.dataset.id);
      if (e.partner) { location.href = e.partner; return true; }
      if (!CPB.requireLogin('evento-' + e.id)) return true;
      if (A.needsPhone(e)) { A.phoneSheet(() => el.click()); return true; }
      setTimeout(() => { if (A.S.cart) { A.S.cart.name = CPB.displayName(); A.S.cart.mail = CPB.user.email || ''; A.S.cart.tel = CPB.profile?.phone || ''; A.render(true); } }, 0);
      return false;
    }
    case 'follow': {
      if (!CPB.requireLogin()) return true;
      const id = el.dataset.id; const on = A.S.follow.has(id);
      (on ? sb.from('artist_follows').delete().eq('user_id', CPB.user.id).eq('artist_slug', id) : sb.from('artist_follows').insert({ user_id: CPB.user.id, artist_slug: id }))
        .then(({ error }) => { if (error) A.toast(error.message, 'error'); else if (!on) enablePush(); });
      return false;
    }
    case 'checkout': checkout(); return true;
    case 'review': if (!CPB.requireLogin()) return true; return false;
    case 'savenoti': enablePush(); return false;
    case 'lang': setTimeout(() => { applyEvents(); A.render(true); if (CPB.user) sb.from('profiles').update({ lang: A.LANG }).eq('id', CPB.user.id); }, 0); return false;
    case 'friends': return false;
    case 'evsave': saveEvent(true); return true;
    case 'orgnew': if (!CPB.orgs.length) { CPB.requireLogin('org') && orgSignup(); return true; } return false;
    case 'orgdel2': {
      const e = A.E(el.dataset.id);
      sb.from('events').delete().eq('id', e.uuid).select('id').then(async ({ data, error }) => {
        A.closeSheet();
        if (error || !data?.length) { A.toast(T('Non si può eliminare un evento con biglietti venduti: annullalo e rimborsa da Stripe.', 'You cannot delete an event with tickets sold: cancel it and refund in Stripe.'), 'error'); return; }
        await loadEvents(); location.hash = 'org-eventi';
      });
      return true;
    }
    case 'promo-buy': {
      const e = A.E(document.getElementById('pr-ev')?.value);
      invoke('create-checkout', { kind: 'promotion', event_id: e.uuid, package: el.dataset.k, lang: A.LANG }).then(r => r?.url && (location.href = r.url));
      return true;
    }
    case 'orgcsv': {
      const e = A.E(el.dataset.id), x = CPB.salesOf(e);
      A.copy('tipo,prezzo,venduti,incasso\n' + x.tiers.map(t => `"${t[0].replace(/"/g, '""')}",${t[1]},${t[2]},${(t[1] * t[2]).toFixed(2)}`).join('\n'));
      return true;
    }
    case 'cp-orgsignup': orgSignup(); return true;
    case 'cp-connect': case 'cp-connect-check':
      invoke('connect-onboarding', { organizer_id: CPB.orgs[0].id, check: act === 'cp-connect-check' }).then(async r => {
        if (r?.url) location.href = r.url;
        else if (r) { await loadProfile(); A.toast(r.ready ? T('Pagamenti attivi', 'Payouts active') : T('Completa i dati su Stripe', 'Complete your details on Stripe'), r.ready ? 'check_circle' : 'info'); A.render(true); }
      });
      return true;
    case 'cam-start': startScanner(); return true;
    case 'cam-stop': stopScanner(); return true;
    case 'cp-valid': validate(el.dataset.code, 'manual').then(() => A.render(true)); return true;
    case 'cp-undo': sb.rpc('undo_checkin', { p_ticket: el.dataset.id }).then(async () => { await loadStaffList(); A.render(true); }); return true;
    case 'cp-af': CPB.af = el.dataset.k; A.render(true); return true;
    case 'newguest': if (!CPB.staffEv) return true; return false;
    case 'reset-all': sb.auth.signOut().finally(() => { localStorage.clear(); location.reload(); }); return true;
    case 'simscan': case 'pinsheet': case 'torch': location.hash = 'staff'; return true;
  }
  return false;
};

CPB.onSubmit = f => {
  const S = A.S;
  if (f.id === 'cp-login') {
    const email = f.querySelector('#lg-mail').value.trim();
    sb.auth.signInWithOtp({ email, options: { emailRedirectTo: CFG.siteUrl || location.origin + location.pathname } }).then(({ error }) => {
      if (error) A.toast(error.message, 'error');
      else { A.closeSheet(); A.toast(T('Controlla la tua email: ti abbiamo inviato il link', 'Check your email: we sent you the link'), 'mark_email_read'); }
    });
    return true;
  }
  if (f.id === 'cp-orgsignup') {
    const name = f.querySelector('#og-name').value.trim();
    sb.from('organizers').insert({ name, owner_id: CPB.user.id, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) + '-' + Math.random().toString(36).slice(2, 5) }).then(async ({ error }) => {
      if (error) { A.toast(error.message, 'error'); return; }
      A.closeSheet(); await loadProfile(); A.toast(T('Profilo organizzatore creato', 'Organiser profile created'), 'storefront'); location.hash = 'org-pagamenti';
    });
    return true;
  }
  if (f.id === 'evform') { saveEvent(false); return true; }
  if (f.id === 'rvform') { submitReview(); return true; }
  if (f.id === 'cp-manual') { const c = f.querySelector('#man-code').value.trim(); if (c) validate(c, 'pin'); return true; }
  if (f.id === 'pinf') { location.hash = 'staff'; A.closeSheet(); return true; }
  if (f.id === 'gform') {
    const name = f.querySelector('#gn').value.trim(); if (!name) { A.toast(T('Inserisci nome e cognome', 'Enter full name'), 'error'); return true; }
    const type = f.querySelector('#gtype .on').dataset.k, pax = +f.querySelector('#gpax .on').dataset.v;
    sb.rpc('issue_guest_pass', { p_event: CPB.staffEv.uuid, p_name: name, p_type: type, p_pax: pax, p_note: f.querySelector('#gnote').value.trim() || null, p_checkin: f.querySelector('#gnow').checked })
      .then(async ({ data, error }) => {
        if (error) { A.toast(error.message, 'error'); return; }
        CPB.lastPass = data; A.closeSheet(); await Promise.all([loadStaffList(), loadPasses()]); location.hash = 'pass-ospite'; A.render(true);
      });
    return true;
  }
  return false;
};

// ---------- checkout reale ----------
async function invoke(fn, body) {
  const { data, error } = await sb.functions.invoke(fn, { body });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { }
    A.toast(msg, 'error'); return null;
  }
  if (data?.error) { A.toast(data.error, 'error'); return null; }
  return data;
}
async function checkout() {
  const S = A.S, c = S.cart; if (!c) return;
  const name = document.getElementById('hn')?.value.trim(), email = document.getElementById('he')?.value.trim(), phone = document.getElementById('hp')?.value.trim();
  if (!name || !/\S+@\S+\.\S+/.test(email || '')) { A.toast(T('Inserisci nome ed email validi', 'Enter a valid name and email'), 'error'); return; }
  const e = A.E(c.ev);
  const items = A.tiers(e).map((t, i) => ({ ticket_type_id: e.tiers[i]?.[4], qty: c.qty[t[0]] || 0 })).filter(x => x.qty > 0 && x.ticket_type_id);
  if (!items.length) { A.toast(T('Scegli almeno un biglietto', 'Choose at least one ticket'), 'error'); return; }
  const btn = document.querySelector('[data-act=checkout]'); if (btn) { btn.disabled = true; btn.style.opacity = .6; }
  const code = document.getElementById('promo')?.value.trim() || c.code?.code || null;
  const dinner = c.dinner ? { offer_id: c.dinner.rid, slot: c.dinner.slot, people: c.dinner.people } : null;
  const r = await invoke('create-checkout', { kind: 'tickets', event_id: e.uuid, items, buyer: { name, email, phone }, lang: A.LANG, dinner,
    code, source: A.SRC, age_range: document.getElementById('h-age')?.value || null, origin: document.getElementById('h-orig')?.value || null });
  if (btn) { btn.disabled = false; btn.style.opacity = 1; }
  if (!r) return;
  if (r.redirect) { location.href = r.redirect; return; }
  if (r.url) { location.href = r.url; return; }       // pagina di pagamento Stripe
  if (r.free) { S.cart = null; await loadMine(); A.toast(T('Prenotazione confermata!', 'Booking confirmed!'), 'check_circle'); location.hash = 'biglietti'; }
}

// ---------- recensioni ----------
async function loadReviews(e) {
  const { data } = await sb.from('public_reviews').select('*').eq('event_id', e.uuid).order('created_at', { ascending: false });
  A.S.reviews[e.id] = (data || []).map(r => ({ id: r.id, n: r.author || '—', stars: r.stars, txt: r.body, photos: r.photos, d: new Date(r.created_at).toLocaleDateString(A.LANG === 'en' ? 'en-GB' : 'it-IT'), ok: 1, me: r.mine }));
  A.render(true);
}
async function submitReview() {
  const RV = A.getRV(); const e = A.E(RV.id);
  if (!RV.stars) { A.toast(T('Scegli un voto da 1 a 5 stelle', 'Choose a rating from 1 to 5 stars'), 'star'); return; }
  const txt = document.getElementById('rvtxt')?.value.trim() || null;
  try {
    const urls = [];
    for (const u of RV.photos) {
      const path = `${CPB.user.id}/${crypto.randomUUID()}.jpg`;
      const { error } = await sb.storage.from('review-photos').upload(path, await dataURLtoBlob(u), { contentType: 'image/jpeg' });
      if (error) throw error;
      urls.push(sb.storage.from('review-photos').getPublicUrl(path).data.publicUrl);
    }
    const { error } = await sb.from('reviews').insert({ event_id: e.uuid, user_id: CPB.user.id, stars: RV.stars, body: txt, photos: urls });
    if (error) throw new Error(T('Puoi recensire solo eventi conclusi per cui avevi il biglietto.', 'You can only review ended events you had a ticket for.'));
    A.closeSheet(); A.toast(T('Grazie! Recensione pubblicata', 'Thanks! Review published'), 'rate_review'); await loadReviews(e);
  } catch (err) { A.toast(err.message, 'error'); }
}

// ---------- notifiche push ----------
function b64ToBytes(s) { const p = '='.repeat((4 - s.length % 4) % 4); const b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(b, c => c.charCodeAt(0)); }
async function enablePush() {
  if (!CPB.user) return;
  sb.from('profiles').update({ prefs: A.S.prefs }).eq('id', CPB.user.id);
  if (!A.S.prefs.push || !('serviceWorker' in navigator) || !('PushManager' in window) || !CFG.vapidPublicKey) return;
  try {
    if (Notification.permission === 'default') await Notification.requestPermission();
    if (Notification.permission !== 'granted') { A.toast(T('Notifiche bloccate nelle impostazioni del browser', 'Notifications are blocked in browser settings'), 'notifications_off'); return; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription() || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(CFG.vapidPublicKey) });
    const j = sub.toJSON();
    await sb.from('push_subscriptions').upsert({ user_id: CPB.user.id, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, lang: A.LANG }, { onConflict: 'endpoint' });
  } catch (err) { console.warn(err); }
}

// ---------- amici che ci vanno ----------
async function loadFriends(e) {
  if (!CPB.user || e._fr) return; e._fr = 1;
  const { data } = await sb.rpc('friends_going', { p_event: e.uuid });
  e.friends = (data || []).map((f, i) => ({ id: f.user_id, n: f.full_name || '—', c: COLORS[i % COLORS.length], go: [e.id] }));
  if (e.friends.length) A.render(true);
}
async function loadPasses() {
  if (!CPB.staffEv) return;
  const { data } = await sb.from('staff_guest_passes').select('*').eq('event_id', CPB.staffEv.uuid).order('created_at', { ascending: false });
  CPB.passes = data || [];
}

// ---------- ad ogni cambio pagina ----------
CPB.onRoute = h => {
  if (h !== 'staff') stopScanner();
  if (h.startsWith('org') && CPB.orgs[0] && CPB.orgs[0].status && CPB.orgs[0].status !== 'approved') setTimeout(() => {
    const w = document.querySelector('#app .wrap'); if (!w || w.querySelector('.orgpend')) return;
    const st = CPB.orgs[0].status;
    w.insertAdjacentHTML('afterbegin', `<div class="banner wa orgpend" role="status"><span class="ms fill" aria-hidden="true">hourglass_top</span><div class="sp"><b>${st === 'pending' ? T('Profilo organizzatore in attesa di approvazione', 'Organizer profile awaiting approval') : T('Profilo organizzatore non attivo', 'Organizer profile not active')}</b><div class="sm">${T('Puoi preparare gli eventi come bozze: li pubblichi appena City Pulse approva il profilo (di solito entro 24 ore).', 'You can prepare events as drafts: you can publish them as soon as City Pulse approves your profile (usually within 24 hours).')}</div></div></div>`);
  }, 0);
  if (h !== 'amici' && h !== 'profilo') dq.people = null;
  if (h !== 'admin') dq.admin = null;
  { const id = h.startsWith('evento-') ? h.slice(7) : h === 'checkout' ? A.S.cart?.ev : null; const e = id && A.E(id);
    if (e?.uuid) {
      if (A.soldOut(e) && !pub.rs[e.uuid]) { pub.rs[e.uuid] = []; once('rs:' + e.uuid, () => loadResale(e)); }
      if (!pub.dn[e.uuid]) { pub.dn[e.uuid] = []; once('dn:' + e.uuid, () => loadDinners(e)); }
    } }
  if (h.startsWith('regalo-')) { const tok = h.slice(7); if (!(tok in pub.gp)) { pub.gp[tok] = null; once('gp:' + tok, () => loadGift(tok)); } }
  if ((h === 'amici' || h === 'profilo') && CPB.user && !dq.people) { dq.people = []; once('people', loadPeople); }
  if (h === 'admin' && CPB.profile?.role === 'admin' && !dq.admin) { dq.admin = { overview: null, orgs: [], reports: [], reviews: [] }; once('admin', loadAdmin); }
  if (h.startsWith('evento-')) { const e = A.E(h.slice(7)); if (e) { if (e.past && !A.S.reviews[e.id]) { A.S.reviews[e.id] = []; loadReviews(e); } loadFriends(e); } }
  if (['staff', 'accrediti', 'cronologia'].includes(h) && CPB.user) {
    if (!CPB.staffEv) CPB.staffEv = staffEvents()[0] || null;
    if (CPB.staffEv && !CPB._staffLoaded) { CPB._staffLoaded = 1; Promise.all([loadStaffList(), loadPasses()]).then(() => A.render(true)); }
  }
};
document.addEventListener('change', ev => {
  if (ev.target.id === 'stf-ev') { CPB.staffEv = A.EV.find(e => e.uuid === ev.target.value); CPB._staffLoaded = 0; Promise.all([loadStaffList(), loadPasses()]).then(() => A.render(true)); }
});
document.addEventListener('input', ev => {
  if (ev.target.id === 'cp-aq') { CPB.aq = ev.target.value; const p = ev.target.selectionStart; A.render(true); const n = document.getElementById('cp-aq'); n?.focus(); n?.setSelectionRange(p, p); }
});

// ---------- strumenti organizzatori (prezzi, sconti, team, pubblico, messaggi) ----------
const cache = { codes: null, team: null, ins: {}, msgs: {}, loading: new Set() };
function once(key, fn) { if (cache.loading.has(key)) return; cache.loading.add(key); Promise.resolve(fn()).finally(() => { cache.loading.delete(key); }).then(() => A.render(true)); }
const orgId = () => CPB.orgs[0]?.id;
async function loadCodes() {
  const { data } = await sb.from('discount_codes').select('*').eq('organizer_id', orgId()).order('created_at', { ascending: false });
  cache.codes = (data || []).map(c => ({ id: c.id, code: c.code, kind: c.kind, value: c.kind === 'fixed' ? c.value / 100 : c.value, ev: c.event_id ? (A.EV.find(e => e.uuid === c.event_id)?.id || c.event_id) : null, max: c.max_uses, used: c.used, until: c.valid_until, active: c.active }));
}
async function loadTeam() {
  const { data } = await sb.rpc('team_list', { p_org: orgId() });
  cache.team = (data || []).map(m => ({ uid: m.user_id, n: m.full_name || '', e: m.email || '', r: m.role, g: m.gate, pending: m.pending }));
}
const ok = ({ error }) => { if (error) throw error; };
const real = {
  steps: (e, n) => (e.steps || {})[n] || [],
  async setSteps(e, n, arr) {
    const tid = (e.tiers || []).find(t => t[0] === n)?.[4];
    ok(await sb.from('ticket_types').update({ price_steps: arr.map(([u, p]) => ({ up_to: u, price_cents: Math.round(p * 100) })) }).eq('id', tid));
    await loadEvents();
  },
  codes: e => { if (!cache.codes) { once('codes', loadCodes); return []; } return cache.codes.filter(c => !c.ev || !e || c.ev === e.id); },
  async addCode(c) {
    const ev = c.ev ? A.E(c.ev)?.uuid : null;
    ok(await sb.from('discount_codes').insert({ organizer_id: orgId(), event_id: ev, code: c.code, kind: c.kind, value: c.kind === 'fixed' ? Math.round(c.value * 100) : c.value, max_uses: c.max, valid_until: c.until ? new Date(c.until + 'T23:59').toISOString() : null }));
    await loadCodes();
  },
  async toggleCode(code) { const c = cache.codes.find(x => x.code === code); ok(await sb.from('discount_codes').update({ active: !c.active }).eq('id', c.id)); await loadCodes(); A.render(true); },
  async delCode(code) { const c = cache.codes.find(x => x.code === code); ok(await sb.from('discount_codes').delete().eq('id', c.id)); await loadCodes(); A.render(true); },
  async checkCode(e, code) { const { data } = await sb.rpc('check_discount', { p_event: e.uuid, p_code: code }); if (!data?.valid) return { valid: false }; return { ...data, value: data.kind === 'fixed' ? data.value / 100 : data.value }; },
  team: () => { if (!cache.team) { once('team', loadTeam); return []; } return cache.team; },
  gates: () => [...new Set([...(A.S.gates || []), ...((cache.team || []).map(m => m.g))])],
  async invite(m) { ok(await sb.from('team_invites').insert({ organizer_id: orgId(), email: m.e.toLowerCase(), role: m.r, gate: m.g, invited_by: CPB.user.id })); await loadTeam(); },
  async setMember(i, p) {
    const m = cache.team[i]; const upd = {}; if (p.r) upd.role = p.r; if (p.g) upd.gate = p.g;
    ok(m.pending ? await sb.from('team_invites').update(upd).eq('organizer_id', orgId()).eq('email', m.e) : await sb.from('organizer_members').update(upd).eq('organizer_id', orgId()).eq('user_id', m.uid));
    Object.assign(m, p);
  },
  async removeMember(i) {
    const m = cache.team[i];
    ok(m.pending ? await sb.from('team_invites').delete().eq('organizer_id', orgId()).eq('email', m.e) : await sb.from('organizer_members').delete().eq('organizer_id', orgId()).eq('user_id', m.uid));
    await loadTeam(); A.render(true);
  },
  insights: e => {
    const I = cache.ins[e.uuid];
    if (!I) { once('ins' + e.uuid, async () => { const { data } = await sb.rpc('org_event_insights', { p_event: e.uuid }); if (data) cache.ins[e.uuid] = data; }); return null; }
    return { ...I, codes: (I.codes || []).map(c => ({ code: c.code, used: c.used, discount: (c.discount_cents || 0) / 100 })) };
  },
  messages: e => {
    if (!cache.msgs[e.uuid]) { cache.msgs[e.uuid] = []; once('msg' + e.uuid, async () => { const { data } = await sb.from('event_messages').select('*').eq('event_id', e.uuid).order('created_at', { ascending: false }); cache.msgs[e.uuid] = (data || []).map(m => ({ t: m.title, b: m.body, n: m.recipients, at: Date.parse(m.created_at) })); }); }
    return cache.msgs[e.uuid];
  },
  async send(e, t, b) { const { data, error } = await sb.rpc('message_attendees', { p_event: e.uuid, p_title: t, p_body: b }); if (error) throw new Error(error.message); delete cache.msgs[e.uuid]; return data; },
  billing: () => CPB.orgs[0]?.billing || {},
  async setBilling(b) { ok(await sb.from('organizers').update({ billing: b }).eq('id', orgId())); CPB.orgs[0].billing = b; },
};
CPB.soldOf = (e, name) => { const t = (CPB.raw.tts || []).find(x => x.event_id === e.uuid && x.name === name); return t ? t.sold + t.reserved : 0; };



// ---------- regalo, rivendita, lista d'attesa, cena ----------
const pub = { rs: {}, dn: {}, gp: {}, wait: {} };
async function loadResale(e) {
  const { data } = await sb.from('resale_offers').select('*').eq('event_id', e.uuid).order('price_cents');
  pub.rs[e.uuid] = (data || []).map(r => ({ id: r.id, type: r.ticket_type, price: r.price_cents / 100, forMe: r.reserved_for_me, other: r.reserved_for_waitlist && !r.reserved_for_me, offer: r.offered_until }));
}
async function loadDinners(e) {
  const { data } = await sb.rpc('dinner_options', { p_event: e.uuid });
  const by = {};
  for (const r of data || []) {
    const o = by[r.offer_id] ||= { id: r.offer_id, n: r.restaurant, k: r.cuisine || '', addr: r.address || '', zone: r.zone, title: r.title, menu: r.menu, price: r.price_cents / 100, walk: r.walk_min, slots: [] };
    o.slots.push({ slot: r.slot.slice(0, 5), left: Math.max(0, r.seats_left) });
  }
  pub.dn[e.uuid] = Object.values(by).sort((a, b) => a.walk - b.walk).slice(0, 3);
}
async function loadGift(tok) {
  const { data } = await sb.rpc('gift_preview', { p_token: tok });
  const g = (data || [])[0];
  if (!g) { pub.gp[tok] = { status: 'missing', from: '—', title: '', type: '' }; return; }
  const p = romeParts(g.starts_at);
  pub.gp[tok] = { status: g.status, from: g.from_name, msg: g.message, title: g.event_title, type: g.ticket_type, venue: g.venue_name, time: p.time,
    day: new Date(p.date + 'T00:00').toLocaleDateString(en() ? 'en-GB' : 'it-IT', { weekday: 'short', day: 'numeric', month: 'short' }), forMe: CPB.user ? !!g.for_me : null, slug: g.event_slug };
}
const rpcOk = async (fn, args) => { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; };
const realPUB = {
  resaleFor: e => pub.rs[e.uuid] || [],
  async buyResale(e, r) {
    if (!CPB.requireLogin('evento-' + e.id)) return;
    const acc = A.DQ.account();
    const res = await invoke('create-checkout', { kind: 'resale', listing_id: r.id, buyer: { name: acc.name, email: acc.mail, phone: acc.tel || null }, lang: A.LANG });
    if (res?.url) location.href = res.url;
  },
  async listResale(t) { const d = await rpcOk('list_for_resale', { p_ticket: t.id }); await loadMine(); return { price: d.price_cents / 100 }; },
  async cancelResale(t) { await rpcOk('cancel_resale', { p_listing: t.resale.id }); await loadMine(); },
  async gift(t, mail, msg) {
    const d = await rpcOk('gift_ticket', { p_ticket: t.id, p_email: mail, p_message: msg || null });
    await invoke('gift-email', { gift_id: d.id }).catch(() => { });
    await loadMine(); return d;
  },
  async cancelGift(t) { await rpcOk('cancel_gift', { p_gift: t.gift.id }); await loadMine(); },
  giftPreview: tok => pub.gp[tok] || null,
  async acceptGift(tok) {
    if (!CPB.requireLogin('regalo-' + tok)) throw new Error(T('Accedi per accettare il regalo', 'Sign in to accept the gift'));
    await rpcOk('accept_gift', { p_token: tok }); delete pub.gp[tok]; await loadMine();
  },
  wait: e => pub.wait[e.uuid] || null,
  async joinWait(e, qty) {
    if (!CPB.requireLogin('evento-' + e.id)) throw new Error(T('Accedi per entrare in lista', 'Sign in to join the list'));
    const d = await rpcOk('join_waitlist', { p_event: e.uuid, p_qty: qty }); await loadMine(); return { position: d.position };
  },
  async leaveWait(e) { await rpcOk('leave_waitlist', { p_event: e.uuid }); await loadMine(); delete pub.rs[e.uuid]; },
  dinners: e => (e && e.uuid && !e.past ? pub.dn[e.uuid] || [] : []),
};

// ---------- uso quotidiano: account, cellulare, amici, annulla/rinvia, segnalazioni, admin ----------
const dq = { people: null, search: {}, admin: null };
async function loadPeople() {
  const { data } = await sb.rpc('my_people');
  dq.people = (data || []).map((p, i) => ({ id: p.id, n: p.full_name || '—', c: COLORS[i % COLORS.length], go: [], i: p.i_follow, fm: p.follows_me }));
}
async function loadAdmin() {
  const [o, g, r, v] = await Promise.all([sb.rpc('admin_overview'), sb.rpc('admin_organizers'), sb.from('reports').select('*').order('created_at', { ascending: false }).limit(100), sb.rpc('admin_reviews', { p_limit: 50 })]);
  const day = d => new Date(d).toLocaleDateString(en() ? 'en-GB' : 'it-IT', { day: 'numeric', month: 'short' });
  const x = o.data || {};
  dq.admin = {
    overview: { pend: x.organizers_pending || 0, open: x.reports_open || 0, live: x.events_live || 0, users: x.users || 0, tickets: x.tickets_30d || 0, gmv: (x.gmv_30d_cents || 0) / 100, fee: (x.revenue_30d_cents || 0) / 100, refunds: x.refunds_pending || 0 },
    orgs: (g.data || []).map(o => ({ id: o.id, n: o.name, owner: o.owner_name || '—', mail: o.owner_email || '', at: day(o.created_at), status: o.status, events: o.events, note: o.review_note })),
    reports: (r.data || []).map(x => ({ id: x.id, type: x.target_type, target: x.target_id, label: x.label || x.target_type, reason: x.reason, details: x.details, by: T('utente', 'user'), at: day(x.created_at), status: x.status })),
    reviews: (v.data || []).map(x => ({ key: x.id, ev: x.event_title, n: x.author || '—', stars: x.stars, txt: x.body, hidden: x.hidden })),
  };
}
const must = ({ error }) => { if (error) throw new Error(error.message); };
const realDQ = {
  account: () => ({ name: CPB.profile?.full_name || CPB.displayName(), mail: CPB.user?.email || '', tel: CPB.profile?.phone || '', phoneOk: !!CPB.profile?.phone_verified, disc: CPB.profile?.discoverable !== false }),
  async saveAccount(d) {
    if (!CPB.requireLogin('account')) return;
    must(await sb.from('profiles').update({ full_name: d.name, discoverable: d.disc }).eq('id', CPB.user.id));
    Object.assign(CPB.profile, { full_name: d.name, discoverable: d.disc });
    if (d.mail && d.mail.toLowerCase() !== (CPB.user.email || '').toLowerCase()) { must(await sb.auth.updateUser({ email: d.mail })); return { mailPending: true }; }
  },
  async exportData() { const { data, error } = await sb.rpc('export_my_data'); if (error) throw new Error(error.message); return data; },
  async deleteAccount() {
    const { data, error } = await sb.functions.invoke('delete-account', { body: { confirm: 'CANCELLA' } });
    if (error || !data?.deleted) { let m = error?.message || T('Cancellazione non riuscita', 'Deletion failed'); try { m = (await error.context.json()).error || m; } catch { } throw new Error(m); }
    await sb.auth.signOut().catch(() => { });
  },
  async phoneStart(tel) { if (!CPB.requireLogin()) throw new Error(T('Accedi per continuare', 'Sign in to continue')); must(await sb.auth.updateUser({ phone: tel })); },
  async phoneVerify(tel, code) {
    must(await sb.auth.verifyOtp({ phone: tel, token: code, type: 'phone_change' }));
    await loadProfile(); if (!CPB.profile.phone_verified) { CPB.profile.phone_verified = true; CPB.profile.phone = tel; }
  },
  people: () => dq.people || [],
  search(q) {
    q = q.trim(); if (q.length < 2) return [];
    if (dq.search[q]) return dq.search[q];
    clearTimeout(dq.t); dq.t = setTimeout(async () => {
      const { data } = await sb.rpc('search_people', { p_q: q });
      dq.search[q] = (data || []).map((p, i) => ({ id: p.id, n: p.full_name || '—', c: COLORS[i % COLORS.length], go: [], i: p.i_follow, fm: p.follows_me }));
      const o = document.getElementById('pres'); if (o && document.getElementById('pq')?.value.trim() === q) A.render(true);
    }, 250);
    return [];
  },
  async followPerson(id, on) {
    if (!CPB.requireLogin('amici')) return;
    must(await (on ? sb.from('follows').insert({ follower_id: CPB.user.id, followee_id: id }) : sb.from('follows').delete().eq('follower_id', CPB.user.id).eq('followee_id', id)));
    dq.search = {}; await loadPeople();
  },
  async report(r) {
    if (!CPB.requireLogin()) throw new Error(T('Accedi per segnalare', 'Sign in to report'));
    const target = r.type === 'event' ? (A.EV.find(e => e.id === r.target || e.uuid === r.target)?.uuid || r.target) : r.target;
    const { error } = await sb.from('reports').insert({ reporter: CPB.user.id, target_type: r.type, target_id: target, reason: r.reason, details: r.details || null, label: (r.label || '').slice(0, 200) });
    if (error) throw new Error(error.code === '23505' ? 'dup' : error.message);
  },
  async cancelEvent(e, reason) { const { data, error } = await sb.rpc('cancel_event', { p_event: e.uuid, p_reason: reason }); if (error) throw new Error(error.message); await refreshAll(); return { refunds: data.refunds, notified: data.notified }; },
  async reschedule(e, date, time, reason, days) {
    const raw = CPB.raw.events.find(x => x.id === e.uuid); const dur = raw ? Date.parse(raw.ends_at) - Date.parse(raw.starts_at) : 3 * 36e5;
    const starts = romeToISO(date, time);
    const { data, error } = await sb.rpc('reschedule_event', { p_event: e.uuid, p_starts: starts, p_ends: new Date(Date.parse(starts) + dur).toISOString(), p_reason: reason || null, p_refund_days: days });
    if (error) throw new Error(error.message); await refreshAll(); return { notified: data.notified };
  },
  async requestRefund(t) { must(await sb.rpc('request_refund', { p_order: t.order })); t.refund = 'pending'; },
  admin: {
    isAdmin: () => CPB.profile?.role === 'admin',
    overview: () => dq.admin?.overview || { pend: 0, open: 0, live: 0, users: 0, tickets: 0, gmv: 0, fee: 0, refunds: 0 },
    orgs: () => dq.admin?.orgs || [],
    reports: () => dq.admin?.reports || [],
    reviews: () => dq.admin?.reviews || [],
    async setOrg(id, st, note) { must(await sb.rpc('admin_set_organizer', { p_org: id, p_status: st, p_note: note || null })); await loadAdmin(); },
    async moderate(id, act, note) { must(await sb.rpc('admin_moderate', { p_report: id, p_action: act, p_note: note || null })); await loadAdmin(); },
    async setReview(id, h) { must(await sb.rpc('admin_set_review', { p_review: id, p_hidden: h })); await loadAdmin(); },
  },
};

// ---------- avvio ----------
export async function start(app) {
  A = app;
  Object.assign(A.ORG_API, real);
  const adm = realDQ.admin; Object.assign(A.DQ, realDQ); A.DQ.admin = adm;
  Object.assign(A.PUB, realPUB);
  sb = createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { flowType: 'pkce', persistSession: true, detectSessionInUrl: true } });
  A.S.feed = [];
  sb.auth.onAuthStateChange(async (event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      await refreshAll();
      if (event === 'SIGNED_IN') {
        let next = null; try { next = sessionStorage.getItem('cp_after_login'); sessionStorage.removeItem('cp_after_login'); } catch { }
        A.closeSheet();
        if (next) location.hash = next;
      }
    }
  });
  await refreshAll();
  // stile del video dello scanner
  const st = document.createElement('style');
  st.textContent = '.camwrap{position:absolute;inset:0;opacity:0;transition:opacity .3s}.camwrap.on{opacity:1}.camwrap video{width:100%;height:100%;object-fit:cover}#stf-ev{background:transparent;border:0;font-weight:700;width:100%;font-size:15px}#stf-ev option{color:#171717}';
  document.head.append(st);
}
