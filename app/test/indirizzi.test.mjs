import { test } from "node:test";
import assert from "node:assert/strict";
import { cercaVia } from "../fonti/indirizzi.js";
import { svuotaCache } from "../rete.js";

function fetchFinto(risposta) {
  const chiamate = [];
  globalThis.fetch = async (url) => {
    chiamate.push({ url: String(url), t: Date.now() });
    return new Response(JSON.stringify(risposta), { status: 200, headers: { "content-type": "application/json" } });
  };
  return chiamate;
}

const RISULTATO = [
  { lat: "45.0687808", lon: "7.6833443", display_name: "Via Roma, Centro, Torino, Piemonte, Italia" },
  { lat: "45.0656197", lon: "7.6810517", display_name: "Via Roma, Centro, Torino, Piemonte, Italia" },
  { lat: "45.1", lon: "7.7", display_name: "Via Roma, Chieri, Torino, Italia" },
];

test("la ricerca della via manda via, città e paese Italia", async () => {
  svuotaCache();
  const chiamate = fetchFinto(RISULTATO);
  await cercaVia("Via Roma", "Torino", { attesaMs: 0 });
  const u = new URL(chiamate[0].url);
  assert.equal(u.searchParams.get("street"), "Via Roma");
  assert.equal(u.searchParams.get("city"), "Torino");
  assert.equal(u.searchParams.get("countrycode"), "it");
});

test("le richieste successive sono distanziate almeno dal tempo indicato", async () => {
  svuotaCache();
  const chiamate = fetchFinto(RISULTATO);
  await Promise.all([cercaVia("Via Roma", "Torino", { attesaMs: 150 }), cercaVia("Via Po", "Torino", { attesaMs: 150 })]);
  assert.ok(chiamate[1].t - chiamate[0].t >= 140, `distanza ${chiamate[1].t - chiamate[0].t} ms`);
});

test("i risultati senza doppioni, con coordinate numeriche e al massimo 5", async () => {
  svuotaCache();
  fetchFinto(RISULTATO);
  const vie = await cercaVia("Via Roma", "Torino", { attesaMs: 0 });
  assert.equal(vie.length, 2);
  assert.equal(typeof vie[0].lat, "number");
  assert.equal(vie[0].codice_paese, "IT");
  assert.ok(vie[0].etichetta.includes("Via Roma"));
});

test("nessun risultato dà un elenco vuoto", async () => {
  svuotaCache();
  fetchFinto([]);
  assert.deepEqual(await cercaVia("Via Inesistente", "Torino", { attesaMs: 0 }), []);
});
