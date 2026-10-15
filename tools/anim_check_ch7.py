#!/usr/bin/env python3
"""第7章动画自测：命中 OP_ANIMS、无 JS 异常、phase 像素差、滑块有效、截图。"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
CH7 = [o for o in DATA["operators"] if o.get("ch") == 7]
SHOT = APP / "tools" / "_ch7_shots"
SHOT.mkdir(parents=True, exist_ok=True)
OUT = APP / "tools" / "_ch7_check.json"

CHROME = "/usr/bin/google-chrome"
if not Path(CHROME).exists():
    CHROME = "/usr/bin/google-chrome-stable"


def sample_px(page):
    return page.evaluate(
        """() => {
          const c = document.getElementById('demo');
          if (!c) return {blank:true, sum:0, nonempty:0, w:0, h:0};
          const ctx = c.getContext('2d', {willReadFrequently:true});
          const w = c.width, h = c.height;
          const d = ctx.getImageData(0,0,w,h).data;
          let sum=0, nonempty=0;
          for (let i=0;i<d.length;i+=8){
            const s=d[i]+d[i+1]+d[i+2];
            sum+=s;
            if (s>12) nonempty++;
          }
          return {blank: nonempty<8, sum, nonempty, w, h};
        }"""
    )


def set_phase(page, phase):
    page.evaluate(
        """(ph) => {
          const S = window.__CH7_S;
          if (!S) return false;
          S.playing = false;
          S.phase = ph;
          S.t = ph * 2.4 + 0.55;
          return true;
        }""",
        phase,
    )
    page.wait_for_timeout(90)


def set_slider(page, key, value):
    return page.evaluate(
        """({key, value}) => {
          const inp = document.querySelector(`#sliders input[data-k="${key}"]`);
          if (!inp) return {ok:false};
          inp.value = String(value);
          inp.dispatchEvent(new Event('input', {bubbles:true}));
          return {ok:true, value};
        }""",
        {"key": key, "value": value},
    )


def run(base: str, rnd: int):
    report = {
        "round": rnd,
        "n_ops": len(CH7),
        "ids": [o["id"] for o in CH7],
        "pages": [],
        "failed": [],
        "js_exceptions": [],
        "console_errors": [],
        "miss_custom": [],
        "blank": [],
        "phase_weak": [],
        "slider_weak": [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path=CHROME,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        logs = []

        def on_console(msg):
            text = msg.text or ""
            if "willReadFrequently" in text:
                return
            if msg.type in ("error", "warning"):
                logs.append({"type": msg.type, "text": text})

        def on_err(exc):
            report["js_exceptions"].append({"url": page.url, "error": str(exc)})

        page.on("console", on_console)
        page.on("pageerror", on_err)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(300)

        catalog = page.evaluate(
            """() => {
              const ids = (window.APP_DATA.operators||[]).filter(o=>o.ch===7).map(o=>o.id);
              const hit = {};
              for (const id of ids) {
                const a = (window.OP_ANIMS||{})[id];
                hit[id] = !!(a && a.init && a.tick && a.draw);
              }
              return {ids, hit, nHit: Object.values(hit).filter(Boolean).length};
            }"""
        )
        report["catalog"] = catalog

        for op in CH7:
            oid = op["id"]
            logs.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(450)
            meta = page.evaluate(
                """(id) => {
                  const a = (window.OP_ANIMS||{})[id];
                  const play = document.getElementById('play');
                  if (play && play.textContent.includes('暂停')) play.click();
                  return {
                    title: document.querySelector('.op-head h1') && document.querySelector('.op-head h1').textContent,
                    custom: !!(a && a.init && a.tick && a.draw),
                    hasS: !!window.__CH7_S,
                    opId: window.__CH7_S && window.__CH7_S.opId,
                    nSteps: (window.__CH7_S && window.__CH7_S.steps && window.__CH7_S.steps.length) || 0,
                    sliderKeys: [...document.querySelectorAll('#sliders input[data-k]')].map(i=>i.dataset.k)
                  };
                }""",
                oid,
            )
            nph = max(1, meta.get("nSteps") or len(op.get("steps") or [1]))
            phases = []
            for ph in range(nph):
                set_phase(page, ph)
                px = sample_px(page)
                shot = SHOT / f"r{rnd}_{oid}_p{ph}.png"
                canvas = page.query_selector("#demo")
                if canvas:
                    canvas.screenshot(path=str(shot))
                phases.append({"ph": ph, "sum": px.get("sum"), "nonempty": px.get("nonempty"), "blank": px.get("blank"), "shot": str(shot.name)})

            # slider: pick first non-speed key
            keys = [k for k in (meta.get("sliderKeys") or []) if k != "speed"]
            slider = None
            if keys:
                key = keys[0]
                spec = next((s for s in (op.get("sliders") or []) if s["key"] == key), None)
                lo = spec["min"] if spec else 0.3
                hi = spec["max"] if spec else 2.0
                set_phase(page, min(1, nph - 1))
                set_slider(page, key, lo)
                page.wait_for_timeout(80)
                a = sample_px(page)
                page.query_selector("#demo").screenshot(path=str(SHOT / f"r{rnd}_{oid}_slo.png"))
                set_slider(page, key, hi)
                page.wait_for_timeout(80)
                b = sample_px(page)
                page.query_selector("#demo").screenshot(path=str(SHOT / f"r{rnd}_{oid}_shi.png"))
                slider = {"key": key, "lo": lo, "hi": hi, "dsum": abs((b.get("sum") or 0) - (a.get("sum") or 0)), "a": a.get("sum"), "b": b.get("sum")}

            diffs = []
            for i in range(1, len(phases)):
                diffs.append(abs((phases[i]["sum"] or 0) - (phases[i - 1]["sum"] or 0)))
            min_phase = min(diffs) if diffs else 0
            rec = {
                "id": oid,
                "name": op.get("name"),
                **meta,
                "phases": phases,
                "phase_diffs": diffs,
                "min_phase_diff": min_phase,
                "slider": slider,
                "console": list(logs),
            }
            report["pages"].append(rec)
            if not meta.get("title"):
                report["failed"].append(oid)
            if not meta.get("custom") or meta.get("opId") != oid:
                report["miss_custom"].append(oid)
            if any(p.get("blank") for p in phases):
                report["blank"].append(oid)
            if min_phase < 400:
                report["phase_weak"].append({"id": oid, "min": min_phase, "diffs": diffs})
            if slider and slider["dsum"] < 200:
                report["slider_weak"].append({"id": oid, **slider})
            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            print(f"  {oid:44s} custom={meta.get('custom')} phase_min={min_phase:8.0f} slider={slider and slider['dsum']}", flush=True)

        # light theme one op
        page.evaluate('document.documentElement.setAttribute("data-theme","light")')
        page.evaluate(f'location.hash = "#/op/{CH7[0]["id"]}"')
        page.wait_for_timeout(400)
        page.evaluate("() => { const p=document.getElementById('play'); if(p&&p.textContent.includes('暂停')) p.click(); }")
        set_phase(page, 1)
        light = sample_px(page)
        page.query_selector("#demo").screenshot(path=str(SHOT / f"r{rnd}_light.png"))
        report["light"] = light

        browser.close()

    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("miss_custom", report["miss_custom"])
    print("blank", report["blank"])
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("js_exceptions", report["js_exceptions"])
    print("console_errors", len(report["console_errors"]))
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8767"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    bad = r["failed"] or r["miss_custom"] or r["blank"] or r["js_exceptions"] or r["phase_weak"] or r["slider_weak"]
    sys.exit(1 if bad else 0)
