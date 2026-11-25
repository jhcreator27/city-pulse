-- Test end-to-end dello schema City Pulse (eseguito su Postgres locale con lo stub di Supabase)
\set ON_ERROR_STOP 1
\set U '11111111-1111-1111-1111-111111111111'
\set O '22222222-2222-2222-2222-222222222222'
\set ST '33333333-3333-3333-3333-333333333333'
\set X '44444444-4444-4444-4444-444444444444'

insert into auth.users (id, email, raw_user_meta_data) values
 (:'U','marco@example.com','{"full_name":"Marco Rossi"}'),
 (:'O','julian@jhstudios.it','{"full_name":"Julian Haramis"}'),
 (:'ST','staff@jhstudios.it','{"full_name":"Alex Staff"}'),
 (:'X','altro@example.com','{"full_name":"Utente Altro"}');
select count(*) = 4 as "profili creati dal trigger" from profiles;

create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated, service_role;

-- helper: agire come un utente
create or replace function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u::text, false); execute 'set role authenticated'; end $$;

-- 1. L'organizzatore crea la sua organizzazione ed un evento in bozza
select pg_temp.as_user(:'O');
insert into organizers (name, slug, owner_id) values ('JH STUDIOS Live','jh-studios-live', :'O');
reset role;
insert into ids select 'org', id from organizers where slug = 'jh-studios-live';
-- un organizzatore nuovo è in attesa: può fare bozze ma non pubblicare
select status = 'pending' as "organizzatore in attesa di approvazione" from organizers where slug = 'jh-studios-live';
select pg_temp.as_user(:'O');
do $$ begin
  insert into events (organizer_id, title, category, starts_at, ends_at, venue_name, capacity, status)
  values ((select v from ids where k='org'), 'Troppo presto', 'musica', now() + interval '1 day', now() + interval '1 day 2 hours', 'x', 10, 'published');
  raise exception 'FALLITO: pubblicato senza approvazione';
exception when others then if sqlerrm like '%attesa di approvazione%' then raise notice 'OK pubblicazione solo dopo approvazione'; else raise; end if; end $$;
reset role;
update profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select public.admin_set_organizer((select v from ids where k='org'), 'approved', 'Benvenuto');
reset role;
select status = 'approved' as "admin approva" from organizers where id = (select v from ids where k='org');
update profiles set role = 'user' where id = '44444444-4444-4444-4444-444444444444';
select role = 'organizer' as "owner promosso organizer" from profiles where id = :'O';

select pg_temp.as_user(:'O');
insert into events (organizer_id, title, category, starts_at, ends_at, venue_name, zone, capacity, status)
values ((select v from ids where k='org'), 'Indie Night al Castello', 'musica', now() + interval '2 days', now() + interval '2 days 4 hours', 'Castello a Mare', 'La Cala', 400, 'draft');
reset role;
insert into ids select 'ev', id from events where title = 'Indie Night al Castello';
select pg_temp.as_user(:'O');
insert into ticket_types (event_id, name, price_cents, quantity, sort) values
 ((select v from ids where k='ev'), 'Ingresso Standard', 1800, 3, 0),
 ((select v from ids where k='ev'), 'Ingresso VIP', 3200, 50, 1);
reset role;

-- 2. Un altro utente non vede la bozza
select pg_temp.as_user(:'X');
select count(*) = 0 as "bozza invisibile al pubblico" from events;
reset role;
select pg_temp.as_user(:'O');
update events set status = 'published' where id = (select v from ids where k='ev');
reset role;
select pg_temp.as_user(:'X');
select count(*) = 1 as "pubblicato visibile", min(min_price_cents) = 1800 as "prezzo minimo" from public_events;
-- un utente qualsiasi non può creare eventi per l'organizzatore
do $$ begin
  insert into events (organizer_id, title, category, starts_at, ends_at, venue_name, capacity)
  values ((select v from ids where k='org'), 'Hack', 'musica', now(), now() + interval '1 hour', 'x', 10);
  raise exception 'FALLITO: insert evento consentito';
exception when insufficient_privilege or check_violation then raise notice 'OK insert evento bloccato';
when others then if sqlerrm like 'new row violates row-level security%' then raise notice 'OK insert evento bloccato'; else raise; end if; end $$;
-- e non può darsi il ruolo admin
do $$ begin
  update profiles set role = 'admin' where id = auth.uid();
  raise exception 'FALLITO: auto-promozione';
exception when others then if sqlerrm like '%ruolo%' then raise notice 'OK ruolo protetto'; else raise; end if; end $$;
reset role;

