// Percorso lungo le strade (OSRM). Un solo collegamento per tragitto. Se il servizio non risponde, null:
// il chiamante ricade sulla linea d'aria e lo dice.
import { scaricaJSON } from "../rete.js";
import { distanzaKm } from "../motore.js";

const URL_OSRM = "https://router.project-osrm.org/route/v1/driving/";

/** punti: [{lat, lon}] in ordine. Restituisce {coordinate: [[lat, lon], ...], km} oppure null. */
export async function percorsoStrada(punti) {
  const tappe = punti.map((p) => `${p.lon},${p.lat}`).join(";");
  try {
    const d = await scaricaJSON(`${URL_OSRM}${tappe}?overview=full&geometries=geojson`, { cacheMs: 3600000 });
    if (!d || d.code !== "Ok" || !d.routes || !d.routes[0]) return null;
    const r = d.routes[0];
    return { coordinate: r.geometry.coordinates.map(([lo, la]) => [la, lo]), km: r.distance / 1000 };
  } catch {
    return null;
  }
}

/** n punti equidistanti per lunghezza lungo una linea [[lat, lon], ...]. Restituisce [{lat, lon, frazione, km}]. */
export function puntiLungoPercorso(coordinate, n) {
  const seg = [];
  let totale = 0;
  for (let i = 1; i < coordinate.length; i++) {
    const [la1, lo1] = coordinate[i - 1];
    const [la2, lo2] = coordinate[i];
    const l = distanzaKm(la1, lo1, la2, lo2);
    seg.push({ da: coordinate[i - 1], a: coordinate[i], l, inizio: totale });
    totale += l;
  }
  const out = [];
  for (let k = 1; k <= n; k++) {
    const meta = (totale * k) / (n + 1);
    const s = seg.find((x) => meta <= x.inizio + x.l) || seg[seg.length - 1];
    const t = s.l ? Math.min(1, Math.max(0, (meta - s.inizio) / s.l)) : 0;
    out.push({
      lat: s.da[0] + t * (s.a[0] - s.da[0]),
      lon: s.da[1] + t * (s.a[1] - s.da[1]),
      frazione: totale ? meta / totale : 0,
      km: meta,
    });
  }
  return out;
}
