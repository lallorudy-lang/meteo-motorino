#!/usr/bin/env python3
# Server locale per Meteo Motorino: serve la cartella app/ senza copie in memoria nel browser.
import functools
import http.server
import sys


class SenzaCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, max-age=0")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    porta, cartella = int(sys.argv[1]), sys.argv[2]
    http.server.ThreadingHTTPServer(
        ("127.0.0.1", porta), functools.partial(SenzaCache, directory=cartella)
    ).serve_forever()
