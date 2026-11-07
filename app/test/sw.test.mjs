// Il service worker gira nel suo contesto: qui lo carichiamo in un ambiente simulato.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const QUI = dirname(fileURLToPath(import.meta.url));
const CODICE = readFileSync(join(QUI, "..", "sw.js"), "utf8");
const ORIGINE = "https://esempio.test";

function ambiente({ rete = async () => new Response("rete") } = {}) {
  const gestori = {};
  const cache = new Map();   // nome -> Map(url -> Response)
  const aggiunti = [];
  const apri = (nome) => {
    if (!cache.has(nome)) cache.set(nome, new Map());
    const c = cache.get(nome);
    return {
      addAll: async (lista) => { aggiunti.push(...lista); for (const u of lista) c.set(new URL(u, ORIGINE + "/app/").href, new Response("cache")); },
    };
  };
  const sandbox = {
    self: {
      location: new URL(ORIGINE + "/app/sw.js"),
      addEventListener: (tipo, f) => { gestori[tipo] = f; },
      skipWaiting: () => {},
      clients: { claim: async () => {} },
    },
    caches: {
      open: async (n) => apri(n),
      keys: async () => [...cache.keys()],
      delete: async (n) => cache.delete(n),
      match: async (r) => {
        const url = typeof r === "string" ? new URL(r, ORIGINE + "/app/").href : r.url;
        for (const c of cache.values()) if (c.has(url)) return c.get(url);
        return undefined;
      },
    },
    fetch: async (r) => rete(r),
    Response, URL, Promise, console,
  };
  vm.runInNewContext(CODICE, sandbox);
  return { gestori, aggiunti, cache };
}

const richiesta = (url, metodo = "GET") => ({ url, method: metodo });

test("all'installazione mette in cache il guscio dell'app, non le API", async () => {
  const a = ambiente();
  let attesa;
  a.gestori.install({ waitUntil: (p) => { attesa = p; } });
  await attesa;
  assert.ok(a.aggiunti.includes("index.html"));
  assert.ok(a.aggiunti.includes("icona-192.png"));
  assert.ok(a.aggiunti.every((f) => !/api\.open-meteo|tile\.openstreetmap|^https?:/.test(f)), a.aggiunti.join(" "));
});

test("una risorsa in cache viene servita senza andare in rete", async () => {
  let chiamate = 0;
  const a = ambiente({ rete: async () => { chiamate++; return new Response("rete"); } });
  let attesa;
  a.gestori.install({ waitUntil: (p) => { attesa = p; } });
  await attesa;
  let risposta;
  a.gestori.fetch({ request: richiesta(`${ORIGINE}/app/stile.css`), respondWith: (p) => { risposta = p; } });
  const r = await risposta;
  assert.equal(await r.text(), "cache");
  assert.equal(chiamate, 0);
});

test("le richieste verso altri siti (API, cartina) non vengono intercettate", () => {
  const a = ambiente();
  let intercettata = false;
  a.gestori.fetch({ request: richiesta("https://api.open-meteo.com/v1/forecast?x=1"), respondWith: () => { intercettata = true; } });
  a.gestori.fetch({ request: richiesta("https://tile.openstreetmap.org/1/2/3.png"), respondWith: () => { intercettata = true; } });
  assert.equal(intercettata, false);
});

test("le richieste non GET non vengono intercettate", () => {
  const a = ambiente();
  let intercettata = false;
  a.gestori.fetch({ request: richiesta(`${ORIGINE}/app/index.html`, "POST"), respondWith: () => { intercettata = true; } });
  assert.equal(intercettata, false);
});

test("senza rete una pagina non in cache ricade sull'app", async () => {
  const a = ambiente({ rete: async () => { throw new TypeError("offline"); } });
  let attesa;
  a.gestori.install({ waitUntil: (p) => { attesa = p; } });
  await attesa;
  let risposta;
  a.gestori.fetch({ request: richiesta(`${ORIGINE}/app/pagina-che-non-esiste.html`), respondWith: (p) => { risposta = p; } });
  const r = await risposta;
  assert.equal(await r.text(), "cache");
});
