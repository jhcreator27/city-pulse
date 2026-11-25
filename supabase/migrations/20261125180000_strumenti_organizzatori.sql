-- =====================================================================
-- CITY PULSE · strumenti per gli organizzatori
-- 1) Prezzi a scaglioni (early bird che sale da solo) e codici sconto
-- 2) Team: ruoli (manager, staff varchi, cassa) e varco assegnato, inviti via email
-- 3) Statistiche sul pubblico: fascia d'età, provenienza, canale d'acquisto (aggregate)
-- 4) Messaggi a tutti i possessori di biglietto
-- 5) Dati per report di fine evento e fattura di cortesia delle commissioni
-- =====================================================================

-- ---------- 1. Scaglioni e codici sconto ----------
-- price_steps: [{"up_to":100,"price_cents":1200},{"up_to":250,"price_cents":1500}]
-- "up_to" = numero di biglietti venduti di quel tipo fino a cui vale il prezzo; oltre vale price_cents del tipo.
alter table public.ticket_types add column if not exists price_steps jsonb not null default '[]'::jsonb;

create or replace function public.unit_price(p_tt public.ticket_types, p_nth int)
returns int language sql immutable as $$
  -- prezzo del biglietto numero p_nth (1 = il primo venduto di quel tipo)
  select coalesce((select (s->>'price_cents')::int from jsonb_array_elements(p_tt.price_steps) s
                   where p_nth <= (s->>'up_to')::int order by (s->>'up_to')::int limit 1), p_tt.price_cents);
$$;

-- prezzo attuale e quanti ne restano allo scaglione corrente (per mostrarlo in app)
create or replace view public.ticket_prices with (security_invoker = true) as
select tt.id as ticket_type_id, tt.event_id,
       public.unit_price(tt, tt.sold + tt.reserved + 1) as current_price_cents,
       (select (s->>'up_to')::int - (tt.sold + tt.reserved) from jsonb_array_elements(tt.price_steps) s
         where tt.sold + tt.reserved < (s->>'up_to')::int order by (s->>'up_to')::int limit 1) as left_at_this_price,
       (select coalesce((select (s2->>'price_cents')::int from jsonb_array_elements(tt.price_steps) s2
                          where (s2->>'up_to')::int > (s->>'up_to')::int order by (s2->>'up_to')::int limit 1), tt.price_cents)
          from jsonb_array_elements(tt.price_steps) s
         where tt.sold + tt.reserved < (s->>'up_to')::int order by (s->>'up_to')::int limit 1) as next_price_cents
from public.ticket_types tt;
grant select on public.ticket_prices to anon, authenticated;

create table public.discount_codes (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references public.organizers(id) on delete cascade,
  event_id      uuid references public.events(id) on delete cascade,     -- null = tutti gli eventi dell'organizzatore
  code          text not null check (code ~ '^[A-Z0-9_-]{3,24}$'),
  kind          text not null check (kind in ('percent','fixed')),
  value         int not null check (value > 0),                        -- percentuale oppure centesimi
  max_uses      int,
  used          int not null default 0,
  valid_until   timestamptz,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (organizer_id, code),
  check (kind <> 'percent' or value <= 100)
);
alter table public.discount_codes enable row level security;
create policy dc_team on public.discount_codes for all to authenticated
  using (public.can_manage_org(organizer_id)) with check (public.can_manage_org(organizer_id));

alter table public.orders add column if not exists discount_code_id uuid references public.discount_codes(id);
alter table public.orders add column if not exists source text;          -- instagram, whatsapp, tiktok, facebook, google, link, app
alter table public.orders add column if not exists age_range text check (age_range in ('<18','18-24','25-34','35-44','45-54','55+'));
alter table public.orders add column if not exists origin text;          -- quartiere di Palermo, provincia, altra città, estero

