# Meteo Motorino

Helps motorcyclists and cyclists plan a trip around the weather, mainly rain.

Choose a departure and an arrival (city and street), a day and a trip duration. The app shows the route along the roads, the best times to leave, and the amount of rain expected hour by hour, as bars and drops on a map.

## What it does

- **Departure and arrival:** pick the city first, then the street (optional; without a street the city centre is used). Suggestions appear as you type, and Enter moves to the next field.
- **Day and duration:** choose one of the next 16 days, then the trip duration in minutes (leave it empty for an estimate).
- **Route along the roads:** the route follows real roads, with points along it where the weather is checked.
- **Best departure times:** the hours when every point of the route is dry or only slightly wet.
- **Rain by hour and by day:** bars for the expected rain (millimetres), with the probability of rain.
- **Saved trips and history:** save frequent trips, and see the last result, marked as history when it is no longer current.
- **Works on a phone:** it can be added to the home screen and opens full screen.

## Data

Forecasts combine six numerical weather models (European, American, German, French, British and Italian) and the European ensemble (51 simulations of the same model), through [Open-Meteo](https://open-meteo.com) (CC BY 4.0).

Addresses come from [OpenStreetMap](https://www.openstreetmap.org/copyright) (Nominatim), maps are © OpenStreetMap contributors, and routes come from the OSRM demo server. Each of these services has its own usage rules.

The app does not use weather stations yet: real-time measurements from radar and rain gauges are planned.

Forecasts are estimates, and they can change. Do not rely on them alone for decisions about safety.

## Privacy

There is no account and no server of ours. Saved trips and the last result are stored only in your browser. Location, when you use it, is sent only to the weather and map services to get forecasts and maps.

## Run it on a Mac

Double-click `Avvia Meteo Motorino.command`. It starts a local server and opens the app in the browser. Press Ctrl+C in its window to stop it.

Or, from a terminal:

```bash
cd app
python3 -m http.server 8766
```

Then open http://localhost:8766/index.html.

## Tests

```bash
node --test app/test/ && node --test contratto/
python3 -m pytest -q
```

The rules for the calculations exist in JavaScript (`app/motore.js`) and Python (`skill/meteo-media/scripts/motore.py`). Both pass the same shared cases in `contratto/casi/`.

## Project layout

- `app/`: the web app (HTML, CSS, JavaScript modules, service worker).
- `skill/meteo-media/`: the same forecast logic as a command-line tool and a Claude skill.
- `contratto/`: shared test cases for both implementations.
- `docs/superpowers/`: the design document, the build plan and the verification notes (in Italian).

The interface is in Italian.

## License

Not yet decided.
