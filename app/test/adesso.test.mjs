import { test } from "node:test";
import assert from "node:assert/strict";
import { prossimeOre } from "../viste/adesso.js";

const ore = (giorno) => Array.from({ length: 24 }, (_, h) => ({ ora: h, giorno, mm: h, prob: 10, temp: 8, livello: 0 }));

test("alle 13:30 le prossime 24 ore partono dalle 13 e arrivano alle 12 del giorno dopo", () => {
  const r = prossimeOre(ore("2026-11-12"), ore("2026-11-13"), { giorno: "2026-11-12", ora: 13, minuti: 30 });
  assert.equal(r.length, 24);
  assert.equal(r[0].ora, 13);
  assert.equal(r[0].giorno, "2026-11-12");
  assert.equal(r[11].ora, 0);
  assert.equal(r[11].giorno, "2026-11-13");
  assert.equal(r[23].ora, 12);
  assert.equal(r[23].giorno, "2026-11-13");
});

test("alle 23:10 le prossime 24 ore partono dalle 23 e arrivano alle 22 del giorno dopo", () => {
  const r = prossimeOre(ore("2026-11-12"), ore("2026-11-13"), { giorno: "2026-11-12", ora: 23, minuti: 10 });
  assert.equal(r.length, 24);
  assert.equal(r[0].ora, 23);
  assert.equal(r[1].ora, 0);
  assert.equal(r[1].giorno, "2026-11-13");
  assert.equal(r[23].ora, 22);
  assert.equal(r[23].giorno, "2026-11-13");
});
