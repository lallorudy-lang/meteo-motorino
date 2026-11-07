"""Regole di calcolo della skill meteo-media: funzioni pure, nessun accesso alla rete.

È il "contratto" condiviso con app/motore.js: le stesse funzioni, con gli stessi nomi
(snake_case qui, camelCase in JavaScript), superano gli stessi casi in contratto/casi/.
Una regola si cambia sempre in entrambi i file, aggiungendo un caso al contratto.
"""
import datetime as dt
import math
import statistics as st

MODELLI = {
    "ecmwf_ifs025": "ECMWF (europeo)",
    "gfs_seamless": "GFS (americano)",
    "icon_seamless": "ICON (tedesco)",
    "meteofrance_seamless": "Météo-France",
    "ukmo_seamless": "UKMO (inglese)",
    "italia_meteo_arpae_icon_2i": "ItaliaMeteo-ARPAE",
}
GIORNI_IT = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
RAFFICHE_FORTI = 45     # km/h: in motorino diventano pericolose
LIVELLI = ["ok", "a rischio", "pioggia probabile"]
FASCE = [("notte", 0, 6), ("mattina", 6, 12), ("pomeriggio", 12, 18), ("sera", 18, 24)]


def arrotonda(x, cifre=0):
    """Arrotondamento alla pari (half-even) sul valore binario esatto, come round() di Python."""
    if x is None:
        return None
    return round(x) if cifre == 0 else round(x, cifre)


def val(serie, i):
    """serie[i] oppure None se la serie manca, è più corta o il valore è nullo."""
    if not serie or i is None or i >= len(serie):
        return None
    return serie[i]


def mm(x):
    return f"{x:.1f}".replace(".", ",")


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

    ens = {"quota_pioggia": 0-1, "accordo": 0.5-1} dalle simulazioni ECMWF.
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
        if (livello == "bassa" and motivi_bassa == ["giorno lontano"] and accordo >= 0.8
                and ens["accordo"] >= 0.9 and concordi):
            livello = "media"
        elif livello == "alta" and (ens["accordo"] < 0.6 or not concordi):
            livello = "media"
        elif livello == "media" and not concordi and abs(quota_det - ens["quota_pioggia"]) >= 0.5:
            livello = "bassa"
    return livello


def intervalli(tempi):
    """Per ogni timestamp: [data, ora di inizio] dell'ora PRECEDENTE a cui si riferisce il dato."""
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
            pv = [v for v in (val(h.get(f"precipitation_probability_{m}"), i) for i in sel) if v is not None]
            if pv:
                probs.append(max(pv))
        if not somme:
            continue
        out.append({"fascia": nome, "ore": f"{da}-{a}", "mediana_mm": arrotonda(st.median(somme), 1),
                    "max_mm": arrotonda(max(somme), 1),
                    "modelli_con_pioggia": f"{sum(1 for x in somme if x >= 0.3)}/{len(somme)}",
                    "probabilita_tipica": arrotonda(st.median(probs)) if probs else None,
                    "probabilita_intervallo": [min(probs), max(probs)] if probs else None})
    return out


def ensemble_per_giorno(ens):
    """Dalle simulazioni ECMWF: quante danno >= 1 mm nel giorno, mediana e intervallo 10-90%."""
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
        out[giorno] = {"simulazioni_con_pioggia": f"{piovosi}/{n}", "quota_pioggia": arrotonda(f, 2),
                       "accordo": arrotonda(max(f, 1 - f), 2), "mediana_mm": arrotonda(st.median(vals), 1),
                       "intervallo_10_90_mm": [arrotonda(vals[int(0.1 * (n - 1))], 1),
                                               arrotonda(vals[int(0.9 * (n - 1))], 1)]}
    return out


def analizza_giorni(dati, ens, oggi, finestre_extra):
    """Righe giorno per giorno. oggi = data ISO nel fuso della località."""
    oggi = dt.date.fromisoformat(oggi)
    finestre_extra = [tuple(f) for f in (finestre_extra or [])]
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
            "min_media": arrotonda(st.mean(tmin.values()), 1),
            "min_intervallo": [arrotonda(min(tmin.values())), arrotonda(max(tmin.values()))],
            "max_media": arrotonda(st.mean(tmax.values()), 1),
            "max_intervallo": [arrotonda(min(tmax.values())), arrotonda(max(tmax.values()))],
            "pioggia_mediana_mm": arrotonda(mediana, 1),
            "pioggia_media_mm": arrotonda(media, 1),
            "pioggia_max_mm": arrotonda(max(pv), 1),
            "pioggia_per_modello_mm": {MODELLI[m]: arrotonda(v, 1) for m, v in prec.items()},
            "modelli_con_pioggia": f"{n_pioggia}/{n}",
            "probabilita_pioggia_intervallo": [min(prob.values()), max(prob.values())] if prob else None,
            "ensemble_ecmwf": e,
            "pioggia_per_fascia": pioggia_oraria(dati, giorno, FASCE),
            "pioggia_orari_richiesti": pioggia_oraria(dati, giorno, finestre_extra) if finestre_extra else [],
            "vento_max_kmh": arrotonda(max(vento.values())) if vento else None,
            "affidabilita": affidabilita(dist, n_pioggia, n, spread, e),
            "avviso": avviso,
        })
    return righe


