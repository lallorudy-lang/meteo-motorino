#!/usr/bin/env python3
"""Previsione meteo "media" da più modelli numerici (via Open-Meteo, gratuito, senza chiave).

Uso:
  python3 previsioni.py Torino
  python3 previsioni.py "Reggio Emilia" --giorni 5
  python3 previsioni.py Milano --dal 2026-11-08 --al 2026-11-10
  python3 previsioni.py --lat 45.07 --lon 7.69 --nome "Casa"
  python3 previsioni.py Napoli --json
  python3 previsioni.py Bologna --ore 7-9,17-19     # pioggia negli orari indicati
  python3 previsioni.py Torino --giornata domani              # ora per ora, momento migliore
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
import math
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
ORIZZONTE = 16          # giorni massimi di previsione dei modelli
RAFFICHE_FORTI = 45     # km/h: in motorino diventano pericolose


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


def val(serie, i):
    """serie[i] oppure None se la serie manca, è più corta o il valore è nullo."""
    if not serie or i >= len(serie):
        return None
    return serie[i]


def descrivi_cielo(codici, pioggia_tipica, n_pioggia, n_modelli):
    """Descrizione a parole, guidata soprattutto dalla pioggia (più affidabile dei codici)."""
    nebbia = sum(1 for c in codici if c in (45, 48))
    temporali = sum(1 for c in codici if c >= 95)
    neve = sum(1 for c in codici if 71 <= c <= 77 or c in (85, 86))
    quota = n_pioggia / n_modelli if n_modelli else 0
    if pioggia_tipica >= 10 and quota >= 0.5:
        testo = "Pioggia forte"
    elif pioggia_tipica >= 3 and quota >= 0.5:
        testo = "Pioggia"
    elif quota > 0.5 or (quota >= 0.5 and pioggia_tipica >= 1):
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


def affidabilita(giorni_da_oggi, n_pioggia, n_modelli, spread_max, ens=None):
    """alta/media/bassa da accordo tra modelli, distanza e, se c'è, ensemble.

    ens = {"quota_pioggia": 0-1, "accordo": 0.5-1} dalle 51 simulazioni ECMWF.
    """
    if n_modelli == 0:
        return "n.d."
    accordo = max(n_pioggia, n_modelli - n_pioggia) / n_modelli
    motivi_bassa = []
    if n_modelli < 3:
        motivi_bassa.append("pochi modelli")
    if accordo < 0.6:
        motivi_bassa.append("modelli divisi")
    if spread_max > 5:
        motivi_bassa.append("temperature distanti")
    if giorni_da_oggi >= 5:
        motivi_bassa.append("giorno lontano")
    if motivi_bassa:
        livello = "bassa"
    elif giorni_da_oggi <= 2 and accordo >= 0.8 and spread_max <= 3:
        livello = "alta"
    else:
        livello = "media"
    if ens:
        quota_det = n_pioggia / n_modelli
        concordi = (quota_det >= 0.5) == (ens["quota_pioggia"] >= 0.5)
        # Promuove un giorno lontano solo se l'unico motivo di "bassa" è la distanza
        # e modelli ed ensemble dicono la stessa cosa, quasi all'unanimità.
        if (livello == "bassa" and motivi_bassa == ["giorno lontano"] and accordo >= 0.8
                and ens["accordo"] >= 0.9 and concordi):
            livello = "media"
        elif livello == "alta" and (ens["accordo"] < 0.6 or not concordi):
            livello = "media"
        elif livello == "media" and not concordi and abs(quota_det - ens["quota_pioggia"]) >= 0.5:
            livello = "bassa"
    return livello


FASCE = [("notte", 0, 6), ("mattina", 6, 12), ("pomeriggio", 12, 18), ("sera", 18, 24)]


def intervalli(tempi):
    """Per ogni timestamp: (data, ora di inizio) dell'ora PRECEDENTE a cui si riferisce il dato."""
    out = []
    for t in tempi:
        inizio = dt.datetime.fromisoformat(t) - dt.timedelta(hours=1)
        out.append((inizio.date().isoformat(), inizio.hour))
    return out


