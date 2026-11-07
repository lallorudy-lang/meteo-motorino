import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { calcolaGiorni } from "../viste/giorni.js";
import { MODELLI } from "../motore.js";

const QUI = dirname(fileURLToPath(import.meta.url));
const LUOGO = { etichetta: "Genova", nome: "Genova", regione: "Liguria", paese: "Italia", codice_paese: "IT", lat: 44.4, lon: 8.9, fuso: "Europe/Rome" };
const OGGI = "2026-11-07";

// Risposta giornaliera finta per n giorni a partire da OGGI.
function dailyFinto(n) {
  const time = Array.from({ length: n }, (_, i) => new Date(Date.UTC(2026, 10, 7 + i)).toISOString().slice(0, 10));
  const d = { time };
  for (const m of Object.keys(MODELLI)) {
    d[`temperature_2m_max_${m}`] = time.map(() => 14);
    d[`temperature_2m_min_${m}`] = time.map(() => 9);
    d[`precipitation_sum_${m}`] = time.map(() => 1);
    d[`precipitation_probability_max_${m}`] = time.map(() => 20);
    d[`weather_code_${m}`] = time.map(() => 3);
    d[`wind_speed_10m_max_${m}`] = time.map(() => 12);
  }
  return d;
}
const orario = (n) => ({ daily: dailyFinto(n), hourly: {} });
const ensFinto = (n) => ({ daily: { time: dailyFinto(n).time, precipitation_sum: Array.from({ length: n }, () => 0.5) } });

test("fine prima dell'inizio dà errore", async () => {
  await assert.rejects(
    calcolaGiorni({ luogo: LUOGO, dal: "2026-11-10", al: "2026-11-08", oggi: OGGI }, { giorniCitta: async () => ({}) }),
    /La data di fine è prima di quella di inizio/,
  );
});

test("date tutte passate danno errore", async () => {
  await assert.rejects(
    calcolaGiorni({ luogo: LUOGO, dal: "2026-11-01", al: "2026-11-02", oggi: OGGI }, { giorniCitta: async () => ({}) }),
    /Le date richieste sono già passate/,
  );
});

test("oltre 16 giorni: nota sull'orizzonte e righe troncate", async () => {
  const r = await calcolaGiorni(
    { luogo: LUOGO, dal: OGGI, al: "2026-12-30", oggi: OGGI },
    { giorniCitta: async () => ({ dati: orario(16), ens: ensFinto(15) }) },
  );
  assert.ok(r.note.some((n) => n.includes("fino al 2026-11-22")), r.note.join(" | "));
  assert.equal(r.righe.length, 16);
  assert.equal(r.righe.at(-1).data, "2026-11-22");
});

test("ensemble null dà la nota e l'affidabilità sui soli modelli", async () => {
  const r = await calcolaGiorni(
    { luogo: LUOGO, dal: OGGI, al: "2026-11-09", oggi: OGGI },
    { giorniCitta: async () => ({ dati: orario(3), ens: null }) },
  );
  assert.ok(r.note.some((n) => n.includes("ensemble ECMWF non disponibile")), r.note.join(" | "));
  assert.equal(r.righe.length, 3);
});

test("con l'ensemble le righe hanno il conteggio delle simulazioni", async () => {
  const r = await calcolaGiorni(
    { luogo: LUOGO, dal: OGGI, al: "2026-11-08", oggi: OGGI },
    { giorniCitta: async () => ({ dati: orario(2), ens: ensFinto(2) }) },
  );
  assert.equal(r.righe.length, 2);
  assert.ok(r.righe[0].ensemble_ecmwf);
  assert.equal(r.note.length, 0);
});
