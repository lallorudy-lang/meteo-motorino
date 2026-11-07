// Freschezza dei dati (spec §5.1) e ultimo risultato salvato per l'uso senza rete.
// Nessun dato personale va oltre questo dispositivo.

export const LIMITI_MIN = { previsioni: 180, radar: 20, radarAccumuli: 90, pluviometri: 120 };
const CHIAVE = "meteo-motorino.ultimo-risultato";
const MESI = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

/** Data e ora di un istante nel fuso indicato, come "gg/mm HH:MM". */
export function etichettaDataOra(ms, fuso = "Europe/Rome") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Stato di un dato scaricato `acquisitoMs` quando adessoMs è l'ora attuale, rispetto alla soglia in minuti. */
export function valutaFreschezza(acquisitoMs, adessoMs, sogliaMin) {
  const minuti = Math.max(0, Math.round((adessoMs - acquisitoMs) / 60000));
  if (minuti <= sogliaMin) return { attuale: true, minuti, testo: `aggiornato ${minuti} min fa` };
  const ore = Math.floor(minuti / 60);
  const eta = ore >= 1 ? `${ore} h` : `${minuti} min`;
  return { attuale: false, minuti, testo: `dati di ${eta} fa: aggiorna prima di partire` };
}

/** Salva l'ultimo risultato di una partenza (solo i campi che servono a mostrarlo di nuovo). */
export function salvaUltimo(archivio, risultato, acquisitoMs = Date.now()) {
  const dati = {
    acquisito_ms: acquisitoMs,
    fuso: risultato.fuso || "Europe/Rome",
    giorno: risultato.giorno,
    punti: risultato.punti,
    durata_min: risultato.durata_min,
    consiglio: risultato.consiglio,
    fasce: risultato.fasce,
  };
  archivio.setItem(CHIAVE, JSON.stringify(dati));
  return dati;
}

/** Ultimo risultato salvato, o null se non c'è o è illeggibile. */
export function leggiUltimo(archivio) {
  try {
    const d = JSON.parse(archivio.getItem(CHIAVE) || "null");
    return d && typeof d.acquisito_ms === "number" && typeof d.giorno === "string" ? d : null;
  } catch {
    return null;
  }
}

/** Giorno (AAAA-MM-GG), ora e minuti di un istante nel fuso indicato. */
export function oraNelFuso(ms, fuso = "Europe/Rome") {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { giorno: `${p.year}-${p.month}-${p.day}`, ora: Number(p.hour), minuti: Number(p.minute) };
}

/**
 * Partenze consigliate ancora possibili. Le partenze sono a ora piena: dalle..(alle-1).
 * Con minuti già trascorsi l'ora corrente è passata. Restituisce {dalle, alle} oppure null.
 */
export function partenzeRimaste(consiglio, ora, minuti) {
  if (!consiglio || !consiglio.consigliabile) return null;
  const primaValida = Math.max(consiglio.dalle, ora + (minuti > 0 ? 1 : 0));
  return primaValida <= consiglio.alle - 1 ? { dalle: primaValida, alle: consiglio.alle } : null;
}

/**
 * Stato dell'ultimo risultato salvato (spec §5.1):
 * - "storico": il giorno è passato, o non resta nessuna partenza consigliata. Nessun consiglio.
 * - "vecchio": restano partenze consigliate ma i dati sono più vecchi di 3 ore.
 * - "attuale": restano partenze consigliate e dati freschi.
 * In tutti i casi con partenze: rimaste dice quali orari sono ancora validi.
 */
export function statoUltimo(u, adessoMs = Date.now()) {
  const ora = oraNelFuso(adessoMs, u.fuso);
  if (u.giorno < ora.giorno) return { tipo: "storico" };
  const rimaste = u.giorno === ora.giorno ? partenzeRimaste(u.consiglio, ora.ora, ora.minuti) : (u.consiglio?.consigliabile ? { dalle: u.consiglio.dalle, alle: u.consiglio.alle } : null);
  if (u.giorno === ora.giorno && u.consiglio?.consigliabile && !rimaste) return { tipo: "storico" };
  const f = valutaFreschezza(u.acquisito_ms, adessoMs, LIMITI_MIN.previsioni);
  return { tipo: f.attuale ? "attuale" : "vecchio", minuti: f.minuti, rimaste };
}
