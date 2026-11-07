import { test } from "node:test";
import assert from "node:assert/strict";
import { calcolaPartenza } from "../viste/partenza.js";
import { distanzaKm, durataStimata, MODELLI } from "../motore.js";

const luogo = (nome, lat, lon, fuso = "Europe/Rome") => ({
  etichetta: nome, nome, regione: "", paese: "Italia", codice_paese: "IT", lat, lon, fuso,
});
const TORINO = luogo("Torino", 45.07, 7.69);
const MONCALIERI = luogo("Moncalieri", 44.99, 7.68);

// Risposta Open-Meteo finta per un giorno: 25 orari (dalla mezzanotte alla mezzanotte dopo).
function detFinto(giorno, mmDiOra = () => 0) {
  const time = [];
  const base = Date.UTC(...giorno.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  for (let h = 0; h <= 24; h++) {
    const d = new Date(base + h * 3600000);
    time.push(d.toISOString().slice(0, 13) + ":00");
  }
  const hourly = { time };
  for (const m of Object.keys(MODELLI)) {
    hourly[`precipitation_${m}`] = time.map((_, i) => mmDiOra(i));
    hourly[`precipitation_probability_${m}`] = time.map(() => 5);
    hourly[`temperature_2m_${m}`] = time.map(() => 10);
    hourly[`wind_gusts_10m_${m}`] = time.map(() => 10);
  }
  return hourly;
}

const fontiBuone = (giorno) => ({
  orarioPunto: async (lat, lon) => ({ det: detFinto(giorno), ens: detFinto(giorno), fuso: "Europe/Rome" }),
});
const fontiSenzaEnsemble = (giorno) => ({
  orarioPunto: async () => ({ det: detFinto(giorno), ens: null, fuso: "Europe/Rome" }),
});

test("con ensemble che fallisce avvisa una sola volta e segna la nota senza ensemble", async () => {
  const chiamate = [];
  const r = await calcolaPartenza(
    { da: TORINO, a: MONCALIERI, giorno: "2026-11-09", durata_min: 20, adesso: "2026-11-08T10:00" },
    fontiSenzaEnsemble("2026-11-09"),
    (x) => chiamate.push(x),
  );
  assert.equal(chiamate.length, 1);
  assert.equal(r.con_ensemble, false);
  assert.ok(r.note.some((n) => n.includes("Senza ensemble")), r.note.join(" | "));
});

test("alle 23:30 di oggi non resta nessun orario di partenza", async () => {
  const r = await calcolaPartenza(
    { da: TORINO, a: null, giorno: "2026-11-09", durata_min: null, adesso: "2026-11-09T23:30" },
    fontiBuone("2026-11-09"),
  );
  assert.deepEqual(r.partenze, []);
  assert.ok(r.note.includes("Nessun orario rimasto oggi"), r.note.join(" | "));
});

test("con durata null si usa la durata stimata dai km", async () => {
  const r = await calcolaPartenza(
    { da: TORINO, a: MONCALIERI, giorno: "2026-11-09", durata_min: null, adesso: "2026-11-08T10:00" },
    fontiBuone("2026-11-09"),
  );
  const km = distanzaKm(TORINO.lat, TORINO.lon, MONCALIERI.lat, MONCALIERI.lon);
  assert.equal(r.durata_min, durataStimata(km));
});

test("posizione dal dispositivo senza fuso: usa il fuso restituito da orarioPunto", async () => {
  const dove = { ...TORINO, nome: "La mia posizione", fuso: null };
  const fonti = {
    orarioPunto: async () => ({ det: detFinto("2026-11-09"), ens: null, fuso: "Europe/London" }),
  };
  await assert.rejects(
    calcolaPartenza({ da: dove, a: MONCALIERI, giorno: "2026-11-09", durata_min: 20, adesso: "2026-11-08T10:00" }, fonti),
    /hanno fusi orari diversi/,
  );
});

test("una durata di 3 minuti dà l'errore sulle durate", async () => {
  await assert.rejects(
    calcolaPartenza({ da: TORINO, a: MONCALIERI, giorno: "2026-11-09", durata_min: 3, adesso: "2026-11-08T10:00" }, fontiBuone("2026-11-09")),
    /La durata deve essere tra 5 e 600 minuti/,
  );
});

test("partenza e arrivo con fusi diversi sono rifiutati", async () => {
  const londra = luogo("Londra", 51.5, -0.12, "Europe/London");
  await assert.rejects(
    calcolaPartenza({ da: TORINO, a: londra, giorno: "2026-11-09", durata_min: 60, adesso: "2026-11-08T10:00" }, fontiBuone("2026-11-09")),
    /hanno fusi orari diversi/,
  );
});

test("alle 12:45 non si consiglia la partenza delle 12:00 (F1)", async () => {
  const r = await calcolaPartenza(
    { da: TORINO, a: null, giorno: "2026-11-09", durata_min: null, dalle: 6, alle: 13, adesso: "2026-11-09T12:45" },
    fontiBuone("2026-11-09"),
  );
  assert.deepEqual(r.partenze, []);
  assert.ok(r.note.includes("Nessun orario rimasto oggi"));
});

test("una data già passata viene rifiutata prima del download (F2)", async () => {
  await assert.rejects(
    calcolaPartenza({ da: TORINO, a: null, giorno: "2026-11-09", durata_min: null, adesso: "2026-11-10T12:45" }, fontiBuone("2026-11-09")),
    /Le date richieste sono già passate/,
  );
});

test("con partenza e arrivo entrambi 'San Martino' i due punti restano distinti (F4)", async () => {
  const sm = luogo("San Martino", 45.5, 8.0);
  const sm2 = luogo("San Martino", 46.0, 9.0);
  const r = await calcolaPartenza(
    { da: sm, a: sm2, giorno: "2026-11-09", durata_min: 60, adesso: "2026-11-08T10:00" },
    fontiBuone("2026-11-09"),
  );
  const nomi = r.punti.map((p) => p.nome);
  assert.equal(new Set(nomi).size, nomi.length, nomi.join(" | "));
  assert.equal(Object.keys(r.ore[0].livelli).length, nomi.length);
});
