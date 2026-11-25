-- =====================================================================
-- CITY PULSE · schema di produzione (Supabase / Postgres 15+)
-- Una produzione JH STUDIOS
--
-- Contiene: profili e ruoli, organizzatori, eventi, tipi di biglietto,
-- ordini, biglietti con QR firmato, check-in, preferiti, "Ci vado",
-- amici, recensioni verificate, promozioni a pagamento, notifiche push.
-- Tutte le tabelle hanno Row Level Security attiva.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------
-- Segreti privati (mai esposti alle API)
-- ---------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

create table if not exists private.app_secrets (
  key   text primary key,
  value text not null
);
-- Chiave per firmare i QR dei biglietti: generata una sola volta.
insert into private.app_secrets (key, value)
values ('ticket_hmac_key', encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Profili e ruoli
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  avatar_url  text,
  lang        text not null default 'it' check (lang in ('it','en')),
  role        text not null default 'user' check (role in ('user','organizer','staff','admin')),
  prefs       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Crea il profilo quando un utente si registra (email, Google o Apple)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Un utente non può promuovere se stesso: il ruolo lo cambia solo un admin
create or replace function public.protect_role()
returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_admin() and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Non puoi modificare il tuo ruolo';
  end if;
  return new;
end $$;

-- ---------------------------------------------------------------------
-- Organizzatori e membri (owner / manager / staff ai varchi)
-- ---------------------------------------------------------------------
create table public.organizers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  slug               text unique,
  owner_id           uuid not null references public.profiles(id),
  verified           boolean not null default false,
  stripe_account_id  text unique,
  stripe_ready       boolean not null default false,
  commission_pct     numeric(5,2) not null default 5.00,
  created_at         timestamptz not null default now()
);

