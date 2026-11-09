// Ricerca delle vie con OpenStreetMap (Nominatim). Regole del servizio: non più di una richiesta al secondo,
// uso moderato. Le richieste si mettono in fila e si distanziano; i risultati si ricordano per la sessione.
import { scaricaJSON } from "../rete.js";

const URL_NOMINATIM = "https://nominatim.openstreetmap.org/search?";
const INTERVALLO_MS = 1100;
let coda = Promise.resolve();
let ultima = 0;

const attesa = (ms) => new Promise((r) => setTimeout(r, ms));

/** Cerca una via in una città. Restituisce al massimo 5 luoghi distinti. */
/** Richiesta a Nominatim in fila, con la pausa tra una richiesta e l'altra. */
export function richiestaNominatim(url, attesaMs = INTERVALLO_MS) {
  const lavoro = coda.then(async () => {
    const mancano = ultima + attesaMs - Date.now();
    if (mancano > 0) await attesa(mancano);
    ultima = Date.now();
    return scaricaJSON(url);
  });
  coda = lavoro.catch(() => {});
  return lavoro;
}

export function cercaVia(via, citta, { attesaMs = INTERVALLO_MS } = {}) {
  const q = new URLSearchParams({ format: "jsonv2", countrycode: "it", limit: "5", street: via, city: citta });
  const lavoro = richiestaNominatim(URL_NOMINATIM + q, attesaMs);
  return lavoro.then((risultati) => {
    const visti = new Set();
    const vie = [];
    for (const r of risultati || []) {
      if (visti.has(r.display_name)) continue;
      visti.add(r.display_name);
      vie.push({
        etichetta: r.display_name,
        nome: `${via}, ${citta}`,
        regione: "",
        paese: "Italia",
        codice_paese: "IT",
        lat: Number(r.lat),
        lon: Number(r.lon),
        fuso: null,
      });
      if (vie.length === 5) break;
    }
    return vie;
  });
}
