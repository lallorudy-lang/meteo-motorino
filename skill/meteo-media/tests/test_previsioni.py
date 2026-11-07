"""Test solo Python della skill: download, fuso orario, server della mappa."""
import importlib.util
import io
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

import pytest

SCRIPTS = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "scripts")


def carica_previsioni():
    sys.path.insert(0, SCRIPTS)
    spec = importlib.util.spec_from_file_location("previsioni", os.path.join(SCRIPTS, "previsioni.py"))
    modulo = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(modulo)
    return modulo


@pytest.fixture
def P():
    return carica_previsioni()


@pytest.fixture
def pagina():
    f = tempfile.NamedTemporaryFile(suffix=".html", delete=False)
    f.write(b"<html>ok</html>")
    f.close()
    yield f.name
    os.unlink(f.name)


def test_adesso_locale_segnala_fallback(P):
    assert P.adesso_locale("Fuso/Inesistente")[1] is False
    assert P.adesso_locale("Europe/Rome")[1] is True


def test_errore_curl_e_eccezione_gestibile(P, monkeypatch):
    def urlopen_rotto(*a, **k):
        raise urllib.error.URLError("CERTIFICATE_VERIFY_FAILED")

    class Esito:
        returncode = 22
        stderr = "HTTP 503"
        stdout = ""

    monkeypatch.setattr(P.urllib.request, "urlopen", urlopen_rotto)
    monkeypatch.setattr(P.subprocess, "run", lambda *a, **k: Esito())
    with pytest.raises(P.ErroreDownload):
        P.scarica("https://x")


def test_server_morto_nessun_url(P, pagina, monkeypatch):
    class Morto:
        def __init__(self, *a, **k):
            self.stdout = io.StringIO("")

        def poll(self):
            return 1

        def terminate(self):
            pass

    import select
    monkeypatch.setattr(P.subprocess, "Popen", Morto)
    monkeypatch.setattr(select, "select", lambda r, w, x, t: (r, [], []))
    assert P.apri_mappa(pagina) == (None, False)


def test_browser_non_aperto(P, pagina, monkeypatch):
    import webbrowser
    monkeypatch.setattr(webbrowser, "open", lambda url: False)
    url, aperto = P.apri_mappa(pagina, minuti=0.05)
    try:
        assert url is not None and url.startswith("http://127.0.0.1:")
        assert aperto is False
    finally:
        subprocess.run(["pkill", "-f", pagina])


def test_servi_mappa_solo_quel_file(pagina):
    proc = subprocess.Popen([sys.executable, "-I", os.path.join(SCRIPTS, "servi_mappa.py"), pagina, "0", "0.05"],
                            stdout=subprocess.PIPE, text=True)
    try:
        riga = proc.stdout.readline().strip()
        assert riga.startswith("PORTA ")
        porta = int(riga[6:])
        base = f"http://127.0.0.1:{porta}"
        nome = os.path.basename(pagina)
        assert urllib.request.urlopen(f"{base}/{nome}").status == 200
        for percorso in ("/altro", "/../etc/passwd"):
            with pytest.raises(urllib.error.HTTPError) as e:
                urllib.request.urlopen(base + percorso)
            assert e.value.code == 404
    finally:
        proc.terminate()
