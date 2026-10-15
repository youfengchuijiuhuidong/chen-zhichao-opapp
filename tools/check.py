#!/usr/bin/env python3
"""Headless check: home + every operator page. Writes JSON report."""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
OUT = APP / "tools" / "_check_report.json"


def run(base: str, round_id: int):
    ids = [o["id"] for o in DATA["operators"]]
    report = {
        "round": round_id,
        "total": len(ids),
        "home_ok": False,
        "pages": [],
        "console_errors": [],
        "failed": [],
        "katex_empty": [],
        "canvas_blank": [],
        "js_exceptions": [],
        "static_anim": [],
        "katex_error": [],
        "search_hits": 0,
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/usr/bin/google-chrome-stable",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        logs = []

        def on_console(msg):
            text = msg.text or ""
            if msg.type == "warning" and "willReadFrequently" in text:
                return
            if msg.type in ("error", "warning"):
                logs.append({"type": msg.type, "text": text, "where": page.url})

        def on_page_error(exc):
            report["js_exceptions"].append({"url": page.url, "error": str(exc)})

        page.on("console", on_console)
        page.on("pageerror", on_page_error)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(400)
        home = page.evaluate(
            """() => ({
              ops: window.APP_DATA && window.APP_DATA.operators.length,
              graph: !!document.querySelector('#graph g'),
              nodes: document.querySelectorAll('#graph .node').length,
              katex: document.querySelectorAll('.katex').length
            })"""
        )
        report["home"] = home
        report["home_ok"] = bool(home and home.get("ops") == 127 and home.get("nodes", 0) > 50)
        page.fill("#q", "ELBO")
        page.wait_for_timeout(150)
        report["search_hits"] = page.evaluate("() => document.querySelectorAll('#res [data-id]').length")
        page.fill("#q", "")
        page.wait_for_timeout(80)

        for i, oid in enumerate(ids):
            logs.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(280)
            info = page.evaluate(
                """() => {
                  function sample() {
                    const c = document.getElementById('demo');
                    if (!c) return {blank:true, px:0, w:0};
                    const ctx = c.getContext('2d', { willReadFrequently: true });
                    const w = c.width, h = c.height;
                    const d = ctx.getImageData(0, 0, w, h).data;
                    let sum = 0, nonempty = 0;
                    for (let i = 0; i < d.length; i += 8) {
                      const s = d[i]+d[i+1]+d[i+2];
                      sum += s;
                      if (s > 12) nonempty++;
                    }
                    return {blank: nonempty < 8, px: sum, w};
                  }
                  const s1 = sample();
                  return {
                    title: document.querySelector('.op-head h1') && document.querySelector('.op-head h1').textContent,
                    katex: document.querySelectorAll('#math .katex').length,
                    katexErr: document.querySelectorAll('.katex-error').length,
                    fallback: document.querySelectorAll('.katex-fallback').length,
                    play: !!document.getElementById('play'),
                    canvas: !!document.getElementById('demo'),
                    blank: s1.blank,
                    px: s1.px,
                    caption: document.getElementById('cap') && document.getElementById('cap').textContent
                  };
                }"""
            )
            page.wait_for_timeout(480)
            info2 = page.evaluate(
                """() => {
                  const c = document.getElementById('demo');
                  if (!c) return 0;
                  const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0,0,c.width,c.height).data;
                  let sum = 0;
                  for (let i = 0; i < d.length; i += 8) sum += d[i]+d[i+1]+d[i+2];
                  return sum;
                }"""
            )
            info["px2"] = info2
            info["delta"] = abs(info2 - info.get("px", 0))
            rec = {"id": oid, **info, "console": list(logs)}
            report["pages"].append(rec)
            if not info.get("title"):
                report["failed"].append(oid)
            if info.get("katex", 0) < 1:
                report["katex_empty"].append(oid)
            if info.get("katexErr"):
                report.setdefault("katex_error", []).append(oid)
            if info.get("blank"):
                report["canvas_blank"].append(oid)
            if info.get("delta", 0) < 80:
                report["static_anim"].append(oid)
            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            if (i + 1) % 20 == 0:
                print(f"  checked {i+1}/{len(ids)}", flush=True)

        # light theme smoke
        page.evaluate('document.documentElement.setAttribute("data-theme","light")')
        page.evaluate('location.hash = "#/"')
        page.wait_for_timeout(200)
        report["light_home_nodes"] = page.evaluate("() => document.querySelectorAll('#graph .node').length")

        browser.close()

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("home_ok", report["home_ok"], report.get("home"))
    print("failed", report["failed"])
    print("katex_empty", report["katex_empty"])
    print("canvas_blank", len(report["canvas_blank"]), report["canvas_blank"][:12])
    print("console_errors", len(report["console_errors"]))
    print("js_exceptions", report["js_exceptions"])
    print("katex_error", report.get("katex_error"))
    print("search_hits", report.get("search_hits"))
    print("static_anim", len(report.get("static_anim") or []), (report.get("static_anim") or [])[:20])
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    bad = r["failed"] or r["katex_empty"] or r["canvas_blank"] or r["js_exceptions"] or r.get("katex_error")
    sys.exit(1 if bad else 0)
