#!/usr/bin/env python3
"""第3章动画自检：OP_ANIMS 命中、无 JS 报错、phase/滑块像素差、截图。"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
OUT_DIR = APP / "tools" / "_ch3_shots"
REPORT = APP / "tools" / "_ch3_report.json"
CHROME = Path("/usr/bin/google-chrome-stable")
if not CHROME.exists():
    CHROME = Path("/usr/bin/google-chrome")

CH3 = [o for o in DATA["operators"] if o.get("ch") == 3]
IDS = [o["id"] for o in CH3]


def checksum(page):
    return page.evaluate(
        """() => {
          const c = document.getElementById('demo');
          if (!c) return {blank:true, px:0, nonempty:0, w:0, h:0};
          const ctx = c.getContext('2d', { willReadFrequently: true });
          const w = c.width, h = c.height;
          const d = ctx.getImageData(0, 0, w, h).data;
          let sum = 0, nonempty = 0, r=0,g=0,b=0;
          for (let i = 0; i < d.length; i += 16) {
            const s = d[i]+d[i+1]+d[i+2];
            sum += s;
            r += d[i]; g += d[i+1]; b += d[i+2];
            if (s > 18) nonempty++;
          }
          return {blank: nonempty < 8, px: sum, nonempty, w, h, r, g, b};
        }"""
    )


def pixel_diff(a, b):
    if not a or not b:
        return 0
    return abs(a.get("px", 0) - b.get("px", 0)) + abs(a.get("r", 0) - b.get("r", 0)) // 8


def run(base: str, round_id: int):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        "round": round_id,
        "total": len(IDS),
        "ids": IDS,
        "pages": [],
        "failed": [],
        "not_custom": [],
        "js_exceptions": [],
        "console_errors": [],
        "phase_weak": [],
        "slider_weak": [],
        "canvas_blank": [],
        "metrics_empty": [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=str(CHROME),
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        logs = []

        def on_console(msg):
            text = msg.text or ""
            if msg.type == "warning" and "willReadFrequently" in text:
                return
            if msg.type in ("error", "warning"):
                logs.append({"type": msg.type, "text": text})

        def on_err(exc):
            report["js_exceptions"].append({"url": page.url, "error": str(exc)})

        page.on("console", on_console)
        page.on("pageerror", on_err)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(300)

        n_anims = page.evaluate(
            """() => {
              const ids = window.__CH3_IDS || Object.keys(window.OP_ANIMS||{});
              return {n: ids.length, ids};
            }"""
        )
        report["registered"] = n_anims

        for oid in IDS:
            logs.clear()
            page.evaluate(
                """() => { window.__CH3_FORCE_PHASE = null; window.__CH3_FREEZE = false; }"""
            )
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(380)
            page.evaluate(
                """() => {
                  window.__CH3_FREEZE = true;
                  const b = document.getElementById('play');
                  if (b && (b.textContent || '').indexOf('暂停') >= 0) b.click();
                }"""
            )
            page.wait_for_timeout(120)

            meta = page.evaluate(
                """(id) => {
                  const cap = document.getElementById('cap');
                  const met = document.getElementById('met');
                  const steps = [...document.querySelectorAll('#steplist li')].map(li => li.textContent);
                  const sliders = [...document.querySelectorAll('#sliders input[data-k]')].map(i => ({
                    k: i.dataset.k, min:i.min, max:i.max, value:i.value
                  }));
                  return {
                    title: document.querySelector('.op-head h1') && document.querySelector('.op-head h1').textContent,
                    hit: !!(window.OP_ANIMS && window.OP_ANIMS[id] && window.OP_ANIMS[id].draw),
                    cap: cap && cap.textContent,
                    metrics: met && met.textContent,
                    steps, sliders,
                    err: document.body.innerText.includes('动画错误')
                  };
                }""",
                oid,
            )
            rec = {"id": oid, **meta, "phases": [], "slider": None}
            if not meta.get("hit"):
                report["not_custom"].append(oid)
            if not meta.get("title"):
                report["failed"].append(oid)
            if meta.get("err"):
                report["failed"].append(oid + ":anim_err")
            if not (meta.get("metrics") or "").strip():
                report["metrics_empty"].append(oid)

            nstep = max(1, len(meta.get("steps") or []))
            samples = []
            for ph in range(nstep):
                page.evaluate(
                    """(ph) => { window.__CH3_FORCE_PHASE = ph; }""",
                    ph,
                )
                page.wait_for_timeout(220)
                samp = checksum(page)
                samples.append(samp)
                shot = OUT_DIR / f"r{round_id}_{oid}_p{ph}.png"
                canvas = page.locator("#demo")
                canvas.screenshot(path=str(shot))
                rec["phases"].append({"ph": ph, **samp, "shot": shot.name})
                if samp.get("blank"):
                    report["canvas_blank"].append(f"{oid}:p{ph}")

            # phase pairwise diffs
            diffs = []
            for i in range(len(samples)):
                for j in range(i + 1, len(samples)):
                    diffs.append(pixel_diff(samples[i], samples[j]))
            rec["phase_min_diff"] = min(diffs) if diffs else 0
            rec["phase_diffs"] = diffs
            if rec["phase_min_diff"] < 400:
                report["phase_weak"].append({"id": oid, "min": rec["phase_min_diff"]})

            # slider
            sliders = [s for s in (meta.get("sliders") or []) if s["k"] != "speed"]
            if sliders:
                sl = sliders[0]
                page.evaluate("(ph)=>{window.__CH3_FORCE_PHASE=ph;}", 1 if nstep > 1 else 0)
                page.wait_for_timeout(120)
                s0 = checksum(page)
                page.evaluate(
                    """(arg) => {
                      const inp = document.querySelector('#sliders input[data-k="'+arg.k+'"]');
                      if (!inp) return false;
                      inp.value = arg.v;
                      inp.dispatchEvent(new Event('input', {bubbles:true}));
                      return true;
                    }""",
                    {"k": sl["k"], "v": sl["max"]},
                )
                page.wait_for_timeout(220)
                s1 = checksum(page)
                rec["slider"] = {
                    "key": sl["k"],
                    "from": sl["value"],
                    "to": sl["max"],
                    "diff": pixel_diff(s0, s1),
                    "s0": s0,
                    "s1": s1,
                }
                shot = OUT_DIR / f"r{round_id}_{oid}_slider.png"
                page.locator("#demo").screenshot(path=str(shot))
                if rec["slider"]["diff"] < 250:
                    report["slider_weak"].append({"id": oid, "key": sl["k"], "diff": rec["slider"]["diff"]})
                # restore mid
                page.evaluate(
                    """(arg) => {
                      const inp = document.querySelector('#sliders input[data-k="'+arg.k+'"]');
                      if (!inp) return;
                      inp.value = arg.v;
                      inp.dispatchEvent(new Event('input', {bubbles:true}));
                    }""",
                    {"k": sl["k"], "v": sl["value"]},
                )

            if logs:
                rec["console"] = list(logs)
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            rec["js_ok"] = not any(x.get("url", "").endswith(oid) for x in report["js_exceptions"])
            report["pages"].append(rec)
            print(
                f"  {oid:28s} hit={meta.get('hit')} phase_min={rec['phase_min_diff']:8.0f} "
                f"slider={(rec['slider'] or {}).get('diff', -1):8.0f} blank={[p.get('blank') for p in rec['phases']]}",
                flush=True,
            )

        # light theme one page
        page.evaluate('document.documentElement.setAttribute("data-theme","light")')
        page.evaluate(f'location.hash = "#/op/{IDS[0]}"')
        page.wait_for_timeout(400)
        page.evaluate("() => { window.__CH3_FORCE_PHASE = 1; }")
        page.wait_for_timeout(200)
        page.locator("#demo").screenshot(path=str(OUT_DIR / f"r{round_id}_light_{IDS[0]}.png"))
        report["light"] = checksum(page)

        page.evaluate("() => { window.__CH3_FORCE_PHASE = null; }")
        browser.close()

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("registered", report.get("registered"))
    print("not_custom", report["not_custom"])
    print("failed", report["failed"])
    print("js_exceptions", report["js_exceptions"])
    print("console_errors", len(report["console_errors"]))
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("canvas_blank", report["canvas_blank"])
    print("metrics_empty", report["metrics_empty"])
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8765"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    nreg = (r.get("registered") or {}).get("n", 0)
    if nreg < r["total"]:
        print("INCOMPLETE registry", nreg, r["total"])
        sys.exit(1)
    sys.exit(1 if (r["failed"] or r["not_custom"] or r["js_exceptions"] or r["canvas_blank"]) else 0)
