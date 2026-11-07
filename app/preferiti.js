// Preferiti e dati locali. Tutto resta nel browser (localStorage); nessun dato va in rete.

const CHIAVE = "meteo-motorino.preferiti.v1";
const PREFISSO = "meteo-motorino.";
const MESSAGGIO_NON_VALIDO = "Testo dei preferiti non valido";

function valido(p) {
  return p && typeof p.id === "string" && typeof p.nome === "string" && p.da && typeof p.da.nome === "string"
    && (p.a === null || (p.a && typeof p.a.nome === "string"))
    && (p.durata_min === null || typeof p.durata_min === "number");
}

/** Lista dei preferiti salvati (vuota se non c'è nulla o il dato è corrotto). */
export function leggi(archivio) {
  try {
    const lista = JSON.parse(archivio.getItem(CHIAVE) || "[]");
    return Array.isArray(lista) ? lista.filter(valido) : [];
  } catch {
    return [];
  }
}

function scrivi(archivio, lista) {
  archivio.setItem(CHIAVE, JSON.stringify(lista));
  return lista;
}

/** Aggiunge o sostituisce (stesso id) un preferito. */
export function salva(archivio, preferito) {
  const lista = leggi(archivio).filter((p) => p.id !== preferito.id);
  lista.push(preferito);
  return scrivi(archivio, lista);
}

export function togli(archivio, id) {
  return scrivi(archivio, leggi(archivio).filter((p) => p.id !== id));
}

export function esporta(archivio) {
  return JSON.stringify(leggi(archivio), null, 2);
}

/** Importa da testo copiato. Salta i preferiti con un nome già presente. Restituisce quanti ne ha aggiunti. */
export function importa(archivio, testo) {
  let arrivo;
  try {
    arrivo = JSON.parse(testo);
  } catch {
    throw new Error(MESSAGGIO_NON_VALIDO);
  }
  if (!Array.isArray(arrivo) || !arrivo.every(valido)) throw new Error(MESSAGGIO_NON_VALIDO);
  const lista = leggi(archivio);
  const nomi = new Set(lista.map((p) => p.nome));
  let aggiunti = 0;
  for (const p of arrivo) {
    if (nomi.has(p.nome)) continue;
    lista.push(p);
    nomi.add(p.nome);
    aggiunti += 1;
  }
  scrivi(archivio, lista);
  return aggiunti;
}

/** Cancella tutti i dati locali dell'app, lasciando le altre chiavi del browser. */
export function cancellaDatiLocali(archivio) {
  const chiavi = typeof archivio.chiavi === "function"
    ? archivio.chiavi()
    : Object.keys(archivio);
  for (const k of chiavi) {
    if (k.startsWith(PREFISSO)) archivio.removeItem(k);
  }
}
