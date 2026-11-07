# Meteo Motorino: documento di progetto

Data: 2026-11-07. Stato: bozza da approvare (versione 2, corretta dopo la revisione di Codex 73E2).

## 1. Obiettivo

Un'app web per chi si sposta in motorino. Deve dire **a che ora conviene partire** da un posto a un altro per non bagnarsi lungo il viaggio, e **se piove adesso** sul tragitto. Usa fonti serie: modelli meteo, il radar della Protezione Civile e i pluviometri ufficiali.

**Utente:** una sola persona, l'autore della richiesta, non tecnica e italiana. La usa soprattutto dal telefono, fuori casa, e anche dal Mac.

**Successo:**
- su rete mobile, con la cache vuota, il momento migliore per partire compare **entro 10 secondi** dall'apertura di un preferito. Il radar può arrivare dopo, senza bloccare il resto. Il tempo si misura nella verifica V0;
- i giudizi coincidono con quelli della skill `meteo-media`: stessi dati in ingresso, stessi risultati, garantiti dalle prove condivise del §7;
- quando un dato manca, è vecchio o una fonte non risponde, l'app lo dice e non inventa mai.

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
- **Nessun server proprio:** il browser chiama direttamente le fonti. Verifica fatta il 2026-11-07 con curl e un'intestazione Origin: Open-Meteo, il catalogo MeteoHub, Open Data Lombardia e `radar-api.protezionecivile.it` rispondono con intestazioni CORS. Le tessere WMS del radar sono immagini e non hanno bisogno di CORS. **Questo non basta a dimostrare** l'accesso dal browser ai dati finali (preflight, URL S3, misure dei pluviometri): lo verificano V1-V3.
- **Pubblicazione:** repository GitHub e GitHub Pages, tramite un workflow di GitHub Actions che pubblica la cartella `app/`. Il login GitHub lo fa l'utente. Prima di pubblicare serve la sua conferma esplicita.
- **Librerie esterne:**
  - Leaflet 1.9.4, da unpkg con SRI;
  - geotiff.js, con versione bloccata e SRI, solo se V1 va bene.
- **Cartina:** tessere OpenStreetMap con attribuzione visibile. Referrer-Policy `strict-origin-when-cross-origin`, così le tessere ricevono un Referer valido senza l'indirizzo completo della pagina.
- **Una sola fonte delle regole:** il sorgente della skill `meteo-media` viene spostato nel progetto (`skill/meteo-media/`). `~/.claude/skills/meteo-media` diventa un collegamento a quella cartella. Così regole Python, regole JavaScript e prove condivise stanno nello stesso repository.

## 3. Schermate

**Barra in alto:** tragitti preferiti come pulsanti ("Casa → Lavoro") e pulsante **📍 Qui**, che usa la posizione del dispositivo come partenza.

### 3.1 Partenza (a che ora partire)

