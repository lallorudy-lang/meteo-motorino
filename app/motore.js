// Regole di calcolo di Meteo Motorino: funzioni pure, nessun accesso alla rete.
//
// È il "contratto" condiviso con skill/meteo-media/scripts/motore.py: le stesse funzioni
// (camelCase qui, snake_case in Python) superano gli stessi casi in contratto/casi/.
// Una regola si cambia sempre in entrambi i file, aggiungendo un caso al contratto.
// Gli oggetti restituiti usano le stesse chiavi (snake_case) del Python.

export const MODELLI = {
  ecmwf_ifs025: "ECMWF (europeo)",
  gfs_seamless: "GFS (americano)",
  icon_seamless: "ICON (tedesco)",
  meteofrance_seamless: "Météo-France",
  ukmo_seamless: "UKMO (inglese)",
  italia_meteo_arpae_icon_2i: "ItaliaMeteo-ARPAE",
};
const CHIAVI_MODELLI = Object.keys(MODELLI);
export const GIORNI_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
export const RAFFICHE_FORTI = 45;
export const LIVELLI = ["ok", "a rischio", "pioggia probabile"];
export const FASCE = [["notte", 0, 6], ["mattina", 6, 12], ["pomeriggio", 12, 18], ["sera", 18, 24]];

// ---------------------------------------------------------------------------
// Aiuti numerici con la stessa semantica di Python
// ---------------------------------------------------------------------------

/** Arrotondamento alla pari sul valore binario esatto, come round() di Python. */
export function arrotonda(x, cifre = 0) {
  if (x === null || x === undefined) return null;
  const negativo = x < 0;
  const s = Math.abs(x).toFixed(Math.min(100, cifre + 40)); // cifre decimali esatte del valore binario
  const [intera, decimali = ""] = s.split(".");
  const tenute = intera + decimali.slice(0, cifre);
  const resto = decimali.slice(cifre);
  let su;
  if (resto[0] > "5") su = true;
  else if (resto[0] < "5") su = false;
  else if (/[1-9]/.test(resto.slice(1))) su = true;
  else su = Number(tenute[tenute.length - 1]) % 2 === 1; // esattamente a metà: verso il pari
  let cifreTenute = BigInt(tenute) + (su ? 1n : 0n);
  let r = Number(cifreTenute) / 10 ** cifre;
  if (cifre > 0) r = Number(`${cifreTenute / 10n ** BigInt(cifre)}.${(cifreTenute % 10n ** BigInt(cifre)).toString().padStart(cifre, "0")}`);
  r = negativo ? -r : r;
  return r === 0 ? 0 : r;
}

const ordina = (v) => [...v].sort((a, b) => a - b);

/** statistics.median di Python. */
export function mediana(valori) {
  const s = ordina(valori);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
}

/** Valore binario esatto di un double come [numeratore BigInt, esponente di 2]. */
function aFrazione(x) {
  const vista = new DataView(new ArrayBuffer(8));
  vista.setFloat64(0, x);
  const alto = vista.getUint32(0), basso = vista.getUint32(4);
  const segno = alto >>> 31 ? -1n : 1n;
  const esp = (alto >>> 20) & 0x7ff;
  let mantissa = (BigInt(alto & 0xfffff) << 32n) | BigInt(basso);
  if (esp === 0) return [segno * mantissa, -1074];
  mantissa |= 1n << 52n;
  return [segno * mantissa, esp - 1075];
}

/** statistics.mean di Python: somma ESATTA dei valori binari, una sola divisione, un solo arrotondamento. */
export function media(valori) {
  const frazioni = valori.map(aFrazione);
  const emin = Math.min(...frazioni.map(([, e]) => e));
  let somma = 0n;
  for (const [num, e] of frazioni) somma += num << BigInt(e - emin);
  // valore = somma * 2^emin / n: si scrive in decimale con 120 cifre e si lascia a Number()
  // l'arrotondamento corretto al double più vicino.
  let numeratore = somma, denominatore = BigInt(valori.length);
  if (emin >= 0) numeratore <<= BigInt(emin); else denominatore <<= BigInt(-emin);
  const negativo = numeratore < 0n;
  if (negativo) numeratore = -numeratore;
  const intera = numeratore / denominatore;
  const decimali = ((numeratore % denominatore) * 10n ** 120n) / denominatore;
  return Number(`${negativo ? "-" : ""}${intera}.${decimali.toString().padStart(120, "0")}`);
}

