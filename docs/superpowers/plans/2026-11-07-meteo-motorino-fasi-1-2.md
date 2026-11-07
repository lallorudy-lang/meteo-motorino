# Meteo Motorino: piano di costruzione, fasi 1-2 (basi, Partenza, Più giorni)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** riportare la skill nel progetto con un contratto di regole condiviso da Python e JavaScript, aggiungere la regola della durata del viaggio, e costruire l'app web con le schede Partenza e Più giorni, i preferiti e la mappa delle gocce.

**Architecture:**
- **Motore:** le regole stanno in due moduli puri, `skill/meteo-media/scripts/motore.py` e `app/motore.js`. Entrambi superano gli stessi casi JSON in `contratto/casi/`.
- **App:** è statica (moduli ES, nessuna build) e chiama Open-Meteo dal browser tramite `app/rete.js`.
- **Fuori da questo piano:** la scheda Adesso, il radar, il service worker e la pubblicazione sono le fasi 3-5. Avranno un piano proprio dopo le verifiche V1-V4.

**Tech Stack:**
- Python 3.13 + pytest per la skill;
- Node 26 (`node --test`) per i test JavaScript;
- Leaflet 1.9.4 (unpkg con SRI);
- HTML/CSS/JS senza framework.

**Spec:** `docs/superpowers/specs/2026-11-07-meteo-motorino-design.md`, versione 2. Leggere §4.1 (contratto), §3.1, §3.3, §3.4 e §7.

## Global Constraints

- Nessun framework, nessuna fase di build, nessuna dipendenza npm. I test usano solo `node:test` e `node:assert`.
- **Arrotondamento:** "alla pari" (half-even, come `round` di Python). Mai `Math.round` nel motore. Mediane e medie sui valori non arrotondati; si arrotonda alla fine: mm a 0,1, percentuali e °C all'intero.
- **`null`:** non si conta e non vale zero.
- **Ensemble:** quota sui membri disponibili, non sempre 51.
- **Soglie:**
  - probabilità con ">" 50 e > 20;
  - mm con "≥" 0,3 / 0,1 e massimo ≥ 1;
  - raffiche ≥ 45 km/h;
  - "ok" solo con almeno 3 modelli.
- Le soglie si applicano ai valori già arrotondati.
- Un dato Open-Meteo all'orario T vale per [T−1h, T). La richiesta include la mezzanotte successiva.
- **Durata stimata del viaggio:** `max(10, arrotonda(km × 1,3 / 30 × 60))` minuti. Durata accettata: da 5 a 600 minuti.
- Testi dell'interfaccia in italiano. Nessuna coordinata reale dell'utente nel repository: i casi di prova usano i centri di Torino, Milano e Bologna.
- Percorsi relativi in `app/`, così l'app funziona sotto `/meteo-motorino/`.
- Commit con la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **"Oggi" la sera tardi:** non resta nessuna ora nella fascia, perché la prima ora è ≥ dell'ultima. Ci si aspetta "Nessun orario rimasto oggi", non un errore né una tabella vuota senza spiegazione. Test nei Task 3 e 10.
2. **Durata che porta oltre la mezzanotte:** per le partenze tardive alcuni punti si raggiungono il giorno dopo. Quelle partenze devono risultare "dati incompleti", mai "ok". Test nel Task 3.
3. **Località non trovata o con omonimi:** messaggio chiaro, oppure scelta tra gli omonimi. Mai il primo omonimo usato in silenzio per la destinazione. Test nel Task 6, interfaccia nel Task 10.
4. **Ensemble che fallisce dopo che il risultato è già mostrato:** il risultato resta, compare la nota "senza ensemble", nessun errore a tutta pagina. Test nel Task 10.
5. **Giorno del cambio dell'ora** (25 o 23 ore, orari ripetuti): nessun crash, risultato coerente tra Python e JS. Test nel Task 2 (contratto).

---

## Struttura dei file

