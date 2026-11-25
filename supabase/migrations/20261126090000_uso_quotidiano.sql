-- =====================================================================
-- CITY PULSE · funzioni per l'uso quotidiano
-- 1) Email di conferma (registro invii)
-- 2) Annullamento e rinvio eventi con rimborsi
-- 3) Account e privacy (GDPR): modifica, esportazione, cancellazione
-- 4) Verifica del cellulare per gli eventi con biglietti nominativi
-- 5) Trovare e seguire amici
-- 6) Pannello admin: approvazione organizzatori, moderazione, segnalazioni
-- =====================================================================

-- ---------- 1. Registro email ----------
create table public.email_log (
  id         bigint generated always as identity primary key,
  order_id   uuid references public.orders(id) on delete set null,
  kind       text not null,                 -- tickets, event_cancelled, event_postponed, refund
  recipient  text not null,
  provider_id text,
  status     text not null default 'sent' check (status in ('sent','failed')),
  error      text,
  created_at timestamptz not null default now(),
  unique (order_id, kind)
);
alter table public.email_log enable row level security;
create policy el_admin on public.email_log for select to authenticated using (public.is_admin());

-- ---------- 2. Annullamento e rinvio ----------
alter table public.events add column if not exists cancel_reason text;
alter table public.events add column if not exists postponed_from timestamptz;
alter table public.events add column if not exists refund_deadline timestamptz;   -- per i rinvii: entro quando si può chiedere il rimborso

create table public.refunds (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null unique references public.orders(id),
  reason        text not null check (reason in ('event_cancelled','event_postponed','organizer')),
  status        text not null default 'pending' check (status in ('pending','processing','done','failed')),
  amount_cents  int not null,
  stripe_refund text,
  error         text,
  requested_by  uuid references public.profiles(id),
  created_at    timestamptz not null default now(),
  done_at       timestamptz
);
alter table public.refunds enable row level security;
create policy rf_select on public.refunds for select to authenticated using (
  exists (select 1 from orders o where o.id = order_id and (o.user_id = auth.uid() or exists (select 1 from events e where e.id = o.event_id and public.can_manage_org(e.organizer_id))))
  or public.is_admin());

