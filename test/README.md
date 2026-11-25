# Test

- `run.sh` — crea un database Postgres di prova, applica la migrazione con uno stub
  delle parti di Supabase (`supabase_stub.sql`) ed esegue `test_flows.sql`:
  permessi (RLS), anti-overbooking, emissione idempotente dei biglietti, QR firmati,
  check-in singolo, QR contraffatti, biglietti di altri eventi, recensioni solo verificate,
  statistiche riservate, scadenza ordini, promozioni, rimborsi, accrediti dello staff.
  Richiede Postgres 15+ in ascolto su /tmp:5544 (vedi lo script).
- `mock/fake-supabase.js` — finto client Supabase usato per provare l'interfaccia in
  modalità server senza rete (con Playwright si sostituisce l'import dal CDN).