| File | Compito |
|---|---|
| `skill/meteo-media/` | Sorgente della skill, spostato da `~/.claude/skills/meteo-media` (che diventa un collegamento) |
| `skill/meteo-media/scripts/motore.py` | **Nuovo:** regole pure estratte da `previsioni.py`, più `partenze`, `consiglio` e `durata_stimata` |
| `skill/meteo-media/scripts/previsioni.py` | Riga di comando, download, stampa e mappa. Usa `motore` |
| `skill/meteo-media/tests/` | Test pytest solo Python: download, fuso, server della mappa |
| `contratto/casi/*.json` | Casi condivisi (formato più sotto) |
| `contratto/test_contratto.py`, `contratto/contratto.test.mjs` | Esecutori dei casi in Python e in JS |
| `app/motore.js` | Lo stesso contratto in JavaScript |
| `app/rete.js`, `app/fonti/openmeteo.js` | Download con timeout, cache, 429; chiamate a Open-Meteo |
| `app/preferiti.js` | Preferiti e dati locali |
| `app/index.html`, `app/stile.css`, `app/principale.js` | Guscio, schede, barra dei preferiti, link |
| `app/viste/mappa.js`, `app/viste/partenza.js`, `app/viste/giorni.js` | Schermate |
| `app/test/*.test.mjs`, `app/test/fixture/*.json` | Test JS di rete, fonti, preferiti e flussi |
| `strumenti/misura_v0.mjs`, `docs/superpowers/verifiche/V0.md` | Verifica V0 sul Mac |
| `.claude/launch.json` | Server di sviluppo per le prove nel browser |

**Formato dei casi** (`contratto/casi/<gruppo>.json`), un array:

```json
[{ "nome": "valuta_ora: 0,3 mm con prob 5% è pioggia probabile, prob resta 5",
   "funzione": "valuta_ora",
   "argomenti": [{ "n_modelli": 6, "mm": 0.3, "mm_max": 0.3, "prob": 5, "ensemble_pct": 5, "raffiche": 10, "temp": 10 }],
   "atteso": { "livello": 2, "prob": 5, "motivo": null } }]
```

Gli esecutori confrontano in profondità, con tolleranza assoluta di 1e-9 sui numeri non interi. Una funzione elencata in `"funzione"` deve esistere in entrambi i moduli: snake_case in Python, camelCase in JS. Le corrispondenze sono nel Task 4.

---

### Task 1: Skill nel progetto, test Python di base

**Files:**
- Move: `~/.claude/skills/meteo-media/` → `skill/meteo-media/`, poi `ln -s "$PWD/skill/meteo-media" ~/.claude/skills/meteo-media`
- Create: `skill/meteo-media/tests/test_previsioni.py`, `pytest.ini` (con `testpaths = skill/meteo-media/tests contratto`)

**Interfaces:**
- Produces: `skill/meteo-media/scripts/previsioni.py`, importabile nei test con `importlib` dal percorso.

- [ ] **Step 1:** spostare la cartella e creare il collegamento. Verifica: `ls -l ~/.claude/skills/meteo-media` mostra il collegamento, e `python3 ~/.claude/skills/meteo-media/scripts/previsioni.py Torino --giorni 1` stampa una tabella.
- [ ] **Step 2:** scrivere `test_previsioni.py` con i casi che riguardano solo Python (ricostruiti dalla sessione del 2026-11-07):
  - `test_adesso_locale_segnala_fallback`: `adesso_locale("Fuso/Inesistente")[1] is False` e `adesso_locale("Europe/Rome")[1] is True`;
  - `test_errore_curl_e_eccezione_gestibile`: `urlopen` solleva `URLError("CERTIFICATE_VERIFY_FAILED")`, `subprocess.run` restituisce codice 22, e `scarica("https://x")` solleva `ErroreDownload`, non `SystemExit`;
  - `test_server_morto_nessun_url`: `Popen` finto con `poll()==1` e stdout vuoto, quindi `apri_mappa(f) == (None, False)`;
  - `test_browser_non_aperto`: `webbrowser.open` restituisce False, quindi `apri_mappa(f)` dà un URL non nullo e `aperto is False` (terminare poi il server);
  - `test_servi_mappa_solo_quel_file`: avviare `servi_mappa.py f 0 1`, leggere "PORTA n"; GET del file restituisce 200, `/altro` e `/../etc/passwd` restituiscono 404.
