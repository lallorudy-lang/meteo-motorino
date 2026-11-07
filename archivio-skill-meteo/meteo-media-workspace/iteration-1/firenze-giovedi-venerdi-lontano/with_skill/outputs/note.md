# Note sui passi fatti

1. Letta la skill `~/.claude/skills/meteo-media/SKILL.md`.
2. Date: oggi è sabato 7/11/2026, quindi giovedì = 12/11 e venerdì = 13/11 (5-6 giorni da oggi, affidabilità attesa bassa). Località: Firenze, nessuna ambiguità.
3. Comando eseguito: `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Firenze" --dal 2026-11-11 --al 2026-11-14` (ho aggiunto mercoledì e sabato come contesto, per un eventuale viaggio il giorno prima o un rientro il giorno dopo).
   - Risultato: a quell'orizzonte rispondono 4 modelli (ECMWF, GFS, ICON, UKMO). Gio 12: 4/4 con pioggia, media 23,3 mm (da 15,4 a 37,3). Ven 13: 4/4, media 25,6 mm (da 20,2 a 32,0). Massime 17-18°, vento massimo 18-23 km/h, affidabilità bassa (5°-6° giorno). La pioggia non dipende da un solo modello: li danno tutti.
4. WebSearch (modalità extended), 3 ricerche in parallelo:
   - "previsioni meteo Firenze giovedì 12 venerdì 13 novembre 2026 iLMeteo 3BMeteo": iLMeteo 16-19° giovedì; meteo.it temporali gio e ven; AccuWeather nuvoloso, 25%. La pagina 3BMeteo era di circa 2 anni fa ed è stata **scartata**.
   - "tendenza meteo prossima settimana perturbazione Italia 12-13 novembre 2026": meteo.it, iLMeteo, greenMe/Meteored, idealista (7/11) e Tempo Italia descrivono una fase perturbata sul Centro-Nord tirrenico il 12-13 e un secondo impulso il 13-15.
   - "meteo Toscana prossimi giorni novembre 2026 allerta pioggia LaMMA": nessuna allerta trovata. Il bollettino MeteoWeb del 3/11 (riferito a ven 6) è stato **scartato** perché si riferisce a giorni passati. Le pagine LaMMA erano in cache con date non verificabili o molto vecchie (Pistoia di 648 giorni fa) e anche il bollettino 6-15 giorni ("stabile fino al 16") non era datato: **non usati** come dati. AnconaToday/Meteored: gli accumuli maggiori sono su Liguria e alta Toscana.
5. Disaccordi riportati nella risposta: AccuWeather (25%) e la possibilità di accumuli minori a Firenze rispetto all'alta Toscana. Affidabilità lasciata "bassa".
6. Scritti `risposta.md` e `note.md`.
