// Scheda Partenza: quando conviene partire per il viaggio da A a B.
// calcolaPartenza è pura rispetto alla rete: riceve le fonti come parametro (si testa senza browser).
import { orarioPunto as orarioPuntoVero, cercaLuogo as cercaLuogoVero } from "../fonti/openmeteo.js";
import { percorsoStrada as percorsoStradaVero, puntiLungoPercorso } from "../fonti/percorso.js";
import { conLimite } from "../rete.js";
import {
  combinaOre, consiglio, distanzaKm, durataStimata, orePuntoDaRisposte, partenze, puntiIntermedi, fasce, mm,
} from "../motore.js";
import { creaMappa } from "./mappa.js";
import { disegnaBarre } from "./barre.js";
import { cercaVia as cercaViaVera } from "../fonti/indirizzi.js";
import { salva, leggi } from "../preferiti.js";
import { leggiUltimo, salvaUltimo, etichettaDataOra, statoUltimo, oraNelFuso } from "../freschezza.js";

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
  let percorso = null;
  let kmStrada = null;
  let frazioniRotta = null;
  if (a) {
    const fusoA = a.fuso || (await fonti.orarioPunto(a.lat, a.lon, giorno)).fuso;
    if (!stessoFuso(fusoDa, fusoA, giorno)) {
      throw new Error(`Partenza (${fusoDa}) e arrivo (${fusoA}) hanno fusi orari diversi: questo tipo di tragitto non è supportato.`);
    }
    km = distanzaKm(da.lat, da.lon, a.lat, a.lon);
    // Se il percorso stradale è disponibile, i punti stanno lungo le strade; altrimenti in linea d'aria.
    const rotta = fonti.percorso ? await fonti.percorso([da, a]) : null;
    let intermedi;
    if (rotta) {
      percorso = rotta.coordinate;
      kmStrada = rotta.km;
      const pts = puntiLungoPercorso(percorso, Math.min(5, Math.floor(kmStrada / 15)));
      intermedi = pts.map((p) => [`km ${Math.round(p.km)}`, p.lat, p.lon]);
      frazioniRotta = [0, ...pts.map((p) => p.frazione), 1];
    } else {
      intermedi = puntiIntermedi(da.lat, da.lon, a.lat, a.lon, km);
    }
    punti = [...punti, ...intermedi.map(([nome, lat, lon]) => ({ nome, lat, lon })), { nome: a.nome, lat: a.lat, lon: a.lon }];
    // Nomi uguali (es. due "San Martino") farebbero collidere i risultati per punto: si distinguono qui.
    if (punti[0].nome === punti[punti.length - 1].nome) {
      punti[0] = { ...punti[0], nome: `${punti[0].nome} (partenza)` };
      punti[punti.length - 1] = { ...punti[punti.length - 1], nome: `${a.nome} (arrivo)` };
    }
    if (percorso) note.push("Percorso lungo le strade");
    else if (intermedi.length) note.push("Punti intermedi in linea d'aria, non lungo la strada: sono indicativi");
  }
  const durata = durata_min ?? (a ? durataStimata(km) : 0);
  const primaOra = primaOraDi(giorno, adesso, dalle);

  const risposte = await conLimite(4, punti.map((p) => () => fonti.orarioPunto(p.lat, p.lon, giorno)));
  const conEnsemble = risposte.every((r) => r.ens);
  if (!conEnsemble) note.push("Senza ensemble: uso solo i modelli");
  const ore = punti.map((p, i) => ({ nome: p.nome, ore: orePuntoDaRisposte(risposte[i].det, risposte[i].ens, giorno) }));
  const frazioni = frazioniRotta ?? punti.map((p) => (km ? distanzaKm(punti[0].lat, punti[0].lon, p.lat, p.lon) / km : 0));
  const datiPartenze = ore.map((p, i) => ({ nome: p.nome, frazione: frazioni[i], ore: p.ore }));

  const oreCombinate = combinaOre(ore, primaOra, alle);
  const lista = partenze(datiPartenze, durata, primaOra, alle);
  if (!lista.length) note.push("Nessun orario rimasto oggi");
  const risultato = {
    punti, km, percorso, km_strada: kmStrada, durata_min: durata, ore: oreCombinate, partenze: lista,
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

export function montaPartenza(contenitore, { cerca = cercaLuogoVero, cercaVia = cercaViaVera, fonti = { orarioPunto: orarioPuntoVero, percorso: percorsoStradaVero } } = {}) {
  contenitore.replaceChildren();
  const oggi = oraLocale("Europe/Rome").slice(0, 10);
  const form = el("form", undefined, "partenza-form");
  const cittaDa = campo("Città di partenza", "partenza-citta-da");
  const viaDa = campo("Via di partenza (facoltativo)", "partenza-via-da");
  const cittaA = campo("Città di arrivo (facoltativo)", "partenza-citta-a");
  const viaA = campo("Via di arrivo (facoltativo)", "partenza-via-a");
  viaDa.wrap.hidden = true;
  viaA.wrap.hidden = true;
  const giorno = { wrap: el("div", undefined, "campo"), input: el("select") };
  giorno.input.id = "partenza-giorno";
  const etichettaGiorno = el("label", "Giorno");
  etichettaGiorno.htmlFor = giorno.input.id;
  giorno.wrap.append(etichettaGiorno, giorno.input);
  const primo = Date.parse(`${oggi}T00:00:00Z`);
  for (let i = 0; i < 16; i++) {
    const iso = new Date(primo + i * 86400000).toISOString().slice(0, 10);
    const nome = new Intl.DateTimeFormat("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
      .format(new Date(`${iso}T12:00:00Z`));
    const o = el("option", i === 0 ? `Oggi, ${nome}` : i === 1 ? `Domani, ${nome}` : nome);
    o.value = iso;
    giorno.input.append(o);
  }
  const durata = campo("Durata del viaggio (minuti)", "partenza-durata", "number", "");
  durata.input.placeholder = "vuoto = stima";
  durata.input.min = "5";
  durata.input.max = "600";
  const dalleSel = selectOre("partenza-dalle", Array.from({ length: 24 }, (_, i) => i), 6);
  const alleSel = selectOre("partenza-alle", Array.from({ length: 24 }, (_, i) => i + 1), 23);
  const fasciaLabel = el("label", "Fascia oraria", "etichetta");
  fasciaLabel.htmlFor = "partenza-dalle";
  const fascia = el("div", undefined, "fascia");
  fascia.append(fasciaLabel, dalleSel, el("span", " – "), alleSel);
  const pulsante = el("button", "Calcola", "pulsante primario");
  pulsante.type = "submit";
  const messaggio = el("p", "", "esito");
  messaggio.setAttribute("role", "status");
  messaggio.setAttribute("aria-live", "polite");
  const risultatoBox = el("div", undefined, "risultato");
  form.append(cittaDa.wrap, viaDa.wrap, cittaA.wrap, viaA.wrap, giorno.wrap, durata.wrap, fascia, pulsante, messaggio);
  contenitore.append(form, risultatoBox);
  mostraStorico(risultatoBox);

  // Per ogni estremo (da, a): città scelta, via scelta (o null = centro città), punto finale.
  const stato = { da: { citta: null, via: null }, a: { citta: null, via: null } };
  const campi = { da: { citta: cittaDa, via: viaDa }, a: { citta: cittaA, via: viaA } };

  function togliOmonimi(k) {
    campi[k].citta.wrap.querySelectorAll(".omonimi").forEach((s) => s.remove());
    campi[k].via.wrap.querySelectorAll(".omonimi").forEach((s) => s.remove());
  }
  function azzera(k) {
    stato[k] = { citta: null, via: null };
    campi[k].via.input.value = "";
    campi[k].via.wrap.hidden = true;
    togliOmonimi(k);
    svuotaSuggerimenti(k);
  }

  /** Riquadro dei suggerimenti sotto il campo (città o via), creato una volta sola. */
  function boxSuggerimenti(k, tipo) {
    let b = campi[k][tipo].wrap.querySelector(".suggerimenti");
    if (!b) {
      b = el("div", undefined, "suggerimenti");
      campi[k][tipo].wrap.append(b);
    }
    return b;
  }
  function svuotaSuggerimenti(k) {
    campi[k].citta.wrap.querySelector(".suggerimenti")?.replaceChildren();
    campi[k].via.wrap.querySelector(".suggerimenti")?.replaceChildren();
  }
  /** Mostra le voci tra cui scegliere: cliccandone una si richiama onPick con il luogo. */
  function mostraSuggerimenti(k, tipo, voci, onPick) {
    const box = boxSuggerimenti(k, tipo);
    box.replaceChildren();
    for (const v of voci) {
      const b = el("button", v.label, "suggerimento");
      b.type = "button";
      b.addEventListener("click", () => { box.replaceChildren(); onPick(v.luogo); });
      box.append(b);
    }
  }

  const timer = {};
  for (const k of ["da", "a"]) {
    // Città: dopo due lettere compaiono i suggerimenti; scegliendone una compare subito il campo della via.
    campi[k].citta.input.addEventListener("input", () => {
      azzera(k);
      clearTimeout(timer[k + "c"]);
      const testo = campi[k].citta.input.value.trim();
      if (testo.length < 2) return;
      timer[k + "c"] = setTimeout(async () => {
        try {
          const luoghi = await cerca(testo);
          if (campi[k].citta.input.value.trim() !== testo || !luoghi.length) return;
          const italiani = luoghi.filter((l) => l.codice_paese === luoghi[0].codice_paese).slice(0, 5);
          campi[k].via.wrap.hidden = false; // la via è disponibile anche senza scegliere il suggerimento
          mostraSuggerimenti(k, "citta", italiani.map((l) => ({ label: l.etichetta, luogo: l })), (l) => {
            stato[k].citta = l;
            campi[k].citta.input.value = l.nome;
            campi[k].via.wrap.hidden = false;
            campi[k].via.input.focus();
          });
        } catch { /* niente suggerimenti: si può comunque scrivere e premere Calcola */ }
      }, 350);
    });
    // Via: con almeno tre lettere e una città scelta compaiono le vie (il servizio è a passo lento).
    campi[k].via.input.addEventListener("input", () => {
      stato[k].via = null;
      togliOmonimi(k);
      campi[k].via.wrap.querySelector(".suggerimenti")?.replaceChildren();
      clearTimeout(timer[k + "v"]);
      const testo = campi[k].via.input.value.trim();
      const cittaScritta = campi[k].citta.input.value.trim();
      if (testo.length < 3 || (!stato[k].citta && cittaScritta.length < 2)) return;
      timer[k + "v"] = setTimeout(async () => {
        try {
          if (!stato[k].citta) {
            const trovate = await cerca(cittaScritta);
            const italiane = trovate.filter((l) => l.codice_paese === trovate[0]?.codice_paese);
            if (!italiane.length) return;
            stato[k].citta = italiane[0];
          }
          const vie = await cercaVia(testo, stato[k].citta.nome);
          if (campi[k].via.input.value.trim() !== testo || !vie.length) return;
          mostraSuggerimenti(k, "via", vie.map((v) => ({ label: v.etichetta, luogo: v })), (v) => {
            stato[k].via = v;
            campi[k].via.input.value = testo;
          });
        } catch { /* niente suggerimenti */ }
      }, 900);
    });
  }


  /** Lista per scegliere tra più luoghi: il primo è preselezionato, la scelta vale solo se la cambi. */
  function scegliTra(wrap, luoghi, etichetta, onChange) {
    const lista = el("select", undefined, "omonimi");
    lista.setAttribute("aria-label", `Quale ${etichetta}?`);
    luoghi.forEach((l, i) => {
      const o = el("option", l.etichetta);
      o.value = String(i);
      lista.append(o);
    });
    lista.addEventListener("change", () => onChange(luoghi[Number(lista.value)]));
    wrap.append(lista);
  }

  /** Risolve la città. Restituisce {vuoto}, {ok: luogo} oppure {ambigua: testo}. */
  async function risolviCitta(k) {
    const testo = campi[k].citta.input.value.trim();
    if (!testo) return { vuoto: true };
    if (stato[k].citta) return { ok: stato[k].citta };
    const trovati = await cerca(testo);
    if (!trovati.length) throw new Error(`Città non trovata: ${testo}`);
    const luoghi = trovati.filter((l) => l.codice_paese === trovati[0].codice_paese);
    togliOmonimi(k);
    stato[k].citta = luoghi[0];
    campi[k].via.wrap.hidden = false; // ora si scrive la via
    if (luoghi.length === 1) return { ok: luoghi[0] };
    scegliTra(campi[k].citta.wrap, luoghi, "città", (l) => { stato[k].citta = l; campi[k].via.wrap.hidden = false; });
    return { ambigua: testo };
  }

  /** Risolve la via nella città scelta. Senza via si usa il centro della città. */
  async function risolviVia(k) {
    const testo = campi[k].via.input.value.trim();
    if (!testo) return { ok: null };
    if (stato[k].via) return { ok: stato[k].via };
    const vie = await cercaVia(testo, stato[k].citta.nome);
    if (!vie.length) throw new Error(`Via non trovata a ${stato[k].citta.nome}: scrivila in un altro modo, o lascia vuoto per il centro.`);
    campi[k].via.wrap.querySelectorAll(".omonimi").forEach((s) => s.remove());
    stato[k].via = vie[0];
    if (vie.length === 1) return { ok: vie[0] };
    scegliTra(campi[k].via.wrap, vie, "via", (v) => { stato[k].via = v; });
    return { ambigua: testo };
  }

  /** Il punto finale di un estremo: via se c'è, altrimenti il centro della città. */
  async function risolviPunto(k) {
    const c = await risolviCitta(k);
    if (c.vuoto) return { punto: null, ambigua: null };
    if (c.ambigua) return { punto: null, ambigua: `città ${c.ambigua}` };
    const v = await risolviVia(k);
    if (v.ambigua) return { punto: null, ambigua: `via ${v.ambigua}` };
    const base = stato[k].citta;
    return { punto: v.ok ? { ...v.ok, fuso: base.fuso } : base, ambigua: null };
  }

  // Un preferito scelto o la posizione dal dispositivo compilano il form e calcolano subito.
  const togliTutti = () => { togliOmonimi("da"); togliOmonimi("a"); };
  document.addEventListener("preferito-scelto", (ev) => {
    const p = ev.detail;
    togliTutti();
    stato.da = { citta: p.da, via: null };
    cittaDa.input.value = p.da.nome;
    viaDa.wrap.hidden = true;
    if (p.a) {
      stato.a = { citta: p.a, via: null };
      cittaA.input.value = p.a.nome;
      viaA.wrap.hidden = true;
    } else {
      azzera("a");
      cittaA.input.value = "";
    }
    durata.input.value = p.durata_min ? String(p.durata_min) : "";
    form.requestSubmit();
  });
  document.addEventListener("posizione", (ev) => {
    togliTutti();
    stato.da = { citta: ev.detail, via: null };
    cittaDa.input.value = ev.detail.nome;
    viaDa.wrap.hidden = true;
    cittaA.input.focus();
  });

  // Invio passa al campo successivo: città → via → città d'arrivo → via → giorno → durata. Sulla durata calcola.
  const ordine = ["partenza-citta-da", "partenza-via-da", "partenza-citta-a", "partenza-via-a", "partenza-giorno", "partenza-durata"];
  // Dopo un Invio sui campi precedenti alla durata, l'invio implicito del modulo viene ignorato per un momento.
  let invioBloccatoFino = 0;
  form.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const i = ordine.indexOf(e.target.id);
    if (i < 0 || i === ordine.length - 1) return; // sulla durata Invio invia il modulo
    e.preventDefault();
    invioBloccatoFino = Date.now() + 500;
    // Invio conferma il primo suggerimento proposto per il campo, se c'è.
    const primo = e.target.closest(".campo")?.querySelector(".suggerimenti > button");
    if (primo) primo.click();
    for (let j = i + 1; j < ordine.length; j++) {
      const campo = document.getElementById(ordine[j]);
      if (campo && !campo.closest(".campo").hidden) { campo.focus(); return; }
    }
    document.getElementById("partenza-durata").focus();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (Date.now() < invioBloccatoFino) return; // Invio sui campi precedenti: si passa solo al campo successivo
    messaggio.textContent = "Calcolo in corso…";
    risultatoBox.replaceChildren();
    try {
      const d = await risolviPunto("da");
      const a = await risolviPunto("a");
      const ambigui = [d.ambigua && `partenza: ${d.ambigua}`, a.ambigua && `arrivo: ${a.ambigua}`].filter(Boolean);
      if (ambigui.length) {
        messaggio.textContent = `Scegli il luogo giusto in elenco (${ambigui.join("; ")}), poi premi Calcola.`;
        return;
      }
      if (!d.punto) throw new Error("Scrivi la città di partenza");
      const durataVal = durata.input.value.trim();
      const dataGiorno = giorno.input.value || oggi;
      const adesso = oraLocale(d.punto.fuso || "Europe/Rome");
      await calcolaPartenza(
        { da: d.punto, a: a.punto, giorno: dataGiorno, durata_min: durataVal ? Number(durataVal) : null,
          dalle: Number(dalleSel.value), alle: Number(alleSel.value), adesso },
        fonti,
        (r) => {
          disegna(r, risultatoBox, { da: d.punto, a: a.punto, durata: durataVal });
          salvaUltimo(ARCHIVIO(), {
            giorno: dataGiorno, fuso: d.punto.fuso || "Europe/Rome", punti: r.punti.map((p) => p.nome),
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

  /** Mostra l'ultimo risultato salvato, con il suo stato reale (spec §5.1). */
  function mostraStorico(box) {
    const u = leggiUltimo(ARCHIVIO());
    if (!u) return;
    const stato = statoUltimo(u, Date.now());
    const c = u.consiglio;
    const punti = u.punti.join(" → ");
    const quando = `${etichettaDataOra(u.acquisito_ms, u.fuso)} (${u.fuso})`;
    const giornoPrevisto = `${u.giorno.slice(8, 10)}/${u.giorno.slice(5, 7)}`;
    const oggiU = oraNelFuso(Date.now(), u.fuso).giorno;
    const perGiorno = u.giorno === oggiU ? "" : ` per il giorno ${giornoPrevisto}`;
    let testo, classe;
    if (stato.tipo === "storico") {
      testo = `Storico del ${quando}${perGiorno}: nessun consiglio attuale. Calcola di nuovo.`;
      classe = "banner no";
    } else {
      const fasciaTesto = stato.rimaste
        ? (stato.rimaste.dalle === stato.rimaste.alle - 1 ? `alle ${fmt(stato.rimaste.dalle)}:00` : `tra le ${fmt(stato.rimaste.dalle)}:00 e le ${fmt(stato.rimaste.alle - 1)}:00`)
        : (c && c.consigliabile ? "" : "nessun orario davvero buono");
      if (stato.tipo === "vecchio") {
        testo = `Dati di ${Math.round(stato.minuti / 60)} ore fa${perGiorno}: aggiorna prima di partire. Ultimo consiglio: ${fasciaTesto} (${punti}).`;
        classe = "banner no";
      } else {
        testo = `Ultimo risultato, aggiornato ${stato.minuti} min fa${perGiorno}: ${fasciaTesto} (${punti}).`;
        classe = "banner";
      }
    }
    box.prepend(el("p", testo, classe));
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
    box.append(el("p", testo, cons && cons.consigliabile ? "banner ok" : "banner no"));
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
    const mappa = creaMappa(mappaBox, { punti: r.punti, km: r.km, percorso: r.percorso });
    const indice = r.ore.findIndex((o) => cons && o.ora === cons.dalle);
    mappa.mostraOre(r.ore, Math.max(0, indice));
    box.append(el("h3", "Pioggia per ora (mm)"));
    const barreBox = el("div", undefined, "barre-ore-box");
    box.append(barreBox);
    disegnaBarre(barreBox, r.ore.map((o) => ({ etichetta: fmt(o.ora), mm: o.mm, livello: o.livello })), { unita: "mm" });
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
