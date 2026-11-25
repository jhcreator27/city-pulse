# City Pulse · versione di produzione

*Vivi il battito della tua città.* — Una produzione **JH STUDIOS**

Questa cartella contiene tutto il necessario per mettere online City Pulse con:

- **Account**: login con email (link magico), Google e Apple; ruoli *utente*, *organizzatore*, *staff*, *admin*.
- **Database condiviso** (Supabase / Postgres): un evento pubblicato da un organizzatore lo vedono tutti.
- **Pagamenti veri** con **Stripe Connect**: carta, Apple Pay e Google Pay; City Pulse trattiene la sua quota e il resto arriva in automatico sul conto dell'organizzatore.
- **Biglietti con QR firmato** (HMAC) controllati dal server, uso singolo, e **scanner con la fotocamera** del telefono per lo staff.
- **App installabile (PWA)**: icona sulla schermata Home, biglietti visibili anche offline, **notifiche push** vere.

Senza configurazione l'app funziona in **modalità demo** (dati di esempio nel browser), esattamente come l'anteprima.

---

## ⚠️ Prima di vendere biglietti: la regola italiana

In Italia i titoli d'accesso a spettacoli e intrattenimenti vanno emessi con un **sistema di biglietteria automatizzata riconosciuto idoneo dall'Agenzia delle Entrate**, che trasmette i dati degli incassi tramite **SIAE**. Le regole sono state aggiornate dal **provvedimento dell'Agenzia delle Entrate n. 356768 del 25 settembre 2025**. Per alcuni eventi di grandi dimensioni sono previsti anche biglietti nominativi e l'identificazione dell'acquirente (ad esempio con OTP sul cellulare) e un limite di biglietti per acquisto.

Un'app come City Pulse **non diventa automaticamente** un sistema certificato. Le strade possibili:

1. **Partner certificato** (la più rapida): City Pulse fa da vetrina, mappa, calendario e social; la vendita la fa una biglietteria già certificata. Nel modulo evento scegli *Vendita dei biglietti → Biglietteria partner* e incolli il link: il pulsante "Acquista" porta lì.
2. **Integrazione con un fornitore certificato via API**: il checkout resta in City Pulse, ma l'emissione del titolo fiscale avviene sul sistema del fornitore. Il codice è già separato in `reserve_order` / `complete_order`: lì va aggiunta la chiamata al fornitore.
3. **Certificare City Pulse** come sistema di biglietteria: percorso lungo (requisiti tecnici, sigillo fiscale, controllo accessi certificato).

Gli **eventi gratuiti con prenotazione** e gli **accrediti** (guestlist, stampa, staff) si possono gestire subito con City Pulse.

👉 Fai verificare la scelta a un commercialista o a un consulente esperto di biglietteria/SIAE prima del lancio. Lo stesso vale per privacy (GDPR), termini di vendita e rimborsi.

---

## Com'è fatto

```
web/                       ← il sito (statico): va su Vercel, Netlify o Cloudflare Pages
  index.html               ← pagina dell'app: carica lo stile e i moduli in ordine
  css/app.css              ← tutto lo stile (colori City Pulse, chiaro/scuro, stampa PDF)
  js/01-base.js …          ← l'app divisa in 17 moduli per area:
     01-base  02-stato  03-grafica  04-illustrazioni  05-luoghi-artisti-dati
     06-componenti  07-viste  08-staff  09-calendario-social  10-luoghi-artisti
     11-intro  12-organizzatori  13-strumenti-organizzatori  14-lingua  15-quotidiano (account, amici, admin, annulla/rinvia)
     16-pubblico (regalo, rivendita, lista d'attesa, cena, meteo)  17-app (router e azioni)
  backend.js               ← collegamento a Supabase/Stripe (si attiva con config.js)
  config.example.js        ← da copiare in config.js con le tue chiavi pubbliche
  sw.js, manifest.webmanifest, icons/   ← PWA installabile, offline, push
  img/                     ← logo, immagine di anteprima social (og-default.jpg)
  robots.txt, _redirects, vercel.json ← indicizzazione e indirizzi /evento /luogo /artista
supabase/
  migrations/…sql          ← database: tabelle, permessi (RLS), funzioni, artisti seguiti
  functions/               ← codice lato server (Edge Functions)
    create-checkout        ← crea il pagamento Stripe (biglietti o promozione)
    stripe-webhook         ← conferma pagamenti, scadenze, rimborsi
    connect-onboarding     ← collega il conto Stripe dell'organizzatore
    send-push              ← promemoria 2h prima e avvisi dell'organizzatore
    seo                    ← pagine per Google: /evento, /luogo, /artista, /sitemap.xml
  seed.sql                 ← organizzatore JH STUDIOS Live + eventi di esempio
  cron.sql                 ← attività pianificate (scadenza ordini, promemoria, rimborsi)
test/                      ← test automatici del database
```