const massimo = (v, predefinito = null) => (v.length ? Math.max(...v) : predefinito);
const minimo = (v, predefinito = null) => (v.length ? Math.min(...v) : predefinito);

/** serie[i] oppure null se la serie manca, è più corta o il valore è nullo. */
export function val(serie, i) {
  if (!serie || i === null || i === undefined || i >= serie.length) return null;
  return serie[i] ?? null;
}

export const mm = (x) => arrotonda(x, 1).toFixed(1).replace(".", ",");

// Date "naive" (senza fuso) come in Python: si lavora in UTC per evitare il fuso del dispositivo.
function leggiData(iso) {
  const [d, t = "00:00"] = iso.split("T");
  const [Y, M, D] = d.split("-").map(Number);
  const [h, m] = t.split(":").map(Number);
  return new Date(Date.UTC(Y, M - 1, D, h, m));
}
const due = (n) => String(n).padStart(2, "0");
const isoGiorno = (dt) => `${dt.getUTCFullYear()}-${due(dt.getUTCMonth() + 1)}-${due(dt.getUTCDate())}`;
const isoOra = (dt) => `${isoGiorno(dt)}T${due(dt.getUTCHours())}:${due(dt.getUTCMinutes())}`;
const UNA_ORA = 3600000;
const settimana = (dt) => (dt.getUTCDay() + 6) % 7; // lunedì = 0, come date.weekday()

// ---------------------------------------------------------------------------
// Regole
// ---------------------------------------------------------------------------

export function descriviCielo(codici, pioggiaTipica, nPioggia, nModelli) {
  const nebbia = codici.filter((c) => c === 45 || c === 48).length;
  const temporali = codici.filter((c) => c >= 95).length;
  const neve = codici.filter((c) => (c >= 71 && c <= 77) || c === 85 || c === 86).length;
  const quota = nModelli ? nPioggia / nModelli : 0;
  let testo;
  if (pioggiaTipica >= 10 && quota >= 0.5) testo = "Pioggia forte";
  else if (pioggiaTipica >= 3 && quota >= 0.5) testo = "Pioggia";
  else if (quota > 0.5 || (quota >= 0.5 && pioggiaTipica >= 1)) testo = "Pioggia debole";
  else if (nPioggia >= 1) testo = `Nuvoloso, pioggia possibile (${nPioggia} modell${nPioggia === 1 ? "o" : "i"} su ${nModelli})`;
  else {
    const sereni = codici.filter((c) => c === 0 || c === 1).length;
    testo = sereni > codici.length / 2 ? "Sereno o poco nuvoloso" : "Nuvoloso, asciutto";
  }
  if (temporali >= 2 || (temporali === 1 && quota >= 0.5)) testo += ", possibili temporali";
  if (neve >= 2) testo += ", possibile neve";
  if (nebbia >= 2 && nPioggia === 0) testo += ", nebbia possibile";
  return testo;
}

export function affidabilita(giorniDaOggi, nPioggia, nModelli, spreadMax, ens = null) {
  if (nModelli === 0) return "n.d.";
  const accordo = Math.max(nPioggia, nModelli - nPioggia) / nModelli;
  const motivi = [];
  if (nModelli < 3) motivi.push("pochi modelli");
  if (accordo < 0.6) motivi.push("modelli divisi");
  if (spreadMax > 5) motivi.push("temperature distanti");
  if (giorniDaOggi >= 5) motivi.push("giorno lontano");
  let livello;
  if (motivi.length) livello = "bassa";
  else if (giorniDaOggi <= 2 && accordo >= 0.8 && spreadMax <= 3) livello = "alta";
  else livello = "media";
  if (ens) {
    const quotaDet = nPioggia / nModelli;
    const concordi = (quotaDet >= 0.5) === (ens.quota_pioggia >= 0.5);
    if (livello === "bassa" && motivi.length === 1 && motivi[0] === "giorno lontano" && accordo >= 0.8 && ens.accordo >= 0.9 && concordi) livello = "media";
    else if (livello === "alta" && (ens.accordo < 0.6 || !concordi)) livello = "media";
    else if (livello === "media" && !concordi && Math.abs(quotaDet - ens.quota_pioggia) >= 0.5) livello = "bassa";
  }
  return livello;
}

