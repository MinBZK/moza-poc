#!/usr/bin/env python3
"""Haalt de engine-traces van Koen uit een TRACE=1-run van de BDD-suite van regelrecht
(trace_output/*.json) en schrijft ze als data voor het prototype: per wet en uitkomst de
gegevens (parameters), alle tussenuitkomsten, het resultaat en de stappen met hun anker
(artikel, lid). Het prototype toont wat de engine deed; het rekent zelf niets.

Gebruik: python3 script/da-traces.py <trace_output-map> <uit.json> [bsn]
"""
import json
import re
import sys
from pathlib import Path

bron = Path(sys.argv[1])
uit = Path(sys.argv[2])
bsn = sys.argv[3] if len(sys.argv) > 3 else "999990101"

# Welke traces het prototype gebruikt: (wet, hoofd-uitkomst). Het eerste bestand van Koen
# met die wet en uitkomst wint; de scenariotitel gaat mee ter controle.
GEWENST = [
    ("participatiewet", "heeft_recht_op_lks"),
    ("participatiewet", "heeft_aanspraak_op_begeleiding_op_de_werkplek"),
    ("participatiewet", "mag_proefplaatsing_aangaan"),
    ("wet_tegemoetkomingen_loondomein", "heeft_recht_op_lkv"),
    ("ziektewet", "heeft_recht_op_no_risk_polis"),
    ("wet_financiering_sociale_verzekeringen", "is_arbeidsbeperkte"),
    ("wet_arbeidsongeschiktheidsvoorziening_jonggehandicapten", "heeft_recht_op_loondispensatie"),
]


def stappen(node, diepte=0, acc=None):
    """Platte lijst van de boom: per knoop het type, de boodschap en het anker (artikel/lid)."""
    acc = [] if acc is None else acc
    anker = node.get("anchor") or {}
    acc.append({
        "diepte": diepte,
        "soort": node.get("node_type"),
        "naam": node.get("name"),
        "tekst": node.get("message", ""),
        "wet": anker.get("law"),
        "artikel": anker.get("article"),
        "lid": anker.get("paragraph") or anker.get("lid"),
        "resultaat": node.get("result") if not isinstance(node.get("result"), dict) else None,
    })
    for kind in node.get("children", []):
        stappen(kind, diepte + 1, acc)
    return acc


def main():
    resultaat = {}
    for pad in sorted(bron.glob("*.json")):
        try:
            d = json.loads(pad.read_text())
        except Exception:
            continue
        if str(d.get("parameters", {}).get("bsn")) != bsn:
            continue
        sleutel = (d.get("law"), d.get("output"))
        if sleutel not in GEWENST or f"{sleutel[0]}:{sleutel[1]}" in resultaat:
            continue
        boom = stappen(d["trace"])
        resultaat[f"{sleutel[0]}:{sleutel[1]}"] = {
            "wet": d["law"],
            "uitkomst": d["output"],
            "peildatum": d["calculation_date"],
            "scenario": d.get("scenario"),
            "bestand": pad.name,
            "gegevens": d.get("parameters", {}),
            "gevraagd": d.get("requested_outputs", []),
            "tussenuitkomsten": d.get("outputs", {}),
            "resultaat": d["trace"].get("result", {}),
            "stappen": [s for s in boom if s["soort"] != "article" or s["artikel"]],
            "ankers": sorted({(s["wet"] or d["law"], str(s["artikel"]), str(s["lid"] or "")) for s in boom if s["artikel"]}),
        }
    ontbreekt = [f"{w}:{o}" for w, o in GEWENST if f"{w}:{o}" not in resultaat]
    uit.write_text(json.dumps(resultaat, ensure_ascii=False, indent=1))
    print(f"{len(resultaat)} traces van bsn {bsn} naar {uit}; ontbreekt: {ontbreekt}")
    for k, v in resultaat.items():
        print(f"  {k}: {v['bestand']} · {len(v['stappen'])} stappen · ankers {len(v['ankers'])}")


main()