create table public.organizer_members (
  organizer_id uuid references public.organizers(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete cascade,
  role         text not null check (role in ('owner','manager','staff')),
  primary key (organizer_id, user_id)
);

-- ---------------------------------------------------------------------
-- Eventi e biglietti
-- ---------------------------------------------------------------------
create table public.events (
  id              uuid primary key default gen_random_uuid(),
  organizer_id    uuid not null references public.organizers(id) on delete cascade,
  slug            text unique,
  title           text not null check (char_length(title) between 2 and 90),
  title_en        text,
  description     text,
  description_en  text,
  category        text not null check (category in ('musica','teatro','food','feste','movida','mostre','sport')),
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  venue_name      text not null,
  zone            text,
  address         text,
  map_x           numeric(5,2),          -- posizione sulla mappa disegnata (0-100)
  map_y           numeric(5,2),
  lat             double precision,
  lng             double precision,
  cover_url       text,
  capacity        int not null check (capacity > 0),
  age             text not null default 'Per tutti',
  accessible      boolean not null default false,
  lineup          jsonb not null default '[]'::jsonb,   -- [{time,label,name,genre,main}]
  status          text not null default 'draft' check (status in ('draft','published','cancelled')),
  ticketing_mode  text not null default 'city_pulse' check (ticketing_mode in ('city_pulse','partner','free')),
  partner_url     text,                                  -- link al partner certificato se ticketing_mode = 'partner'
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index events_starts_idx on public.events (starts_at) where status = 'published';

create table public.ticket_types (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  name         text not null,
  description  text,
  price_cents  int not null default 0 check (price_cents >= 0),
  quantity     int not null check (quantity >= 0),
  reserved     int not null default 0,   -- in checkout, non ancora pagati
  sold         int not null default 0,
  max_per_order int not null default 4,
  is_addon     boolean not null default false,   -- es. token drink: non conta come ingresso
  hidden       boolean not null default false,   -- es. accrediti staff: non in vendita
  sort         int not null default 0,
  check (reserved >= 0 and sold >= 0 and reserved + sold <= quantity)
);

create table public.orders (
  id                    uuid primary key default gen_random_uuid(),
  kind                  text not null default 'tickets' check (kind in ('tickets','promotion')),
  user_id               uuid not null references public.profiles(id),
  event_id              uuid not null references public.events(id),
  status                text not null default 'pending' check (status in ('pending','paid','free','expired','refunded','failed')),
  items                 jsonb not null default '[]'::jsonb,   -- [{ticket_type_id,name,qty,price_cents}]
  subtotal_cents        int not null default 0,
  booking_fee_cents     int not null default 0,
  discount_cents        int not null default 0,
  total_cents           int not null default 0,
  application_fee_cents int not null default 0,              -- quota City Pulse
  promo_package         text,
  buyer_name            text,
  buyer_email           text,
  buyer_phone           text,
  stripe_session_id     text unique,
  stripe_payment_intent text,
  expires_at            timestamptz not null default now() + interval '15 minutes',
  created_at            timestamptz not null default now(),
  paid_at               timestamptz
);
create index orders_user_idx on public.orders (user_id);

create table public.tickets (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references public.orders(id) on delete cascade,
  event_id        uuid not null references public.events(id),
  ticket_type_id  uuid not null references public.ticket_types(id),
  user_id         uuid not null references public.profiles(id),
  holder_name     text,
  code            text not null unique,                       -- codice umano #CP-XXXXX
  qr_token        text not null unique,                       -- contenuto del QR, firmato HMAC
  status          text not null default 'valid' check (status in ('valid','used','void')),
  checked_in_at   timestamptz,
  checked_in_by   uuid references public.profiles(id),
  gate            text,
  created_at      timestamptz not null default now()
);
create index tickets_event_idx on public.tickets (event_id);
create index tickets_user_idx on public.tickets (user_id);

create table public.checkins (
  id          bigint generated always as identity primary key,
  ticket_id   uuid references public.tickets(id),
  event_id    uuid not null references public.events(id),
  scanned_by  uuid references public.profiles(id),
  gate        text,
  method      text not null default 'qr' check (method in ('qr','pin','manual')),
  result      text not null check (result in ('ok','already_used','invalid','wrong_event','void','undo')),
  created_at  timestamptz not null default now()
);
create index checkins_event_idx on public.checkins (event_id, created_at);

-- ---------------------------------------------------------------------
-- Social, preferiti, recensioni, promozioni, push
-- ---------------------------------------------------------------------
create table public.favorites (
  user_id  uuid references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

create table public.going (
  user_id  uuid references public.profiles(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);

-- Amicizia = due persone che si seguono a vicenda
create table public.follows (
  follower_id uuid references public.profiles(id) on delete cascade,
  followee_id uuid references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);

create table public.reviews (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  stars      int not null check (stars between 1 and 5),
  body       text check (char_length(body) <= 600),
  photos     text[] not null default '{}' check (cardinality(photos) <= 3),
  hidden     boolean not null default false,          -- moderazione
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

create table public.promotions (
  id           uuid primary key default gen_random_uuid(),
  event_id     uuid not null references public.events(id) on delete cascade,
  organizer_id uuid not null references public.organizers(id) on delete cascade,
  order_id     uuid references public.orders(id),
  package      text not null check (package in ('boost','weekend','premium')),
  starts_at    timestamptz not null default now(),
  ends_at      timestamptz not null,
  price_cents  int not null,
  created_at   timestamptz not null default now()
);

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  lang       text not null default 'it',
  created_at timestamptz not null default now()
);

create table public.notification_log (
  id         bigint generated always as identity primary key,
  ticket_id  uuid references public.tickets(id) on delete cascade,
  kind       text not null,
  sent_at    timestamptz not null default now(),
  unique (ticket_id, kind)
);

-- ---------------------------------------------------------------------
-- Funzioni di supporto per i permessi
-- ---------------------------------------------------------------------
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.org_role(p_org uuid) returns text
language sql stable security definer set search_path = public as $$
  select role from organizer_members where organizer_id = p_org and user_id = auth.uid();
$$;

create or replace function public.can_manage_org(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or coalesce(public.org_role(p_org) in ('owner','manager'), false);
$$;

create or replace function public.can_scan_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (
    select 1 from events e join organizer_members m on m.organizer_id = e.organizer_id
    where e.id = p_event and m.user_id = auth.uid());
$$;

create trigger profiles_protect_role before update on public.profiles
for each row execute function public.protect_role();

create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger events_touch before update on public.events
for each row execute function public.touch_updated_at();

-- Il proprietario diventa membro "owner" e il suo profilo passa a organizer
create or replace function public.organizer_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into organizer_members (organizer_id, user_id, role) values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  update profiles set role = 'organizer' where id = new.owner_id and role = 'user';
  return new;
end $$;
create trigger organizers_after_insert after insert on public.organizers
for each row execute function public.organizer_after_insert();

-- ---------------------------------------------------------------------
-- QR firmato: "CP1.<ticket_id>.<firma>" (HMAC-SHA256, 22 caratteri)
-- ---------------------------------------------------------------------
create or replace function private.sign_ticket(p_ticket uuid, p_event uuid) returns text
language sql stable security definer set search_path = private, extensions as $$
  select 'CP1.' || p_ticket::text || '.' ||
         left(translate(encode(hmac(p_ticket::text || ':' || p_event::text,
              (select value from private.app_secrets where key = 'ticket_hmac_key'), 'sha256'), 'base64'), '+/=', '-_'), 22);
$$;

-- ---------------------------------------------------------------------
-- Ordini: prenotazione posti, emissione, scadenza (chiamate dal server)
-- ---------------------------------------------------------------------
-- Riserva i posti in modo atomico. Chiamata dalla edge function create-checkout
-- con la service role. Restituisce l'ordine creato.
create or replace function public.reserve_order(
  p_user uuid, p_event uuid, p_items jsonb,
  p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_booking_fee_cents int default 150
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_event events;
  v_org organizers;
  v_item jsonb;
  v_tt ticket_types;
  v_qty int;
  v_items jsonb := '[]'::jsonb;
  v_sub int := 0;
  v_count int := 0;
  v_order orders;
begin
  select * into v_event from events where id = p_event and status = 'published' and ends_at > now();
  if not found then raise exception 'Evento non disponibile'; end if;
  if v_event.ticketing_mode = 'partner' then raise exception 'Biglietti venduti dal partner'; end if;
  select * into v_org from organizers where id = v_event.organizer_id;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := (v_item->>'qty')::int;
    if v_qty is null or v_qty <= 0 then continue; end if;
    select * into v_tt from ticket_types where id = (v_item->>'ticket_type_id')::uuid and event_id = p_event and not hidden for update;
    if not found then raise exception 'Tipo di biglietto non valido'; end if;
    if v_qty > v_tt.max_per_order then raise exception 'Massimo % biglietti per tipo', v_tt.max_per_order; end if;
    if v_tt.sold + v_tt.reserved + v_qty > v_tt.quantity then raise exception 'Posti esauriti per %', v_tt.name; end if;
    if not v_tt.is_addon and (select coalesce(sum(sold + reserved),0) from ticket_types where event_id = p_event and not is_addon) + v_qty > v_event.capacity then
      raise exception 'Evento al completo';
    end if;
    update ticket_types set reserved = reserved + v_qty where id = v_tt.id;
    v_items := v_items || jsonb_build_object('ticket_type_id', v_tt.id, 'name', v_tt.name, 'qty', v_qty, 'price_cents', v_tt.price_cents);
    v_sub := v_sub + v_qty * v_tt.price_cents;
    v_count := v_count + v_qty;
  end loop;

  if v_count = 0 then raise exception 'Nessun biglietto selezionato'; end if;
  if v_count > 10 then raise exception 'Massimo 10 biglietti per ordine'; end if;

  insert into orders (kind, user_id, event_id, items, subtotal_cents, booking_fee_cents, total_cents,
                      application_fee_cents, buyer_name, buyer_email, buyer_phone, status)
  values ('tickets', p_user, p_event, v_items, v_sub,
          case when v_sub > 0 then p_booking_fee_cents else 0 end,
          v_sub + case when v_sub > 0 then p_booking_fee_cents else 0 end,
          case when v_sub > 0 then round(v_sub * v_org.commission_pct / 100.0)::int + p_booking_fee_cents else 0 end,
          p_buyer_name, p_buyer_email, p_buyer_phone, 'pending')
  returning * into v_order;
  return v_order;
end $$;

-- Pagamento confermato (webhook Stripe) o evento gratuito: emette i biglietti.
-- Idempotente: se l'ordine è già pagato non fa nulla.
create or replace function public.complete_order(p_order uuid, p_payment_intent text default null, p_free boolean default false)
returns int
language plpgsql security definer set search_path = public as $$
declare
  v_order orders;
  v_item jsonb;
  v_i int;
  v_tid uuid;
  v_n int := 0;
begin
  select * into v_order from orders where id = p_order for update;
  if not found then raise exception 'Ordine inesistente'; end if;
  if v_order.status in ('paid','free') then return 0; end if;
  if v_order.status <> 'pending' then raise exception 'Ordine non più valido (%)', v_order.status; end if;

  if v_order.kind = 'promotion' then
    update orders set status = 'paid', paid_at = now(), stripe_payment_intent = p_payment_intent where id = p_order;
    insert into promotions (event_id, organizer_id, order_id, package, ends_at, price_cents)
    select v_order.event_id, e.organizer_id, v_order.id, v_order.promo_package,
           now() + case v_order.promo_package when 'boost' then interval '1 day' when 'weekend' then interval '3 days' else interval '7 days' end,
           v_order.total_cents
    from events e where e.id = v_order.event_id;
    return 1;
  end if;

  for v_item in select * from jsonb_array_elements(v_order.items) loop
    update ticket_types
       set reserved = greatest(reserved - (v_item->>'qty')::int, 0),
           sold = sold + (v_item->>'qty')::int
     where id = (v_item->>'ticket_type_id')::uuid;
    for v_i in 1..(v_item->>'qty')::int loop
      v_tid := gen_random_uuid();
      insert into tickets (id, order_id, event_id, ticket_type_id, user_id, holder_name, code, qr_token)
      values (v_tid, v_order.id, v_order.event_id, (v_item->>'ticket_type_id')::uuid, v_order.user_id,
              v_order.buyer_name,
              'CP-' || upper(substr(replace(v_tid::text,'-',''), 1, 8)),
              private.sign_ticket(v_tid, v_order.event_id));
      v_n := v_n + 1;
    end loop;
  end loop;

  update orders set status = case when p_free then 'free' else 'paid' end,
                    paid_at = now(), stripe_payment_intent = p_payment_intent
   where id = p_order;
  -- Chi compra un biglietto "ci va"
  insert into going (user_id, event_id) values (v_order.user_id, v_order.event_id) on conflict do nothing;
  return v_n;
end $$;

-- Checkout scaduto o pagamento fallito: libera i posti
create or replace function public.cancel_order(p_order uuid, p_status text default 'expired')
returns void language plpgsql security definer set search_path = public as $$
declare v_order orders; v_item jsonb;
begin
  select * into v_order from orders where id = p_order for update;
  if not found or v_order.status <> 'pending' then return; end if;
  if v_order.kind = 'tickets' then
    for v_item in select * from jsonb_array_elements(v_order.items) loop
      update ticket_types set reserved = greatest(reserved - (v_item->>'qty')::int, 0)
       where id = (v_item->>'ticket_type_id')::uuid;
    end loop;
  end if;
  update orders set status = p_status where id = p_order;
end $$;

-- Rimborso: annulla i biglietti dell'ordine
create or replace function public.refund_order(p_payment_intent text)
returns void language plpgsql security definer set search_path = public as $$
declare v_order orders; v_item jsonb;
begin
  select * into v_order from orders where stripe_payment_intent = p_payment_intent for update;
  if not found or v_order.status <> 'paid' then return; end if;
  update tickets set status = 'void' where order_id = v_order.id and status = 'valid';
  for v_item in select * from jsonb_array_elements(v_order.items) loop
    update ticket_types set sold = greatest(sold - (v_item->>'qty')::int, 0) where id = (v_item->>'ticket_type_id')::uuid;
  end loop;
  update orders set status = 'refunded' where id = v_order.id;
end $$;

-- Pulizia periodica degli ordini abbandonati (pg_cron ogni 5 minuti)
create or replace function public.expire_stale_orders() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id from orders where status = 'pending' and expires_at < now() loop
    perform cancel_order(r.id, 'expired'); n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- Check-in ai varchi: verifica firma + uso singolo, atomico
-- ---------------------------------------------------------------------
create or replace function public.validate_ticket(p_token text, p_event uuid, p_gate text default 'Gate A', p_method text default 'qr')
returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare
  v_parts text[];
  v_tid uuid;
  v_t tickets;
  v_name text;
  v_type text;
begin
  if not public.can_scan_event(p_event) then raise exception 'Non autorizzato a questo evento'; end if;

  -- Ammessi: token QR completo oppure codice umano CP-XXXXXXXX (inserimento manuale)
  if p_token like 'CP1.%' then
    v_parts := string_to_array(p_token, '.');
    begin v_tid := v_parts[2]::uuid; exception when others then v_tid := null; end;
    if v_tid is null or array_length(v_parts,1) <> 3 or private.sign_ticket(v_tid, p_event) <> p_token then
      -- firma non valida per questo evento: è falso oppure è di un altro evento?
      if v_tid is not null and exists (select 1 from tickets where id = v_tid and event_id <> p_event) then
        insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (v_tid, p_event, auth.uid(), p_gate, p_method, 'wrong_event');
        return jsonb_build_object('ok', false, 'result', 'wrong_event');
      end if;
      insert into checkins (event_id, scanned_by, gate, method, result) values (p_event, auth.uid(), p_gate, p_method, 'invalid');
      return jsonb_build_object('ok', false, 'result', 'invalid');
    end if;
    select * into v_t from tickets where id = v_tid for update;
  else
    select * into v_t from tickets where code = upper(p_token) and event_id = p_event for update;
  end if;

  if not found then
    insert into checkins (event_id, scanned_by, gate, method, result) values (p_event, auth.uid(), p_gate, p_method, 'invalid');
    return jsonb_build_object('ok', false, 'result', 'invalid');
  end if;

  select tt.name into v_type from ticket_types tt where tt.id = v_t.ticket_type_id;
  v_name := coalesce(v_t.holder_name, (select full_name from profiles where id = v_t.user_id));

  if v_t.status = 'void' then
    insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (v_t.id, p_event, auth.uid(), p_gate, p_method, 'void');
    return jsonb_build_object('ok', false, 'result', 'void', 'name', v_name, 'type', v_type, 'code', v_t.code);
  end if;
  if v_t.status = 'used' then
    insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (v_t.id, p_event, auth.uid(), p_gate, p_method, 'already_used');
    return jsonb_build_object('ok', false, 'result', 'already_used', 'name', v_name, 'type', v_type, 'code', v_t.code, 'at', v_t.checked_in_at, 'gate', v_t.gate);
  end if;

  update tickets set status = 'used', checked_in_at = now(), checked_in_by = auth.uid(), gate = p_gate where id = v_t.id;
  insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (v_t.id, p_event, auth.uid(), p_gate, p_method, 'ok');
  return jsonb_build_object('ok', true, 'result', 'ok', 'name', v_name, 'type', v_type, 'code', v_t.code, 'at', now());
end $$;

create or replace function public.undo_checkin(p_ticket uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_t tickets;
begin
  select * into v_t from tickets where id = p_ticket for update;
  if not found or not public.can_scan_event(v_t.event_id) then raise exception 'Non autorizzato'; end if;
  update tickets set status = 'valid', checked_in_at = null, checked_in_by = null, gate = null where id = p_ticket and status = 'used';
  insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (p_ticket, v_t.event_id, auth.uid(), v_t.gate, 'manual', 'undo');
end $$;

-- ---------------------------------------------------------------------
-- Vista pubblica degli eventi (prezzo minimo, posti, evidenza, "ci vado")
-- ---------------------------------------------------------------------
create or replace view public.public_events with (security_invoker = true) as
select e.id, e.slug, e.title, e.title_en, e.description, e.description_en, e.category,
       e.starts_at, e.ends_at, e.venue_name, e.zone, e.address, e.map_x, e.map_y, e.lat, e.lng,
       e.cover_url, e.capacity, e.age, e.accessible, e.lineup, e.ticketing_mode, e.partner_url,
       o.name as organizer_name, o.verified as organizer_verified,
       coalesce((select min(tt.price_cents) from ticket_types tt where tt.event_id = e.id and not tt.is_addon and not tt.hidden), 0) as min_price_cents,
       greatest(e.capacity - coalesce((select sum(tt.sold + tt.reserved) from ticket_types tt where tt.event_id = e.id and not tt.is_addon), 0), 0) as seats_left,
       exists (select 1 from promotions p where p.event_id = e.id and now() between p.starts_at and p.ends_at) as featured,
       (select count(*) from going g where g.event_id = e.id) as going_count
from events e join organizers o on o.id = e.organizer_id
where e.status = 'published';

-- Amici (follow reciproco) che vanno a un evento
create or replace function public.friends_going(p_event uuid)
returns table (user_id uuid, full_name text, avatar_url text)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url
  from going g join profiles p on p.id = g.user_id
  where g.event_id = p_event
    and exists (select 1 from follows a where a.follower_id = auth.uid() and a.followee_id = g.user_id)
    and exists (select 1 from follows b where b.follower_id = g.user_id and b.followee_id = auth.uid());
$$;

-- Recensioni pubbliche con nome e "biglietto verificato"
create or replace view public.public_reviews with (security_invoker = true) as
select r.id, r.event_id, r.stars, r.body, r.photos, r.created_at,
       p.full_name as author, (r.user_id = auth.uid()) as mine
from reviews r join profiles p on p.id = r.user_id
where not r.hidden;

-- ---------------------------------------------------------------------
-- Statistiche per la dashboard organizzatori
-- ---------------------------------------------------------------------
create or replace function public.org_event_stats(p_event uuid)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_org uuid; v jsonb;
begin
  select organizer_id into v_org from events where id = p_event;
  if v_org is null or not public.can_manage_org(v_org) then raise exception 'Non autorizzato'; end if;
  select jsonb_build_object(
    'event_id', p_event,
    'capacity', (select capacity from events where id = p_event),
    'tiers', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'price_cents', price_cents, 'sold', sold, 'quantity', quantity) order by sort) from ticket_types where event_id = p_event), '[]'::jsonb),
    'sold', (select count(*) from tickets where event_id = p_event and status <> 'void'),
    'gross_cents', coalesce((select sum(subtotal_cents - discount_cents) from orders where event_id = p_event and kind = 'tickets' and status = 'paid'), 0),
    'fee_cents', coalesce((select sum(application_fee_cents - booking_fee_cents) from orders where event_id = p_event and kind = 'tickets' and status = 'paid'), 0),
    'checked_in', (select count(*) from tickets where event_id = p_event and status = 'used'),
    'daily', (select jsonb_agg(jsonb_build_object('day', d::date, 'n', coalesce(c.n,0)) order by d)
              from generate_series(current_date - 13, current_date, interval '1 day') d
              left join (select t.created_at::date as day, count(*) n from tickets t where t.event_id = p_event and t.status <> 'void' group by 1) c on c.day = d::date),
    'entries_15m', (select coalesce(jsonb_agg(jsonb_build_object('t', b, 'n', n) order by b), '[]'::jsonb) from (
                      select date_trunc('hour', created_at) + floor(extract(minute from created_at) / 15) * interval '15 min' as b, count(*) n
                      from checkins where event_id = p_event and result = 'ok' group by 1) x)
  ) into v;
  return v;
end $$;

create or replace function public.org_dashboard()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'event_id', e.id, 'title', e.title, 'starts_at', e.starts_at, 'status', e.status, 'capacity', e.capacity,
    'sold', (select count(*) from tickets t where t.event_id = e.id and t.status <> 'void'),
    'checked_in', (select count(*) from tickets t where t.event_id = e.id and t.status = 'used'),
    'gross_cents', coalesce((select sum(subtotal_cents - discount_cents) from orders o where o.event_id = e.id and o.kind='tickets' and o.status = 'paid'), 0),
    'featured', exists (select 1 from promotions p where p.event_id = e.id and now() between p.starts_at and p.ends_at)
  ) order by e.starts_at), '[]'::jsonb)
  from events e
  where public.can_manage_org(e.organizer_id);
