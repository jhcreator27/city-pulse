// Finto client Supabase per testare l'interfaccia in modalità server senza rete
const now = new Date();
const iso = (d, h) => { const x = new Date(now); x.setDate(x.getDate() + d); x.setHours(h, 0, 0, 0); return x.toISOString(); };
const U = { id: 'u1', email: 'julian@jhstudios.it' };
export const LOG = (window.__LOG = []);
const DB = {
  public_events: [
    { id: 'e1', slug: 'indie-night-castello', organizer_id: 'org1', title: 'Indie Night al Castello', title_en: 'Indie Night at the Castle', description: 'Live dal Castello', category: 'musica', starts_at: iso(0, 21), ends_at: iso(1, 1), venue_name: 'Castello a Mare', zone: 'La Cala', address: 'Via Filippo Patti', map_x: 70, map_y: 47, capacity: 400, age: '18+ anni', accessible: false, lineup: [{ time: '21:00', label: 'Opening', name: 'Giulia & The Echoes', genre: 'Dream Pop' }], ticketing_mode: 'city_pulse', min_price_cents: 1800, going_count: 120, featured: true },
    { id: 'e2', slug: 'neon-pulse', organizer_id: 'org9', title: 'Neon Pulse Festival', description: 'Techno', category: 'musica', starts_at: iso(2, 22), ends_at: iso(3, 4), venue_name: 'Cantieri Culturali alla Zisa', zone: 'Zisa', map_x: 26, map_y: 52, capacity: 1200, age: '18+ anni', accessible: true, lineup: [], ticketing_mode: 'partner', partner_url: 'https://partner.example/neon', min_price_cents: 2500, going_count: 800, featured: false },
    { id: 'e3', slug: 'notte-bianca-kalsa', organizer_id: 'org1', title: 'Notte Bianca alla Kalsa', description: 'Festa', category: 'feste', starts_at: iso(-5, 19), ends_at: iso(-4, 2), venue_name: 'Piazza Magione', zone: 'Kalsa', map_x: 70, map_y: 62, capacity: 3000, age: 'Per tutti', accessible: true, lineup: [], ticketing_mode: 'free', min_price_cents: 0, going_count: 2000, featured: false },
    { id: 'e5', slug: 'concerto-stadio', organizer_id: 'org1', title: 'Concerto allo stadio', description: 'Grande evento', category: 'musica', starts_at: iso(20, 21), ends_at: iso(20, 23), venue_name: 'Stadio Barbera', zone: 'Libertà', map_x: 40, map_y: 20, capacity: 30000, age: 'Per tutti', accessible: true, lineup: [], ticketing_mode: 'city_pulse', min_price_cents: 5000, going_count: 900, featured: false, status: 'published', require_phone: true },
    { id: 'e7', slug: 'tutto-esaurito', organizer_id: 'org1', title: 'Concerto al Teatro di Verdura', description: 'Tutto esaurito', category: 'musica', starts_at: iso(4, 21), ends_at: iso(4, 23), venue_name: 'Teatro di Verdura', zone: 'Libertà', map_x: 34, map_y: 24, lat: 38.13, lng: 13.35, capacity: 100, age: 'Per tutti', accessible: true, lineup: [], ticketing_mode: 'city_pulse', min_price_cents: 3000, going_count: 100, featured: false, status: 'published', outdoor: true, seats_left: 0, resale_count: 1 },
    { id: 'e6', slug: 'rinviato', organizer_id: 'org1', title: 'Jazz rinviato', description: '', category: 'musica', starts_at: iso(9, 21), ends_at: iso(9, 23), venue_name: 'Real Teatro Santa Cecilia', zone: 'Vucciria', map_x: 50, map_y: 45, capacity: 300, age: 'Per tutti', accessible: true, lineup: [], ticketing_mode: 'city_pulse', min_price_cents: 2000, going_count: 50, featured: false, status: 'published', postponed_from: iso(2, 21), refund_deadline: iso(14, 0), cancel_reason: 'Maltempo' },
  ],
  events: [{ id: 'e4', slug: 'bozza-jazz', organizer_id: 'org1', title: 'Bozza Jazz', description: '', category: 'musica', starts_at: iso(7, 21), ends_at: iso(7, 23), venue_name: 'Teatro Massimo', zone: 'Centro Storico', map_x: 49, map_y: 50, capacity: 200, age: 'Per tutti', accessible: true, lineup: [], status: 'draft' }],
  ticket_types: [
    { id: 't1', event_id: 'e1', name: 'Ingresso Standard', price_cents: 1800, quantity: 330, sold: 300, reserved: 0, sort: 0, hidden: false, is_addon: false },
    { id: 't2', event_id: 'e1', name: 'Ingresso VIP', price_cents: 3200, quantity: 70, sold: 60, reserved: 0, sort: 1, hidden: false, is_addon: false },
    { id: 't3', event_id: 'e3', name: 'Ingresso libero', price_cents: 0, quantity: 3000, sold: 2000, reserved: 0, sort: 0, hidden: false, is_addon: false },
  ],
  my_tickets: [
    { id: 'k1', code: 'CP-AB12CD34', qr_token: 'CP1.k1.SIGNATURE_TEST_1234', status: 'valid', holder_name: 'Julian Haramis', created_at: iso(-1, 10), event_id: 'e1', ticket_type: 'Ingresso Standard', price_cents: 1800, order_id: 'o1', origin: 'purchase', gift: null, resale: null, dinner: { restaurant: 'Osteria della Cala', title: 'Menu del porto', address: 'Banchina della Cala 8', slot: '19:00', people: 2, code: 'CENA-7F3A21' } },
    { id: 'k3', code: 'CP-JK90LM12', qr_token: 'CP1.k3.SIGNATURE_TEST_9012', status: 'valid', holder_name: 'Julian Haramis', created_at: iso(-1, 10), event_id: 'e1', ticket_type: 'Ingresso Standard', price_cents: 1800, order_id: 'o9', origin: 'purchase', gift: null, resale: null, dinner: null },
    { id: 'k2', code: 'CP-EF56GH78', qr_token: 'CP1.k2.SIGNATURE_TEST_5678', status: 'used', holder_name: 'Julian Haramis', created_at: iso(-7, 10), event_id: 'e3', ticket_type: 'Ingresso libero', price_cents: 0, order_id: 'o2' },
  ],
  favorites: [{ event_id: 'e2' }], going: [{ event_id: 'e1' }],
  profiles: [{ id: 'u1', full_name: 'Julian Haramis', role: 'admin', lang: 'it', prefs: {}, phone: null, phone_verified: false, discoverable: true }],
  refunds: [],
  resale_offers: [{ id: 'l1', event_id: 'e7', ticket_type_id: 't9', ticket_type: 'Platea', price_cents: 3000, reserved_for_waitlist: false, reserved_for_me: false, offered_until: null }],
  reports: [{ id: 'rp1', target_type: 'review', target_id: 'r1', reason: 'spam', details: 'pubblicità', label: 'Recensione di Rosalia T.', status: 'open', created_at: iso(-1, 9) }],
  organizer_members: [{ role: 'owner', organizers: { id: 'org1', name: 'JH STUDIOS Live', verified: true, stripe_ready: false } }],
  staff_tickets: [
    { id: 'k9', code: 'CP-11112222', status: 'valid', holder_name: 'Elena Moretti', event_id: 'e1', ticket_type: 'Ingresso VIP' },
    { id: 'k8', code: 'CP-33334444', status: 'used', checked_in_at: iso(0, 21), holder_name: 'Luca Brambilla', event_id: 'e1', ticket_type: 'Ingresso Standard' },
  ],
  public_reviews: [{ id: 'r1', event_id: 'e3', stars: 5, body: 'Bellissima serata', photos: [], created_at: iso(-3, 10), author: 'Rosalia T.', mine: false }],
  discount_codes: [{ id: 'd1', organizer_id: 'org1', event_id: null, code: 'CITYPULSE10', kind: 'percent', value: 10, max_uses: null, used: 5, valid_until: null, active: true }],
  event_messages: [],
  staff_guest_passes: [{ order_id: 'g1', event_id: 'e1', name: 'Giulia Bianchi', type: 'Guestlist Artista', pax: 2, note: 'Backstage', created_at: iso(0, 20), issued_by: 'Alex', checked_in: true, code: 'CP-GUEST001' }],
};
const RPC = {
  org_event_stats: a => ({ event_id: a.p_event, capacity: 400, tiers: [{ name: 'Ingresso Standard', price_cents: 1800, sold: 300, quantity: 330 }, { name: 'Ingresso VIP', price_cents: 3200, sold: 60, quantity: 70 }], sold: 360, gross_cents: 732000, fee_cents: 36600, checked_in: 210, daily: Array.from({ length: 14 }, (_, i) => ({ day: i, n: 10 + i * 3 })), entries_15m: [] }),
  validate_ticket: a => ({ ok: true, result: 'ok', name: 'Elena Moretti', type: 'Ingresso VIP', code: a.p_token }),
  friends_going: () => [{ user_id: 'f1', full_name: 'Giulia R.' }, { user_id: 'f2', full_name: 'Salvo M.' }],
  issue_guest_pass: a => ({ code: 'CP-NEWPASS1', qr_token: 'CP1.x.y', pax: a.p_pax, name: a.p_name, type: a.p_type }),
  undo_checkin: () => null,
  accept_invites: () => 0,
  team_list: () => [{ user_id: 'u1', full_name: 'Julian Haramis', email: 'julian@jhstudios.it', role: 'owner', gate: 'Gate A', pending: false }, { user_id: null, full_name: null, email: 'staff@x.it', role: 'staff', gate: 'Gate B', pending: true }],
  org_event_insights: () => ({ orders: 40, enough: true, age: { '25-34': 20, '18-24': 12 }, origin: { Kalsa: 10, Estero: 8 }, source: { instagram: 22, whatsapp: 10 }, gates: { 'Gate A': 150, 'Gate B': 60 }, codes: [{ code: 'CITYPULSE10', used: 5, discount_cents: 900 }], report: {} }),
  check_discount: a => ({ valid: a.p_code.toUpperCase() === 'CITYPULSE10', code: 'CITYPULSE10', kind: 'percent', value: 10 }),
  message_attendees: () => 360,
  my_waitlist: () => [],
  join_waitlist: () => ({ position: 4 }), leave_waitlist: () => null,
  list_for_resale: () => ({ id: 'l2', price_cents: 1800 }), cancel_resale: () => null,
  gift_ticket: () => ({ id: 'g1', token: 'tok123', has_account: true }), cancel_gift: () => null, accept_gift: () => 'k9',
  gift_preview: a => a.p_token === 'tok123' ? [{ status: 'pending', from_name: 'Giulia Rossi', message: 'Per te!', event_slug: 'indie-night-castello', event_title: 'Indie Night al Castello', starts_at: iso(3, 21), venue_name: 'Castello a Mare', ticket_type: 'Ingresso Standard', for_me: true }] : [],
  dinner_options: () => [{ offer_id: 'd1', restaurant: 'Osteria della Cala', cuisine: 'Pesce', zone: 'La Cala', address: 'Banchina della Cala 8', title: 'Menu del porto', menu: 'Crudo, spaghetti, sorbetto', price_cents: 3800, walk_min: 6, slot: '19:00:00', seats_left: 8 }, { offer_id: 'd1', restaurant: 'Osteria della Cala', cuisine: 'Pesce', zone: 'La Cala', address: 'Banchina della Cala 8', title: 'Menu del porto', menu: 'Crudo, spaghetti, sorbetto', price_cents: 3800, walk_min: 6, slot: '19:30:00', seats_left: 0 }],
  my_people: () => [{ id: 'p1', full_name: 'Giulia Rossi', i_follow: true, follows_me: true }, { id: 'p2', full_name: 'Federica Sala', i_follow: false, follows_me: true }],
  search_people: a => [{ id: 'p3', full_name: 'Gianluca ' + a.p_q, i_follow: false, follows_me: false }],
  export_my_data: () => ({ profilo: { full_name: 'Julian Haramis' }, email: 'julian@jhstudios.it', biglietti: [] }),
  cancel_event: () => ({ refunds: 360, notified: 300 }),
  reschedule_event: () => ({ notified: 300 }),
  request_refund: () => 'rf1',
  admin_overview: () => ({ organizers_pending: 1, reports_open: 1, events_live: 4, users: 1200, tickets_30d: 3000, gmv_30d_cents: 9000000, revenue_30d_cents: 450000, refunds_pending: 0 }),
  admin_organizers: () => [{ id: 'org7', name: 'Teatro Off Zisa', status: 'pending', created_at: iso(0, 9), owner_name: 'Anna Caruso', owner_email: 'anna@x.it', events: 0 }],
  admin_reviews: () => [{ id: 'r1', event_title: 'Notte Bianca alla Kalsa', author: 'Rosalia T.', stars: 5, body: 'Bellissima serata', hidden: false }],
  admin_set_organizer: () => null, admin_moderate: () => null, admin_set_review: () => null,
};
class Q {
  constructor(t) { this.t = t; this.f = []; this.op = 'select'; this.payload = null; this.one = false; }
  select() { return this } eq(k, v) { this.f.push(r => r[k] === v || r[k] === undefined); return this }
  in(k, v) { this.f.push(r => v.includes(r[k])); return this } gte() { return this } order() { return this } neq() { return this } limit() { return this }
  single() { this.one = true; return this } maybeSingle() { this.one = true; return this }
  insert(p) { this.op = 'insert'; this.payload = p; LOG.push(['insert', this.t, p]); return this }
  update(p) { this.op = 'update'; this.payload = p; LOG.push(['update', this.t, p]); return this }
  delete() { this.op = 'delete'; LOG.push(['delete', this.t]); return this } upsert(p) { this.op = 'upsert'; LOG.push(['upsert', this.t, p]); return this }
  then(res, rej) {
    let data;
    if (this.op === 'insert') data = this.one ? { id: 'new1', ...this.payload } : [{ id: 'new1', ...this.payload }];
    else if (this.op !== 'select') data = this.op === 'delete' ? [{ id: 'x' }] : [];
    else { data = (DB[this.t] || []).filter(r => this.f.every(f => f(r))); if (this.one) data = data[0] || null; }
    return Promise.resolve({ data, error: null }).then(res, rej);
  }
}
export function createClient() {
  return {
    from: t => new Q(t),
    rpc: (n, a) => { LOG.push(['rpc', n, a]); return Promise.resolve({ data: RPC[n] ? RPC[n](a) : null, error: null }) },
    auth: {
      getSession: async () => ({ data: { session: { user: U } } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe() { } } } }),
      signOut: async () => ({}), updateUser: async a => { LOG.push(['updateUser', a]); return { data: {}, error: null } }, verifyOtp: async a => { LOG.push(['verifyOtp', a]); DB.profiles[0].phone_verified = true; DB.profiles[0].phone = a.phone; return { data: {}, error: null } }, signInWithOtp: async (a) => { LOG.push(['otp', a]); return { error: null } }, signInWithOAuth: async a => { LOG.push(['oauth', a]); return {} },
    },
    functions: { invoke: async (n, o) => { LOG.push(['invoke', n, o.body]); try { localStorage.setItem('cp_last_invoke', JSON.stringify([n, o.body])) } catch { } return { data: n === 'create-checkout' ? { url: 'https://checkout.stripe.com/c/test_123' } : { url: 'https://connect.stripe.com/setup/test' }, error: null } } },
    storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: p => ({ data: { publicUrl: 'https://x.supabase.co/storage/' + p } }) }) },
    channel: () => { const c = { on: () => c, subscribe: () => c }; return c; },
  };
}
