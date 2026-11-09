// Ricerca delle città in tutto il mondo: Open-Meteo e OpenStreetMap (Nominatim) uniti.
// Nominatim trova anche i paesini; Open-Meteo porta il fuso orario. Doppioni vicini (stesso nome e paese) si tolgono.
import { cercaLuoghi } from "./openmeteo.js";
import { richiestaNominatim } from "./indirizzi.js";
import { distanzaKm } from "../motore.js";

const URL_NOMINATIM = "https://nominatim.openstreetmap.org/search?";
const TIPI_ABITATI = new Set(["city", "town", "village", "hamlet", "municipality", "locality", "suburb"]);
const MASSIMO = 8;

function daNominatim(r) {
  const a = r.address || {};
  const nome = r.name || String(r.display_name || "").split(",")[0];
  const regione = a.state || a.region || a.county || "";
  const paese = a.country || "";
  const codice = String(a.country_code || "").toUpperCase();
  return {
    etichetta: [nome, regione, paese].filter(Boolean).join(", "),
    nome, regione, paese, codice_paese: codice,
    lat: Number(r.lat), lon: Number(r.lon), fuso: null,
  };
}

/** Restituisce al massimo 8 località, di qualsiasi paese; le italiane vengono prima. */
export async function cercaCitta(testo, { attesaMs } = {}) {
  let openMeteo = [];
  try {
    openMeteo = await cercaLuoghi(testo);
  } catch { /* si prosegue con OpenStreetMap */ }

  let nominatim = [];
  try {
    const q = new URLSearchParams({ format: "jsonv2", limit: "10", addressdetails: "1", q: testo });
    const dati = await richiestaNominatim(URL_NOMINATIM + q, attesaMs);
    nominatim = (dati || [])
      .filter((r) => r.class === "place" && TIPI_ABITATI.has(r.type))
      .map(daNominatim);
  } catch { /* si prosegue con Open-Meteo */ }

  const risultati = [...openMeteo];
  for (const n of nominatim) {
    const doppione = risultati.some((x) =>
      x.codice_paese === n.codice_paese &&
      x.nome.toLowerCase() === n.nome.toLowerCase() &&
      distanzaKm(x.lat, x.lon, n.lat, n.lon) < 5);
    if (!doppione) risultati.push(n);
  }
  const italiane = risultati.filter((l) => l.codice_paese === "IT");
  const altre = risultati.filter((l) => l.codice_paese !== "IT");
  return [...italiane, ...altre].slice(0, MASSIMO);
}
