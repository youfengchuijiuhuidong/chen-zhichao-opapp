#!/usr/bin/env python3
"""第6章专属动画自测：命中 OP_ANIMS、无 JS 报错、phase 像素差、滑块有效。"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
CH6 = [o for o in DATA["operators"] if o.get("ch") == 6]
SHOT = APP / "tools" / "_ch6_shots"
OUT = APP / "tools" / "_ch6_check.json"

PIXEL = """() => {
  const c = document.getElementById('demo');
  if (!c) return {blank:true, sum:0, nonempty:0, cells:[]};
  const ctx = c.getContext('2d', {willReadFrequently:true});
  const w = c.width, h = c.height;
  const d = ctx.getImageData(0, 0, w, h).data;
  let sum = 0, nonempty = 0;
  const cells = new Array(16).fill(0);
  const step = 8;
  for (let i = 0; i < d.length; i += step * 4) {
    const s = d[i] + d[i+1] + d[i+2];
    sum += s;
    if (s > 12) nonempty++;
    const px = (i / 4) % w;
    const py = ((i / 4) / w) | 0;
    const cx = Math.min(3, (px / w * 4) | 0);
    const cy = Math.min(3, (py / h * 4) | 0);
    cells[cy * 4 + cx] += s;
  }
  return {blank: nonempty < 8, sum, nonempty, cells, w, h};
}"""


def l1(a, b):
    if not a or not b:
        return 0
    n = min(len(a), len(b))
    return sum(abs(a[i] - b[i]) for i in range(n))


def run(base: str, round_id: int):
    SHOT.mkdir(parents=True, exist_ok=True)
    report = {
        "round": round_id,
        "total": len(CH6),
        "pages": [],
        "failed": [],
        "no_custom": [],
        "js_exceptions": [],
        "console_errors": [],
        "canvas_blank": [],
        "phase_weak": [],
        "slider_weak": [],
        "ok": [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/usr/bin/google-chrome",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 860})
        logs: list[dict] = []

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
        page.wait_for_timeout(250)

        ids_on_page = page.evaluate("() => (window.__CH6_IDS || Object.keys(window.OP_ANIMS||{})).slice()")
        report["registered"] = ids_on_page

        for o in CH6:
            oid = o["id"]
            nstep = len(o.get("steps") or [1, 2, 3, 4])
            sliders = o.get("sliders") or []
            logs.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(380)
            page.evaluate(
                """() => {
                  const b = document.getElementById('play');
                  if (b && /暂停/.test(b.textContent||'')) b.click();
                }"""
            )
            page.wait_for_timeout(80)

            meta = page.evaluate(
                """(oid) => {
                  const hit = !!(window.OP_ANIMS && window.OP_ANIMS[oid]);
                  const title = document.querySelector('.op-head h1') && document.querySelector('.op-head h1').textContent;
                  const cap = document.getElementById('cap') && document.getElementById('cap').textContent;
                  return {hit, title, cap, ready: !!window.__CH6_READY};
                }""",
                oid,
            )
            custom = bool(meta.get("hit"))
            rec = {"id": oid, "name": o.get("name"), "custom": custom, "title": meta.get("title"), "phases": []}

            if not custom:
                report["no_custom"].append(oid)

            phase_pix = []
            for ph in range(nstep):
                page.evaluate(
                    """({oid, ph}) => {
                      window.__CH6_FORCE = {id: oid, phase: ph, frac: 0.85};
                    }""",
                    {"oid": oid, "ph": ph},
                )
                page.wait_for_timeout(70)
                pix = page.evaluate(PIXEL)
                rec["phases"].append({"phase": ph, "sum": pix.get("sum"), "nonempty": pix.get("nonempty"), "blank": pix.get("blank")})
                phase_pix.append(pix)
                if round_id <= 3 and ph in (0, 2) or (round_id >= 2 and ph == nstep - 1):
                    canvas = page.locator("#demo")
                    canvas.screenshot(path=str(SHOT / f"r{round_id}_{oid}_p{ph}.png"))

            # phase pairwise L1
            min_l1 = 1e18
            for i in range(len(phase_pix)):
                for j in range(i + 1, len(phase_pix)):
                    d = l1(phase_pix[i].get("cells"), phase_pix[j].get("cells"))
                    min_l1 = min(min_l1, d)
            rec["phase_min_l1"] = min_l1 if min_l1 < 1e17 else 0
            if any(p.get("blank") for p in rec["phases"]):
                report["canvas_blank"].append(oid)
            if rec["phase_min_l1"] < 4000:
                report["phase_weak"].append(oid)

            # slider
            rec["slider"] = None
            if sliders:
                sk = sliders[0]["key"]
                lo, hi = sliders[0]["min"], sliders[0]["max"]
                page.evaluate(
                    """({oid, key, val}) => {
                      window.__CH6_FORCE = {id: oid, phase: 2, frac: 0.85};
                      const inp = document.querySelector('#sliders input[data-k=\"'+key+'\"]');
                      if (!inp) return false;
                      inp.value = String(val);
                      inp.dispatchEvent(new Event('input', {bubbles:true}));
                      return true;
                    }""",
                    {"oid": oid, "key": sk, "val": lo},
                )
                page.wait_for_timeout(90)
                a = page.evaluate(PIXEL)
                page.evaluate(
                    """({oid, key, val}) => {
                      const inp = document.querySelector('#sliders input[data-k=\"'+key+'\"]');
                      if (!inp) return false;
                      inp.value = String(val);
                      inp.dispatchEvent(new Event('input', {bubbles:true}));
                      return true;
                    }""",
                    {"oid": oid, "key": sk, "val": hi},
                )
                page.wait_for_timeout(90)
                b = page.evaluate(PIXEL)
                sd = l1(a.get("cells"), b.get("cells"))
                rec["slider"] = {"key": sk, "l1": sd, "sumA": a.get("sum"), "sumB": b.get("sum")}
                if sd < 2500:
                    report["slider_weak"].append(oid)
                if round_id >= 2:
                    page.locator("#demo").screenshot(path=str(SHOT / f"r{round_id}_{oid}_slider_hi.png"))

            # light theme one frame
            if oid == CH6[0]["id"] or oid == CH6[-1]["id"]:
                page.evaluate('document.documentElement.setAttribute("data-theme","light")')
                page.wait_for_timeout(60)
                rec["light_blank"] = page.evaluate(PIXEL).get("blank")
                page.locator("#demo").screenshot(path=str(SHOT / f"r{round_id}_{oid}_light.png"))
                page.evaluate('document.documentElement.setAttribute("data-theme","dark")')

            if logs:
                rec["console"] = list(logs)
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            page.evaluate("() => { window.__CH6_FORCE = null; }")

            if custom and oid not in report["canvas_blank"] and oid not in report["phase_weak"] and oid not in report["slider_weak"]:
                report["ok"].append(oid)
            if not meta.get("title"):
                report["failed"].append(oid)
            report["pages"].append(rec)
            print(
                f"  {oid:32s} custom={custom} phaseL1={rec['phase_min_l1']:.0f} slider={rec.get('slider')}",
                flush=True,
            )

        browser.close()

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("total", report["total"], "ok", len(report["ok"]))
    print("no_custom", report["no_custom"])
    print("canvas_blank", report["canvas_blank"])
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("console_errors", len(report["console_errors"]))
    print("js_exceptions", report["js_exceptions"])
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8766"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    bad = r["failed"] or r["no_custom"] or r["canvas_blank"] or r["js_exceptions"]
    sys.exit(1 if bad else 0)
