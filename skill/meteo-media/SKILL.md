---
name: meteo-media
description: Previsione del tempo "media" e più affidabile, ottenuta confrontando 6 modelli meteorologici (ECMWF, GFS, ICON, Météo-France, UKMO, ItaliaMeteo) e l'ensemble europeo con i principali siti meteo italiani (iLMeteo, 3B Meteo, meteo.it, servizi regionali). Prima chiede all'utente la città, o da dove a dove si sposta, e il giorno. Poi analizza la giornata ora per ora, con probabilità e millimetri di pioggia, e indica a che ora conviene partire, tenendo conto della durata del viaggio. Per più giorni o più città fa una previsione giorno per giorno. Usa questa skill ogni volta che l'utente chiede che tempo farà, le previsioni meteo, se pioverà, quando conviene uscire o partire, se può spostarsi in motorino, scooter, bici o a piedi senza bagnarsi, il meteo per il weekend o per un giorno preciso, anche se non chiede esplicitamente una "media" o un confronto tra siti. Use it for any weather forecast request, in any language.
---

# Meteo media

L'obiettivo è dire all'utente **quando conviene spostarsi** e che tempo farà, con la previsione più affidabile possibile, invece di quella di un solo sito. I siti meteo si basano tutti sugli stessi pochi modelli numerici, ma li interpretano in modo diverso. Per questo conviene partire dai modelli, prendere il valore centrale e misurare quanto sono d'accordo, e poi controllare cosa scrivono i siti.

L'utente tipico si sposta in motorino o in bici: si bagna anche con poca pioggia. Per lui contano soprattutto **in quali ore piove e con che probabilità**, più del totale del giorno.

## 1. Prima le domande

Appena parte la skill, prima di scaricare dati, controlla se la richiesta dice già:
- **dove**: una città sola, oppure un tragitto da un posto a un altro;
- **quando**: oggi, domani, un giorno preciso, oppure più giorni.

Per quello che manca, fai **un solo messaggio breve** con le domande e aspetta la risposta. Per esempio:

> Per darti la previsione giusta:
> 1. **Dove?** Una città sola, oppure ti sposti da un posto a un altro? In quel caso, da dove a dove?
> 2. **Quando?** Oggi, domani o un altro giorno?

Regole:
- Chiedi solo quello che manca. "Domani da Torino a Moncalieri" ha già tutto: parti subito.
- Non chiedere gli orari: analizzi **tutta la giornata** (6-23) e sei tu a indicare i momenti migliori. Se l'utente nomina orari notturni, allarga con `--dalle`/`--alle`.
- Vale anche per più città o più giorni: "Torino, Milano e Roma" dice dove ma non quando, quindi chiedi il periodo (oggi, domani, il weekend, la settimana...). "La settimana a Roma" ha già tutto. Solo dopo scegli la modalità: un giorno → punto 2A, più giorni → punto 2B.
- Se un nome è ambiguo (es. "San Martino"), lo script mostra gli omonimi: scegli il più probabile e dillo, oppure chiedi.

## 2A. Una giornata, una città o un tragitto (il caso più comune)

```bash
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --giornata domani
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --giornata 2026-11-10 --verso "Moncalieri"
```

`--giornata` accetta oggi, domani, dopodomani o una data AAAA-MM-GG. "Oggi" e "domani" sono calcolati con il fuso della località, e per oggi lo script parte dall'ora attuale. Con `--verso` la città indicata per prima è la partenza. Sui tragitti lunghi lo script aggiunge punti intermedi, circa uno ogni 15 km (al massimo 5), chiamati "km 30", "km 60" e così via. Sono punti **in linea d'aria, non lungo la strada**: presentali come indicativi e non dire mai "ho controllato tutto il tragitto".

**La mappa.** Aggiungi sempre `--mappa <file>.html`. Per un tragitto è la parte più utile, ma funziona anche per una città sola. Su un computer con browser aggiungi anche `--apri`:

```bash
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --giornata domani --verso "Milano" --durata 90 --mappa "mappa-torino-milano-2026-11-08.html" --apri
```

`--apri` apre la mappa nel browser tramite un piccolo server locale, che funziona solo su questo computer, mostra solo quella pagina e si spegne da solo dopo 60 minuti. Serve perché le tessere di OpenStreetMap si possono usare solo da una pagina web, non da un file aperto dal disco. Lo script stampa l'indirizzo (http://127.0.0.1:...): dallo all'utente.

Lo script crea una pagina con la cartina (OpenStreetMap) e il tragitto tratteggiato. Su ogni punto c'è un segno:
- spunta verde: ok;
- una goccia gialla: a rischio;
- tre gocce blu: pioggia probabile;
- punto grigio: dati mancanti;
- 💨: raffiche forti.

Intorno ai punti piovosi c'è anche un alone colorato. Sotto la mappa una barra con le ore permette di scegliere l'ora, e la pagina si apre già sul primo orario di partenza consigliato. Toccando un punto si vedono i dettagli.