$$;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.organizers          enable row level security;
alter table public.organizer_members   enable row level security;
alter table public.events              enable row level security;
alter table public.ticket_types        enable row level security;
alter table public.orders              enable row level security;
alter table public.tickets             enable row level security;
alter table public.checkins            enable row level security;
alter table public.favorites           enable row level security;
alter table public.going               enable row level security;
alter table public.follows             enable row level security;
alter table public.reviews             enable row level security;
alter table public.promotions          enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.notification_log   enable row level security;

-- profili: ognuno legge e modifica il proprio; nomi visibili agli utenti loggati
create policy profiles_select on public.profiles for select to authenticated using (true);
create policy profiles_update on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- organizzatori: pubblici in lettura (senza dati Stripe), modifica owner/manager
create policy organizers_select on public.organizers for select using (true);
create policy organizers_insert on public.organizers for insert to authenticated with check (owner_id = auth.uid());
create policy organizers_update on public.organizers for update to authenticated using (public.can_manage_org(id)) with check (public.can_manage_org(id));
revoke select (stripe_account_id) on public.organizers from anon, authenticated;

create policy members_select on public.organizer_members for select to authenticated
  using (user_id = auth.uid() or public.can_manage_org(organizer_id));
create policy members_write on public.organizer_members for all to authenticated
  using (public.org_role(organizer_id) = 'owner' or public.is_admin())
  with check (public.org_role(organizer_id) = 'owner' or public.is_admin());

