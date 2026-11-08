import { test } from "node:test";
import assert from "node:assert/strict";
import { percorsoStrada, puntiLungoPercorso } from "../fonti/percorso.js";
import { svuotaCache } from "../rete.js";

test("il percorso chiede le strade tra i punti, in ordine lon,lat", async () => {
  svuotaCache();
  let url = "";
  globalThis.fetch = async (u) => { url = String(u); return new Response(JSON.stringify({ code: "Ok", routes: [{ distance: 1500, geometry: { coordinates: [[7.6, 45.0], [7.7, 45.1]] } }] }), { headers: { "content-type": "application/json" } }); };
  const r = await percorsoStrada([{ lat: 45.0, lon: 7.6 }, { lat: 45.1, lon: 7.7 }]);
  assert.ok(url.includes("7.6,45;7.7,45.1") || url.includes("7.6,45") && url.includes("7.7,45.1"), url);
  assert.deepEqual(r.coordinate, [[45.0, 7.6], [45.1, 7.7]]);
  assert.equal(r.km, 1.5);
});

test("se il servizio non risponde il percorso è null, senza errore", async () => {
  svuotaCache();
  globalThis.fetch = async () => new Response("errore", { status: 500 });
  assert.equal(await percorsoStrada([{ lat: 45, lon: 7 }, { lat: 45.1, lon: 7.1 }]), null);
});

test("i punti lungo il percorso sono equidistanti per lunghezza", () => {
  const linea = [[45, 7], [45, 8]];
  const p = puntiLungoPercorso(linea, 1);
  assert.equal(p.length, 1);
  assert.ok(Math.abs(p[0].lon - 7.5) < 1e-6, String(p[0].lon));
  assert.ok(Math.abs(p[0].frazione - 0.5) < 1e-6);
});
