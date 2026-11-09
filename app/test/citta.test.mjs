import { test } from "node:test";
import assert from "node:assert/strict";
import { cercaCitta } from "../fonti/citta.js";
import { svuotaCache } from "../rete.js";

const OPEN_METEO = {
  results: [
    { name: "Stetten", admin1: "Gran Este", country: "Francia", country_code: "FR", latitude: 47.8, longitude: 7.3, timezone: "Europe/Paris" },
    { name: "Stetten", admin1: "Bassa Austria", country: "Austria", country_code: "AT", latitude: 48.4, longitude: 15.9, timezone: "Europe/Vienna" },
  ],
};
const NOMINATIM = [
  { class: "place", type: "village", name: "Stetten", lat: "47.8", lon: "7.31", address: { state: "Grand Est", country: "Francia", country_code: "fr" } },
  { class: "place", type: "village", name: "Stetten", lat: "47.9", lon: "7.5", address: { state: "Grand Est", country: "Francia", country_code: "fr" } },
  { class: "highway", type: "residential", name: "Rue de Stetten", lat: "47.8", lon: "7.31", address: { country: "Francia", country_code: "fr" } },
  { class: "place", type: "hamlet", name: "Stetten am Kamp", lat: "48.5", lon: "16.0", address: { state: "Bassa Austria", country: "Austria", country_code: "at" } },
];

function fetchFinto({ nominatimFallisce = false } = {}) {
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.startsWith("https://geocoding-api.open-meteo.com/")) {
      return new Response(JSON.stringify(OPEN_METEO), { headers: { "content-type": "application/json" } });
    }
    if (u.startsWith("https://nominatim.openstreetmap.org/")) {
      if (nominatimFallisce) return new Response("errore", { status: 500 });
      return new Response(JSON.stringify(NOMINATIM), { headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  };
}

test("trova lo Stetten francese e tiene le località dei paesi esteri", async () => {
  svuotaCache();
  fetchFinto();
  const r = await cercaCitta("Stetten", { attesaMs: 0 });
  assert.ok(r.some((l) => l.codice_paese === "FR"), "manca la Francia");
  assert.ok(r.some((l) => l.codice_paese === "AT"), "manca l'Austria");
  assert.ok(r.some((l) => l.nome === "Stetten am Kamp"), "manca un paesino da Nominatim");
});

test("non mostra le strade, solo luoghi abitati", async () => {
  svuotaCache();
  fetchFinto();
  const r = await cercaCitta("Stetten", { attesaMs: 0 });
  assert.ok(!r.some((l) => l.nome.startsWith("Rue")));
});

test("elimina i doppioni vicini (stesso nome e paese entro pochi km)", async () => {
  svuotaCache();
  fetchFinto();
  const r = await cercaCitta("Stetten", { attesaMs: 0 });
  const francesi = r.filter((l) => l.codice_paese === "FR");
  assert.equal(francesi.length, 2, JSON.stringify(francesi.map((l) => [l.lat, l.lon])));
});

test("se Nominatim non risponde restano i risultati di Open-Meteo", async () => {
  svuotaCache();
  fetchFinto({ nominatimFallisce: true });
  const r = await cercaCitta("Stetten", { attesaMs: 0 });
  assert.ok(r.some((l) => l.codice_paese === "FR"));
  assert.ok(r.length >= 2);
});

test("al massimo 8 risultati", async () => {
  svuotaCache();
  fetchFinto();
  const r = await cercaCitta("Stetten", { attesaMs: 0 });
  assert.ok(r.length <= 8);
});
