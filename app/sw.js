// Service worker: il guscio dell'app viene preso dalla rete quando c'è (così gli aggiornamenti arrivano),
// e dalla cache quando la rete manca. Non intercetta né mette in cache le API meteo né le tessere.
const PREFISSO = "meteo-motorino-";
const VERSIONE = "meteo-motorino-v2";
const GUSCIO = [
  "./", "index.html", "stile.css", "principale.js", "preferiti.js", "motore.js", "rete.js", "freschezza.js",
  "fonti/openmeteo.js", "viste/partenza.js", "viste/mappa.js", "viste/giorni.js", "manifest.json",
  "icona-192.png", "icona-512.png",
];
const GUSCIO_ASSOLUTI = new Set(GUSCIO.map((p) => new URL(p, self.location).href));
const RADICE = new URL("./", self.location).pathname;
const PAGINA_INGRESSO = new Set([RADICE, RADICE + "index.html"]);

self.addEventListener("install", (evento) => {
  evento.waitUntil(caches.open(VERSIONE).then((c) => c.addAll(GUSCIO)));
  self.skipWaiting();
});

// Elimina solo le cache di questa app, lasciando intatte quelle di altre app sulla stessa origine.
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((chiavi) => Promise.all(
        chiavi.filter((k) => k.startsWith(PREFISSO) && k !== VERSIONE).map((k) => caches.delete(k)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function retePoiCache(richiesta, navigazione) {
  try {
    const risposta = await fetch(richiesta);
    if (risposta.ok) {
      const cache = await caches.open(VERSIONE);
      await cache.put(richiesta, risposta.clone());
    }
    return risposta;
  } catch {
    const salvata = await caches.match(richiesta);
    if (salvata) return salvata;
    // Il ripiego sull'app vale solo per la pagina d'ingresso: una pagina annidata caricherebbe
    // stile e script dalla cartella sbagliata, e l'app non partirebbe.
    if (navigazione && PAGINA_INGRESSO.has(new URL(richiesta.url).pathname)) {
      const app = await caches.match(new URL("./index.html", self.location).href);
      if (app) return app;
    }
    return Response.error();
  }
}

self.addEventListener("fetch", (evento) => {
  const richiesta = evento.request;
  if (richiesta.method !== "GET") return;
  const url = new URL(richiesta.url);
  if (url.origin !== self.location.origin) return; // API, cartina e librerie esterne: nessun intervento
  const navigazione = richiesta.mode === "navigate";
  // Solo i file del guscio e le navigazioni: i dati dell'app e gli altri percorsi restano normali.
  if (!navigazione && !GUSCIO_ASSOLUTI.has(url.href)) return;
  evento.respondWith(retePoiCache(richiesta, navigazione));
});
