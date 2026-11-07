// Fonte Open-Meteo: geocodifica, previsioni dei 6 modelli ed ensemble ECMWF.
// Parametri identici a skill/meteo-media/scripts/previsioni.py.
import { scaricaJSON } from "../rete.js";

export const MODELLI = [
  "ecmwf_ifs025", "gfs_seamless", "icon_seamless", "meteofrance_seamless", "ukmo_seamless", "italia_meteo_arpae_icon_2i",
];
const ORE = "precipitation,precipitation_probability,temperature_2m,wind_gusts_10m";
const GIORNALIERE = [
  "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
  "precipitation_probability_max", "weather_code", "wind_speed_10m_max",
];
const ORIZZONTE = 16;

const URL_PREVISIONI = "https://api.open-meteo.com/v1/forecast?";
const URL_ENSEMBLE = "https://ensemble-api.open-meteo.com/v1/ensemble?";
const URL_GEOCODIFICA = "https://geocoding-api.open-meteo.com/v1/search?";

/** Data ISO più n giorni, calcolata in UTC per non dipendere dal fuso del dispositivo. */
function giornoDopo(iso, n) {
  const [a, m, g] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, g + n));
  return d.toISOString().slice(0, 10);
}

/** Restituisce i luoghi trovati: prima gli italiani, senza doppioni, al massimo 5. */
export async function cercaLuogo(nome) {
  const q = new URLSearchParams({ name: nome, count: "5", language: "it", format: "json" });
  const dati = await scaricaJSON(URL_GEOCODIFICA + q);
  const risultati = dati.results || [];
  const ordinati = [...risultati.filter((r) => r.country_code === "IT"), ...risultati.filter((r) => r.country_code !== "IT")];
  const visti = new Set();
  const luoghi = [];
  for (const r of ordinati) {
    const chiave = `${r.name}|${r.admin1 || ""}|${r.country || ""}`;
    if (visti.has(chiave)) continue;
    visti.add(chiave);
    const etichetta = [r.name, r.admin1, r.country].filter(Boolean).join(", ");
    luoghi.push({
      etichetta,
      nome: r.name,
      regione: r.admin1 || "",
      paese: r.country || "",
      codice_paese: r.country_code || "",
      lat: r.latitude,
      lon: r.longitude,
      fuso: r.timezone || "Europe/Rome",
    });
    if (luoghi.length === 5) break;
  }
  return luoghi;
}

/** Previsioni orarie dei 6 modelli e ensemble per un giorno (ISO). L'ensemble può mancare: ens è null. */
export async function orarioPunto(lat, lon, giorno) {
  const fine = giornoDopo(giorno, 1); // serve anche la mezzanotte dopo, per l'ora 23-24
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), models: MODELLI.join(","), timezone: "auto",
    hourly: ORE, start_date: giorno, end_date: fine,
  });
  const det = await scaricaJSON(URL_PREVISIONI + q);
  let ens = null;
  try {
    const qe = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), models: "ecmwf_ifs025", timezone: "auto",
      hourly: "precipitation", start_date: giorno, end_date: fine,
    });
    ens = (await scaricaJSON(URL_ENSEMBLE + qe)).hourly ?? null;
  } catch {
    ens = null; // l'ensemble è un di più: senza, si usano solo i modelli
  }
  return { det: det.hourly, ens, fuso: det.timezone || "Europe/Rome" };
}

/** Previsioni giornaliere per una città: fino a 16 giorni. Ensemble facoltativo. */
export async function giorniCitta(lat, lon, giorni) {
  const q = new URLSearchParams({
    latitude: String(lat), longitude: String(lon), models: MODELLI.join(","), timezone: "auto",
    daily: GIORNALIERE.join(","), hourly: "precipitation,precipitation_probability",
    forecast_days: String(Math.min(ORIZZONTE, giorni + 1)),
  });
  const dati = await scaricaJSON(URL_PREVISIONI + q);
  let ens = null;
  try {
    const qe = new URLSearchParams({
      latitude: String(lat), longitude: String(lon), models: "ecmwf_ifs025", timezone: "auto",
      daily: "precipitation_sum", forecast_days: String(Math.min(giorni, 15)),
    });
    ens = await scaricaJSON(URL_ENSEMBLE + qe);
  } catch {
    ens = null;
  }
  return { dati, ens };
}