def pioggia_oraria(dati, giorno, finestre):
    """Per ogni finestra (nome, da, a): mediana tra i modelli dei mm, modelli con >= 0.3 mm, probabilità."""
    h = dati.get("hourly") or {}
    tempi = h.get("time") or []
    rif = intervalli(tempi)
    out = []
    for nome, da, a in finestre:
        sel = [i for i, (g, ora) in enumerate(rif) if g == giorno and da <= ora < a]
        if len(sel) < a - da:
            continue  # finestra incompleta (fine dell'orizzonte): meglio non darla che darla sbagliata
        somme, probs = [], []
        for m in MODELLI:
            vals = [val(h.get(f"precipitation_{m}"), i) for i in sel]
            if all(v is not None for v in vals):
                somme.append(sum(vals))
            # Probabilità nella fascia per questo modello = la più alta tra le sue ore.
            pv = [v for v in (val(h.get(f"precipitation_probability_{m}"), i) for i in sel) if v is not None]
            if pv:
                probs.append(max(pv))
        if not somme:
            continue
        out.append({"fascia": nome, "ore": f"{da}-{a}", "mediana_mm": round(st.median(somme), 1),
                    "max_mm": round(max(somme), 1),
                    "modelli_con_pioggia": f"{sum(1 for x in somme if x >= 0.3)}/{len(somme)}",
                    "probabilita_tipica": round(st.median(probs)) if probs else None,
                    "probabilita_intervallo": [min(probs), max(probs)] if probs else None})
    return out


def ensemble_per_giorno(ens):
    """Dalle 51 simulazioni ECMWF: quante danno >= 1 mm nel giorno, mediana e intervallo 10-90%."""
    out = {}
    if not ens:
        return out
    d = ens.get("daily") or {}
    chiavi = [k for k in d if k.startswith("precipitation_sum")]
    for i, giorno in enumerate(d.get("time") or []):
        vals = sorted(v for v in (val(d[k], i) for k in chiavi) if v is not None)
        if not vals:
            continue
        n = len(vals)
        piovosi = sum(1 for v in vals if v >= 1)
        f = piovosi / n
        out[giorno] = {"simulazioni_con_pioggia": f"{piovosi}/{n}", "quota_pioggia": round(f, 2),
                       "accordo": round(max(f, 1 - f), 2), "mediana_mm": round(st.median(vals), 1),
                       "intervallo_10_90_mm": [round(vals[int(0.1 * (n - 1))], 1), round(vals[int(0.9 * (n - 1))], 1)]}
    return out


