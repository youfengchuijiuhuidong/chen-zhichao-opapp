#!/usr/bin/env python3
"""全量验收：127 个算子逐页检查。

标准：无 JS 异常、命中 OP_ANIMS、画布非空白、各 phase 像素有明显差异、
滑块改变有效、浅色主题可读。输出每章通过/失败清单与 JSON 报告。
"""
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
OPS = DATA["operators"]
OUT_DIR = APP / "tools" / "_all_shots"
REPORT = APP / "tools" / "_anim_check_all.json"
CHROME = Path("/usr/bin/google-chrome-stable")
if not CHROME.exists():
    CHROME = Path("/usr/bin/google-chrome")

CH_ORDER = [2, 3, 4, 5, 6, 7]
PHASE_MIN = 40
SLIDER_HASH_MIN = 30
SLIDER_PX_MIN = 400


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


SAMPLE_JS = """() => {
  const c = document.getElementById('demo');
  const P = window.__OP_PLAYER;
  if (!c) return {blank:true, err:'no-canvas', nonempty:0, px:0, hash:0};
  const ctx = c.getContext('2d', {willReadFrequently:true});
  const W = c.width, H = c.height;
  const dpr = (P && P.S && P.S.dpr) || 1;
  const skip = Math.ceil(((P && P.chromeH) || 14) * dpr + 2);
  const usableH = Math.max(8, H - skip);
  const d = ctx.getImageData(0, 0, W, usableH).data;
  let sum=0, nonempty=0, r=0, g=0, b=0, h=0, dark=0, light=0, sat=0;
  const step = 16;
  for (let i = 0; i < d.length; i += step) {
    const R=d[i], G=d[i+1], B=d[i+2], A=d[i+3];
    const s = R+G+B;
    sum += s; r += R; g += G; b += B;
    const lum = 0.2126*R + 0.7152*G + 0.0722*B;
    const mx = Math.max(R,G,B), mn = Math.min(R,G,B);
    if (s > 22 && A > 8) nonempty++;
    if (lum < 90) dark++;
    if (lum > 200) light++;
    if (mx - mn > 28) sat++;
    h = (h * 33 + R + G * 3 + B * 7) | 0;
  }
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  const readable = nonempty > 40 && (
    theme === 'light' ? (dark > 8 || sat > 18) : (light > 8 || sat > 18 || nonempty > 80)
  );
  const opId = P && P.S ? P.S.opId : '';
  return {
    blank: nonempty < 12,
    px: sum, nonempty, r, g, b, hash: h,
    w: W, h: H, usableH, dark, light, sat,
    theme, readable,
    custom: !!(P && P.custom),
    hit: !!(window.OP_ANIMS && opId && window.OP_ANIMS[opId]),
    phase: P && P.S ? P.S.phase : -1,
    metrics: P && P.S ? Object.keys(P.S.metrics || {}).length : 0,
    err: P && P.S && P.S.metrics ? (P.S.metrics.err || null) : null,
    title: (document.querySelector('.demo-op-name') || {}).textContent || '',
    h1: (document.querySelector('.op-head h1') || {}).textContent || '',
  };
}"""


def sample(page):
    return page.evaluate(SAMPLE_JS)


def set_phase(page, p):
    ok = page.evaluate(
        """(p) => {
          const P = window.__OP_PLAYER;
          if (!P) return false;
          P.setPhase(p);
          return true;
        }""",
        p,
    )
    page.wait_for_timeout(70)
    return ok


def set_slider(page, key, val):
    page.evaluate(
        """({key, val}) => {
          const P = window.__OP_PLAYER;
          if (P) P.setSlider(key, val);
          const inp = document.querySelector('input[data-k="' + key + '"]');
          if (inp) {
            inp.value = String(val);
            inp.dispatchEvent(new Event('input', {bubbles:true}));
          }
          return true;
        }""",
        {"key": key, "val": val},
    )
    page.wait_for_timeout(80)


def wait_player(page, timeout_ms=4000):
    page.wait_for_function(
        "() => !!(window.__OP_PLAYER && window.__OP_PLAYER.S && document.getElementById('demo'))",
        timeout=timeout_ms,
    )


def chrome_path():
    for p in ("/usr/bin/google-chrome-stable", "/usr/bin/google-chrome"):
        if Path(p).exists():
            return p
    return None