/** Per ogni timestamp: [data, ora di inizio] dell'ora PRECEDENTE a cui si riferisce il dato. */
export function intervalli(tempi) {
  return tempi.map((t) => {
    const inizio = new Date(leggiData(t).getTime() - UNA_ORA);
    return [isoGiorno(inizio), inizio.getUTCHours()];
  });
}

export function pioggiaOraria(dati, giorno, finestre) {
  const h = dati.hourly || {};
  const rif = intervalli(h.time || []);
  const out = [];
  for (const [nome, da, a] of finestre) {
    const sel = rif.map((r, i) => [r, i]).filter(([[g, ora]]) => g === giorno && da <= ora && ora < a).map(([, i]) => i);
    if (sel.length < a - da) continue; // finestra incompleta
    const somme = [];
    const probs = [];
    for (const m of CHIAVI_MODELLI) {
      const vals = sel.map((i) => val(h[`precipitation_${m}`], i));
      if (vals.every((v) => v !== null)) somme.push(vals.reduce((x, y) => x + y, 0));
      const pv = sel.map((i) => val(h[`precipitation_probability_${m}`], i)).filter((v) => v !== null);
      if (pv.length) probs.push(Math.max(...pv));
    }
    if (!somme.length) continue;
    out.push({
      fascia: nome, ore: `${da}-${a}`, mediana_mm: arrotonda(mediana(somme), 1), max_mm: arrotonda(Math.max(...somme), 1),
      modelli_con_pioggia: `${somme.filter((x) => x >= 0.3).length}/${somme.length}`,
      probabilita_tipica: probs.length ? arrotonda(mediana(probs)) : null,
      probabilita_intervallo: probs.length ? [Math.min(...probs), Math.max(...probs)] : null,
    });
  }
  return out;
}

export function ensemblePerGiorno(ens) {
  const out = {};
  if (!ens) return out;
  const d = ens.daily || {};
  const chiavi = Object.keys(d).filter((k) => k.startsWith("precipitation_sum"));
  (d.time || []).forEach((giorno, i) => {
    const vals = ordina(chiavi.map((k) => val(d[k], i)).filter((v) => v !== null));
    if (!vals.length) return;
    const n = vals.length;
    const piovosi = vals.filter((v) => v >= 1).length;
    const f = piovosi / n;
    out[giorno] = {
      simulazioni_con_pioggia: `${piovosi}/${n}`, quota_pioggia: arrotonda(f, 2), accordo: arrotonda(Math.max(f, 1 - f), 2),
      mediana_mm: arrotonda(mediana(vals), 1),
      intervallo_10_90_mm: [arrotonda(vals[Math.trunc(0.1 * (n - 1))], 1), arrotonda(vals[Math.trunc(0.9 * (n - 1))], 1)],
    };
  });
  return out;
}