def analizza(dati, ens, oggi, finestre_extra):
    d = dati["daily"]
    ensg = ensemble_per_giorno(ens)
    righe = []
    for i, giorno in enumerate(d["time"]):
        def valori(var):
            out = {}
            for m in MODELLI:
                v = val(d.get(f"{var}_{m}"), i)
                if v is not None:
                    out[m] = v
            return out
        tmax, tmin, prec = valori("temperature_2m_max"), valori("temperature_2m_min"), valori("precipitation_sum")
        prob, cod, vento = valori("precipitation_probability_max"), valori("weather_code"), valori("wind_speed_10m_max")
        if not tmax or not tmin or not prec:
            continue
        n = len(prec)
        n_pioggia = sum(1 for v in prec.values() if v >= 1)
        pv = list(prec.values())
        media, mediana = st.mean(pv), st.median(pv)
        spread = max(tmax.values()) - min(tmax.values())
        data = dt.date.fromisoformat(giorno)
        dist = (data - oggi).days
        e = ensg.get(giorno)
        avviso = None
        if n >= 3 and max(pv) - min(pv) >= 10 and max(pv) >= 3 * max(mediana, 1):
            alti = [MODELLI[m] for m, v in prec.items() if v >= 3 * max(mediana, 1)]
            avviso = (f"modelli molto divisi: {', '.join(alti)} danno molta più pioggia degli altri; "
                      f"la mediana ({mm(mediana)} mm) è più rappresentativa della media ({mm(media)} mm), "
                      f"ma lo scenario più piovoso ({mm(max(pv))} mm) resta possibile")
        righe.append({
            "data": giorno,
            "giorno": f"{GIORNI_IT[data.weekday()]} {data.day}",
            "giorni_da_oggi": dist,
            "cielo": descrivi_cielo(list(cod.values()), mediana, n_pioggia, n) + (f" (solo {n} modelli)" if n < 3 else ""),
            "min_media": round(st.mean(tmin.values()), 1),
            "min_intervallo": [round(min(tmin.values())), round(max(tmin.values()))],
            "max_media": round(st.mean(tmax.values()), 1),
            "max_intervallo": [round(min(tmax.values())), round(max(tmax.values()))],
            "pioggia_mediana_mm": round(mediana, 1),
            "pioggia_media_mm": round(media, 1),
            "pioggia_max_mm": round(max(pv), 1),
            "pioggia_per_modello_mm": {MODELLI[m]: round(v, 1) for m, v in prec.items()},
            "modelli_con_pioggia": f"{n_pioggia}/{n}",
            "probabilita_pioggia_intervallo": [min(prob.values()), max(prob.values())] if prob else None,
            "ensemble_ecmwf": e,
            "pioggia_per_fascia": pioggia_oraria(dati, giorno, FASCE),
            "pioggia_orari_richiesti": pioggia_oraria(dati, giorno, finestre_extra) if finestre_extra else [],
            "vento_max_kmh": round(max(vento.values())) if vento else None,
            "affidabilita": affidabilita(dist, n_pioggia, n, spread, e),
            "avviso": avviso,
        })
    return righe


def prob(f):
    """'prob. 45% (20-60%)': mediana tra i modelli e intervallo."""
    if f.get("probabilita_tipica") is None:
        return "prob. n.d."
    a, b = f["probabilita_intervallo"]
    return f"prob. {f['probabilita_tipica']}%" + (f" ({a}-{b}%)" if a != b else "")


def mm(x):
    return f"{x:.1f}".replace(".", ",")


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

