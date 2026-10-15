#!/usr/bin/env python3
"""第5章专属动画自测：OP_ANIMS 命中、无 JS 错、phase 像素差、滑块有效。"""
from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
OUT_DIR = APP / "tools" / "_ch5_shots"
OUT_DIR.mkdir(parents=True, exist_ok=True)
REPORT = APP / "tools" / "_anim_check_ch5.json"

CH5 = [o for o in DATA["operators"] if o.get("ch") == 5]
IDS = [o["id"] for o in CH5]
STEPS_N = {o["id"]: len(o.get("steps") or [1, 2, 3, 4]) for o in CH5}
SLIDER_KEY = {}
for o in CH5:
    sl = o.get("sliders") or []
    SLIDER_KEY[o["id"]] = sl[0]["key"] if sl else None


def px_sum(page) -> int:
    return page.evaluate(
        """() => {
          const c = document.getElementById('demo');
          if (!c) return 0;
          const ctx = c.getContext('2d', { willReadFrequently: true });
          const d = ctx.getImageData(0, 0, c.width, c.height).data;
          let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) {
            s += d[i] + d[i+1] + d[i+2];
            if (d[i]+d[i+1]+d[i+2] > 20) n++;
          }
          return s;
        }"""
    )


def nonempty(page) -> bool:
    return page.evaluate(
        """() => {
          const c = document.getElementById('demo');
          if (!c) return false;
          const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0,0,c.width,c.height).data;
          let n = 0;
          for (let i = 0; i < d.length; i += 16) {
            if (d[i]+d[i+1]+d[i+2] > 18) n++;
          }
          return n > 30;
        }"""
    )


def advance_phase(page, n_steps=32):
    page.evaluate(
        """(n) => {
          const b = document.getElementById('step');
          if (!b) return;
          for (let i = 0; i < n; i++) b.click();
        }""",
        n_steps,
    )


