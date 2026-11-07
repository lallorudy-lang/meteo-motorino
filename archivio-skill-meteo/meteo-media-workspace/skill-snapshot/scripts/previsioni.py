#!/usr/bin/env python3
"""Previsione meteo "media" da più modelli numerici (via Open-Meteo, gratuito, senza chiave).

Uso:
  python3 previsioni.py Torino
  python3 previsioni.py "Reggio Emilia" --giorni 5
  python3 previsioni.py Milano --dal 2026-11-08 --al 2026-11-10
  python3 previsioni.py --lat 45.07 --lon 7.69 --nome "Casa"
  python3 previsioni.py Napoli --json

Per ogni giorno calcola media e intervallo di minima/massima, la pioggia media,
quanti modelli prevedono pioggia (>= 1 mm), il vento massimo e un'affidabilità
(alta / media / bassa) basata su accordo tra modelli e distanza dal giorno di oggi.
Usa solo la libreria standard di Python.
"""
import argparse
import datetime as dt
import json
import statistics as st
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

MODELLI = {
    "ecmwf_ifs025": "ECMWF (europeo)",
    "gfs_seamless": "GFS (americano)",
    "icon_seamless": "ICON (tedesco)",
    "meteofrance_seamless": "Météo-France",
    "ukmo_seamless": "UKMO (inglese)",
    "italia_meteo_arpae_icon_2i": "ItaliaMeteo-ARPAE",
}
VARIABILI = [
    "temperature_2m_max", "temperature_2m_min", "precipitation_sum",
    "precipitation_probability_max", "weather_code", "wind_speed_10m_max",
]
GIORNI_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]


