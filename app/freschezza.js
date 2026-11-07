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
