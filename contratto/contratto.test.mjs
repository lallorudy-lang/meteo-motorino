// Esegue i casi condivisi di contratto/casi/*.json sul motore JavaScript dell'app.
// Gli stessi file sono eseguiti da contratto/test_contratto.py sul motore Python.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as motore from "../app/motore.js";

const QUI = dirname(fileURLToPath(import.meta.url));
const CASI = join(QUI, "casi");
const TOLLERANZA = 1e-9;

const camel = (nome) => nome.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());

function uguali(a, b, percorso = "risultato") {
  if (typeof a === "number" && typeof b === "number") {
    assert.ok(Math.abs(a - b) <= TOLLERANZA, `${percorso}: ${a} != ${b}`);
  } else if (Array.isArray(a) && Array.isArray(b)) {
    assert.equal(a.length, b.length, `${percorso}: lunghezza ${a.length} != ${b.length}`);
    a.forEach((x, i) => uguali(x, b[i], `${percorso}[${i}]`));
  } else if (a && b && typeof a === "object" && typeof b === "object") {
    assert.deepEqual(Object.keys(a).sort(), Object.keys(b).sort(), `${percorso}: chiavi diverse`);
    for (const k of Object.keys(a)) uguali(a[k], b[k], `${percorso}.${k}`);
  } else {
    assert.equal(a, b, `${percorso}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
  }
}

for (const file of readdirSync(CASI).filter((f) => f.endsWith(".json")).sort()) {
  for (const caso of JSON.parse(readFileSync(join(CASI, file), "utf8"))) {
    test(`${file}: ${caso.nome}`, () => {
      const funzione = motore[camel(caso.funzione)];
      assert.equal(typeof funzione, "function", `manca ${camel(caso.funzione)} in app/motore.js`);
      const risultato = JSON.parse(JSON.stringify(funzione(...caso.argomenti) ?? null));
      uguali(risultato, caso.atteso);
    });
  }
}
