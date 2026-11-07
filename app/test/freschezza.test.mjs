import { test } from "node:test";
import assert from "node:assert/strict";
import { valutaFreschezza, etichettaDataOra, salvaUltimo, leggiUltimo, LIMITI_MIN } from "../freschezza.js";

const ORA = Date.parse("2026-11-08T10:00:00Z");

test("previsioni scaricate da meno di 3 ore sono attuali", () => {
  const f = valutaFreschezza(ORA - 2 * 3600000, ORA, LIMITI_MIN.previsioni);
  assert.equal(f.attuale, true);
});

test("previsioni più vecchie di 3 ore sono da aggiornare, con l'età", () => {
  const f = valutaFreschezza(ORA - 4 * 3600000, ORA, LIMITI_MIN.previsioni);
  assert.equal(f.attuale, false);
  assert.match(f.testo, /aggiorna/i);
});

test("un'etichetta riporta giorno, mese e ora nel fuso indicato", () => {
  const t = Date.parse("2026-11-08T09:05:00Z"); // 10:05 a Roma
  assert.equal(etichettaDataOra(t, "Europe/Rome"), "08/11 10:05");
});

test("salvataggio e lettura dell'ultimo risultato, senza duplicati", () => {
  const dati = new Map();
  const archivio = { getItem: (k) => dati.get(k) ?? null, setItem: (k, v) => dati.set(k, v), removeItem: (k) => dati.delete(k) };
  const r = { giorno: "2026-11-09", fuso: "Europe/Rome", punti: ["Torino", "Milano"], consiglio: { dalle: 12, alle: 15, consigliabile: true, giudizio: "ok" }, durata_min: 90 };
  salvaUltimo(archivio, r, ORA);
  const letto = leggiUltimo(archivio);
  assert.equal(letto.giorno, "2026-11-09");
  assert.equal(letto.acquisito_ms, ORA);
  assert.deepEqual(letto.punti, ["Torino", "Milano"]);
});

test("un ultimo risultato corrotto non rompe l'app", () => {
  const archivio = { getItem: () => "{ rotto", setItem() {}, removeItem() {} };
  assert.equal(leggiUltimo(archivio), null);
});

import { statoUltimo } from "../freschezza.js";

// Ora di Roma: 2026-11-08 10:00 locale (09:00 UTC)
const ADESSO = Date.parse("2026-11-08T09:00:00Z");
const base = (giorno, dalle, alle, acquisitoOreFa) => ({
  acquisito_ms: ADESSO - acquisitoOreFa * 3600000, fuso: "Europe/Rome", giorno,
  punti: ["Torino", "Milano"], durata_min: 90,
  consiglio: { consigliabile: true, dalle, alle, giudizio: "ok" },
});

test("un risultato di un giorno passato è storico, senza consiglio (F2)", () => {
  const s = statoUltimo(base("2026-11-07", 12, 15, 0.5), ADESSO);
  assert.equal(s.tipo, "storico");
});

test("un risultato di oggi la cui fascia è finita è storico (F2)", () => {
  const s = statoUltimo(base("2026-11-08", 6, 9, 0.5), ADESSO); // alle 10:00 la fascia 6-9 è finita
  assert.equal(s.tipo, "storico");
});

test("un risultato di oggi con fascia ancora valida e dati freschi è attuale", () => {
  const s = statoUltimo(base("2026-11-08", 11, 14, 1), ADESSO);
  assert.equal(s.tipo, "attuale");
});

test("un risultato con fascia ancora valida ma dati di più di 3 ore fa chiede di aggiornare", () => {
  const s = statoUltimo(base("2026-11-08", 11, 14, 4), ADESSO);
  assert.equal(s.tipo, "vecchio");
});
