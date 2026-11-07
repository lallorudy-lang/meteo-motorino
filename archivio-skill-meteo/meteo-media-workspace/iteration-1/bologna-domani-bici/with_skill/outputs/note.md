# Passi seguiti

1. Letto `~/.claude/skills/meteo-media/SKILL.md`.
2. Date: oggi è sabato 2026-11-07, quindi "domani" = domenica 2026-11-08 e "lunedì" = 2026-11-09.
3. Script: `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Bologna" --dal 2026-11-08 --al 2026-11-09`
   - Dom 8: nuvoloso e asciutto, 0/6 modelli con pioggia, 7°/12°, affidabilità alta.
   - Lun 9: pioggia debole, media 1,8 mm (UKMO 8,2 mm, gli altri 0-1,1 mm), 3/6 modelli ≥1 mm, 7°/11°, affidabilità bassa.
4. Rilanciato con `--json` per cercare dati orari (non ci sono: solo totali giornalieri) e probabilità di pioggia (16-61% lunedì). Letto `--help`.
5. Tre WebSearch (modalità extended) mandate insieme:
   - "meteo Bologna domenica 8 lunedì 9 novembre 2026 iLMeteo 3B Meteo": iLMeteo Dom 6°/12°, Lun 8°/10° 47%; meteo.it nuvoloso. La pagina 3B Meteo era vecchia (scartata).
   - "previsioni meteo Italia tendenza 9 novembre 2026 perturbazione pioggia nord": prime pioviggini al Nord lunedì, peggioramento tra il 10 e il 13 al Centro-Nord (fonti del 6-7 novembre).
   - "ARPAE Emilia-Romagna bollettino meteo allerta 8 novembre 2026": nessuna allerta regionale aggiornata trovata. Il bollettino nazionale del 6/11 non nomina l'Emilia-Romagna per l'8.
6. Seguita la regola della skill sul modello isolato: la pioggia di lunedì è presentata come "possibile e debole; solo UKMO la dà più forte", senza dare la media come sicura.
7. Scritta la risposta in italiano con un consiglio per la bici per ciascun giorno.
