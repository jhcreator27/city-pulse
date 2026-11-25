-- =====================================================================
-- CITY PULSE · funzioni per il pubblico
-- 1) Regalare un biglietto
-- 2) Rivendita sicura al prezzo originale
-- 3) Lista d'attesa per gli eventi esauriti
-- 4) Pacchetti cena + evento con i ristoranti vicini
-- 5) Eventi all'aperto (per il meteo, calcolato dall'app)
-- =====================================================================

alter table public.events add column if not exists outdoor boolean not null default false;
alter table public.tickets add column if not exists transferred_from uuid references public.tickets(id);
alter table public.tickets add column if not exists origin text not null default 'purchase' check (origin in ('purchase','gift','resale'));

-- ---------- 1. Regali ----------
create table public.ticket_gifts (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.tickets(id) on delete cascade,
  from_user   uuid not null references public.profiles(id),
  to_email    text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  to_user     uuid references public.profiles(id),
  message     text check (char_length(message) <= 280),
  token       text not null unique default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
  status      text not null default 'pending' check (status in ('pending','accepted','cancelled','expired')),
  new_ticket  uuid references public.tickets(id),
  created_at  timestamptz not null default now(),
  accepted_at timestamptz
);
create unique index ticket_gifts_one_pending on public.ticket_gifts (ticket_id) where status = 'pending';
alter table public.ticket_gifts enable row level security;
create policy tg_select on public.ticket_gifts for select to authenticated using (from_user = auth.uid() or to_user = auth.uid());

-- un biglietto si può regalare o rivendere solo se è valido, dell'utente e per un evento futuro non annullato
create or replace function private.check_transferable(p_ticket uuid) returns tickets
language plpgsql security definer set search_path = public as $$
declare t tickets; ev events;
begin
  select * into t from tickets where id = p_ticket for update;
  if not found or t.user_id <> auth.uid() then raise exception 'Biglietto non trovato'; end if;
  if t.status <> 'valid' then raise exception 'Biglietto non più valido'; end if;
  select * into ev from events where id = t.event_id;
  if ev.status <> 'published' or ev.starts_at <= now() then raise exception 'L''evento è già iniziato o non è più disponibile'; end if;
  if exists (select 1 from ticket_gifts where ticket_id = p_ticket and status = 'pending') then raise exception 'Biglietto già in regalo'; end if;
  if exists (select 1 from resale_listings where ticket_id = p_ticket and status in ('listed','reserved')) then raise exception 'Biglietto in rivendita'; end if;
  return t;
end $$;