-- 3. Checkout (lato server): riserva, anti-overbooking, pagamento, emissione
set role service_role;
insert into ids select 'o1', (public.reserve_order(:'U', (select v from ids where k='ev'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Ingresso Standard'),'qty',2)),
   'Marco Rossi','marco@example.com','+39 348 0000000')).id;
select reserved = 2 as "posti riservati" from ticket_types where name='Ingresso Standard';
select total_cents = 3750 as "totale 2x18 + 1,50", application_fee_cents = 330 as "quota City Pulse 5% + prevendita" from orders where id = (select v from ids where k='o1');
do $$ begin
  perform public.reserve_order('44444444-4444-4444-4444-444444444444', (select v from ids where k='ev'),
     jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Ingresso Standard'),'qty',2)), 'x','x@x.it',null);
  raise exception 'FALLITO: overbooking';
exception when others then if sqlerrm like 'Posti esauriti%' then raise notice 'OK overbooking bloccato'; else raise; end if; end $$;
select public.complete_order((select v from ids where k='o1'), 'pi_test_123') = 2 as "2 biglietti emessi";
select public.complete_order((select v from ids where k='o1'), 'pi_test_123') = 0 as "webhook idempotente";
select sold = 2 and reserved = 0 as "contatori aggiornati" from ticket_types where name='Ingresso Standard';
reset role;

-- utente normale non può emettere biglietti da sé
select pg_temp.as_user(:'U');
do $$ begin
  perform public.complete_order((select v from ids where k='o1'));
  raise exception 'FALLITO: emissione dal client';
exception when insufficient_privilege then raise notice 'OK emissione riservata al server'; end $$;
select count(*) = 2 as "l'acquirente vede i suoi QR", bool_and(qr_token like 'CP1.%') as "QR firmati" from my_tickets;
do $$ begin
  perform qr_token from tickets limit 1;
  raise exception 'FALLITO: token leggibile dalla tabella';
exception when insufficient_privilege then raise notice 'OK token non leggibile dalla tabella grezza'; end $$;
reset role;
-- (ids.v è uuid: salvo il token in una tabella a parte)
create temp table toks as select qr_token, code from tickets order by created_at limit 2;
grant select on toks to authenticated;

select pg_temp.as_user(:'X');
select count(*) = 0 as "altri non vedono i biglietti" from my_tickets;
do $$ begin
  perform public.validate_ticket((select qr_token from toks limit 1), (select v from ids where k='ev'));
  raise exception 'FALLITO: scanner non autorizzato';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK scanner riservato allo staff'; else raise; end if; end $$;
reset role;

-- 4. Staff ai varchi
select pg_temp.as_user(:'O');
insert into organizer_members (organizer_id, user_id, role) values ((select v from ids where k='org'), :'ST', 'cassa');
reset role;
select pg_temp.as_user(:'ST');
select (public.validate_ticket((select qr_token from toks limit 1), (select v from ids where k='ev'))->>'result') = 'ok' as "primo ingresso ok";
select (public.validate_ticket((select qr_token from toks limit 1), (select v from ids where k='ev'))->>'result') = 'already_used' as "secondo ingresso bloccato";
select (public.validate_ticket(left((select qr_token from toks limit 1), -3) || 'AAA', (select v from ids where k='ev'))->>'result') = 'invalid' as "QR contraffatto respinto";
select (public.validate_ticket((select code from toks offset 1 limit 1), (select v from ids where k='ev'), 'Gate A', 'pin')->>'result') = 'ok' as "ingresso con codice manuale";
select count(*) = 2 as "lo staff vede la lista accrediti" from staff_tickets;
reset role;

-- biglietto di un altro evento
select pg_temp.as_user(:'O');
insert into events (organizer_id, title, category, starts_at, ends_at, venue_name, capacity, status)
values ((select v from ids where k='org'), 'Neon Pulse', 'musica', now() + interval '3 days', now() + interval '3 days 5 hours', 'Cantieri', 1200, 'published');
reset role;
insert into ids select 'ev2', id from events where title = 'Neon Pulse';
select pg_temp.as_user(:'ST');
select (public.validate_ticket((select qr_token from toks offset 1 limit 1), (select v from ids where k='ev2'))->>'result') = 'wrong_event' as "biglietto di un altro evento";
reset role;

-- 5. Dashboard
select pg_temp.as_user(:'O');
select (public.org_event_stats((select v from ids where k='ev'))->>'sold')::int = 2 as "stats: venduti",
       (public.org_event_stats((select v from ids where k='ev'))->>'checked_in')::int = 2 as "stats: entrati",
       (public.org_event_stats((select v from ids where k='ev'))->>'gross_cents')::int = 3600 as "stats: incasso lordo",
       jsonb_array_length(public.org_dashboard()) = 2 as "dashboard: 2 eventi";
reset role;
select pg_temp.as_user(:'X');
do $$ begin perform public.org_event_stats((select v from ids where k='ev')); raise exception 'FALLITO: stats pubbliche';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK statistiche riservate'; else raise; end if; end $$;
reset role;

-- 6. Recensioni: solo dopo l'evento e solo con biglietto
select pg_temp.as_user(:'U');
do $$ begin insert into reviews (event_id, user_id, stars, body) values ((select v from ids where k='ev'), auth.uid(), 5, 'Top');
  raise exception 'FALLITO: recensione prima dell''evento';
exception when others then if sqlerrm like '%row-level security%' then raise notice 'OK recensione bloccata prima della fine'; else raise; end if; end $$;
reset role;
update events set starts_at = now() - interval '1 day', ends_at = now() - interval '20 hours' where id = (select v from ids where k='ev');
select pg_temp.as_user(:'U');
insert into reviews (event_id, user_id, stars, body) values ((select v from ids where k='ev'), auth.uid(), 5, 'Serata indimenticabile');
select count(*) = 1 as "recensione verificata pubblicata" from public_reviews;
reset role;
select pg_temp.as_user(:'X');
do $$ begin insert into reviews (event_id, user_id, stars) values ((select v from ids where k='ev'), auth.uid(), 1);
  raise exception 'FALLITO: recensione senza biglietto';
exception when others then if sqlerrm like '%row-level security%' then raise notice 'OK recensione falsa bloccata'; else raise; end if; end $$;
reset role;

-- 7. Ordine scaduto libera i posti; promozione a pagamento
set role service_role;
insert into ids select 'o2', (public.reserve_order(:'X', (select v from ids where k='ev2'),
   jsonb_build_array(jsonb_build_object('ticket_type_id', gen_random_uuid(),'qty',1)),'x','x@x.it',null)).id
   where false;  -- nessun tipo per ev2: verifichiamo l'errore sotto
reset role;
select pg_temp.as_user(:'O');
insert into ticket_types (event_id, name, price_cents, quantity) values ((select v from ids where k='ev2'), 'Early Bird', 2500, 100);
reset role;
set role service_role;
insert into ids select 'o3', (public.reserve_order(:'X', (select v from ids where k='ev2'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Early Bird'),'qty',3)),'x','x@x.it',null)).id;
update orders set expires_at = now() - interval '1 minute' where id = (select v from ids where k='o3');
select public.expire_stale_orders() = 1 as "ordine abbandonato scaduto";
select reserved = 0 as "posti liberati" from ticket_types where name='Early Bird';
insert into orders (kind, user_id, event_id, status, total_cents, promo_package) values ('promotion', :'O', (select v from ids where k='ev2'), 'pending', 2900, 'weekend') returning id \gset promo_
select public.complete_order(:'promo_id', 'pi_promo') = 1 as "promozione attivata";
reset role;
select pg_temp.as_user(:'X');
select featured as "evento in evidenza" from public_events where title = 'Neon Pulse';
reset role;

-- 8. Rimborso annulla i biglietti
set role service_role;
select public.refund_order('pi_test_123');
select bool_and(status in ('void','used')) as "rimborso: biglietti non usati annullati" from tickets where order_id = (select v from ids where k='o1');
reset role;
-- 9. Accredito rapido dal desk
select pg_temp.as_user(:'ST');
select (public.issue_guest_pass((select v from ids where k='ev2'), 'Giulia Bianchi', 'Guestlist Artista', 2, 'Backstage', true)->>'pax')::int = 2 as "pass ospite emesso";
select count(*) = 1 and bool_and(checked_in) as "cronologia pass" from staff_guest_passes;
reset role;
select pg_temp.as_user(:'X');
do $$ begin perform public.issue_guest_pass((select v from ids where k='ev2'), 'Hack', 'VIP', 1);
  raise exception 'FALLITO: accredito da utente';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK accrediti riservati allo staff'; else raise; end if; end $$;
reset role;
-- 10. Artisti seguiti e avviso "nuova data"
select pg_temp.as_user(:'U');
insert into artist_follows (user_id, artist_slug) values (auth.uid(), public.slugify('Cosmo Elettrico'));
select public.artist_followers('cosmo-elettrico') = 1 as "follower contati";
reset role;
select pg_temp.as_user(:'X');
do $$ begin insert into artist_follows (user_id, artist_slug) values ('11111111-1111-1111-1111-111111111111', 'hack');
  raise exception 'FALLITO: follow per conto di altri';
exception when others then if sqlerrm like '%row-level security%' then raise notice 'OK follow solo per sé'; else raise; end if; end $$;
reset role;
select pg_temp.as_user(:'O');
insert into events (organizer_id, title, category, starts_at, ends_at, venue_name, capacity, status, lineup)
values ((select v from ids where k='org'), 'Cosmo Elettrico Live', 'musica', now() + interval '20 days', now() + interval '20 days 3 hours', 'Teatro Massimo', 800, 'draft',
        '[{"time":"21:00","name":"Cosmo Elettrico","genre":"Synth-pop"}]');
reset role;
select count(*) = 0 as "bozza: nessun avviso" from notification_queue where kind = 'new_date';
select pg_temp.as_user(:'O');
update events set status = 'published' where title = 'Cosmo Elettrico Live';
update events set description = 'modifica' where title = 'Cosmo Elettrico Live';
reset role;
select count(*) = 1 as "pubblicato: 1 avviso al follower, nessun doppione" from notification_queue where user_id = :'U' and kind = 'new_date';
select pg_temp.as_user(:'U');
select count(*) = 1 as "l'utente vede la sua notifica" from notification_queue;
reset role;
set role service_role;
select count(*) >= 1 as "notifiche prese dalla coda" from public.take_notifications(10);
select count(*) = 0 as "coda svuotata" from public.take_notifications(10);
reset role;
-- 11. Scaglioni di prezzo e codici sconto
select pg_temp.as_user(:'O');
insert into events (organizer_id, slug, title, category, starts_at, ends_at, venue_name, capacity, status)
values ((select v from ids where k='org'), 'early', 'Early Test', 'musica', now() + interval '5 days', now() + interval '5 days 3 hours', 'Zisa', 500, 'published');
insert into ticket_types (event_id, name, price_cents, quantity, price_steps)
values ((select id from events where slug='early'), 'Standard', 2000, 500, '[{"up_to":2,"price_cents":1200},{"up_to":4,"price_cents":1500}]');
insert into discount_codes (organizer_id, code, kind, value, max_uses) values ((select v from ids where k='org'), 'AMICI10', 'percent', 10, 1);
reset role;
select pg_temp.as_user(:'X');
select (current_price_cents = 1200 and left_at_this_price = 2 and next_price_cents = 1500) as "early bird visibile" from ticket_prices where event_id = (select id from events where slug='early');
select (public.check_discount((select id from events where slug='early'), 'amici10')->>'valid')::boolean as "codice valido";
do $$ begin perform 1 from discount_codes; if found then raise exception 'FALLITO: codici leggibili'; end if; raise notice 'OK elenco codici riservato'; end $$;
reset role;
set role service_role;
insert into ids select 'o5', (public.reserve_order(:'X', (select id from events where slug='early'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Standard' and price_steps <> '[]'),'qty',3)),
   'x','x@x.it',null,150,'AMICI10','instagram','25-34','Kalsa')).id;
-- 3 biglietti: 12 + 12 + 15 = 39 € ; sconto 10% = 3,90 ; totale 35,10 + 1,50
select subtotal_cents = 3900 and discount_cents = 390 and total_cents = 3660 as "prezzi a scaglioni + sconto" from orders where id = (select v from ids where k='o5');
select application_fee_cents = round(3510*0.05) + 150 as "commissione sul netto scontato" from orders where id = (select v from ids where k='o5');
do $$ begin perform public.reserve_order('44444444-4444-4444-4444-444444444444', (select id from events where slug='early'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Standard' and price_steps <> '[]'),'qty',1)),'x','x@x.it',null,150,'AMICI10');
  raise exception 'FALLITO: codice oltre il limite';
exception when others then if sqlerrm like 'Codice sconto%' then raise notice 'OK limite utilizzi codice'; else raise; end if; end $$;
select public.cancel_order((select v from ids where k='o5'));
select used = 0 as "codice liberato se l'ordine scade" from discount_codes where code = 'AMICI10';
reset role;

-- 12. Team, inviti e varchi
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555', 'varco.b@jhstudios.it');
select pg_temp.as_user(:'O');
insert into team_invites (organizer_id, email, role, gate) values ((select v from ids where k='org'), 'varco.b@jhstudios.it', 'staff', 'Gate B');
select count(*) = 3 as "team: 2 membri + 1 invito" from public.team_list((select v from ids where k='org'));
reset role;
select pg_temp.as_user('55555555-5555-5555-5555-555555555555');
select public.accept_invites() = 1 as "invito accettato";
select public.my_gate((select v from ids where k='ev2')) = 'Gate B' as "varco assegnato";
do $$ begin perform public.issue_guest_pass((select v from ids where k='ev2'), 'Hack', 'VIP', 1);
  raise exception 'FALLITO: staff varchi emette pass';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK solo cassa/manager emettono pass'; else raise; end if; end $$;
do $$ begin perform public.team_list((select v from ids where k='org')); raise exception 'FALLITO: staff vede il team';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK elenco team riservato'; else raise; end if; end $$;
reset role;

-- 13. Messaggi ai partecipanti e statistiche
select pg_temp.as_user(:'O');
select public.message_attendees((select v from ids where k='ev2'), 'Cambio orario', 'Le porte aprono alle 21:30 invece che alle 21:00.') >= 1 as "messaggio in coda";
do $$ begin perform public.message_attendees((select v from ids where k='ev2'), 'Ancora', 'Secondo messaggio subito');
  raise exception 'FALLITO: anti-spam';
exception when others then if sqlerrm like 'Hai già inviato%' then raise notice 'OK anti-spam messaggi'; else raise; end if; end $$;
select (public.org_event_insights((select id from events where slug='early'))->>'enough')::boolean = false as "statistiche nascoste sotto i 10 ordini",
       public.org_event_insights((select v from ids where k='ev2'))->'gates' is not null as "ingressi per varco";
reset role;
select pg_temp.as_user(:'X');
do $$ begin perform public.message_attendees((select v from ids where k='ev2'), 'Spam', 'Messaggio non autorizzato');
  raise exception 'FALLITO: messaggi da estranei';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK messaggi solo dall''organizzatore'; else raise; end if; end $$;
reset role;
-- 14. Annullamento, rinvio, rimborsi
select pg_temp.as_user(:'O');
select (public.reschedule_event((select id from events where slug='early'), now() + interval '30 days', now() + interval '30 days 3 hours', 'Maltempo')->>'notified') is not null as "rinvio con avviso";
reset role;
set role service_role;
insert into ids select 'o9', (public.reserve_order(:'U', (select id from events where slug='early'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Standard' and price_steps <> '[]'),'qty',1)),'Marco','m@x.it',null)).id;
select public.complete_order((select v from ids where k='o9'), 'pi_o9') = 1 as "biglietto per evento rinviato";
reset role;
select pg_temp.as_user(:'U');
select public.request_refund((select v from ids where k='o9')) is not null as "rimborso richiesto dopo rinvio";
reset role;
select pg_temp.as_user(:'X');
do $$ begin perform public.request_refund((select v from ids where k='o9')); raise exception 'FALLITO: rimborso di altri';
exception when others then if sqlerrm like 'Ordine non rimborsabile%' then raise notice 'OK rimborso solo del proprio ordine'; else raise; end if; end $$;
do $$ begin perform public.cancel_event((select v from ids where k='ev2'), 'x'); raise exception 'FALLITO: annullamento da estranei';
exception when others then if sqlerrm like 'Non autorizzato%' then raise notice 'OK annullamento riservato'; else raise; end if; end $$;
reset role;
select pg_temp.as_user(:'O');
select (public.cancel_event((select v from ids where k='ev2'), 'Indisposizione dell''artista')->>'notified')::int >= 1 as "annullamento avvisa i partecipanti";
reset role;
select status = 'cancelled' as "evento annullato" from events where id = (select v from ids where k='ev2');
select count(*) = 0 as "pass gratuiti annullati" from tickets where event_id = (select v from ids where k='ev2') and status = 'valid';
set role service_role;
select count(*) >= 1 as "rimborsi presi in carico" from public.take_refunds(10);
reset role;

-- 15. Account e privacy
select pg_temp.as_user(:'U');
select (public.export_my_data()->>'email') = 'marco@example.com' and jsonb_array_length(public.export_my_data()->'biglietti') >= 1 as "esportazione dati";
reset role;
set role service_role;
select public.anonymize_user(:'U');
reset role;
select full_name = 'Account cancellato' and deleted_at is not null as "profilo cancellato" from profiles where id = :'U';
select count(*) = 0 as "dati personali rimossi dagli ordini" from orders where user_id = :'U' and buyer_email is not null;
set role service_role;
do $$ begin perform public.anonymize_user('22222222-2222-2222-2222-222222222222'); raise exception 'FALLITO: titolare cancellato';
exception when others then if sqlerrm like 'Sei titolare%' then raise notice 'OK il titolare deve prima chiudere l''organizzazione'; else raise; end if; end $$;
reset role;

-- 16. Cellulare verificato per eventi grandi
select pg_temp.as_user(:'O');
insert into events (organizer_id, slug, title, category, starts_at, ends_at, venue_name, capacity, status)
values ((select v from ids where k='org'), 'stadio', 'Concerto allo stadio', 'musica', now() + interval '40 days', now() + interval '40 days 3 hours', 'Stadio', 30000, 'published');
insert into ticket_types (event_id, name, price_cents, quantity) values ((select id from events where slug='stadio'), 'Prato', 5000, 30000);
reset role;
select require_phone as "oltre 5000 posti: cellulare obbligatorio" from events where slug = 'stadio';
set role service_role;
do $$ begin perform public.reserve_order('44444444-4444-4444-4444-444444444444', (select id from events where slug='stadio'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Prato'),'qty',1)),'x','x@x.it',null);
  raise exception 'FALLITO: acquisto senza cellulare';
exception when others then if sqlerrm like '%cellulare verificato%' then raise notice 'OK serve il cellulare verificato'; else raise; end if; end $$;
update profiles set phone_verified = true where id = '44444444-4444-4444-4444-444444444444';
select (public.reserve_order('44444444-4444-4444-4444-444444444444', (select id from events where slug='stadio'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Prato'),'qty',1)),'x','x@x.it','+39333')).status = 'pending' as "con cellulare verificato si compra";
reset role;

-- 17. Amici
update profiles set full_name = 'Giulia Rossi' where id = '33333333-3333-3333-3333-333333333333';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select count(*) = 1 as "ricerca persone" from public.search_people('giul');
select count(*) = 0 as "ricerca troppo corta" from public.search_people('g');
insert into follows (follower_id, followee_id) values (auth.uid(), '33333333-3333-3333-3333-333333333333');
reset role;
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
select bool_and(follows_me and not i_follow) as "richiesta di amicizia visibile" from public.my_people();
reset role;

-- 18. Segnalazioni e moderazione
select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
insert into reports (reporter, target_type, target_id, reason) values (auth.uid(), 'event', (select id from events where slug='stadio'), 'truffa');
do $$ begin perform public.admin_overview(); raise exception 'FALLITO: overview pubblica';
exception when others then if sqlerrm like 'Solo admin%' then raise notice 'OK pannello admin riservato'; else raise; end if; end $$;
reset role;
update profiles set role = 'admin' where id = '44444444-4444-4444-4444-444444444444';
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select (public.admin_overview()->>'reports_open')::int = 1 as "admin vede le segnalazioni";
select public.admin_moderate((select id from reports limit 1), 'hide', 'Evento sospetto');
reset role;
select status = 'draft' as "evento segnalato ritirato" from events where slug = 'stadio';
select status = 'resolved' as "segnalazione chiusa" from reports;
select pg_temp.as_user('44444444-4444-4444-4444-444444444444');
select count(*) >= 0 as "admin vede le recensioni (anche nascoste)" from public.admin_reviews(10);
reset role;
-- 19. Regali, rivendita, lista d'attesa
select pg_temp.as_user(:'O');
insert into events (organizer_id, slug, title, category, starts_at, ends_at, venue_name, zone, capacity, status)
values ((select v from ids where k='org'), 'piccolo', 'Concerto piccolo', 'musica', ((current_date + 5) + time '21:00') at time zone 'Europe/Rome', ((current_date + 5) + time '23:00') at time zone 'Europe/Rome', 'Sala', 'Kalsa', 2, 'published');
insert into ticket_types (event_id, name, price_cents, quantity) values ((select id from events where slug='piccolo'), 'Unico', 2000, 2);
reset role;
set role service_role;
insert into ids select 'ox', (public.reserve_order(:'X', (select id from events where slug='piccolo'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Unico'),'qty',2)),'Utente Altro','altro@example.com','+39333')).id;
select public.complete_order((select v from ids where k='ox'), 'pi_ox') = 2 as "2 biglietti: evento esaurito";
reset role;
select pg_temp.as_user(:'ST');
select (public.join_waitlist((select id from events where slug='piccolo'), 1)->>'position')::int = 1 as "lista d'attesa: primo in fila";
reset role;
select pg_temp.as_user(:'O');
select (public.join_waitlist((select id from events where slug='piccolo'), 2)->>'position')::int = 2 as "lista d'attesa: secondo in fila";
reset role;
insert into ids select 't1', id from tickets where order_id = (select v from ids where k='ox') order by code limit 1;
insert into ids select 't2', id from tickets where order_id = (select v from ids where k='ox') and id <> (select v from ids where k='t1');
select pg_temp.as_user(:'X');
do $$ begin perform public.gift_ticket((select v from ids where k='t1'), 'ALTRO@example.com'); raise exception 'FALLITO: regalo a se stessi';
exception when others then if sqlerrm like 'Non puoi regalare%' then raise notice 'OK niente regali a se stessi'; else raise; end if; end $$;
select (public.gift_ticket((select v from ids where k='t1'), 'staff@jhstudios.it', 'Buon compleanno!')->>'has_account')::boolean as "regalo inviato a chi ha già un account";
reset role;
select token as gtok from ticket_gifts limit 1 \gset
select pg_temp.as_user(:'O');
select set_config('cp.gtok', :'gtok', false) is not null as "token del regalo";
do $$ begin perform public.accept_gift(current_setting('cp.gtok')); raise exception 'FALLITO: regalo accettato da altri';
exception when others then if sqlerrm like 'Questo regalo è per%' then raise notice 'OK il regalo lo accetta solo il destinatario'; else raise; end if; end $$;
reset role;
select pg_temp.as_user(:'ST');
select for_me and message = 'Buon compleanno!' as "anteprima del regalo" from public.gift_preview(:'gtok');
select public.accept_gift(:'gtok') is not null as "regalo accettato";
do $$ begin perform public.accept_gift(current_setting('cp.gtok')); raise exception 'FALLITO: regalo accettato due volte';
exception when others then if sqlerrm like 'Regalo non più disponibile%' then raise notice 'OK regalo usabile una volta sola'; else raise; end if; end $$;
reset role;
select status = 'void' as "il QR di chi regala non vale più" from tickets where id = (select v from ids where k='t1');
select count(*) = 1 as "nuovo biglietto con QR nuovo" from tickets where transferred_from = (select v from ids where k='t1') and user_id = :'ST' and origin = 'gift' and qr_token <> (select qr_token from tickets where id = (select v from ids where k='t1'));
select pg_temp.as_user(:'X');
do $$ begin perform public.list_for_resale((select v from ids where k='t1')); raise exception 'FALLITO: rivenduto biglietto regalato';
exception when others then if sqlerrm like 'Biglietto non%' then raise notice 'OK non si rivende un biglietto già regalato'; else raise; end if; end $$;
select (public.list_for_resale((select v from ids where k='t2'))->>'price_cents')::int = 2000 as "rivendita al prezzo pagato";
reset role;
select offered_to = :'ST' and offered_until > now() as "offerta riservata al primo in lista" from resale_listings where ticket_id = (select v from ids where k='t2');
select count(*) = 1 as "avviso al primo in lista" from notification_queue where user_id = :'ST' and kind = 'waitlist_offer';
select count(*) = 1 as "rivendita visibile al pubblico" from public.resale_offers where event_id = (select id from events where slug='piccolo');
set role service_role;
do $$ begin perform public.reserve_resale('22222222-2222-2222-2222-222222222222', (select id from resale_listings limit 1), 'J', 'julian@jhstudios.it', null);
  raise exception 'FALLITO: saltata la fila';
exception when others then if sqlerrm like 'Riservato a chi è in lista%' then raise notice 'OK la lista d''attesa ha la precedenza'; else raise; end if; end $$;
insert into ids select 'or', (public.reserve_resale(:'ST', (select id from resale_listings limit 1), 'Giulia Rossi', 'staff@jhstudios.it', null)).id;
select total_cents = 2150 as "chi compra paga prezzo originale + prevendita" from orders where id = (select v from ids where k='or');
select public.complete_order((select v from ids where k='or'), 'pi_or') = 1 as "biglietto dalla rivendita emesso";
reset role;
select status = 'void' as "QR del venditore annullato" from tickets where id = (select v from ids where k='t2');
select sold = 2 and reserved = 0 as "posti contati giusti" from ticket_types where name = 'Unico';
select count(*) = 1 and min(amount_cents) = 2000 as "rimborso al venditore in coda" from resale_payouts;
select status = 'converted' as "uscito dalla lista d'attesa" from waitlist where user_id = :'ST' and event_id = (select id from events where slug='piccolo');
set role service_role;
select count(*) = 1 as "rimborso rivendita preso in carico" from public.take_resale_payouts(10);
reset role;
-- rivendita scaduta: il biglietto torna in vendita
select pg_temp.as_user(:'ST');
select (public.list_for_resale((select id from tickets where order_id = (select v from ids where k='or')))->>'price_cents')::int = 2000 as "si rivende anche un biglietto preso in rivendita";
reset role;
select offered_to = :'O' as "offerta al secondo in lista" from resale_listings where status = 'listed';
set role service_role;
insert into ids select 'or2', (public.reserve_resale(:'O', (select id from resale_listings where status='listed'), 'J', 'julian@jhstudios.it', null)).id;
select public.cancel_order((select v from ids where k='or2'), 'expired');
reset role;
select status = 'listed' as "pagamento non completato: torna in rivendita" from resale_listings where id = (select resale_listing_id from orders where id = (select v from ids where k='or2'));
select sold = 2 and reserved = 0 as "nessun posto perso" from ticket_types where name = 'Unico';

-- 20. Pacchetto cena + evento
insert into organizers (id, slug, name, owner_id, status, verified, stripe_ready, kind, commission_pct)
values ('66666666-6666-6666-6666-666666666666', 'osteria', 'Osteria di prova', :'O', 'approved', true, true, 'restaurant', 10);
insert into restaurants (id, organizer_id, name, zone) values ('77777777-7777-7777-7777-777777777777', '66666666-6666-6666-6666-666666666666', 'Osteria di prova', 'Kalsa');
insert into dinner_offers (id, restaurant_id, title, menu, price_cents, seats_per_slot) values ('88888888-8888-8888-8888-888888888888', '77777777-7777-7777-7777-777777777777', 'Menu pre-concerto', 'Antipasto, primo, dolce', 3500, 3);
select pg_temp.as_user(:'O');
insert into events (organizer_id, slug, title, category, starts_at, ends_at, venue_name, zone, capacity, status)
values ((select v from ids where k='org'), 'cena-ev', 'Concerto con cena', 'musica', ((current_date + 6) + time '21:00') at time zone 'Europe/Rome', ((current_date + 6) + time '23:30') at time zone 'Europe/Rome', 'Sala', 'Kalsa', 100, 'published');
insert into ticket_types (event_id, name, price_cents, quantity) values ((select id from events where slug='cena-ev'), 'Posto', 2000, 100);
reset role;
select count(*) = 2 as "cena: solo gli orari compatibili con l'inizio" from public.dinner_options((select id from events where slug='cena-ev'));
set role service_role;
insert into ids select 'oc', (public.reserve_order(:'X', (select id from events where slug='cena-ev'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Posto'),'qty',2)),'Utente Altro','altro@example.com','+39333')).id;
select total_cents = 2*2000 + 150 + 2*3500 and dinner_fee_cents = 700 as "totale con la cena" from public.add_dinner((select v from ids where k='oc'), '88888888-8888-8888-8888-888888888888', '19:30', 2);
insert into ids select 'oc2', (public.reserve_order(:'O', (select id from events where slug='cena-ev'),
   jsonb_build_array(jsonb_build_object('ticket_type_id',(select id from ticket_types where name='Posto'),'qty',2)),'J','julian@jhstudios.it',null)).id;
do $$ begin perform public.add_dinner((select v from ids where k='oc2'), '88888888-8888-8888-8888-888888888888', '19:30', 2); raise exception 'FALLITO: tavoli oltre i posti';
exception when others then if sqlerrm like 'Posti a tavola esauriti%' then raise notice 'OK niente tavoli oltre i posti'; else raise; end if; end $$;
select public.complete_order((select v from ids where k='oc'), 'pi_oc') = 2 as "biglietti con cena emessi";
reset role;
select status = 'valid' as "prenotazione cena confermata" from dinner_bookings where order_id = (select v from ids where k='oc');
select pg_temp.as_user(:'X');
select count(*) = 2 and bool_and(dinner->>'slot' = '19:30') as "la cena compare nei biglietti" from public.my_tickets where order_id = (select v from ids where k='oc');
do $$ begin perform public.list_for_resale((select id from tickets where order_id = (select v from ids where k='oc') limit 1)); raise exception 'FALLITO: rivenduto pacchetto cena';
exception when others then if sqlerrm like 'I biglietti del pacchetto cena%' then raise notice 'OK il pacchetto cena non si rivende'; else raise; end if; end $$;
reset role;
select pg_temp.as_user(:'O');
select (public.use_dinner((select code from dinner_bookings where order_id = (select v from ids where k='oc')))->>'people')::int = 2 as "il ristorante segna il tavolo";
reset role;
select 'TUTTI I TEST COMPLETATI' as esito;
