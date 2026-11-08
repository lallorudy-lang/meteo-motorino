#!/bin/bash
# Avvia Meteo Motorino sul Mac: fa partire il server dell'app e apre il browser.
# Doppio clic su questo file. Per chiudere, premi Ctrl+C in questa finestra.

QUI="$(cd "$(dirname "$0")" && pwd)"
APP="$QUI/app"
[ -d "$APP" ] || { echo "Cartella app non trovata."; read -n 1 -s -r -p "Premi un tasto per chiudere."; exit 1; }

PORTA=8766
URL="http://localhost:$PORTA/index.html"
SERVER=""

pulisci() {
  if [ -n "$SERVER" ]; then kill "$SERVER" 2>/dev/null; fi
  echo "Meteo Motorino fermato."
  exit 0
}
trap pulisci INT TERM

# Ferma un eventuale server precedente su questa porta, così parte sempre la versione attuale.
lsof -ti "tcp:$PORTA" -sTCP:LISTEN 2>/dev/null | xargs -r kill 2>/dev/null
sleep 0.5
python3 "$QUI/servi_locale.py" "$PORTA" "$APP" >/dev/null 2>&1 &
SERVER=$!
if true; then
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    curl -s -o /dev/null --max-time 1 "$URL" && break
    sleep 0.5
  done
fi

open "$URL"
echo "Meteo Motorino è aperto nel browser: $URL"
echo "Lascia questa finestra aperta mentre lo usi. Per chiudere, premi Ctrl+C."

if [ -n "$SERVER" ]; then
  wait "$SERVER"
else
  read -r -p "Premi Invio per chiudere questa finestra."
fi
