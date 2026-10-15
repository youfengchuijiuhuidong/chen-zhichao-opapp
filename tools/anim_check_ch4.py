#!/usr/bin/env python3
"""第4章动画自测：OP_ANIMS 命中、无 JS 报错、phase/滑块像素差、截图。"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
CH4 = [o for o in DATA["operators"] if o.get("ch") == 4]
OUT_DIR = APP / "tools" / "_ch4_shots"
OUT_DIR.mkdir(parents=True, exist_ok=True)
REPORT = APP / "tools" / "_ch4_check.json"

CHROME = "/usr/bin/google-chrome-stable"
if not Path(CHROME).exists():
    CHROME = "/usr/bin/google-chrome"


def sample_js():
    return """() => {
      const c = document.getElementById('demo');
      if (!c) return {ok:false};
      const ctx = c.getContext('2d', {willReadFrequently:true});
      const w = c.width, h = c.height;
      const d = ctx.getImageData(0,0,w,h).data;
      const top = Math.floor(h*0.08), bot = Math.floor(h*0.92);
      let sum=0, nonempty=0, hash=0;
      for (let y=top; y<bot; y+=2) {
        for (let x=4; x<w-4; x+=3) {
          const i = (y*w+x)*4;
          const s = d[i]+d[i+1]+d[i+2];
          sum += s;
          if (s>18) nonempty++;
          hash = (hash*33 + s) | 0;
        }
      }
      const S = window.__CH4_S;
      const met = S && S.metrics ? Object.keys(S.metrics).length : 0;
      const cap = document.getElementById('cap');
      return {
        ok:true, w, h, sum, nonempty, hash,
        tag: S && S.sim && S.sim.tag,
        ch4: S && S.sim && S.sim.ch4,
        phase: S && S.phase,
        t: S && S.t,
        playing: S && S.playing,
        metrics: met,
        caption: cap && cap.textContent,
        hasAnim: !!(window.OP_ANIMS && window.__CH4_ID)
      };
    }"""


def set_phase_js(phase: int) -> str:
    return f"""() => {{
      const P = window.__OP_PLAYER;
      if (P && typeof P.setPhase === 'function') {{
        P.setPhase({phase});
        return true;
      }}
      const S = window.__CH4_S;
      if (!S) return false;
      S.playing = false;
      S.t = {phase} * 2.4 + 1.15;
      S.phase = {phase};
      const impl = window.OP_ANIMS && window.OP_ANIMS[S.opId || (S.sim && S.sim.tag)];
      if (impl && impl.tick) {{
        try {{ impl.tick(S, 0.03); }} catch (e) {{}}
      }}
      if (P && P.redraw) P.redraw();
      return true;
    }}"""


def set_slider_js(key: str, value: float) -> str:
    return f"""() => {{
      const P = window.__OP_PLAYER;
      if (P && typeof P.setSlider === 'function') {{
        P.setSlider({key!r}, {value});
      }}
      const S = window.__CH4_S || (P && P.S);
      if (S) S.sliders[{key!r}] = {value};
      const inp = document.querySelector('input[data-k="{key}"]');
      if (inp) {{
        inp.value = {value};
        inp.dispatchEvent(new Event('input', {{bubbles:true}}));
      }}
      const impl = window.OP_ANIMS && S && window.OP_ANIMS[S.opId || (S.sim && S.sim.tag)];
      if (impl && impl.tick && S) {{
        try {{ impl.tick(S, 0.05); impl.tick(S, 0.05); }} catch (e) {{}}
      }}
      if (P && P.redraw) P.redraw();
      return true;
    }}"""


def run(base: str, round_id: int):
    report = {
        "round": round_id,
        "total": len(CH4),
        "pages": [],
        "missing_custom": [],
        "js_exceptions": [],
        "console_errors": [],
        "blank": [],
        "phase_weak": [],
        "slider_weak": [],
        "ok": [],
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
            report["js_exceptions"].append(str(exc))

        page.on("console", on_console)
        page.on("pageerror", on_err)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(300)

        for o in CH4:
            oid = o["id"]
            logs.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(450)
            nstep = max(1, len(o.get("steps") or []))
            sliders = o.get("sliders") or []
            hit = page.evaluate(
                """(id) => ({
                  registered: !!(window.OP_ANIMS && window.OP_ANIMS[id]),
                  idNow: window.__CH4_ID || null,
                  tag: window.__CH4_S && window.__CH4_S.sim && window.__CH4_S.sim.tag,
                  canvas: !!document.getElementById('demo')
                })""",
                oid,
            )
            # pause
            page.evaluate(
                """() => {
                  const S = window.__CH4_S;
                  if (S) S.playing = false;
                  const b = document.getElementById('play');
                  if (b && b.textContent === '暂停') b.click();
                }"""
            )
            page.wait_for_timeout(80)

            phases = []
            hashes = []
            for ph in range(nstep):
                page.evaluate(set_phase_js(ph))
                page.wait_for_timeout(120)
                info = page.evaluate(sample_js())
                shot = OUT_DIR / f"r{round_id}_{oid}_p{ph}.png"
                canvas = page.locator("#demo")
                canvas.screenshot(path=str(shot))
                phases.append({"ph": ph, **(info or {}), "shot": str(shot.name)})
                hashes.append((info or {}).get("hash"))

            # slider
            slider_delta = None
            if sliders:
                s0 = sliders[0]
                page.evaluate(set_phase_js(min(2, nstep - 1)))
                page.wait_for_timeout(80)
                a = page.evaluate(sample_js())
                page.evaluate(set_slider_js(s0["key"], float(s0["max"])))
                page.wait_for_timeout(160)
                b = page.evaluate(sample_js())
                slider_delta = abs((b or {}).get("sum", 0) - (a or {}).get("sum", 0))
                shot = OUT_DIR / f"r{round_id}_{oid}_slider.png"
                page.locator("#demo").screenshot(path=str(shot))
                # restore mid
                mid = 0.5 * (float(s0["min"]) + float(s0["max"]))
                page.evaluate(set_slider_js(s0["key"], mid))

            # light theme one frame
            page.evaluate('document.documentElement.setAttribute("data-theme","light")')
            page.wait_for_timeout(80)
            page.locator("#demo").screenshot(path=str(OUT_DIR / f"r{round_id}_{oid}_light.png"))
            page.evaluate('document.documentElement.setAttribute("data-theme","dark")')

            phase_diffs = []
            for i in range(1, len(hashes)):
                phase_diffs.append(abs((hashes[i] or 0) - (hashes[i - 1] or 0)))
            min_diff = min(phase_diffs) if phase_diffs else 0
            nonempty = min((p.get("nonempty") or 0) for p in phases) if phases else 0

            rec = {
                "id": oid,
                "name": o["name"],
                "hit": bool(hit.get("registered") and hit.get("tag") == oid),
                "registered": hit.get("registered"),
                "tag": hit.get("tag"),
                "nstep": nstep,
                "phase_hashes": hashes,
                "phase_min_diff": min_diff,
                "slider_delta": slider_delta,
                "nonempty": nonempty,
                "console": list(logs),
                "phases": [
                    {k: v for k, v in p.items() if k != "ok"}
                    for p in phases
                ],
            }
            report["pages"].append(rec)
            if not rec["hit"]:
                report["missing_custom"].append(oid)
            else:
                report["ok"].append(oid)
            if nonempty < 30:
                report["blank"].append(oid)
            if min_diff < 12:
                report["phase_weak"].append(oid)
            if sliders and (slider_delta is None or slider_delta < 80):
                report["slider_weak"].append(oid)
            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            print(
                f"  {oid:32s} hit={rec['hit']} nonempty={nonempty:5d} "
                f"phDiff={min_diff:8d} slider={slider_delta}",
                flush=True,
            )

        # frame budget on last op
        ft = page.evaluate(
            """() => new Promise((resolve) => {
              const S = window.__CH4_S;
              if (S) S.playing = true;
              const t0 = performance.now();
              let n = 0;
              function loop() {
                n++;
                if (n >= 24) {
                  resolve((performance.now()-t0)/n);
                  return;
                }
                requestAnimationFrame(loop);
              }
              requestAnimationFrame(loop);
            })"""
        )
        report["frame_ms_avg"] = ft
        browser.close()

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("missing_custom", report["missing_custom"])
    print("blank", report["blank"])
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("js_exceptions", report["js_exceptions"])
    print("console_errors", len(report["console_errors"]))
    print("frame_ms_avg", report.get("frame_ms_avg"))
    print("ok", len(report["ok"]), "/", report["total"])
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8766"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    bad = r["missing_custom"] or r["blank"] or r["js_exceptions"]
    sys.exit(1 if bad else 0)