**Come scorre un acquisto**
1. L'utente sceglie i biglietti → `create-checkout` blocca i posti (`reserve_order`, niente overbooking) e apre la pagina di pagamento Stripe.
2. Stripe incassa: la quota City Pulse (5% + €1,50 di prevendita) resta alla piattaforma, il resto va all'organizzatore.
3. Il webhook riceve la conferma → `complete_order` emette i biglietti con QR firmato (una sola volta, anche se Stripe ripete l'avviso).
4. Se il checkout viene abbandonato, dopo 30 minuti i posti tornano in vendita.
5. Al varco lo staff scansiona il QR → `validate_ticket` controlla firma, evento e uso singolo in modo atomico (due varchi non possono far entrare lo stesso biglietto).

---

## Messa online, passo per passo

Tempo stimato: mezza giornata la prima volta. Prima fai tutto in **modalità test** di Stripe.

### 1. Supabase (database, login, foto)
1. Crea un account su supabase.com e un **nuovo progetto** con regione **EU (Frankfurt)** (dati in Europa, più semplice per il GDPR).
2. Installa la CLI di Supabase sul tuo computer, poi dalla cartella del progetto:
   ```bash
   supabase login
   supabase link --project-ref <PROJECT-REF>
   supabase db push          # applica supabase/migrations
   ```
   In alternativa copia il contenuto del file `.sql` nel **SQL Editor** e premi *Run*.
3. **Authentication → URL Configuration**: *Site URL* = il tuo dominio (es. `https://citypulse.it`), e aggiungilo anche tra i *Redirect URLs*.
4. **Authentication → Providers**:
   - **Email**: attivo (link magico).
   - **Google**: crea le credenziali OAuth su Google Cloud Console e incollale.
   - **Apple**: serve un account Apple Developer (a pagamento); segui la guida di Supabase "Login with Apple".
5. **Authentication → Email templates**: personalizza in italiano le email di accesso.

### 2. Stripe (pagamenti)
1. Crea l'account su stripe.com (attività in Italia) e attiva **Connect** con account **Express**.
2. *Developers → API keys*: copia la **Secret key** (`sk_test_…` in prova).
3. *Developers → Webhooks → Add endpoint*:
   `https://<PROJECT-REF>.supabase.co/functions/v1/stripe-webhook`
   Eventi: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, `checkout.session.async_payment_failed`, `charge.refunded`, `account.updated` (spunta anche "eventi degli account collegati"). Copia il **Signing secret** (`whsec_…`).
4. Apple Pay e Google Pay compaiono da soli nella pagina di pagamento Stripe sui dispositivi compatibili.
5. I codici sconto (es. CITYPULSE10) si creano in Stripe → *Products → Coupons*.

### 3. Notifiche push
Genera la coppia di chiavi VAPID una volta sola:
```bash
npx web-push generate-vapid-keys
```

### 4. Segreti e funzioni del server
Copia `.env.example` in `.env`, compila i valori e:
```bash
supabase secrets set --env-file .env
supabase functions deploy create-checkout
supabase functions deploy stripe-webhook --no-verify-jwt
supabase functions deploy connect-onboarding
supabase functions deploy send-push
supabase functions deploy event-refunds
supabase functions deploy delete-account
supabase functions deploy gift-email
```

**Email con i biglietti.** Crea un account su [resend.com](https://resend.com), verifica il tuo dominio (record DNS che ti indica Resend) e metti nel `.env` `RESEND_API_KEY` e `EMAIL_FROM` (es. `City Pulse <biglietti@citypulse.it>`). Senza chiave le vendite funzionano lo stesso: l'email non parte e l'errore resta in `email_log`.

**SMS per la verifica del cellulare.** In Supabase → Authentication → Providers → **Phone** attiva il provider e collega un servizio SMS (Twilio, MessageBird o Vonage, a pagamento a messaggio). Senza provider la verifica non può partire e gli eventi con biglietti nominativi non si possono comprare.

### 5. Attività pianificate
In Supabase abilita le estensioni **pg_cron** e **pg_net**, salva la *service role key* nel **Vault** col nome `service_role_key`, poi lancia `supabase/cron.sql` (sostituendo `<PROJECT-REF>`).

### 6. Il sito
1. Copia `web/config.example.js` in `web/config.js` e inserisci: URL del progetto, chiave **anon public**, chiave pubblica VAPID, indirizzo del sito. Queste chiavi sono pubbliche per natura: la sicurezza la fanno i permessi del database.
2. Pubblica la cartella `web/` su **Vercel**, **Netlify** o **Cloudflare Pages** (trascina la cartella o collega un repository GitHub). Non serve nessuna compilazione.
3. Collega il tuo **dominio** (es. citypulse.it) dal pannello dell'hosting: l'HTTPS è automatico ed è obbligatorio per PWA, fotocamera e notifiche.

### 7. Pagine per Google (SEO)
1. `supabase functions deploy seo --no-verify-jwt`
2. In `web/vercel.json` (oppure `web/_redirects` per Netlify/Cloudflare) sostituisci `<PROJECT-REF>`; in `web/robots.txt` metti il tuo dominio.
3. Apri `https://tuodominio/evento/<slug>`: deve comparire la pagina dell'evento.
4. In **Google Search Console** aggiungi il dominio e invia `https://tuodominio/sitemap.xml`. Con il **Test dei risultati multimediali** di Google verifica che l'evento venga letto come *Event*.

### 8. Primo avvio
1. Apri il sito, registrati con la tua email.
2. In `supabase/seed.sql` metti la tua email e lancialo dal SQL Editor: diventi **admin**, nasce l'organizzatore **JH STUDIOS Live** con alcuni eventi di esempio.
3. Area organizzatori → **Pagamenti e conto Stripe** → *Attiva i pagamenti*: completi i dati (IBAN, documento) sul modulo di Stripe.
4. Prova un acquisto con la carta di test Stripe `4242 4242 4242 4242`, una data futura qualsiasi e un CVC qualsiasi: il biglietto compare in *I miei biglietti*.
5. Da un secondo telefono entra come staff (aggiungilo da Supabase in `organizer_members` con ruolo `staff`), apri **Check-in → Avvia fotocamera** e scansiona il QR.
6. Quando tutto funziona: chiavi `live` di Stripe al posto di quelle `test`, nuovo webhook live, `supabase secrets set` di nuovo.

---

## Cosa fa ogni ruolo

| Ruolo | Può |
|---|---|
| Utente | vedere eventi, salvare preferiti, "Ci vado", comprare, vedere i propri QR (anche offline), recensire **solo** eventi conclusi per cui aveva il biglietto |
| Staff (di un organizzatore) | scansionare QR e codici ai varchi, lista accrediti, annullare un ingresso per errore, emettere pass ospite |
| Organizzatore (owner/manager) | creare e modificare eventi, foto, line-up, biglietti e capienza; dashboard vendite e ingressi in tempo reale; promozioni "In evidenza"; collegare il conto Stripe |
| Admin (City Pulse) | pannello admin: approva, rifiuta o sospende gli organizzatori, gestisce le segnalazioni, nasconde recensioni; vede i numeri della piattaforma |

Nessuno può darsi un ruolo da solo, emettere biglietti dal proprio telefono, leggere i QR di altri o vedere le statistiche di un altro organizzatore: lo garantiscono i permessi del database, verificati dai test.

---

## Test inclusi

`test/run.sh` crea un database di prova ed esegue 130 verifiche, tra cui: permessi, anti-overbooking, emissione idempotente, QR firmati e non leggibili da altri, ingresso singolo, QR contraffatti, biglietti di altri eventi, recensioni false bloccate, statistiche riservate, ordini scaduti, promozioni, rimborsi, accrediti staff, artisti seguiti e avvisi "nuova data" senza doppioni, prezzi a scaglioni, codici sconto (limiti, scadenza, rilascio), team e inviti, varchi, permessi dei ruoli, messaggi con anti-spam, statistiche aggregate, pubblicazione solo dopo approvazione, annullamento e rinvio con rimborsi e avvisi, rimborso solo del proprio ordine, esportazione e cancellazione dei dati, cellulare obbligatorio sopra i 5.000 posti, ricerca amici, segnalazioni e moderazione riservata agli admin, regali (solo il destinatario accetta, una volta sola, QR vecchio annullato), rivendita al prezzo pagato con precedenza alla lista d'attesa, posti contati giusti anche se il pagamento non va a buon fine, tavoli della cena limitati ai posti disponibili e agli orari compatibili con l'evento. Tutte superate.

Le pagine SEO si provano con `node --experimental-strip-types test/seo/render.test.ts` (dati strutturati, meta, sitemap). L'interfaccia è stata provata in modalità demo e in modalità server con un finto Supabase (`test/mock/`). **Non** è stata provata contro un progetto Supabase e un account Stripe reali: il primo collaudo in modalità test (passo 7) è il momento per farlo.

---

## Strumenti per gli organizzatori

Dalla pagina vendite di ogni evento (Area organizzatori → Eventi → Vendite):

- **Prezzi a scaglioni**: per ogni tipo di biglietto si impostano gli scaglioni (es. primi 100 a €12, fino a 250 a €15, poi prezzo pieno). Il prezzo sale da solo: lo calcola il database biglietto per biglietto (`unit_price`), anche dentro lo stesso ordine. Al pubblico si mostra "Early bird: ancora N, poi €X" (vista `ticket_prices`).
- **Codici sconto**: percentuale o importo fisso, su un evento o su tutti, con numero massimo di utilizzi e scadenza. Il codice si verifica al checkout (`check_discount`), lo sconto diventa un coupon Stripe monouso e la commissione City Pulse si calcola sul prezzo scontato. Se il pagamento non va a buon fine l'utilizzo torna disponibile.
- **Team e varchi**: inviti via email con ruolo **Manager**, **Cassa** (scanner + accrediti) o **Staff varchi** (solo scanner) e varco assegnato. Chi accede con l'email invitata entra nel team (`accept_invites`). Lo scanner registra il varco di ogni ingresso.
- **Statistiche sul pubblico**: fascia d'età e provenienza (facoltative al checkout) e canale d'acquisto, ricavato dal link usato: i link di condivisione portano `?s=whatsapp`, `?s=instagram`… Funzionano anche link UTM (`?utm_source=`). I dati compaiono solo dopo 10 acquisti e sempre in forma aggregata.
- **Messaggi ai partecipanti**: modelli pronti (cambio orario, cambio varco, maltempo, promemoria) inviati come notifica push e nella scheda Notifiche a tutti i possessori di biglietto; massimo uno ogni 10 minuti.
- **Report di fine evento + fattura di cortesia**: pagina stampabile A4 con vendite per tipo, sconti, commissione, netto, ingressi per varco e pubblico, più la fattura di cortesia delle commissioni con i dati di fatturazione dell'organizzatore. "Scarica PDF" usa la stampa del browser ("Salva come PDF").
  ⚠️ In Italia la fattura valida è quella **elettronica** inviata allo SDI: per emetterla in automatico collega un servizio di fatturazione elettronica (o il gestionale del commercialista). La ripartizione IVA delle commissioni va confermata col commercialista.

## Codice, accessibilità e SEO

- **Moduli**: l'app è divisa in `css/app.css` e 15 file in `web/js/`, caricati in ordine come script classici (condividono le stesse variabili, nessuna compilazione). Ogni nuova funzione va nel modulo della sua area; le traduzioni inglesi sono in `14-lingua.js`.
- **Accessibilità** (controllo automatico in `test/a11y/audit.js`, su 21 schermate in tema chiaro e scuro):
  - contrasto del testo almeno 4.5:1 ovunque (il rosso dei pulsanti è `#D00000`, un filo più scuro del rosso del logo, perché il testo bianco sia leggibile; il rosso per i testi piccoli è `#C40000`);
  - le icone non vengono lette dagli screen reader; ogni pulsante e campo ha un nome; immagini con testo alternativo;
  - struttura: area principale, un titolo per ogni pagina, link "Vai al contenuto"; a ogni cambio pagina il lettore annuncia il titolo;
  - tastiera: i segnaposto della mappa si aprono con Invio, le finestre trattengono il focus e lo restituiscono alla chiusura, Esc chiude;
  - animazioni ridotte se il telefono lo chiede.
- **SEO**: ogni evento, luogo e artista ha una pagina vera (`/evento/indie-night-castello`) generata sul server, con titolo e descrizione, anteprima per i social (Open Graph), versione italiana e inglese (`?lang=en`, hreflang) e **dati strutturati schema.org** (Event con data, luogo, prezzi e disponibilità, artisti; Place; PerformingGroup; breadcrumb), così Google può mostrare l'evento nei risultati e in Google Eventi. La sitemap si aggiorna da sola. I link di condivisione puntano a queste pagine.

## Luoghi, artisti e immagini

- **Illustrazioni**: ogni evento senza foto mostra un'illustrazione originale del suo luogo (Teatro Massimo, Castello a Mare, Zisa, Ballarò, Porta Felice, la Cala, Palazzo Riso, Loggiato San Bartolomeo, Mondello, piazze), disegnata in SVG nei colori City Pulse, versione giorno o notte in base all'orario. Quando l'organizzatore carica una copertina, la foto prende il posto dell'illustrazione.
- **Pagine dei luoghi** (`#luoghi`, `#luogo-…`): descrizione, mappa, come arrivare dai Quattro Canti (a piedi o in bus AMAT, con il percorso su Google Maps), prossimi eventi, eventi passati e luoghi vicini. L'elenco dei luoghi è in `VEN` dentro `web/index.html`.
- **Pagine degli artisti** (`#artisti`, `#artista-…`): nascono dalle line-up degli eventi. Il pulsante **Segui** salva il follow (`artist_follows`); quando un organizzatore pubblica un evento con quell'artista in line-up, un trigger mette in coda l'avviso "Nuova data" e la funzione `send-push` lo invia come notifica. Biografie e generi degli artisti di esempio sono in `ART`.

## Uso quotidiano

- **Email di conferma con QR.** Dopo il pagamento (o la prenotazione gratuita) parte un'email con un QR per ogni ingresso, sia dentro il messaggio sia come immagine allegata. Arriva in aggiunta alla ricevuta di Stripe. Un registro (`email_log`) evita i doppioni e tiene traccia degli errori.
- **Annullare o rinviare.** Nella pagina dell'evento l'organizzatore ha *Rinvia* e *Annulla evento*.
  - *Annulla* chiude le vendite, mette in coda il rimborso completo di ogni ordine pagato (commissioni comprese, la quota dell'organizzatore viene ripresa da Stripe) e avvisa tutti via push ed email. I rimborsi li esegue `event-refunds` ogni 5 minuti.
  - *Rinvia* sposta la data, lascia validi i biglietti e dà a chi non può venire un pulsante *Chiedi il rimborso* fino alla scadenza scelta (7, 14 o 30 giorni).
- **Account e privacy** (Profilo → Account e privacy): modifica nome ed email (l'email nuova va confermata), visibilità agli amici, **Scarica i miei dati** in JSON, **Cancella account**. La cancellazione elimina i dati personali; gli ordini restano anonimi per gli obblighi fiscali. Chi è titolare di un organizzatore deve prima trasferirlo o chiuderlo.
- **Cellulare verificato.** Gli eventi oltre 5.000 posti chiedono in automatico un cellulare verificato con SMS prima dell'acquisto; l'organizzatore può attivarlo anche su eventi più piccoli (`require_phone`). Il numero verificato da Supabase viene copiato nel profilo.
- **Amici** (Profilo → Trova e segui amici): ricerca per nome, *Segui*, richieste di chi ti segue con *Ricambia*, suggeriti in base agli eventi in comune. Gli amici vedono solo i tuoi "Ci vado"; chi non vuole farsi trovare lo disattiva.
- **Segnalazioni e pannello admin.** Ogni evento e recensione ha *Segnala*. Gli admin (`profiles.role = 'admin'`) vedono *Pannello admin* nel profilo: organizzatori in attesa da approvare, segnalazioni da risolvere (nascondi o ignora), recensioni da nascondere o ripristinare.
- **Organizzatori nuovi.** Partono *in attesa*: possono preparare bozze ma pubblicano solo dopo l'approvazione. Gli organizzatori già verificati sono approvati in automatico.

---

## Funzioni per il pubblico

- **Regala un biglietto** (I miei biglietti → *Regala*): si inserisce l'email dell'amico e un messaggio. L'amico riceve notifica ed email con il link; quando accetta (con l'account di quell'email) il QR di chi regala smette di funzionare e nasce un biglietto nuovo a nome di chi lo riceve. Finché non accetta, il regalo si può annullare. Per gli eventi con biglietti nominativi anche chi riceve deve avere il cellulare verificato.
- **Rivendita sicura** (*Rivendi*): il prezzo è sempre quello pagato, sconto compreso: non si può chiedere di più. Il QR resta valido finché qualcuno non compra; a quel punto si annulla, chi compra riceve un biglietto nuovo e chi vende viene rimborsato del prezzo del biglietto (il diritto di prevendita resta trattenuto). Il rimborso parte da solo con `event-refunds`. I biglietti del pacchetto cena si possono regalare ma non rivendere.
- **Lista d'attesa**: sugli eventi esauriti compare *Mettimi in lista d'attesa*. Quando un biglietto viene rimesso in vendita, è riservato per 30 minuti al primo in fila (notifica push); poi passa al successivo. Se si liberano posti normali (ordini scaduti, rimborsi) i primi in fila vengono avvisati. Ci pensa `process_waitlist`, ogni 5 minuti da `cron.sql`.
- **Cena + evento**: nella pagina di un evento serale compaiono fino a 3 ristoranti partner a piedi (entro circa 1,5 km), con menu, prezzo a persona e orari che lasciano almeno 75 minuti per arrivare. Si paga tutto insieme; il pagamento viene poi diviso tra organizzatore e ristorante con due trasferimenti Stripe, ognuno meno la commissione City Pulse. Il codice del tavolo compare sul biglietto. I ristoranti sono organizzatori di tipo `restaurant` (con il loro conto Stripe e l'approvazione admin): per ora si aggiungono da Supabase nelle tabelle `restaurants` e `dinner_offers`. I ristoranti della demo sono inventati.
- **Meteo**: per gli eventi segnati *all'aperto* (`events.outdoor`) la pagina mostra cielo, temperatura, probabilità di pioggia e vento all'ora d'inizio, con consigli pratici. Le previsioni arrivano 15 giorni prima. L'organizzatore vede lo stesso riquadro e, se la pioggia è molto probabile, l'invito a valutare un piano B o il rinvio.

---

## Da sapere

- **Foto vere**: carica le foto dei luoghi e degli eventi (con i diritti d'uso) come copertine dall'area organizzatori; per i luoghi si può aggiungere un campo foto all'elenco `VEN`.
- **Scanner offline**: il controllo al varco richiede connessione (così si evitano doppi ingressi tra varchi diversi). Per location senza segnale serve una modalità offline dedicata.
- **GDPR**: l'esportazione e la cancellazione coprono i diritti degli artt. 15, 17 e 20; servono comunque un'informativa privacy e un registro dei trattamenti scritti con un consulente. Per gli ordini anonimizzati verifica con il commercialista il periodo di conservazione (in genere 10 anni).
- **Meteo e licenza**: i dati arrivano da Open-Meteo, senza chiave. L'API gratuita di Open-Meteo è per uso non commerciale: per City Pulse in produzione serve il piano commerciale (o un altro fornitore). Controlla i termini aggiornati sul loro sito.
- **Rivendita e legge**: la rivendita al solo prezzo nominale, attraverso il canale ufficiale, va nella direzione chiesta dalla normativa italiana contro il secondary ticketing. Fai comunque verificare le condizioni d'uso da un consulente prima del lancio.
- **Costi in più**: gli SMS di verifica si pagano a messaggio al provider scelto; Resend ha un piano gratuito con un limite di email al mese.
- **Costi**: Supabase, Vercel/Netlify e Stripe hanno piani gratuiti o a consumo per iniziare; Stripe applica le sue commissioni per transazione; dominio e account Apple Developer sono a parte. Controlla i listini aggiornati sui rispettivi siti.
