// Copia questo file in "config.js" e inserisci i valori del tuo progetto.
// Se config.js manca o supabaseUrl è vuoto, l'app parte in modalità demo.
window.CP_CONFIG = {
  supabaseUrl: 'https://XXXXXXXX.supabase.co',     // Supabase → Project Settings → API
  supabaseAnonKey: 'eyJ...',                        // chiave "anon public" (è pubblica per natura)
  vapidPublicKey: 'BK...',                          // chiave pubblica VAPID per le notifiche push
  siteUrl: 'https://citypulse.it'                   // indirizzo dell'app, senza "/" finale
};
