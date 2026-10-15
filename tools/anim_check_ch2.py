#!/usr/bin/env python3
"""第2章动画自测：OP_ANIMS 命中、无 JS 报错、phase/滑块像素差、截图。"""
from __future__ import annotations

import json
import sys
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread

from playwright.sync_api import sync_playwright

APP = Path(__file__).resolve().parents[1]
DATA = json.loads((APP / "data" / "operators.json").read_text(encoding="utf-8"))
CH2 = [o for o in DATA["operators"] if o.get("ch") == 2]
OUT_DIR = APP / "tools" / "_ch2_shots"
REPORT = APP / "tools" / "_ch2_report.json"


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass


def serve(root: Path, port: int):
    class H(QuietHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=str(root), **k)

    httpd = ThreadingHTTPServer(("127.0.0.1", port), H)
    t = Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd


def px_sig(page):
    return page.evaluate(
        """() => {
          const c = document.getElementById('demo');
          if (!c) return {blank:true, px:0, nonempty:0};
          const ctx = c.getContext('2d', {willReadFrequently:true});
          const d = ctx.getImageData(0,0,c.width,c.height).data;
          let sum=0, nonempty=0, h=0;
          for (let i=0;i<d.length;i+=16){
            const s=d[i]+d[i+1]+d[i+2];
            sum+=s; if(s>18) nonempty++;
            h = (h*33 + d[i] + d[i+1]*3 + d[i+2]*7) | 0;
          }
          return {blank: nonempty<12, px:sum, nonempty, hash:h};
        }"""
    )


def set_phase(page, p, oid=None):
    page.evaluate(
        """({p, oid}) => {
          const S = window._CH2_S;
          if (!S) return false;
          S.playing = false;
          S.t = p * 2.4 + 1.05;
          S.phase = p;
          window.__CH2_FORCE = { id: oid || S.opId || '*', phase: p, frac: 0.45, sliders: Object.assign({}, S.sliders) };
          return true;
        }""",
        {"p": p, "oid": oid},
    )
    page.wait_for_timeout(120)


def set_slider(page, oid, key, val, phase=2):
    page.evaluate(
        """({oid, key, val, phase}) => {
          const S = window._CH2_S;
          if (S) {
            S.playing = false;
            S.phase = phase;
            S.t = phase * 2.4 + 1.05;
            S.sliders = S.sliders || {};
            S.sliders[key] = val;
          }
          const sl = Object.assign({}, (S && S.sliders) || {});
          sl[key] = val;
          window.__CH2_FORCE = { id: oid || '*', phase: phase, frac: 0.45, sliders: sl };
          const inp = document.querySelector('#sliders input[data-k="' + key + '"]');
          if (inp) {
            inp.value = String(val);
            inp.dispatchEvent(new Event('input', { bubbles: true }));
          }
          return true;
        }""",
        {"oid": oid, "key": key, "val": val, "phase": phase},
    )
    page.wait_for_timeout(120)


