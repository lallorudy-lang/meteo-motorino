#!/usr/bin/env python3
"""Previsione meteo "media" da più modelli numerici (via Open-Meteo, gratuito, senza chiave).

Uso:
  python3 previsioni.py Torino
  python3 previsioni.py "Reggio Emilia" --giorni 5
  python3 previsioni.py Milano --dal 2026-11-08 --al 2026-11-10
  python3 previsioni.py --lat 45.07 --lon 7.69 --nome "Casa"
  python3 previsioni.py Napoli --json
  python3 previsioni.py Bologna --ore 7-9,17-19     # pioggia negli orari indicati
  python3 previsioni.py Torino --giornata domani              # ora per ora, orari di partenza
  python3 previsioni.py Torino --giornata oggi --verso Moncalieri   # tragitto da A a B
  python3 previsioni.py Torino --giornata domani --verso Milano --mappa mappa.html --apri   # con la mappa

Modalità più giorni: minima/massima (media e intervallo tra i modelli), pioggia (mediana,
media e massimo tra i modelli), quanti modelli prevedono almeno 1 mm, quante delle 51
simulazioni dell'ensemble ECMWF danno almeno 1 mm, pioggia per fascia oraria, vento
massimo e affidabilità (alta / media / bassa).

Modalità giornata: ora per ora, per una località o un tragitto, con probabilità, mm,
ensemble, raffiche, giudizio e momento migliore per spostarsi.

Nota sugli orari: per Open-Meteo pioggia, probabilità e raffiche di un orario (es. 12:00)
si riferiscono all'ora PRECEDENTE (11-12). Lo script le attribuisce a quell'intervallo.
Usa solo la libreria standard di Python.
"""
import argparse
import datetime as dt
import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

from motore import (GIORNI_IT, MODELLI, RAFFICHE_FORTI, analizza_giorni, combina_ore, consiglio, distanza_km,
                    durata_stimata, fasce, mm, ore_punto_da_risposte, partenze, punti_intermedi)

VARIABILI = [
    "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "precipitation_probability_max", "weather_code", "wind_speed_10m_max",
]
ORIZZONTE = 16          # giorni massimi di previsione dei modelli


class ErroreDownload(Exception):
    pass