export function analizzaGiorni(dati, ens, oggi, finestreExtra) {
  const oggiData = leggiData(oggi);
  const finestre = finestreExtra || [];
  const d = dati.daily;
  const ensg = ensemblePerGiorno(ens);
  const righe = [];
  d.time.forEach((giorno, i) => {
    const valori = (variabile) => {
      const out = {};
      for (const m of CHIAVI_MODELLI) {
        const v = val(d[`${variabile}_${m}`], i);
        if (v !== null) out[m] = v;
      }
      return out;
    };
    const tmax = valori("temperature_2m_max"), tmin = valori("temperature_2m_min"), prec = valori("precipitation_sum");
    const prob = valori("precipitation_probability_max"), cod = valori("weather_code"), vento = valori("wind_speed_10m_max");
    if (!Object.keys(tmax).length || !Object.keys(tmin).length || !Object.keys(prec).length) return;
    const n = Object.keys(prec).length;
    const pv = Object.values(prec);
    const nPioggia = pv.filter((v) => v >= 1).length;
    const me = media(pv), md = mediana(pv);
    const tx = Object.values(tmax), tn = Object.values(tmin);
    const spread = Math.max(...tx) - Math.min(...tx);
    const data = leggiData(giorno);
    const dist = Math.round((data - oggiData) / 86400000);
    const e = ensg[giorno] ?? null;
    let avviso = null;
    if (n >= 3 && Math.max(...pv) - Math.min(...pv) >= 10 && Math.max(...pv) >= 3 * Math.max(md, 1)) {
      const alti = Object.entries(prec).filter(([, v]) => v >= 3 * Math.max(md, 1)).map(([m]) => MODELLI[m]);
      avviso = `modelli molto divisi: ${alti.join(", ")} danno molta più pioggia degli altri; `
        + `la mediana (${mm(md)} mm) è più rappresentativa della media (${mm(me)} mm), `
        + `ma lo scenario più piovoso (${mm(Math.max(...pv))} mm) resta possibile`;
    }
    const pp = Object.values(prob), vv = Object.values(vento);
    righe.push({
      data: giorno,
      giorno: `${GIORNI_IT[settimana(data)]} ${data.getUTCDate()}`,
      giorni_da_oggi: dist,
      cielo: descriviCielo(Object.values(cod), md, nPioggia, n) + (n < 3 ? ` (solo ${n} modelli)` : ""),
      min_media: arrotonda(media(tn), 1),
      min_intervallo: [arrotonda(Math.min(...tn)), arrotonda(Math.max(...tn))],
      max_media: arrotonda(media(tx), 1),
      max_intervallo: [arrotonda(Math.min(...tx)), arrotonda(Math.max(...tx))],
      pioggia_mediana_mm: arrotonda(md, 1),
      pioggia_media_mm: arrotonda(me, 1),
      pioggia_max_mm: arrotonda(Math.max(...pv), 1),
      pioggia_per_modello_mm: Object.fromEntries(Object.entries(prec).map(([m, v]) => [MODELLI[m], arrotonda(v, 1)])),
      modelli_con_pioggia: `${nPioggia}/${n}`,
      probabilita_pioggia_intervallo: pp.length ? [Math.min(...pp), Math.max(...pp)] : null,
      ensemble_ecmwf: e,
      pioggia_per_fascia: pioggiaOraria(dati, giorno, FASCE),
      pioggia_orari_richiesti: finestre.length ? pioggiaOraria(dati, giorno, finestre) : [],
      vento_max_kmh: vv.length ? arrotonda(Math.max(...vv)) : null,
      affidabilita: affidabilita(dist, nPioggia, n, spread, e),
      avviso,
    });
  });
  return righe;
}

const rad = (g) => (g * Math.PI) / 180;
export function distanzaKm(lat1, lon1, lat2, lon2) {
  const p1 = rad(lat1), p2 = rad(lat2), dp = p2 - p1, dl = rad(lon2 - lon1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(a));
}

/** Punti in linea d'aria tra partenza e arrivo, circa uno ogni 15 km (al massimo 5). */
export function puntiIntermedi(la, lo, lb, lob, km) {
  const n = Math.min(5, Math.floor(km / 15));
  const out = [];
  for (let k = 1; k <= n; k++) {
    const f = k / (n + 1);
    out.push([`km ${arrotonda(km * f)}`, la + f * (lb - la), lo + f * (lob - lo)]);
  }
  return out;
}

/** Valori ora per ora in un punto. det ed ens sono i campi "hourly" delle risposte Open-Meteo. */
export function orePuntoDaRisposte(det, ens, giorno) {
  const ensOra = {};
  if (ens) {
    const chiavi = Object.keys(ens).filter((k) => k.startsWith("precipitation"));
    (ens.time || []).forEach((t, i) => {
      const v = chiavi.map((k) => val(ens[k], i)).filter((x) => x !== null);
      if (v.length) ensOra[t] = arrotonda((100 * v.filter((x) => x >= 0.1).length) / v.length);
    });
  }
  const tempi = det.time || [];
  const indice = {};
  tempi.forEach((t, i) => { indice[t] = i; });
  const out = new Map();
  tempi.forEach((t, i) => {
    const inizio = new Date(leggiData(t).getTime() - UNA_ORA);
    if (isoGiorno(inizio) !== giorno) return;
    const vals = (variabile, j) => CHIAVI_MODELLI.map((m) => val(det[`${variabile}_${m}`], j)).filter((v) => v !== null);
    const pr = vals("precipitation", i), pp = vals("precipitation_probability", i), gg = vals("wind_gusts_10m", i);
    const j0 = indice[isoOra(inizio)];
    const tt = j0 !== undefined ? vals("temperature_2m", j0) : vals("temperature_2m", i);
    const ora = inizio.getUTCHours();
    out.set(ora, {
      n_modelli: pr.length,
      mm: pr.length ? arrotonda(mediana(pr), 1) : null,
      mm_max: pr.length ? arrotonda(Math.max(...pr), 1) : null,
      modelli_con_pioggia: `${pr.filter((v) => v >= 0.1).length}/${pr.length}`,
      prob: pp.length ? arrotonda(mediana(pp)) : null,
      prob_intervallo: pp.length ? [Math.min(...pp), Math.max(...pp)] : null,
      ensemble_pct: ensOra[t] ?? null,
      temp: tt.length ? arrotonda(mediana(tt)) : null,
      raffiche: gg.length ? arrotonda(mediana(gg)) : null,
      ora,
    });
  });
  return [...out.keys()].sort((a, b) => a - b).map((k) => out.get(k));
}