def run(base: str, round_id: int, shot_ids=None):
    shot_ids = shot_ids or IDS
    report = {
        "round": round_id,
        "n_ops": len(IDS),
        "pages": [],
        "missing_anims": [],
        "js_exceptions": [],
        "console_errors": [],
        "phase_weak": [],
        "slider_weak": [],
        "blank": [],
        "ok": [],
    }
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=True,
            executable_path="/usr/bin/google-chrome-stable",
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

        for i, oid in enumerate(IDS):
            logs.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(350)
            hit = page.evaluate(
                f"""() => {{
                  const a = window.OP_ANIMS && window.OP_ANIMS[{oid!r}];
                  return !!(a && typeof a.init === 'function' && typeof a.tick === 'function' && typeof a.draw === 'function');
                }}"""
            )
            if not hit:
                report["missing_anims"].append(oid)

            # 暂停 + 重置，从 phase0 开始
            page.evaluate(
                """() => {
                  const p = document.getElementById('play');
                  if (p) p.click();
                  const r = document.getElementById('reset');
                  if (r) r.click();
                }"""
            )
            page.wait_for_timeout(120)
            # 若仍在播放则再点一次暂停
            playing = page.evaluate(
                """() => {
                  const p = document.getElementById('play');
                  return p && p.textContent.includes('暂停');
                }"""
            )
            if playing:
                page.click("#play")
                page.wait_for_timeout(40)
            page.wait_for_timeout(80)

            nph = STEPS_N.get(oid, 4)
            px = []
            cap = []
            for ph in range(nph):
                if ph:
                    advance_phase(page, 32)
                    page.wait_for_timeout(40)
                px.append(px_sum(page))
                cap.append(page.evaluate("() => (document.getElementById('cap')||{}).textContent || ''"))
                if oid in shot_ids:
                    page.locator("#demo").screenshot(path=str(OUT_DIR / f"r{round_id}_{oid}_p{ph}.png"))

            blank = not nonempty(page)
            if blank:
                report["blank"].append(oid)

            diffs = [abs(px[k] - px[k - 1]) for k in range(1, len(px))]
            min_diff = min(diffs) if diffs else 0
            if min_diff < 400:
                report["phase_weak"].append({"id": oid, "diffs": diffs, "px": px, "cap": cap})

            # 滑块：先走到第 3 步（phase 2），再拨到与默认相反的一端
            skey = SLIDER_KEY.get(oid)
            slider_delta = 0
            if skey:
                page.click("#reset")
                page.wait_for_timeout(50)
                advance_phase(page, 70)  # 70*0.08≈5.6s → phase 2
                page.wait_for_timeout(40)
                a0 = px_sum(page)
                page.evaluate(
                    """(key) => {
                      const inp = document.querySelector('#sliders input[data-k=\"' + key + '\"]');
                      if (!inp) return -1;
                      const min = parseFloat(inp.min), max = parseFloat(inp.max);
                      const cur = parseFloat(inp.value);
                      const target = (cur - min) <= (max - cur) ? max : min;
                      inp.value = String(target);
                      inp.dispatchEvent(new Event('input', { bubbles: true }));
                      return 1;
                    }""",
                    skey,
                )
                page.wait_for_timeout(80)
                a1 = px_sum(page)
                slider_delta = abs(a1 - a0)
                if slider_delta < 80:
                    report["slider_weak"].append({"id": oid, "delta": slider_delta, "key": skey})
                if oid in shot_ids:
                    page.locator("#demo").screenshot(path=str(OUT_DIR / f"r{round_id}_{oid}_slider.png"))

            canvas_err = page.evaluate(
                """() => {
                  const met = (document.getElementById('met')||{}).textContent || '';
                  if (/_e |动画错误|err /.test(met)) return met.slice(0, 120);
                  const c = document.getElementById('demo');
                  if (!c) return 'no-canvas';
                  const ctx = c.getContext('2d', { willReadFrequently: true });
                  const dpr = window.devicePixelRatio || 1;
                  const y = Math.floor(18 * dpr);
                  const d = ctx.getImageData(0, y, c.width, Math.max(1, Math.floor(16 * dpr))).data;
                  let pink = 0;
                  for (let i = 0; i < d.length; i += 16) {
                    if (d[i] > 210 && d[i+1] < 140 && d[i+2] < 170) pink++;
                  }
                  return pink > 40 ? 'pink-text:' + pink : '';
                }"""
            )
            rec = {
                "id": oid,
                "hit": hit,
                "px": px,
                "diffs": diffs,
                "min_diff": min_diff,
                "slider_delta": slider_delta,
                "caption": cap,
                "console": list(logs),
                "blank": blank,
                "canvas_err": canvas_err,
            }
            if canvas_err:
                report.setdefault("canvas_err", []).append({"id": oid, "err": canvas_err})
            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            report["pages"].append(rec)
            if hit and not blank and min_diff >= 400 and (not skey or slider_delta >= 80):
                report["ok"].append(oid)
            print(
                f"  {oid:36s} hit={hit} minΔ={min_diff:8.0f} sliderΔ={slider_delta:8.0f} blank={blank}",
                flush=True,
            )

        # 浅色抽检
        page.evaluate('document.documentElement.setAttribute("data-theme","light")')
        page.evaluate(f'location.hash = "#/op/{IDS[0]}"')
        page.wait_for_timeout(400)
        page.locator("#demo").screenshot(path=str(OUT_DIR / f"r{round_id}_light_{IDS[0]}.png"))
        report["light_nonempty"] = nonempty(page)

        browser.close()

    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("missing_anims", report["missing_anims"])
    print("blank", report["blank"])
    print("phase_weak", [x["id"] for x in report["phase_weak"]])
    print("slider_weak", [x["id"] for x in report["slider_weak"]])
    print("js_exceptions", report["js_exceptions"])
    print("console_errors", len(report["console_errors"]))
    print("ok", len(report["ok"]), "/", len(IDS))
    return report


if __name__ == "__main__":
    base = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8766"
    rnd = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    t0 = time.time()
    r = run(base, rnd)
    print("elapsed", round(time.time() - t0, 1), "s")
    print("canvas_err", r.get("canvas_err"))
    bad = r["missing_anims"] or r["blank"] or r["js_exceptions"]
    sys.exit(1 if bad else 0)
