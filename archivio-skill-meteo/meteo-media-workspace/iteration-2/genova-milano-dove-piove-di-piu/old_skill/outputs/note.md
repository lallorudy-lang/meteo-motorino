# Note sui passi seguiti

1. Letto `skill-snapshot/SKILL.md`. Periodo: "prossimi 5 giorni" interpretato come sabato 7 - mercoledì 11 novembre 2026 (oggi incluso).
2. Script dei modelli (circa 5 secondi in tutto):
   - `python3 skill-snapshot/scripts/previsioni.py "Genova" --dal 2026-11-07 --al 2026-11-11`
   - `python3 skill-snapshot/scripts/previsioni.py "Milano" --dal 2026-11-07 --al 2026-11-11` (scelta Milano, Lombardia; lo script segnalava anche Milano, Umbria)
3. Totali dei 5 giorni calcolati a mano dalla riga "pioggia per modello":
   - Genova: media circa 35 mm. Per modello: ECMWF 19.8, GFS 1.9, ICON 17.2, Météo-France 72.6 (4 giorni), UKMO 73.2, ItaliaMeteo 1.3 (3 giorni).
   - Milano: media circa 9 mm. Per modello: ECMWF 8.4, GFS 4.2, ICON 12.2, Météo-France 8.6 (4 giorni), UKMO 10.8, ItaliaMeteo 6.3 (3 giorni).
   - A Genova la media è gonfiata da due modelli (MF e UKMO). L'ho scritto nella risposta e ho abbassato a "media" l'affidabilità di lunedì 9 (lo script dava "alta"), perché anche iLMeteo parla di pioggia debole.
4. Tre WebSearch (modalità extended) lanciate in parallelo:
   - "meteo Genova prossimi giorni 9 10 novembre 2026 pioggia allerta" → iLMeteo (weekend con nubi sparse, lunedì pioggia debole), 3B Meteo, meteo.it, GenovaToday
   - "meteo Milano previsioni 7-11 novembre 2026" → Telepass Moveo (piogge deboli residue sabato, domenica migliora), Meteo5 (senza data, mercoledì 11 circa 3,5 mm). Pagine MeteoLive e TempoItalia scartate perché di giorni passati.
   - "perturbazione nord Italia Liguria allerta meteo ARPAL novembre 2026" → AllertaLiguria: nessuna allerta in corso (aggiornamento del 5/11). Scartati gli articoli ARPAL del 2025 e quello di Velvet Mag del 2/11, non confermato.
5. Scritta la risposta finale in `risposta.md`, seguendo la struttura della skill.
