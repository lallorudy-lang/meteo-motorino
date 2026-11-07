// Scheda Partenza: quando conviene partire per il viaggio da A a B.
// calcolaPartenza è pura rispetto alla rete: riceve le fonti come parametro (si testa senza browser).
import { orarioPunto as orarioPuntoVero, cercaLuogo as cercaLuogoVero } from "../fonti/openmeteo.js";
import { conLimite } from "../rete.js";
import {
  combinaOre, consiglio, distanzaKm, durataStimata, orePuntoDaRisposte, partenze, puntiIntermedi, fasce, mm,
} from "../motore.js";
import { creaMappa } from "./mappa.js";
import { salva, leggi } from "../preferiti.js";
import { leggiUltimo, salvaUltimo, etichettaDataOra, valutaFreschezza, LIMITI_MIN } from "../freschezza.js";

const DURATA_MIN = 5;
const DURATA_MAX = 600;
const ARCHIVIO = () => globalThis.localStorage;

/** Offset in minuti del fuso in un giorno (ISO), a mezzogiorno. */
function offsetMinuti(fuso, giorno) {
  const data = new Date(`${giorno}T12:00:00Z`);
  const parti = new Intl.DateTimeFormat("en-US", { timeZone: fuso, timeZoneName: "longOffset" }).formatToParts(data);
  const testo = parti.find((p) => p.type === "timeZoneName")?.value || "GMT";
  const m = testo.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3] || 0));
}

function stessoFuso(f1, f2, giorno) {
  return f1 === f2 || offsetMinuti(f1, giorno) === offsetMinuti(f2, giorno);
}