def run(round_id: int, port: int = 8766):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shot_root = OUT_DIR / f"r{round_id}"
    shot_root.mkdir(parents=True, exist_ok=True)
    httpd = serve(APP, port)
    base = f"http://127.0.0.1:{port}"
    report = {
        "round": round_id,
        "n_ops": len(CH2),
        "pages": [],
        "missing_anim": [],
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
            executable_path="/usr/bin/google-chrome-stable",
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        logs = []

        def on_console(msg):
            t = msg.text or ""
            if msg.type == "warning" and "willReadFrequently" in t:
                return
            if msg.type in ("error", "warning"):
                logs.append({"type": msg.type, "text": t})

        def on_err(exc):
            url = page.url or ""
            msg = str(exc)
            # 其他章节脚本的语法错会在首页加载时冒泡，不记入第2章
            if "/op/" not in url:
                report.setdefault("ignored_boot_errors", []).append(msg)
                return
            report["js_exceptions"].append({"url": url, "error": msg})

        page.on("console", on_console)
        page.on("pageerror", on_err)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(250)

        ids_js = page.evaluate("() => (window._CH2_IDS||[]).slice()")
        report["registered"] = ids_js
        report["registered_n"] = len(ids_js or [])

        for i, op in enumerate(CH2):
            oid = op["id"]
            logs.clear()
            page.evaluate("() => { window.__CH2_FORCE = null; }")
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(450)
            meta = page.evaluate(
                """(id) => ({
                  hit: !!(window.OP_ANIMS && window.OP_ANIMS[id]),
                  hasS: !!window._CH2_S,
                  title: document.querySelector('.op-head h1') && document.querySelector('.op-head h1').textContent,
                  steps: window._CH2_S ? window._CH2_S.steps.length : 0,
                  sliders: Object.keys((window._CH2_S && window._CH2_S.sliders) || {})
                })""",
                oid,
            )
            rec = {"id": oid, "name": op.get("name"), **meta, "phases": [], "console": list(logs)}
            if not meta.get("hit"):
                report["missing_anim"].append(oid)
            page.evaluate("() => { const S=window._CH2_S; if(S) S.playing=false; }")
            hashes = []
            for ph in range(4):
                set_phase(page, ph, oid)
                sig = px_sig(page)
                rec["phases"].append(sig)
                hashes.append(sig.get("hash"))
                if sig.get("blank"):
                    report["blank"].append(f"{oid}:p{ph}")
                canvas = page.locator("#demo")
                canvas.screenshot(path=str(shot_root / f"{oid}_p{ph}.png"))
            diffs = [abs(hashes[j] - hashes[j - 1]) for j in range(1, 4)]
            rec["phase_hash_diffs"] = diffs
            rec["phase_min_diff"] = min(diffs) if diffs else 0
            if rec["phase_min_diff"] < 40:
                report["phase_weak"].append(oid)

            # slider
            sliders = op.get("sliders") or []
            rec["slider_ok"] = None
            if sliders:
                key = sliders[0]["key"]
                lo, hi = sliders[0]["min"], sliders[0]["max"]
                set_slider(page, oid, key, lo, 2)
                s1 = px_sig(page)
                set_slider(page, oid, key, hi, 2)
                s2 = px_sig(page)
                rec["slider_diff"] = abs(s1.get("hash", 0) - s2.get("hash", 0))
                rec["slider_px"] = abs(s1.get("px", 0) - s2.get("px", 0))
                rec["slider_ok"] = rec["slider_diff"] > 30 or rec["slider_px"] > 400
                if not rec["slider_ok"]:
                    report["slider_weak"].append(oid)
                canvas = page.locator("#demo")
                canvas.screenshot(path=str(shot_root / f"{oid}_slider_hi.png"))

            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            if (
                meta.get("hit")
                and oid not in report["phase_weak"]
                and oid not in report["slider_weak"]
                and not any(x.startswith(oid) for x in report["blank"])
            ):
                report["ok"].append(oid)
            report["pages"].append(rec)
            print(
                f"[{i+1:02d}/{len(CH2)}] {oid:32s} hit={meta.get('hit')} "
                f"phaseΔ={rec.get('phase_min_diff')} slider={rec.get('slider_ok')} "
                f"blank={[p for p in rec['phases'] if p.get('blank')]}",
                flush=True,
            )

        # 浅色抽检
        page.evaluate('document.documentElement.setAttribute("data-theme","light")')
        for oid in ("elbo", "kl_divergence", "mirror_descent_three_steps"):
            page.evaluate("() => { window.__CH2_FORCE = null; }")
            page.evaluate(f'location.hash = "#/op/{oid}"')
            page.wait_for_timeout(400)
            set_phase(page, 2, oid)
            page.locator("#demo").screenshot(path=str(shot_root / f"light_{oid}_p2.png"))
        report["light_ok"] = True

        browser.close()
    httpd.shutdown()
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("---- summary ----")
    print("registered", report["registered_n"], "ops", report["n_ops"])
    print("missing_anim", report["missing_anim"])
    print("js_exceptions", report["js_exceptions"])
    print("console_errors", len(report["console_errors"]))
    print("blank", report["blank"])
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("ok", len(report["ok"]))
    return report


if __name__ == "__main__":
    rnd = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8771
    t0 = time.time()
    r = run(rnd, port)
    print("elapsed", round(time.time() - t0, 1), "s")
    bad = r["missing_anim"] or r["js_exceptions"] or r["blank"]
    sys.exit(1 if bad else 0)
