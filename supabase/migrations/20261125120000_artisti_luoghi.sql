-- =====================================================================
-- CITY PULSE · artisti seguiti e avvisi "nuova data"
-- Un artista è identificato dallo slug del nome usato nella line-up degli eventi.
-- Quando un evento viene pubblicato con un artista in line-up, chi lo segue
-- riceve una notifica (coda elaborata dalla funzione send-push).
-- =====================================================================

create or replace function public.slugify(t text) returns text
language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(translate(replace(coalesce(t,''), '&', 'and'),
    'àáâäãèéêëìíîïòóôöõùúûüçñ', 'aaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '-', 'g'));
$$;

create table public.artist_follows (
  user_id     uuid references public.profiles(id) on delete cascade,
  artist_slug text not null check (artist_slug ~ '^[a-z0-9-]{1,80}$'),
  created_at  timestamptz not null default now(),
  primary key (user_id, artist_slug)
);
alter table public.artist_follows enable row level security;
create policy af_own on public.artist_follows for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Numero di follower (pubblico, senza rivelare chi segue)
create or replace view public.artist_stats as
select artist_slug, count(*) as followers from public.artist_follows group by artist_slug;
create or replace function public.artist_followers(p_slug text) returns bigint
language sql stable security definer set search_path = public as $$
  select count(*) from artist_follows where artist_slug = p_slug;
$$;
grant execute on function public.artist_followers(text) to anon, authenticated;
revoke select on public.artist_stats from anon, authenticated;

-- Coda notifiche da inviare
create table public.notification_queue (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null,
  title      text not null,
  title_en   text,
  body       text,
  body_en    text,
  url        text,
  dedupe     text unique,               -- evita doppioni (es. stesso artista + stesso evento)
  created_at timestamptz not null default now(),
  sent_at    timestamptz
);
alter table public.notification_queue enable row level security;
-- l'utente vede le proprie notifiche (per la scheda "Notifiche" dell'app)
create policy nq_own on public.notification_queue for select to authenticated using (user_id = auth.uid());

-- Alla pubblicazione (o quando cambia la line-up di un evento pubblicato) avvisa i follower
create or replace function public.queue_new_dates() returns trigger
language plpgsql security definer set search_path = public as $$
declare l jsonb; v_slug text; v_name text;
begin
  if new.status <> 'published' or new.starts_at < now() then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'published' and old.lineup = new.lineup then return new; end if;
  for l in select * from jsonb_array_elements(new.lineup) loop
    v_name := l->>'name';
    v_slug := public.slugify(v_name);
    if v_slug = '' then continue; end if;
    insert into notification_queue (user_id, kind, title, title_en, body, body_en, url, dedupe)
    select f.user_id, 'new_date',
           'Nuova data: ' || v_name, 'New date: ' || v_name,
           new.title || ' · ' || new.venue_name || ' · ' || to_char(new.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           coalesce(new.title_en, new.title) || ' · ' || new.venue_name || ' · ' || to_char(new.starts_at at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
           '/#evento-' || coalesce(new.slug, new.id::text),
           'new_date:' || f.user_id || ':' || v_slug || ':' || new.id
    from artist_follows f where f.artist_slug = v_slug
    on conflict (dedupe) do nothing;
  end loop;
  return new;
end $$;

create trigger events_queue_new_dates after insert or update of status, lineup on public.events
for each row execute function public.queue_new_dates();

-- Usata dalla funzione send-push: prende un blocco di notifiche e le marca come inviate
create or replace function public.take_notifications(p_limit int default 200)
returns setof public.notification_queue
language sql security definer set search_path = public as $$
  update notification_queue set sent_at = now()
  where id in (select id from notification_queue where sent_at is null order by id limit p_limit for update skip locked)
  returning *;
$$;
revoke execute on function public.take_notifications(int) from public, anon, authenticated;
