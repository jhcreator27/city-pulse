// Service worker di City Pulse: app installabile, biglietti offline, notifiche push
const VERSION = 'cp-v4';
const SHELL = ['./', './index.html', './backend.js', './config.js', './manifest.webmanifest', './css/app.css', './js/01-base.js', './js/02-stato.js', './js/03-grafica.js', './js/04-illustrazioni.js', './js/05-luoghi-artisti-dati.js', './js/06-componenti.js', './js/07-viste.js', './js/08-staff.js', './js/09-calendario-social.js', './js/10-luoghi-artisti.js', './js/11-intro.js', './js/12-organizzatori.js', './js/13-strumenti-organizzatori.js', './js/14-lingua.js', './js/15-quotidiano.js', './js/16-pubblico.js', './js/17-app.js',
  './icons/icon-192.png', './icons/icon-512.png', './img/logo.jpg', './img/logo-sm.jpg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // API Supabase e Stripe: sempre dalla rete (i dati offline li salva l'app)
  if (url.hostname.endsWith('supabase.co') || url.hostname.endsWith('stripe.com')) return;
  // Pagina e file dell'app: prima la rete, se offline la copia salvata
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(r => { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Font, librerie e copertine: copia salvata subito, aggiornata in background
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r.ok || r.type === 'opaque') { const c = r.clone(); caches.open(VERSION).then(x => x.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});

self.addEventListener('push', e => {
  let d = {}; try { d = e.data.json(); } catch { d = { title: 'City Pulse', body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'City Pulse', {
    body: d.body || '', icon: 'icons/icon-192.png', badge: 'icons/badge-72.png', data: { url: d.url || './#esplora' }, vibrate: [80, 40, 80],
  }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = e.notification.data?.url || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) if ('focus' in c) { c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