Salva la mappa nella cartella di lavoro con un nome chiaro (città e data) e falla vedere all'utente:
- **con un browser su questo computer** (Claude Code): usa `--apri`;
- **senza browser** (per esempio in una chat dove puoi solo mandare file): manda il file. Aperto dal disco mostra tragitto, gocce e ore su sfondo neutro, con un avviso che spiega perché manca la cartina. Dillo all'utente in una riga.

Non aprire il file direttamente con `open <file>`: si vedrebbe senza cartina.

La pagina carica la grafica da internet, quindi serve la connessione. Senza connessione mostra un avviso, e consiglio e barra delle ore funzionano lo stesso. Nella risposta scrivi in una riga cosa mostra la mappa, per esempio "Nella mappa: alle 6 piove verso Milano, dalle 12 è tutto verde".

Ogni riga della tabella è la pioggia caduta **in quell'ora**: la riga "11-12" è la pioggia tra le 11 e le 12.

Cosa restituisce:
- **Orari di partenza consigliati**, per esempio "tra le 13:00 e le 22:00 per un viaggio di 90 minuti". Una partenza all'ora H è buona solo se **ogni punto del tragitto è "ok" nell'ora in cui ci passi** (H più la parte di viaggio necessaria per arrivarci) e non ci sono raffiche forti.
  - **Durata:** `--durata MINUTI`. Senza, lo script la stima dai km (km in linea d'aria × 1,3 a 30 km/h, almeno 10 minuti). Se l'utente dice quanto ci mette, usa quel numero. Se non lo dice, scrivi nella risposta che la durata è stimata.
  - Se nessuna partenza va bene, lo script scrive "**Nessun orario davvero buono**" e indica la partenza meno sfavorevole: prima evita le raffiche forti, poi sceglie meno pioggia. In quel caso dillo chiaramente all'utente, non presentarla come un orario asciutto.
  - "**Nessun orario rimasto oggi**": la fascia oraria di oggi è già passata. Proponi domani.
  - Righe "Partenze" (orari di partenza) e "Meteo ora per ora" (il tempo in ogni ora): non confonderle.
- **Fasce della giornata**: ore consecutive con lo stesso giudizio, per esempio "06-11 ok · 11-22 a rischio".
- **Tabella ora per ora**: pioggia in mm (valore centrale tra i modelli, tra parentesi il modello più piovoso), probabilità, quota delle simulazioni dell'ensemble europeo con almeno 0,1 mm in quell'ora, raffiche, temperatura, numero di modelli disponibili e, per i tragitti, *dove* piove.
- **Giudizio**, con probabilità e millimetri tenuti separati (lo script non trasforma i mm in percentuali):
  - *ok*: probabilità fino al 20% e nessuna pioggia apprezzabile in nessun modello;
  - *a rischio*: probabilità 21-50%, oppure qualche decimo di mm, oppure almeno un modello con 1 mm o più;
  - *pioggia probabile*: probabilità oltre il 50%, oppure almeno 0,3 mm come valore centrale;
  - *raffiche forti* da 45 km/h, che in motorino sono pericolose anche senza pioggia;
  - *dati incompleti* / *dati mancanti*: per quell'ora mancano dati, o per un punto del tragitto. Non è un'ora "ok": dillo.

Come parlarne all'utente: sono **probabilità, non certezze**. Usa formule come "pioggia molto probabile", "rischio basso", "possibili gocce". Riporta anche lo scenario più piovoso quando un modello si stacca dagli altri (il valore tra parentesi), perché un valore centrale vicino a zero non esclude un acquazzone. In motorino conta anche poca pioggia: un rischio del 30% va segnalato.

## 2B. Più giorni o più città

```bash
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --dal 2026-11-07 --al 2026-11-10
```

Altre opzioni: `--giorni N` (fino a 16), `--ore 7-9,17-19` per fasce precise, `--paese FR` per città estere, `--lat/--lon/--nome` per un punto preciso, `--json` per i dati grezzi.

Per ogni giorno restituisce:
- **Temperature**: minima e massima, con l'intervallo tra i modelli.
- **Pioggia**: mediana, media e massimo tra i modelli. Dai all'utente la **mediana**, cioè il valore centrale: un modello che esagera non la sposta. Quando i modelli sono molto divisi lo script stampa un "**Attenzione**". Riportalo con parole semplici, per esempio "due modelli danno 35 mm, gli altri 5: probabile pioggia moderata, possibile forte".
- **Modelli con pioggia** (≥ 1 mm). Alcuni modelli coprono solo 2-5 giorni, quindi il conteggio può scendere (es. 4/4): è normale.
- **Ensemble ECMWF**: quante delle 51 simulazioni del modello europeo danno **almeno 1 mm nel giorno**. È lo stesso modello fatto girare 51 volte con condizioni di partenza leggermente diverse. "51/51" vuol dire pioggia molto probabile anche fra 6 giorni. "5/51" vuol dire giorno probabilmente senza pioggia significativa, ma qualche goccia sotto 1 mm resta possibile: per chi va in motorino guarda anche le fasce orarie.
- **Pioggia per fascia** (notte, mattina, pomeriggio, sera), con mm e probabilità.
- **Affidabilità**:
  - **alta**: entro 2 giorni, modelli d'accordo almeno all'80% e massime entro 3°;
  - **bassa**: modelli divisi (meno del 60% d'accordo), massime distanti più di 5°, oppure dal 5° giorno in poi;
  - **media**: tutti gli altri casi;
  - l'ensemble corregge:
    - un giorno lontano sale a "media" solo se l'unico problema era la distanza e modelli e simulazioni dicono la stessa cosa, quasi all'unanimità;
    - un giorno "alta" scende a "media" se le simulazioni sono divise o dicono il contrario dei modelli;
    - un forte disaccordo tra modelli e simulazioni porta a "bassa".
- Se un giorno lontano ha meno di 3 modelli, lo script lo scrive ("solo 2 modelli"): i valori di quel giorno sono poco solidi.
- Se le date chieste sono oltre i 16 giorni dei modelli o già passate, lo script lo dice in una **Nota**: riportala all'utente.

"I prossimi N giorni" partono da oggi, a meno che la giornata non sia quasi finita. Nel titolo scrivi sempre le date coperte.

## 3. Controllo sui siti meteo italiani

Fai 1-3 ricerche web (WebSearch, modalità "extended" perché servono dati freschi) e mandale nello stesso turno:
- la previsione della città (o delle città del tragitto) per quel giorno su iLMeteo, 3B Meteo, meteo.it;
- allerte, temporali, perturbazioni in arrivo;
- se utile, il servizio regionale (ARPA della regione, Nimbus per Piemonte e Valle d'Aosta).

Controlla la data di ogni pagina: molti risultati sono di anni precedenti o di giorni già passati, e vanno scartati. Usa i siti per tre cose:
- **confermare**: "anche iLMeteo dà pioggia dal pomeriggio";
- **segnalare disaccordi**, su orari o quantità;
- **aggiungere contesto**: allerte, temporali, neve, vento forte.

Se siti e modelli sono in forte disaccordo, dillo e sii più prudente nel consiglio.

## 4. Risposta

Scrivi in italiano semplice: l'utente non è un meteorologo.

**Per una giornata (2A):**

```
# <Città> oppure <Partenza → Arrivo>, <giorno e data>

**In breve:** gli orari di partenza consigliati (con la durata del viaggio) e quelli da evitare, in 1-2 frasi.
(es. "Meglio muoversi entro le 11: la mattina il rischio di pioggia è basso. Dopo aumenta la possibilità di gocce, soprattutto dopo le 20.")
Se lo script dice "Nessun orario davvero buono", scrivilo così, con la partenza meno sfavorevole e cosa aspettarsi.

## Quando spostarsi
- **06-11 · ok**: rischio basso, probabilità 6-16%
- **11-20 · a rischio**: probabilità 20-30%, possibili gocce (un modello dà fino a 1 mm)
- **20-23 · pioggia probabile**: 40-60%, pioggia debole
(per i tragitti: dove piove, es. "rischio a metà strada, non a Torino", ricordando che il punto intermedio è in linea d'aria)

## Ora per ora
Tabella compatta: Ora | Probabilità | Pioggia | Note. Puoi unire le ore consecutive quasi uguali, così la tabella resta leggibile.

## Consigli
- cosa portare (giacca antipioggia, coprigambe, guanti se fa freddo) e se conviene anticipare o rimandare;
- raffiche forti, se ci sono;
- cosa dicono i siti (conferme o disaccordi) e quanto è affidabile la previsione;
- quando ricontrollare (per domani: stasera o domattina).

**Fonti:** link markdown ai siti usati + Open-Meteo.
```

**Per più giorni (2B):** titolo con le date coperte e una tabella `| Giorno | Tempo | Min / Max | Pioggia | Affidabilità |` per città. Poi una nota su cosa dicono i siti, "Il quadro generale" in 2-4 punti e le fonti. Se l'utente si sposta, aggiungi per ogni giorno le fasce con probabilità e mm.

Indicazioni:
- Dai sempre la pioggia in mm, anche quando è zero o quasi. Per orientarsi: sotto 1 mm sono gocce, 1-5 mm pioggia debole, 5-15 mm moderata, oltre 15 mm forte.
- Arrotonda le temperature al grado.
- Metti in **grassetto** quello che serve per organizzarsi: le fasce da evitare, pioggia forte, temporali, raffiche, allerte.
- Non inventare dati che non hai. Se una città ha solo i modelli, dillo.
- Oltre i 4-5 giorni la previsione è una tendenza: dillo e consiglia di ricontrollare.