/** Giudizio per un punto in un'ora. Probabilità e mm restano separati. */
export function valutaOra(o) {
  if (!o || o.n_modelli === 0) return { livello: null, prob: null, motivo: "dati mancanti" };
  const probs = [o.prob, o.ensemble_pct].filter((x) => x !== null && x !== undefined);
  if (!probs.length && o.n_modelli < 3) return { livello: null, prob: null, motivo: "dati insufficienti" };
  const p = probs.length ? Math.max(...probs) : null;
  let livello;
  if ((p !== null && p > 50) || o.mm >= 0.3) livello = 2;
  else if ((p !== null && p > 20) || o.mm >= 0.1 || o.mm_max >= 1) livello = 1;
  else livello = 0;
  if (livello === 0 && o.n_modelli < 3) return { livello: null, prob: p, motivo: "dati insufficienti" };
  return { livello, prob: p, motivo: null };
}

function giudica(valutazioni) {
  const mancanti = valutazioni.filter(([, , v]) => v.livello === null).map(([nome]) => nome);
  const validi = valutazioni.filter(([, , v]) => v.livello !== null);
  const raffiche = massimo(validi.map(([, o]) => o.raffiche).filter((x) => x !== null && x !== undefined));
  const forti = raffiche !== null && raffiche >= RAFFICHE_FORTI;
  let livello, giudizio;
  if (mancanti.length) {
    livello = null;
    giudizio = validi.length ? `dati incompleti (${mancanti.join(", ")})` : "dati mancanti";
  } else {
    livello = Math.max(...validi.map(([, , v]) => v.livello));
    giudizio = LIVELLI[livello];
  }
  if (forti) giudizio += ", raffiche forti";
  const probs = validi.map(([, , v]) => v.prob).filter((x) => x !== null);
  return { validi, livello, giudizio, forti, raffiche, probs };
}

/** punti = [{nome, ore}]. Per ogni ora vale il punto peggiore; un punto mancante rende l'ora incompleta. */
export function combinaOre(punti, primaOra, alle) {
  const dati = punti.map((p) => [p.nome, new Map(p.ore.map((o) => [o.ora, o]))]);
  const ore = [];
  for (let ora = primaOra; ora < alle; ora++) {
    const perPunto = dati.map(([nome, d]) => [nome, d.get(ora) ?? null]);
    const valutazioni = perPunto.map(([nome, o]) => [nome, o, valutaOra(o)]);
    const { validi, livello, giudizio, forti, raffiche, probs } = giudica(valutazioni);
    const campo = (k) => validi.map(([, o]) => o[k]).filter((x) => x !== null && x !== undefined);
    ore.push({
      ora, livello, raffiche_forti: forti, giudizio,
      mm: massimo(validi.map(([, o]) => o.mm)),
      mm_max: massimo(validi.map(([, o]) => o.mm_max)),
      prob: massimo(campo("prob")),
      ensemble_pct: massimo(campo("ensemble_pct")),
      prob_max: massimo(probs),
      raffiche,
      temp: validi.length ? validi[0][1].temp : null,
      modelli: minimo(validi.map(([, o]) => o.n_modelli), 0),
      dove_piove: punti.length > 1 ? validi.filter(([, , v]) => v.livello >= 1).map(([nome]) => nome) : [],
      per_punto: Object.fromEntries(perPunto),
      livelli: Object.fromEntries(valutazioni.map(([nome, , v]) => [nome, v.livello])),
    });
  }
  return ore;
}

