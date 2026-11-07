---
name: meteo-media
description: Previsione del tempo "media" e più affidabile per una o più località (Torino, Milano, Roma o qualsiasi altra città), ottenuta confrontando 6 modelli meteorologici (ECMWF, GFS, ICON, Météo-France, UKMO, ItaliaMeteo) con i principali siti meteo italiani (iLMeteo, 3B Meteo, meteo.it, servizi regionali). Usa questa skill ogni volta che l'utente chiede che tempo farà, le previsioni meteo, se pioverà, le temperature dei prossimi giorni, il meteo per il weekend o per un giorno preciso, anche se non chiede esplicitamente una "media" o un confronto tra siti. Use it for any weather forecast request, in any language.
---

# Meteo media

L'obiettivo è dare all'utente la previsione più affidabile possibile, invece di quella di un solo sito. I siti meteo si basano tutti sugli stessi pochi modelli numerici, ma li interpretano in modo diverso. Per questo conviene partire dai modelli, fare la media e misurare quanto sono d'accordo, e poi controllare cosa scrivono i siti.

## Passi

### 1. Capire cosa chiede l'utente

- **Località**: una o più città. Se un nome è ambiguo (es. "San Martino"), lo script mostra le alternative: scegli quella più probabile e dillo, oppure chiedi.
- **Giorni**: "domani", "il weekend", "sabato-martedì", "la prossima settimana". Converti in date assolute partendo dalla data di oggi. Se non è indicato, usa i prossimi 7 giorni.

### 2. Media dei modelli (lo script)

Per ogni località:

```bash
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino"
python3 ~/.claude/skills/meteo-media/scripts/previsioni.py "Torino" --dal 2026-11-07 --al 2026-11-10
```

Altre opzioni: `--giorni N` (fino a 16), `--paese FR` per città estere omonime, `--lat/--lon/--nome` per un punto preciso, `--json` per i dati grezzi. Lo script impiega pochi secondi e usa solo Python standard. I dati vengono da Open-Meteo, che è gratuito e non richiede una chiave.

Restituisce per ogni giorno: minima e massima medie con intervallo tra i modelli, pioggia media e massima, quanti modelli prevedono almeno 1 mm, vento massimo e affidabilità. Alcuni modelli coprono solo 2-5 giorni: oltre quell'orizzonte il conteggio scende (es. 4/4) ed è normale.

Come leggere l'affidabilità calcolata:
- **alta**: entro 2 giorni da oggi, almeno l'80% dei modelli d'accordo su pioggia/asciutto e massime entro 3°.
- **bassa**: dal 5° giorno in poi, oppure modelli divisi (meno del 60% d'accordo) o massime distanti più di 5°.
- **media**: tutti gli altri casi.

Guarda anche la riga "pioggia per modello". Se un solo modello prevede tanta pioggia e gli altri niente (es. 30, 0, 0, 0), la media inganna. Scrivi "possibile pioggia, un solo modello la dà forte" e non riportare la media come se fosse sicura.

### 3. Controllo sui siti meteo italiani

Fai 1-3 ricerche web (WebSearch, modalità "extended" perché servono dati freschi) e mandale nello stesso turno:
- la previsione della città sui siti principali: iLMeteo, 3B Meteo, meteo.it;
- le notizie sulla tendenza dei prossimi giorni, cioè perturbazioni in arrivo e allerte;
- se utile, il servizio regionale (ARPA della regione, Nimbus per Piemonte e Valle d'Aosta).

Controlla la data di ogni pagina: molti risultati sono di anni precedenti o di giorni già passati. Le pagine vecchie vanno scartate. Se per una città i siti non danno dati aggiornati, dillo e basati sui modelli.

Usa i siti per tre cose:
- **confermare**: se un sito dà temperature simili alla media, dillo ("coincide con iLMeteo");
- **segnalare disaccordi**: se un sito prevede molta più pioggia o un orario diverso, riportalo;
- **aggiungere contesto** che i numeri non danno: allerte della Protezione Civile, neve in quota, temporali, nome e intensità della perturbazione.

Se modelli e siti sono in forte disaccordo su un giorno, abbassa l'affidabilità di quel giorno.

### 4. Risposta

Scrivi in italiano semplice: l'utente non è un meteorologo. Spiega i termini tecnici se servono. Struttura:

```
# Previsioni meteo <città>, <periodo>

**Come le ho calcolate** (1-2 frasi, solo la prima volta nella conversazione: 6 modelli + siti, l'affidabilità dice quanto sono d'accordo)

## <Città>
| Giorno | Tempo | Min / Max | Affidabilità |
(oppure, per pochi giorni, un blocco per giorno con temperature, pioggia, vento e affidabilità)

Nota breve se un sito conferma o contraddice.

## Il quadro generale
2-4 punti: quando piove, quando è asciutto, eventuali allerte, da quando le previsioni diventano incerte e quando conviene ricontrollare.

**Fonti:** elenco di link markdown ai siti usati + Open-Meteo.
```

Indicazioni:
- Arrotonda le temperature al grado e mostra un intervallo solo se i modelli sono distanti (es. "6-7°").
- Metti in **grassetto** i giorni con pioggia forte, temporali, vento forte o allerte, cioè quello che l'utente deve sapere per organizzarsi.
- Non inventare dati che non hai. Se una città ha solo i modelli, dillo.
- Dopo i 4-5 giorni ricorda che la previsione è una tendenza e conviene ricontrollare più avanti.
