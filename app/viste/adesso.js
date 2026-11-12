// Scheda Adesso: pioggia prevista nelle prossime 24 ore, nella città scelta.
import { cercaCitta } from "../fonti/citta.js";
import { orarioPunto as orarioPuntoVero } from "../fonti/openmeteo.js";
import { orePuntoDaRisposte, valutaOra, mm } from "../motore.js";
import { oraNelFuso } from "../freschezza.js";
import { disegnaBarre } from "./barre.js";

const ORE = 24;
const fmt = (n) => String(n).padStart(2, "0");

function giornoDopo(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Dalle 24 ore a partire dall'ora attuale (ora piena in corso inclusa). Funzione pura. */
export function prossimeOre(oreOggi, oreDomani, adesso) {
  const base = Date.parse(`${adesso.giorno}T${fmt(adesso.ora)}:00:00Z`);
  const fine = base + ORE * 3600000;
  const domani = giornoDopo(adesso.giorno);
  return [
    ...oreOggi.map((o) => ({ ...o, giorno: adesso.giorno })),
    ...oreDomani.map((o) => ({ ...o, giorno: domani })),
  ]
    .map((o) => ({ ...o, t: Date.parse(`${o.giorno}T${fmt(o.ora)}:00:00Z`) }))
    .filter((o) => o.t >= base && o.t < fine)
    .sort((a, b) => a.t - b.t);
}

/** Previsioni delle prossime 24 ore per un luogo, con l'ora locale del luogo. */
export async function calcolaAdesso(luogo, fonti = { orarioPunto: orarioPuntoVero }, adessoMs = Date.now()) {
  const oggiGuess = oraNelFuso(adessoMs, luogo.fuso || "Europe/Rome").giorno;
  const r = await fonti.orarioPunto(luogo.lat, luogo.lon, oggiGuess);
  const adesso = oraNelFuso(adessoMs, r.fuso || luogo.fuso || "Europe/Rome");
  const oreOggi = orePuntoDaRisposte(r.det, r.ens, adesso.giorno);
  const oreDomani = orePuntoDaRisposte(r.det, r.ens, giornoDopo(adesso.giorno));
  const ore = prossimeOre(oreOggi, oreDomani, adesso).map((o) => ({ ...o, livello: valutaOra(o).livello }));
  return { luogo, fuso: r.fuso || luogo.fuso, ore };
}

function el(tag, testo, classe) {
  const e = document.createElement(tag);
  if (testo !== undefined) e.textContent = testo;
  if (classe) e.className = classe;
  return e;
}

/** Monta la scheda Adesso dentro `contenitore`: si sceglie la città con i suggerimenti. */
export function montaAdesso(contenitore, { cerca = cercaCitta, fonti = { orarioPunto: orarioPuntoVero } } = {}) {
  contenitore.replaceChildren();
  const campo = el("div", undefined, "campo");
  const etichetta = el("label", "Città");
  const input = el("input");
  input.id = "adesso-citta";
  input.type = "text";
  input.placeholder = "Scrivi la città";
  etichetta.htmlFor = input.id;
  const suggerimenti = el("div", undefined, "suggerimenti");
  const messaggio = el("p", "", "esito");
  messaggio.setAttribute("role", "status");
  const box = el("div", undefined, "risultato");
  campo.append(etichetta, input, suggerimenti);
  contenitore.append(campo, messaggio, box);

  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    suggerimenti.replaceChildren();
    const testo = input.value.trim();
    if (testo.length < 2) return;
    timer = setTimeout(async () => {
      try {
        const luoghi = (await cerca(testo)).slice(0, 8);
        if (input.value.trim() !== testo) return;
        suggerimenti.replaceChildren();
        for (const l of luoghi) {
          const b = el("button", l.etichetta, "suggerimento");
          b.type = "button";
          b.addEventListener("click", () => scegli(l));
          suggerimenti.append(b);
        }
      } catch {
        messaggio.textContent = "Non riesco a cercare le città adesso: riprova.";
      }
    }, 350);
  });

  async function scegli(luogo) {
    suggerimenti.replaceChildren();
    input.value = luogo.etichetta;
    messaggio.textContent = "Carico le previsioni…";
    box.replaceChildren();
    try {
      const r = await calcolaAdesso(luogo, fonti);
      messaggio.textContent = "";
      disegna(r, box);
    } catch {
      messaggio.textContent = "Previsioni non disponibili adesso: riprova tra poco.";
    }
  }
}

function disegna(r, box) {
  box.replaceChildren();
  const ora = r.ore.length ? r.ore[0] : null;
  box.append(el("h2", r.luogo.etichetta));
  if (!r.ore.length) {
    box.append(el("p", `Nessun dato per le prossime ${ORE} ore.`));
    return;
  }
  box.append(el("p", `Prossime ${ORE} ore, dalle ${fmt(ora.ora)}:00 (ora locale del luogo).`, "nota"));
  box.append(el("h3", "Pioggia (mm)"));
  const barreBox = el("div", undefined, "barre-ore-box");
  box.append(barreBox);
  const etichetta = (o) => (o.giorno === r.ore[0].giorno ? fmt(o.ora) : `${fmt(o.ora)}↓`);
  disegnaBarre(barreBox, r.ore.map((o) => ({ etichetta: etichetta(o), mm: o.mm, livello: o.livello })), { unita: "mm" });
  const tabella = el("table", undefined, "tabella-ore");
  const testa = el("tr");
  ["Ora", "Pioggia mm", "Probabilità", "Temp", "Giudizio"].forEach((t) => testa.append(el("th", t)));
  tabella.append(testa);
  for (const o of r.ore) {
    const tr = el("tr");
    const prob = o.prob === null || o.prob === undefined ? "-" : `${o.prob}%`;
    const temp = o.temp === null || o.temp === undefined ? "-" : `${o.temp}°`;
    [`${fmt(o.ora)}-${fmt(o.ora + 1)}`, o.mm === null ? "-" : mm(o.mm), prob, temp, valutaOra(o).livello === null ? "dati mancanti" : ["ok", "a rischio", "pioggia probabile"][valutaOra(o).livello]]
      .forEach((t) => tr.append(el("td", String(t))));
    tabella.append(tr);
  }
  box.append(tabella);
}
