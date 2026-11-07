// Scheda Più giorni: previsione giorno per giorno per una città, fino a 16 giorni.
import { cercaLuogo as cercaLuogoVero, giorniCitta as giorniCittaVero } from "../fonti/openmeteo.js";
import { analizzaGiorni, mm } from "../motore.js";
import { disegnaBarre } from "./barre.js";

const ORIZZONTE = 16;
const GIORNO_MS = 86400000;
const iso = (dt) => dt.toISOString().slice(0, 10);
const daIso = (s) => new Date(`${s}T00:00:00Z`);

/**
 * Calcola le righe giorno per giorno. dal/al/oggi sono date ISO.
 * Restituisce { righe, note }. Lancia errore per date impossibili.
 */
export async function calcolaGiorni({ luogo, dal, al, oggi }, fonti = { giorniCitta: giorniCittaVero }) {
  const note = [];
  if (daIso(al) < daIso(dal)) throw new Error("La data di fine è prima di quella di inizio");
  if (daIso(al) < daIso(oggi)) throw new Error("Le date richieste sono già passate: servono previsioni da oggi in poi");
  let inizio = dal;
  if (daIso(dal) < daIso(oggi)) {
    note.push(`i giorni prima di oggi (${oggi}) non sono previsioni e non vengono mostrati`);
    inizio = oggi;
  }
  const ultimo = iso(new Date(daIso(oggi).getTime() + (ORIZZONTE - 1) * GIORNO_MS));
  if (daIso(inizio) > daIso(ultimo)) {
    throw new Error(`Le date richieste sono oltre l'orizzonte dei modelli (${ORIZZONTE} giorni, fino al ${ultimo})`);
  }
  let fine = al;
  if (daIso(al) > daIso(ultimo)) {
    note.push(`i modelli arrivano solo fino al ${ultimo}: i giorni successivi non sono disponibili`);
    fine = ultimo;
  }
  const giorni = Math.round((daIso(fine) - daIso(oggi)) / GIORNO_MS) + 1;
  const { dati, ens } = await fonti.giorniCitta(luogo.lat, luogo.lon, giorni);
  if (!ens) note.push("ensemble ECMWF non disponibile: affidabilità calcolata solo sui modelli");
  const tutte = analizzaGiorni(dati, ens, oggi, []);
  const righe = tutte.filter((r) => r.data >= inizio && r.data <= fine);
  return { righe, note };
}

// ---------------------------------------------------------------------------
// Interfaccia
// ---------------------------------------------------------------------------

function el(tag, testo, classe) {
  const e = document.createElement(tag);
  if (testo !== undefined) e.textContent = testo;
  if (classe) e.className = classe;
  return e;
}

