# Passi eseguiti

1. Letto `~/.claude/skills/meteo-media/SKILL.md` (cartella evals/ non consultata).
2. Domande saltate: la richiesta conteneva già il luogo (tragitto Torino → Moncalieri) e il giorno (domani = dom 8/11/2026), come prevede la skill.
3. Comando (durata 2 s):
   `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --giornata domani --verso "Moncalieri"`
   Risultato: 06-23 tutto "ok", probabilità massima 5% (09-10), 0,0 mm di mediana (massimo 0,2 mm), raffiche fino a 11 km/h, 8-12°. Partenza scelta: Torino (Piemonte), con omonimo in Emilia-Romagna segnalato dallo script.
4. Caricato WebSearch con ToolSearch "select:WebSearch".
5. 3 ricerche web in parallelo (modalità extended):
   - "meteo Torino domenica 8 novembre 2026 previsioni iLMeteo 3BMeteo"
   - "meteo Moncalieri domani 8 novembre 2026"
   - "Piemonte nebbia allerta previsioni 8 novembre 2026 Arpa Piemonte Nimbus"
   Siti d'accordo sul tempo asciutto (7-13°); Nimbus e iLMeteo parlano di nebbie locali; nessuna allerta trovata; pioggia debole la notte tra sabato e domenica (prima delle 6). Scartata la pagina MeteoWeb, segnalata come vecchia.
6. Scritta la risposta (formato 2A della skill) in risposta.md.
