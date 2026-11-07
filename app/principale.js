// Guscio dell'app: schede, preferiti, impostazioni e schermata privacy.
// Le schede Partenza e Più giorni si montano nei passi 10 e 11.
import { leggi, salva, togli, esporta, importa, cancellaDatiLocali } from "./preferiti.js";

const CHIAVE_PRIVACY = "meteo-motorino.privacy-letta";
const archivio = globalThis.localStorage;

/** Sceglie una scheda: aggiorna i pulsanti e mostra il pannello giusto. Restituisce il nome scelto. */
export function apriScheda(nome) {
  const pulsanti = [...document.querySelectorAll(".schede [role=tab]")];
  const scelto = pulsanti.find((b) => b.dataset.scheda === nome) || pulsanti[0];
  for (const b of pulsanti) {
    const attiva = b === scelto;
    b.setAttribute("aria-selected", String(attiva));
    b.tabIndex = attiva ? 0 : -1;
    document.getElementById(b.getAttribute("aria-controls")).hidden = !attiva;
  }
  return scelto.dataset.scheda;
}

function disegnaPreferiti() {
  const contenitore = document.getElementById("preferiti");
  contenitore.replaceChildren();
  for (const p of leggi(archivio)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "pulsante";
    b.textContent = `☆ ${p.nome}`;
    b.title = p.a ? `${p.da.nome} → ${p.a.nome}` : p.da.nome;
    b.addEventListener("click", () => {
      document.dispatchEvent(new CustomEvent("preferito-scelto", { detail: p }));
      apriScheda("partenza");
    });
    contenitore.appendChild(b);
  }
  if (!contenitore.children.length) {
    const p = document.createElement("span");
    p.textContent = "Nessun preferito: salvane uno dalla scheda Partenza.";
    p.className = "esito";
    contenitore.appendChild(p);
  }
}

function esito(messaggio) {
  document.getElementById("esito-impostazioni").textContent = messaggio;
}

function collegaImpostazioni() {
  document.getElementById("esporta").addEventListener("click", async () => {
    const testo = esporta(archivio);
    try {
      await navigator.clipboard.writeText(testo);
      esito("Preferiti copiati negli appunti.");
    } catch {
      document.getElementById("testo-importa").value = testo;
      esito("Copia il testo qui sotto: il browser non ha permesso di copiare.");
    }
  });
  document.getElementById("importa").addEventListener("click", () => {
    try {
      const n = importa(archivio, document.getElementById("testo-importa").value);
      esito(`Importati ${n} preferiti nuovi.`);
      disegnaPreferiti();
    } catch (e) {
      esito(e.message);
    }
  });
  document.getElementById("cancella-dati").addEventListener("click", () => {
    if (!confirm("Cancellare preferiti, ultimi risultati e la scelta della privacy da questo dispositivo?")) return;
    cancellaDatiLocali(archivio);
    disegnaPreferiti();
    esito("Dati locali cancellati.");
  });
}

function collegaQui() {
  const finestra = document.getElementById("privacy");
  document.getElementById("pulsante-qui").addEventListener("click", () => {
    if (archivio.getItem(CHIAVE_PRIVACY) === "1") return chiediPosizione();
    finestra.showModal();
  });
  document.getElementById("privacy-annulla").addEventListener("click", () => finestra.close());
  document.getElementById("privacy-continua").addEventListener("click", () => {
    archivio.setItem(CHIAVE_PRIVACY, "1");
    finestra.close();
    chiediPosizione();
  });
}

function chiediPosizione() {
  if (!navigator.geolocation) return esito("Il browser non permette di usare la posizione: scrivi la città di partenza.");
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const luogo = { etichetta: "La mia posizione", nome: "La mia posizione",
        regione: "", paese: "", codice_paese: "", lat: pos.coords.latitude, lon: pos.coords.longitude, fuso: null };
      document.dispatchEvent(new CustomEvent("posizione", { detail: luogo }));
      apriScheda("partenza");
    },
    () => esito("Posizione non disponibile: scrivi la città di partenza."),
    { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
  );
}

function collegaSchede() {
  const pulsanti = [...document.querySelectorAll(".schede [role=tab]")];
  pulsanti.forEach((b, i) => {
    b.addEventListener("click", () => apriScheda(b.dataset.scheda));
    b.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const prossimo = pulsanti[(i + (e.key === "ArrowRight" ? 1 : pulsanti.length - 1)) % pulsanti.length];
      prossimo.focus();
      apriScheda(prossimo.dataset.scheda);
    });
  });
}

collegaSchede();
collegaQui();
collegaImpostazioni();
disegnaPreferiti();
document.addEventListener("preferito-salvato", disegnaPreferiti);
apriScheda("partenza");
