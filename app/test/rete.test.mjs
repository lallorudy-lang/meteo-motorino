import { test } from "node:test";
import assert from "node:assert/strict";
import { scaricaJSON, conLimite, ErroreRete, svuotaCache } from "../rete.js";

const risposta = (corpo, status = 200, intestazioni = {}) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json", ...intestazioni } });

function fetchFinto(sequenza) {
  const chiamate = [];
  globalThis.fetch = async (url, opzioni = {}) => {
    chiamate.push(url);
    const passo = sequenza[Math.min(chiamate.length - 1, sequenza.length - 1)];
    if (passo === "timeout") {
      return new Promise((_, rifiuta) => {
        opzioni.signal?.addEventListener("abort", () => rifiuta(new DOMException("timeout", "AbortError")));
      });
    }
    return passo();
  };
  return chiamate;
}

test("due richieste uguali in contemporanea fanno una sola fetch", async () => {
  svuotaCache();
  const chiamate = fetchFinto([() => risposta({ x: 1 })]);
  const [a, b] = await Promise.all([scaricaJSON("https://esempio.test/a"), scaricaJSON("https://esempio.test/a")]);
  assert.deepEqual(a, { x: 1 });
  assert.deepEqual(b, { x: 1 });
  assert.equal(chiamate.length, 1);
});

test("429 con Retry-After 0 e poi 200 restituisce i dati dopo due fetch", async () => {
  svuotaCache();
  const chiamate = fetchFinto([
    () => risposta({ errore: "limite" }, 429, { "retry-after": "0" }),
    () => risposta({ ok: true }),
  ]);
  const dati = await scaricaJSON("https://esempio.test/b");
  assert.deepEqual(dati, { ok: true });
  assert.equal(chiamate.length, 2);
});

test("due 429 di fila danno ErroreRete con stato 429", async () => {
  svuotaCache();
  fetchFinto([() => risposta({}, 429, { "retry-after": "0" }), () => risposta({}, 429, { "retry-after": "0" })]);
  await assert.rejects(scaricaJSON("https://esempio.test/c"), (e) => e instanceof ErroreRete && e.stato === 429);
});

test("un timeout dà ErroreRete", async () => {
  svuotaCache();
  fetchFinto(["timeout"]);
  await assert.rejects(scaricaJSON("https://esempio.test/d", { timeoutMs: 20 }), (e) => e instanceof ErroreRete);
});

test("conLimite non supera mai il limite e conserva l'ordine", async () => {
  let inCorso = 0, massimo = 0;
  const funzioni = [1, 2, 3, 4, 5].map((n) => async () => {
    inCorso++;
    massimo = Math.max(massimo, inCorso);
    await new Promise((r) => setTimeout(r, 5 * (6 - n)));
    inCorso--;
    return n * 10;
  });
  const risultati = await conLimite(2, funzioni);
  assert.equal(massimo, 2);
  assert.deepEqual(risultati, [10, 20, 30, 40, 50]);
});
