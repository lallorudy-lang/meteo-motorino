"""Esegue i casi condivisi di contratto/casi/*.json sul motore Python della skill.

Gli stessi file sono eseguiti da contratto/contratto.test.mjs sul motore JavaScript.
"""
import glob
import json
import math
import os
import sys

import pytest

RADICE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RADICE, "skill", "meteo-media", "scripts"))
import motore  # noqa: E402

TOLLERANZA = 1e-9


def carica_casi():
    casi = []
    for percorso in sorted(glob.glob(os.path.join(RADICE, "contratto", "casi", "*.json"))):
        for caso in json.load(open(percorso, encoding="utf-8")):
            casi.append(pytest.param(caso, id=f"{os.path.basename(percorso)}: {caso['nome']}"))
    return casi


def uguali(a, b, percorso="risultato"):
    """Confronto profondo; i numeri non interi con tolleranza assoluta."""
    if isinstance(a, bool) or isinstance(b, bool):
        assert a == b, f"{percorso}: {a!r} != {b!r}"
    elif isinstance(a, (int, float)) and isinstance(b, (int, float)):
        assert math.isclose(a, b, abs_tol=TOLLERANZA, rel_tol=0), f"{percorso}: {a!r} != {b!r}"
    elif isinstance(a, dict) and isinstance(b, dict):
        assert set(a) == set(b), f"{percorso}: chiavi {sorted(a)} != {sorted(b)}"
        for k in a:
            uguali(a[k], b[k], f"{percorso}.{k}")
    elif isinstance(a, list) and isinstance(b, list):
        assert len(a) == len(b), f"{percorso}: lunghezza {len(a)} != {len(b)}"
        for i, (x, y) in enumerate(zip(a, b)):
            uguali(x, y, f"{percorso}[{i}]")
    else:
        assert a == b, f"{percorso}: {a!r} != {b!r}"


@pytest.mark.parametrize("caso", carica_casi())
def test_caso(caso):
    funzione = getattr(motore, caso["funzione"])
    risultato = json.loads(json.dumps(funzione(*caso["argomenti"])))  # tuple -> liste, chiavi -> stringhe
    uguali(risultato, caso["atteso"])
