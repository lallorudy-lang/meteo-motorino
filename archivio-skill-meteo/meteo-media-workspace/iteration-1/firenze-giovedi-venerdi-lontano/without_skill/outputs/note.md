# Passi seguiti

1. Date ricavate: oggi è sabato 2026-11-07, quindi giovedì = 2026-11-12 e venerdì = 2026-11-13 (5-6 giorni di anticipo).
2. `curl` all'API Open-Meteo forecast (Firenze 43.77N 11.26E, timezone Europe/Rome), dati giornalieri dal 07 al 14/11: weather_code, precipitation_sum, precipitation_probability_max, temperature min/max, vento.
   - Gio 12: codice 95 (temporale), 21.8 mm, 90%, 15.7-18.4 °C
   - Ven 13: codice 95, 20.2 mm, 92%, 14.6-17.5 °C
3. `curl` a Open-Meteo con i singoli modelli per confrontarli:
   - ECMWF IFS: 18.8 / 27.0 mm, 24 h di pioggia su 24
   - GFS: 37.3 / 23.1 mm
   - ICON: 21.6 / 20.2 mm
   - Météo-France: nessun dato a questa distanza
4. `curl` all'API ensemble di Open-Meteo (ECMWF IFS, 51 membri): pioggia > 1 mm in 51 membri su 51 per entrambi i giorni; media 15.2 mm (gio) e 24.9 mm (ven).
5. Conclusione: pioggia quasi certa in entrambi i giorni, quantità e orari ancora incerti. Ho consigliato di ricontrollare mercoledì sera (CFR Toscana per eventuali allerte).

Non ho usato WebSearch né la skill meteo-media.