- [ ] **Step 3:** `pytest skill/meteo-media/tests -v`. Atteso: 5 passed.
- [ ] **Step 4:** commit "Skill meteo-media nel progetto, test Python di base".

### Task 2: `motore.py` estratto e contratto Python

**Files:**
- Create: `skill/meteo-media/scripts/motore.py`, `contratto/test_contratto.py`, `contratto/casi/{arrotonda,orari,ora,tragitto,giorni,geometria}.json`
- Modify: `skill/meteo-media/scripts/previsioni.py` (importa da `motore`; nessun cambiamento di comportamento)

**Interfaces (produce, tutte pure):**
- `arrotonda(x: float|None, cifre: int = 0) -> float|int|None`, cioè `round` di Python
- `intervalli(tempi: list[str]) -> list[[str, int]]`, coppie `[data, ora_inizio]`
- `ore_punto_da_risposte(det: dict, ens: dict|None, giorno: str) -> list[ValoriOra]`, dove `ValoriOra = {ora, n_modelli, mm, mm_max, modelli_con_pioggia, prob, prob_intervallo, ensemble_pct, temp, raffiche}`, ordinate per ora. `det` ed `ens` sono i campi `hourly` delle risposte Open-Meteo. È il corpo di calcolo di `ore_punto`, estratto
- `valuta_ora(o: ValoriOra|None) -> {livello: 0|1|2|None, prob: int|None, motivo: str|None}`
- `combina_ore(punti: list[{nome, ore: list[ValoriOra]}], prima_ora: int, alle: int) -> list[OraTragitto]`: la parte di `giornata()` dopo il download. `OraTragitto = {ora, livello, giudizio, raffiche_forti, mm, mm_max, prob, ensemble_pct, prob_max, raffiche, temp, modelli, dove_piove, livelli, per_punto}`
- `fasce(elenco: list[dict]) -> list[Fascia]` con `Fascia = {dalle, alle, giudizio, livello, raffiche_forti, prob_max, mm_max, raffiche_max}`
- `affidabilita(giorni_da_oggi, n_pioggia, n_modelli, spread_max, ens: dict|None) -> str`
- `pioggia_oraria(dati: dict, giorno: str, finestre: list) -> list`, `ensemble_per_giorno(ens) -> dict`, `analizza_giorni(dati, ens, oggi: str, finestre) -> list[Riga]`, cioè l'attuale `analizza` con `oggi` passato come stringa ISO
- `distanza_km(lat1, lon1, lat2, lon2) -> float`, `punti_intermedi(la, lo, lb, lob, km) -> list[[nome, lat, lon]]`

