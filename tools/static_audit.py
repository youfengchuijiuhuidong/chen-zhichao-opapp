#!/usr/bin/env python3
"""Validate mindmap ↔ operators.json completeness without a browser."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"


def load_mindmap_ids():
    html = (ROOT / "mindmap.html").read_text(encoding="utf-8")
    m = re.search(r'<script id="data" type="application/json">(.*?)</script>', html, re.S)
    D = json.loads(m.group(1))
    return [o["id"] for o in D["operators"]], D


def main():
    mm_ids, mm = load_mindmap_ids()
    data = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
    ops = data["operators"]
    ids = [o["id"] for o in ops]
    bad = []
    if ids != mm_ids:
        missing = [i for i in mm_ids if i not in ids]
        extra = [i for i in ids if i not in mm_ids]
        if missing:
            bad.append(f"missing vs mindmap: {missing}")
        if extra:
            bad.append(f"extra vs mindmap: {extra}")
        if not missing and not extra and ids != mm_ids:
            bad.append("id order differs from mindmap")
    required = ("name", "name_en", "ch", "katex", "intuition", "steps", "pseudo", "apps", "pros", "cons", "refs", "demo")
    for o in ops:
        for k in required:
            if not o.get(k):
                bad.append(f"{o['id']} empty {k}")
        if not o.get("sliders"):
            bad.append(f"{o['id']} no sliders")
        if len(o.get("refs") or []) < 1:
            bad.append(f"{o['id']} no refs")
        for r in o.get("refs") or []:
            if not (r.get("url") or "").startswith("http"):
                bad.append(f"{o['id']} bad url {r}")
    print("mindmap_total", len(mm_ids), "json_total", len(ops), "edges", data["meta"]["edges"])
    print("by_chapter", data["meta"]["by_chapter"])
    if bad:
        print("FAIL", len(bad))
        for line in bad[:40]:
            print(" ", line)
        sys.exit(1)
    print("static_audit_ok")


if __name__ == "__main__":
    main()
