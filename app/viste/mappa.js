// Mappa delle gocce: il tragitto, un segno per punto e ora, la barra delle ore.
// Costruita con l'API del DOM: i nomi arrivano come testo, mai come HTML.

const COLORI = ["#1e7a43", "#e0a800", "#1f6fd1"];
const GRIGIO = "#6b7280";
const NOMI = ["ok", "a rischio", "pioggia probabile"];
const SIMBOLI = ["✓", "💧", "🌧"];
const GOCCIA = (x, y, s, c) =>
  `<path transform="translate(${x},${y}) scale(${s})" d="M12 1C12 1 3 11.5 3 16.5a9 9 0 0 0 18 0C21 11.5 12 1 12 1z" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;

/** SVG del segno di un punto. Solo costanti: nessun dato dell'utente entra qui. */
export function svgPunto(livello) {
  if (livello === null || livello === undefined) {
    return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="${GRIGIO}" stroke="#fff" stroke-width="2"/><text x="20" y="26" text-anchor="middle" font-size="17" fill="#fff" font-weight="700">?</text></svg>`;
  }
  if (livello === 0) {
    return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="${COLORI[0]}" stroke="#fff" stroke-width="2"/><path d="M12 20l6 6 10-12" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }
  if (livello === 1) {
    return `<svg width="40" height="44" viewBox="0 0 40 44" aria-hidden="true">${GOCCIA(6, 4, 1.15, COLORI[1])}</svg>`;
  }
  return `<svg width="52" height="46" viewBox="0 0 52 46" aria-hidden="true">${GOCCIA(0, 14, 0.95, COLORI[2])}${GOCCIA(15, 0, 1.05, COLORI[2])}${GOCCIA(28, 16, 0.95, COLORI[2])}</svg>`;
}

const fmt = (n) => String(n).padStart(2, "0");
const mmf = (x) => (x === null || x === undefined ? "-" : x.toFixed(1).replace(".", ","));
const testoLivello = (l) => (l === null || l === undefined ? "dati mancanti" : NOMI[l]);
const isWeb = () => typeof location !== "undefined" && (location.protocol === "http:" || location.protocol === "https:");

function el(tag, testo, classe) {
  const e = document.createElement(tag);
  if (testo !== undefined) e.textContent = testo;
  if (classe) e.className = classe;
  return e;
}

function icona(livello, forti) {
  const w = livello === 2 ? 52 : 40;
  const h = livello === 2 ? 46 : 44;
  const badge = forti ? '<span class="badge" aria-hidden="true">💨</span>' : "";
  return L.divIcon({
    className: "", iconSize: [w, h], iconAnchor: [w / 2, h / 2],
    html: `<div class="pin">${svgPunto(livello)}${badge}</div>`,
  });
}

/**
 * Crea la mappa dentro `contenitore`.
 * punti: [{nome, lat, lon}] dalla partenza all'arrivo; km: lunghezza in linea d'aria.
 * Restituisce { mostraOre(ore, iniziale), distruggi() }.
 */