- **Campi:**
  - Da, A (facoltativo);
  - Giorno (oggi, domani, dopodomani o data);
  - **Durata del viaggio** in minuti: stimata da sola (km in linea d'aria × 1,3 a 30 km/h, almeno 10 minuti), modificabile, salvata con il preferito;
  - fascia oraria predefinita 6-23, modificabile.
- **Nomi ambigui:** se una località ha omonimi, l'app fa scegliere quale usare.
- **Partenza buona** (regola nuova, §4.1): una partenza all'ora H è buona solo se **ogni punto del tragitto** è "ok" nell'ora in cui ci passi, cioè all'ora H più la frazione di durata necessaria per arrivarci.
- **Risultato:**
  - **orari di partenza consigliati**, per esempio "parti tra le 12 e le 15", oppure "Nessun orario davvero buono" con quello meno sfavorevole;
  - fasce meteo della giornata;
  - mappa con le gocce e barra delle ore;
  - tabella ora per ora con mm (mediana e massimo), probabilità, ensemble, raffiche, temperatura e numero di modelli;
  - affidabilità;
  - note: dati incompleti, punti intermedi indicativi, ensemble assente.
- **Preferiti:** il pulsante ☆ salva il tragitto con la sua durata.

### 3.2 Adesso (pioggia reale)

- **Mappa del tragitto** (o della posizione) con sopra il livello radar della Protezione Civile:
  - `radar:sri`, intensità attuale in mm/h;
  - a scelta `radar:srt1`, `srt3`, `srt6`, `srt12`, `srt24`, cioè gli accumuli.
- **Animazione** degli ultimi 60 minuti per l'intensità, un fotogramma ogni 5 minuti, con l'ora di ogni fotogramma sempre visibile. Realizzata dopo V4.
- **Valori per ogni punto del tragitto:** mm nell'ultima ora (SRT1) e nelle ultime 3, 6 e 24 ore, con data e ora del prodotto. Letti dai GeoTIFF del radar dopo V1. Un solo file per prodotto e orario, condiviso tra tutti i punti. **"Fuori copertura" o "dato mancante" (NoData) si distingue sempre da "0 mm".**
- **Pluviometri vicini** (§4.3):
  - la stazione più vicina **con una misura valida e recente**, entro 10 km da partenza e arrivo;
  - si mostrano nome, distanza, mm, **intervallo della misura** (per esempio "dalle 13:00 alle 14:00") e ora;
  - si confronta con SRT1 solo se l'intervallo è lo stesso.
- **Aggiornamento:** pulsante "Aggiorna" e aggiornamento automatico ogni 5 minuti mentre la scheda è aperta e visibile.

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

### 3.4 Privacy, prima del primo uso di "📍 Qui"

Una schermata breve spiega:
- **dove vanno le coordinate:**
  - alle API meteo (Open-Meteo e ItaliaMeteo);
  - le tessere della cartina e del radar rivelano la zona mostrata;
  - Open-Meteo dichiara di poter conservare le coordinate nei log fino a 90 giorni;
- **cosa resta sul dispositivo:** preferiti e ultimi risultati, con le coordinate.

Nelle impostazioni c'è il pulsante **"Cancella dati locali"**. Nessuna coordinata compare negli URL della pagina, nel repository o nei casi di prova pubblici, che usano città generiche.

### 3.5 Link utili

- Aeronautica Militare (meteoam.it);
- radar e bollettini della Protezione Civile;
- allerte dell'ARPA della regione.

Sono solo link.

## 4. Architettura

File in `app/` (pubblicata dal workflow):

| File | Compito | Dipende da |
|---|---|---|
| `index.html`, `stile.css` | Struttura e stile, schede, mobile-first | — |
| `motore.js` | Funzioni pure del §4.1. Nessun accesso alla rete | — |
| `fonti/openmeteo.js` | Geocodifica, previsioni multi-modello (orarie e giornaliere), ensemble ECMWF | `rete.js` |
| `fonti/radar.js` | Ultimi orari (`findLastProductByType`), livelli WMS e tempi, valori nei punti dal GeoTIFF (§4.4) | `rete.js`, geotiff.js |
| `fonti/pluviometri.js` | Stazioni vicine e misure normalizzate (§4.3): MeteoHub, ARPA Lombardia, ARPA Piemonte | `rete.js` |
| `rete.js` | `fetch` con timeout, deduplicazione delle richieste uguali, gestione 429 (§8) | — |
| `freschezza.js` | Età dei dati e stato attuale, vecchio o storico (§5.1) | — |
| `preferiti.js` | `localStorage`, esportazione e importazione con copia e incolla, cancellazione dei dati locali | — |
| `viste/partenza.js`, `viste/adesso.js`, `viste/giorni.js`, `viste/mappa.js` | Schermate e mappa Leaflet | moduli sopra |
| `sw.js`, `manifest.json`, icone | Installazione e apertura senza rete: precache solo dei file dell'app, mai delle tessere | — |

Tutti i percorsi sono relativi (asset, manifest, scope del service worker), così l'app funziona sotto `/meteo-motorino/`.

### 4.1 Regole del motore (il "contratto", identico in Python e JavaScript)

Riprese da `previsioni.py`, approvato da Codex (W8EA), con le precisazioni in grassetto.

- **Orari:** il dato Open-Meteo dell'orario T (pioggia, probabilità, raffiche) si riferisce all'intervallo [T−1h, T). Per coprire 23-24 serve anche la mezzanotte successiva. La temperatura è quella istantanea all'inizio dell'intervallo.
- **Arrotondamento:** si arrotonda **alla pari** ("half-even", come `round` di Python). In JavaScript con una funzione `arrotonda()` del motore, mai con `Math.round`. Mediane e medie si calcolano sui valori non arrotondati, e si arrotonda solo alla fine (mm a 0,1; percentuali e °C all'intero).
- **Valori mancanti:** `null` non si conta e non vale zero. I modelli disponibili sono quelli con un valore non nullo per quella variabile e quell'ora.
- **Valore per ogni punto e ogni ora:**
  - mediana tra i modelli disponibili per mm, probabilità e raffiche;
  - massimo dei mm;
  - numero di modelli disponibili;
  - ensemble: quota di membri con almeno 0,1 mm in quell'ora, **sul numero di membri disponibili, non sempre 51**.
- **Probabilità usata nel giudizio:** il **massimo tra la mediana delle probabilità dei modelli e la quota dell'ensemble**, contando solo quelle disponibili.
- **Giudizio (`valutaOra`):**
  - pioggia probabile: probabilità oltre il 50% oppure mediana di almeno 0,3 mm;
  - a rischio: probabilità oltre il 20%, oppure mediana di almeno 0,1 mm, oppure massimo di almeno 1 mm;
  - ok: altrimenti, ma solo con almeno 3 modelli. Con meno di 3 il risultato è "dati insufficienti";
  - "dati insufficienti" anche quando mancano le probabilità e i modelli sono meno di 3;
  - raffiche forti: da 45 km/h in su.
  - Le soglie sono "oltre" (>) per le probabilità e "almeno" (≥) per mm e raffiche, applicate ai valori **già arrotondati**.
- **Ora meteo del tragitto:** per ogni ora vale il livello peggiore tra i punti. Se manca un punto: "dati incompleti", mai "ok".
- **Partenza (nuova, da aggiungere anche in Python):**
  - il punto i, alla frazione f_i del tragitto, si raggiunge all'ora H + f_i × durata;
  - una partenza all'ora H (minuti :00) è "ok" se ogni punto è "ok" nell'ora meteo che contiene quel momento, e nessuna di quelle ore ha raffiche forti;
  - il livello di una partenza è il peggiore tra quelle ore.
- **Orari di partenza consigliati:** la fascia più lunga di partenze "ok". Se non c'è, la partenza meno sfavorevole, ordinata per (raffiche forti, livello, mm, mm massimo, probabilità, ora più presto), con la scritta "Nessun orario davvero buono".
- **Punti intermedi:** circa uno ogni 15 km in linea d'aria, al massimo 5. Tragitti tra fusi orari con scarto UTC diverso: rifiutati.
- **Più giorni:** affidabilità alta, media o bassa come nella skill, con la promozione e la retrocessione dell'ensemble e la soglia di almeno 1 mm al giorno. "Oggi" e le ore già passate si calcolano nel fuso della località.

### 4.2 Flusso dei dati

- **Partenza:**
  1. geocodifica di Da e A;
  2. punti intermedi;
  3. per ogni punto, previsioni orarie dei 6 modelli (fino a 4 richieste in parallelo);
  4. `motore` e risultato **subito**;
  5. ensemble orario in un secondo momento, con ricalcolo quando arriva. Se non arriva entro il timeout, il risultato resta con la nota "senza ensemble".
- **Adesso:** due parti indipendenti, ciascuna con il proprio stato:
  - **radar:** ultimi orari, poi livello WMS, poi valori nei punti dal GeoTIFF (dopo V1);
  - **pluviometri:** misure delle stazioni vicine.
- **Più giorni:** previsioni giornaliere e orarie, poi ensemble giornaliero (facoltativo), poi motore, poi tabella.
- **Cache locale:** ogni risultato si salva con data e ora complete, fuso, ora di acquisizione e orario dei prodotti (§5.1).

### 4.3 Pluviometri: formato normalizzato

Ogni misura si trasforma in:

```
{ fonte, stazione, lat, lon, distanza_km, inizio, fine (ISO con fuso), mm, qualità (validato/automatico/sconosciuto), ricevuto_alle }
```

- Si scelgono solo stazioni con `fine` entro 2 ore e qualità non scartata.
- Se l'intervallo della fonte non è di un'ora (per esempio 10 minuti), si sommano gli intervalli fino a un'ora solo se sono tutti presenti. Altrimenti si mostra l'intervallo originale.

### 4.4 Radar puntuale (dopo V1)

- Per prodotto e orario si fa una sola chiamata `downloadProduct`. L'URL firmato vale 900 secondi: va usato subito, e se scade si richiede di nuovo.
- Si legge il GeoTIFF una sola volta (con lettura parziale tramite Range, se il bucket la permette) e si estraggono tutti i punti.
- Si convertono le coordinate nella proiezione del file. Si applicano scala e offset. NoData e fuori copertura diventano `null`, con il motivo.

## 5. Errori e freschezza

- Ogni fonte ha un timeout di 15 secondi e un errore leggibile. Il resto della pagina continua a funzionare. Le fonti non disponibili si elencano in una nota.
- Mai valori inventati: un dato assente si mostra come "—" e la causa: mancante, fuori copertura o fonte non raggiungibile.
- Senza connessione: avviso in testa e ultimo risultato salvato secondo §5.1.
- Leaflet non caricato: avviso al posto della mappa, il resto funziona.
- Geolocalizzazione negata: si chiede di scrivere la città.
- Date oltre l'orizzonte o già passate: messaggio chiaro.

### 5.1 Regole di freschezza

| Dato | Attuale se l'età è | Oltre |
|---|---|---|
| Radar SRI / SRT1 | ≤ 20 minuti dall'orario del prodotto | "Radar non aggiornato (ultimo: gg/mm HH:MM)". Niente scritta "Adesso" |
| Radar SRT3-24 | ≤ 90 minuti | come sopra |
| Pluviometri | fine misura ≤ 2 ore | stazione esclusa |
| Previsioni | scaricate ≤ 3 ore fa | invito ad aggiornare |
| Risultato salvato di un altro giorno o di un orario già passato | — | mostrato come **"Storico del gg/mm HH:MM"**, senza consiglio di partenza |

Le date si scrivono sempre per intero (giorno, mese, ora e fuso) quando non sono di oggi.

## 6. Verifiche da fare per prime (spike), in quest'ordine

| # | Domanda | Se va male |
|---|---|---|
| V0 | Tempi e byte della scheda Partenza con 7 punti e cache vuota: prima sul Mac con rete lenta simulata, poi su telefono in rete mobile alla prima pubblicazione di prova | Meno punti intermedi, ensemble solo su richiesta |
| V4 | WMS radar con il parametro `time`: orari disponibili, coerenza con `findLastProductByType`, animazione | Solo l'immagine più recente |
| V2 | Endpoint MeteoHub delle **misure** (non il catalogo) per i pluviometri vicini a un punto: CORS, formato, intervallo, latenza, regioni | Solo le ARPA |
| V3 | ARPA Piemonte e Lombardia: CORS e formato delle misure, intervallo | La fonte non disponibile si toglie |
| V1 | Catena completa in Safari (Mac e telefono) dall'origine di pubblicazione: preflight POST, URL S3 firmato, CORS e Range del bucket, rinnovo dopo la scadenza, proiezione, scala e offset, NoData, memoria | Niente mm del radar nel punto: solo l'immagine del radar e i pluviometri |

## 7. Prove

- **Contratto condiviso:** cartella `contratto/casi/` con file JSON (ingresso e risultato atteso). Gli stessi file sono eseguiti da **pytest**, per `previsioni.py`, e da **node --test**, per `motore.js`, a ogni modifica.
- **Cosa coprono:**
  - i 17 casi della skill, da ricostruire perché erano in una cartella temporanea;
  - soglie esatte e arrotondamenti a ,5;
  - membri dell'ensemble mancanti;
  - probabilità assenti;
  - modelli meno di 3;
  - punto del tragitto mancante;
  - ore con cambio dell'ora legale;
  - raffiche;
  - nessuna fascia buona;
  - partenze con durata del viaggio;
  - affidabilità con ensemble discorde;
  - risultati giornalieri.
- **Cosa si confronta:** numeri, giudizi, fasce, orari consigliati e affidabilità, non solo il giudizio per ora.
- **Fonti:** prove con risposte registrate per ciascuna fonte, compresi errori, 429, serie corte, radar fermo e pixel fuori copertura.
- **Freschezza:** riapertura senza rete il giorno dopo, che deve mostrare "Storico"; radar con orario vecchio.
- **Browser:** le tre schede al computer, a 375 px e a 320 px; tastiera e lettore di schermo; niente rete; nomi con caratteri speciali; percorso `/meteo-motorino/`.
- **Revisione:** controllo di Codex prima della pubblicazione.

## 8. Licenze, limiti e attribuzioni

| Fonte | Licenza e condizioni | Cosa fa l'app |
|---|---|---|
| Open-Meteo | Dati CC BY 4.0, uso non commerciale gratuito, limiti di chiamate con conteggio pesato (più modelli o variabili contano come più chiamate) | Attribuzione; deduplicazione; cache di 15 minuti per richieste uguali; su 429 rispetta `Retry-After`, al massimo un nuovo tentativo, poi avvisa |
| Protezione Civile Radar-DPC | CC BY-SA: attribuzione e condivisione allo stesso modo delle opere derivate | Attribuzione visibile su mappa e valori; eventuali immagini o dati derivati condivisi con la stessa licenza |
| ItaliaMeteo, ARPA Lombardia, ARPA Piemonte | Open data, ciascuno con la propria licenza (da registrare in V2 e V3) | Attribuzione accanto alle misure |
| OpenStreetMap (tessere) | Policy di uso delle tessere: uso interattivo, Referer valido, niente scaricamento in massa | Tessere escluse dal precache; cache HTTP normale; attribuzione |
| Aeronautica Militare | Diritti riservati | Solo link |

## 9. Ordine di costruzione

Tutte e quattro le funzioni restano, ma si costruiscono a fasi. Ogni fase si chiude con le sue prove.

1. **Base:**
   - skill spostata nel progetto;
   - contratto condiviso con i casi;
   - regola della durata del viaggio in Python;
   - V0 sul Mac.
2. **Partenza e Più giorni:** `motore.js` che supera il contratto, viste, mappa e preferiti.
3. **Adesso:** radar WMS (V4) e pluviometri (V2, V3).
4. **Radar nei punti:** GeoTIFF, solo se V1 va bene.
5. **App installabile e pubblicazione:**
   - service worker, freschezza e privacy;
   - workflow Pages;
   - V0 sul telefono;
   - revisione di Codex.

## 10. Pubblicazione

1. Repository git in `~/Desktop/Meteo-Motorino`, già creato.
2. L'utente esegue `gh auth login`.
3. **Solo dopo la conferma dell'utente:**
   - creazione del repository GitHub `meteo-motorino`;
   - workflow `.github/workflows/pages.yml`, che usa `actions/upload-pages-artifact` con `path: app` e `actions/deploy-pages`;
   - attivazione di Pages con sorgente "GitHub Actions".
4. Indirizzo finale `https://<nome utente GitHub>.github.io/meteo-motorino/`. Va aperto sul telefono e installato con "Aggiungi a schermata Home".

## 11. Rapporto con la skill

La skill `meteo-media` resta per le domande in chat: fa anche le ricerche web e crea la mappa. Il suo sorgente vive in `skill/meteo-media/` dentro questo progetto. Una regola del motore si cambia sempre in Python e in JavaScript insieme, con un caso nel contratto condiviso.

## 12. Revisione 2026-11-07 (richiesta dell'utente dopo la prova)

**Inserimento di partenza e arrivo in due passi.** Ogni campo (Da, A) chiede prima la città (Torino, Milano, Roma…). Poi si apre un secondo campo per la via, con suggerimenti, e un numero civico facoltativo. Il tragitto si calcola tra i due punti scelti, con la linea sulla mappa come già previsto.

**Quantità di pioggia: barre.** La pioggia per ogni fascia oraria e per ogni giorno si mostra con barre, di altezza proporzionale ai millimetri (valore centrale tra i modelli, con il massimo tra parentesi). La grafica animata delle gocce non è prevista per ora.

**Aperto:** il servizio per cercare le vie. Il servizio attuale cerca solo le località. Per le vie si propone OpenStreetMap (Nominatim), gratuito, con un limite di una richiesta al secondo e uso moderato, adatto a un uso personale. Da confermare.