def scarica(url):
    req = urllib.request.Request(url, headers={"User-Agent": "meteo-media-skill/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.URLError as e:
        # Il Python di python.org su macOS spesso non ha i certificati installati:
        # in quel caso usa curl di sistema (che usa il portachiavi, verifica attiva).
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            raise ErroreDownload(str(e)) from e
        out = subprocess.run(["curl", "-sSf", "--max-time", "30", "-A", "meteo-media-skill/1.0", url],
                             capture_output=True, text=True)
        if out.returncode != 0:
            raise ErroreDownload(out.stderr.strip() or f"curl ha restituito {out.returncode}")
        try:
            return json.loads(out.stdout)
        except ValueError as e:
            raise ErroreDownload("risposta non valida dal server") from e
    except (OSError, ValueError) as e:
        raise ErroreDownload(str(e)) from e


def scarica_o_esci(url, cosa):
    try:
        return scarica(url)
    except ErroreDownload as e:
        sys.exit(f"Non riesco a scaricare {cosa}: {e}. Controlla la connessione e riprova.")


def adesso_locale(fuso):
    """(data e ora attuali nel fuso della località, True) oppure (ora della macchina, False)."""
    try:
        from zoneinfo import ZoneInfo
        return dt.datetime.now(ZoneInfo(fuso)).replace(tzinfo=None), True
    except Exception:
        return dt.datetime.now(), False


def stessa_ora(f1, f2, giorno):
    """True se i due fusi hanno lo stesso scarto da UTC quel giorno (es. Roma e Parigi)."""
    if f1 == f2:
        return True
    try:
        from zoneinfo import ZoneInfo
        mezzogiorno = dt.datetime(giorno.year, giorno.month, giorno.day, 12)
        return mezzogiorno.replace(tzinfo=ZoneInfo(f1)).utcoffset() == mezzogiorno.replace(tzinfo=ZoneInfo(f2)).utcoffset()
    except Exception:
        return False


def fuso_di(lat, lon):
    dati = scarica_o_esci("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(
        {"latitude": lat, "longitude": lon, "timezone": "auto", "forecast_days": 1, "daily": "temperature_2m_max"}),
        "il fuso orario")
    return dati.get("timezone") or "Europe/Rome"


def trova_luogo(nome, paese=None):
    q = {"name": nome, "count": 5, "language": "it", "format": "json"}
    if paese:
        q["countryCode"] = paese
    dati = scarica_o_esci("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(q),
                          f"la posizione di {nome}")
    risultati = dati.get("results") or []
    if not risultati:
        sys.exit(f"Località non trovata: {nome}")
    # Se non è indicato il paese, preferisci un risultato italiano quando c'è.
    if not paese:
        italiani = [r for r in risultati if r.get("country_code") == "IT"]
        if italiani:
            risultati = italiani + [r for r in risultati if r.get("country_code") != "IT"]
    r = risultati[0]
    etichetta = ", ".join(x for x in [r.get("name"), r.get("admin1"), r.get("country")] if x)
    # Solo omonimi nello stesso paese: quelli esteri (Roma in Romania...) sono rumore.
    alternative = []
    for a in risultati[1:]:
        if a.get("country_code") != r.get("country_code"):
            continue
        t = ", ".join(x for x in [a.get("name"), a.get("admin1")] if x)
        if t not in alternative and t != ", ".join(x for x in [r.get("name"), r.get("admin1")] if x):
            alternative.append(t)
    return r["latitude"], r["longitude"], etichetta, alternative, r.get("timezone") or "Europe/Rome"




def prob(f):
    """'prob. 45% (20-60%)': mediana tra i modelli e intervallo."""
    if f.get("probabilita_tipica") is None:
        return "prob. n.d."
    a, b = f["probabilita_intervallo"]
    return f"prob. {f['probabilita_tipica']}%" + (f" ({a}-{b}%)" if a != b else "")


def stampa_markdown(luogo, coord, alternative, righe, note):
    print(f"## {luogo}  ({coord[0]:.2f}, {coord[1]:.2f})")
    if alternative:
        print(f"_Altre località con lo stesso nome: {'; '.join(alternative)}. "
              "Se non è quella giusta, rilancia con --paese o --lat/--lon._")
    for n in note:
        print(f"**Nota:** {n}")
    print()
    if not righe:
        print("Nessun giorno disponibile nell'intervallo richiesto.")
        return
    print("| Giorno | Tempo | Min | Max | Pioggia mediana (media, max) | Modelli con ≥1 mm | Ensemble ECMWF (≥1 mm) | Vento max | Affidabilità |")
    print("|---|---|---|---|---|---|---|---|---|")
    for r in righe:
        a, b = r["min_intervallo"]; c, e = r["max_intervallo"]
        pioggia = f"{mm(r['pioggia_mediana_mm'])} mm ({mm(r['pioggia_media_mm'])}, {mm(r['pioggia_max_mm'])})"
        ens = r["ensemble_ecmwf"]
        ens_txt = f"{ens['simulazioni_con_pioggia']} con pioggia" if ens else "-"
        vento = f"{r['vento_max_kmh']} km/h" if r["vento_max_kmh"] is not None else "-"
        print(f"| {r['giorno']} | {r['cielo']} | {r['min_media']:.0f}° ({a}-{b}) | {r['max_media']:.0f}° ({c}-{e}) "
              f"| {pioggia} | {r['modelli_con_pioggia']} | {ens_txt} | {vento} | {r['affidabilita']} |")
    avvisi = [r for r in righe if r["avviso"]]
    if avvisi:
        print()
        for r in avvisi:
            print(f"**Attenzione {r['giorno']}:** {r['avviso']}.")
    print()
    print("Pioggia per fascia oraria (mm e probabilità: valore centrale tra i modelli, tra parentesi l'intervallo; modelli con almeno 0,3 mm):")
    for r in righe:
        parti = [f"{f['fascia']} {mm(f['mediana_mm'])} mm, {prob(f)} ({f['modelli_con_pioggia']})" for f in r["pioggia_per_fascia"]]
        print(f"- {r['giorno']}: " + " · ".join(parti) if parti else f"- {r['giorno']}: dati orari non disponibili")
    if any(r["pioggia_orari_richiesti"] for r in righe):
        print()
        print("Pioggia negli orari richiesti:")
        for r in righe:
            parti = [f"{f['ore']}: {mm(f['mediana_mm'])} mm (max {mm(f['max_mm'])}), {prob(f)}, "
                     f"{f['modelli_con_pioggia']} modelli con pioggia" for f in r["pioggia_orari_richiesti"]]
            if parti:
                print(f"- {r['giorno']}: " + " · ".join(parti))
    print()
    print("Pioggia per modello (mm):")
    for r in righe:
        dettagli = ", ".join(f"{k} {mm(v)}" for k, v in r["pioggia_per_modello_mm"].items())
        print(f"- {r['giorno']}: {dettagli}")


# ---------------------------------------------------------------------------
# Modalità "giornata": ora per ora, per una città o per un tragitto da A a B.
# ---------------------------------------------------------------------------

def leggi_giorno(testo, oggi):
    t = (testo or "oggi").strip().lower()
    if t == "oggi":
        return oggi
    if t == "domani":
        return oggi + dt.timedelta(days=1)
    if t in ("dopodomani", "dopo domani"):
        return oggi + dt.timedelta(days=2)
    try:
        return dt.date.fromisoformat(t)
    except ValueError:
        sys.exit(f"Giorno non valido: {testo} (usa oggi, domani, dopodomani o AAAA-MM-GG)")


def ore_punto(lat, lon, giorno):
    """Scarica previsioni ed ensemble orari di un punto e li passa al motore.

    Restituisce ({ora_inizio: ValoriOra}, ensemble_disponibile).
    """
    g, g2 = giorno.isoformat(), (giorno + dt.timedelta(days=1)).isoformat()
    q = {"latitude": lat, "longitude": lon, "models": ",".join(MODELLI), "timezone": "auto",
         "hourly": "precipitation,precipitation_probability,temperature_2m,wind_gusts_10m",
         "start_date": g, "end_date": g2}  # serve anche la mezzanotte dopo, per l'ora 23-24
    det = scarica_o_esci("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q), "le previsioni orarie")["hourly"]
    ens = None
    try:
        qe = {"latitude": lat, "longitude": lon, "models": "ecmwf_ifs025", "timezone": "auto",
              "hourly": "precipitation", "start_date": g, "end_date": g2}
        ens = scarica("https://ensemble-api.open-meteo.com/v1/ensemble?" + urllib.parse.urlencode(qe))["hourly"]
    except (ErroreDownload, KeyError, TypeError, ValueError):
        ens = None  # l'ensemble è un di più: senza, si usano solo i modelli (e lo si dice)
    try:
        ore = ore_punto_da_risposte(det, ens, g)
    except (KeyError, TypeError, ValueError):
        ore, ens = ore_punto_da_risposte(det, None, g), None
    ens_ok = any(o["ensemble_pct"] is not None for o in ore)
    return {o["ora"]: o for o in ore}, ens_ok

def giornata(punti, giorno, dalle, alle, adesso, durata_min):
    """punti = [(nome, lat, lon)] dalla partenza all'arrivo.

    Restituisce (ore meteo combinate, fasce meteo, partenze, consiglio, note).
    """
    dati, note = [], []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:  # fino a 7 punti: scaricarli in parallelo
        risultati = list(pool.map(lambda p_: ore_punto(p_[1], p_[2], giorno), punti))
    totale = distanza_km(punti[0][1], punti[0][2], punti[-1][1], punti[-1][2]) if len(punti) > 1 else 0
    for (nome, lat, lon), (d, ens_ok) in zip(punti, risultati):
        frazione = distanza_km(punti[0][1], punti[0][2], lat, lon) / totale if totale else 0
        dati.append({"nome": nome, "frazione": frazione, "ore": list(d.values())})
        if not ens_ok:
            note.append(f"ensemble non disponibile per {nome}: uso solo i modelli")
    prima_ora = max(dalle, adesso.hour) if giorno == adesso.date() else dalle
    ore = combina_ore(dati, prima_ora, alle)
    lista = partenze(dati, durata_min, prima_ora, alle)
    return ore, fasce(ore), lista, consiglio(lista), note


def descrivi_fascia(f):
    parti = [f["giudizio"]]
    if f.get("prob_max") is not None:
        parti.append(f"probabilità fino al {f['prob_max']}%")
    if f.get("mm_max"):
        parti.append(f"fino a {mm(f['mm_max'])} mm/h nel modello più piovoso")
    if f.get("raffiche_max") is not None and f["raffiche_max"] >= RAFFICHE_FORTI:
        parti.append(f"raffiche {f['raffiche_max']} km/h")
    return ", ".join(parti)


def stampa_giornata(titolo, note, ore, gruppi, lista, cons, durata_min, tragitto):
    print(f"## {titolo}")
    for n in note:
        print(f"_{n}_")
    print()
    if not lista:
        print("**Nessun orario rimasto oggi** nella fascia richiesta.")
        return
    viaggio = f" per un viaggio di {durata_min} minuti" if durata_min else ""
    if cons and cons["consigliabile"]:
        print(f"**Orari di partenza consigliati:** tra le {cons['dalle']:02d}:00 e le {cons['alle'] - 1:02d}:00{viaggio} "
              f"({descrivi_fascia(cons)})")
    elif cons:
        print(f"**Nessun orario davvero buono.** La partenza meno sfavorevole è alle {cons['dalle']:02d}:00{viaggio} "
              f"({descrivi_fascia(cons)}).")
    else:
        print("**Dati insufficienti per consigliare un orario.**")
    print("**Partenze:** " + " · ".join(f"{f['dalle']:02d}:00-{f['alle'] - 1:02d}:00 {f['giudizio']}" for f in fasce(lista)))
    print("**Meteo ora per ora:** " + " · ".join(f"{f['dalle']:02d}-{f['alle']:02d} {f['giudizio']}" for f in gruppi))
    print()
    col_dove = " Dove piove |" if tragitto else ""
    print(f"| Ora | Pioggia mm (max) | Probabilità | Ensemble | Raffiche | Temp | Modelli |{col_dove} Giudizio |")
    print("|---|---|---|---|---|---|---|" + ("---|" if tragitto else "") + "---|")
    for o in ore:
        pmm = f"{mm(o['mm'])} ({mm(o['mm_max'])})" if o["mm"] is not None else "-"
        prob_ = f"{o['prob']}%" if o["prob"] is not None else "-"
        ens = f"{o['ensemble_pct']}%" if o["ensemble_pct"] is not None else "-"
        raf = f"{o['raffiche']} km/h" if o["raffiche"] is not None else "-"
        temp = f"{o['temp']}°" if o["temp"] is not None else "-"
        dove = f" {', '.join(o['dove_piove']) or '-'} |" if tragitto else ""
        print(f"| {o['ora']:02d}-{o['ora'] + 1:02d} | {pmm} | {prob_} | {ens} | {raf} | {temp} | {o['modelli']} |{dove} {o['giudizio']} |")
    print()
    print("_Ogni riga è la pioggia caduta in quell'ora. Probabilità: valore centrale tra i modelli (sul tragitto, il "
          "punto peggiore). Ensemble: quota delle 51 simulazioni ECMWF con almeno 0,1 mm in quell'ora. Giudizio: "
          "ok = probabilità fino al 20% e niente pioggia apprezzabile nei modelli; a rischio = probabilità 21-50%, "
          "oppure qualche decimo di mm, oppure un modello con almeno 1 mm; pioggia probabile = oltre il 50% o "
          f"almeno 0,3 mm come valore centrale. Raffiche forti da {RAFFICHE_FORTI} km/h._")


def leggi_ore(testo):
    finestre = []
    for parte in (testo or "").split(","):
        if not parte.strip():
            continue
        try:
            da, a = (int(x) for x in parte.strip().split("-"))
        except ValueError:
            sys.exit(f"Orario non valido: {parte} (usa per esempio 7-9,17-19)")
        if not (0 <= da < a <= 24):
            sys.exit(f"Orario non valido: {parte} (usa per esempio 7-9,17-19)")
        finestre.append((f"{da}-{a}", da, a))
    return finestre


MAPPA_HTML = r"""<!DOCTYPE html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>__TITOLO__</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
 integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
 integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<style>
 :root{--ok:#1e7a43;--ris:#e0a800;--pio:#1f6fd1;--nd:#6b7280;--bg:#f6f7f9;--tx:#1c2430}
 *{box-sizing:border-box} body{margin:0;font:15px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:var(--tx);background:var(--bg)}
 header{padding:14px 18px 8px} h1{font-size:19px;margin:0 0 4px} .sub{color:#4b5563;font-size:13px}
 .consiglio{margin:10px 18px;padding:10px 14px;border-radius:10px;background:#fff;border-left:5px solid var(--ok);box-shadow:0 1px 3px #0001}
 .consiglio.no{border-left-color:var(--ris)}
 #map{height:58vh;min-height:320px;margin:0 18px;border-radius:12px;box-shadow:0 1px 4px #0002;background:#e5e7eb}
 #map .offline{padding:40px 20px;text-align:center;color:#4b5563}
 .pannello{margin:12px 18px 18px;padding:12px 14px;background:#fff;border-radius:12px;box-shadow:0 1px 3px #0001}
 .ora-sel{display:flex;align-items:center;gap:10px;flex-wrap:wrap} .ora-sel label{font-size:17px;font-weight:700;min-width:110px}
 input[type=range]{flex:1;min-width:160px;accent-color:var(--pio)}
 .stato{font-weight:700} .barra{display:flex;gap:3px;margin-top:12px;overflow-x:auto;padding:4px 2px 6px;scroll-snap-type:x proximity}
 .barra button{flex:1 0 34px;min-width:34px;height:44px;border:0;border-radius:6px;cursor:pointer;font:600 12px/1.1 inherit;
   display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;scroll-snap-align:center}
 .barra button.l0{background:var(--ok);color:#fff} .barra button.l1{background:var(--ris);color:var(--tx)}
 .barra button.l2{background:var(--pio);color:#fff} .barra button.lnd{background:var(--nd);color:#fff}
 .barra button[aria-pressed=true]{outline:3px solid var(--tx);outline-offset:2px}
 .barra button:focus-visible{outline:3px solid #000;outline-offset:2px}
 .legenda{display:flex;gap:14px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:#4b5563}
 .legenda i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:4px;vertical-align:-2px}
 .nota{font-size:12px;color:#4b5563;margin-top:8px}
 .pin{position:relative;filter:drop-shadow(0 1px 2px #0005)} .pin .badge{position:absolute;right:-6px;top:-6px;font-size:16px}
 .leaflet-tooltip.etich{background:#fffe;border:0;box-shadow:0 1px 3px #0003;font-weight:600;padding:2px 6px}
 table.dett{border-collapse:collapse;font-size:13px} table.dett td{padding:1px 6px 1px 0}
 .senza-sfondo{max-width:260px;background:#fffffff0;padding:8px 10px;border-radius:8px;font-size:12px;box-shadow:0 1px 3px #0003}
 .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
</style></head><body>
<header><h1>__TITOLO__</h1><div class="sub" id="sub"></div></header>
<div class="consiglio" id="consiglio"></div>
<div id="map" role="region" aria-label="Mappa del tragitto con le zone di pioggia"></div>
<div class="pannello">
 <div class="ora-sel"><label for="ora" id="ora-lbl"></label><input type="range" id="ora" min="0" step="1">
  <span class="stato" id="stato" aria-live="polite"></span></div>
 <div class="barra" id="barra" role="group" aria-label="Scegli l'ora"></div>
 <div class="legenda">
  <span><i style="background:var(--ok)"></i>✓ ok</span><span><i style="background:var(--ris)"></i>💧 a rischio</span>
  <span><i style="background:var(--pio)"></i>💧💧💧 pioggia probabile</span><span><i style="background:var(--nd)"></i>? dati mancanti</span><span>💨 raffiche forti</span>
 </div>
 <div class="nota" id="nota"></div>
</div>
<script>
const D = __DATI__;
const HEX = ["#1e7a43", "#e0a800", "#1f6fd1"], ND = "#6b7280";
const NOMI_LIV = ["ok", "a rischio", "pioggia probabile"], SIMB = ["✓", "💧", "🌧"];
const esc = t => String(t ?? "").replace(/[&<>"']/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[c]));
const fmt = n => String(n).padStart(2, "0");
const mmf = x => (x === null || x === undefined) ? "-" : x.toFixed(1).replace(".", ",");
const testoLiv = l => (l === null || l === undefined) ? "dati mancanti" : NOMI_LIV[l];
const GOCCIA = (x, y, s, c) => `<path transform="translate(${x},${y}) scale(${s})" d="M12 1C12 1 3 11.5 3 16.5a9 9 0 0 0 18 0C21 11.5 12 1 12 1z" fill="${c}" stroke="#fff" stroke-width="1.5"/>`;
function svgPunto(liv) {
  if (liv === null || liv === undefined) return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="${ND}" stroke="#fff" stroke-width="2"/><text x="20" y="26" text-anchor="middle" font-size="17" fill="#fff" font-weight="700">?</text></svg>`;
  if (liv === 0) return `<svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="15" fill="${HEX[0]}" stroke="#fff" stroke-width="2"/><path d="M12 20l6 6 10-12" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  if (liv === 1) return `<svg width="40" height="44" viewBox="0 0 40 44" aria-hidden="true">${GOCCIA(6, 4, 1.15, HEX[1])}</svg>`;
  return `<svg width="52" height="46" viewBox="0 0 52 46" aria-hidden="true">${GOCCIA(0, 14, 0.95, HEX[2])}${GOCCIA(15, 0, 1.05, HEX[2])}${GOCCIA(28, 16, 0.95, HEX[2])}</svg>`;
}
// --- Mappa (solo se Leaflet è stato caricato: serve internet) ---
const LEAF = typeof window.L !== "undefined";
let marker = [], zone = [];
if (LEAF) {
  const map = L.map("map", {scrollWheelZoom: false});
  // Le tessere OpenStreetMap richiedono una pagina web (http/https) con Referer valido:
  // aperta come file dal disco (file://) la pagina mostra tragitto e gocce senza cartina di sfondo.
  const web = location.protocol === "http:" || location.protocol === "https:";
  if (web) L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom: 18,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);
  else {
    const avviso = L.control({position: "topright"});
    avviso.onAdd = () => { const d = L.DomUtil.create("div", "senza-sfondo");
      d.textContent = "Cartina di sfondo non disponibile aprendo il file dal disco: tragitto, gocce e ore sono comunque giusti. "
        + "Per la cartina chiedi a Claude di aprire la mappa (usa un piccolo server locale)."; return d; };
    avviso.addTo(map);
  }
  const ll = D.punti.map(p => [p.lat, p.lon]);
  if (ll.length > 1) {
    L.polyline(ll, {color: "#1c2430", weight: 3, opacity: .55, dashArray: "6 8"}).addTo(map);
    map.fitBounds(L.latLngBounds(ll).pad(0.12));
  } else map.setView(ll[0], 12);
  const raggio = ll.length > 1 ? Math.max(1500, D.km * 1000 / (2 * (ll.length - 1))) : 2500;
  zone = D.punti.map(p => L.circle([p.lat, p.lon], {radius: raggio, weight: 0, fillOpacity: 0, interactive: false}).addTo(map));
  marker = D.punti.map((p, i) => L.marker([p.lat, p.lon], {icon: icona(null, false), title: p.nome, keyboard: true}).addTo(map)
    .bindTooltip(esc(p.nome), {permanent: i === 0 || i === D.punti.length - 1, direction: "top", offset: [0, -22], className: "etich"}));
} else {
  document.getElementById("map").innerHTML = '<div class="offline">La cartina non si è caricata: serve la connessione a internet. ' +
    'La barra delle ore qui sotto funziona lo stesso.</div>';
}
function icona(liv, forti) {
  const w = liv === 2 ? 52 : 40, h = liv === 2 ? 46 : 44;
  return L.divIcon({className: "", iconSize: [w, h], iconAnchor: [w / 2, h / 2],
    html: `<div class="pin">${svgPunto(liv)}${forti ? '<span class="badge">💨</span>' : ''}</div>`});
}
function mostra(i) {
  const o = D.ore[i]; const r = document.getElementById("ora"); r.value = i;
  const etich = `Ore ${fmt(o.ora)}-${fmt(o.ora + 1)}`;
  document.getElementById("ora-lbl").textContent = etich;
  r.setAttribute("aria-valuetext", `${etich}: ${o.giudizio}`);
  const st = document.getElementById("stato"); st.textContent = o.giudizio;
  st.style.color = o.livello === null ? ND : (o.livello === 1 ? "#8a6500" : HEX[o.livello]);
  D.punti.forEach((p, k) => {
    if (!LEAF) return;
    const liv = o.livelli[p.nome], v = o.per_punto[p.nome] || {};
    const forti = v.raffiche !== undefined && v.raffiche !== null && v.raffiche >= D.raffiche_forti;
    marker[k].setIcon(icona(liv, forti));
    zone[k].setStyle({fillColor: liv === null || liv === undefined ? ND : HEX[liv], fillOpacity: liv ? 0.22 : 0.08});
    marker[k].bindPopup(`<b>${esc(p.nome)}</b> · ore ${fmt(o.ora)}-${fmt(o.ora + 1)}<table class="dett">
      <tr><td>Giudizio</td><td><b>${esc(testoLiv(liv))}</b></td></tr>
      <tr><td>Probabilità</td><td>${v.prob ?? "-"}%</td></tr>
      <tr><td>Ensemble</td><td>${v.ensemble_pct ?? "-"}%</td></tr>
      <tr><td>Pioggia</td><td>${mmf(v.mm)} mm (modello più piovoso ${mmf(v.mm_max)})</td></tr>
      <tr><td>Raffiche</td><td>${v.raffiche ?? "-"} km/h</td></tr>
      <tr><td>Temperatura</td><td>${v.temp ?? "-"}°</td></tr></table>`);
  });
  document.querySelectorAll(".barra button").forEach((c, k) => {
    c.setAttribute("aria-pressed", k === i ? "true" : "false");
    if (k === i) c.scrollIntoView({block: "nearest", inline: "center", behavior: "smooth"});
  });
}
const barra = document.getElementById("barra");
D.ore.forEach((o, i) => {
  const c = document.createElement("button"); c.type = "button";
  c.className = o.livello === null ? "lnd" : "l" + o.livello;
  const simb = (o.livello === null ? "?" : SIMB[o.livello]) + (o.raffiche_forti ? "💨" : "");
  c.innerHTML = `<span>${fmt(o.ora)}</span><span aria-hidden="true">${simb}</span>`;
  c.setAttribute("aria-label", `Ore ${fmt(o.ora)}-${fmt(o.ora + 1)}: ${o.giudizio}`);
  c.title = `${fmt(o.ora)}-${fmt(o.ora + 1)}: ${o.giudizio}`;
  c.onclick = () => mostra(i); barra.appendChild(c);
});
const r = document.getElementById("ora"); r.max = Math.max(0, D.ore.length - 1); r.oninput = e => mostra(+e.target.value);
document.getElementById("sub").textContent = D.sottotitolo;
const cons = document.getElementById("consiglio");
if (D.migliore && D.consigliabile) cons.innerHTML = `<b>Orari di partenza consigliati: tra le ${fmt(D.migliore.dalle)}:00 e le ${fmt(D.migliore.alle - 1)}:00</b> · ${esc(D.migliore_testo)}`;
else if (D.migliore) { cons.classList.add("no"); cons.innerHTML = `<b>Nessun orario davvero buono.</b> La partenza meno sfavorevole è alle ${fmt(D.migliore.dalle)}:00 · ${esc(D.migliore_testo)}`; }
else { cons.classList.add("no"); cons.textContent = "Dati insufficienti per consigliare un orario."; }
document.getElementById("nota").textContent = D.nota;
let iniz = 0; if (D.migliore) { const k = D.ore.findIndex(o => o.ora === D.migliore.dalle); if (k >= 0) iniz = k; }
if (D.ore.length) mostra(iniz);
</script></body></html>
"""


def apri_mappa(percorso, minuti=60):
    """Avvia servi_mappa.py in background e apre il browser.

    Restituisce (url, aperto): url è None se il server non è partito; aperto dice se il browser si è aperto.
    """
    import os
    import select
    import webbrowser
    servitore = os.path.join(os.path.dirname(os.path.abspath(__file__)), "servi_mappa.py")
    try:
        # Porta 0: è il server a scegliere una porta libera e a comunicarla, così non c'è
        # il rischio di aprire per errore un altro programma che ha preso la stessa porta.
        proc = subprocess.Popen([sys.executable, "-I", servitore, percorso, "0", str(minuti)],
                                stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                start_new_session=True, text=True)
    except OSError:
        return None, False
    porta = None
    pronto, _, _ = select.select([proc.stdout], [], [], 5)
    if pronto:
        riga = proc.stdout.readline().strip()
        if riga.startswith("PORTA ") and riga[6:].isdigit():
            porta = int(riga[6:])
    proc.stdout.close()
    if porta is None or proc.poll() is not None:
        if proc.poll() is None:
            proc.terminate()
        return None, False
    url = f"http://127.0.0.1:{porta}/{urllib.parse.quote(os.path.basename(percorso))}"
    try:
        aperto = bool(webbrowser.open(url))
    except Exception:
        aperto = False
    return url, aperto


def scrivi_mappa(percorso, titolo, punti, ore, cons, km, note):
    """Pagina HTML con la mappa del tragitto: goccioline sui punti dove rischia di piovere, ora per ora."""
    dati = {
        "punti": [{"nome": n, "lat": la, "lon": lo} for n, la, lo in punti],
        "ore": [{k: o[k] for k in ("ora", "livello", "giudizio", "raffiche_forti", "livelli", "per_punto")} for o in ore],
        "migliore": cons and {"dalle": cons["dalle"], "alle": cons["alle"]},
        "migliore_testo": descrivi_fascia(cons) if cons else "",
        "consigliabile": bool(cons and cons["consigliabile"]), "km": km, "raffiche_forti": RAFFICHE_FORTI,
        "sottotitolo": "Media di 6 modelli meteo + ensemble ECMWF (Open-Meteo)",
        "nota": " · ".join([n for n in note if not n.startswith("Punti intermedi")]
                           + (["La linea tratteggiata e i punti intermedi sono in linea d'aria, non lungo la strada: "
                               "sono indicativi"] if len(punti) > 2 else [])
                           + ["Tocca un punto per i dettagli, scegli l'ora con la barra"]),
    }
    js = json.dumps(dati, ensure_ascii=False).replace("</", "<\\/")
    import html as _html
    pagina = MAPPA_HTML.replace("__TITOLO__", _html.escape(titolo)).replace("__DATI__", js)
    with open(percorso, "w", encoding="utf-8") as f:
        f.write(pagina)
    return percorso


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("citta", nargs="?", help="Nome della località, es. Torino")
    p.add_argument("--paese", help="Codice paese ISO a 2 lettere per disambiguare, es. IT, FR, CH")
    p.add_argument("--lat", type=float); p.add_argument("--lon", type=float)
    p.add_argument("--nome", help="Etichetta da mostrare quando si usano --lat/--lon")
    p.add_argument("--giorni", type=int, default=7, help="Giorni di previsione (1-16, default 7)")
    p.add_argument("--dal", help="Mostra solo dal giorno AAAA-MM-GG")
    p.add_argument("--al", help="Mostra solo fino al giorno AAAA-MM-GG")
    p.add_argument("--ore", help="Fasce orarie da controllare, es. 7-9,17-19 (orari di andata e ritorno)")
    p.add_argument("--json", action="store_true", help="Output JSON invece di tabella")
    p.add_argument("--giornata", nargs="?", const="oggi", metavar="GIORNO",
                   help="Modalità giornata ora per ora: oggi, domani, dopodomani o AAAA-MM-GG")
    p.add_argument("--verso", metavar="CITTÀ", help="Con --giornata: destinazione del tragitto (partenza = città)")
    p.add_argument("--dalle", type=int, default=6, help="Con --giornata: prima ora da considerare (default 6)")
    p.add_argument("--alle", type=int, default=23, help="Con --giornata: ultima ora, esclusa (default 23)")
    p.add_argument("--durata", type=int, metavar="MINUTI",
                   help="Con --giornata --verso: durata del viaggio (default: stimata dai km, 5-600)")
    p.add_argument("--mappa", metavar="FILE.html", help="Con --giornata: salva una mappa del tragitto con le zone piovose")
    p.add_argument("--apri", action="store_true",
                   help="Con --mappa: apre la mappa nel browser tramite un server locale temporaneo (serve per la cartina OSM)")
    a = p.parse_args()
    finestre = leggi_ore(a.ore)

    if a.lat is not None and a.lon is not None:
        la, lo, nome_a, alt_a = a.lat, a.lon, a.nome or f"{a.lat}, {a.lon}", []
        fuso = fuso_di(la, lo)
    elif a.citta:
        la, lo, nome_a, alt_a, fuso = trova_luogo(a.citta, a.paese)
    else:
        p.error("indica una città oppure --lat e --lon")
    adesso, fuso_ok = adesso_locale(fuso)
    oggi = adesso.date()
    nota_fuso = None if fuso_ok else (f"non riesco a usare il fuso orario {fuso}: 'oggi' e le ore già passate "
                                      "seguono l'orologio di questo computer")

    if a.giornata is not None:
        if not (0 <= a.dalle < a.alle <= 24):
            p.error("--dalle e --alle devono essere ore tra 0 e 24, con dalle < alle")
        giorno = leggi_giorno(a.giornata, oggi)
        if giorno < oggi:
            sys.exit(f"{giorno} è già passato: le previsioni partono da oggi ({oggi}).")
        if (giorno - oggi).days >= ORIZZONTE:
            sys.exit(f"{giorno} è troppo lontano: i modelli arrivano a {ORIZZONTE} giorni.")
        corto = lambda n: n.split(",")[0]
        punti = [(corto(nome_a), la, lo)]
        note = [nota_fuso] if nota_fuso else []
        if alt_a:
            note.append(f"{'Partenza' if a.verso else 'Località'}: {nome_a} (omonimi: {'; '.join(alt_a)})")
        km = 0
        if a.verso:
            lb, lob, nome_b, alt_b, fuso_b = trova_luogo(a.verso, a.paese)
            if not stessa_ora(fuso, fuso_b, giorno):
                sys.exit(f"Partenza ({fuso}) e arrivo ({fuso_b}) hanno fusi orari diversi: questo tipo di "
                         "tragitto non è supportato. Chiedi le due località separatamente.")
            km = distanza_km(la, lo, lb, lob)
            intermedi = punti_intermedi(la, lo, lb, lob, km)
            punti += intermedi
            punti.append((corto(nome_b), lb, lob))
            if alt_b:
                note.append(f"Arrivo: {nome_b} (omonimi: {'; '.join(alt_b)})")
            if intermedi:
                note.append("Punti intermedi in linea d'aria, non lungo la strada: sono indicativi")
        if a.durata is not None and not (5 <= a.durata <= 600):
            p.error("--durata deve essere tra 5 e 600 minuti")
        durata = a.durata if a.durata is not None else (durata_stimata(km) if a.verso else 0)
        ore, gruppi, lista, cons, note_dati = giornata(punti, giorno, a.dalle, a.alle, adesso, durata)
        note += note_dati
        data_txt = f"{GIORNI_IT[giorno.weekday()]} {giorno.day}/{giorno.month}"
        if a.verso:
            titolo = f"{data_txt}: {punti[0][0]} → {punti[-1][0]} (circa {km:.0f} km in linea d'aria)"
        else:
            titolo = f"{data_txt}: {punti[0][0]}"
        if a.mappa:
            if not ore:
                note.append("mappa non creata: nessun dato orario")
            else:
                import os
                percorso = os.path.abspath(os.path.expanduser(a.mappa))
                scrivi_mappa(percorso, titolo, punti, ore, cons, km, list(note))
                note.append(f"Mappa salvata in: {percorso}")
                if a.apri:
                    url, aperto = apri_mappa(percorso)
                    if url and aperto:
                        note.append(f"Mappa aperta nel browser: {url} (resta disponibile per 60 minuti)")
                    elif url:
                        note.append(f"Mappa disponibile a questo indirizzo per 60 minuti: {url} "
                                    "(apertura automatica del browser non riuscita: aprilo a mano)")
                    else:
                        note.append("Non sono riuscito ad avviare il server della mappa: il file aperto dal disco "
                                    "mostra tragitto e gocce senza cartina di sfondo")
        if a.json:
            print(json.dumps({"giorno": giorno.isoformat(), "fuso": fuso, "punti": [p_[0] for p_ in punti],
                              "km_linea_aria": round(km), "durata_min": durata, "consiglio": cons,
                              "partenze": lista, "fasce": gruppi, "ore": ore, "note": note},
                             ensure_ascii=False, indent=2))
        else:
            stampa_giornata(titolo, note, ore, gruppi, lista, cons, durata, bool(a.verso))
        return

    # Modalità più giorni: date richieste e orizzonte dei modelli.
    note = [nota_fuso] if nota_fuso else []
    try:
        dal = dt.date.fromisoformat(a.dal) if a.dal else oggi
        al = dt.date.fromisoformat(a.al) if a.al else None
    except ValueError:
        sys.exit("Date non valide: usa il formato AAAA-MM-GG")
    if al is None:
        al = dal + dt.timedelta(days=max(1, a.giorni) - 1) if a.dal else oggi + dt.timedelta(days=max(1, a.giorni) - 1)
    if al < dal:
        sys.exit("--al è prima di --dal")
    ultimo = oggi + dt.timedelta(days=ORIZZONTE - 1)
    if dal > ultimo:
        sys.exit(f"Le date richieste sono oltre l'orizzonte dei modelli ({ORIZZONTE} giorni, fino al {ultimo}).")
    if al < oggi:
        sys.exit(f"Le date richieste sono già passate (oggi è {oggi}): servono previsioni da oggi in poi.")
    if dal < oggi:
        note.append(f"i giorni prima di oggi ({oggi}) non sono previsioni e non vengono mostrati")
        dal = oggi
    if al > ultimo:
        note.append(f"i modelli arrivano solo fino al {ultimo}: i giorni successivi non sono disponibili")
        al = ultimo
    giorni = (al - oggi).days + 1
    q = {
        "latitude": la, "longitude": lo, "daily": ",".join(VARIABILI),
        "hourly": "precipitation,precipitation_probability",
        "models": ",".join(MODELLI), "timezone": "auto",
        "forecast_days": min(ORIZZONTE, giorni + 1),  # un giorno in più: la mezzanotte chiude la fascia serale
    }
    dati = scarica_o_esci("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q), "le previsioni")
    try:
        qe = {"latitude": la, "longitude": lo, "daily": "precipitation_sum", "models": "ecmwf_ifs025",
              "timezone": "auto", "forecast_days": min(giorni, 15)}
        ens = scarica("https://ensemble-api.open-meteo.com/v1/ensemble?" + urllib.parse.urlencode(qe))
    except ErroreDownload:
        ens = None
        note.append("ensemble ECMWF non disponibile: affidabilità calcolata solo sui modelli")
    righe = analizza_giorni(dati, ens, oggi.isoformat(), finestre)
    righe = [r for r in righe if dal.isoformat() <= r["data"] <= al.isoformat()]

    if a.json:
        print(json.dumps({"luogo": nome_a, "lat": la, "lon": lo, "oggi": oggi.isoformat(), "fuso": fuso,
                          "altre_localita": alt_a, "note": note, "giorni": righe}, ensure_ascii=False, indent=2))
    else:
        stampa_markdown(nome_a, (la, lo), alt_a, righe, note)


if __name__ == "__main__":
    main()
