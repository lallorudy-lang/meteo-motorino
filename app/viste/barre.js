// Barre della quantità di pioggia: altezza proporzionale ai millimetri, con un minimo visibile.

/** Altezza in percentuale di una barra: 0 se non piove, almeno 4% se piove, al massimo 100%. */
export function altezzaBarra(mm, massimo) {
  if (!mm || mm <= 0 || !massimo || massimo <= 0) return 0;
  return Math.min(100, Math.max(4, Math.round((mm / massimo) * 100)));
}

const COLORI = ["#1e7a43", "#e0a800", "#1f6fd1"];
const GRIGIO = "#6b7280";

/**
 * Disegna una colonna di barre dentro `contenitore`.
 * voci: [{etichetta, mm, livello}] con livello 0/1/2 o null (dati mancanti).
 */
export function disegnaBarre(contenitore, voci, { unita = "mm" } = {}) {
  contenitore.replaceChildren();
  const massimo = Math.max(1, ...voci.map((v) => (v.mm || 0)));
  const griglia = document.createElement("div");
  griglia.className = "barre";
  griglia.setAttribute("role", "img");
  griglia.setAttribute("aria-label", `Pioggia in ${unita}, per ${voci.length} voci`);
  for (const v of voci) {
    const colonna = document.createElement("div");
    colonna.className = "barra-colonna";
    const valore = document.createElement("span");
    valore.className = "barra-valore";
    valore.textContent = v.mm === null || v.mm === undefined ? "-" : v.mm.toFixed(1).replace(".", ",");
    const area = document.createElement("div");
    area.className = "barra-area";
    const barra = document.createElement("div");
    barra.className = "barra";
    barra.style.height = `${altezzaBarra(v.mm, massimo)}%`;
    barra.style.background = v.livello === null || v.livello === undefined ? GRIGIO : COLORI[v.livello];
    barra.title = `${v.etichetta}: ${valore.textContent} ${unita}`;
    area.append(barra);
    const etichetta = document.createElement("span");
    etichetta.className = "barra-etichetta";
    etichetta.textContent = v.etichetta;
    colonna.append(valore, area, etichetta);
    griglia.append(colonna);
  }
  contenitore.append(griglia);
}
