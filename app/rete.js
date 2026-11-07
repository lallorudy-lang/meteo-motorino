// Rete: download con timeout, cache in memoria, deduplica e gestione del limite 429.
// Usata da tutte le fonti (Open-Meteo, radar, pluviometri).

export class ErroreRete extends Error {
  constructor(messaggio, stato, url) {
    super(messaggio);
    this.name = "ErroreRete";
    this.stato = stato;
    this.url = url;
  }
}

const cache = new Map();      // url -> { valore, scadenza }
const inCorso = new Map();    // url -> Promise

/** Svuota la cache in memoria (usata dai test). */
export function svuotaCache() {
  cache.clear();
  inCorso.clear();
}

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Secondi indicati da Retry-After, al massimo 10. */
function attesaDa(intestazione) {
  const s = Number(intestazione);
  if (!Number.isFinite(s) || s < 0) return 1000;
  return Math.min(10, s) * 1000;
}

async function unTentativo(url, timeoutMs) {
  const controllo = new AbortController();
  const timer = setTimeout(() => controllo.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controllo.signal, headers: { accept: "application/json" } });
  } catch (e) {
    if (e && e.name === "AbortError") throw new ErroreRete(`Nessuna risposta entro ${timeoutMs / 1000} secondi`, 0, url);
    throw new ErroreRete(`Connessione non riuscita: ${e && e.message}`, 0, url);
  } finally {
    clearTimeout(timer);
  }
}

async function scaricaVero(url, timeoutMs) {
  let r = await unTentativo(url, timeoutMs);
  if (r.status === 429) {
    await attesa(attesaDa(r.headers.get("retry-after")));
    r = await unTentativo(url, timeoutMs);
  }
  if (!r.ok) throw new ErroreRete(`Il servizio ha risposto con errore ${r.status}`, r.status, url);
  try {
    return await r.json();
  } catch {
    throw new ErroreRete("Risposta non valida dal servizio", r.status, url);
  }
}

/**
 * Scarica un JSON. Richieste identiche in corso condividono la stessa chiamata;
 * i risultati riusciti restano in cache per cacheMs. Su 429 riprova una volta sola.
 */
export function scaricaJSON(url, { timeoutMs = 15000, cacheMs = 900000 } = {}) {
  const adesso = Date.now();
  const salvato = cache.get(url);
  if (salvato && salvato.scadenza > adesso) return Promise.resolve(salvato.valore);
  if (inCorso.has(url)) return inCorso.get(url);
  const promessa = scaricaVero(url, timeoutMs)
    .then((valore) => {
      cache.set(url, { valore, scadenza: Date.now() + cacheMs });
      return valore;
    })
    .finally(() => inCorso.delete(url));
  inCorso.set(url, promessa);
  return promessa;
}

/** Esegue le funzioni con al massimo n in parallelo, conservando l'ordine dei risultati. */
export async function conLimite(n, funzioni) {
  const risultati = new Array(funzioni.length);
  let prossimo = 0;
  async function lavoratore() {
    while (prossimo < funzioni.length) {
      const i = prossimo++;
      risultati[i] = await funzioni[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, funzioni.length) }, lavoratore));
  return risultati;
}
