# Passi seguiti

1. Letto `~/.claude/skills/meteo-media/SKILL.md`.
2. Interpretato "prossimi 5 giorni" come sabato 7 - mercoledì 11 novembre 2026 (oggi è sabato 7).
3. Lanciato lo script dei modelli (Open-Meteo, 6 modelli):
   - `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Genova" --dal 2026-11-07 --al 2026-11-11`
   - `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Milano" --dal 2026-11-07 --al 2026-11-11`
   - Per Milano lo script ha scelto Milano (Lombardia). L'alternativa omonima in Umbria è stata scartata.
4. Sommato a mano la pioggia giornaliera: media dei modelli Genova circa 35 mm, Milano circa 9 mm. Fatto anche il totale per ogni modello: 4 modelli su 6 danno più pioggia a Genova. GFS dà poco in entrambe le città; ItaliaMeteo arriva solo a lunedì.
5. Notato il forte disaccordo a Genova lunedì e martedì: Météo-France e UKMO danno 35-39 mm, ECMWF e ICON 4-7 mm. L'ho segnalato, senza presentare la media come sicura.
6. Fatte 3 WebSearch in modalità extended, nello stesso turno:
   - "meteo Genova previsioni 9 10 novembre 2026 pioggia allerta Liguria"
   - "meteo Milano previsioni prossimi giorni novembre 2026 iLMeteo 3bmeteo"
   - "tendenza meteo prossima settimana 9-11 novembre 2026 perturbazione nord Italia"
7. Controllate le date delle pagine. Scartate le pagine MeteoLive (1, 3 e 6 novembre, già passate) e quelle con solo medie climatiche (Dove e Quando, Meteomi). La pagina AllertaLiguria era ferma al 5 novembre, e nella risposta lo dico.
8. Confronto con i siti:
   - Milano: Telepass Moveo conferma sabato con pioggia debole e domenica asciutta.
   - Genova: iLMeteo dà pioggia debole lunedì, quindi meno dei modelli che prevedono pioggia forte. Per questo ho abbassato l'affidabilità di lunedì da alta a media.
   - Contesto: il Quotidiano Nazionale prevede forti precipitazioni al Centro-Nord martedì 10; Meteo.it piogge intense e temporali sul Tirreno mercoledì 11; tendenza di una perturbazione più forte il 12-13.
9. Scritta la risposta seguendo la struttura della skill: tabelle per città, tabella di confronto per modello (serve a rispondere a "dove piove di più"), quadro generale e fonti.

Fonti usate: Open-Meteo; iLMeteo (pagina Genova e notizie); Meteo.it; Quotidiano Nazionale; Genova24; Telepass Moveo; Meteo5; ilMeteo.net; AllertaLiguria.