export function creaMappa(contenitore, { punti, km = 0 }) {
  contenitore.replaceChildren();
  const area = el("div", undefined, "mappa-area");
  area.setAttribute("role", "region");
  area.setAttribute("aria-label", "Mappa del tragitto con le zone di pioggia");
  const barra = el("div", undefined, "barra-ore");
  barra.setAttribute("role", "group");
  barra.setAttribute("aria-label", "Scegli l'ora");
  const stato = el("p", "", "stato-ora");
  stato.setAttribute("aria-live", "polite");
  const avviso = el("p", "", "nota-mappa");
  contenitore.append(area, barra, stato, avviso);

  let mappa = null;
  let marker = [];
  let zone = [];
  let bottoni = [];

  if (typeof L === "undefined") {
    area.textContent = "La cartina non si è caricata: serve la connessione a internet. La barra delle ore funziona lo stesso.";
    area.classList.add("senza-cartina");
  } else {
    mappa = L.map(area, { scrollWheelZoom: false });
    if (isWeb()) {
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mappa);
    } else {
      avviso.textContent = "Cartina di sfondo non disponibile aprendo il file dal disco.";
    }
    const ll = punti.map((p) => [p.lat, p.lon]);
    if (ll.length > 1) {
      L.polyline(ll, { color: "#1c2430", weight: 3, opacity: 0.55, dashArray: "6 8" }).addTo(mappa);
      mappa.fitBounds(L.latLngBounds(ll).pad(0.12));
    } else {
      mappa.setView(ll[0], 12);
    }
    const raggio = ll.length > 1 ? Math.max(1500, (km * 1000) / (2 * (ll.length - 1))) : 2500;
    zone = punti.map((p) => L.circle([p.lat, p.lon], { radius: raggio, weight: 0, fillOpacity: 0, interactive: false }).addTo(mappa));
    marker = punti.map((p, i) => {
      const etichetta = el("span", p.nome);
      return L.marker([p.lat, p.lon], { icon: icona(null, false), title: p.nome, keyboard: true })
        .addTo(mappa)
        .bindTooltip(etichetta, { permanent: i === 0 || i === punti.length - 1, direction: "top", offset: [0, -22], className: "etich" });
    });
  }

  function mostraOre(ore, iniziale = 0) {
    bottoni = ore.map((o, i) => {
      const b = el("button", undefined, "ora " + (o.livello === null ? "lnd" : `l${o.livello}`));
      b.type = "button";
      b.append(el("span", fmt(o.ora)), el("span", (o.livello === null ? "?" : SIMBOLI[o.livello]) + (o.raffiche_forti ? "💨" : ""), "simbolo"));
      b.setAttribute("aria-label", `Ore ${fmt(o.ora)}-${fmt(o.ora + 1)}: ${o.giudizio}`);
      b.title = b.getAttribute("aria-label");
      b.addEventListener("click", () => scegli(i, ore));
      return b;
    });
    barra.replaceChildren(...bottoni);
    if (ore.length) scegli(Math.min(iniziale, ore.length - 1), ore);
  }

  function scegli(i, ore) {
    const o = ore[i];
    bottoni.forEach((b, k) => b.setAttribute("aria-pressed", String(k === i)));
    bottoni[i].scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    stato.textContent = `Ore ${fmt(o.ora)}-${fmt(o.ora + 1)}: ${o.giudizio}`;
    if (!mappa) return;
    punti.forEach((p, k) => {
      const liv = o.livelli[p.nome];
      const v = o.per_punto[p.nome] || {};
      const forti = v.raffiche !== null && v.raffiche !== undefined && v.raffiche >= 45;
      marker[k].setIcon(icona(liv, forti));
      zone[k].setStyle({ fillColor: liv === null || liv === undefined ? GRIGIO : COLORI[liv], fillOpacity: liv ? 0.22 : 0.08 });
      marker[k].unbindPopup();
      marker[k].bindPopup(dettaglio(p.nome, o, liv, v));
    });
  }

  function distruggi() {
    if (mappa) mappa.remove();
    mappa = null;
    contenitore.replaceChildren();
  }

  return { mostraOre, distruggi };
}

function dettaglio(nome, o, liv, v) {
  const box = el("div");
  box.append(el("b", nome), document.createTextNode(` · ore ${fmt(o.ora)}-${fmt(o.ora + 1)}`));
  const t = document.createElement("table");
  t.className = "dett";
  const righe = [
    ["Giudizio", testoLivello(liv)],
    ["Probabilità", `${v.prob ?? "-"}%`],
    ["Ensemble", `${v.ensemble_pct ?? "-"}%`],
    ["Pioggia", `${mmf(v.mm)} mm (modello più piovoso ${mmf(v.mm_max)})`],
    ["Raffiche", `${v.raffiche ?? "-"} km/h`],
    ["Temperatura", `${v.temp ?? "-"}°`],
  ];
  for (const [a, b] of righe) {
    const tr = document.createElement("tr");
    tr.append(el("td", a), el("td", b));
    t.append(tr);
  }
  box.append(t);
  return box;
}
