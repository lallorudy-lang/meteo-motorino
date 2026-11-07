# V0 sul telefono: da fare dopo la pubblicazione

La misura sul Mac (`docs/superpowers/verifiche/V0.md`) è fatta in Node. La prova decisiva è sul telefono,
in rete mobile, con l'app pubblicata. Serve circa un quarto d'ora.

## Prima di tutto

1. Apri l'indirizzo pubblicato sul telefono (per esempio `https://<utente>.github.io/meteo-motorino/`).
2. Chiudi le altre schede del browser e disattiva il Wi-Fi: resta solo la rete mobile.

## Tempi (rete mobile, cache vuota)

Usa un cronometro. Ricarica la pagina e cancella i dati locali prima di ogni prova (Impostazioni → Cancella dati locali).

| Prova | Cosa fare | Tempo accettabile | Tempo misurato |
|---|---|---|---|
| Partenza | Da: Torino, A: Milano, durata 90 | risultato visibile entro 10 s | ____ s |
| Partenza, ricalcolo | Premi Calcola una seconda volta | entro 5 s | ____ s |
| Più giorni | Città: Genova, cinque giorni | tabella entro 10 s | ____ s |

Se un tempo supera il limite, annotalo e dimmelo: si riduce il numero di richieste in parallelo.

## Funzioni da provare

- **Omonimi:** scrivi "Torino" e "Milano": la pagina deve chiedere di scegliere, e calcolare solo dopo.
- **Preferiti:** salva il tragitto con ☆, chiudi la pagina, riaprila: il preferito ricalcola con un tocco.
- **Storico:** con il telefono in aereo (rete spenta), riapri la pagina: deve comparire l'ultimo risultato
  con la scritta "Storico del …".
- **Installazione:** "Aggiungi a schermata Home" (su iPhone dal menu Condividi; su Android dal menu del browser).
  L'icona deve aprire l'app a schermo intero.
- **Cancella dati locali:** deve chiedere conferma e poi svuotare preferiti e storico.
- **Schermo stretto:** le schede scorrono di lato, la pagina non si allarga.

## Da segnare

- Sistema operativo e browser: ____________
- Esito di ogni riga sopra, con i tempi.
- Qualsiasi errore o avviso strano: copia il testo o fai una foto.
