// Service worker: tiene in cache solo il guscio dell'app, per aprirla senza rete.
// Non mette mai in cache le risposte delle API meteo né le tessere della cartina.
const VERSIONE = "meteo-motorino-v1";
const GUSCIO = [
  "./", "index.html", "stile.css", "principale.js", "preferiti.js", "motore.js", "rete.js", "freschezza.js",
  "fonti/openmeteo.js", "viste/partenza.js", "viste/mappa.js", "viste/giorni.js", "manifest.json",
  "icona-192.png", "icona-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)));
  self.skipWaiting();
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(chiavi.filter((k) => k !== VERSIONE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;
  const url = new URL(richiesta.url);
  // Solo i file dell'app stessa: tutto il resto (API, cartina, librerie esterne) va in rete.
  if (url.origin !== self.location.origin) return;
  evento.respondWith(
    caches.match(richiesta).then((salvata) => salvata || fetch(richiesta).catch(() => caches.match("./index.html"))),
  );
});
