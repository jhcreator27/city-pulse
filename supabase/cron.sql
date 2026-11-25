-- Attività pianificate (Supabase → Database → Extensions: abilita pg_cron e pg_net)
-- 1) Salva la service role key nel Vault (Supabase → Project Settings → Vault) col nome 'service_role_key'
-- 2) Sostituisci <PROJECT-REF> e lancia questo file nel SQL Editor.

-- Libera ogni 5 minuti i posti dei checkout abbandonati
select cron.schedule('cp-expire-orders', '*/5 * * * *', $$ select public.expire_stale_orders(); $$);

-- Ogni 10 minuti: promemoria push 2 ore prima dell'evento a chi ha il biglietto
select cron.schedule('cp-push-reminders', '*/10 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb);
$$);

-- Ogni 5 minuti: esegue i rimborsi in coda (eventi annullati, richieste dopo un rinvio)
select cron.schedule('cp-refunds', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://<PROJECT-REF>.supabase.co/functions/v1/event-refunds',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')),
    body := '{}'::jsonb);
$$);

-- Ogni 5 minuti: lista d'attesa (offerte da 30 minuti, posti liberati)
select cron.schedule('cp-waitlist', '*/5 * * * *', $$ select public.process_waitlist(); $$);
