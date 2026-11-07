// Verifica V0: quanto ci mette la scheda Partenza a scaricare un tragitto con 7 punti.
// Usa gli stessi parametri di ore_punto (Python) e di orePuntoDaRisposte (motore.js).
// Esecuzione: node strumenti/misura_v0.mjs
import { distanzaKm, puntiIntermedi } from "../app/motore.js";

const MODELLI = "ecmwf_ifs025,gfs_seamless,icon_seamless,meteofrance_seamless,ukmo_seamless,italia_meteo_arpae_icon_2i";
const ORE = "precipitation,precipitation_probability,temperature_2m,wind_gusts_10m";
const CONCORRENZA = 4;
const RIPETIZIONI = 3;

// Torino e Milano, come nel tragitto di prova della skill.
const partenza = { nome: "Torino", lat: 45.07, lon: 7.69 };
const arrivo = { nome: "Milano", lat: 45.46, lon: 9.19 };
const km = distanzaKm(partenza.lat, partenza.lon, arrivo.lat, arrivo.lon);
const punti = [
  [partenza.nome, partenza.lat, partenza.lon],
  ...puntiIntermedi(partenza.lat, partenza.lon, arrivo.lat, arrivo.lon, km),
  [arrivo.nome, arrivo.lat, arrivo.lon],
];

// Domani nel fuso di Roma, come fa la scheda Partenza per il giorno scelto.
const domani = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
const dopodomani = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);

function urlDeterministico(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, models: MODELLI, timezone: "auto",
    hourly: ORE, start_date: domani, end_date: dopodomani,
  });
  return `https://api.open-meteo.com/v1/forecast?${q}`;
}

function urlEnsemble(lat, lon) {
  const q = new URLSearchParams({
    latitude: lat, longitude: lon, models: "ecmwf_ifs025", timezone: "auto",
    hourly: "precipitation", start_date: domani, end_date: dopodomani,
  });
  return `https://ensemble-api.open-meteo.com/v1/ensemble?${q}`;
}

// Scarica una risposta: restituisce i byte letti e il tempo trascorso.
async function scarica(url) {
  const t0 = performance.now();
  const r = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
  const corpo = await r.arrayBuffer();
  return { ok: r.ok, byte: corpo.byteLength, ms: performance.now() - t0 };
}

// Esegue le funzioni con al massimo `n` in parallelo, conservando l'ordine.
async function conLimite(n, funzioni) {
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

async function unGiro() {
  const inizio = performance.now();
  const det = await conLimite(CONCORRENZA, punti.map(([, lat, lon]) => () => scarica(urlDeterministico(lat, lon))));
  const tempoDet = performance.now() - inizio;
  const ens = await conLimite(CONCORRENZA, punti.map(([, lat, lon]) => () => scarica(urlEnsemble(lat, lon))));
  const tempoTot = performance.now() - inizio;
  const byte = [...det, ...ens].reduce((s, x) => s + x.byte, 0);
  const errori = [...det, ...ens].filter((x) => !x.ok).length;
  return { tempoDet, tempoTot, byte, errori, richieste: det.length + ens.length };
}

console.log(`Tragitto: ${partenza.nome} → ${arrivo.nome}, ${km.toFixed(0)} km in linea d'aria, ${punti.length} punti`);
console.log(`Giorno: ${domani}; ${RIPETIZIONI} giri, concorrenza ${CONCORRENZA}, cache HTTP disattivata\n`);
const giri = [];
for (let i = 1; i <= RIPETIZIONI; i++) {
  const g = await unGiro();
  giri.push(g);
  console.log(
    `giro ${i}: deterministico ${(g.tempoDet / 1000).toFixed(2)} s, con ensemble ${(g.tempoTot / 1000).toFixed(2)} s, ` +
      `${(g.byte / 1024).toFixed(0)} KB, ${g.richieste} richieste, errori ${g.errori}`,
  );
}
const max = (k) => Math.max(...giri.map((g) => g[k]));
console.log(`\nPeggior giro: deterministico ${(max("tempoDet") / 1000).toFixed(2)} s, con ensemble ${(max("tempoTot") / 1000).toFixed(2)} s`);