-- Annulla un evento: niente più vendite, rimborso automatico di tutti gli ordini pagati, avviso ai partecipanti
create or replace function public.cancel_event(p_event uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ev events; n_ref int; n_msg int;
begin
  select * into v_ev from events where id = p_event for update;
  if not found or not public.can_manage_org(v_ev.organizer_id) then raise exception 'Non autorizzato'; end if;
  if v_ev.status = 'cancelled' then raise exception 'Evento già annullato'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'Scrivi il motivo dell''annullamento'; end if;
  update events set status = 'cancelled', cancel_reason = p_reason where id = p_event;
  -- ordini in attesa: chiusi; ordini pagati: rimborso in coda (lo esegue la funzione event-refunds con Stripe)
  perform public.cancel_order(o.id, 'failed') from orders o where o.event_id = p_event and o.status = 'pending';
  insert into refunds (order_id, reason, amount_cents, requested_by)
  select o.id, 'event_cancelled', o.total_cents, auth.uid() from orders o
   where o.event_id = p_event and o.kind = 'tickets' and o.status = 'paid'
  on conflict (order_id) do nothing;
  get diagnostics n_ref = row_count;
  -- i biglietti gratuiti vengono annullati subito
  update tickets t set status = 'void' from orders o where o.id = t.order_id and t.event_id = p_event and o.status = 'free' and t.status = 'valid';
  insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
  select distinct t.user_id, 'event_cancelled', 'Evento annullato: ' || v_ev.title, 'Event cancelled: ' || coalesce(v_ev.title_en, v_ev.title),
         p_reason || ' · Il rimborso completo è automatico.', p_reason || ' · You will be fully refunded automatically.',
         '/#evento-' || coalesce(v_ev.slug, v_ev.id::text), 'cancel:' || p_event || ':' || t.user_id
    from tickets t where t.event_id = p_event
  on conflict (dedupe) do nothing;
  get diagnostics n_msg = row_count;
  return jsonb_build_object('refunds', n_ref, 'notified', n_msg);
end $$;
grant execute on function public.cancel_event(uuid, text) to authenticated;

-- Rinvia un evento: i biglietti restano validi, chi non può venire chiede il rimborso entro la scadenza
create or replace function public.reschedule_event(p_event uuid, p_starts timestamptz, p_ends timestamptz, p_reason text, p_refund_days int default 14)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_ev events; n int;
begin
  select * into v_ev from events where id = p_event for update;
  if not found or not public.can_manage_org(v_ev.organizer_id) then raise exception 'Non autorizzato'; end if;
  if v_ev.status = 'cancelled' then raise exception 'L''evento è annullato'; end if;
  if p_starts <= now() or p_ends <= p_starts then raise exception 'Date non valide'; end if;
  update events set postponed_from = coalesce(postponed_from, starts_at), starts_at = p_starts, ends_at = p_ends,
                    refund_deadline = now() + make_interval(days => greatest(p_refund_days, 7)), cancel_reason = p_reason
   where id = p_event;
  insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
  select distinct t.user_id, 'event_postponed', 'Evento rinviato: ' || v_ev.title, 'Event postponed: ' || coalesce(v_ev.title_en, v_ev.title),
         'Nuova data: ' || to_char(p_starts at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI') || '. Il biglietto resta valido; se non puoi venire chiedi il rimborso entro ' || greatest(p_refund_days, 7) || ' giorni.',
         'New date: ' || to_char(p_starts at time zone 'Europe/Rome', 'DD/MM/YYYY HH24:MI') || '. Your ticket stays valid; if you cannot come, ask for a refund within ' || greatest(p_refund_days, 7) || ' days.',
         '/#evento-' || coalesce(v_ev.slug, v_ev.id::text), 'resched:' || p_event || ':' || extract(epoch from p_starts)::bigint || ':' || t.user_id
    from tickets t where t.event_id = p_event and t.status = 'valid'
  on conflict (dedupe) do nothing;
  get diagnostics n = row_count;
  return jsonb_build_object('notified', n);
end $$;
grant execute on function public.reschedule_event(uuid, timestamptz, timestamptz, text, int) to authenticated;

-- Chi ha il biglietto di un evento rinviato chiede il rimborso (entro la scadenza)
create or replace function public.request_refund(p_order uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_o orders; v_ev events; v_id uuid;
begin
  select * into v_o from orders where id = p_order and user_id = auth.uid();
  if not found or v_o.status <> 'paid' then raise exception 'Ordine non rimborsabile'; end if;
  select * into v_ev from events where id = v_o.event_id;
  if v_ev.postponed_from is null or v_ev.refund_deadline < now() then raise exception 'Rimborso non disponibile per questo evento'; end if;
  if exists (select 1 from tickets where order_id = p_order and status = 'used') then raise exception 'Biglietto già usato'; end if;
  insert into refunds (order_id, reason, amount_cents, requested_by) values (p_order, 'event_postponed', v_o.total_cents, auth.uid())
  on conflict (order_id) do nothing returning id into v_id;
  return v_id;
end $$;
grant execute on function public.request_refund(uuid) to authenticated;

-- Coda rimborsi per la funzione event-refunds (service role)
create or replace function public.take_refunds(p_limit int default 50)
returns table (refund_id uuid, order_id uuid, payment_intent text, amount_cents int)
language sql security definer set search_path = public as $$
  update refunds r set status = 'processing'
   where r.id in (select id from refunds where status = 'pending' order by created_at limit p_limit for update skip locked)
  returning r.id, r.order_id, (select stripe_payment_intent from orders o where o.id = r.order_id), r.amount_cents;
$$;
revoke execute on function public.take_refunds(int) from public, anon, authenticated;

-- ---------- 3. Account e privacy ----------
alter table public.profiles add column if not exists discoverable boolean not null default true;   -- visibile nella ricerca amici
alter table public.profiles add column if not exists phone_verified boolean not null default false;
alter table public.profiles add column if not exists deleted_at timestamptz;

create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'generato_il', now(),
    'profilo', (select to_jsonb(p) - 'prefs' || jsonb_build_object('preferenze', p.prefs) from profiles p where p.id = auth.uid()),
    'email', (select email from auth.users where id = auth.uid()),
    'ordini', coalesce((select jsonb_agg(to_jsonb(o) - 'stripe_session_id' order by o.created_at) from orders o where o.user_id = auth.uid()), '[]'),
    'biglietti', coalesce((select jsonb_agg(jsonb_build_object('codice', t.code, 'evento', e.title, 'data', e.starts_at, 'stato', t.status, 'ingresso', t.checked_in_at)) from tickets t join events e on e.id = t.event_id where t.user_id = auth.uid()), '[]'),
    'preferiti', coalesce((select jsonb_agg(e.title) from favorites f join events e on e.id = f.event_id where f.user_id = auth.uid()), '[]'),
    'ci_vado', coalesce((select jsonb_agg(e.title) from going g join events e on e.id = g.event_id where g.user_id = auth.uid()), '[]'),
    'segui_persone', coalesce((select jsonb_agg(p.full_name) from follows f join profiles p on p.id = f.followee_id where f.follower_id = auth.uid()), '[]'),
    'segui_artisti', coalesce((select jsonb_agg(artist_slug) from artist_follows where user_id = auth.uid()), '[]'),
    'recensioni', coalesce((select jsonb_agg(jsonb_build_object('evento', e.title, 'voto', r.stars, 'testo', r.body, 'foto', r.photos, 'data', r.created_at)) from reviews r join events e on e.id = r.event_id where r.user_id = auth.uid()), '[]'),
    'notifiche', coalesce((select jsonb_agg(jsonb_build_object('titolo', title, 'testo', body, 'data', created_at)) from notification_queue where user_id = auth.uid()), '[]'),
    'dispositivi_push', (select count(*) from push_subscriptions where user_id = auth.uid())
  );
$$;
grant execute on function public.export_my_data() to authenticated;

-- Cancellazione: i dati personali spariscono; gli ordini restano anonimi per gli obblighi fiscali
create or replace function public.anonymize_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from organizer_members where user_id = p_user and role = 'owner') then
    raise exception 'Sei titolare di un organizzatore: trasferisci o chiudi prima l''organizzazione';
  end if;
  delete from favorites where user_id = p_user;
  delete from going where user_id = p_user;
  delete from follows where follower_id = p_user or followee_id = p_user;
  delete from artist_follows where user_id = p_user;
  delete from push_subscriptions where user_id = p_user;
  delete from notification_queue where user_id = p_user;
  delete from reviews where user_id = p_user;
  delete from organizer_members where user_id = p_user;
  update orders set buyer_name = null, buyer_email = null, buyer_phone = null, age_range = null, origin = null where user_id = p_user;
  update tickets set holder_name = null, status = case when status = 'valid' then 'void' else status end where user_id = p_user;
  update profiles set full_name = 'Account cancellato', phone = null, avatar_url = null, prefs = '{}', discoverable = false,
                      phone_verified = false, deleted_at = now() where id = p_user;
end $$;
revoke execute on function public.anonymize_user(uuid) from public, anon, authenticated;

-- ---------- 4. Verifica del cellulare ----------
alter table public.events add column if not exists require_phone boolean not null default false;
-- per legge i grandi eventi richiedono acquirente identificato: di default oltre 5.000 posti
create or replace function public.events_default_phone() returns trigger language plpgsql as $$
begin if new.capacity > 5000 then new.require_phone := true; end if; return new; end $$;
create trigger events_phone before insert or update of capacity on public.events for each row execute function public.events_default_phone();

-- il numero verificato arriva da Supabase Auth (OTP via SMS): lo copio nel profilo
create or replace function public.sync_phone() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone_confirmed_at is not null and new.phone is not null then
    update profiles set phone = '+' || ltrim(new.phone, '+'), phone_verified = true where id = new.id;
  end if;
  return new;
end $$;
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'auth' and table_name = 'users' and column_name = 'phone_confirmed_at') then
    execute 'create trigger on_auth_phone after insert or update of phone_confirmed_at on auth.users for each row execute function public.sync_phone()';
  end if;
