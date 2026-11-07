# Meteo Motorino: documento di progetto

Data: 2026-11-07. Stato: bozza da approvare.

## 1. Obiettivo

Un'app web per chi si sposta in motorino. Deve dire **quando conviene partire** da un posto a un altro senza bagnarsi, e **se piove adesso** sul tragitto. Usa fonti serie: modelli meteo, il radar della Protezione Civile e i pluviometri ufficiali.

**Utente:** una sola persona, l'autore della richiesta, non tecnica e italiana. La usa soprattutto dal telefono, fuori casa, e anche dal Mac.

**Successo:**
- in meno di 10 secondi dall'apertura vede il momento migliore per partire sul suo tragitto e la pioggia reale in corso;
- i numeri coincidono con quelli della skill `meteo-media`, che usa la stessa logica;
- quando un dato manca o una fonte non risponde, l'app lo dice e non inventa mai.

**Requisiti dati dall'utente:**
- telefono e Mac;
- nessun avviso o notifica: si apre quando serve;
- quattro funzioni: quando partire (A→B), pioggia adesso, tragitti preferiti, previsione su più giorni;
- strada scelta: app web statica, pubblicata online gratis.

**Fuori dal progetto:**
- notifiche;
- account e sincronizzazione automatica dei preferiti tra dispositivi;
- percorso stradale reale: i punti intermedi restano in linea d'aria e dichiarati come tali;
- uso automatico dei dati dell'Aeronautica Militare, che li riserva (vedi le sue condizioni d'uso): solo link;
- ricerche sui siti di notizie meteo, che restano nella skill in chat.

## 2. Forma del prodotto

- **PWA statica:** HTML, CSS e JavaScript senza framework e senza fase di build. File serviti così come sono. Manifest e service worker la rendono installabile, con icona, e le permettono di aprirsi anche senza rete.
- **Nessun server proprio:** il browser chiama direttamente le fonti. Verifica fatta il 2026-11-07: Open-Meteo, MeteoHub ItaliaMeteo, Open Data Lombardia e `radar-api.protezionecivile.it` rispondono con intestazioni CORS valide. Le tessere WMS del radar sono immagini e non hanno bisogno di CORS.
- **Pubblicazione:** repository GitHub e GitHub Pages. Il login GitHub lo fa l'utente. Prima di pubblicare serve la sua conferma esplicita.
- **Librerie esterne:**
  - Leaflet 1.9.4, da unpkg con SRI;
  - geotiff.js, per leggere i GeoTIFF del radar. Versione bloccata e SRI, se l'uso viene confermato dalla verifica V1.
- **Cartina:** tessere OpenStreetMap (la pagina è servita via HTTPS, quindi il Referer è valido), con attribuzione visibile.

## 3. Schermate

**Barra in alto:** tragitti preferiti come pulsanti ("Casa → Lavoro") e pulsante **📍 Qui**, che usa la posizione del dispositivo come partenza. Chiede il permesso e la posizione non esce mai dal browser, tranne come coordinate inviate alle API meteo.

### 3.1 Partenza (quando partire)

- **Campi:** Da, A (facoltativo), Giorno (oggi, domani, dopodomani o data). Fascia oraria predefinita 6-23, modificabile.
- **Nomi ambigui:** se una località ha omonimi, l'app fa scegliere quale usare.
- **Risultato:**
  - momento migliore, oppure "Nessuna fascia davvero buona" con l'ora meno sfavorevole;
  - fasce della giornata;
  - mappa con le gocce e barra delle ore, come nella skill attuale;
  - tabella ora per ora con mm (mediana e massimo), probabilità, ensemble, raffiche, temperatura e numero di modelli disponibili;
  - affidabilità e note (dati incompleti, punti intermedi indicativi).
- **Preferiti:** il pulsante ☆ salva il tragitto.

### 3.2 Adesso (pioggia reale)

- **Mappa del tragitto** (o della posizione) con sopra il livello radar della Protezione Civile:
  - `radar:sri`, intensità attuale in mm/h;
  - a scelta `radar:srt1`, `srt3`, `srt6`, `srt12`, `srt24`, cioè gli accumuli.
