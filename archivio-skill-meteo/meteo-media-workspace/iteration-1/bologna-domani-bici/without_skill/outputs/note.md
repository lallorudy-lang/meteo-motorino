# Note sui passaggi

1. Nessuna skill usata (baseline run). Nessuna WebSearch: dati presi direttamente dall'API Open-Meteo con curl.
2. `curl` Open-Meteo /v1/forecast, Bologna (44.4949, 11.3426), timezone Europe/Rome, 2026-11-08 → 2026-11-09: dati orari (temperatura, probabilità e quantità di pioggia, vento, raffiche, weather code) e giornalieri (modello predefinito best_match).
3. `curl` Open-Meteo con `models=ecmwf_ifs025,icon_seamless,gfs_seamless,italia_meteo_arpae_icon_2i`: pioggia oraria negli orari da pendolare (7-9, 17-19), filtrata con un breve script python.
4. `curl` dello stesso confronto tra modelli sui totali giornalieri (pioggia, minime e massime).
5. Sintesi: domenica asciutta in tutti i modelli; lunedì 0-1 mm, concentrati a metà giornata; nebbia (codice WMO 45) da lunedì sera. Ho fatto notare che domani è domenica.

Fonti: api.open-meteo.com (ECMWF IFS 0.25°, DWD ICON, NOAA GFS, ICON-2I ARPAE/Italia Meteo).