end $$;

-- reserve_order rifiuta gli acquisti senza cellulare verificato quando l'evento lo richiede
create or replace function public.check_phone_before_order() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.kind = 'tickets' and (select require_phone from events where id = new.event_id)
     and not coalesce((select phone_verified from profiles where id = new.user_id), false) then
    raise exception 'Per questo evento serve un numero di cellulare verificato';
  end if;
  return new;
end $$;
create trigger orders_phone before insert on public.orders for each row execute function public.check_phone_before_order();

-- ---------- 5. Amici ----------
create or replace function public.search_people(p_q text)
returns table (id uuid, full_name text, avatar_url text, i_follow boolean, follows_me boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
         exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
    from profiles p
   where p.id <> auth.uid() and p.deleted_at is null and p.discoverable
     and length(trim(p_q)) >= 2 and p.full_name ilike '%' || replace(replace(trim(p_q), '%', ''), '_', '') || '%'
   order by p.full_name limit 20;
$$;
grant execute on function public.search_people(text) to authenticated;

create or replace function public.my_people()
returns table (id uuid, full_name text, avatar_url text, i_follow boolean, follows_me boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.avatar_url,
         exists (select 1 from follows f where f.follower_id = auth.uid() and f.followee_id = p.id),
         exists (select 1 from follows f where f.follower_id = p.id and f.followee_id = auth.uid())
    from profiles p
   where p.deleted_at is null and p.id in (select followee_id from follows where follower_id = auth.uid()
                                          union select follower_id from follows where followee_id = auth.uid());
$$;
grant execute on function public.my_people() to authenticated;

-- ---------- 6. Admin: approvazione organizzatori, moderazione, segnalazioni ----------
alter table public.organizers add column if not exists status text not null default 'pending' check (status in ('pending','approved','rejected','suspended'));
alter table public.organizers add column if not exists review_note text;
update public.organizers set status = 'approved' where verified;
create or replace function public.org_status_default() returns trigger language plpgsql as $$
begin if new.verified and new.status = 'pending' then new.status := 'approved'; end if; return new; end $$;
create trigger organizers_status before insert on public.organizers for each row execute function public.org_status_default();

-- un organizzatore non approvato può preparare bozze ma non pubblicare
create or replace function public.check_org_approved() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published')
     and (select status from organizers where id = new.organizer_id) <> 'approved' then
    raise exception 'Il tuo profilo organizzatore è in attesa di approvazione da parte di City Pulse';
  end if;
  return new;
end $$;
create trigger events_org_approved before insert or update of status on public.events for each row execute function public.check_org_approved();

create table public.reports (
  id          uuid primary key default gen_random_uuid(),
  reporter    uuid references public.profiles(id) on delete set null,
  target_type text not null check (target_type in ('review','event','user','organizer')),
  target_id   uuid not null,
  reason      text not null check (reason in ('spam','offensivo','falso','truffa','altro')),
  details     text check (char_length(details) <= 500),
  status      text not null default 'open' check (status in ('open','resolved','dismissed')),
  resolution  text,
  handled_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  handled_at  timestamptz,
  unique (reporter, target_type, target_id)
);
alter table public.reports enable row level security;
create policy rep_insert on public.reports for insert to authenticated with check (reporter = auth.uid());
create policy rep_own on public.reports for select to authenticated using (reporter = auth.uid() or public.is_admin());
create policy rep_admin on public.reports for update to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.admin_set_organizer(p_org uuid, p_status text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  if p_status not in ('approved','rejected','suspended','pending') then raise exception 'Stato non valido'; end if;
  update organizers set status = p_status, verified = (p_status = 'approved'), review_note = p_note where id = p_org;
  insert into notification_queue (user_id, kind, title, body, url, dedupe)
  select owner_id, 'organizer_' || p_status,
         case p_status when 'approved' then 'Profilo organizzatore approvato' when 'rejected' then 'Profilo organizzatore non approvato' else 'Profilo organizzatore aggiornato' end,
         coalesce(p_note, case p_status when 'approved' then 'Ora puoi pubblicare i tuoi eventi su City Pulse.' else 'Scrivi a City Pulse per maggiori informazioni.' end),
         '/#org', 'org:' || p_org || ':' || p_status || ':' || extract(epoch from now())::bigint
  from organizers where id = p_org;
  if p_status = 'suspended' then update events set status = 'draft' where organizer_id = p_org and status = 'published' and starts_at > now(); end if;
end $$;
grant execute on function public.admin_set_organizer(uuid, text, text) to authenticated;

create or replace function public.admin_moderate(p_report uuid, p_action text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare r reports;
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  select * into r from reports where id = p_report for update;
  if not found then raise exception 'Segnalazione inesistente'; end if;
  if p_action = 'hide' and r.target_type = 'review' then update reviews set hidden = true where id = r.target_id; end if;
  if p_action = 'hide' and r.target_type = 'event' then update events set status = 'draft' where id = r.target_id; end if;
  if p_action = 'hide' and r.target_type = 'organizer' then perform public.admin_set_organizer(r.target_id, 'suspended', p_note); end if;
  update reports set status = case when p_action = 'dismiss' then 'dismissed' else 'resolved' end,
                     resolution = coalesce(p_note, p_action), handled_by = auth.uid(), handled_at = now()
   where id = p_report;
end $$;
grant execute on function public.admin_moderate(uuid, text, text) to authenticated;

create or replace function public.admin_set_review(p_review uuid, p_hidden boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  update reviews set hidden = p_hidden where id = p_review;
end $$;
grant execute on function public.admin_set_review(uuid, boolean) to authenticated;

create or replace function public.admin_overview() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  return jsonb_build_object(
    'organizers_pending', (select count(*) from organizers where status = 'pending'),
    'reports_open', (select count(*) from reports where status = 'open'),
    'events_live', (select count(*) from events where status = 'published' and ends_at > now()),
    'users', (select count(*) from profiles where deleted_at is null),
    'tickets_30d', (select count(*) from tickets where created_at > now() - interval '30 days'),
    'gmv_30d_cents', (select coalesce(sum(total_cents),0) from orders where status = 'paid' and paid_at > now() - interval '30 days'),
    'revenue_30d_cents', (select coalesce(sum(application_fee_cents),0) from orders where status = 'paid' and paid_at > now() - interval '30 days'),
    'refunds_pending', (select count(*) from refunds where status in ('pending','processing'))
  );
end $$;
grant execute on function public.admin_overview() to authenticated;

-- l'admin vede tutti gli organizzatori (anche in attesa) con il titolare
create or replace function public.admin_organizers() returns table (id uuid, name text, status text, created_at timestamptz, owner_name text, owner_email text, events int, review_note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  return query select o.id, o.name, o.status, o.created_at, p.full_name, u.email::text,
    (select count(*)::int from events e where e.organizer_id = o.id), o.review_note
    from organizers o join profiles p on p.id = o.owner_id join auth.users u on u.id = o.owner_id
    order by (o.status = 'pending') desc, o.created_at desc;
end $$;
grant execute on function public.admin_organizers() to authenticated;

-- ---------- vista pubblica aggiornata ----------
-- la vista pubblica mostra anche gli eventi annullati (con il banner), ma non li vende
drop view if exists public.public_events;
create view public.public_events with (security_invoker = true) as
select e.id, e.slug, e.title, e.title_en, e.description, e.description_en, e.category,
       e.starts_at, e.ends_at, e.venue_name, e.zone, e.address, e.map_x, e.map_y, e.lat, e.lng,
       e.cover_url, e.capacity, e.age, e.accessible, e.lineup, e.ticketing_mode, e.partner_url,
       e.status, e.cancel_reason, e.postponed_from, e.refund_deadline, e.require_phone,
       e.organizer_id, o.name as organizer_name, o.verified as organizer_verified,
       coalesce((select min(tt.price_cents) from ticket_types tt where tt.event_id = e.id and not tt.is_addon and not tt.hidden), 0) as min_price_cents,
       greatest(e.capacity - coalesce((select sum(tt.sold + tt.reserved) from ticket_types tt where tt.event_id = e.id and not tt.is_addon), 0), 0) as seats_left,
       exists (select 1 from promotions p where p.event_id = e.id and now() between p.starts_at and p.ends_at) as featured,
       (select count(*) from going g where g.event_id = e.id) as going_count
from events e join organizers o on o.id = e.organizer_id
where e.status in ('published','cancelled') and o.status = 'approved';

grant select on public.public_events to anon, authenticated;

-- etichetta leggibile della segnalazione (es. "Recensione di Marco · Indie Night")
alter table public.reports add column if not exists label text check (char_length(label) <= 200);

-- l'admin vede anche le recensioni nascoste
create or replace function public.admin_reviews(p_limit int default 50)
returns table (id uuid, event_title text, author text, stars int, body text, hidden boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Solo admin'; end if;
  return query select r.id, e.title, p.full_name, r.stars::int, r.body, r.hidden, r.created_at
    from reviews r join events e on e.id = r.event_id join profiles p on p.id = r.user_id
   order by r.created_at desc limit p_limit;
end $$;
grant execute on function public.admin_reviews(int) to authenticated;