- **Animazione** degli ultimi 60 minuti per l'intensità, un fotogramma ogni 5 minuti. L'ora di ogni fotogramma è sempre visibile.
- **Valori per ogni punto del tragitto:** mm nell'ultima ora (SRT1) e nelle ultime 3, 6 e 24 ore, con l'ora del prodotto. Letti dai GeoTIFF del radar, se la verifica V1 va bene.
- **Pluviometri vicini:** la stazione più vicina, entro 10 km, per partenza e arrivo, presa da MeteoHub e, dove serve, da ARPA Lombardia o ARPA Piemonte. Per ognuna nome, distanza, ultima misura in mm e ora della misura.
- **Aggiornamento:** pulsante "Aggiorna" e aggiornamento automatico ogni 5 minuti mentre la scheda è aperta.

### 3.3 Più giorni

Si sceglie una città e un intervallo, fino a 16 giorni. Per ogni giorno la tabella mostra:
- tempo;
- minima e massima;
- pioggia in mm (mediana, media, massimo);
- modelli con almeno 1 mm;
- ensemble con almeno 1 mm;
- vento;
- affidabilità;
- avviso quando i modelli sono molto divisi.

### 3.4 Link utili

- Aeronautica Militare (meteoam.it);
- radar e bollettini della Protezione Civile;
- allerte dell'ARPA della regione.

Sono solo link.

## 4. Architettura

File in `app/` (radice pubblicata):

| File | Compito | Dipende da |
|---|---|---|
| `index.html`, `stile.css` | Struttura e stile, schede, mobile-first | — |
| `motore.js` | Funzioni pure: intervalli orari, `valutaOra`, fasce, momento migliore, affidabilità, ensemble, avvisi "modelli divisi". Nessun accesso alla rete | — |
| `fonti/openmeteo.js` | Geocodifica, previsioni multi-modello (orarie e giornaliere), ensemble ECMWF | `fetch` |
| `fonti/radar.js` | Ultimo timestamp (`findLastProductByType`), livelli WMS e tempi per l'animazione, valore in un punto dal GeoTIFF (`downloadProduct` e URL S3 firmato) | `fetch`, geotiff.js |
| `fonti/pluviometri.js` | Stazioni vicine e ultime misure: MeteoHub, ARPA Lombardia, ARPA Piemonte | `fetch` |
| `preferiti.js` | Salvataggio su `localStorage`, esportazione e importazione come testo da copiare e incollare | — |
| `viste/partenza.js`, `viste/adesso.js`, `viste/giorni.js` | Le tre schede | moduli sopra |
| `viste/mappa.js` | Mappa Leaflet: gocce per punto e ora, livello radar, punti intermedi | Leaflet |
| `sw.js`, `manifest.json`, icone | Installazione e apertura senza rete (guscio e ultimo risultato salvato) | — |

Moduli ES caricati nativamente, senza bundler. Nessun dato personale nel repository.

### 4.1 Regole del motore (devono restare identiche alla skill)

Riprese da `meteo-media/scripts/previsioni.py`, già approvato da Codex il 2026-11-07:

- **Orari:** il dato Open-Meteo dell'orario T (pioggia, probabilità, raffiche) si riferisce all'intervallo [T−1h, T). Per coprire 23-24 serve anche la mezzanotte successiva. La temperatura è quella istantanea all'inizio dell'intervallo.
- **Valore per ogni punto e ogni ora:** mediana tra i 6 modelli per mm, probabilità e raffiche, più il massimo dei mm e il numero di modelli disponibili. L'ensemble indica la quota di 51 membri con almeno 0,1 mm in quell'ora.
- **Giudizio (`valutaOra`):**
  - pioggia probabile: probabilità oltre il 50% (massimo tra modelli ed ensemble) oppure mediana di almeno 0,3 mm;
  - a rischio: probabilità oltre il 20%, oppure mediana di almeno 0,1 mm, oppure massimo di almeno 1 mm;
  - ok: altrimenti, ma solo con almeno 3 modelli. Con meno di 3 il risultato è "dati insufficienti";
  - "dati insufficienti" anche quando mancano le probabilità e i modelli sono meno di 3;
  - raffiche forti: da 45 km/h in su.
- **Tragitto:** per ogni ora vale il livello peggiore tra i punti. Se manca anche un solo punto l'ora diventa "dati incompleti" e non è mai "ok".
- **Momento migliore:** la fascia "ok" più lunga senza raffiche forti. Se non c'è, l'ora meno sfavorevole, ordinata per (raffiche forti, livello, mm, mm massimo, probabilità), con la scritta "Nessuna fascia davvero buona".
- **Punti intermedi:** circa uno ogni 15 km in linea d'aria, al massimo 5. Tragitti tra fusi orari con scarto UTC diverso: rifiutati.
- **Più giorni:** affidabilità alta, media o bassa come nella skill, con la promozione e la retrocessione dell'ensemble e la soglia di almeno 1 mm al giorno. "Oggi" e le ore già passate si calcolano nel fuso della località.