/** Raggruppa elementi consecutivi (con "ora") che hanno lo stesso giudizio. */
export function fasce(elenco) {
  const gruppi = [];
  for (const o of elenco) {
    const ultimo = gruppi[gruppi.length - 1];
    if (ultimo && ultimo.giudizio === o.giudizio && ultimo.alle === o.ora) {
      ultimo.alle = o.ora + 1;
      ultimo._ore.push(o);
    } else {
      gruppi.push({ dalle: o.ora, alle: o.ora + 1, giudizio: o.giudizio, livello: o.livello, raffiche_forti: o.raffiche_forti, _ore: [o] });
    }
  }
  return gruppi.map(({ _ore, ...f }) => ({
    ...f,
    prob_max: massimo(_ore.map((x) => x.prob_max).filter((x) => x !== null)),
    mm_max: massimo(_ore.map((x) => x.mm_max).filter((x) => x !== null)),
    raffiche_max: massimo(_ore.map((x) => x.raffiche).filter((x) => x !== null)),
  }));
}

/** Minuti di viaggio stimati in motorino: km in linea d'aria x 1,3 a 30 km/h, almeno 10. */
export function durataStimata(km) {
  return Math.max(10, arrotonda((km * 1.3) / 30 * 60));
}

/** Per ogni partenza all'ora H: ogni punto si valuta nell'ora in cui ci si passa. */
export function partenze(punti, durataMin, primaOra, alle) {
  const dati = punti.map((p) => [p.nome, p.frazione, new Map(p.ore.map((o) => [o.ora, o]))]);
  const lista = [];
  for (let H = primaOra; H < alle; H++) {
    const attraversate = [];
    const valutazioni = [];
    for (const [nome, frazione, ore] of dati) {
      const h = Math.floor(H + (frazione * durataMin) / 60);
      if (h > 23) {
        attraversate.push({ nome, ora: null });
        valutazioni.push([nome, null, valutaOra(null)]);
      } else {
        attraversate.push({ nome, ora: h });
        const o = ore.get(h) ?? null;
        valutazioni.push([nome, o, valutaOra(o)]);
      }
    }
    const { validi, livello, giudizio, forti, raffiche, probs } = giudica(valutazioni);
    lista.push({
      ora: H, livello, giudizio, raffiche_forti: forti,
      mm: massimo(validi.map(([, o]) => o.mm)),
      mm_max: massimo(validi.map(([, o]) => o.mm_max)),
      prob_max: massimo(probs),
      raffiche,
      attraversate,
    });
  }
  return lista;
}

/** Orari di partenza consigliati, oppure la partenza meno sfavorevole. null se non c'è niente da consigliare. */
export function consiglio(lista) {
  if (!lista.length) return null;
  const buone = fasce(lista).filter((f) => f.livello === 0 && !f.raffiche_forti);
  if (buone.length) {
    let f = buone[0]; // a parità vince la prima, come max() di Python
    for (const g of buone.slice(1)) {
      const lf = f.alle - f.dalle, lg = g.alle - g.dalle;
      if (lg > lf || (lg === lf && -(g.prob_max || 0) > -(f.prob_max || 0))) f = g;
    }
    return { consigliabile: true, dalle: f.dalle, alle: f.alle, giudizio: f.giudizio, prob_max: f.prob_max, mm_max: f.mm_max, raffiche_max: f.raffiche_max };
  }
  const candidate = lista.filter((p) => p.livello !== null);
  if (!candidate.length) return null;
  const chiave = (x) => [x.raffiche_forti ? 1 : 0, x.livello, x.mm || 0, x.mm_max || 0, x.prob_max || 0, x.ora];
  let p = candidate[0];
  for (const q of candidate.slice(1)) {
    const a = chiave(q), b = chiave(p);
    const i = a.findIndex((v, k) => v !== b[k]);
    if (i >= 0 && a[i] < b[i]) p = q;
  }
  return { consigliabile: false, dalle: p.ora, alle: p.ora + 1, giudizio: p.giudizio, prob_max: p.prob_max, mm_max: p.mm_max, raffiche_max: p.raffiche };
}