- [ ] **Step 1: casi.** Scrivere i file JSON:
  - `arrotonda`: 20,5 dà 20; 21,5 dà 22; (0,25, 1) dà 0,2; (2,675, 2) dà 2,67; (0,35, 1) dà 0,3; null dà null.
  - `orari`: "2026-11-09T12:00" dà ["2026-11-09", 11]; "2026-11-10T00:00" dà ["2026-11-09", 23].
  - `ora`:
    - 0,3 mm con prob 5% dà livello 2 e prob 5;
    - 1 modello senza probabilità dà livello null, "dati insufficienti";
    - 1 modello asciutto al 5% dà livello null;
    - 1 modello con 0,5 mm all'80% dà livello 2;
    - prob [20,21] → mediana 20 dà livello 0.
  - `tragitto`:
    - destinazione senza ore: tutte le ore "dati mancanti" o "incompleti" e nessuna fascia ok;
    - fasce con raffiche 70 km/h.
  - `giorni`:
    - affidabilita(6,1,1,12,{1,1}) dà "bassa";
    - affidabilita(6,6,6,1,{1,1}) dà "media";
    - affidabilita(1,6,6,1,{0,1}) non dà "alta";
    - serie corta in `pioggia_oraria` ed `ensemble_per_giorno` (nessun errore);
    - un caso `analizza_giorni` con risposte reali registrate per Torino centro (45.07, 7.69), da salvare con `curl` in `contratto/casi/dati/torino-giorni.json` con il risultato atteso generato una volta dal Python attuale e controllato a mano su 2 giorni.
  - `orari` (cambio d'ora): risposta di 25 ore con "2026-10-25T02:00" ripetuto. `ore_punto_da_risposte` non va in errore e dà al massimo 24 ore distinte, l'ultima vince.
  - `geometria`: `punti_intermedi` per 8 km dà [], per 125 km dà 5 punti "km 21"…"km 104".
- [ ] **Step 2:** `contratto/test_contratto.py`: un test parametrizzato per caso. Importa `motore` da `skill/meteo-media/scripts`, chiama `getattr(motore, caso["funzione"])(*caso["argomenti"])`, confronta con la tolleranza. Lanciare `pytest contratto -v`. Atteso: FAIL, `motore` non esiste.
- [ ] **Step 3:** creare `motore.py` spostando le funzioni da `previsioni.py`. In `previsioni.py` restano download, CLI, stampa e mappa, che chiamano `motore`. `valuta_ora` restituisce sempre le tre chiavi.
- [ ] **Step 4:** `pytest -v`. Atteso: tutti passed. Inoltre `python3 skill/meteo-media/scripts/previsioni.py Bologna --giornata domani` stampa come prima.
- [ ] **Step 5:** commit "Motore Python estratto e contratto condiviso".

### Task 3: Regola della durata del viaggio (Python)

**Files:**
- Modify: `skill/meteo-media/scripts/motore.py`, `previsioni.py` (opzione `--durata MINUTI`, banner), `skill/meteo-media/SKILL.md` (§2A: "orari di partenza consigliati", durata)
- Create: `contratto/casi/partenze.json`

**Interfaces (produce):**
- `durata_stimata(km: float) -> int`
- `partenze(punti: list[{nome, frazione: float, ore: list[ValoriOra]}], durata_min: int, prima_ora: int, alle: int) -> list[Partenza]`, con `Partenza = {ora, livello, giudizio, raffiche_forti, mm, mm_max, prob_max, raffiche, attraversate: list[{nome, ora: int|None}]}`
- `consiglio(lista: list[Partenza]) -> {consigliabile: bool, dalle, alle, giudizio, prob_max, mm_max, raffiche_max} | None`

Algoritmo di `partenze`, che il test non determina del tutto:

```text
per H da prima_ora a alle-1:
  per ogni punto i: h_i = floor(H + frazione_i * durata_min / 60)
    se h_i > 23 o il punto non ha l'ora h_i: attraversata {nome, ora: None} -> partenza "dati incompleti", livello None
    altrimenti v_i = valuta_ora(ore_i[h_i])
  livello = max dei v_i.livello (None se ce n'è uno None)
  raffiche_forti = una delle ore attraversate ha raffiche >= 45
  giudizio come combina_ore (LIVELLI[livello] o "dati incompleti (...)"), più ", raffiche forti"
consiglio: fasce(lista); fascia ok più lunga senza raffiche_forti (a parità, prob_max minore);
  altrimenti la partenza minima per (raffiche_forti, livello, mm, mm_max, prob_max, ora) con consigliabile False;
  lista vuota -> None
```

- [ ] **Step 1: casi** in `partenze.json`:
  - `durata_stimata`: 8 km dà 21; 2 km dà 10; 125 km dà 325;
  - `partenze`: un punto, frazione 0 e durata 20, coincide con le ore;
  - due punti (0 e 1) con durata 60: arrivo asciutto alle 11 ma piovoso alle 12, quindi la partenza delle 11 è "pioggia probabile";
  - durata 120 e partenza alle 23: "dati incompleti", livello null (Review Focus 2);
  - `prima_ora=23, alle=23` dà [] e `consiglio([])` dà null (Review Focus 1);
  - `consiglio`: esce un'ora con raffiche 70 km/h e un'ora con 0,3 mm e vento debole: sceglie quella con 0,3 mm e consigliabile false;
  - fascia ok 12-15 dà dalle 12, alle 15, consigliabile true.
- [ ] **Step 2:** `pytest contratto -v -k partenze`. Atteso: FAIL, le funzioni non esistono.
- [ ] **Step 3:** implementare le tre funzioni in `motore.py`. In `previsioni.py --giornata`:
  - `--durata` (predefinita `durata_stimata(km)`, 0 per una città sola);
  - banner "Orari di partenza consigliati: HH-HH" oppure "Nessun orario davvero buono…";
  - "Nessun orario rimasto oggi" se la lista è vuota;
  - nella mappa, il banner usa `consiglio`.
- [ ] **Step 4:** `pytest -v`. Atteso: tutti passed. `previsioni.py Torino --giornata domani --verso Milano --durata 90` mostra il banner con la durata.
- [ ] **Step 5:** commit "Regola della durata del viaggio".

### Task 4: `motore.js` che supera il contratto

**Files:**
- Create: `app/motore.js`, `contratto/contratto.test.mjs`

**Interfaces:**
- Produces (export): `arrotonda`, `intervalli`, `orePuntoDaRisposte`, `valutaOra`, `combinaOre`, `fasce`, `affidabilita`, `pioggiaOraria`, `ensemblePerGiorno`, `analizzaGiorni`, `distanzaKm`, `puntiIntermedi`, `durataStimata`, `partenze`, `consiglio`, con le stesse firme e gli stessi campi (snake_case negli oggetti) delle omonime Python. L'esecutore traduce `funzione` da snake a camel.

Algoritmo di `arrotonda`, che deve coincidere con `round` di Python sul valore binario esatto:

```text
se x è null -> null
s = x.toFixed(cifre + 30)        // cifre decimali esatte del valore binario
taglia s a cifre decimali; resto = le cifre dopo
se resto > "5000..." -> arrotonda in su (in valore assoluto); se < -> in giù;
se esattamente "5" seguito da soli zeri -> verso la cifra pari
restituisci Number(risultato) (intero se cifre == 0; -0 diventa 0)
```

- [ ] **Step 1:** `contratto.test.mjs` legge tutti i file di `contratto/casi/` e per ogni caso registra un `test(caso.nome, …)` che chiama l'export camelCase e confronta (`assert.deepStrictEqual` dopo aver normalizzato i numeri con tolleranza 1e-9). `node --test contratto/` dà FAIL: il modulo non esiste.
- [ ] **Step 2:** implementare `app/motore.js` funzione per funzione, rilanciando i test finché passano tutti.
- [ ] **Step 3:** `node --test contratto/ && pytest -v`. Atteso: entrambi tutti passed, sugli stessi casi.
- [ ] **Step 4:** commit "Motore JavaScript che supera il contratto".

### Task 5: Verifica V0 sul Mac

**Files:**
- Create: `strumenti/misura_v0.mjs`, `docs/superpowers/verifiche/V0.md`

- [ ] **Step 1:** `misura_v0.mjs` fa questo:
  - prende il tragitto Torino → Milano (7 punti da `puntiIntermedi`);
  - per ogni punto scarica le previsioni orarie con gli stessi parametri di `ore_punto` (concorrenza 4), poi l'ensemble;
  - stampa il tempo fino all'ultimo dato deterministico, il tempo fino all'ensemble e i byte totali;
  - ripete 3 volte.
- [ ] **Step 2:** `node strumenti/misura_v0.mjs`. Riportare in `V0.md` tempi, byte e un giudizio: "entro 10 s su rete di casa? margine per la rete mobile?". Va segnato che la misura sul telefono si fa nella fase 5.
- [ ] **Step 3:** commit "Verifica V0 sul Mac".

### Task 6: Rete e fonte Open-Meteo

**Files:**
- Create: `app/rete.js`, `app/fonti/openmeteo.js`, `app/test/rete.test.mjs`, `app/test/openmeteo.test.mjs`, `app/test/fixture/geocodifica-bologna.json` (risposta registrata)

**Interfaces (produce):**
- `rete.js`:
  - `class ErroreRete extends Error { stato; url }`;
  - `scaricaJSON(url: string, {timeoutMs = 15000, cacheMs = 900000} = {}) -> Promise<any>`: deduplica le richieste uguali in corso, usa la cache in memoria per `cacheMs`, e su 429 attende `Retry-After` (massimo 10 s) e ritenta una sola volta, poi `ErroreRete` con stato 429;
  - `conLimite(n: number, funzioni: (() => Promise)[]) -> Promise<any[]>`, cioè al massimo n in parallelo, con l'ordine conservato.
- `openmeteo.js`:
  - `cercaLuogo(nome: string) -> Promise<Luogo[]>` con `Luogo = {etichetta, nome, regione, paese, codice_paese, lat, lon, fuso}`: prima gli italiani, senza doppioni, al massimo 5;
  - `orarioPunto(lat, lon, giorno: string) -> Promise<{det, ens|null, fuso: string}>`: `det` ed `ens` sono i campi `hourly` delle risposte, `fuso` è il `timezone` della risposta;
  - `giorniCitta(lat, lon, giorni: number) -> Promise<{dati, ens|null}>`.
  - Parametri URL identici a `previsioni.py`: stessi modelli, `timezone=auto`, `end_date` = giorno + 1, `forecast_days` + 1.

- [ ] **Step 1: test** con `globalThis.fetch` finto:
  - `rete`: due chiamate uguali in contemporanea fanno una sola fetch;
  - 429 con `Retry-After: 0` e poi 200 restituisce i dati (2 fetch);
  - due 429 danno `ErroreRete` con stato 429;
  - timeout con fetch che non risponde dà `ErroreRete`;
  - `conLimite(2, …)` non supera mai 2 in corso.
  - `openmeteo`:
    - l'URL di `orarioPunto` contiene i 6 modelli, `start_date=2026-11-09` ed `end_date=2026-11-10`;
    - `cercaLuogo` con la fixture di Bologna mette prima l'Emilia-Romagna;
    - nessun risultato dà [];
    - ensemble che fallisce dà `ens: null` senza errore (Review Focus 4).
- [ ] **Step 2:** `node --test app/test/`. Atteso: FAIL.
- [ ] **Step 3:** implementare `rete.js` e `openmeteo.js`.
- [ ] **Step 4:** `node --test app/test/`. Atteso: tutti passed.
- [ ] **Step 5:** commit "Rete con cache e 429, fonte Open-Meteo".

### Task 7: Preferiti e dati locali

**Files:**
- Create: `app/preferiti.js`, `app/test/preferiti.test.mjs`

**Interfaces (produce)**, con `archivio` = `localStorage` o un oggetto finto con `getItem`, `setItem` e `removeItem`; chiave `meteo-motorino.preferiti.v1`:
- `leggi(archivio) -> Preferito[]` con `Preferito = {id, nome, da: Luogo, a: Luogo|null, durata_min: number|null}`;
- `salva(archivio, p) -> Preferito[]`: se l'id esiste lo sostituisce, se manca lo crea;
- `togli(archivio, id) -> Preferito[]`;
- `esporta(archivio) -> string`, cioè testo JSON;
- `importa(archivio, testo) -> number`: aggiunge quelli nuovi e ignora i doppioni per nome; con testo non valido solleva un errore "Testo dei preferiti non valido";
- `cancellaDatiLocali(archivio)`: toglie tutte le chiavi che iniziano con `meteo-motorino.`.

- [ ] **Step 1:** test:
  - salva, leggi e togli funzionano;
  - esporta seguito da importa su un archivio vuoto dà gli stessi preferiti;
  - un JSON rotto solleva il messaggio;
  - un JSON non rotto ma sbagliato (per esempio un numero) solleva lo stesso messaggio;
  - `cancellaDatiLocali` lascia le altre chiavi.
- [ ] **Step 2:** `node --test app/test/preferiti.test.mjs` dà FAIL. Implementare, poi passed.
- [ ] **Step 3:** commit "Preferiti e cancellazione dei dati locali".

### Task 8: Guscio dell'app

**Files:**
- Create: `app/index.html`, `app/stile.css`, `app/principale.js`, `.claude/launch.json` (`python3 -m http.server 8766 --bind 127.0.0.1 --directory app`)

**Interfaces:**
- Consumes: `preferiti.js`.
- Produces: in `index.html` i contenitori `#preferiti`, `#scheda-partenza`, `#scheda-adesso`, `#scheda-giorni`, `#link-utili`. `principale.js` esporta `apriScheda(nome)` e l'evento `"preferito-scelto"` (`CustomEvent` con `detail: Preferito`) su `document`.

- [ ] **Step 1:** costruire il guscio:
  - tre schede come pulsanti `role="tab"`; "Adesso" mostra "In arrivo: radar e pluviometri";
  - barra dei preferiti;
  - "Impostazioni" con Esporta, Importa e Cancella dati locali (con conferma);
  - i link utili del §3.5;
  - pulsante **📍 Qui**: la prima volta mostra la schermata privacy del §3.4 (testo dal documento di progetto) e solo dopo "Continua" chiama `navigator.geolocation`. Il risultato è l'evento `"posizione"` con `detail: Luogo` (`{etichetta: "La mia posizione", nome: "La mia posizione", lat, lon, fuso: null}`). Se il permesso viene negato: "Scrivi la città di partenza". La scelta "privacy letta" si salva come `meteo-motorino.privacy-letta`;
  - `meta name="referrer" content="strict-origin-when-cross-origin"`;
  - mobile-first, colori e contrasto come la mappa approvata (verde `#1e7a43`, giallo `#e0a800` con testo scuro, blu `#1f6fd1`, grigio `#6b7280`).
- [ ] **Step 2: verifica nel browser** (preview `app`):
  - le schede si cambiano con il mouse e con la tastiera;
  - a 320 px niente scorrimento orizzontale della pagina;
  - console senza errori;
  - Cancella dati locali svuota i preferiti.
- [ ] **Step 3:** commit "Guscio dell'app con schede, preferiti e impostazioni".

### Task 9: Mappa delle gocce come modulo

**Files:**
- Create: `app/viste/mappa.js`

**Interfaces:**
- Consumes: oggetti `OraTragitto` e `consiglio` dal motore.
- Produces: `creaMappa(contenitore: HTMLElement, {punti: [{nome, lat, lon}], km}) -> {mostraOre(ore: OraTragitto[], iniziale: number), distruggi()}`.

- [ ] **Step 1:** portare la parte JS e CSS di `MAPPA_HTML` (in `previsioni.py`) in un modulo:
  - stesse icone (✓, 1 goccia, 3 gocce, ?, 💨) e stessa barra oraria con pulsanti accessibili;
  - `esc()` per i nomi;
  - avviso se Leaflet manca;
  - tessere OSM solo su http e https.
- [ ] **Step 2: verifica nel browser** con una pagina di prova temporanea, che non va nel commit e usa i dati di un `combinaOre` su una fixture:
  - le gocce cambiano con l'ora;
  - un nome con `<img onerror>` crea 0 elementi `img`;
  - `aria-valuetext` è aggiornato.
- [ ] **Step 3:** commit "Mappa delle gocce come modulo".

### Task 10: Scheda Partenza

**Files:**
- Create: `app/viste/partenza.js`, `app/test/partenza.test.mjs`

**Interfaces:**
- Consumes: `cercaLuogo`, `orarioPunto`, `conLimite`, `distanzaKm`, `puntiIntermedi`, `durataStimata`, `orePuntoDaRisposte`, `combinaOre`, `partenze`, `consiglio`, `creaMappa`, `salva`.
- Produces:
  - `calcolaPartenza({da: Luogo, a: Luogo|null, giorno: string, durata_min: number|null, dalle = 6, alle = 23, adesso: string}, fonti = {orarioPunto}, avvisa = (risultato) => {}) -> Promise<Risultato>`, con `Risultato = {punti, km, durata_min, ore, partenze, consiglio, note: string[], con_ensemble: boolean}`. Chiama `avvisa` una prima volta senza ensemble e una seconda volta con l'ensemble, se arriva;
  - `montaPartenza(contenitore)`.

- [ ] **Step 1: test** di `calcolaPartenza` con `fonti` finte:
  - tragitto di 2 punti con ensemble che fallisce: `avvisa` chiamato una sola volta, `con_ensemble` false, nota "senza ensemble" (Review Focus 4);
  - `adesso` alle 23:30 del giorno stesso: `partenze` vuota e nota "Nessun orario rimasto oggi" (Review Focus 1);
  - durata null: si usa `durataStimata(km)`;
  - `da.fuso` null (posizione dal dispositivo): si usa il `fuso` restituito da `orarioPunto` per partenza e confronto dei fusi;
  - durata 3 solleva l'errore "La durata deve essere tra 5 e 600 minuti";
  - partenza e arrivo con scarto UTC diverso (fuso "Europe/London") sollevano il messaggio dei fusi diversi.
- [ ] **Step 2:** `node --test app/test/partenza.test.mjs` dà FAIL. Implementare `calcolaPartenza`, poi passed.
- [ ] **Step 3:** `montaPartenza`:
  - campi Da, A, Giorno, Durata (precompilata con la stima e modificabile) e fascia oraria;
  - per i nomi con omonimi, una scelta tra le etichette prima di calcolare (Review Focus 3);
  - "Località non trovata: …" quando non c'è;
  - risultato: orari consigliati, oppure "Nessun orario davvero buono…", poi fasce, mappa, tabella ora per ora (mm, probabilità, ensemble, raffiche, temperatura, modelli) e note;
  - ☆ salva il preferito con la durata;
  - l'evento `preferito-scelto` compila e calcola.
- [ ] **Step 4: verifica nel browser:**
  - Torino → Milano domani con durata 90 dà banner, mappa e tabella;
  - il nome "San Martino" mostra la scelta;
  - con il preferito salvato, ricaricando la pagina si calcola con un tocco;
  - a 320 px è leggibile;
  - console pulita.
- [ ] **Step 5:** commit "Scheda Partenza".

### Task 11: Scheda Più giorni

**Files:**
- Create: `app/viste/giorni.js`, `app/test/giorni.test.mjs`

**Interfaces:**
- Consumes: `cercaLuogo`, `giorniCitta`, `analizzaGiorni`.
- Produces:
  - `calcolaGiorni({luogo: Luogo, dal: string, al: string, oggi: string}, fonti = {giorniCitta}) -> Promise<{righe, note}>`;
  - `montaGiorni(contenitore)`.

- [ ] **Step 1: test** con fonti finte:
  - `al < dal` solleva "La data di fine è prima di quella di inizio";
  - `al` oltre 16 giorni dà la nota con l'orizzonte e le righe troncate;
  - date tutte passate sollevano "Le date richieste sono già passate";
  - ensemble null dà la nota "ensemble ECMWF non disponibile".
- [ ] **Step 2:** `node --test app/test/giorni.test.mjs` dà FAIL. Implementare, poi passed.
- [ ] **Step 3:** `montaGiorni`: città, dal e al (predefinito oggi + 6), tabella come nel §3.3, avvisi "modelli molto divisi", note.
- [ ] **Step 4: verifica nel browser:** Genova per 5 giorni mostra la tabella e l'avviso quando i modelli sono divisi; a 320 px la tabella scorre dentro il suo riquadro.
- [ ] **Step 5:** `node --test contratto/ app/test/ && pytest -v`. Tutti passed. Commit "Scheda Più giorni".