/** Data e ora attuali nel fuso indicato, come "AAAA-MM-GGTHH:MM". */
export function oraLocale(fuso, quando = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(quando).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/** Ore di partenza di oggi: non si parte nel passato. adesso è "AAAA-MM-GGTHH:MM" nel fuso della partenza. */
function primaOraDi(giorno, adesso, dalle) {
  if (!adesso || adesso.slice(0, 10) !== giorno) return dalle;
  // Le partenze si valutano a ora piena: se sono già passati dei minuti, l'ora corrente è passata.
  const ora = Number(adesso.slice(11, 13));
  const minuti = Number(adesso.slice(14, 16));
  return Math.max(dalle, ora + (minuti > 0 ? 1 : 0));
}

/**
 * Calcola gli orari di partenza per un viaggio da `da` ad `a` (o per una sola località se a è null).
 * fonti.orarioPunto(lat, lon, giorno) -> {det, ens, fuso}.
 * avvisa(risultato) viene chiamata una volta, alla fine: l'ensemble arriva insieme alle previsioni.
 */
export async function calcolaPartenza(
  { da, a, giorno, durata_min, dalle = 6, alle = 23, adesso },
  fonti = { orarioPunto: orarioPuntoVero },
  avvisa = () => {},
) {
  if (durata_min !== null && durata_min !== undefined && (durata_min < DURATA_MIN || durata_min > DURATA_MAX)) {
    throw new Error(`La durata deve essere tra ${DURATA_MIN} e ${DURATA_MAX} minuti`);
  }
  if (adesso && giorno < adesso.slice(0, 10)) {
    throw new Error("Le date richieste sono già passate: scegli oggi o un giorno successivo");
  }
  const note = [];
  const fusoDa = da.fuso || (await fonti.orarioPunto(da.lat, da.lon, giorno)).fuso;
  let km = 0;
  let punti = [{ nome: da.nome, lat: da.lat, lon: da.lon }];
  if (a) {
    const fusoA = a.fuso || (await fonti.orarioPunto(a.lat, a.lon, giorno)).fuso;
    if (!stessoFuso(fusoDa, fusoA, giorno)) {
      throw new Error(`Partenza (${fusoDa}) e arrivo (${fusoA}) hanno fusi orari diversi: questo tipo di tragitto non è supportato.`);
    }
    km = distanzaKm(da.lat, da.lon, a.lat, a.lon);
    const intermedi = puntiIntermedi(da.lat, da.lon, a.lat, a.lon, km);
    punti = [...punti, ...intermedi.map(([nome, lat, lon]) => ({ nome, lat, lon })), { nome: a.nome, lat: a.lat, lon: a.lon }];
    // Nomi uguali (es. due "San Martino") farebbero collidere i risultati per punto: si distinguono qui.
    if (punti[0].nome === punti[punti.length - 1].nome) {
      punti[0] = { ...punti[0], nome: `${punti[0].nome} (partenza)` };
      punti[punti.length - 1] = { ...punti[punti.length - 1], nome: `${a.nome} (arrivo)` };
    }
    if (intermedi.length) note.push("Punti intermedi in linea d'aria, non lungo la strada: sono indicativi");
  }
  const durata = durata_min ?? (a ? durataStimata(km) : 0);
  const primaOra = primaOraDi(giorno, adesso, dalle);

  const risposte = await conLimite(4, punti.map((p) => () => fonti.orarioPunto(p.lat, p.lon, giorno)));
  const conEnsemble = risposte.every((r) => r.ens);
  if (!conEnsemble) note.push("Senza ensemble: uso solo i modelli");
  const ore = punti.map((p, i) => ({ nome: p.nome, ore: orePuntoDaRisposte(risposte[i].det, risposte[i].ens, giorno) }));
  const frazioni = punti.map((p) => (km ? distanzaKm(punti[0].lat, punti[0].lon, p.lat, p.lon) / km : 0));
  const datiPartenze = ore.map((p, i) => ({ nome: p.nome, frazione: frazioni[i], ore: p.ore }));

  const oreCombinate = combinaOre(ore, primaOra, alle);
  const lista = partenze(datiPartenze, durata, primaOra, alle);
  if (!lista.length) note.push("Nessun orario rimasto oggi");
  const risultato = {
    punti, km, durata_min: durata, ore: oreCombinate, partenze: lista,
    fasce: fasce(lista), consiglio: consiglio(lista), note, con_ensemble: conEnsemble,
  };
  avvisa(risultato);
  return risultato;
}

// ---------------------------------------------------------------------------
// Interfaccia
// ---------------------------------------------------------------------------

const fmt = (n) => String(n).padStart(2, "0");

function el(tag, testo, classe) {
  const e = document.createElement(tag);
  if (testo !== undefined) e.textContent = testo;
  if (classe) e.className = classe;
  return e;
}

function campo(etichetta, id, tipo = "text", valore = "") {
  const wrap = el("div", undefined, "campo");
  const label = el("label", etichetta);
  label.htmlFor = id;
  const input = el("input");
  input.id = id;
  input.type = tipo;
  input.value = valore;
  wrap.append(label, input);
  return { wrap, input };
}

function selectOre(id, valori, selezionato) {
  const s = el("select");
  s.id = id;
  for (const v of valori) {
    const o = el("option", `${fmt(v)}:00`);
    o.value = String(v);
    if (v === selezionato) o.selected = true;
    s.append(o);
  }
  return s;
}

/** Monta la scheda Partenza dentro `contenitore`. */
export function montaPartenza(contenitore, { cerca = cercaLuogoVero, fonti = { orarioPunto: orarioPuntoVero } } = {}) {
  contenitore.replaceChildren();
  const oggi = oraLocale("Europe/Rome").slice(0, 10);
  const form = el("form", undefined, "partenza-form");
  const da = campo("Da", "partenza-da");
  const a = campo("A (facoltativo)", "partenza-a");
  const giorno = campo("Giorno", "partenza-giorno", "date", oggi);
  const durata = campo("Durata del viaggio (minuti)", "partenza-durata", "number", "");
  durata.input.min = "5";
  durata.input.max = "600";
  const dalleSel = selectOre("partenza-dalle", Array.from({ length: 24 }, (_, i) => i), 6);
  const alleSel = selectOre("partenza-alle", Array.from({ length: 24 }, (_, i) => i + 1), 23);
  const fasciaLabel = el("label", "Fascia oraria", "etichetta");
  fasciaLabel.htmlFor = "partenza-dalle";
  const fascia = el("div", undefined, "fascia");
  fascia.append(fasciaLabel, dalleSel, el("span", " – "), alleSel);
  const scelta = el("div", undefined, "scelta");
  const pulsante = el("button", "Calcola", "pulsante primario");
  pulsante.type = "submit";
  const messaggio = el("p", "", "esito");
  messaggio.setAttribute("role", "status");
  messaggio.setAttribute("aria-live", "polite");
  const risultatoBox = el("div", undefined, "risultato");
  form.append(da.wrap, a.wrap, giorno.wrap, durata.wrap, fascia, scelta, pulsante, messaggio);
  contenitore.append(form, risultatoBox);
  mostraStorico(risultatoBox);

  // Il luogo scelto (anche tra omonimi) resta in memoria, finché il testo non viene cambiato a mano.
  const scelti = { da: null, a: null };
  for (const [chiave, input] of [["da", da.input], ["a", a.input]]) {
    input.addEventListener("input", () => {
      scelti[chiave] = null;
      input.closest(".campo").querySelector(".omonimi")?.remove();
    });
  }

  async function risolvi(chiave, input, etichetta) {
    const testo = input.value.trim();
    if (!testo) return { luogo: null, ambiguo: false };
    if (scelti[chiave]) return { luogo: scelti[chiave], ambiguo: false };
    const trovati = await cerca(testo);
    if (!trovati.length) throw new Error(`Località non trovata: ${testo}`);
    // Solo gli omonimi dello stesso paese del primo risultato: quelli esteri sono rumore.
    const luoghi = trovati.filter((l) => l.codice_paese === trovati[0].codice_paese);
    if (luoghi.length === 1) {
      scelti[chiave] = luoghi[0];
      return { luogo: luoghi[0], ambiguo: false };
    }
    // Omonimi: si fa scegliere prima di calcolare.
    const lista = el("select", undefined, "omonimi");
    lista.setAttribute("aria-label", `Quale ${etichetta}?`);
    luoghi.forEach((l, i) => {
      const o = el("option", l.etichetta);
      o.value = String(i);
      lista.append(o);
    });
    lista.addEventListener("change", () => { scelti[chiave] = luoghi[Number(lista.value)]; });
    scelti[chiave] = luoghi[0];
    input.closest(".campo").querySelector(".omonimi")?.remove();
    input.closest(".campo").append(lista);
    return { luogo: null, ambiguo: testo };
  }

  // Un preferito scelto o la posizione dal dispositivo compilano il form e calcolano subito.
  const togliOmonimi = () => form.querySelectorAll(".omonimi").forEach((s) => s.remove());
  document.addEventListener("preferito-scelto", (ev) => {
    togliOmonimi();
    const p = ev.detail;
    da.input.value = p.da.nome; scelti.da = p.da;
    a.input.value = p.a ? p.a.nome : ""; scelti.a = p.a || null;
    durata.input.value = p.durata_min ? String(p.durata_min) : "";
    form.requestSubmit();
  });
  document.addEventListener("posizione", (ev) => {
    togliOmonimi();
    da.input.value = ev.detail.nome; scelti.da = ev.detail;
    a.input.focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    messaggio.textContent = "Calcolo in corso…";
    risultatoBox.replaceChildren();
    try {
      const rDa = await risolvi("da", da.input, "partenza");
      const rA = await risolvi("a", a.input, "arrivo");
      const ambigui = [rDa.ambiguo, rA.ambiguo].filter(Boolean);
      if (ambigui.length) {
        messaggio.textContent = `Ci sono più luoghi chiamati ${ambigui.join(" e ")}: scegli quello giusto in elenco, poi premi Calcola.`;
        return;
      }
      const dl = rDa.luogo;
      const al = rA.luogo;
      if (!dl) throw new Error("Scrivi la città di partenza");
      const durataVal = durata.input.value.trim();
      const dataGiorno = giorno.input.value || oggi;
      const adesso = oraLocale(dl.fuso || "Europe/Rome");
      await calcolaPartenza(
        { da: dl, a: al, giorno: dataGiorno, durata_min: durataVal ? Number(durataVal) : null,
          dalle: Number(dalleSel.value), alle: Number(alleSel.value), adesso },
        fonti,
        (r) => {
          disegna(r, risultatoBox, { da: dl, a: al, durata: durataVal });
          salvaUltimo(ARCHIVIO(), {
            giorno: dataGiorno, fuso: dl.fuso || "Europe/Rome", punti: r.punti.map((p) => p.nome),
            durata_min: r.durata_min, consiglio: r.consiglio, fasce: r.fasce,
          }, Date.now());
        },
      );
      messaggio.textContent = "";
      if (!durataVal) durata.input.value = "";
    } catch (err) {
      messaggio.textContent = err.message;
    }
  });

  /** Mostra l'ultimo risultato salvato, marcandolo come storico quando non è più attuale. */
  function mostraStorico(box) {
    const u = leggiUltimo(ARCHIVIO());
    if (!u) return;
    const f = valutaFreschezza(u.acquisito_ms, Date.now(), LIMITI_MIN.previsioni);
    const c = u.consiglio;
    const orario = c && c.consigliabile ? `tra le ${fmt(c.dalle)}:00 e le ${fmt(c.alle - 1)}:00` : "nessun orario davvero buono";
    const testo = f.attuale
      ? `Ultimo risultato, ${f.testo}: ${orario} (${u.punti.join(" → ")})`
      : `Storico del ${etichettaDataOra(u.acquisito_ms, u.fuso)}: ${orario} (${u.punti.join(" → ")}). Calcola di nuovo prima di partire.`;
    const p = el("p", testo, f.attuale ? "banner" : "banner no");
    box.prepend(p);
  }

  function disegna(r, box, { da: dl, a: al, durata: durataScritta }) {
    box.replaceChildren();
    if (!durataScritta) durata.input.value = String(r.durata_min);
    const cons = r.consiglio;
    const testo = !r.partenze.length
      ? "Nessun orario rimasto oggi: prova con un altro giorno."
      : !cons
        ? "Dati insufficienti per consigliare un orario."
      : cons.consigliabile
        ? `Orari di partenza consigliati: tra le ${fmt(cons.dalle)}:00 e le ${fmt(cons.alle - 1)}:00 per un viaggio di ${r.durata_min} minuti`
        : `Nessun orario davvero buono. La partenza meno sfavorevole è alle ${fmt(cons.dalle)}:00 per un viaggio di ${r.durata_min} minuti`;
    const banner = el("p", testo, cons && cons.consigliabile ? "banner ok" : "banner no");
    box.append(banner);
    const btnPref = el("button", "☆ Salva questo tragitto", "pulsante");
    btnPref.type = "button";
    btnPref.addEventListener("click", () => {
      const id = `${Date.now()}`;
      salva(ARCHIVIO(), { id, nome: al ? `${dl.nome} → ${al.nome}` : dl.nome, da: dl, a: al || null, durata_min: r.durata_min });
      document.dispatchEvent(new CustomEvent("preferito-salvato"));
      btnPref.textContent = "✓ Salvato";
    });
    box.append(btnPref);
    if (r.note.length) box.append(el("p", r.note.join(" · "), "nota"));
    if (cons) box.append(el("p", `Fasce: ${r.fasce.map((f) => `${fmt(f.dalle)}-${fmt(f.alle)} ${f.giudizio}`).join(" · ")}`, "fasce"));
    const mappaBox = el("div", undefined, "mappa-contenitore");
    box.append(mappaBox);
    const mappa = creaMappa(mappaBox, { punti: r.punti, km: r.km });
    const indice = r.ore.findIndex((o) => cons && o.ora === cons.dalle);
    mappa.mostraOre(r.ore, Math.max(0, indice));
    const tabella = el("table", undefined, "tabella-ore");
    const testa = el("tr");
    ["Ora", "Pioggia mm", "Probabilità", "Ensemble", "Raffiche", "Temp", "Giudizio"].forEach((t) => testa.append(el("th", t)));
    tabella.append(testa);
    for (const o of r.ore) {
      const tr = el("tr");
      const prob = o.prob === null || o.prob === undefined ? "-" : `${o.prob}%`;
      const ens = o.ensemble_pct === null || o.ensemble_pct === undefined ? "-" : `${o.ensemble_pct}%`;
      const raf = o.raffiche === null || o.raffiche === undefined ? "-" : `${o.raffiche} km/h`;
      [`${fmt(o.ora)}-${fmt(o.ora + 1)}`, o.mm === null ? "-" : mm(o.mm), prob, ens, raf, o.temp === null ? "-" : `${o.temp}°`, o.giudizio]
        .forEach((t) => tr.append(el("td", String(t))));
      tabella.append(tr);
    }
    box.append(tabella);
  }
}
