-- =====================================================================
-- CITY PULSE · dati iniziali (facoltativi)
-- 1) Registrati nell'app con la tua email (o Google/Apple).
-- 2) Sostituisci l'email qui sotto e lancia questo file dal SQL Editor di Supabase.
-- Crea: il tuo profilo admin, l'organizzatore "JH STUDIOS Live" e gli eventi
-- di esempio di Palermo con i tipi di biglietto. Le date partono da oggi.
-- =====================================================================
do $$
declare
  v_email text := 'LA-TUA-EMAIL@esempio.it';   -- <-- cambia qui
  v_user uuid;
  v_org uuid;
  v_ev uuid;
  d date := (now() at time zone 'Europe/Rome')::date;
begin
  select id into v_user from auth.users where email = v_email;
  if v_user is null then raise exception 'Prima registrati nell''app con %', v_email; end if;

  update public.profiles set role = 'admin', full_name = coalesce(full_name, 'Julian Haramis') where id = v_user;

  insert into public.organizers (name, slug, owner_id, verified)
  values ('JH STUDIOS Live', 'jh-studios-live', v_user, true)
  on conflict (slug) do update set owner_id = excluded.owner_id
  returning id into v_org;

  -- helper inline: evento + tipi di biglietto
  -- Indie Night al Castello (stasera)
  insert into public.events (organizer_id, slug, title, title_en, description, description_en, category, starts_at, ends_at,
    venue_name, zone, address, map_x, map_y, capacity, age, accessible, status, lineup)
  values (v_org, 'indie-night-castello', 'Indie Night al Castello', 'Indie Night at the Castle',
    'Una notte di musica indipendente sotto le stelle, tra le mura del Castello a Mare affacciato sulla Cala. Area street food & birre artigianali dalle 20:30, ingresso con QR code digitale.',
    'A night of independent music under the stars, inside the walls of Castello a Mare overlooking La Cala.',
    'musica', (d + time '21:00') at time zone 'Europe/Rome', (d + 1 + time '01:00') at time zone 'Europe/Rome',
    'Castello a Mare', 'La Cala', 'Via Filippo Patti • Porto della Cala', 70, 47, 400, '18+ anni', false, 'published',
    '[{"time":"21:00","label":"Opening","name":"Giulia & The Echoes","genre":"Dream Pop • Acoustic Set"},{"time":"22:00","label":"Live","name":"Kalsa Club","genre":"Indie Rock • Palermo"},{"time":"23:15","label":"Main","name":"Cosmo Elettrico","genre":"Synth-Pop • Headliner","main":true},{"time":"00:15","label":"Closing","name":"DJ Aria","genre":"Indie Dance & Nu-Disco"}]')
  on conflict (slug) do nothing returning id into v_ev;
  if v_ev is not null then
    insert into public.ticket_types (event_id, name, description, price_cents, quantity, sort) values
      (v_ev, 'Ingresso Standard', 'Accesso all''area principale e a tutti i live.', 1800, 330, 0),
      (v_ev, 'Ingresso VIP & Salta-fila', 'Area fronte palco, ingresso dedicato e 1 drink incluso.', 3200, 70, 1),
      (v_ev, 'Drink & Food Token Pack', '2 consumazioni senza code in cassa.', 1000, 500, 2);
    update public.ticket_types set is_addon = true where event_id = v_ev and name = 'Drink & Food Token Pack';
  end if;

  -- Neon Pulse Festival (tra 2 giorni)
  v_ev := null;
  insert into public.events (organizer_id, slug, title, description, description_en, category, starts_at, ends_at,
    venue_name, zone, address, map_x, map_y, capacity, age, accessible, status, lineup)
  values (v_org, 'neon-pulse-festival', 'Neon Pulse Festival: Electronic Night',
    'La notte elettronica più attesa dell''autunno palermitano: tre padiglioni, visual immersivi e DJ fino all''alba.',
    'The most anticipated electronic night of the Palermo autumn: three pavilions, immersive visuals and DJs until dawn.',
    'musica', (d + 2 + time '22:00') at time zone 'Europe/Rome', (d + 3 + time '04:00') at time zone 'Europe/Rome',
    'Cantieri Culturali alla Zisa', 'Zisa', 'Via Paolo Gili 4, Palermo', 26, 52, 1200, '18+ anni', true, 'published',
    '[{"time":"22:00","label":"Opening","name":"Kaleido","genre":"Melodic Techno"},{"time":"00:00","label":"Main","name":"Nina Volt","genre":"Techno • Headliner","main":true},{"time":"02:00","label":"Closing","name":"Reflex b2b Mara","genre":"House & Breaks"}]')
  on conflict (slug) do nothing returning id into v_ev;
  if v_ev is not null then
    insert into public.ticket_types (event_id, name, price_cents, quantity, sort) values
      (v_ev, 'Early Bird', 2500, 900, 0), (v_ev, 'VIP Lounge', 3900, 300, 1);
  end if;

  -- Festa d'Inverno a Mondello (gratuita, tra 10 giorni)
  v_ev := null;
  insert into public.events (organizer_id, slug, title, title_en, description, category, starts_at, ends_at,
    venue_name, zone, address, map_x, map_y, capacity, age, accessible, status, ticketing_mode)
  values (v_org, 'festa-inverno-mondello', 'Festa d''Inverno a Mondello', 'Winter Festival in Mondello',
    'Luminarie, banda, bancarelle e fuochi sul mare: la festa di piazza che apre la stagione invernale nella borgata di Mondello.',
    'feste', (d + 10 + time '17:00') at time zone 'Europe/Rome', (d + 10 + time '23:00') at time zone 'Europe/Rome',
    'Piazza Mondello', 'Mondello', 'Piazza Mondello, Palermo', 36, 31, 3000, 'Per tutti', true, 'published', 'free')
  on conflict (slug) do nothing returning id into v_ev;
  if v_ev is not null then
    insert into public.ticket_types (event_id, name, description, price_cents, quantity) values
      (v_ev, 'Ingresso libero', 'Prenotazione nominativa gratuita.', 0, 3000);
  end if;

  raise notice 'Fatto: organizzatore % pronto. Ora attiva i pagamenti dall''Area organizzatori.', v_org;
end $$;