create or replace function public.gift_ticket(p_ticket uuid, p_email text, p_message text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t tickets; g ticket_gifts; v_to uuid; ev events;
begin
  t := private.check_transferable(p_ticket);
  if lower(trim(p_email)) = (select lower(email) from auth.users where id = auth.uid()) then raise exception 'Non puoi regalare un biglietto a te stesso'; end if;
  select id into v_to from auth.users where lower(email) = lower(trim(p_email)) limit 1;
  insert into ticket_gifts (ticket_id, from_user, to_email, to_user, message)
  values (p_ticket, auth.uid(), lower(trim(p_email)), v_to, nullif(trim(p_message), '')) returning * into g;
  select * into ev from events where id = t.event_id;
  if v_to is not null then
    insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
    values (v_to, 'gift', 'Hai ricevuto un biglietto in regalo', 'You received a ticket as a gift',
            (select coalesce(full_name, 'Un amico') from profiles where id = auth.uid()) || ' ti regala ' || ev.title, ev.title,
            '/#regalo-' || g.token, 'gift:' || g.id);
  end if;
  return jsonb_build_object('id', g.id, 'token', g.token, 'has_account', v_to is not null);
end $$;
grant execute on function public.gift_ticket(uuid, text, text) to authenticated;

create or replace function public.cancel_gift(p_gift uuid) returns void
language sql security definer set search_path = public as $$
  update ticket_gifts set status = 'cancelled' where id = p_gift and from_user = auth.uid() and status = 'pending';
$$;
grant execute on function public.cancel_gift(uuid) to authenticated;

-- anteprima del regalo per chi apre il link (senza esporre dati del biglietto)
create or replace function public.gift_preview(p_token text)
returns table (status text, from_name text, message text, event_slug text, event_title text, starts_at timestamptz, venue_name text, ticket_type text, for_me boolean)
language sql stable security definer set search_path = public as $$
  select g.status, coalesce(p.full_name, 'Un amico'), g.message, e.slug, e.title, e.starts_at, e.venue_name, tt.name,
         g.to_email = (select lower(email) from auth.users where id = auth.uid())
    from ticket_gifts g join tickets t on t.id = g.ticket_id join events e on e.id = t.event_id
    join ticket_types tt on tt.id = t.ticket_type_id join profiles p on p.id = g.from_user
   where g.token = p_token;
$$;
grant execute on function public.gift_preview(text) to anon, authenticated;

-- accetta: il vecchio QR viene annullato e nasce un biglietto nuovo intestato a chi lo riceve
create or replace function public.accept_gift(p_token text) returns uuid
language plpgsql security definer set search_path = public as $$
declare g ticket_gifts; t tickets; ev events; v_id uuid := gen_random_uuid(); v_me text;
begin
  select * into g from ticket_gifts where token = p_token for update;
  if not found or g.status <> 'pending' then raise exception 'Regalo non più disponibile'; end if;
  select lower(email) into v_me from auth.users where id = auth.uid();
  if v_me is distinct from g.to_email then raise exception 'Questo regalo è per %: accedi con quell''email', g.to_email; end if;
  select * into t from tickets where id = g.ticket_id for update;
  select * into ev from events where id = t.event_id;
  if t.status <> 'valid' or ev.status <> 'published' or ev.starts_at <= now() then
    update ticket_gifts set status = 'expired' where id = g.id; raise exception 'Il biglietto non è più valido';
  end if;
  if ev.require_phone and not coalesce((select phone_verified from profiles where id = auth.uid()), false) then
    raise exception 'Per questo evento serve un numero di cellulare verificato';
  end if;
  update tickets set status = 'void' where id = t.id;
  insert into tickets (id, order_id, event_id, ticket_type_id, user_id, holder_name, code, qr_token, transferred_from, origin)
  values (v_id, t.order_id, t.event_id, t.ticket_type_id, auth.uid(), (select full_name from profiles where id = auth.uid()),
          'CP-' || upper(substr(replace(v_id::text,'-',''), 1, 8)), private.sign_ticket(v_id, t.event_id), t.id, 'gift');
  update ticket_gifts set status = 'accepted', to_user = auth.uid(), accepted_at = now(), new_ticket = v_id where id = g.id;
  insert into going (user_id, event_id) values (auth.uid(), t.event_id) on conflict do nothing;
  insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
  values (g.from_user, 'gift_accepted', 'Regalo accettato', 'Gift accepted', ev.title, ev.title, '/#biglietti', 'giftok:' || g.id);
  return v_id;
end $$;
grant execute on function public.accept_gift(text) to authenticated;

-- ---------- 2. Rivendita sicura ----------
create table public.resale_listings (
  id            uuid primary key default gen_random_uuid(),
  ticket_id     uuid not null references public.tickets(id),
  seller        uuid not null references public.profiles(id),
  event_id      uuid not null references public.events(id),
  ticket_type_id uuid not null references public.ticket_types(id),
  price_cents   int not null check (price_cents > 0),        -- quanto l'ha pagato il venditore: mai di più
  status        text not null default 'listed' check (status in ('listed','reserved','sold','cancelled')),
  buyer_order   uuid references public.orders(id),
  offered_to    uuid references public.profiles(id),          -- priorità a chi è in lista d'attesa
  offered_until timestamptz,
  created_at    timestamptz not null default now(),
  sold_at       timestamptz
);
create unique index resale_one_active on public.resale_listings (ticket_id) where status in ('listed','reserved');
create index resale_event_idx on public.resale_listings (event_id) where status = 'listed';
alter table public.resale_listings enable row level security;
create policy rl_own on public.resale_listings for select to authenticated using (seller = auth.uid() or public.is_admin());

create table public.resale_payouts (
  id           uuid primary key default gen_random_uuid(),
  listing_id   uuid not null unique references public.resale_listings(id),
  order_id     uuid not null references public.orders(id),   -- ordine originale del venditore
  amount_cents int not null,
  status       text not null default 'pending' check (status in ('pending','processing','done','failed')),
  stripe_refund text, error text,
  created_at   timestamptz not null default now(), done_at timestamptz
);
alter table public.resale_payouts enable row level security;
create policy rp_own on public.resale_payouts for select to authenticated using (
  exists (select 1 from resale_listings l where l.id = listing_id and l.seller = auth.uid()) or public.is_admin());

alter table public.orders add column if not exists resale_listing_id uuid references public.resale_listings(id);

-- vista pubblica: quanti biglietti in rivendita e a che prezzo (senza dati del venditore)
create view public.resale_offers with (security_invoker = false) as
select l.id, l.event_id, l.ticket_type_id, tt.name as ticket_type, l.price_cents,
       (l.offered_to is not null and l.offered_until > now()) as reserved_for_waitlist,
       (l.offered_to = auth.uid() and l.offered_until > now()) as reserved_for_me, l.offered_until
  from resale_listings l join ticket_types tt on tt.id = l.ticket_type_id join events e on e.id = l.event_id
 where l.status = 'listed' and e.status = 'published' and e.starts_at > now();
grant select on public.resale_offers to anon, authenticated;

create or replace function public.list_for_resale(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare t tickets; o orders; v_price int; l resale_listings;
begin
  t := private.check_transferable(p_ticket);
  select * into o from orders where id = t.order_id;
  if o.status <> 'paid' or o.user_id <> auth.uid() then raise exception 'Si rivendono solo i biglietti acquistati da te'; end if;
  if coalesce(o.dinner_cents, 0) > 0 then raise exception 'I biglietti del pacchetto cena non si rivendono: puoi regalarli'; end if;
  -- prezzo pagato per quel tipo di biglietto, sconto incluso: mai sopra l'originale
  select round(((i->>'line_cents')::numeric / (i->>'qty')::int) * (1 - o.discount_cents::numeric / nullif(o.subtotal_cents, 0)))::int into v_price
    from jsonb_array_elements(o.items) i where (i->>'ticket_type_id')::uuid = t.ticket_type_id limit 1;
  if coalesce(v_price, 0) <= 0 then raise exception 'Biglietto gratuito: non si rivende'; end if;
  insert into resale_listings (ticket_id, seller, event_id, ticket_type_id, price_cents)
  values (t.id, auth.uid(), t.event_id, t.ticket_type_id, v_price) returning * into l;
  perform public.process_waitlist(t.event_id);
  return jsonb_build_object('id', l.id, 'price_cents', v_price);
end $$;
grant execute on function public.list_for_resale(uuid) to authenticated;

create or replace function public.cancel_resale(p_listing uuid) returns void
language sql security definer set search_path = public as $$
  update resale_listings set status = 'cancelled' where id = p_listing and seller = auth.uid() and status = 'listed';
$$;
grant execute on function public.cancel_resale(uuid) to authenticated;

-- prenota un biglietto in rivendita (chiamata da create-checkout con la service role)
create or replace function public.reserve_resale(p_user uuid, p_listing uuid, p_buyer_name text, p_buyer_email text, p_buyer_phone text, p_booking_fee_cents int default 150)
returns public.orders language plpgsql security definer set search_path = public as $$
declare l resale_listings; o orders; ev events; v_org organizers;
begin
  select * into l from resale_listings where id = p_listing for update;
  if not found or l.status <> 'listed' then raise exception 'Biglietto non più disponibile'; end if;
  if l.seller = p_user then raise exception 'È un tuo biglietto'; end if;
  if l.offered_to is not null and l.offered_until > now() and l.offered_to <> p_user then raise exception 'Riservato a chi è in lista d''attesa: riprova tra poco'; end if;
  select * into ev from events where id = l.event_id and status = 'published' and starts_at > now();
  if not found then raise exception 'Evento non disponibile'; end if;
  select * into v_org from organizers where id = ev.organizer_id;
  -- il posto del venditore passa da "venduto" a "riservato" per chi compra
  update ticket_types set sold = sold - 1, reserved = reserved + 1 where id = l.ticket_type_id;
  insert into orders (kind, user_id, event_id, items, subtotal_cents, booking_fee_cents, total_cents, application_fee_cents,
                      buyer_name, buyer_email, buyer_phone, status, resale_listing_id, source)
  values ('tickets', p_user, l.event_id,
          jsonb_build_array(jsonb_build_object('ticket_type_id', l.ticket_type_id, 'name', (select name from ticket_types where id = l.ticket_type_id), 'qty', 1, 'price_cents', l.price_cents, 'line_cents', l.price_cents, 'resale', true)),
          l.price_cents, p_booking_fee_cents, l.price_cents + p_booking_fee_cents,
          round(l.price_cents * v_org.commission_pct / 100.0)::int + p_booking_fee_cents,
          p_buyer_name, p_buyer_email, p_buyer_phone, 'pending', l.id, 'rivendita')
  returning * into o;
  update resale_listings set status = 'reserved', buyer_order = o.id where id = l.id;
  return o;
end $$;
revoke execute on function public.reserve_resale(uuid, uuid, text, text, text, int) from public, anon, authenticated;

-- quando l'ordine di rivendita è pagato: il QR del venditore si annulla, il venditore viene rimborsato
create or replace function private.on_order_status() returns trigger language plpgsql security definer set search_path = public as $$
declare l resale_listings; t tickets;
begin
  if new.status = old.status then return new; end if;
  -- rivendita
  if new.resale_listing_id is not null then
    select * into l from resale_listings where id = new.resale_listing_id for update;
    if new.status = 'paid' and l.status = 'reserved' then
      select * into t from tickets where id = l.ticket_id for update;
      update tickets set status = 'void' where id = t.id and status = 'valid';
      update tickets set origin = 'resale', transferred_from = t.id where order_id = new.id;
      update resale_listings set status = 'sold', sold_at = now() where id = l.id;
      insert into resale_payouts (listing_id, order_id, amount_cents) values (l.id, t.order_id, l.price_cents);
      insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
      values (l.seller, 'resale_sold', 'Biglietto rivenduto', 'Ticket resold',
              'Ti rimborsiamo € ' || to_char(l.price_cents / 100.0, 'FM999990D00') || ' sul metodo di pagamento usato.',
              'We are refunding € ' || to_char(l.price_cents / 100.0, 'FM999990D00') || ' to your payment method.', '/#biglietti', 'sold:' || l.id);
      update waitlist set status = 'converted' where event_id = new.event_id and user_id = new.user_id and status in ('waiting','offered');
    elsif new.status in ('expired','failed') and l.status = 'reserved' then
      update resale_listings set status = 'listed', buyer_order = null where id = l.id;
      update ticket_types set sold = sold + 1 where id = l.ticket_type_id;   -- il posto torna al venditore
    end if;
  end if;
  -- pacchetto cena
  if new.status in ('paid','free') then update dinner_bookings set status = 'valid' where order_id = new.id and status = 'pending';
  elsif new.status in ('expired','failed','refunded') then update dinner_bookings set status = 'void' where order_id = new.id and status in ('pending','valid');
  end if;
  return new;
end $$;
create trigger orders_status_after after update of status on public.orders for each row execute function private.on_order_status();

-- rimborso completo: si scalano solo i biglietti davvero annullati (alcuni potrebbero essere già stati rivenduti o regalati)
create or replace function public.refund_order(p_payment_intent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order orders; r record;
begin
  select * into v_order from orders where stripe_payment_intent = p_payment_intent for update;
  if not found or v_order.status <> 'paid' then return; end if;
  for r in update tickets set status = 'void' where order_id = v_order.id and status = 'valid' returning ticket_type_id loop
    update ticket_types set sold = greatest(sold - 1, 0) where id = r.ticket_type_id;
  end loop;
  update orders set status = 'refunded' where id = v_order.id;
end $$;
revoke execute on function public.refund_order(text) from public, anon, authenticated;

create or replace function public.take_resale_payouts(p_limit int default 50)
returns table (payout_id uuid, order_id uuid, payment_intent text, amount_cents int)
language sql security definer set search_path = public as $$
  update resale_payouts p set status = 'processing'
   where p.id in (select id from resale_payouts where status = 'pending' order by created_at limit p_limit for update skip locked)
  returning p.id, p.order_id, (select stripe_payment_intent from orders o where o.id = p.order_id), p.amount_cents;
$$;
revoke execute on function public.take_resale_payouts(int) from public, anon, authenticated;

-- ---------- 3. Lista d'attesa ----------
create table public.waitlist (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  qty         int not null default 1 check (qty between 1 and 4),
  status      text not null default 'waiting' check (status in ('waiting','offered','notified','converted','left','expired')),
  offered_until timestamptz,
  created_at  timestamptz not null default now(),
  unique (event_id, user_id)
);
alter table public.waitlist enable row level security;
create policy wl_own on public.waitlist for select to authenticated using (user_id = auth.uid() or public.is_admin()
  or exists (select 1 from events e where e.id = event_id and public.can_manage_org(e.organizer_id)));

create or replace function private.seats_left(p_event uuid) returns int language sql stable security definer set search_path = public as $$
  select greatest(e.capacity - coalesce((select sum(sold + reserved) from ticket_types where event_id = e.id and not is_addon), 0), 0)::int from events e where e.id = p_event;
$$;

create or replace function public.join_waitlist(p_event uuid, p_qty int default 1) returns jsonb
language plpgsql security definer set search_path = public as $$
declare ev events; v_pos int;
begin
  select * into ev from events where id = p_event and status = 'published' and starts_at > now();
  if not found then raise exception 'Evento non disponibile'; end if;
  if private.seats_left(p_event) > 0 then raise exception 'Ci sono ancora posti: puoi comprare subito'; end if;
  insert into waitlist (event_id, user_id, qty) values (p_event, auth.uid(), least(greatest(p_qty, 1), 4))
  on conflict (event_id, user_id) do update set status = 'waiting', qty = excluded.qty, offered_until = null
    where waitlist.status in ('left','expired');
  select count(*) into v_pos from waitlist w where w.event_id = p_event and w.status in ('waiting','offered')
     and w.created_at <= (select created_at from waitlist where event_id = p_event and user_id = auth.uid());
  return jsonb_build_object('position', v_pos);
end $$;
grant execute on function public.join_waitlist(uuid, int) to authenticated;

create or replace function public.leave_waitlist(p_event uuid) returns void
language sql security definer set search_path = public as $$
  update waitlist set status = 'left' where event_id = p_event and user_id = auth.uid() and status in ('waiting','offered','notified');
  update resale_listings set offered_to = null, offered_until = null where event_id = p_event and offered_to = auth.uid() and status = 'listed';
$$;
grant execute on function public.leave_waitlist(uuid) to authenticated;

create or replace function public.my_waitlist() returns table (event_id uuid, qty int, status text, queue_pos int, offered_until timestamptz)
language sql stable security definer set search_path = public as $$
  select w.event_id, w.qty, w.status,
         (select count(*)::int from waitlist x where x.event_id = w.event_id and x.status in ('waiting','offered') and x.created_at <= w.created_at),
         w.offered_until
    from waitlist w where w.user_id = auth.uid() and w.status in ('waiting','offered','notified');
$$;
grant execute on function public.my_waitlist() to authenticated;

-- assegna le offerte: ogni biglietto in rivendita va per 30 minuti al primo in fila; se si liberano posti, avvisa i primi
create or replace function public.process_waitlist(p_event uuid default null) returns int
language plpgsql security definer set search_path = public as $$
declare l resale_listings; w waitlist; n int := 0; ev record; free int;
begin
  -- offerte scadute: la persona perde il turno e passa in fondo come "scaduta"
  update waitlist set status = 'expired' where status = 'offered' and offered_until < now() and (p_event is null or event_id = p_event);
  update resale_listings set offered_to = null, offered_until = null
   where status = 'listed' and offered_until < now() and (p_event is null or event_id = p_event);
  for l in select * from resale_listings where status = 'listed' and offered_to is null and (p_event is null or event_id = p_event) order by created_at for update skip locked loop
    select * into w from waitlist where event_id = l.event_id and status = 'waiting' order by created_at limit 1 for update skip locked;
    exit when not found;
    update resale_listings set offered_to = w.user_id, offered_until = now() + interval '30 minutes' where id = l.id;
    update waitlist set status = 'offered', offered_until = now() + interval '30 minutes' where id = w.id;
    insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
    select w.user_id, 'waitlist_offer', 'Si è liberato un posto!', 'A seat is free!',
           e.title || ': è riservato a te per 30 minuti.', coalesce(e.title_en, e.title) || ': reserved for you for 30 minutes.',
           '/#evento-' || coalesce(e.slug, e.id::text), 'offer:' || l.id || ':' || w.user_id from events e where e.id = l.event_id;
    n := n + 1;
  end loop;
  -- posti liberati da ordini scaduti o rimborsi: avviso ai primi in fila (chi arriva prima compra)
  for ev in select e.id, e.slug, e.title, e.title_en from events e where e.status = 'published' and e.starts_at > now() and (p_event is null or e.id = p_event)
             and exists (select 1 from waitlist where event_id = e.id and status = 'waiting') loop
    free := private.seats_left(ev.id);
    continue when free = 0;
    for w in select * from waitlist where event_id = ev.id and status = 'waiting' order by created_at limit free for update skip locked loop
      update waitlist set status = 'notified' where id = w.id;
      insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
      values (w.user_id, 'waitlist_free', 'Posti di nuovo disponibili', 'Tickets available again', ev.title || ': corri, sono pochi.', coalesce(ev.title_en, ev.title) || ': hurry, only a few.',
              '/#evento-' || coalesce(ev.slug, ev.id::text), 'free:' || ev.id || ':' || w.user_id || ':' || current_date);
      n := n + 1;
    end loop;
  end loop;
  return n;
end $$;
revoke execute on function public.process_waitlist(uuid) from public, anon;

create or replace function public.org_waitlist(p_event uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not exists (select 1 from events e where e.id = p_event and public.can_manage_org(e.organizer_id)) then raise exception 'Non autorizzato'; end if;
  return jsonb_build_object('people', (select count(*) from waitlist where event_id = p_event and status in ('waiting','offered')),
                            'tickets', (select coalesce(sum(qty),0) from waitlist where event_id = p_event and status in ('waiting','offered')),
                            'resale_listed', (select count(*) from resale_listings where event_id = p_event and status = 'listed'),
                            'resale_sold', (select count(*) from resale_listings where event_id = p_event and status = 'sold'));
end $$;
grant execute on function public.org_waitlist(uuid) to authenticated;

-- ---------- 4. Pacchetti cena + evento ----------
alter table public.organizers add column if not exists kind text not null default 'events' check (kind in ('events','restaurant'));

create table public.restaurants (
  id           uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers(id) on delete cascade,  -- il ristorante incassa sul suo conto Stripe
  name         text not null,
  cuisine      text,
  zone         text,
  address      text,
  lat double precision, lng double precision,
  map_x numeric, map_y numeric,
  photo_url    text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create table public.dinner_offers (
  id            uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null references public.restaurants(id) on delete cascade,
  title         text not null,                 -- es. "Menu pre-concerto"
  menu          text not null,                 -- portate
  price_cents   int not null check (price_cents > 0),   -- a persona, bevande come indicato nel menu
  slots         text[] not null default '{19:00,19:30,20:00}',
  seats_per_slot int not null default 20,
  active        boolean not null default true
);
create table public.dinner_bookings (
  id         uuid primary key default gen_random_uuid(),
  order_id   uuid not null references public.orders(id) on delete cascade,
  offer_id   uuid not null references public.dinner_offers(id),
  event_id   uuid not null references public.events(id),
  day        date not null,
  slot       text not null,
  people     int not null check (people between 1 and 10),
  price_cents int not null,
  code       text not null unique default 'CENA-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  status     text not null default 'pending' check (status in ('pending','valid','used','void')),
  created_at timestamptz not null default now()
);
alter table public.restaurants enable row level security;
alter table public.dinner_offers enable row level security;
alter table public.dinner_bookings enable row level security;
create policy rs_read on public.restaurants for select using (active);
create policy rs_manage on public.restaurants for all to authenticated using (public.can_manage_org(organizer_id)) with check (public.can_manage_org(organizer_id));
create policy do_read on public.dinner_offers for select using (active);
create policy do_manage on public.dinner_offers for all to authenticated
  using (exists (select 1 from restaurants r where r.id = restaurant_id and public.can_manage_org(r.organizer_id)))
  with check (exists (select 1 from restaurants r where r.id = restaurant_id and public.can_manage_org(r.organizer_id)));
create policy db_read on public.dinner_bookings for select to authenticated using (
  exists (select 1 from orders o where o.id = order_id and o.user_id = auth.uid())
  or exists (select 1 from dinner_offers d join restaurants r on r.id = d.restaurant_id where d.id = offer_id and public.can_manage_org(r.organizer_id)));

alter table public.orders add column if not exists dinner_cents int not null default 0;
alter table public.orders add column if not exists dinner_fee_cents int not null default 0;
alter table public.orders add column if not exists stripe_transfers jsonb;

-- ristoranti entro ~1,5 km dal luogo dell'evento, con i posti liberi per ogni orario prima dell'inizio
create or replace function public.dinner_options(p_event uuid)
returns table (offer_id uuid, restaurant text, cuisine text, zone text, address text, title text, menu text, price_cents int, walk_min int, slot text, seats_left int)
language sql stable security definer set search_path = public as $$
  with ev as (select * from events where id = p_event),
  near as (
    select d.*, r.name, r.cuisine, r.zone as rzone, r.address as raddr,
           case when r.lat is not null and ev.lat is not null
                then 2 * 6371000 * asin(sqrt(power(sin(radians(r.lat - ev.lat) / 2), 2) + cos(radians(ev.lat)) * cos(radians(r.lat)) * power(sin(radians(r.lng - ev.lng) / 2), 2)))
                else case when r.zone = ev.zone then 600 else null end end as meters
      from dinner_offers d join restaurants r on r.id = d.restaurant_id join organizers o on o.id = r.organizer_id, ev
     where d.active and r.active and o.status = 'approved' and o.stripe_ready
  )
  select n.id, n.name, n.cuisine, n.rzone, n.raddr, n.title, n.menu, n.price_cents, greatest(2, round(n.meters / 80))::int, s.slot,
         (n.seats_per_slot - coalesce((select sum(b.people) from dinner_bookings b where b.offer_id = n.id and b.day = (ev.starts_at at time zone 'Europe/Rome')::date and b.slot = s.slot and b.status in ('pending','valid','used')), 0))::int
    from near n, ev, unnest(n.slots) as s(slot)
   where n.meters <= 1500
     and (s.slot)::time <= ((ev.starts_at at time zone 'Europe/Rome')::time - interval '75 minutes')
   order by n.meters, n.name, s.slot;
$$;
grant execute on function public.dinner_options(uuid) to anon, authenticated;

-- aggiunge la cena a un ordine appena prenotato (chiamata da create-checkout)
create or replace function public.add_dinner(p_order uuid, p_offer uuid, p_slot text, p_people int)
returns public.orders language plpgsql security definer set search_path = public as $$
declare o orders; d dinner_offers; ev events; v_left int; v_cents int; v_fee int; v_org organizers;
begin
  select * into o from orders where id = p_order and status = 'pending' for update;
  if not found then raise exception 'Ordine non valido'; end if;
  if o.resale_listing_id is not null then raise exception 'La cena si aggiunge solo ai biglietti nuovi'; end if;
  select * into ev from events where id = o.event_id;
  select * into d from dinner_offers where id = p_offer and active for update;
  if not found or not (p_slot = any (d.slots)) then raise exception 'Orario non disponibile'; end if;
  select seats_left into v_left from public.dinner_options(o.event_id) x where x.offer_id = p_offer and x.slot = p_slot;
  if v_left is null then raise exception 'Questo ristorante non è disponibile per l''evento'; end if;
  if p_people < 1 or p_people > least(v_left, 10) then raise exception 'Posti a tavola esauriti per le %', p_slot; end if;
  select org.* into v_org from organizers org join restaurants r on r.organizer_id = org.id where r.id = d.restaurant_id;
  v_cents := d.price_cents * p_people;
  v_fee := round(v_cents * v_org.commission_pct / 100.0)::int;
  insert into dinner_bookings (order_id, offer_id, event_id, day, slot, people, price_cents)
  values (o.id, d.id, o.event_id, (ev.starts_at at time zone 'Europe/Rome')::date, p_slot, p_people, v_cents);
  update orders set dinner_cents = v_cents, dinner_fee_cents = v_fee,
                    booking_fee_cents = case when booking_fee_cents = 0 then 150 else booking_fee_cents end,
                    total_cents = total_cents + v_cents + case when booking_fee_cents = 0 then 150 else 0 end,
                    application_fee_cents = application_fee_cents + v_fee + case when booking_fee_cents = 0 then 150 else 0 end
   where id = o.id returning * into o;
  return o;
end $$;
revoke execute on function public.add_dinner(uuid, uuid, text, int) from public, anon, authenticated;

-- il ristorante segna il tavolo come arrivato
create or replace function public.use_dinner(p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b dinner_bookings;
begin
  select bk.* into b from dinner_bookings bk join dinner_offers d on d.id = bk.offer_id join restaurants r on r.id = d.restaurant_id
   where bk.code = upper(trim(p_code)) and public.can_manage_org(r.organizer_id) for update of bk;
  if not found then raise exception 'Prenotazione non trovata'; end if;
  if b.status <> 'valid' then raise exception 'Prenotazione già usata o annullata'; end if;
  update dinner_bookings set status = 'used' where id = b.id;
  return jsonb_build_object('people', b.people, 'slot', b.slot);
end $$;
grant execute on function public.use_dinner(text) to authenticated;

-- ---------- biglietti dell'utente con regali, rivendita e cena ----------
drop view if exists public.my_tickets;
create view public.my_tickets as
select t.id, t.code, t.qr_token, t.status, t.checked_in_at, t.holder_name, t.created_at, t.origin,
       t.event_id, tt.name as ticket_type, tt.price_cents, o.id as order_id, o.status as order_status,
       (select jsonb_build_object('id', g.id, 'to', g.to_email, 'token', g.token) from ticket_gifts g where g.ticket_id = t.id and g.status = 'pending') as gift,
       (select jsonb_build_object('id', l.id, 'price_cents', l.price_cents, 'status', l.status) from resale_listings l where l.ticket_id = t.id and l.status in ('listed','reserved','sold') order by l.created_at desc limit 1) as resale,
       (select jsonb_build_object('restaurant', r.name, 'address', r.address, 'slot', b.slot, 'people', b.people, 'code', b.code, 'status', b.status, 'title', d.title)
          from dinner_bookings b join dinner_offers d on d.id = b.offer_id join restaurants r on r.id = d.restaurant_id
         where b.order_id = o.id and b.status <> 'void' and t.origin = 'purchase' limit 1) as dinner
from tickets t join ticket_types tt on tt.id = t.ticket_type_id join orders o on o.id = t.order_id
where t.user_id = auth.uid();
grant select on public.my_tickets to authenticated;

-- la vista pubblica degli eventi espone anche "all'aperto"
drop view if exists public.public_events;
create view public.public_events with (security_invoker = true) as
select e.id, e.slug, e.title, e.title_en, e.description, e.description_en, e.category,
       e.starts_at, e.ends_at, e.venue_name, e.zone, e.address, e.map_x, e.map_y, e.lat, e.lng,
       e.cover_url, e.capacity, e.age, e.accessible, e.lineup, e.ticketing_mode, e.partner_url,
       e.status, e.cancel_reason, e.postponed_from, e.refund_deadline, e.require_phone, e.outdoor,
       e.organizer_id, o.name as organizer_name, o.verified as organizer_verified,
       coalesce((select min(tt.price_cents) from ticket_types tt where tt.event_id = e.id and not tt.is_addon and not tt.hidden), 0) as min_price_cents,
       greatest(e.capacity - coalesce((select sum(tt.sold + tt.reserved) from ticket_types tt where tt.event_id = e.id and not tt.is_addon), 0), 0) as seats_left,
       exists (select 1 from promotions p where p.event_id = e.id and now() between p.starts_at and p.ends_at) as featured,
       (select count(*) from going g where g.event_id = e.id) as going_count,
       (select count(*) from resale_listings l where l.event_id = e.id and l.status = 'listed')::int as resale_count
from events e join organizers o on o.id = e.organizer_id
where e.status in ('published','cancelled') and o.status = 'approved';
grant select on public.public_events to anon, authenticated;
