#!/usr/bin/env python3
"""Serve UNA sola pagina (la mappa) su http://127.0.0.1:<porta>/ per un tempo limitato.

Serve perché le tessere di OpenStreetMap richiedono una pagina web (http) e non un file
aperto dal disco. Ascolta solo sul computer locale, risponde solo a quel file e si
spegne da solo dopo il tempo indicato (default 60 minuti).

Uso: python3 servi_mappa.py <file.html> <porta> [minuti]
Con porta 0 sceglie da solo una porta libera e la scrive su una riga ("PORTA <n>"),
così chi lo avvia sa dove si trova senza rischiare di parlare con un altro server.
"""
import http.server
import os
import sys
import threading
import urllib.parse


def main():
    percorso = os.path.abspath(sys.argv[1])
    porta = int(sys.argv[2])
    minuti = float(sys.argv[3]) if len(sys.argv) > 3 else 60
    nome = "/" + urllib.parse.quote(os.path.basename(percorso))

    class Unico(http.server.BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path.split("?")[0] not in (nome, "/"):
                self.send_error(404)
                return
            try:
                with open(percorso, "rb") as f:
                    dati = f.read()
            except OSError:
                self.send_error(404)
                return
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(dati)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(dati)

        def log_message(self, *args):
            pass

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", porta), Unico)
    print(f"PORTA {srv.server_address[1]}", flush=True)
    try:
        sys.stdout.close()  # il padre ha letto la porta: da qui in poi non scriviamo più nulla
    except OSError:
        pass
    threading.Timer(minuti * 60, srv.shutdown).start()
    srv.serve_forever()


if __name__ == "__main__":
    main()
