import { test } from "node:test";
import assert from "node:assert/strict";
import { leggi, salva, togli, esporta, importa, cancellaDatiLocali } from "../preferiti.js";

// Archivio finto con la stessa interfaccia di localStorage.
function archivioFinto(iniziale = {}) {
  const dati = new Map(Object.entries(iniziale));
  return {
    getItem: (k) => (dati.has(k) ? dati.get(k) : null),
    setItem: (k, v) => dati.set(k, String(v)),
    removeItem: (k) => dati.delete(k),
    chiavi: () => [...dati.keys()],
  };
}

const luogo = (nome) => ({ etichetta: nome, nome, regione: "", paese: "Italia", codice_paese: "IT", lat: 45, lon: 7, fuso: "Europe/Rome" });
const pref = (id, nome, durata = 20) => ({ id, nome, da: luogo("Torino"), a: luogo(nome), durata_min: durata });

test("salva, leggi e togli funzionano", () => {
  const a = archivioFinto();
  salva(a, pref("1", "Milano"));
  salva(a, pref("2", "Moncalieri"));
  assert.deepEqual(leggi(a).map((p) => p.id), ["1", "2"]);
  togli(a, "1");
  assert.deepEqual(leggi(a).map((p) => p.id), ["2"]);
});

test("salvare un id esistente lo sostituisce invece di duplicarlo", () => {
  const a = archivioFinto();
  salva(a, pref("1", "Milano", 20));
  salva(a, pref("1", "Milano", 90));
  const lista = leggi(a);
  assert.equal(lista.length, 1);
  assert.equal(lista[0].durata_min, 90);
});

test("esporta e importa su un archivio vuoto danno gli stessi preferiti", () => {
  const origine = archivioFinto();
  salva(origine, pref("1", "Milano"));
  salva(origine, pref("2", "Bologna", null));
  const testo = esporta(origine);
  const destinazione = archivioFinto();
  assert.equal(importa(destinazione, testo), 2);
  assert.deepEqual(leggi(destinazione), leggi(origine));
});

test("importare due volte non crea doppioni per nome", () => {
  const origine = archivioFinto();
  salva(origine, pref("1", "Milano"));
  const testo = esporta(origine);
  const destinazione = archivioFinto();
  importa(destinazione, testo);
  assert.equal(importa(destinazione, testo), 0);
  assert.equal(leggi(destinazione).length, 1);
});

test("un JSON rotto dà il messaggio chiaro", () => {
  assert.throws(() => importa(archivioFinto(), "{ non è json"), /Testo dei preferiti non valido/);
});

test("un JSON valido ma sbagliato dà lo stesso messaggio", () => {
  assert.throws(() => importa(archivioFinto(), "42"), /Testo dei preferiti non valido/);
  assert.throws(() => importa(archivioFinto(), JSON.stringify([{ nome: "senza luoghi" }])), /Testo dei preferiti non valido/);
});

test("cancellaDatiLocali toglie solo le chiavi dell'app", () => {
  const a = archivioFinto({ "meteo-motorino.preferiti.v1": "[]", "meteo-motorino.privacy-letta": "1", "altra-app": "x" });
  salva(a, pref("1", "Milano"));
  cancellaDatiLocali(a);
  assert.deepEqual(a.chiavi(), ["altra-app"]);
});
