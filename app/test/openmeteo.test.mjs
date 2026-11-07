import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { cercaLuogo, orarioPunto, giorniCitta } from "../fonti/openmeteo.js";
import { svuotaCache } from "../rete.js";

const QUI = dirname(fileURLToPath(import.meta.url));
const geocodifica = JSON.parse(readFileSync(join(QUI, "fixture", "geocodifica-bologna.json"), "utf8"));
const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

function risposteAPI(gestori) {
  const chiamate = [];
  globalThis.fetch = async (url) => {
    chiamate.push(String(url));
    for (const [prefisso, gestore] of Object.entries(gestori)) {
      if (String(url).startsWith(prefisso)) return gestore(String(url));
    }
    return json({ error: "non previsto" }, 500);
  };
  return chiamate;
}

const ORARIO_FINTO = {
  hourly: { time: ["2026-11-09T00:00", "2026-11-09T01:00"], precipitation_ecmwf_ifs025: [0, 0.1] },
  timezone: "Europe/Rome",
};

test("l'URL di orarioPunto contiene i 6 modelli, le date giuste e timezone auto", async () => {
  svuotaCache();
  const chiamate = risposteAPI({
    "https://api.open-meteo.com/": () => json(ORARIO_FINTO),
    "https://ensemble-api.open-meteo.com/": () => json({ hourly: { time: [], precipitation: [] } }),
  });
  await orarioPunto(44.49, 11.34, "2026-11-09");
  const previsione = chiamate.find((u) => u.startsWith("https://api.open-meteo.com/"));
  for (const m of ["ecmwf_ifs025", "gfs_seamless", "icon_seamless", "meteofrance_seamless", "ukmo_seamless", "italia_meteo_arpae_icon_2i"]) {
    assert.ok(previsione.includes(m), `manca il modello ${m}`);
  }
  assert.ok(previsione.includes("start_date=2026-11-09"));
  assert.ok(previsione.includes("end_date=2026-11-10"));
  assert.ok(previsione.includes("timezone=auto"));
});

test("cercaLuogo con la fixture di Bologna mette prima l'Emilia-Romagna, senza doppioni", async () => {
  svuotaCache();
  risposteAPI({ "https://geocoding-api.open-meteo.com/": () => json(geocodifica) });
  const luoghi = await cercaLuogo("Bologna");
  assert.equal(luoghi[0].regione, "Emilia-Romagna");
  assert.equal(luoghi[0].codice_paese, "IT");
  const chiavi = luoghi.map((l) => `${l.nome}|${l.regione}|${l.paese}`);
  assert.equal(new Set(chiavi).size, chiavi.length, "ci sono doppioni");
  assert.ok(luoghi.length <= 5);
});

test("cercaLuogo senza risultati dà un elenco vuoto", async () => {
  svuotaCache();
  risposteAPI({ "https://geocoding-api.open-meteo.com/": () => json({}) });
  assert.deepEqual(await cercaLuogo("Xyzqwk"), []);
});

test("se l'ensemble fallisce, orarioPunto restituisce ens null senza errore", async () => {
  svuotaCache();
  risposteAPI({
    "https://api.open-meteo.com/": () => json(ORARIO_FINTO),
    "https://ensemble-api.open-meteo.com/": () => json({ error: true }, 500),
  });
  const r = await orarioPunto(44.49, 11.34, "2026-11-09");
  assert.equal(r.ens, null);
  assert.equal(r.fuso, "Europe/Rome");
});

test("giorniCitta chiede un giorno in più e restituisce dati ed ensemble", async () => {
  svuotaCache();
  const chiamate = risposteAPI({
    "https://api.open-meteo.com/": () => json({ daily: { time: ["2026-11-07"] }, timezone: "Europe/Rome" }),
    "https://ensemble-api.open-meteo.com/": () => json({ daily: { time: ["2026-11-07"], precipitation_sum: [1] } }),
  });
  const r = await giorniCitta(44.49, 11.34, 5);
  assert.ok(chiamate.find((u) => u.includes("forecast_days=6")));
  assert.ok(r.dati.daily);
  assert.ok(r.ens.daily);
});
