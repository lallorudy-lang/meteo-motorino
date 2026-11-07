# Passi seguiti

1. Letto `~/.claude/skills/meteo-media/SKILL.md`.
2. Date: oggi sabato 2026-11-07, quindi "domani" = domenica 2026-11-08 e "lunedì" = 2026-11-09. Domanda sulla bici per andare al lavoro, quindi ho usato gli orari tipici da pendolare (7-9 e 17-19), come indica la skill.
3. Lanciato lo script (circa 1,2 s):
   `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Bologna" --dal 2026-11-08 --al 2026-11-09 --ore 7-9,17-19`
   - Domenica: 7°/12°, 0 mm, 0/6 modelli e 0/51 simulazioni ensemble con pioggia, affidabilità alta.
   - Lunedì: 7°/11°, mediana 0,7 mm (media 1,8, massimo 8,2 con UKMO), 3/6 modelli e 5/51 simulazioni ensemble con pioggia, affidabilità bassa. Pioggia soprattutto in serata (5/6 modelli). 7-9: mediana 0 mm, prob. fino al 39%. 17-19: mediana 0 mm, prob. fino al 61%.
4. Due ricerche web (WebSearch, modalità extended, lanciate in parallelo):
   - "meteo Bologna domenica 8 lunedì 9 novembre 2026 iLMeteo 3B Meteo": iLMeteo (dom 6/12°, lun 7-8/10-11° con 46-47%), meteo.it (domenica nuvolosa e asciutta dopo le piogge di sabato), Tempoitalia (lun circa 4,8 mm). La pagina 3B Meteo trovata era vecchia ed è stata scartata.
   - "previsioni meteo Emilia-Romagna 9 novembre 2026 perturbazione pioggia allerta": nessuna allerta regionale per il 9/11 (il PDF trovato era di settembre 2026 ed è stato scartato). Una notizia nazionale parla di piogge al Nord tra lunedì 9 e martedì 10.
5. Confronto: le temperature dei siti coincidono con la media dei modelli. Per lunedì Tempoitalia dà più pioggia della mediana dei modelli. L'affidabilità di lunedì resta bassa.
6. Scritta la risposta con il consiglio per la bici (domenica sì; lunedì sì con la giacca antipioggia per il ritorno) e l'invito a ricontrollare lunedì mattina.