-- Verifica pubblica di un codice (senza rivelare l'elenco dei codici)
create or replace function public.check_discount(p_event uuid, p_code text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d discount_codes;
begin
  select dc.* into d from discount_codes dc join events e on e.organizer_id = dc.organizer_id
   where e.id = p_event and dc.code = upper(trim(p_code)) and dc.active
     and (dc.event_id is null or dc.event_id = p_event)
     and (dc.valid_until is null or dc.valid_until > now())
     and (dc.max_uses is null or dc.used < dc.max_uses);
  if not found then return jsonb_build_object('valid', false); end if;
  return jsonb_build_object('valid', true, 'code', d.code, 'kind', d.kind, 'value', d.value);
end $$;
grant execute on function public.check_discount(uuid, text) to anon, authenticated;

-- reserve_order con scaglioni, codice sconto e dati facoltativi sul pubblico
drop function if exists public.reserve_order(uuid,uuid,jsonb,text,text,text,int);
create or replace function public.reserve_order(
  p_user uuid, p_event uuid, p_items jsonb,
  p_buyer_name text, p_buyer_email text, p_buyer_phone text,
  p_booking_fee_cents int default 150,
  p_code text default null, p_source text default null, p_age_range text default null, p_origin text default null
) returns public.orders
language plpgsql security definer set search_path = public as $$
declare
  v_event events; v_org organizers; v_item jsonb; v_tt ticket_types; v_qty int; i int;
  v_items jsonb := '[]'::jsonb; v_sub int := 0; v_count int := 0; v_line int; v_order orders;
  v_dc discount_codes; v_disc int := 0;
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
    -- ogni biglietto paga il prezzo del suo scaglione
    v_line := 0;
    for i in 1..v_qty loop v_line := v_line + public.unit_price(v_tt, v_tt.sold + v_tt.reserved + i); end loop;
    update ticket_types set reserved = reserved + v_qty where id = v_tt.id;
    v_items := v_items || jsonb_build_object('ticket_type_id', v_tt.id, 'name', v_tt.name, 'qty', v_qty,
                                             'price_cents', round(v_line::numeric / v_qty)::int, 'line_cents', v_line);
    v_sub := v_sub + v_line; v_count := v_count + v_qty;
  end loop;
  if v_count = 0 then raise exception 'Nessun biglietto selezionato'; end if;
  if v_count > 10 then raise exception 'Massimo 10 biglietti per ordine'; end if;

  if coalesce(trim(p_code), '') <> '' then
    select dc.* into v_dc from discount_codes dc
     where dc.organizer_id = v_org.id and dc.code = upper(trim(p_code)) and dc.active
       and (dc.event_id is null or dc.event_id = p_event)
       and (dc.valid_until is null or dc.valid_until > now())
       and (dc.max_uses is null or dc.used < dc.max_uses)
     for update;
    if not found then raise exception 'Codice sconto non valido o scaduto'; end if;
    v_disc := least(v_sub, case when v_dc.kind = 'percent' then round(v_sub * v_dc.value / 100.0)::int else v_dc.value end);
    update discount_codes set used = used + 1 where id = v_dc.id;
  end if;

  insert into orders (kind, user_id, event_id, items, subtotal_cents, discount_cents, booking_fee_cents, total_cents,
                      application_fee_cents, buyer_name, buyer_email, buyer_phone, status,
                      discount_code_id, source, age_range, origin)
  values ('tickets', p_user, p_event, v_items, v_sub, v_disc,
          case when v_sub - v_disc > 0 then p_booking_fee_cents else 0 end,
          v_sub - v_disc + case when v_sub - v_disc > 0 then p_booking_fee_cents else 0 end,
          case when v_sub - v_disc > 0 then round((v_sub - v_disc) * v_org.commission_pct / 100.0)::int + p_booking_fee_cents else 0 end,
          p_buyer_name, p_buyer_email, p_buyer_phone, 'pending',
          v_dc.id, nullif(lower(left(p_source, 30)), ''), p_age_range, nullif(left(p_origin, 60), ''))
  returning * into v_order;
  return v_order;
end $$;
revoke execute on function public.reserve_order(uuid,uuid,jsonb,text,text,text,int,text,text,text,text) from public, anon, authenticated;

-- se l'ordine scade, il codice torna disponibile
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
    if v_order.discount_code_id is not null then
      update discount_codes set used = greatest(used - 1, 0) where id = v_order.discount_code_id;
    end if;
  end if;
  update orders set status = p_status where id = p_order;
end $$;
revoke execute on function public.cancel_order(uuid,text) from public, anon, authenticated;

-- ---------- 2. Team con ruoli e varchi ----------
alter table public.organizer_members drop constraint if exists organizer_members_role_check;
alter table public.organizer_members add constraint organizer_members_role_check check (role in ('owner','manager','staff','cassa'));
alter table public.organizer_members add column if not exists gate text not null default 'Gate A';
alter table public.organizer_members add column if not exists added_at timestamptz not null default now();

create table public.team_invites (
  id            uuid primary key default gen_random_uuid(),
  organizer_id  uuid not null references public.organizers(id) on delete cascade,
  email         text not null,
  role          text not null check (role in ('manager','staff','cassa')),
  gate          text not null default 'Gate A',
  invited_by    uuid references public.profiles(id),
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (organizer_id, email)
);
alter table public.team_invites enable row level security;
create policy inv_team on public.team_invites for all to authenticated
  using (public.can_manage_org(organizer_id)) with check (public.can_manage_org(organizer_id));

-- Chi accede con l'email invitata entra nel team (chiamata dall'app dopo il login)
create or replace function public.accept_invites() returns int
language plpgsql security definer set search_path = public as $$
declare v_email text; r record; n int := 0;
begin
  select email into v_email from auth.users where id = auth.uid();
  for r in select * from team_invites where lower(email) = lower(v_email) and accepted_at is null loop
    insert into organizer_members (organizer_id, user_id, role, gate) values (r.organizer_id, auth.uid(), r.role, r.gate)
    on conflict (organizer_id, user_id) do update set role = excluded.role, gate = excluded.gate;
    update team_invites set accepted_at = now() where id = r.id;
    n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function public.accept_invites() to authenticated;

-- Elenco del team con nomi ed email (solo per owner/manager)
create or replace function public.team_list(p_org uuid)
returns table (user_id uuid, full_name text, email text, role text, gate text, pending boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.can_manage_org(p_org) then raise exception 'Non autorizzato'; end if;
  return query
    select m.user_id, p.full_name, u.email::text, m.role, m.gate, false
      from organizer_members m join profiles p on p.id = m.user_id join auth.users u on u.id = m.user_id
     where m.organizer_id = p_org
    union all
    select null, null, i.email, i.role, i.gate, true from team_invites i where i.organizer_id = p_org and i.accepted_at is null;
end $$;
grant execute on function public.team_list(uuid) to authenticated;

-- Il varco assegnato a chi scansiona (per validate_ticket dall'app)
create or replace function public.my_gate(p_event uuid) returns text
language sql stable security definer set search_path = public as $$
  select m.gate from organizer_members m join events e on e.organizer_id = m.organizer_id
   where e.id = p_event and m.user_id = auth.uid();
$$;
grant execute on function public.my_gate(uuid) to authenticated;

-- ---------- 4. Messaggi ai partecipanti ----------
create table public.event_messages (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references public.events(id) on delete cascade,
  sent_by     uuid references public.profiles(id),
  title       text not null check (char_length(title) between 3 and 80),
  body        text not null check (char_length(body) between 3 and 500),
  recipients  int not null default 0,
  created_at  timestamptz not null default now()
);
alter table public.event_messages enable row level security;
create policy em_team on public.event_messages for select to authenticated
  using (exists (select 1 from events e where e.id = event_id and public.can_manage_org(e.organizer_id)));

create or replace function public.message_attendees(p_event uuid, p_title text, p_body text)
returns int language plpgsql security definer set search_path = public as $$
declare v_ev events; v_msg uuid; n int;
begin
  select * into v_ev from events where id = p_event;
  if not found or not public.can_manage_org(v_ev.organizer_id) then raise exception 'Non autorizzato'; end if;
  -- massimo un messaggio ogni 10 minuti per evento (anti-spam)
  if exists (select 1 from event_messages where event_id = p_event and created_at > now() - interval '10 minutes') then
    raise exception 'Hai già inviato un messaggio da poco: riprova tra qualche minuto';
  end if;
  insert into event_messages (event_id, sent_by, title, body) values (p_event, auth.uid(), p_title, p_body) returning id into v_msg;
  insert into notification_queue (user_id, kind, title, body, url, dedupe)
  select distinct t.user_id, 'message', v_ev.title || ': ' || p_title, p_body,
         '/#evento-' || coalesce(v_ev.slug, v_ev.id::text), 'msg:' || v_msg || ':' || t.user_id
    from tickets t where t.event_id = p_event and t.status <> 'void'
  on conflict (dedupe) do nothing;
  get diagnostics n = row_count;
  update event_messages set recipients = n where id = v_msg;
  return n;
end $$;
grant execute on function public.message_attendees(uuid, text, text) to authenticated;

-- ---------- 3 e 5. Statistiche pubblico, varchi e report ----------
create or replace function public.org_event_insights(p_event uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_ev events; v_n int; k int := 10;  -- soglia minima per mostrare dati aggregati
begin
  select * into v_ev from events where id = p_event;
  if not found or not public.can_manage_org(v_ev.organizer_id) then raise exception 'Non autorizzato'; end if;
  select count(*) into v_n from orders where event_id = p_event and kind = 'tickets' and status in ('paid','free');
  return jsonb_build_object(
    'orders', v_n,
    'enough', v_n >= k,
    'age',    case when v_n >= k then (select jsonb_object_agg(coalesce(age_range,'n.d.'), c) from (select age_range, count(*) c from orders where event_id = p_event and kind='tickets' and status in ('paid','free') group by 1) x) end,
    'origin', case when v_n >= k then (select jsonb_object_agg(coalesce(origin,'n.d.'), c) from (select origin, count(*) c from orders where event_id = p_event and kind='tickets' and status in ('paid','free') group by 1) x) end,
    'source', case when v_n >= k then (select jsonb_object_agg(coalesce(source,'diretto'), c) from (select source, count(*) c from orders where event_id = p_event and kind='tickets' and status in ('paid','free') group by 1) x) end,
    'gates',  (select coalesce(jsonb_object_agg(coalesce(gate,'—'), c), '{}'::jsonb) from (select gate, count(*) c from checkins where event_id = p_event and result = 'ok' group by 1) x),
    'codes',  (select coalesce(jsonb_agg(jsonb_build_object('code', d.code, 'used', (select count(*) from orders o where o.discount_code_id = d.id and o.status = 'paid'),
                       'discount_cents', (select coalesce(sum(discount_cents),0) from orders o where o.discount_code_id = d.id and o.status = 'paid'))), '[]'::jsonb)
               from discount_codes d where d.organizer_id = v_ev.organizer_id and (d.event_id is null or d.event_id = p_event)),
    'report', jsonb_build_object(
       'gross_cents',    (select coalesce(sum(subtotal_cents),0) from orders where event_id = p_event and kind='tickets' and status='paid'),
       'discount_cents', (select coalesce(sum(discount_cents),0) from orders where event_id = p_event and kind='tickets' and status='paid'),
       'commission_cents', (select coalesce(sum(application_fee_cents - booking_fee_cents),0) from orders where event_id = p_event and kind='tickets' and status='paid'),
       'refunded_cents', (select coalesce(sum(subtotal_cents - discount_cents),0) from orders where event_id = p_event and kind='tickets' and status='refunded'),
       'promo_cents',    (select coalesce(sum(total_cents),0) from orders where event_id = p_event and kind='promotion' and status='paid'),
       'tickets_valid',  (select count(*) from tickets where event_id = p_event and status <> 'void'),
       'checked_in',     (select count(*) from tickets where event_id = p_event and status = 'used'),
       'free_tickets',   (select count(*) from tickets t join ticket_types tt on tt.id = t.ticket_type_id where t.event_id = p_event and tt.price_cents = 0 and t.status <> 'void'))
  );
end $$;
grant execute on function public.org_event_insights(uuid) to authenticated;

-- Fatturazione: dati dell'organizzatore per la fattura delle commissioni
alter table public.organizers add column if not exists billing jsonb not null default '{}'::jsonb;
-- {"ragione_sociale":"", "piva":"", "cf":"", "indirizzo":"", "sdi":"", "pec":""}