def distanza_km(lat1, lon1, lat2, lon2):
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * 6371 * math.asin(math.sqrt(a))


def punti_intermedi(la, lo, lb, lob, km):
    """Punti in linea d'aria tra partenza e arrivo, circa uno ogni 15 km (al massimo 5)."""
    n = min(5, int(km // 15))
    out = []
    for k in range(1, n + 1):
        f = k / (n + 1)
        out.append((f"km {arrotonda(km * f)}", la + f * (lb - la), lo + f * (lob - lo)))
    return out


def ore_punto_da_risposte(det, ens, giorno):
    """Valori ora per ora in un punto, per intervalli [h, h+1) del giorno (ISO) richiesto.

    det ed ens sono i campi "hourly" delle risposte Open-Meteo (ens può essere None).
    Restituisce una lista ordinata di ValoriOra con la chiave "ora".
    """
    giorno = dt.date.fromisoformat(giorno)
    ens_ora = {}
    if ens:
        chiavi = [k for k in ens if k.startswith("precipitation")]
        for i, t in enumerate(ens.get("time") or []):
            v = [x for x in (val(ens[k], i) for k in chiavi) if x is not None]
            if v:
                ens_ora[t] = arrotonda(100 * sum(1 for x in v if x >= 0.1) / len(v))
    tempi = det.get("time") or []
    indice = {t: i for i, t in enumerate(tempi)}
    out = {}
    for i, t in enumerate(tempi):
        fine = dt.datetime.fromisoformat(t)
        inizio = fine - dt.timedelta(hours=1)
        if inizio.date() != giorno:
            continue

        def vals(var, j):
            return [v for v in (val(det.get(f"{var}_{m}"), j) for m in MODELLI) if v is not None]
        pr, pp, gg = vals("precipitation", i), vals("precipitation_probability", i), vals("wind_gusts_10m", i)
        j0 = indice.get(inizio.strftime("%Y-%m-%dT%H:%M"))
        tt = vals("temperature_2m", j0) if j0 is not None else vals("temperature_2m", i)  # istantanea a inizio ora
        out[inizio.hour] = {
            "n_modelli": len(pr),
            "mm": arrotonda(st.median(pr), 1) if pr else None,
            "mm_max": arrotonda(max(pr), 1) if pr else None,
            "modelli_con_pioggia": f"{sum(1 for v in pr if v >= 0.1)}/{len(pr)}",
            "prob": arrotonda(st.median(pp)) if pp else None,
            "prob_intervallo": [min(pp), max(pp)] if pp else None,
            "ensemble_pct": ens_ora.get(t),
            "temp": arrotonda(st.median(tt)) if tt else None,
            "raffiche": arrotonda(st.median(gg)) if gg else None,
            "ora": inizio.hour,
        }
    return [out[h] for h in sorted(out)]


def valuta_ora(o):
    """Giudizio per un punto in un'ora. Probabilità e mm restano separati: niente percentuali inventate."""
    if o is None or o["n_modelli"] == 0:
        return {"livello": None, "prob": None, "motivo": "dati mancanti"}
    probs = [x for x in (o["prob"], o["ensemble_pct"]) if x is not None]
    if not probs and o["n_modelli"] < 3:
        return {"livello": None, "prob": None, "motivo": "dati insufficienti"}
    p = max(probs) if probs else None
    if (p is not None and p > 50) or o["mm"] >= 0.3:
        livello = 2
    elif (p is not None and p > 20) or o["mm"] >= 0.1 or o["mm_max"] >= 1:
        livello = 1
    else:
        livello = 0
    if livello == 0 and o["n_modelli"] < 3:
        # Un "ok" basato su 1-2 modelli non è abbastanza solido da consigliare un orario.
        return {"livello": None, "prob": p, "motivo": "dati insufficienti"}
    return {"livello": livello, "prob": p, "motivo": None}


def combina_ore(punti, prima_ora, alle):
    """punti = [{nome, ore: [ValoriOra]}]. Per ogni ora vale il punto peggiore; un punto mancante rende l'ora incompleta."""
    dati = [(p["nome"], {o["ora"]: o for o in p["ore"]}) for p in punti]
    ore = []
    for ora in range(prima_ora, alle):
        per_punto = [(nome, d.get(ora)) for nome, d in dati]
        valutazioni = [(nome, o, valuta_ora(o)) for nome, o in per_punto]
        mancanti = [nome for nome, _, v in valutazioni if v["livello"] is None]
        validi = [(nome, o, v) for nome, o, v in valutazioni if v["livello"] is not None]
        raffiche = max((o["raffiche"] for _, o, _ in validi if o["raffiche"] is not None), default=None)
        forti = raffiche is not None and raffiche >= RAFFICHE_FORTI
        if mancanti:
            livello, giudizio = None, ("dati incompleti (" + ", ".join(mancanti) + ")") if validi else "dati mancanti"
        else:
            livello = max(v["livello"] for _, _, v in validi)
            giudizio = LIVELLI[livello]
        if forti:
            giudizio += ", raffiche forti"
        probs = [v["prob"] for _, _, v in validi if v["prob"] is not None]
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
    return ore


def fasce(elenco):
    """Raggruppa elementi consecutivi (con "ora") che hanno lo stesso giudizio."""
    gruppi = []
    for o in elenco:
        if gruppi and gruppi[-1]["giudizio"] == o["giudizio"] and gruppi[-1]["alle"] == o["ora"]:
            gruppi[-1]["alle"] = o["ora"] + 1
            gruppi[-1]["_ore"].append(o)
        else:
            gruppi.append({"dalle": o["ora"], "alle": o["ora"] + 1, "giudizio": o["giudizio"],
                           "livello": o["livello"], "raffiche_forti": o["raffiche_forti"], "_ore": [o]})
    for f in gruppi:
        membri = f.pop("_ore")
        pr = [x["prob_max"] for x in membri if x["prob_max"] is not None]
        f["prob_max"] = max(pr) if pr else None
        f["mm_max"] = max((x["mm_max"] for x in membri if x["mm_max"] is not None), default=None)
        f["raffiche_max"] = max((x["raffiche"] for x in membri if x["raffiche"] is not None), default=None)
    return gruppi


def durata_stimata(km):
    """Minuti di viaggio stimati in motorino: km in linea d'aria x 1,3 a 30 km/h, almeno 10."""
    return max(10, arrotonda(km * 1.3 / 30 * 60))


def partenze(punti, durata_min, prima_ora, alle):
    """Per ogni partenza all'ora H (minuti :00): ogni punto si valuta nell'ora in cui ci si passa.

    punti = [{nome, frazione (0 = partenza, 1 = arrivo), ore: [ValoriOra]}].
    Il punto i si raggiunge a H + frazione_i * durata_min / 60 ore. Oltre le 23 il dato non c'è.
    """
    dati = [(p["nome"], p["frazione"], {o["ora"]: o for o in p["ore"]}) for p in punti]
    lista = []
    for H in range(prima_ora, alle):
        attraversate, valutazioni = [], []
        for nome, frazione, ore in dati:
            h = math.floor(H + (frazione * durata_min) / 60)
            if h > 23:
                attraversate.append({"nome": nome, "ora": None})
                valutazioni.append((nome, None, valuta_ora(None)))
            else:
                attraversate.append({"nome": nome, "ora": h})
                o = ore.get(h)
                valutazioni.append((nome, o, valuta_ora(o)))
        mancanti = [nome for nome, _, v in valutazioni if v["livello"] is None]
        validi = [(o, v) for _, o, v in valutazioni if v["livello"] is not None]
        raffiche = max((o["raffiche"] for o, _ in validi if o["raffiche"] is not None), default=None)
        forti = raffiche is not None and raffiche >= RAFFICHE_FORTI
        if mancanti:
            livello, giudizio = None, ("dati incompleti (" + ", ".join(mancanti) + ")") if validi else "dati mancanti"
        else:
            livello = max(v["livello"] for _, v in validi)
            giudizio = LIVELLI[livello]
        if forti:
            giudizio += ", raffiche forti"
        probs = [v["prob"] for _, v in validi if v["prob"] is not None]
        lista.append({
            "ora": H, "livello": livello, "giudizio": giudizio, "raffiche_forti": forti,
            "mm": max((o["mm"] for o, _ in validi), default=None),
            "mm_max": max((o["mm_max"] for o, _ in validi), default=None),
            "prob_max": max(probs) if probs else None,
            "raffiche": raffiche,
            "attraversate": attraversate,
        })
    return lista


def consiglio(lista):
    """Orari di partenza consigliati: la fascia ok più lunga senza raffiche forti (a parità, la prima con
    probabilità minore); altrimenti la partenza meno sfavorevole. None se non c'è niente da consigliare."""
    if not lista:
        return None
    gruppi = fasce(lista)
    buone = [f for f in gruppi if f["livello"] == 0 and not f["raffiche_forti"]]
    if buone:
        f = max(buone, key=lambda f: (f["alle"] - f["dalle"], -(f["prob_max"] or 0)))
        return {"consigliabile": True, "dalle": f["dalle"], "alle": f["alle"], "giudizio": f["giudizio"],
                "prob_max": f["prob_max"], "mm_max": f["mm_max"], "raffiche_max": f["raffiche_max"]}
    candidate = [p for p in lista if p["livello"] is not None]
    if not candidate:
        return None
    p = min(candidate, key=lambda x: (x["raffiche_forti"], x["livello"], x["mm"] or 0, x["mm_max"] or 0,
                                      x["prob_max"] or 0, x["ora"]))
    return {"consigliabile": False, "dalle": p["ora"], "alle": p["ora"] + 1, "giudizio": p["giudizio"],
            "prob_max": p["prob_max"], "mm_max": p["mm_max"], "raffiche_max": p["raffiche"]}