def distanza_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


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
    """Valori ora per ora in un punto, per intervalli [h, h+1) del giorno richiesto.

    Restituisce ({ora_inizio: valori}, ensemble_disponibile).
    """
    g, g2 = giorno.isoformat(), (giorno + dt.timedelta(days=1)).isoformat()
    q = {"latitude": lat, "longitude": lon, "models": ",".join(MODELLI), "timezone": "auto",
         "hourly": "precipitation,precipitation_probability,temperature_2m,wind_gusts_10m",
         "start_date": g, "end_date": g2}  # serve anche la mezzanotte dopo, per l'ora 23-24
    h = scarica_o_esci("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(q), "le previsioni orarie")["hourly"]
    ens_ora, ens_ok = {}, False
    try:
        qe = {"latitude": lat, "longitude": lon, "models": "ecmwf_ifs025", "timezone": "auto",
              "hourly": "precipitation", "start_date": g, "end_date": g2}
        eh = scarica("https://ensemble-api.open-meteo.com/v1/ensemble?" + urllib.parse.urlencode(qe))["hourly"]
        chiavi = [k for k in eh if k.startswith("precipitation")]
        for i, t in enumerate(eh.get("time") or []):
            v = [x for x in (val(eh[k], i) for k in chiavi) if x is not None]
            if v:
                ens_ora[t] = round(100 * sum(1 for x in v if x >= 0.1) / len(v))
        ens_ok = bool(ens_ora)
    except (ErroreDownload, KeyError, TypeError, ValueError):
        pass  # l'ensemble è un di più: senza, si usano solo i modelli (e lo si dice)
    tempi = h.get("time") or []
    indice = {t: i for i, t in enumerate(tempi)}
    out = {}
    for i, t in enumerate(tempi):
        fine = dt.datetime.fromisoformat(t)
        inizio = fine - dt.timedelta(hours=1)
        if inizio.date() != giorno:
            continue

        def vals(var, j):
            return [v for v in (val(h.get(f"{var}_{m}"), j) for m in MODELLI) if v is not None]
        pr, pp, gg = vals("precipitation", i), vals("precipitation_probability", i), vals("wind_gusts_10m", i)
        j0 = indice.get(inizio.strftime("%Y-%m-%dT%H:%M"))
        tt = vals("temperature_2m", j0) if j0 is not None else vals("temperature_2m", i)  # temperatura istantanea a inizio ora
        out[inizio.hour] = {
            "n_modelli": len(pr),
            "mm": round(st.median(pr), 1) if pr else None,
            "mm_max": round(max(pr), 1) if pr else None,
            "modelli_con_pioggia": f"{sum(1 for v in pr if v >= 0.1)}/{len(pr)}",
            "prob": round(st.median(pp)) if pp else None,
            "prob_intervallo": [min(pp), max(pp)] if pp else None,
            "ensemble_pct": ens_ora.get(t),
            "temp": round(st.median(tt)) if tt else None,
            "raffiche": round(st.median(gg)) if gg else None,
        }
    return out, ens_ok


LIVELLI = ["ok", "a rischio", "pioggia probabile"]


def valuta_ora(o):
    """Giudizio per un punto in un'ora. Probabilità e mm restano separati: niente percentuali inventate."""
    if o is None or o["n_modelli"] == 0:
        return {"livello": None, "motivo": "dati mancanti"}
    probs = [x for x in (o["prob"], o["ensemble_pct"]) if x is not None]
    if not probs and o["n_modelli"] < 3:
        return {"livello": None, "motivo": "dati insufficienti"}
    p = max(probs) if probs else None
    if (p is not None and p > 50) or o["mm"] >= 0.3:
        livello = 2
    elif (p is not None and p > 20) or o["mm"] >= 0.1 or o["mm_max"] >= 1:
        livello = 1
    else:
        livello = 0
    if livello == 0 and o["n_modelli"] < 3:
        # Un "ok" basato su 1-2 modelli non è abbastanza solido da consigliare un orario.
        return {"livello": None, "motivo": "dati insufficienti", "prob": p}
    return {"livello": livello, "prob": p}


def giornata(punti, giorno, dalle, alle, adesso):
    """punti = [(nome, lat, lon)]. Restituisce ore combinate, fasce, fasce buone, migliore, note."""
    dati, note = [], []
    from concurrent.futures import ThreadPoolExecutor
    with ThreadPoolExecutor(max_workers=4) as pool:  # fino a 7 punti: scaricarli in parallelo
        risultati = list(pool.map(lambda p_: ore_punto(p_[1], p_[2], giorno), punti))
    for (nome, _, _), (d, ens_ok) in zip(punti, risultati):
        dati.append((nome, d))
        if not ens_ok:
            note.append(f"ensemble non disponibile per {nome}: uso solo i modelli")
    prima_ora = max(dalle, adesso.hour) if giorno == adesso.date() else dalle
    ore = []
    for ora in range(prima_ora, alle):
        per_punto = [(nome, d.get(ora)) for nome, d in dati]
        valutazioni = [(nome, o, valuta_ora(o)) for nome, o in per_punto]
        mancanti = [nome for nome, _, v in valutazioni if v["livello"] is None]
        validi = [(nome, o, v) for nome, o, v in valutazioni if v["livello"] is not None]
        raffiche = max((o["raffiche"] for _, o, _ in validi if o["raffiche"] is not None), default=None)
        forti = raffiche is not None and raffiche >= RAFFICHE_FORTI
        if mancanti:
            # Un tragitto verificato solo in parte non è "ok".
            livello, giudizio = None, ("dati incompleti (" + ", ".join(mancanti) + ")") if validi else "dati mancanti"
        else:
            livello = max(v["livello"] for _, _, v in validi)
            giudizio = LIVELLI[livello]
        if forti:
            giudizio += ", raffiche forti"
        probs = [v["prob"] for _, _, v in validi if v.get("prob") is not None]
        ore.append({
            "ora": ora, "livello": livello, "raffiche_forti": forti, "giudizio": giudizio,
            "mm": max((o["mm"] for _, o, _ in validi), default=None),
            "mm_max": max((o["mm_max"] for _, o, _ in validi), default=None),
            "prob": max((o["prob"] for _, o, _ in validi if o["prob"] is not None), default=None),
            "ensemble_pct": max((o["ensemble_pct"] for _, o, _ in validi if o["ensemble_pct"] is not None), default=None),
            "prob_max": max(probs) if probs else None,
            "raffiche": raffiche,
            "temp": validi[0][1]["temp"] if validi else None,
            "modelli": min((o["n_modelli"] for _, o, _ in validi), default=0),
            "dove_piove": [nome for nome, _, v in validi if v["livello"] >= 1] if len(punti) > 1 else [],
            "per_punto": {nome: o for nome, o in per_punto},
            "livelli": {nome: v["livello"] for nome, _, v in valutazioni},
        })
    # Fasce: ore consecutive con lo stesso giudizio.
    fasce = []
    for o in ore:
        if fasce and fasce[-1]["giudizio"] == o["giudizio"] and fasce[-1]["alle"] == o["ora"]:
            f = fasce[-1]
            f["alle"] = o["ora"] + 1
            f["ore"].append(o)
        else:
            fasce.append({"dalle": o["ora"], "alle": o["ora"] + 1, "giudizio": o["giudizio"],
                          "livello": o["livello"], "raffiche_forti": o["raffiche_forti"], "ore": [o]})
    for f in fasce:
        pr = [o["prob_max"] for o in f["ore"] if o["prob_max"] is not None]
        f["prob_max"] = max(pr) if pr else None
        f["mm_max"] = max((o["mm_max"] for o in f["ore"] if o["mm_max"] is not None), default=None)
        f["raffiche_max"] = max((o["raffiche"] for o in f["ore"] if o["raffiche"] is not None), default=None)
    buone = [f for f in fasce if f["livello"] == 0 and not f["raffiche_forti"]]
    migliore, consigliabile = None, False
    if buone:
        migliore = max(buone, key=lambda f: (f["alle"] - f["dalle"], -(f["prob_max"] or 0)))
        consigliabile = True
    else:
        # Nessuna fascia davvero buona: l'ora meno sfavorevole. Prima evita le raffiche forti
        # (in motorino sono più pericolose di qualche goccia), poi livello di pioggia, mm e probabilità.
        candidate = [o for o in ore if o["livello"] is not None]
        if candidate:
            o = min(candidate, key=lambda x: (x["raffiche_forti"], x["livello"], x["mm"] or 0,
                                              x["mm_max"] or 0, x["prob_max"] or 0))
            migliore = {"dalle": o["ora"], "alle": o["ora"] + 1, "giudizio": o["giudizio"], "livello": o["livello"],
                        "prob_max": o["prob_max"], "mm_max": o["mm_max"], "raffiche_max": o["raffiche"]}
    for f in fasce:
        del f["ore"]  # non serve nell'output
    return ore, fasce, buone, migliore, consigliabile, note


def descrivi_fascia(f):
    parti = [f["giudizio"]]
    if f.get("prob_max") is not None:
        parti.append(f"probabilità fino al {f['prob_max']}%")
    if f.get("mm_max"):
        parti.append(f"fino a {mm(f['mm_max'])} mm/h nel modello più piovoso")
    if f.get("raffiche_max") is not None and f["raffiche_max"] >= RAFFICHE_FORTI:
        parti.append(f"raffiche {f['raffiche_max']} km/h")
    return ", ".join(parti)


def stampa_giornata(titolo, note, ore, fasce, buone, migliore, consigliabile, tragitto):
    print(f"## {titolo}")
    for n in note:
        print(f"_{n}_")
    print()
    if not ore:
        print("Nessun dato orario disponibile per questo giorno.")
        return
    fmt = lambda f: f"{f['dalle']:02d}-{f['alle']:02d}"
    if migliore and consigliabile:
        print(f"**Momento migliore per spostarsi:** {fmt(migliore)} ({descrivi_fascia(migliore)})")
        altre = [f for f in buone if f is not migliore]
        if altre:
            print("**Altre fasce buone:** " + ", ".join(fmt(f) for f in altre))
    elif migliore:
        print(f"**Nessuna fascia davvero buona.** L'ora meno sfavorevole è {fmt(migliore)} ({descrivi_fascia(migliore)}).")
    else:
        print("**Dati insufficienti per consigliare un orario.**")
    print("**Fasce della giornata:** " + " · ".join(f"{fmt(f)} {f['giudizio']}" for f in fasce))
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


def punti_intermedi(la, lo, lb, lob, km):
    """Punti in linea d'aria tra partenza e arrivo, circa uno ogni 15 km (al massimo 5)."""
    n = min(5, int(km // 15))
    out = []
    for k in range(1, n + 1):
        f = k / (n + 1)
        out.append((f"km {round(km * f)}", la + f * (lb - la), lo + f * (lob - lo)))
    return out


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
if (D.migliore && D.consigliabile) cons.innerHTML = `<b>Momento migliore per spostarsi: ${fmt(D.migliore.dalle)}-${fmt(D.migliore.alle)}</b> · ${esc(D.migliore_testo)}`;
else if (D.migliore) { cons.classList.add("no"); cons.innerHTML = `<b>Nessuna fascia davvero buona.</b> L'ora meno sfavorevole è ${fmt(D.migliore.dalle)}-${fmt(D.migliore.alle)} · ${esc(D.migliore_testo)}`; }
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


def scrivi_mappa(percorso, titolo, punti, ore, migliore, consigliabile, km, note):
    """Pagina HTML con la mappa del tragitto: goccioline sui punti dove rischia di piovere, ora per ora."""
    dati = {
        "punti": [{"nome": n, "lat": la, "lon": lo} for n, la, lo in punti],
        "ore": [{k: o[k] for k in ("ora", "livello", "giudizio", "raffiche_forti", "livelli", "per_punto")} for o in ore],
        "migliore": migliore and {"dalle": migliore["dalle"], "alle": migliore["alle"]},
        "migliore_testo": descrivi_fascia(migliore) if migliore else "",
        "consigliabile": consigliabile, "km": km, "raffiche_forti": RAFFICHE_FORTI,
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
        ore, fasce, buone, migliore, consigliabile, note_dati = giornata(punti, giorno, a.dalle, a.alle, adesso)
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
                scrivi_mappa(percorso, titolo, punti, ore, migliore, consigliabile, km, list(note))
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
                              "km_linea_aria": round(km), "momento_migliore": migliore,
                              "consigliabile": consigliabile, "fasce": fasce, "ore": ore, "note": note},
                             ensure_ascii=False, indent=2))
        else:
            stampa_giornata(titolo, note, ore, fasce, buone, migliore, consigliabile, bool(a.verso))
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
    righe = analizza(dati, ens, oggi, finestre)
    righe = [r for r in righe if dal.isoformat() <= r["data"] <= al.isoformat()]

    if a.json:
        print(json.dumps({"luogo": nome_a, "lat": la, "lon": lo, "oggi": oggi.isoformat(), "fuso": fuso,
                          "altre_localita": alt_a, "note": note, "giorni": righe}, ensure_ascii=False, indent=2))
    else:
        stampa_markdown(nome_a, (la, lo), alt_a, righe, note)


if __name__ == "__main__":
    main()
