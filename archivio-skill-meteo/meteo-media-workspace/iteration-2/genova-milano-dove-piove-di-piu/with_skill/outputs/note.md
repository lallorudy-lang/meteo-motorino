# Note sui passi seguiti

1. Letto `~/.claude/skills/meteo-media/SKILL.md`. Non ho aperto la cartella evals/.
2. Periodo: "prossimi 5 giorni" da sabato 7 novembre 2026, quindi da domenica 8 a giovedì 12 novembre.
3. Lanciato lo script (circa 1 secondo per città, dati Open-Meteo):
   - `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Genova" --dal 2026-11-08 --al 2026-11-12`
   - `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Milano" --dal 2026-11-08 --al 2026-11-12` (scelta Milano, Lombardia; lo script segnala anche una Milano in Umbria)
4. Confronto pioggia: somma delle mediane giornaliere. Genova 0,1+6,3+5,5+5,7+41,0 = 58,6 mm. Milano 0+1,2+3,2+0,3+4,3 = 9,0 mm.
5. Fatte 3 ricerche WebSearch (modalità extended), lanciate in parallelo:
   - "meteo Genova prossimi giorni 9 10 11 12 novembre 2026 ilmeteo 3bmeteo"
   - "meteo Milano prossimi giorni novembre 2026 pioggia ilmeteo 3bmeteo meteo.it"
   - "allerta meteo Liguria perturbazione novembre 2026 ARPAL"
6. Controllate le date delle pagine. Scartate: la pagina Meteored (vecchia), la pagina iLMeteo generica senza data di aggiornamento e l'articolo ARPAL "allerta 22-23 novembre" (di un altro anno). Usate: iLMeteo Genova (articolo e bollettino del 6/11/2026), Meteogiornale, 3B Meteo Milano, Il Giorno, AllertaLiguria (nessuna allerta al 3-5/11).
7. Scritta la risposta in italiano con una tabella per città, mm per ogni giorno, il confronto finale e i link alle fonti.