def scarica(url):
    req = urllib.request.Request(url, headers={"User-Agent": "meteo-media-skill/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.load(r)
    except urllib.error.URLError as e:
        # Il Python di python.org su macOS spesso non ha i certificati installati:
        # in quel caso usa curl di sistema (che usa il portachiavi, verifica attiva).
        if "CERTIFICATE_VERIFY_FAILED" not in str(e):
            raise
        out = subprocess.run(["curl", "-sSf", "--max-time", "30", "-A", "meteo-media-skill/1.0", url],
                             capture_output=True, text=True)
        if out.returncode != 0:
            sys.exit(f"Download non riuscito: {out.stderr.strip()}")
        return json.loads(out.stdout)


def trova_luogo(nome, paese=None):
    q = {"name": nome, "count": 5, "language": "it", "format": "json"}
    if paese:
        q["countryCode"] = paese
    dati = scarica("https://geocoding-api.open-meteo.com/v1/search?" + urllib.parse.urlencode(q))
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
    alternative = [", ".join(x for x in [a.get("name"), a.get("admin1")] if x)
                   for a in risultati[1:] if a.get("country_code") == r.get("country_code")]
    return r["latitude"], r["longitude"], etichetta, alternative


def descrivi_cielo(codici, pioggia_media, n_pioggia, n_modelli):
    """Descrizione a parole, guidata soprattutto dalla pioggia (più affidabile dei codici)."""
    nebbia = sum(1 for c in codici if c in (45, 48))
    temporali = sum(1 for c in codici if c >= 95)
    neve = sum(1 for c in codici if 71 <= c <= 77 or c in (85, 86))
    quota = n_pioggia / n_modelli if n_modelli else 0
    if pioggia_media >= 10 and quota >= 0.5:
        testo = "Pioggia forte"
    elif pioggia_media >= 3 and quota >= 0.5:
        testo = "Pioggia"
    elif quota >= 0.5:
        testo = "Pioggia debole"
    elif n_pioggia >= 1:
        testo = f"Nuvoloso, pioggia possibile ({n_pioggia} modell{'o' if n_pioggia == 1 else 'i'} su {n_modelli})"
    else:
        sereni = sum(1 for c in codici if c in (0, 1))
        testo = "Sereno o poco nuvoloso" if sereni > len(codici) / 2 else "Nuvoloso, asciutto"
    if temporali >= 2 or (temporali == 1 and quota >= 0.5):
        testo += ", possibili temporali"
    if neve >= 2:
        testo += ", possibile neve"
    if nebbia >= 2 and n_pioggia == 0:
        testo += ", nebbia possibile"
    return testo


def affidabilita(giorni_da_oggi, n_pioggia, n_modelli, spread_max):
    if n_modelli == 0:
        return "n.d."
    accordo = max(n_pioggia, n_modelli - n_pioggia) / n_modelli
    if giorni_da_oggi >= 5 or accordo < 0.6 or spread_max > 5 or n_modelli < 3:
        return "bassa"
    if giorni_da_oggi <= 2 and accordo >= 0.8 and spread_max <= 3:
        return "alta"
    return "media"


def analizza(dati, oggi):
    d = dati["daily"]
    righe = []
    for i, giorno in enumerate(d["time"]):
        def valori(var):
            out = {}
            for m in MODELLI:
                serie = d.get(f"{var}_{m}")
                if serie and i < len(serie) and serie[i] is not None:
                    out[m] = serie[i]
            return out
        tmax, tmin, prec = valori("temperature_2m_max"), valori("temperature_2m_min"), valori("precipitation_sum")
        prob, cod, vento = valori("precipitation_probability_max"), valori("weather_code"), valori("wind_speed_10m_max")
        if not tmax:
            continue
        n = len(prec)
        n_pioggia = sum(1 for v in prec.values() if v >= 1)
        pm = st.mean(prec.values()) if prec else 0.0
        spread = max(tmax.values()) - min(tmax.values())
        data = dt.date.fromisoformat(giorno)
        dist = (data - oggi).days
        righe.append({
            "data": giorno,
            "giorno": f"{GIORNI_IT[data.weekday()]} {data.day}",
            "giorni_da_oggi": dist,
            "cielo": descrivi_cielo(list(cod.values()), pm, n_pioggia, n),
            "min_media": round(st.mean(tmin.values()), 1),
            "min_intervallo": [round(min(tmin.values())), round(max(tmin.values()))],
            "max_media": round(st.mean(tmax.values()), 1),
            "max_intervallo": [round(min(tmax.values())), round(max(tmax.values()))],
            "pioggia_media_mm": round(pm, 1),
            "pioggia_max_mm": round(max(prec.values()), 1) if prec else 0.0,
            "pioggia_per_modello_mm": {MODELLI[m]: round(v, 1) for m, v in prec.items()},
            "modelli_con_pioggia": f"{n_pioggia}/{n}",
            "probabilita_pioggia_intervallo": [min(prob.values()), max(prob.values())] if prob else None,
            "vento_max_kmh": round(max(vento.values())) if vento else None,
            "affidabilita": affidabilita(dist, n_pioggia, n, spread),
        })
    return righe


def stampa_markdown(luogo, coord, alternative, righe):
    print(f"## {luogo}  ({coord[0]:.2f}, {coord[1]:.2f})")
    if alternative:
        print(f"_Altre località con lo stesso nome: {'; '.join(alternative)}. "
              "Se non è quella giusta, rilancia con --paese o --lat/--lon._")
    print()
    print("| Giorno | Tempo | Min | Max | Pioggia media | Modelli con pioggia | Vento max | Affidabilità |")
    print("|---|---|---|---|---|---|---|---|")
    for r in righe:
        a, b = r["min_intervallo"]; c, e = r["max_intervallo"]
        pioggia = f"{r['pioggia_media_mm']} mm (fino a {r['pioggia_max_mm']})" if r["pioggia_max_mm"] >= 1 else "0"
        print(f"| {r['giorno']} | {r['cielo']} | {r['min_media']:.0f}° ({a}-{b}) | {r['max_media']:.0f}° ({c}-{e}) "
              f"| {pioggia} | {r['modelli_con_pioggia']} | {r['vento_max_kmh']} km/h | {r['affidabilita']} |")
    print()
    print("Pioggia per modello (mm):")
    for r in righe:
        dettagli = ", ".join(f"{k} {v}" for k, v in r["pioggia_per_modello_mm"].items())
        print(f"- {r['giorno']}: {dettagli}")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("citta", nargs="?", help="Nome della località, es. Torino")
    p.add_argument("--paese", help="Codice paese ISO a 2 lettere per disambiguare, es. IT, FR, CH")
    p.add_argument("--lat", type=float); p.add_argument("--lon", type=float)
    p.add_argument("--nome", help="Etichetta da mostrare quando si usano --lat/--lon")
    p.add_argument("--giorni", type=int, default=7, help="Giorni di previsione (1-16, default 7)")
    p.add_argument("--dal", help="Mostra solo dal giorno AAAA-MM-GG")
    p.add_argument("--al", help="Mostra solo fino al giorno AAAA-MM-GG")
    p.add_argument("--json", action="store_true", help="Output JSON invece di tabella")
    a = p.parse_args()

    if a.lat is not None and a.lon is not None:
        lat, lon, luogo, alt = a.lat, a.lon, a.nome or f"{a.lat}, {a.lon}", []
    elif a.citta:
        lat, lon, luogo, alt = trova_luogo(a.citta, a.paese)
    else:
        p.error("indica una città oppure --lat e --lon")

    giorni = max(1, min(16, a.giorni))
    if a.al:
        giorni = max(giorni, min(16, (dt.date.fromisoformat(a.al) - dt.date.today()).days + 1))
    q = {
        "latitude": lat, "longitude": lon, "daily": ",".join(VARIABILI),
        "models": ",".join(MODELLI), "timezone": "auto", "forecast_days": giorni,
    }
    dati = scarica("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q))
    oggi = dt.date.today()
    righe = analizza(dati, oggi)
    if a.dal:
        righe = [r for r in righe if r["data"] >= a.dal]
    if a.al:
        righe = [r for r in righe if r["data"] <= a.al]

    if a.json:
        print(json.dumps({"luogo": luogo, "lat": lat, "lon": lon, "oggi": oggi.isoformat(),
                          "altre_localita": alt, "giorni": righe}, ensure_ascii=False, indent=2))
    else:
        stampa_markdown(luogo, (lat, lon), alt, righe)


if __name__ == "__main__":
    main()