def run(round_id: int = 1, port: int = 8744, shot_fail: bool = True):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    shot_root = OUT_DIR / f"r{round_id}"
    shot_root.mkdir(parents=True, exist_ok=True)

    by_ch = {c: [o for o in OPS if o.get("ch") == c] for c in CH_ORDER}
    reps = {}
    for c, arr in by_ch.items():
        if not arr:
            continue
        reps[arr[0]["id"]] = c
        reps[arr[len(arr) // 2]["id"]] = c

    httpd = serve(APP, port)
    base = f"http://127.0.0.1:{port}"
    report = {
        "round": round_id,
        "n_ops": len(OPS),
        "home": {},
        "chapters": {},
        "pages": [],
        "ok": [],
        "failed": [],
        "missing_anim": [],
        "js_exceptions": [],
        "console_errors": [],
        "blank": [],
        "phase_weak": [],
        "slider_weak": [],
        "light_unreadable": [],
        "draw_error": [],
    }
    for c in CH_ORDER:
        report["chapters"][str(c)] = {
            "n": len(by_ch[c]),
            "ok": [],
            "fail": [],
            "missing_anim": [],
            "blank": [],
            "phase_weak": [],
            "slider_weak": [],
            "light_unreadable": [],
            "js": [],
        }

    with sync_playwright() as p:
        exe = chrome_path()
        browser = p.chromium.launch(
            headless=True,
            executable_path=exe,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = browser.new_page(viewport={"width": 1400, "height": 900})
        logs = []
        page_errors = []

        def on_console(msg):
            t = msg.text or ""
            if msg.type == "warning" and "willReadFrequently" in t:
                return
            if msg.type in ("error", "warning"):
                logs.append({"type": msg.type, "text": t})

        def on_err(exc):
            page_errors.append(str(exc))
            report["js_exceptions"].append(str(exc))

        page.on("console", on_console)
        page.on("pageerror", on_err)
        page.goto(base + "/index.html", wait_until="networkidle", timeout=30000)
        page.wait_for_timeout(400)
        home = page.evaluate(
            """() => {
              const svg = document.getElementById('graph');
              if (!svg) return {ok:false, reason:'no-svg'};
              const nodes = svg.querySelectorAll('.node');
              const r = svg.getBoundingClientRect();
              return {ok: nodes.length >= 100 && r.width > 80 && r.height > 80,
                      n: nodes.length, w: r.width, h: r.height};
            }"""
        )
        if not home.get("ok"):
            page.wait_for_timeout(400)
            page.evaluate("() => { const g = window.__GRAPH; }")
            home = page.evaluate(
                """() => {
                  const svg = document.getElementById('graph');
                  if (!svg) return {ok:false, reason:'no-svg'};
                  const nodes = svg.querySelectorAll('.node');
                  const r = svg.getBoundingClientRect();
                  const btn = document.getElementById('gfit');
                  if (btn) btn.click();
                  return {ok: nodes.length >= 100 && r.width > 80 && r.height > 80,
                          n: nodes.length, w: r.width, h: r.height};
                }"""
            )
        report["home"] = home
        if home.get("ok"):
            page.locator("#graph").screenshot(path=str(shot_root / "home_graph.png"))

        for i, op in enumerate(OPS):
            oid = op["id"]
            ch = int(op.get("ch") or 0)
            chrec = report["chapters"].get(str(ch), report["chapters"].setdefault(str(ch), {
                "n": 0, "ok": [], "fail": [], "missing_anim": [], "blank": [],
                "phase_weak": [], "slider_weak": [], "light_unreadable": [], "js": [],
            }))
            logs.clear()
            page_errors.clear()
            page.evaluate(f'location.hash = "#/op/{oid}"')
            try:
                wait_player(page, 5000)
            except Exception as e:
                rec = {"id": oid, "name": op.get("name"), "ch": ch, "error": "player-timeout " + str(e)}
                report["pages"].append(rec)
                report["failed"].append(oid)
                chrec["fail"].append(oid)
                print(f"[{i+1:03d}/{len(OPS)}] {oid:36s} FAIL player-timeout", flush=True)
                continue
            page.wait_for_timeout(120)
            page.evaluate("() => { const P = window.__OP_PLAYER; if (P && P.S) P.S.playing = false; }")

            meta = page.evaluate(
                """(id) => {
                  const P = window.__OP_PLAYER;
                  return {
                    hit: !!(window.OP_ANIMS && window.OP_ANIMS[id]),
                    custom: !!(P && P.custom),
                    hasS: !!(P && P.S),
                    steps: P && P.S ? P.S.steps.length : 0,
                    sliders: Object.keys((P && P.S && P.S.sliders) || {}),
                    demoTitle: (document.querySelector('.demo-op-name')||{}).textContent||'',
                    h1: (document.querySelector('.op-head h1')||{}).textContent||'',
                  };
                }""",
                oid,
            )
            rec = {
                "id": oid,
                "name": op.get("name"),
                "ch": ch,
                **meta,
                "phases": [],
                "console": list(logs),
                "page_errors": list(page_errors),
            }
            reasons = []
            if not meta.get("hit") or not meta.get("custom"):
                report["missing_anim"].append(oid)
                chrec["missing_anim"].append(oid)
                reasons.append("missing_anim")

            nstep = max(1, len(op.get("steps") or [1, 2, 3, 4]))
            hashes = []
            take_shot = oid in reps
            for ph in range(min(4, nstep)):
                set_phase(page, ph)
                sig = sample(page)
                rec["phases"].append(sig)
                hashes.append(sig.get("hash") or 0)
                if sig.get("blank"):
                    report["blank"].append(f"{oid}:p{ph}")
                    chrec["blank"].append(f"{oid}:p{ph}")
                    reasons.append(f"blank:p{ph}")
                if sig.get("err"):
                    report["draw_error"].append({"id": oid, "err": sig["err"]})
                    reasons.append("draw_error")
                if take_shot:
                    page.locator("#demo").screenshot(path=str(shot_root / f"{oid}_p{ph}.png"))

            diffs = [abs(hashes[j] - hashes[j - 1]) for j in range(1, len(hashes))]
            rec["phase_hash_diffs"] = diffs
            rec["phase_min_diff"] = min(diffs) if diffs else 0
            if rec["phase_min_diff"] < PHASE_MIN:
                report["phase_weak"].append(oid)
                chrec["phase_weak"].append(oid)
                reasons.append("phase_weak")

            sliders = op.get("sliders") or []
            rec["slider_ok"] = None
            if sliders:
                key = sliders[0]["key"]
                lo, hi = sliders[0]["min"], sliders[0]["max"]
                set_phase(page, min(2, nstep - 1))
                set_slider(page, key, lo)
                s1 = sample(page)
                set_slider(page, key, hi)
                s2 = sample(page)
                rec["slider_diff"] = abs((s1.get("hash") or 0) - (s2.get("hash") or 0))
                rec["slider_px"] = abs((s1.get("px") or 0) - (s2.get("px") or 0))
                rec["slider_ok"] = rec["slider_diff"] > SLIDER_HASH_MIN or rec["slider_px"] > SLIDER_PX_MIN
                if not rec["slider_ok"]:
                    report["slider_weak"].append(oid)
                    chrec["slider_weak"].append(oid)
                    reasons.append("slider_weak")
                if take_shot:
                    page.locator("#demo").screenshot(path=str(shot_root / f"{oid}_slider.png"))

            page.evaluate('document.documentElement.setAttribute("data-theme","light")')
            page.wait_for_timeout(40)
            page.evaluate("() => { const P = window.__OP_PLAYER; if (P) P.redraw(); }")
            page.wait_for_timeout(50)
            light = sample(page)
            rec["light"] = {
                "blank": light.get("blank"),
                "readable": light.get("readable"),
                "nonempty": light.get("nonempty"),
                "dark": light.get("dark"),
                "sat": light.get("sat"),
            }
            if light.get("blank") or not light.get("readable"):
                report["light_unreadable"].append(oid)
                chrec["light_unreadable"].append(oid)
                reasons.append("light")
            if take_shot:
                page.locator("#demo").screenshot(path=str(shot_root / f"{oid}_light.png"))
            page.evaluate('document.documentElement.setAttribute("data-theme","dark")')
            page.evaluate("() => { const P = window.__OP_PLAYER; if (P) P.redraw(); }")

            if logs:
                report["console_errors"].append({"id": oid, "logs": list(logs)})
            if page_errors:
                chrec["js"].extend(page_errors)
                reasons.append("js")

            hard_fail = (
                (not meta.get("hit"))
                or (not meta.get("custom"))
                or any(x.startswith(oid) for x in report["blank"])
                or bool(page_errors)
                or oid in [d["id"] for d in report["draw_error"] if d.get("id") == oid]
            )
            soft = oid in report["phase_weak"] or oid in report["slider_weak"] or oid in report["light_unreadable"]
            rec["reasons"] = reasons
            rec["pass"] = not hard_fail and not soft
            if rec["pass"]:
                report["ok"].append(oid)
                chrec["ok"].append(oid)
            else:
                report["failed"].append(oid)
                chrec["fail"].append(oid)
                if shot_fail and not take_shot:
                    try:
                        page.locator("#demo").screenshot(path=str(shot_root / f"FAIL_{oid}.png"))
                    except Exception:
                        pass

            print(
                f"[{i+1:03d}/{len(OPS)}] ch{ch} {oid:36s} "
                f"hit={meta.get('hit')} custom={meta.get('custom')} "
                f"phaseΔ={rec.get('phase_min_diff')} slider={rec.get('slider_ok')} "
                f"{'OK' if rec['pass'] else 'FAIL ' + ','.join(reasons)}",
                flush=True,
            )
            report["pages"].append(rec)

        browser.close()
    httpd.shutdown()
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print("---- summary ----")
    print("home", report["home"])
    print("n", report["n_ops"], "ok", len(report["ok"]), "fail", len(report["failed"]))
    print("missing_anim", report["missing_anim"])
    print("js_exceptions", report["js_exceptions"])
    print("blank", report["blank"])
    print("phase_weak", report["phase_weak"])
    print("slider_weak", report["slider_weak"])
    print("light_unreadable", report["light_unreadable"])
    print("draw_error", report["draw_error"])
    for c in CH_ORDER:
        chrec = report["chapters"][str(c)]
        print(
            f"  ch{c}: {len(chrec['ok'])}/{chrec['n']}  fail={chrec['fail']}",
            flush=True,
        )
    return report


if __name__ == "__main__":
    rnd = int(sys.argv[1]) if len(sys.argv) > 1 else 1
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8744
    t0 = time.time()
    r = run(rnd, port)
    print("elapsed", round(time.time() - t0, 1), "s")
    hard = r["missing_anim"] or r["js_exceptions"] or r["blank"] or r["draw_error"]
    sys.exit(1 if hard else 0)