function oggiLocale(fuso = "Europe/Rome") {
  return new Intl.DateTimeFormat("en-CA", { timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

/** Monta la scheda Più giorni dentro `contenitore`. */
export function montaGiorni(contenitore, { cerca = cercaLuogoVero, fonti = { giorniCitta: giorniCittaVero } } = {}) {
  contenitore.replaceChildren();
  const oggi = oggiLocale();
  const form = el("form", undefined, "partenza-form");
  const cittaLabel = el("label", "Città");
  const cittaInput = el("input");
  cittaInput.id = "giorni-citta";
  cittaInput.type = "text";
  cittaLabel.htmlFor = cittaInput.id;
  const dalInput = el("input");
  dalInput.type = "date"; dalInput.id = "giorni-dal"; dalInput.value = oggi;
  const alInput = el("input");
  alInput.type = "date"; alInput.id = "giorni-al";
  alInput.value = iso(new Date(daIso(oggi).getTime() + 6 * GIORNO_MS));
  const dalLabel = el("label", "Dal"); dalLabel.htmlFor = dalInput.id;
  const alLabel = el("label", "Al"); alLabel.htmlFor = alInput.id;
  const pulsante = el("button", "Mostra", "pulsante primario");
  pulsante.type = "submit";
  const messaggio = el("p", "", "esito");
  messaggio.setAttribute("role", "status");
  messaggio.setAttribute("aria-live", "polite");
  const box = el("div", undefined, "risultato");
  form.append(cittaLabel, cittaInput, dalLabel, dalInput, alLabel, alInput, pulsante, messaggio);
  contenitore.append(form, box);

  let scelto = null;
  cittaInput.addEventListener("input", () => {
    scelto = null;
    form.querySelectorAll(".omonimi").forEach((s) => s.remove());
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messaggio.textContent = "Calcolo in corso…";
    box.replaceChildren();
    try {
      if (!scelto) {
        const trovati = await cerca(cittaInput.value.trim());
        if (!trovati.length) throw new Error(`Località non trovata: ${cittaInput.value.trim()}`);
        const italiani = trovati.filter((l) => l.codice_paese === trovati[0].codice_paese);
        if (italiani.length > 1) {
          const lista = el("select", undefined, "omonimi");
          lista.setAttribute("aria-label", "Quale città?");
          italiani.forEach((l, i) => { const o = el("option", l.etichetta); o.value = String(i); lista.append(o); });
          lista.addEventListener("change", () => { scelto = italiani[Number(lista.value)]; });
          form.querySelectorAll(".omonimi").forEach((s) => s.remove());
          form.insertBefore(lista, pulsante);
          scelto = italiani[0];
          messaggio.textContent = `Ci sono più città chiamate ${cittaInput.value.trim()}: scegli quella giusta in elenco, poi premi Mostra.`;
          return;
        }
        scelto = trovati[0];
      }
      // "Oggi" si ricalcola a ogni invio, nel fuso della città scelta.
      const oggiCitta = oggiLocale(scelto.fuso || "Europe/Rome");
      const { righe, note } = await calcolaGiorni(
        { luogo: scelto, dal: dalInput.value, al: alInput.value, oggi: oggiCitta },
        fonti,
      );
      messaggio.textContent = "";
      disegna(righe, note, box, scelto);
    } catch (err) {
      messaggio.textContent = err.message;
    }
  });
}

function disegna(righe, note, box, luogo) {
  box.replaceChildren();
  box.append(el("h2", `${luogo.etichetta}`));
  for (const n of note) box.append(el("p", n, "nota"));
  if (!righe.length) {
    box.append(el("p", "Nessun giorno disponibile nell'intervallo richiesto."));
    return;
  }
  const tabella = el("table", undefined, "tabella-ore");
  const testa = el("tr");
  ["Giorno", "Tempo", "Min / Max", "Pioggia mm (mediana, media, max)", "Modelli ≥1 mm", "Ensemble ≥1 mm", "Vento", "Affidabilità"]
    .forEach((t) => testa.append(el("th", t)));
  tabella.append(testa);
  for (const r of righe) {
    const tr = el("tr");
    const ens = r.ensemble_ecmwf ? r.ensemble_ecmwf.simulazioni_con_pioggia : "-";
    const vento = r.vento_max_kmh === null ? "-" : `${r.vento_max_kmh} km/h`;
    [r.giorno, r.cielo, `${r.min_media.toFixed(0)}° / ${r.max_media.toFixed(0)}°`,
      `${mm(r.pioggia_mediana_mm)} (${mm(r.pioggia_media_mm)}, ${mm(r.pioggia_max_mm)})`,
      r.modelli_con_pioggia, ens, vento, r.affidabilita]
      .forEach((t) => tr.append(el("td", String(t))));
    tabella.append(tr);
  }
  box.append(tabella);
  box.append(el("h3", "Pioggia per giorno (mm, valore centrale)"));
  const barreBox = el("div", undefined, "barre-giorni-box");
  box.append(barreBox);
  disegnaBarre(barreBox, righe.map((r) => ({ etichetta: r.giorno, mm: r.pioggia_mediana_mm, livello: null })), { unita: "mm" });
  for (const r of righe.filter((x) => x.avviso)) box.append(el("p", `Attenzione ${r.giorno}: ${r.avviso}.`, "nota"));
}

/** Versione con dati già pronti, usata dai test di montaggio e dalla verifica nel browser. */
export const _interno = { oggiLocale };