### 4.2 Flusso dei dati

- **Partenza:**
  1. geocodifica di Da e A;
  2. punti intermedi;
  3. per ogni punto, in parallelo (al massimo 4 alla volta), le previsioni orarie dei 6 modelli e l'ensemble orario;
  4. `motore`;
  5. vista e mappa.
- **Adesso:**
  1. `findLastProductByType` per SRI e SRT1/CUM;
  2. livello WMS con il parametro `time`;
  3. per ogni punto, GeoTIFF e lettura del pixel (V1);
  4. pluviometri entro 10 km.
- **Più giorni:** previsioni giornaliere e orarie, poi ensemble giornaliero, poi motore, poi tabella.
- **Cache:** l'ultimo risultato di ogni scheda viene salvato in `localStorage` con l'orario. Senza rete compare con l'avviso "dati delle ore HH:MM".

## 5. Errori

- Ogni fonte ha un timeout (15 s) e un errore leggibile. Il resto della pagina continua a funzionare. Le fonti non disponibili si elencano in una nota.
- Mai valori inventati: un dato assente si mostra come "—" o "dati mancanti".
- Senza connessione: avviso in testa, ultimo risultato salvato e barra delle ore funzionante.
- Leaflet non caricato: avviso al posto della mappa, il resto funziona (come nella skill).
- Geolocalizzazione negata: si chiede di scrivere la città.
- Date oltre l'orizzonte o già passate: messaggio chiaro, come nella skill.

## 6. Verifiche da fare per prime (spike)

| # | Domanda | Se va male |
|---|---|---|
| V1 | Il GeoTIFF del radar (URL S3 firmato) si legge dal browser con geotiff.js: CORS del bucket, proiezione e unità? | Niente mm del radar nel punto: solo l'immagine del radar e i pluviometri |
| V2 | Endpoint MeteoHub per le ultime misure dei pluviometri vicino a un punto (formato, latenza, regioni coperte) | Solo le ARPA disponibili |
| V3 | ARPA Piemonte (API realtime): CORS e formato | Solo MeteoHub e ARPA Lombardia per il Piemonte |
| V4 | WMS radar con il parametro `time` per l'animazione: tempi disponibili e coerenza con `findLastProductByType` | Solo l'immagine più recente, senza animazione |

## 7. Prove

- **Motore:** prove automatiche con `node --test`, nessuna dipendenza. Si riportano i 17 casi della skill e se ne aggiungono altri: ore DST, tragitto con un punto mancante, nessuna fascia buona, raffiche, affidabilità con ensemble discorde.
- **Coerenza con la skill:** stessi dati in ingresso, stesso giudizio per ora. Si verifica salvando una risposta JSON reale come caso di prova.
- **Fonti:** prove con risposte registrate (fixture JSON) per ciascuna fonte, compresi errori e serie corte.
- **Browser:** le tre schede al computer, a 375 px e a 320 px. Tastiera e lettore di schermo sulla barra delle ore. Niente rete. Nomi con caratteri speciali.
- **Revisione:** controllo di Codex prima della pubblicazione.

## 8. Licenze e attribuzioni

- **Open-Meteo:** dati CC BY 4.0, uso non commerciale gratuito. Attribuzione nell'app.
- **Protezione Civile Radar-DPC:** prodotti in Open Access, attribuzione alla fonte. La licenza esatta va verificata nella documentazione ufficiale e riportata nell'app.
- **ItaliaMeteo, ARPA Lombardia, ARPA Piemonte:** open data con le rispettive licenze, citate nell'app.
- **OpenStreetMap:** attribuzione visibile, rispetto della policy sulle tessere (uso personale, cache normale del browser, niente scaricamento in massa).
- **Aeronautica Militare:** nessun dato usato, solo link.

## 9. Pubblicazione

1. Repository git locale in `~/Desktop/Meteo-Motorino`.
2. L'utente esegue `gh auth login`.
3. Creazione del repository GitHub e attivazione di Pages sulla cartella `app/`, **solo dopo la conferma dell'utente**.
4. Indirizzo finale `https://<utente>.github.io/meteo-motorino/`. Va aperto sul telefono e installato con "Aggiungi a schermata Home".

## 10. Rapporto con la skill

La skill `meteo-media` resta per le domande in chat: fa anche le ricerche web e crea la mappa. Le regole del motore sono le stesse in Python e in JavaScript. Un cambiamento alle regole va fatto in entrambi, con le stesse prove.