-- eventi: pubblicati visibili a tutti; bozze solo al team
create policy events_select on public.events for select
  using (status = 'published' or public.can_manage_org(organizer_id));
create policy events_insert on public.events for insert to authenticated with check (public.can_manage_org(organizer_id));
create policy events_update on public.events for update to authenticated using (public.can_manage_org(organizer_id)) with check (public.can_manage_org(organizer_id));
create policy events_delete on public.events for delete to authenticated
  using (public.can_manage_org(organizer_id) and not exists (select 1 from tickets t where t.event_id = events.id));

create policy tt_select on public.ticket_types for select
  using (exists (select 1 from events e where e.id = event_id and ((e.status = 'published' and not hidden) or public.can_scan_event(e.id))));
create policy tt_write on public.ticket_types for all to authenticated
  using (exists (select 1 from events e where e.id = event_id and public.can_manage_org(e.organizer_id)))
  with check (exists (select 1 from events e where e.id = event_id and public.can_manage_org(e.organizer_id)));
-- venduti e riservati li aggiornano solo le funzioni del server
revoke update (sold, reserved) on public.ticket_types from authenticated;

-- ordini e biglietti: solo i propri (in lettura). Si creano solo dal server.
create policy orders_select on public.orders for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from events e where e.id = event_id and public.can_manage_org(e.organizer_id)));
create policy tickets_select on public.tickets for select to authenticated
  using (user_id = auth.uid() or public.can_scan_event(event_id));

