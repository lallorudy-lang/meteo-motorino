# Passi seguiti

1. Nessuna skill usata (baseline). Nessuna ricerca web: ho usato direttamente l'API pubblica gratuita di Open-Meteo.
2. `curl` su `https://api.open-meteo.com/v1/forecast` per Genova (44.4056, 8.9463) e Milano (45.4642, 9.19), `forecast_days=5`, `timezone=Europe/Rome`, dati giornalieri: weather_code, temperature_2m_max/min, precipitation_sum, precipitation_probability_max, precipitation_hours, wind_speed_10m_max. Modello di riferimento ("best match").
3. Seconda chiamata `curl` con `models=ecmwf_ifs025,icon_eu,meteofrance_seamless` (solo precipitation_sum) per verificare se i modelli sono d'accordo; totali calcolati con un piccolo script python3.
4. Codici WMO tradotti a mano (3 coperto, 45 nebbia, 61 pioggia debole, 80 rovesci, 95 temporale); totali di pioggia sommati sui 5 giorni (sab 7 - mer 11 novembre 2026).
5. Risultato: Genova 15,8 mm contro Milano 11,8 mm (best match); ECMWF e Météo-France confermano Genova, ICON-EU le dà quasi pari.