create policy checkins_select on public.checkins for select to authenticated using (public.can_scan_event(event_id));

create policy fav_all on public.favorites for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy going_select on public.going for select to authenticated using (true);
create policy going_write on public.going for insert to authenticated with check (user_id = auth.uid());
create policy going_delete on public.going for delete to authenticated using (user_id = auth.uid());
create policy follows_select on public.follows for select to authenticated using (follower_id = auth.uid() or followee_id = auth.uid());
create policy follows_insert on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy follows_delete on public.follows for delete to authenticated using (follower_id = auth.uid());

-- recensioni: tutti leggono; scrive SOLO chi aveva un biglietto valido e dopo la fine dell'evento
create policy reviews_select on public.reviews for select using (not hidden or user_id = auth.uid());
create policy reviews_insert on public.reviews for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from tickets t where t.event_id = reviews.event_id and t.user_id = auth.uid() and t.status in ('valid','used'))
  and exists (select 1 from events e where e.id = reviews.event_id and e.ends_at < now())
);
create policy reviews_update on public.reviews for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reviews_delete on public.reviews for delete to authenticated using (user_id = auth.uid() or public.is_admin());

create policy promotions_select on public.promotions for select using (true);

create policy push_all on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Biglietti del proprio account, con il token per il QR (anche offline).
-- Vista con i diritti del proprietario: il filtro auth.uid() garantisce che
-- ognuno veda solo i propri token.
create or replace view public.my_tickets as
select t.id, t.code, t.qr_token, t.status, t.checked_in_at, t.holder_name, t.created_at,
       t.event_id, tt.name as ticket_type, tt.price_cents, o.id as order_id
from tickets t join ticket_types tt on tt.id = t.ticket_type_id join orders o on o.id = t.order_id
where t.user_id = auth.uid();

-- Lista accrediti per lo staff, senza token
create or replace view public.staff_tickets with (security_invoker = true) as
select t.id, t.code, t.status, t.checked_in_at, t.gate, t.holder_name, t.event_id, tt.name as ticket_type
from tickets t join ticket_types tt on tt.id = t.ticket_type_id
where public.can_scan_event(t.event_id);

-- Il token QR non è leggibile dalla tabella grezza (solo dalla vista my_tickets)
revoke select on public.tickets from authenticated;
grant select (id, order_id, event_id, ticket_type_id, user_id, holder_name, code, status, checked_in_at, checked_in_by, gate, created_at) on public.tickets to authenticated;
grant select on public.my_tickets, public.staff_tickets, public.public_events, public.public_reviews to authenticated;
grant select on public.public_events, public.public_reviews to anon;

-- Le funzioni di emissione sono riservate al server (service role)
revoke execute on function public.reserve_order(uuid,uuid,jsonb,text,text,text,int) from public, anon, authenticated;
revoke execute on function public.complete_order(uuid,text,boolean) from public, anon, authenticated;
revoke execute on function public.cancel_order(uuid,text) from public, anon, authenticated;
revoke execute on function public.refund_order(text) from public, anon, authenticated;
revoke execute on function public.expire_stale_orders() from public, anon, authenticated;
grant execute on function public.validate_ticket(text,uuid,text,text) to authenticated;
grant execute on function public.undo_checkin(uuid) to authenticated;
grant execute on function public.org_event_stats(uuid) to authenticated;
grant execute on function public.org_dashboard() to authenticated;
grant execute on function public.friends_going(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Storage: copertine eventi e foto recensioni (bucket pubblici in lettura)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values ('covers', 'covers', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('review-photos', 'review-photos', true) on conflict (id) do nothing;

-- Copertine: percorso "<organizer_id>/<file>", caricabili solo dal team dell'organizzatore
create policy covers_read on storage.objects for select using (bucket_id = 'covers');
create policy covers_write on storage.objects for insert to authenticated
  with check (bucket_id = 'covers' and public.can_manage_org(((storage.foldername(name))[1])::uuid));
create policy covers_delete on storage.objects for delete to authenticated
  using (bucket_id = 'covers' and public.can_manage_org(((storage.foldername(name))[1])::uuid));
-- Foto recensioni: percorso "<user_id>/<file>"
create policy rphotos_read on storage.objects for select using (bucket_id = 'review-photos');
create policy rphotos_write on storage.objects for insert to authenticated
  with check (bucket_id = 'review-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------
-- Realtime per la dashboard (vendite e ingressi in diretta)
-- ---------------------------------------------------------------------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.checkins, public.orders;
  end if;
end $$;

-- Gli accrediti al desk li emettono owner, manager e cassa (non lo staff dei soli varchi)
create or replace function public.can_issue_passes(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_admin() or exists (select 1 from events e join organizer_members m on m.organizer_id = e.organizer_id
     where e.id = p_event and m.user_id = auth.uid() and m.role in ('owner','manager','cassa'));
$$;

-- ---------------------------------------------------------------------
-- Accrediti rapidi dello staff (guestlist, stampa, crew): pass gratuito
-- con QR firmato, emesso al desk e facoltativamente convalidato subito.
-- ---------------------------------------------------------------------
create or replace function public.issue_guest_pass(
  p_event uuid, p_name text, p_type text, p_pax int default 1, p_note text default null, p_checkin boolean default true
) returns jsonb
language plpgsql security definer set search_path = public, private as $$
declare v_tt uuid; v_order uuid; v_tid uuid; v_first jsonb; i int;
begin
  if not public.can_issue_passes(p_event) then raise exception 'Non autorizzato'; end if;
  if coalesce(trim(p_name),'') = '' then raise exception 'Nome obbligatorio'; end if;
  if p_pax < 1 or p_pax > 5 then raise exception 'Da 1 a 5 ingressi'; end if;
  select id into v_tt from ticket_types where event_id = p_event and name = 'Accredito · ' || p_type;
  if v_tt is null then
    insert into ticket_types (event_id, name, description, price_cents, quantity, sort, max_per_order, hidden)
    values (p_event, 'Accredito · ' || p_type, 'Pass staff/ospiti non in vendita', 0, 100000, 999, 5, true) returning id into v_tt;
  end if;
  insert into orders (kind, user_id, event_id, status, items, buyer_name, paid_at)
  values ('tickets', auth.uid(), p_event, 'free', jsonb_build_array(jsonb_build_object('ticket_type_id', v_tt, 'name', p_type, 'qty', p_pax, 'price_cents', 0, 'note', p_note)), p_name, now())
  returning id into v_order;
  update ticket_types set sold = sold + p_pax where id = v_tt;
  for i in 1..p_pax loop
    v_tid := gen_random_uuid();
    insert into tickets (id, order_id, event_id, ticket_type_id, user_id, holder_name, code, qr_token, status, checked_in_at, checked_in_by, gate)
    values (v_tid, v_order, p_event, v_tt, auth.uid(), p_name || case when i > 1 then ' (+' || (i-1) || ')' else '' end,
            'CP-' || upper(substr(replace(v_tid::text,'-',''), 1, 8)), private.sign_ticket(v_tid, p_event),
            case when p_checkin then 'used' else 'valid' end,
            case when p_checkin then now() end, case when p_checkin then auth.uid() end, case when p_checkin then 'Desk' end);
    if p_checkin then insert into checkins (ticket_id, event_id, scanned_by, gate, method, result) values (v_tid, p_event, auth.uid(), 'Desk', 'manual', 'ok'); end if;
    if i = 1 then v_first := jsonb_build_object('code', 'CP-' || upper(substr(replace(v_tid::text,'-',''), 1, 8)), 'qr_token', private.sign_ticket(v_tid, p_event), 'order_id', v_order); end if;
  end loop;
  return v_first || jsonb_build_object('pax', p_pax, 'name', p_name, 'type', p_type);
end $$;
grant execute on function public.issue_guest_pass(uuid,text,text,int,text,boolean) to authenticated;

-- Pass emessi al desk (cronologia staff)
create or replace view public.staff_guest_passes with (security_invoker = true) as
select o.id as order_id, o.event_id, o.buyer_name as name, o.items->0->>'name' as type, (o.items->0->>'qty')::int as pax,
       o.items->0->>'note' as note, o.created_at, p.full_name as issued_by,
       (select bool_and(t.status = 'used') from tickets t where t.order_id = o.id) as checked_in,
       (select min(t.code) from tickets t where t.order_id = o.id) as code
from orders o left join profiles p on p.id = o.user_id
where o.kind = 'tickets' and o.status = 'free' and o.subtotal_cents = 0
  and exists (select 1 from ticket_types tt where tt.id = (o.items->0->>'ticket_type_id')::uuid and tt.name like 'Accredito · %')
  and public.can_scan_event(o.event_id);
grant select on public.staff_guest_passes to authenticated;

-- Lo staff deve poter leggere gli ordini degli accrediti che ha emesso
create policy orders_staff_select on public.orders for select to authenticated using (public.can_scan_event(event_id));
