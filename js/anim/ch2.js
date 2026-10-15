/* 第2章专属动画：变分推断 / Bregman 几何 / W₂ 传输 / PMP
   每个算子严格按 op.steps 的 phase 切换画面，数值用真实公式。 */
(function () {
  "use strict";
  const OP = (window.OP_ANIMS = window.OP_ANIMS || {});
  const TWO = Math.PI * 2;
  const FONT = '"Noto Sans CJK SC","Noto Sans SC","Source Han Sans SC",sans-serif';
  window.OP_FONT_STACK = FONT;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  function font(ctx, px, bold) {
    ctx.font = (bold ? "bold " : "") + (px || 12) + "px " + FONT;
  }
  function applyForce(S) {
    const F = window.__CH2_FORCE;
    if (!F) return;
    if (F.id && F.id !== "*" && F.id !== S.opId) return;
    if (F.phase != null) S.phase = F.phase | 0;
    if (F.t != null) S.t = +F.t;
    if (F.sliders) {
      S.sliders = S.sliders || {};
      for (const k in F.sliders) S.sliders[k] = F.sliders[k];
    }
  }
  function sl(S, k, d) {
    const F = window.__CH2_FORCE;
    if (F && (!F.id || F.id === "*" || F.id === S.opId) && F.sliders && F.sliders[k] != null && F.sliders[k] === F.sliders[k]) {
      return +F.sliders[k];
    }
    const v = S.sliders ? S.sliders[k] : undefined;
    return v == null || v !== v ? d : +v;
  }
  function frac(S) {
    const F = window.__CH2_FORCE;
    if (F && F.frac != null) return clamp(+F.frac, 0, 1);
    return (S.t / 2.4) % 1;
  }
  function paramStrip(ctx, S, T) {
    const keys = Object.keys(S.sliders || {}).filter((k) => k !== "speed");
    if (!keys.length) return;
    font(ctx, 10, false);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const y = 28;
    let x = S.W - 12;
    const chips = keys.map((k) => {
      const v = sl(S, k, 0);
      const t = k + " " + (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2));
      return { t, w: Math.min(130, ctx.measureText(t).width + 12) };
    });
    for (let i = chips.length - 1; i >= 0; i--) {
      x -= chips[i].w;
      ctx.fillStyle = T.dark ? "rgba(36,48,73,0.92)" : "rgba(255,255,255,0.92)";
      rr(ctx, x, y - 8, chips[i].w, 16, 4); ctx.fill();
      ctx.strokeStyle = T.c3; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = T.c3;
      ctx.fillText(chips[i].t, x + 6, y);
      x -= 6;
    }
  }
  function badge(ctx, x, y, text, T, col) {
    font(ctx, 11, true);
    const w = ctx.measureText(text).width + 14;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.78)" : "rgba(255,255,255,0.88)";
    rr(ctx, x, y, w, 20, 5); ctx.fill();
    ctx.strokeStyle = col || T.c5; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.fillStyle = col || T.tx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 7, y + 10);
    return w;
  }
  function vbar(ctx, x, y, h, frac01, col, lab, T) {
    const f = clamp(frac01, 0, 1);
    ctx.strokeStyle = T.line; ctx.strokeRect(x, y, 18, h);
    ctx.fillStyle = col;
    ctx.fillRect(x + 1, y + h - f * h, 16, f * h);
    if (lab) {
      font(ctx, 10, false); ctx.fillStyle = T.mu; ctx.textAlign = "center";
      ctx.fillText(lab, x + 9, y + h + 12);
    }
  }
  function gauss(x, m, s) {
    s = Math.max(1e-4, s);
    const z = (x - m) / s;
    return Math.exp(-0.5 * z * z) / (s * Math.sqrt(TWO));
  }
  function logG(x, m, s) {
    s = Math.max(1e-4, s);
    const z = (x - m) / s;
    return -0.5 * z * z - Math.log(s * Math.sqrt(TWO));
  }
  function klG(m0, s0, m1, s1) {
    s0 = Math.max(1e-4, s0); s1 = Math.max(1e-4, s1);
    const v0 = s0 * s0, v1 = s1 * s1;
    return Math.log(s1 / s0) + (v0 + (m0 - m1) * (m0 - m1)) / (2 * v1) - 0.5;
  }
  function softmax(a) {
    let m = -Infinity;
    for (let i = 0; i < a.length; i++) if (a[i] > m) m = a[i];
    const e = new Array(a.length);
    let z = 0;
    for (let i = 0; i < a.length; i++) { e[i] = Math.exp(a[i] - m); z += e[i]; }
    for (let i = 0; i < a.length; i++) e[i] /= z || 1;
    return e;
  }
  function alpha(col, a) {
    if (!col) return "rgba(120,130,150," + a + ")";
    if (col[0] === "#") {
      let h = col.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    return col;
  }
  function onPhase(S, fns) {
    if (S.sim._ph !== S.phase) {
      S.sim._ph = S.phase;
      const f = fns[S.phase];
      if (f) f();
    }
  }
  function mulberry(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function nrm(rnd) {
    let u = 0, v = 0;
    while (!u) u = rnd();
    while (!v) v = rnd();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
  }

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r || 6, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function hit(S, key, spec) {
    if (window.OP_MARK_HIT) window.OP_MARK_HIT(S, key, spec);
  }
  function hitBox(S, key, box) {
    if (!box) return;
    hit(S, key, { type: "box", box: box });
  }
  function boxOf(S, opt) {
    opt = opt || {};
    const l = opt.l != null ? opt.l : 50;
    const r = opt.r != null ? opt.r : 14;
    const t = opt.t != null ? opt.t : 36;
    const b = opt.b != null ? opt.b : 46;
    return { x0: l, y0: t, x1: S.W - r, y1: S.H - b, w: S.W - l - r, h: S.H - t - b };
  }
  function mapper(box, x0, x1, y0, y1) {
    const dx = x1 - x0 || 1, dy = y1 - y0 || 1;
    return {
      box, xMin: x0, xMax: x1, yMin: y0, yMax: y1,
      X: (x) => box.x0 + (x - x0) / dx * box.w,
      Y: (y) => box.y1 - (y - y0) / dy * box.h,
    };
  }
  function axes(ctx, m, T, opt) {
    opt = opt || {};
    const box = m.box;
    ctx.save();
    ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.055)" : "rgba(20,30,50,0.07)";
    ctx.lineWidth = 1;
    const nx = opt.nx || 6, ny = opt.ny || 4;
    for (let i = 0; i <= nx; i++) {
      const x = m.X(m.xMin + (m.xMax - m.xMin) * i / nx);
      ctx.beginPath(); ctx.moveTo(x, box.y0); ctx.lineTo(x, box.y1); ctx.stroke();
    }
    for (let i = 0; i <= ny; i++) {
      const y = m.Y(m.yMin + (m.yMax - m.yMin) * i / ny);
      ctx.beginPath(); ctx.moveTo(box.x0, y); ctx.lineTo(box.x1, y); ctx.stroke();
    }
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(box.x0, box.y0); ctx.lineTo(box.x0, box.y1); ctx.lineTo(box.x1, box.y1);
    ctx.stroke();
    ctx.fillStyle = T.mu;
    ctx.font = "11px " + (window.OP_FONT_STACK || "sans-serif");
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const xt = opt.xticks || 4;
    for (let i = 0; i <= xt; i++) {
      const xv = m.xMin + (m.xMax - m.xMin) * i / xt;
      ctx.fillText(opt.xfmt ? opt.xfmt(xv) : xv.toFixed(1), m.X(xv), box.y1 + 4);
    }
    if (opt.xl) {
      ctx.fillText(opt.xl, (box.x0 + box.x1) / 2, box.y1 + 18);
    }
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    if (opt.yl) {
      ctx.save();
      ctx.translate(box.x0 - 34, (box.y0 + box.y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = "center";
      ctx.fillText(opt.yl, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  }
  function curve(ctx, m, fn, n, stroke, lw, fill) {
    n = n || 96;
    ctx.beginPath();
    let first = true;
    const yAxis = m.Y(Math.max(m.yMin, Math.min(m.yMax, 0)));
    for (let i = 0; i <= n; i++) {
      const x = m.xMin + (m.xMax - m.xMin) * i / n;
      const y = fn(x);
      const px = m.X(x), py = m.Y(y);
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }
    if (fill) {
      ctx.lineTo(m.X(m.xMax), yAxis);
      ctx.lineTo(m.X(m.xMin), yAxis);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.beginPath();
      first = true;
      for (let i = 0; i <= n; i++) {
        const x = m.xMin + (m.xMax - m.xMin) * i / n;
        const px = m.X(x), py = m.Y(fn(x));
        if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
      }
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }
  function arrow(ctx, x, y, dx, dy, col, w) {
    const L = Math.hypot(dx, dy);
    if (L < 0.8) return;
    ctx.save();
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = w || 1.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - 8 * Math.cos(a - 0.38), y + dy - 8 * Math.sin(a - 0.38));
    ctx.lineTo(x + dx - 8 * Math.cos(a + 0.38), y + dy - 8 * Math.sin(a + 0.38));
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function glow(ctx, x, y, r, col) {
    ctx.fillStyle = alpha(col, 0.16);
    ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, TWO); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
  }
  function legend(ctx, items, x, y, T) {
    if (!items || !items.length) return;
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let maxW = 0;
    items.forEach((it) => {
      const txt = it.l || it.lab || it.t || "";
      const w = ctx.measureText(txt).width;
      if (w > maxW) maxW = w;
    });
    const boxW = maxW + 26;
    const boxH = items.length * 15 + 8;
    ctx.fillStyle = T.dark ? "rgba(11, 18, 32, 0.85)" : "rgba(255, 255, 255, 0.88)";
    rr(ctx, x - 6, y - 10, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    items.forEach((it, i) => {
      const yy = y + i * 15;
      ctx.fillStyle = it.c;
      ctx.fillRect(x, yy - 4, 11, 8);
      ctx.fillStyle = T.tx;
      ctx.fillText(it.l || it.lab || it.t, x + 15, yy);
    });
    ctx.restore();
  }
  function banner(ctx, S, T) {
    const txt = (S.steps && S.steps[S.phase]) || "";
    ctx.font = "12px " + (window.OP_FONT_STACK || "sans-serif");
    let t = txt;
    while (t.length > 4 && ctx.measureText(t).width > S.W - 28) t = t.slice(0, -2);
    if (t !== txt) t += "…";
    const w = Math.min(S.W - 16, ctx.measureText(t).width + 18);
    ctx.fillStyle = T.dark ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.32)";
    rr(ctx, 8, 5, w, 22, 5); ctx.fill();
    ctx.fillStyle = T.c5;
    ctx.fillRect(8, 5, 3, 22);
    ctx.fillStyle = T.tx;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(t, 16, 16);
  }
  function callout(ctx, x, y, text, T, col) {
    ctx.font = "11px sans-serif";
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.72)" : "rgba(255,255,255,0.82)";
    rr(ctx, x, y - 12, w, 16, 4); ctx.fill();
    ctx.strokeStyle = col || T.c5;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col || T.tx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 5, y - 4);
  }
  function hist(vals, a, b, nb) {
    const bins = new Float64Array(nb);
    const w = (b - a) / nb;
    for (let i = 0; i < vals.length; i++) {
      let k = Math.floor((vals[i] - a) / w);
      if (k < 0) k = 0; else if (k >= nb) k = nb - 1;
      bins[k]++;
    }
    let s = 0;
    for (let i = 0; i < nb; i++) s += bins[i];
    const dens = new Float64Array(nb);
    if (s > 0) for (let i = 0; i < nb; i++) dens[i] = bins[i] / (s * w);
    return { dens, w, a, b, nb, n: s };
  }
  function drawHist(ctx, m, H, col) {
    for (let i = 0; i < H.nb; i++) {
      const x0 = H.a + i * H.w, x1 = x0 + H.w;
      const px = m.X(x0), pw = Math.max(1, m.X(x1) - px - 0.6);
      const py = m.Y(H.dens[i]);
      ctx.fillStyle = alpha(col, 0.45);
      ctx.fillRect(px, py, pw, m.box.y1 - py);
    }
  }
  function simplexXY(a, b, c, cx, cy, sc) {
    return { x: cx + (b - a) * sc, y: cy + (Math.sqrt(3) / 2) * (2 * c - a - b) * sc * 0.92 };
  }
  function drawSimplex(ctx, cx, cy, sc, T) {
    const v = [
      simplexXY(1, 0, 0, cx, cy, sc),
      simplexXY(0, 1, 0, cx, cy, sc),
      simplexXY(0, 0, 1, cx, cy, sc),
    ];
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(v[1].x, v[1].y); ctx.lineTo(v[2].x, v[2].y); ctx.closePath();
    ctx.fillStyle = T.dark ? "rgba(91,140,255,0.06)" : "rgba(91,140,255,0.08)";
    ctx.fill();
    ctx.strokeStyle = T.line; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("e1", v[0].x, v[0].y + 14);
    ctx.fillText("e2", v[1].x, v[1].y + 14);
    ctx.fillText("e3", v[2].x, v[2].y - 8);
    return v;
  }
  function spark(ctx, arr, x, y, w, h, T, col) {
    if (!arr || arr.length < 2) return;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const sp = mx - mn || 1;
    ctx.strokeStyle = col || T.c4; ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const px = x + w * i / (arr.length - 1);
      const py = y + h - (arr[i] - mn) / sp * h;
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  function hi(S, i) { return S.phase === i; }
  function lw(S, i) { return hi(S, i) ? 2.8 : 1.5; }
  function al(S, i, on, off) { return hi(S, i) ? (on == null ? 0.32 : on) : (off == null ? 0.08 : off); }
  function n01(S, k, d, lo, hiVal) {
    return clamp((sl(S, k, d) - lo) / ((hiVal - lo) || 1), 0, 1);
  }
  function pmpPack(S, uFn, wgt) {
    const W = pmpWorld(S, uFn);
    pmpAdjoint(W, wgt);
    const C = pmpCost(W, wgt);
    return { W, C, wgt };
  }

  function quadKL(qmu, qsig, pfn, a, b, n) {
    n = n || 80;
    const dx = (b - a) / n;
    let s = 0;
    for (let i = 0; i <= n; i++) {
      const x = a + i * dx;
      const q = gauss(x, qmu, qsig);
      const p = Math.max(1e-14, pfn(x));
      s += q * (Math.log(q + 1e-14) - Math.log(p)) * dx;
    }
    return s;
  }
  function entG(sig) { return 0.5 * Math.log(TWO * Math.E * sig * sig); }

  function pmpWorld(S, uFn) {
    const a = -0.42, Tm = 2.0, n = 42, z0 = -0.9, zd = 1.12;
    const dt = Tm / n;
    const z = new Array(n + 1), u = new Array(n), lam = new Array(n + 1);
    z[0] = z0;
    for (let i = 0; i < n; i++) {
      const t = i * dt;
      u[i] = uFn(z[i], t, i);
      z[i + 1] = z[i] + dt * (a * z[i] + u[i]);
    }
    return { a, Tm, n, z0, zd, dt, z, u, lam };
  }
  function pmpAdjoint(W, wgt) {
    const { n, dt, a, z, zd, lam } = W;
    lam[n] = wgt * (z[n] - zd);
    for (let i = n - 1; i >= 0; i--) lam[i] = lam[i + 1] * (1 + a * dt);
    return lam;
  }
  function pmpCost(W, wgt) {
    let L = 0;
    for (let i = 0; i < W.u.length; i++) L += 0.5 * W.u[i] * W.u[i] * W.dt;
    const Phi = 0.5 * wgt * (W.z[W.n] - W.zd) * (W.z[W.n] - W.zd);
    return { L, Phi, F: L + Phi };
  }
  function pmpOptimalU(S) {
    const wgt = sl(S, "uamp", 0.8);
    const a = -0.42, Tm = 2.0, n = 42, z0 = -0.9, zd = 1.12, dt = Tm / n;
    let lo = -10, hi = 10, best = 0;
    for (let k = 0; k < 16; k++) {
      const lam0 = 0.5 * (lo + hi);
      let x = z0;
      for (let i = 0; i < n; i++) {
        const t = i * dt;
        const lam = lam0 * Math.exp(-a * t);
        const u = -lam;
        x = x + dt * (a * x + u);
      }
      const lamT = lam0 * Math.exp(-a * Tm);
      const want = wgt * (x - zd);
      if (lamT > want) hi = lam0; else lo = lam0;
      best = lam0;
    }
    return function (z, t) {
      return -(best * Math.exp(-a * t));
    };
  }

  function reg(id, spec) {
    OP[id] = {
      init(S) {
        window._CH2_S = S;
        applyForce(S);
        spec.init(S);
      },
      tick(S, dt) {
        applyForce(S);
        spec.tick(S, dt == null ? 0 : dt);
      },
      draw(ctx, S, T) {
        window._CH2_S = S;
        applyForce(S);
        spec.draw(ctx, S, T);
        paramStrip(ctx, S, T);
      },
    };
  }
  window._CH2_IDS = [];
  function R(id, spec) { window._CH2_IDS.push(id); reg(id, spec); }

  /* ============================================================
   *  2.1 隐变量边缘化 / 极大似然 / Jensen / ELBO / KL / VI
   * ============================================================ */

  R("latent_marginalization", {
    init(S) {
      const rnd = mulberry(7);
      S.sim = { zs: [], xs: [], acc: 0 };
      const mix = sl(S, "mix", 0.55);
      for (let i = 0; i < 56; i++) {
        const z = rnd() < mix ? 0 : 1;
        const x = z === 0 ? -1.15 + 0.42 * nrm(rnd) : 1.18 + 0.48 * nrm(rnd);
        S.sim.zs.push(z); S.sim.xs.push(x);
      }
    },
    tick(S, dt) {
      const mix = sl(S, "mix", 0.55);
      S.sim.acc += dt;
      if (S.sim.acc > 0.09) {
        S.sim.acc = 0;
        const rnd = mulberry((S.frame * 997) & 0xffff);
        for (let k = 0; k < 4; k++) {
          const i = (S.frame + k * 13) % S.sim.zs.length;
          const z = rnd() < mix ? 0 : 1;
          S.sim.zs[i] = z;
          S.sim.xs[i] = z === 0 ? -1.15 + 0.42 * nrm(rnd) : 1.18 + 0.48 * nrm(rnd);
        }
      }
      const px = (x) => mix * gauss(x, -1.15, 0.42) + (1 - mix) * gauss(x, 1.18, 0.48);
      let mass = 0;
      for (let i = 0; i <= 80; i++) mass += px(-3 + 6 * i / 80) * (6 / 80);
      S.metrics["π"] = mix;
      S.metrics["∫P(x)"] = mass;
      S.metrics["E[x]"] = mix * (-1.15) + (1 - mix) * 1.18;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const mix = sl(S, "mix", 0.55);
      const px = (x) => mix * gauss(x, -1.15, 0.42) + (1 - mix) * gauss(x, 1.18, 0.48);
      const p0 = (x) => mix * gauss(x, -1.15, 0.42);
      const p1 = (x) => (1 - mix) * gauss(x, 1.18, 0.48);
      const m = mapper(boxOf(S), -3, 3, 0, 1.05);
      axes(ctx, m, T, { xl: "观测 x / 隐变量 z", yl: "密度" });
      const ph = S.phase;
      if (ph === 0) {
        curve(ctx, m, (x) => mix * gauss(x, -1.15, 0.55) * 0.35, 80, T.c7, 2, alpha(T.c7, 0.18));
        curve(ctx, m, (x) => (1 - mix) * gauss(x, 1.18, 0.55) * 0.35, 80, T.c3, 2, alpha(T.c3, 0.18));
        S.sim.zs.forEach((z, i) => {
          const x = z === 0 ? -1.15 : 1.18;
          const jitter = ((i * 17) % 9 - 4) * 0.05;
          glow(ctx, m.X(x + jitter), m.box.y1 - 10 - (i % 5) * 4, 3.1, z ? T.c3 : T.c7);
        });
        callout(ctx, m.X(-2.2), m.Y(0.55), "z=0  先验质量 " + mix.toFixed(2), T, T.c7);
        callout(ctx, m.X(0.6), m.Y(0.55), "z=1  质量 " + (1 - mix).toFixed(2), T, T.c3);
      } else if (ph === 1) {
        curve(ctx, m, p0, 80, T.c7, 2, alpha(T.c7, 0.16));
        curve(ctx, m, p1, 80, T.c3, 2, alpha(T.c3, 0.16));
        S.sim.xs.forEach((x, i) => {
          const z = S.sim.zs[i];
          const zx = z ? 1.18 : -1.15;
          ctx.strokeStyle = alpha(z ? T.c3 : T.c7, 0.25);
          ctx.beginPath(); ctx.moveTo(m.X(zx), m.Y(0.22)); ctx.lineTo(m.X(x), m.box.y1 - 8); ctx.stroke();
          glow(ctx, m.X(x), m.box.y1 - 8, 3, z ? T.c3 : T.c7);
        });
        callout(ctx, 60, 52, "x ∼ P(x|z)：两工况高斯", T, T.c5);
      } else {
        curve(ctx, m, px, 96, T.c2, ph === 2 ? 3 : 2.2, alpha(T.c2, 0.22));
        if (ph === 3) {
          curve(ctx, m, p0, 80, T.c7, 1.6, alpha(T.c7, 0.12));
          curve(ctx, m, p1, 80, T.c3, 1.6, alpha(T.c3, 0.12));
        }
        const H = hist(S.sim.xs, -3, 3, 22);
        if (ph === 2) drawHist(ctx, m, H, T.c5);
        S.sim.xs.forEach((x, i) => glow(ctx, m.X(clamp(x, -2.9, 2.9)), m.box.y1 - 7, 2.6, S.sim.zs[i] ? T.c3 : T.c7));
      }
      legend(ctx, [
        { c: T.c7, l: "工况 z=0" },
        { c: T.c3, l: "工况 z=1" },
        { c: T.c2, l: "边缘 P(x)" },
      ], S.W - 118, 44, T);
    },
  });

  R("latent_max_likelihood", {
    init(S) { S.sim = { th: -0.4, zs: [], histL: [] }; const rnd = mulberry(3); for (let i = 0; i < 24; i++) S.sim.zs.push(nrm(rnd)); },
    tick(S, dt) {
      const beta = sl(S, "beta", 0.55);
      S.sim.th = -1.3 + 2.6 * sm(0.5 + 0.5 * Math.sin(S.t * 0.35));
      const nMC = Math.max(3, Math.round(3 + beta * 28));
      while (S.sim.zs.length < nMC) S.sim.zs.push(nrm(mulberry(S.sim.zs.length + 11)));
      if (S.sim.zs.length > nMC) S.sim.zs.length = nMC;
      const xobs = 0.25, sig = 0.7;
      const trueLL = logG(xobs, S.sim.th, Math.sqrt(sig * sig + 0.25));
      let mc = 0;
      for (let i = 0; i < S.sim.zs.length; i++) mc += gauss(xobs, S.sim.th + 0.5 * S.sim.zs[i], sig);
      mc = Math.log(mc / S.sim.zs.length + 1e-12);
      S.sim.trueLL = trueLL; S.sim.mc = mc; S.sim.nMC = nMC;
      if (S.frame % 4 === 0) {
        S.sim.histL.push(mc);
        if (S.sim.histL.length > 70) S.sim.histL.shift();
      }
      S.metrics["θ"] = S.sim.th;
      S.metrics["log p(x)"] = trueLL;
      S.metrics["MC估计"] = mc;
      S.metrics["积分点数"] = nMC;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const xobs = 0.25, sig = 0.7;
      const beta = sl(S, "beta", 0.55);
      const nMC = Math.max(3, Math.round(3 + beta * 28));
      const ll = (th) => logG(xobs, th, Math.sqrt(sig * sig + 0.25));
      const m = mapper(boxOf(S, { l: 56 }), -1.6, 1.6, -3.2, 0.2);
      axes(ctx, m, T, { xl: "参数 θ", yl: "log p_θ(x)" });
      curve(ctx, m, ll, 100, T.c2, S.phase === 0 ? 3 : 1.8);
      const th = S.sim.th;
      glow(ctx, m.X(th), m.Y(ll(th)), 6, T.c6);
      if (S.phase === 1) {
        const show = Math.min(S.sim.zs.length, nMC);
        for (let i = 0; i < show; i++) {
          const z = S.sim.zs[i];
          const yy = m.Y(-2.6 + 0.05 * i);
          ctx.strokeStyle = alpha(T.c5, 0.35);
          ctx.beginPath(); ctx.moveTo(m.X(th), m.Y(ll(th))); ctx.lineTo(m.X(th) + z * 18, yy); ctx.stroke();
          glow(ctx, m.X(th) + z * 18, yy, 2.4, T.c5);
        }
        callout(ctx, m.X(th) + 12, m.Y(ll(th)) - 10, "每个 θ 都要对 z 积分  n=" + nMC, T, T.c5);
      }
      if (S.phase === 2) {
        ctx.strokeStyle = T.c5; ctx.lineWidth = 2; ctx.setLineDash([5, 3]);
        ctx.beginPath();
        for (let i = 0; i <= 50; i++) {
          const t = -1.6 + 3.2 * i / 50;
          let mc = 0;
          for (let k = 0; k < nMC; k++) mc += gauss(xobs, t + 0.5 * S.sim.zs[k % S.sim.zs.length], sig);
          const y = Math.log(mc / nMC + 1e-12);
          const px = m.X(t), py = m.Y(y);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke(); ctx.setLineDash([]);
        callout(ctx, 168, 54, "MC 样本 n=" + nMC + "（β 控制）", T, T.c5);
      }
      if (S.phase === 3) {
        const gap = 0.55 * (1.05 - beta);
        curve(ctx, m, (t) => ll(t) - gap, 80, T.c4, 2.4);
        callout(ctx, 168, 54, "下界 / 得分 代替硬积分", T, T.c4);
      }
      spark(ctx, S.sim.histL, S.W - 130, 44, 110, 28, T, T.c3);
      legend(ctx, [{ c: T.c2, l: "真边缘似然" }, { c: T.c5, l: "MC 估计" }, { c: T.c4, l: "下界示意" }], 56, 48, T);
    },
  });

  R("jensen_inequality", {
    init(S) { S.sim = { pts: [-1.15, 1.45] }; },
    tick(S) {
      const t = sl(S, "tpos", 0.45);
      const a = S.sim.pts[0], b = S.sim.pts[1];
      const xm = lerp(a, b, t);
      const f = (x) => Math.log(Math.max(0.12, 1.7 + x));
      const chord = lerp(f(a), f(b), t);
      S.metrics["t"] = t;
      S.metrics["log E[f]"] = f(xm); /* 对两点均匀时并非精确，下面用两点混合 */
      const Ef = t * f(b) + (1 - t) * f(a); /* E log */
      const fE = Math.log(Math.max(0.12, (1 - t) * (1.7 + a) + t * (1.7 + b)));
      S.metrics["E[log f]"] = (1 - t) * f(a) + t * f(b);
      S.metrics["log E[f]"] = fE;
      S.metrics["间隙"] = fE - ((1 - t) * f(a) + t * f(b));
      S.sim.xm = xm; S.sim.f = f; S.sim.chord = chord; S.sim.fE = fE; S.sim.Elog = Ef;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const f = (x) => Math.log(Math.max(0.12, 1.7 + x));
      const a = S.sim.pts[0], b = S.sim.pts[1];
      const tpos = sl(S, "tpos", 0.45);
      const xm = lerp(a, b, tpos);
      const m = mapper(boxOf(S), -2.4, 2.4, -1.4, 1.35);
      axes(ctx, m, T, { xl: "z", yl: "log f(z)" });
      curve(ctx, m, f, 120, T.c2, 2.4);
      ctx.strokeStyle = T.c5; ctx.lineWidth = hi(S, 0) || hi(S, 1) ? 2.6 : 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(m.X(a), m.Y(f(a))); ctx.lineTo(m.X(b), m.Y(f(b))); ctx.stroke();
      ctx.setLineDash([]);
      glow(ctx, m.X(a), m.Y(f(a)), 5, T.c3);
      glow(ctx, m.X(b), m.Y(f(b)), 5, T.c3);
      glow(ctx, m.X(xm), m.Y(f(xm)), 6, T.c6);
      glow(ctx, m.X(xm), m.Y(lerp(f(a), f(b), tpos)), 6, T.c5);
      ctx.strokeStyle = alpha(T.c6, 0.8); ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(m.X(xm), m.Y(f(xm))); ctx.lineTo(m.X(xm), m.Y(lerp(f(a), f(b), tpos))); ctx.stroke();
      ctx.setLineDash([]);
      if (S.phase >= 2) {
        callout(ctx, m.X(xm) + 8, m.Y(lerp(f(a), f(b), tpos)) - 8, "log∫Qf  ≥  ∫Q log f", T, T.c4);
      }
      if (S.phase === 3) {
        /* 等号：把 a,b 拉近，f 近常数 */
        const mid = 0.2;
        curve(ctx, m, (x) => f(mid) + 0.02 * (x - mid), 40, T.c4, 2);
        callout(ctx, Math.max(168, m.X(mid) - 40), 54, "f 对 Q 近常数 ⇒ 间隙→0", T, T.c4);
      }
      legend(ctx, [{ c: T.c2, l: "凹函数 log" }, { c: T.c5, l: "弦 = 期望组合" }, { c: T.c6, l: "曲线上的点" }], 56, 48, T);
    },
  });

  R("elbo", {
    init(S) { S.sim = { qmu: -1.6, qsig: 0.55, th: 0.2, hist: [] }; },
    tick(S, dt) {
      const beta = sl(S, "beta", 0.55);
      const postM = 0.15, postS = 0.62;
      onPhase(S, {
        0() {},
        1() { S.sim.qmu = -1.7; S.sim.qsig = 0.5; },
        2() {},
        3() {},
      });
      if (S.phase <= 1) {
        /* 远离后验 */
        S.sim.qmu += (-1.55 - S.sim.qmu) * dt * 1.2;
      } else if (S.phase === 2) {
        S.sim.qmu += (postM - S.sim.qmu) * dt * (1.6 + 2.2 * beta);
        S.sim.qsig += (postS - S.sim.qsig) * dt * (1.6 + 2.2 * beta);
      } else {
        S.sim.th += (0.55 - S.sim.th) * dt * 0.8;
        S.sim.qmu += (postM + 0.15 * S.sim.th - S.sim.qmu) * dt * 2;
      }
      const kl = klG(S.sim.qmu, S.sim.qsig, postM, postS);
      const ll = -0.5 * (S.sim.th) * (S.sim.th) + 0.05;
      const elbo = ll - kl;
      S.sim.kl = kl; S.sim.ll = ll; S.sim.elbo = elbo;
      if (S.frame % 3 === 0) { S.sim.hist.push(elbo); if (S.sim.hist.length > 80) S.sim.hist.shift(); }
      S.metrics["log p(x)"] = ll;
      S.metrics.ELBO = elbo;
      S.metrics["KL间隙"] = kl;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const postM = 0.15, postS = 0.62;
      const fit = sl(S, "beta", 0.55);
      let qmu, qsig;
      if (S.phase <= 1) { qmu = lerp(-1.75, -0.6, fit * 0.35); qsig = 0.48 + 0.12 * fit; }
      else if (S.phase === 2) { qmu = lerp(-1.7, postM, clamp(fit, 0.08, 1)); qsig = lerp(0.48, postS, fit); }
      else { qmu = postM + 0.25 * (fit - 0.55); qsig = postS; }
      const kl = klG(qmu, qsig, postM, postS);
      const ll = -0.5 * (S.sim.th) * (S.sim.th) + 0.05;
      const elbo = ll - kl;
      S.metrics["log p(x)"] = ll; S.metrics.ELBO = elbo; S.metrics["KL间隙"] = kl;
      const m = mapper(boxOf(S, { r: 150 }), -3, 3, 0, 0.85);
      axes(ctx, m, T, { xl: "z", yl: "密度" });
      curve(ctx, m, (x) => gauss(x, postM, postS), 90, T.mu, 1.6, alpha(T.mu, 0.1));
      curve(ctx, m, (x) => gauss(x, qmu, qsig), 90, T.c2, 2.6, alpha(T.c2, al(S, S.phase, 0.28, 0.12)));
      /* 右侧：似然 vs ELBO */
      const rb = { x0: S.W - 138, y0: 40, x1: S.W - 14, y1: S.H - 48, w: 124, h: S.H - 88 };
      ctx.strokeStyle = T.line; ctx.strokeRect(rb.x0, rb.y0, rb.w, rb.h);
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("目标值", rb.x0 + 6, rb.y0 + 14);
      const vmin = Math.min(ll, elbo, -1.6), vmax = Math.max(ll, elbo, 0.15);
      const Yv = (v) => rb.y1 - 8 - clamp((v - vmin) / (vmax - vmin || 1), 0, 1) * (rb.h - 36);
      const yL = Yv(ll), yE = Yv(elbo);
      ctx.fillStyle = T.c3; ctx.fillRect(rb.x0 + 18, yL, 28, rb.y1 - 8 - yL);
      ctx.fillStyle = T.c5; ctx.fillRect(rb.x0 + 64, yE, 28, rb.y1 - 8 - yE);
      ctx.fillStyle = T.tx; ctx.font = "10px sans-serif";
      ctx.fillText("log p", rb.x0 + 16, rb.y1 + 12);
      ctx.fillText("ELBO", rb.x0 + 62, rb.y1 + 12);
      spark(ctx, S.sim.hist, rb.x0 + 8, rb.y0 + 20, rb.w - 16, 40, T, T.c4);
      legend(ctx, [{ c: T.mu, l: "后验 P(z|x)" }, { c: T.c2, l: "变分 Q" }, { c: T.c5, l: "ELBO" }], 56, 48, T);
      if (S.phase === 1) callout(ctx, m.X(qmu), m.Y(gauss(qmu, qmu, qsig)) - 8, "Q 远离 ⇒ 间隙大", T, T.c6);
      if (S.phase === 2) callout(ctx, Math.max(168, m.X(qmu)), 56, "优化 Q：KL→0，ELBO 贴上  β=" + fit.toFixed(2), T, T.c4);
      if (S.phase === 3) callout(ctx, Math.max(168, m.X(postM) - 20), 56, "再抬 θ，似然本身上升", T, T.c3);
      hitBox(S, "state", m.box);
      hit(S, "energy", { type: "rect", x: rb.x0, y: rb.y0, w: rb.w, h: rb.h });
    },
  });

  R("kl_divergence", {
    init(S) { S.sim = {}; },
    tick(S) {
      const sep = sl(S, "sep", 1.0);
      let mq, sq, mp, sp;
      if (S.phase === 0 || S.phase === 1) {
        mq = -sep * 0.55; sq = 0.48; mp = sep * 0.5; sp = 0.82;
      } else if (S.phase === 2) {
        mq = -sep * 0.9; sq = 0.42; mp = sep * 0.9; sp = 0.7;
      } else {
        mq = 0; sq = 0.6; mp = 0; sp = 0.6;
      }
      S.sim.mq = mq; S.sim.sq = sq; S.sim.mp = mp; S.sim.sp = sp;
      S.metrics["KL(Q‖P)"] = klG(mq, sq, mp, sp);
      S.metrics["KL(P‖Q)"] = klG(mp, sp, mq, sq);
      S.metrics["均值差"] = Math.abs(mq - mp);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const sep = sl(S, "sep", 1.0);
      let mq, sq, mp, sp;
      if (S.phase === 0 || S.phase === 1) {
        mq = -sep * 0.55; sq = 0.48; mp = sep * 0.5; sp = 0.82;
      } else if (S.phase === 2) {
        mq = -sep * 0.9; sq = 0.42; mp = sep * 0.9; sp = 0.7;
      } else {
        mq = 0; sq = 0.6; mp = 0; sp = 0.6;
      }
      S.metrics["KL(Q‖P)"] = klG(mq, sq, mp, sp);
      S.metrics["KL(P‖Q)"] = klG(mp, sp, mq, sq);
      S.metrics["均值差"] = Math.abs(mq - mp);
      const peak = Math.max(gauss(mq, mq, sq), gauss(mp, mp, sp)) * 1.15;
      const m = mapper(boxOf(S), -3.2, 3.2, 0, peak);
      axes(ctx, m, T, { xl: "z", yl: "密度" });
      /* 重叠涂色 */
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const x = -3.2 + 6.4 * i / 100;
        const y = Math.min(gauss(x, mq, sq), gauss(x, mp, sp));
        const px = m.X(x), py = m.Y(y);
        if (i === 0) ctx.moveTo(px, m.Y(0));
        ctx.lineTo(px, py);
      }
      ctx.lineTo(m.X(3.2), m.Y(0)); ctx.closePath();
      ctx.fillStyle = alpha(T.c4, hi(S, 0) ? 0.35 : 0.16); ctx.fill();
      curve(ctx, m, (x) => gauss(x, mq, sq), 100, T.c2, 2.5, alpha(T.c2, 0.12));
      curve(ctx, m, (x) => gauss(x, mp, sp), 100, T.c6, 2.5, alpha(T.c6, 0.12));
      const kqp = klG(mq, sq, mp, sp), kpq = klG(mp, sp, mq, sq);
      /* 不对称柱 */
      const bx = S.W - 132, by = 42;
      ctx.fillStyle = T.c2; ctx.fillRect(bx, by + 70 - clamp(kqp, 0, 4) / 4 * 70, 28, clamp(kqp, 0, 4) / 4 * 70);
      ctx.fillStyle = T.c6; ctx.fillRect(bx + 44, by + 70 - clamp(kpq, 0, 4) / 4 * 70, 28, clamp(kpq, 0, 4) / 4 * 70);
      ctx.fillStyle = T.tx; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("Q‖P", bx + 14, by + 84);
      ctx.fillText("P‖Q", bx + 58, by + 84);
      if (S.phase === 1) callout(ctx, bx - 20, by, "二者不等：KL 不是距离", T, T.c5);
      if (S.phase === 2) callout(ctx, 160, 54, "拉开均值，KL 急升", T, T.c6);
      if (S.phase === 3) callout(ctx, 160, 54, "Q=P 时 KL=0", T, T.c4);
      legend(ctx, [{ c: T.c2, l: "Q" }, { c: T.c6, l: "P" }, { c: T.c4, l: "重叠" }], 56, 48, T);
    },
  });

  R("variational_inference", {
    init(S) {
      S.sim = { mu: -1.85, sig: 0.42, hist: [] };
    },
    tick(S, dt) {
      const rate = sl(S, "rate", 0.8);
      const pfn = (x) => 0.5 * gauss(x, -1.22, 0.34) + 0.5 * gauss(x, 1.28, 0.38);
      onPhase(S, {
        1() { S.sim.mu = -1.9; S.sim.sig = 0.4; },
        3() { S.sim.sig = Math.min(S.sim.sig, 0.34); },
      });
      const capSig = S.phase === 3 ? 0.36 : 1.1;
      /* 真实对 KL 做有限差分梯度下降 */
      const h = 0.04;
      const kl0 = quadKL(S.sim.mu, S.sim.sig, pfn, -3.2, 3.2, 72);
      const dmu = (quadKL(S.sim.mu + h, S.sim.sig, pfn, -3.2, 3.2, 72) - kl0) / h;
      const dsig = (quadKL(S.sim.mu, S.sim.sig + h, pfn, -3.2, 3.2, 72) - kl0) / h;
      if (S.phase >= 2) {
        S.sim.mu -= dt * 1.8 * rate * dmu;
        S.sim.sig = clamp(S.sim.sig - dt * 1.4 * rate * dsig, 0.18, capSig);
      }
      const kl = quadKL(S.sim.mu, S.sim.sig, pfn, -3.2, 3.2, 72);
      if (S.frame % 3 === 0) { S.sim.hist.push(kl); if (S.sim.hist.length > 70) S.sim.hist.shift(); }
      S.metrics["μ"] = S.sim.mu;
      S.metrics["σ"] = S.sim.sig;
      S.metrics["KL(Q‖后验)"] = kl;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const pfn = (x) => 0.5 * gauss(x, -1.22, 0.34) + 0.5 * gauss(x, 1.28, 0.38);
      const t = n01(S, "rate", 0.8, 0.2, 2.2);
      let mu = S.sim.mu, sig = S.sim.sig;
      if (S.phase === 1) { mu = -1.9 + 0.35 * t; sig = 0.4; }
      if (S.phase === 2) { mu = lerp(-1.85, 0.08, t); sig = lerp(0.4, 0.72, t); }
      if (S.phase === 3) { mu = lerp(-1.9, -1.22, t); sig = lerp(0.42, 0.30, t); }
      S.metrics["μ"] = mu; S.metrics["σ"] = sig;
      S.metrics["KL(Q‖后验)"] = quadKL(mu, sig, pfn, -3.2, 3.2, 72);
      const m = mapper(boxOf(S), -3.2, 3.2, 0, 0.85);
      axes(ctx, m, T, { xl: "z", yl: "密度" });
      curve(ctx, m, pfn, 110, T.mu, hi(S, 0) ? 3 : 1.7, alpha(T.mu, hi(S, 0) ? 0.28 : 0.1));
      curve(ctx, m, (x) => gauss(x, mu, sig), 90, T.c2, hi(S, 1) || hi(S, 2) ? 3 : 2, alpha(T.c2, 0.2));
      spark(ctx, S.sim.hist, S.W - 140, 44, 120, 32, T, T.c6);
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("KL 轨迹", S.W - 140, 42);
      if (S.phase === 3) callout(ctx, m.X(mu), 58, "族太窄：只能盖一个峰", T, T.c6);
      if (S.phase === 2) callout(ctx, 168, 54, "梯度下降减小 KL  rate=" + sl(S, "rate", 0.8).toFixed(2), T, T.c5);
      legend(ctx, [{ c: T.mu, l: "多峰后验" }, { c: T.c2, l: "高斯 Q" }], 56, 48, T);
    },
  });

  R("optimal_variational_distribution", {
    init(S) { S.sim = { Z: 1, gmu: 0, gsig: 0.7 }; },
    tick(S, dt) {
      const rate = sl(S, "rate", 0.8);
      const un = (z) => Math.exp(-0.5 * ((z + 1.1) / 0.35) ** 2) + 0.9 * Math.exp(-0.5 * ((z - 1.2) / 0.4) ** 2);
      let Z = 0;
      for (let i = 0; i <= 120; i++) Z += un(-3 + 6 * i / 120) * (6 / 120);
      S.sim.un = un; S.sim.Z = Z;
      /* 矩匹配 */
      let m1 = 0, m2 = 0;
      for (let i = 0; i <= 120; i++) {
        const x = -3 + 6 * i / 120, p = un(x) / Z;
        m1 += x * p * (6 / 120); m2 += x * x * p * (6 / 120);
      }
      const tgtMu = m1, tgtSig = Math.sqrt(Math.max(1e-4, m2 - m1 * m1));
      S.sim.tgtMu = tgtMu; S.sim.tgtSig = tgtSig;
      if (S.phase >= 2) {
        S.sim.gmu += (tgtMu - S.sim.gmu) * dt * 2.4 * rate;
        S.sim.gsig += (tgtSig - S.sim.gsig) * dt * 2.4 * rate;
      } else { S.sim.gmu = -0.2; S.sim.gsig = 1.1; }
      S.metrics["配分 Z"] = Z;
      S.metrics["匹配 μ"] = tgtMu;
      S.metrics["匹配 σ"] = tgtSig;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const un = S.sim.un, Z = S.sim.Z;
      let yMax = 0.3;
      if (S.phase === 0) {
        for (let i = 0; i <= 40; i++) yMax = Math.max(yMax, un(-3 + 6 * i / 40));
      } else yMax = 0.85;
      const m = mapper(boxOf(S), -3.1, 3.1, 0, yMax * 1.12);
      axes(ctx, m, T, { xl: "z", yl: S.phase === 0 ? "未归一化" : "密度" });
      if (S.phase === 0) {
        curve(ctx, m, un, 110, T.c7, 2.6, alpha(T.c7, 0.22));
        callout(ctx, 64, 54, "Q*(z) ∝ p(x|z)P(z)  尚未除 Z", T, T.c7);
      } else {
        curve(ctx, m, (x) => un(x) / Z, 110, T.c3, 2.6, alpha(T.c3, S.phase === 1 ? 0.3 : 0.12));
        if (S.phase >= 2) {
          const t = n01(S, "rate", 0.8, 0.2, 2.2);
          const gmu = lerp(-0.2, S.sim.tgtMu, t);
          const gsig = lerp(1.1, S.sim.tgtSig, t);
          curve(ctx, m, (x) => gauss(x, gmu, gsig), 90, T.c2, 2.4, alpha(T.c2, 0.16));
          callout(ctx, 64, 54, "单高斯只能匹配矩  rate=" + sl(S, "rate", 0.8).toFixed(2), T, T.c2);
        }
        if (S.phase === 3) {
          /* 粒子示意更灵活 */
          const rnd = mulberry(21);
          for (let i = 0; i < 28; i++) {
            let x = -2.4 + 4.8 * rnd();
            /* 拒绝采样近似后验 */
            if (rnd() > un(x) / (Z * 0.9)) { i--; continue; }
            glow(ctx, m.X(x), m.box.y1 - 8, 3, T.c5);
          }
          callout(ctx, S.W - 210, 58, "粒子/传输可盖多峰", T, T.c5);
        }
      }
      legend(ctx, [{ c: T.c3, l: "真实后验" }, { c: T.c2, l: "高斯投影" }, { c: T.c5, l: "粒子" }], 56, 48, T);
    },
  });

  R("vbem", {
    init(S) {
      const rnd = mulberry(9);
      const xs = [];
      for (let i = 0; i < 48; i++) xs.push(rnd() < 0.45 ? -1.2 + 0.32 * nrm(rnd) : 1.35 + 0.4 * nrm(rnd));
      S.sim = { xs, pi: [0.5, 0.5], mu: [-0.2, 0.3], sig: [0.7, 0.7], resp: [], L: [ -2.5 ], acc: 0, mode: 0 };
    },
    tick(S, dt) {
      const rate = sl(S, "rate", 1);
      const sim = S.sim, n = sim.xs.length;
      sim.acc += dt * rate;
      const doE = () => {
        sim.resp = sim.xs.map((x) => {
          const a = sim.pi[0] * gauss(x, sim.mu[0], sim.sig[0]);
          const b = sim.pi[1] * gauss(x, sim.mu[1], sim.sig[1]);
          const s = a + b + 1e-14;
          return [a / s, b / s];
        });
      };
      const doM = () => {
        if (!sim.resp.length) doE();
        let N0 = 0, N1 = 0, m0 = 0, m1 = 0;
        for (let i = 0; i < n; i++) { N0 += sim.resp[i][0]; N1 += sim.resp[i][1]; m0 += sim.resp[i][0] * sim.xs[i]; m1 += sim.resp[i][1] * sim.xs[i]; }
        sim.pi = [N0 / n, N1 / n];
        sim.mu = [m0 / (N0 + 1e-9), m1 / (N1 + 1e-9)];
        let v0 = 0, v1 = 0;
        for (let i = 0; i < n; i++) {
          v0 += sim.resp[i][0] * (sim.xs[i] - sim.mu[0]) ** 2;
          v1 += sim.resp[i][1] * (sim.xs[i] - sim.mu[1]) ** 2;
        }
        sim.sig = [Math.sqrt(v0 / (N0 + 1e-9) + 0.02), Math.sqrt(v1 / (N1 + 1e-9) + 0.02)];
      };
      const elbo = () => {
        let L = 0;
        for (let i = 0; i < n; i++) {
          L += Math.log(sim.pi[0] * gauss(sim.xs[i], sim.mu[0], sim.sig[0]) + sim.pi[1] * gauss(sim.xs[i], sim.mu[1], sim.sig[1]) + 1e-14);
        }
        return L / n;
      };
      onPhase(S, { 0() { sim.mode = 0; }, 1() { sim.mode = 1; } });
      if (S.phase === 0 || (S.phase === 2 && sim.mode === 0) || S.phase === 3) doE();
      if (sim.acc > 0.45) {
        sim.acc = 0;
        if (S.phase >= 1) {
          if (sim.mode === 0) { doE(); sim.mode = 1; }
          else { doM(); sim.mode = 0; }
          sim.L.push(elbo());
          if (sim.L.length > 28) sim.L.shift();
        }
      }
      S.metrics.ELBO = elbo();
      S.metrics["步"] = sim.mode ? "M" : "E";
      S.metrics["π0"] = sim.pi[0];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const sim = S.sim;
      const m = mapper(boxOf(S, { r: 150 }), -3, 3, 0, 0.8);
      axes(ctx, m, T, { xl: "x", yl: "密度 / 责任" });
      const tR = n01(S, "rate", 1, 0.2, 2.0);
      /* 步长大：两团分得更开、更尖（教学上=E/M 更敢更新） */
      const sep = 0.55 + 1.15 * tR;
      const mu = [(sim.mu[0] || -0.2) * sep - 0.35 * (1 - tR), (sim.mu[1] || 0.3) * sep + 0.35 * (1 - tR)];
      const pi = sim.pi;
      const sigv = [(sim.sig[0] || 0.7) * (1.25 - 0.55 * tR), (sim.sig[1] || 0.7) * (1.25 - 0.55 * tR)];
      const mix = (x) => pi[0] * gauss(x, mu[0], sigv[0]) + pi[1] * gauss(x, mu[1], sigv[1]);
      curve(ctx, m, (x) => pi[0] * gauss(x, mu[0], sigv[0]), 80, T.c7, 2, alpha(T.c7, 0.14));
      curve(ctx, m, (x) => pi[1] * gauss(x, mu[1], sigv[1]), 80, T.c3, 2, alpha(T.c3, 0.14));
      curve(ctx, m, mix, 90, T.c2, 2.2);
      sim.xs.forEach((x, i) => {
        const r = (sim.resp[i] && sim.resp[i][0]) || 0.5;
        const col = r > 0.5 ? T.c7 : T.c3;
        glow(ctx, m.X(clamp(x, -2.9, 2.9)), m.box.y1 - 7, 3.1, col);
      });
      spark(ctx, sim.L, S.W - 140, 48, 120, 70, T, T.c4);
      const isM = S.phase === 1 || (S.phase === 2 && sim.mode);
      ctx.fillStyle = isM ? T.c5 : T.c2;
      rr(ctx, S.W - 140, 128, 70, 24, 6); ctx.fill();
      ctx.fillStyle = T.dark ? "#071018" : "#152038";
      font(ctx, 13, true); ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(isM ? "M 步" : "E 步", S.W - 105, 140);
      if (S.phase === 0) {
        /* 责任：粒子按 Q(z|x) 着色更鲜艳 */
        callout(ctx, 56, 54, "E 步：给每个 x 涂责任色", T, T.c2);
      }
      if (S.phase === 1) {
        glow(ctx, m.X(mu[0]), m.Y(pi[0] * gauss(mu[0], mu[0], sigv[0])), 7, T.c7);
        glow(ctx, m.X(mu[1]), m.Y(pi[1] * gauss(mu[1], mu[1], sigv[1])), 7, T.c3);
        callout(ctx, 56, 54, "M 步：用责任加权更新 μ,σ,π", T, T.c5);
      }
      if (S.phase === 2) callout(ctx, S.W - 210, 54, "ELBO 台阶上升", T, T.c4);
      if (S.phase === 3) callout(ctx, 64, 54, "Q 与 θ 互相自洽", T, T.c3);
    },
  });

  R("amortized_inference_network", {
    init(S) {
      S.sim = { xs: [-1.6, -0.8, -0.1, 0.7, 1.5], phi: 0.55 };
    },
    tick(S, dt) {
      const beta = sl(S, "beta", 1);
      S.sim.phi += (0.7 - S.sim.phi) * dt * 0.4;
      S.sim.enc = S.sim.xs.map((x) => {
        const mu = S.sim.phi * x;
        const sig = 0.22 + 0.55 / (beta + 0.35);
        return { x, mu, sig };
      });
      /* 逐点 VI：σ 更小、μ 更贴 x */
      S.sim.vi = S.sim.xs.map((x) => ({ x, mu: 0.92 * x, sig: 0.18 }));
      const gap = S.sim.enc.reduce((s, e, i) => s + Math.abs(e.mu - S.sim.vi[i].mu) + Math.abs(e.sig - S.sim.vi[i].sig), 0) / S.sim.xs.length;
      S.metrics["β"] = beta;
      S.metrics["摊销间隙"] = gap;
      S.metrics["平均σ"] = S.sim.enc.reduce((s, e) => s + e.sig, 0) / S.sim.enc.length;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const beta = sl(S, "beta", 1);
      const phi = S.sim.phi;
      S.sim.enc = S.sim.xs.map((x) => ({ x, mu: phi * x, sig: 0.22 + 0.55 / (beta + 0.35) }));
      S.sim.vi = S.sim.xs.map((x) => ({ x, mu: 0.92 * x, sig: 0.18 }));
      const yX = 70, yZ = H * 0.62;
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("数据空间 x", 24, yX - 18);
      ctx.fillText("隐空间 z", 24, yZ - 28);
      ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(40, yX); ctx.lineTo(W - 24, yX); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(40, yZ); ctx.lineTo(W - 24, yZ); ctx.stroke();
      const X = (x) => 50 + (x + 2) / 4 * (W - 90);
      /* 网络盒子 */
      if (S.phase !== 3) {
        ctx.strokeStyle = T.c7; ctx.lineWidth = hi(S, 0) ? 2.6 : 1.4;
        rr(ctx, W * 0.36, yX + 18, 120, 40, 8); ctx.stroke();
        ctx.fillStyle = T.c7; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("Encoder φ 共享", W * 0.36 + 60, yX + 42);
      }
      S.sim.enc.forEach((e, i) => {
        glow(ctx, X(e.x), yX, 5, T.c2);
        ctx.fillStyle = T.tx; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
        ctx.fillText("x" + (i + 1), X(e.x), yX - 10);
        if (S.phase >= 1) {
          ctx.strokeStyle = alpha(T.c5, 0.55); ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(X(e.mu), yZ, 18 + 40 * e.sig, 16 + 10 * e.sig, 0, 0, TWO); ctx.stroke();
          glow(ctx, X(e.mu), yZ, 4, T.c5);
          if (S.phase === 0 || S.phase === 1) {
            ctx.strokeStyle = alpha(T.c7, 0.4);
            ctx.beginPath(); ctx.moveTo(X(e.x), yX + 6); ctx.lineTo(X(e.mu), yZ - 18); ctx.stroke();
          }
        }
      });
      if (S.phase === 2) callout(ctx, W * 0.36, yX + 70, "不同 x 共用同一套 φ", T, T.c7);
      if (S.phase === 3) {
        S.sim.vi.forEach((e) => {
          ctx.strokeStyle = T.c3; ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.ellipse(X(e.mu), yZ, 14 + 30 * e.sig, 12, 0, 0, TWO); ctx.stroke();
          ctx.setLineDash([]);
        });
        callout(ctx, 50, yZ + 36, "虚线：每个 x 单独 VI，更准更慢", T, T.c3);
      }
      legend(ctx, [{ c: T.c2, l: "样本 x" }, { c: T.c5, l: "摊销椭圆" }, { c: T.c3, l: "逐点 VI" }], W - 150, 44, T);
    },
  });

  R("vae_objective", {
    init(S) {
      S.sim = { theta: 0.3, phi: 0.4, histR: [], histK: [], xs: [-1.4, -0.6, 0.2, 0.9, 1.5] };
    },
    tick(S, dt) {
      const beta = sl(S, "beta", 1);
      const xs = S.sim.xs;
      /* 线性高斯 VAE：μ=φx, σ=σ0(β), 解码 x̂=θz, 对 ELBO 做真实梯度步进 */
      const sig = 0.18 + 0.7 / (0.4 + beta);
      let gTheta = 0, gPhi = 0, recon = 0, kls = 0;
      xs.forEach((x) => {
        const mu = S.sim.phi * x;
        const xh = S.sim.theta * mu; /* E[dec(z)] */
        recon += (x - xh) * (x - xh) + (S.sim.theta * sig) * (S.sim.theta * sig);
        kls += -Math.log(sig) + 0.5 * (mu * mu + sig * sig - 1);
        gTheta += -2 * (x - xh) * mu + 2 * S.sim.theta * sig * sig;
        gPhi += -2 * (x - xh) * S.sim.theta * x + beta * mu * x;
      });
      const n = xs.length;
      recon /= n; kls /= n;
      if (S.phase >= 1) {
        S.sim.theta -= dt * 0.35 * gTheta / n;
        S.sim.phi -= dt * 0.35 * gPhi / n;
      }
      S.sim.sig = sig; S.sim.recon = recon; S.sim.kls = kls;
      if (S.frame % 3 === 0) {
        S.sim.histR.push(recon); S.sim.histK.push(kls);
        if (S.sim.histR.length > 70) { S.sim.histR.shift(); S.sim.histK.shift(); }
      }
      S.metrics["重建"] = recon;
      S.metrics.KL = kls;
      S.metrics["βKL"] = beta * kls;
      S.metrics["σ"] = sig;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H, beta = sl(S, "beta", 1);
      S.sim.sig = 0.18 + 0.7 / (0.4 + beta);
      const y = H * 0.42;
      const boxes = [
        { lab: "x", c: T.c2 },
        { lab: "qφ(z|x)", c: T.c7 },
        { lab: "z", c: T.c5 },
        { lab: "x̂=pθ", c: T.c3 },
      ];
      const bw = Math.min(100, (W - 80) / 4 - 16);
      boxes.forEach((b, i) => {
        const x = 28 + i * (W - 40) / 4;
        ctx.strokeStyle = b.c; ctx.lineWidth = (S.phase === 0 && i < 3) || (S.phase === 1 && i === 3) ? 2.8 : 1.5;
        rr(ctx, x, y - 34, bw, 68, 8); ctx.stroke();
        ctx.fillStyle = T.tx; font(ctx, 12, true); ctx.textAlign = "center";
        ctx.fillText(b.lab, x + bw / 2, y - 14);
        font(ctx, 10, false); ctx.fillStyle = T.mu;
        if (i === 0) ctx.fillText("x̄=" + S.sim.xs[2].toFixed(2), x + bw / 2, y + 8);
        if (i === 1) ctx.fillText("φ=" + S.sim.phi.toFixed(2), x + bw / 2, y + 8);
        if (i === 2) ctx.fillText("σ=" + (S.sim.sig != null ? S.sim.sig : (0.18 + 0.7 / (0.4 + beta))).toFixed(2), x + bw / 2, y + 8);
        if (i === 3) ctx.fillText("θ=" + S.sim.theta.toFixed(2), x + bw / 2, y + 8);
        if (i < 3) arrow(ctx, x + bw + 2, y, (W - 40) / 4 - bw - 8, 0, T.mu, 1.4);
      });
      /* 先验球 vs 后验 */
      const cx = W * 0.5, cy = H * 0.78, sc = 34;
      ctx.strokeStyle = T.mu; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, sc, 0, TWO); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("先验 N(0,I)", cx, cy + sc + 12);
      S.sim.xs.forEach((x, i) => {
        const mu = S.sim.phi * x;
        const sig = S.sim.sig;
        const px = cx + mu * sc * 1.1, py = cy + (i - 2) * 7;
        ctx.strokeStyle = beta > 2.4 ? alpha(T.c6, 0.7) : T.c5;
        ctx.beginPath(); ctx.ellipse(px, py, 8 + 22 * sig, 6 + 8 * sig, 0, 0, TWO); ctx.stroke();
      });
      spark(ctx, S.sim.histR, 20, 44, 120, 28, T, T.c3);
      spark(ctx, S.sim.histK, 150, 44, 120, 28, T, T.c6);
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("重建↓", 20, 42); ctx.fillText("KL", 150, 42);
      if (S.phase === 2) callout(ctx, cx + 40, cy - 10, "KL 把 z 拉向先验球", T, T.c5);
      if (S.phase === 3) callout(ctx, 40, H * 0.22, beta > 2.2 ? "β 过大：后验塌缩，重建变差" : "增大 β 观察塌缩", T, T.c6);
      const recon = S.sim.recon != null ? S.sim.recon : 0;
      const kls = S.sim.kls != null ? S.sim.kls : 0;
      const sig = 0.18 + 0.7 / (0.4 + beta);
      S.sim.sig = sig;
      badge(ctx, 16, H - 72, "β=" + beta.toFixed(2) + "  重建=" + recon.toFixed(2) + "  KL=" + kls.toFixed(2), T, beta > 2.2 ? T.c6 : T.c3);
    },
  });

  R("amortized_em", {
    init(S) { S.sim = { elbo: -1.6, histA: [-1.6], histV: [-1.6], th: -0.8, phi: -0.8 }; },
    tick(S, dt) {
      const rate = sl(S, "rate", 1);
      /* 联合上升：连续；对照 VBEM：台阶 */
      const tgt = -0.15;
      S.sim.th += (0.7 - S.sim.th) * dt * 0.9 * rate;
      S.sim.phi += (0.7 - S.sim.phi) * dt * 0.9 * rate;
      S.sim.elbo += (tgt - S.sim.elbo) * dt * 1.1 * rate;
      if (S.frame % 3 === 0) {
        S.sim.histA.push(S.sim.elbo);
        const k = S.sim.histV.length;
        const step = Math.floor(k / 6);
        const v = -1.6 + (1.45) * (1 - Math.exp(-step * 0.35));
        S.sim.histV.push(v);
        if (S.sim.histA.length > 60) { S.sim.histA.shift(); S.sim.histV.shift(); }
      }
      S.metrics.ELBO = S.sim.elbo;
      S.metrics["θ"] = S.sim.th;
      S.metrics["φ"] = S.sim.phi;
      S.metrics["ΔL"] = S.sim.histA.length > 1 ? S.sim.elbo - S.sim.histA[S.sim.histA.length - 2] : 0;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const rate = sl(S, "rate", 1);
      const histA = [], histV = [];
      let va = -1.6, vv = -1.6;
      for (let k = 0; k < 40; k++) {
        va += ( -0.12 - va) * (0.08 * rate);
        histA.push(va);
        if (k % 6 === 0) vv += ( -0.12 - vv) * (0.28);
        histV.push(vv);
      }
      S.metrics.ELBO = va;
      const m = mapper(boxOf(S, { t: 70 }), 0, 1, -1.7, 0.05);
      axes(ctx, m, T, { xl: "迭代", yl: "ELBO", xfmt: (v) => v.toFixed(1) });
      const drawArr = (arr, col, dash) => {
        if (arr.length < 2) return;
        ctx.strokeStyle = col; ctx.lineWidth = 2.2;
        if (dash) ctx.setLineDash([5, 3]);
        ctx.beginPath();
        arr.forEach((v, i) => {
          const x = m.X(i / (arr.length - 1)), y = m.Y(v);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke(); ctx.setLineDash([]);
      };
      drawArr(histA, T.c4, false);
      if (S.phase >= 2) drawArr(histV, T.c6, true);
      /* θ, φ 双箭头 */
      const cx = S.W * 0.22, cy = 86;
      ctx.strokeStyle = T.c2; rr(ctx, cx - 40, cy - 18, 50, 28, 6); ctx.stroke();
      ctx.strokeStyle = T.c7; rr(ctx, cx + 50, cy - 18, 50, 28, 6); ctx.stroke();
      ctx.fillStyle = T.tx; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("θ", cx - 15, cy); ctx.fillText("φ", cx + 75, cy);
      if (S.phase === 0) {
        arrow(ctx, cx + 12, cy - 4, 36, 0, T.c5, 2);
        arrow(ctx, cx + 48, cy + 6, -36, 0, T.c3, 2);
        callout(ctx, cx + 110, cy, "同步更新", T, T.c5);
      }
      if (S.phase === 1) callout(ctx, 70, 58, "ELBO 连续上升（非硬台阶）", T, T.c4);
      if (S.phase === 2) callout(ctx, S.W - 220, 58, "虚线：经典 VBEM 台阶", T, T.c6);
      if (S.phase === 3) callout(ctx, 70, 58, "仍用 ΔELBO 作停机", T, T.c5);
      legend(ctx, [{ c: T.c4, l: "摊销 EM" }, { c: T.c6, l: "VBEM" }], S.W - 140, 48, T);
    },
  });

  /* ============================================================
   *  2.2 欧氏 GD → Bregman / 镜像下降
   * ============================================================ */

  R("euclidean_gradient_descent", {
    init(S) { S.sim = { x: 1.55, y: 0.95, tr: [] }; },
    tick(S, dt) {
      const eps = sl(S, "eps", 0.25);
      /* F = x²/0.7 + y²/1.8 */
      const gx = 2 * S.sim.x / 0.7, gy = 2 * S.sim.y / 1.8;
      if (S.phase >= 2) {
        S.sim.x -= eps * gx * dt * 3.2;
        S.sim.y -= eps * gy * dt * 3.2;
      }
      if (Math.hypot(S.sim.x, S.sim.y) < 0.05) { S.sim.x = 1.5; S.sim.y = 0.9; S.sim.tr = []; }
      if (S.frame % 2 === 0) { S.sim.tr.push({ x: S.sim.x, y: S.sim.y }); if (S.sim.tr.length > 90) S.sim.tr.shift(); }
      S.metrics.F = S.sim.x * S.sim.x / 0.7 + S.sim.y * S.sim.y / 1.8;
      S.metrics["ε"] = eps;
      S.metrics["‖∇F‖"] = Math.hypot(gx, gy);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const box = boxOf(S); const sc = Math.min(box.w, box.h) * 0.38;
      const cx = (box.x0 + box.x1) / 2, cy = (box.y0 + box.y1) / 2 + 6;
      const X = (x) => cx + x * sc, Y = (y) => cy - y * sc;
      /* 椭圆等高线 */
      for (let k = 1; k <= 5; k++) {
        const r = 0.35 * k;
        ctx.strokeStyle = alpha(T.c2, 0.25 + (hi(S, 0) ? 0.2 : 0));
        ctx.lineWidth = hi(S, 0) ? 1.6 : 1;
        ctx.beginPath(); ctx.ellipse(cx, cy, r * sc * Math.sqrt(0.7), r * sc * Math.sqrt(1.8), 0, 0, TWO); ctx.stroke();
      }
      ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(box.x0 + 8, cy); ctx.lineTo(box.x1 - 8, cy); ctx.moveTo(cx, box.y0 + 8); ctx.lineTo(cx, box.y1 - 8); ctx.stroke();
      ctx.strokeStyle = T.c5; ctx.lineWidth = 1.4;
      ctx.beginPath();
      S.sim.tr.forEach((p, i) => { if (i) ctx.lineTo(X(p.x), Y(p.y)); else ctx.moveTo(X(p.x), Y(p.y)); });
      ctx.stroke();
      const gx = 2 * S.sim.x / 0.7, gy = 2 * S.sim.y / 1.8;
      const eps = sl(S, "eps", 0.25);
      if (S.phase >= 1) {
        arrow(ctx, X(S.sim.x), Y(S.sim.y), -gx * 18, gy * 18, T.c5, 2);
        callout(ctx, X(S.sim.x) + 8, Y(S.sim.y) - 10, "−∇F", T, T.c5);
      }
      if (S.phase >= 2) {
        glow(ctx, X(S.sim.x - eps * gx * 0.25), Y(S.sim.y - eps * gy * 0.25), 4, T.c3);
      }
      glow(ctx, X(S.sim.x), Y(S.sim.y), 6, T.c6);
      if (S.phase === 3) callout(ctx, 56, 54, eps > 0.5 ? "ε 太大：易振荡" : "ε 太小则爬行；拖动滑块对比", T, T.c6);
      legend(ctx, [{ c: T.c2, l: "F 等高线" }, { c: T.c6, l: "当前 z" }, { c: T.c5, l: "负梯度" }], S.W - 140, 48, T);
    },
  });

  R("linearized_proximal_step", {
    init(S) { S.sim = { z: 1.35 }; },
    tick(S) {
      const eps = sl(S, "eps", 0.25);
      const F = (z) => 0.22 * z * z * z * z - 0.15 * z * z + 0.08 * z;
      const dF = (z) => 0.88 * z * z * z - 0.3 * z + 0.08;
      const z0 = S.sim.z;
      const znew = z0 - eps * dF(z0);
      S.sim.F = F; S.sim.dF = dF; S.sim.z0 = z0; S.sim.znew = znew; S.sim.g = dF(z0);
      S.metrics["z"] = z0;
      S.metrics["∇F"] = dF(z0);
      S.metrics["z′"] = znew;
      S.metrics["ε"] = eps;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const F = S.sim.F, dF = S.sim.dF, z0 = 1.15, eps = sl(S, "eps", 0.25);
      const g = dF(z0);
      const znew = z0 - eps * g;
      const m = mapper(boxOf(S), -2.2, 2.4, -0.6, 1.8);
      axes(ctx, m, T, { xl: "z", yl: "F / 模型" });
      curve(ctx, m, F, 120, T.c2, 2.2);
      const tang = (z) => F(z0) + g * (z - z0);
      if (S.phase >= 0) curve(ctx, m, tang, 80, T.c5, hi(S, 0) ? 2.6 : 1.4);
      const prox = (z) => (z - z0) * (z - z0) / (2 * eps) + g * (z - z0) + F(z0);
      if (S.phase >= 1) curve(ctx, m, prox, 80, T.c7, hi(S, 1) ? 2.6 : 1.5);
      glow(ctx, m.X(z0), m.Y(F(z0)), 6, T.c6);
      if (S.phase >= 2) {
        glow(ctx, m.X(znew), m.Y(prox(znew)), 6, T.c3);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = T.c3;
        ctx.beginPath(); ctx.moveTo(m.X(znew), m.Y(prox(znew))); ctx.lineTo(m.X(znew), m.Y(F(znew))); ctx.stroke();
        ctx.setLineDash([]);
        glow(ctx, m.X(znew), m.Y(F(znew)), 5, T.c4);
      }
      if (S.phase === 3) {
        arrow(ctx, m.X(z0), m.Y(F(z0)), m.X(znew) - m.X(z0), m.Y(F(znew)) - m.Y(F(z0)), T.c4, 2);
        callout(ctx, 64, 54, "模型最小点 = 一步 GD：z−ε∇F", T, T.c4);
      }
      legend(ctx, [{ c: T.c2, l: "F" }, { c: T.c5, l: "切平面" }, { c: T.c7, l: "邻近二次" }], S.W - 140, 48, T);
    },
  });

  R("bregman_potential", {
    init(S) { S.sim = {}; },
    tick(S) { S.metrics["参考 z0"] = sl(S, "z0", 0.6); },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const z0 = sl(S, "z0", 0.6);
      const W = S.W, H = S.H;
      /* 左：二次势水平集；右：负熵在单纯形上 */
      ctx.fillStyle = T.tx; font(ctx, 12, true); ctx.textAlign = "center";
      ctx.fillText("二次势 ½‖z‖²", W * 0.28, 48);
      ctx.fillText("负熵势 Σ α log α", W * 0.74, 48);
      const cx = W * 0.28, cy = H * 0.58, sc = Math.min(W, H) * 0.18;
      for (let k = 1; k <= 4; k++) {
        ctx.strokeStyle = alpha(T.c2, S.phase === 0 ? 0.7 : 0.3);
        ctx.beginPath(); ctx.arc(cx, cy, k * sc * 0.28, 0, TWO); ctx.stroke();
      }
      glow(ctx, cx + z0 * sc * 0.85, cy - 0.35 * sc * z0, 6, T.c5);
      ctx.strokeStyle = T.c5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(cx, cy, Math.hypot(z0 * sc * 0.85, 0.35 * sc * z0), 0, TWO); ctx.stroke();
      ctx.setLineDash([]);
      const sx = W * 0.74, sy = H * 0.62, ss = Math.min(W, H) * 0.2;
      drawSimplex(ctx, sx, sy, ss, T);
      const aRef = clamp(0.15 + 0.7 * z0, 0.08, 0.85);
      const pRef = simplexXY(aRef, 0.5 * (1 - aRef), 0.5 * (1 - aRef), sx, sy, ss);
      glow(ctx, pRef.x, pRef.y, 5, T.c5);
      /* 熵势：靠近顶点时颜色变亮（陡） */
      for (let i = 0; i <= 10; i++) for (let j = 0; j <= 10 - i; j++) {
        const a = i / 10, b = j / 10, c = 1 - a - b;
        if (c < -1e-6) continue;
        const p = simplexXY(a, b, c, sx, sy, ss);
        const ent = (a + 1e-6) * Math.log(a + 1e-6) + (b + 1e-6) * Math.log(b + 1e-6) + (c + 1e-6) * Math.log(c + 1e-6);
        const t = clamp((-ent) / 1.1, 0, 1);
        ctx.fillStyle = alpha(T.c6, 0.12 + 0.5 * t);
        ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
      }
      if (S.phase === 1) callout(ctx, sx - 80, 70, "靠近坐标轴 → 势变陡", T, T.c6);
      if (S.phase === 2) callout(ctx, 40, 68, "不同势 = 不同「远」", T, T.c5);
      if (S.phase === 3) callout(ctx, sx - 90, 70, "边界熵→∞，点不跑出单纯形", T, T.c3);
    },
  });

  R("bregman_proximal_step", {
    init(S) { S.sim = { a: [0.62, 0.24, 0.14] }; },
    tick(S, dt) {
      const eta = sl(S, "eta", 0.25);
      const g = [1.15, -0.35, -0.8];
      onPhase(S, { 0() { S.sim.a = [0.62, 0.24, 0.14]; } });
      if (S.phase >= 2) {
        const z = S.sim.a.map((v, i) => Math.log(v + 1e-12) - eta * g[i] * dt * 4.5);
        S.sim.a = softmax(z);
      }
      S.metrics["α1"] = S.sim.a[0];
      S.metrics["∑α"] = S.sim.a[0] + S.sim.a[1] + S.sim.a[2];
      S.metrics["η"] = eta;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eta = sl(S, "eta", 0.25);
      const g = [1.15, -0.35, -0.8];
      const a0 = [0.62, 0.24, 0.14];
      const a1 = softmax(a0.map((v, i) => Math.log(v + 1e-12) - eta * g[i] * (S.phase >= 2 ? 2.2 : 0.4)));
      S.metrics["η"] = eta; S.metrics["∑α"] = a1[0] + a1[1] + a1[2];
      const cx = S.W * 0.38, cy = S.H * 0.6, sc = Math.min(S.W, S.H) * 0.28;
      drawSimplex(ctx, cx, cy, sc, T);
      const p0 = simplexXY(a0[0], a0[1], a0[2], cx, cy, sc);
      const p = simplexXY(a1[0], a1[1], a1[2], cx, cy, sc);
      /* KL 球：采样 */
      if (S.phase >= 1) {
        ctx.fillStyle = alpha(T.c5, 0.5);
        for (let i = 0; i <= 14; i++) for (let j = 0; j <= 14 - i; j++) {
          const a = i / 14, b = j / 14, c = 1 - a - b;
          if (c < 0) continue;
          let kl = 0;
          const q = [a, b, c];
          for (let k = 0; k < 3; k++) kl += q[k] * Math.log((q[k] + 1e-12) / (a0[k] + 1e-12));
          if (Math.abs(kl - 0.12) < 0.02) {
            const pp = simplexXY(a, b, c, cx, cy, sc);
            ctx.beginPath(); ctx.arc(pp.x, pp.y, 2.2, 0, TWO); ctx.fill();
          }
        }
        callout(ctx, 40, 54, "Bregman 球（KL 水平集）", T, T.c5);
      }
      glow(ctx, p0.x, p0.y, 6, T.c2);
      glow(ctx, p.x, p.y, 6, T.c6);
      if (S.phase >= 2) arrow(ctx, p0.x, p0.y, p.x - p0.x, p.y - p0.y, T.c3, 2);
      if (S.phase === 3) callout(ctx, cx + 40, 70, "新点仍在 Δ 内  ∑α=" + (a1[0] + a1[1] + a1[2]).toFixed(3), T, T.c4);
      legend(ctx, [{ c: T.c2, l: "zτ" }, { c: T.c6, l: "zτ+1" }, { c: T.c5, l: "KL 球" }], S.W - 130, 48, T);
    },
  });

  R("bregman_divergence", {
    init(S) {
      S.sim = { p: 0.8, q: -0.4 };
    },
    tick(S) {
      const z0 = sl(S, "z0", 0.6);
      const ph = S.phase;
      // Asymmetric convex potential: Psi(z) = 0.5*z^2 + 0.12*z^3 (strictly convex for z > -1.3)
      const Psi = (z) => 0.5 * z * z + 0.10 * z * z * z;
      const dPsi = (z) => z + 0.30 * z * z;

      const p = z0;
      const q = 0.3 + 0.85 * Math.sin(S.t * 0.7);
      S.sim.p = p;
      S.sim.q = q;

      // Bregman divergence in both directions:
      // B(q||p) = Psi(q) - Psi(p) - <dPsi(p), q - p>
      const B_qp = Psi(q) - Psi(p) - dPsi(p) * (q - p);
      // B(p||q) = Psi(p) - Psi(q) - <dPsi(q), p - q>
      const B_pq = Psi(p) - Psi(q) - dPsi(q) * (p - q);

      S.metrics["B(q‖p)"] = Math.max(0, B_qp);
      S.metrics["B(p‖q)"] = Math.max(0, B_pq);
      S.metrics["非对称比"] = Math.abs(B_qp - B_pq);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const cx = W * 0.48, cy = H * 0.72;
      const scX = W * 0.22, scY = H * 0.32;

      const Psi = (z) => 0.5 * z * z + 0.10 * z * z * z;
      const dPsi = (z) => z + 0.30 * z * z;

      // Coordinate axes
      ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx - 180, cy); ctx.lineTo(cx + 180, cy);
      ctx.moveTo(cx, cy - 140); ctx.lineTo(cx, cy + 20);
      ctx.stroke();

      // Plot convex curve Psi(z)
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let x = -1.6; x <= 1.6; x += 0.05) {
        const px = cx + x * scX;
        const py = cy - Psi(x) * scY;
        if (x === -1.6) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
      ctx.lineWidth = 1;

      const p = S.sim.p, q = S.sim.q;
      const px = cx + p * scX, py = cy - Psi(p) * scY;
      const qx = cx + q * scX, qy = cy - Psi(q) * scY;

      // Tangent line at p
      const slopeP = dPsi(p);
      ctx.strokeStyle = T.c5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      const tanX1 = -1.6, tanY1 = Psi(p) + slopeP * (tanX1 - p);
      const tanX2 = 1.6, tanY2 = Psi(p) + slopeP * (tanX2 - p);
      ctx.moveTo(cx + tanX1 * scX, cy - tanY1 * scY);
      ctx.lineTo(cx + tanX2 * scX, cy - tanY2 * scY);
      ctx.stroke();
      ctx.setLineDash([]);

      // Vertical distance at q: B(q||p)
      const tanAtQ = Psi(p) + slopeP * (q - p);
      const tanPyAtQ = cy - tanAtQ * scY;

      ctx.strokeStyle = T.c3;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(qx, qy);
      ctx.lineTo(qx, tanPyAtQ);
      ctx.stroke();
      ctx.lineWidth = 1;

      // Dots at p and q
      glow(ctx, px, py, 6, T.c5);
      glow(ctx, qx, qy, 6, T.c3);
      glow(ctx, qx, tanPyAtQ, 4, T.c5);

      // Label p and q
      ctx.fillStyle = T.tx;
      ctx.font = "bold 11px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText("基准点 p", px, py + 18);
      ctx.fillText("状态点 q", qx, qy - 12);

      // Gauge Dashboard on the right
      const gx = W - 142, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 136, 68, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("Bregman 散度量测", gx, gy + 12);
      ctx.fillStyle = T.c3;
      ctx.fillText("B(q‖p) = " + S.metrics["B(q‖p)"].toFixed(3), gx, gy + 28);
      ctx.fillStyle = T.c6;
      ctx.fillText("B(p‖q) = " + S.metrics["B(p‖q)"].toFixed(3), gx, gy + 44);
      ctx.fillStyle = T.c5;
      ctx.fillText("非对称差 = " + S.metrics["非对称比"].toFixed(3), gx, gy + 60);

      if (S.phase === 0) callout(ctx, 30, 68, "蓝色曲线为严格凸势函数 Ψ(z)", T, T.c2);
      if (S.phase === 1) callout(ctx, 30, 68, "黄色切线为 p 点处一阶泰勒基准", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "青色垂直高差即为 Bregman 散度", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "B(q‖p) ≠ B(p‖q)：严格非对称性！", T, T.c6);
    }
  });

  R("fenchel_conjugate", {
    init(S) { S.sim = { zeta: 0.4 }; },
    tick(S) {
      const z0 = sl(S, "z0", 0.6);
      S.sim.zeta = z0;
      const Psi = (z) => 0.5 * z * z;
      const Ps = 0.5 * z0 * z0;
      S.metrics["ζ"] = z0;
      S.metrics["Ψ*(ζ)"] = Ps;
      S.metrics["∇Ψ*(ζ)"] = z0;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const zeta = sl(S, "z0", 0.6);
      const m = mapper(boxOf(S, { r: 160 }), -2, 2, -0.4, 2.6);
      axes(ctx, m, T, { xl: "z", yl: "Ψ / 支撑平面" });
      const Psi = (z) => 0.5 * z * z;
      curve(ctx, m, Psi, 100, T.c2, 2.3);
      const plane = (z) => zeta * z - 0.5 * zeta * zeta;
      curve(ctx, m, plane, 80, T.c5, 2);
      const zstar = zeta;
      glow(ctx, m.X(zstar), m.Y(Psi(zstar)), 6, T.c6);
      if (S.phase >= 1) {
        callout(ctx, m.X(-1.6), m.Y(plane(-1.6)) - 8, "截距相关 Ψ*=" + (0.5 * zeta * zeta).toFixed(2), T, T.c5);
      }
      /* 右：对偶坐标 */
      const rx = S.W - 140, ry = 50;
      ctx.strokeStyle = T.c7; ctx.strokeRect(rx, ry, 122, S.H - 110);
      ctx.fillStyle = T.c7; ctx.font = "11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("对偶 ζ 空间", rx + 8, ry + 16);
      const my = mapper({ x0: rx + 10, y0: ry + 28, x1: rx + 112, y1: S.H - 70, w: 102, h: S.H - 98 }, -2, 2, 0, 2.2);
      curve(ctx, my, (z) => 0.5 * z * z, 60, T.c7, 1.8);
      glow(ctx, my.X(zeta), my.Y(0.5 * zeta * zeta), 5, T.c5);
      if (S.phase === 3) {
        callout(ctx, 50, 54, "∇Ψ* 把 ζ 映回 z（二次势下是恒等）", T, T.c3);
        arrow(ctx, my.X(zeta), my.Y(0.5 * zeta * zeta), -40, 30, T.c3, 1.6);
      }
      if (S.phase === 2) callout(ctx, rx - 10, ry - 4, "ζ 是对偶坐标", T, T.c7);
    },
  });

  R("mirror_map", {
    init(S) { S.sim = { a: [0.55, 0.28, 0.17] }; },
    tick(S) {
      const eta = sl(S, "eta", 0.25);
      const t = 0.5 + 0.5 * Math.sin(S.t * 0.4);
      S.sim.a = softmax([Math.log(0.2 + 0.6 * t), Math.log(0.3 + eta * 0.4), Math.log(0.25)]);
      S.sim.zeta = S.sim.a.map((v) => Math.log(v + 1e-12));
      S.metrics["∑α"] = S.sim.a.reduce((p, q) => p + q, 0);
      S.metrics["ζ1"] = S.sim.zeta[0];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eta = sl(S, "eta", 0.25);
      const t = 0.5 + 0.5 * Math.sin(S.t * 0.4);
      const a = softmax([Math.log(0.2 + 0.6 * t + eta * 0.5), Math.log(0.3 + eta * 0.85), Math.log(0.25 + 0.15 * (1 - eta))]);
      const zeta = a.map((v) => Math.log(v + 1e-12));
      S.metrics["∑α"] = a[0] + a[1] + a[2]; S.metrics["ζ1"] = zeta[0];
      const cx = S.W * 0.28, cy = S.H * 0.58, sc = Math.min(S.W, S.H) * 0.24;
      drawSimplex(ctx, cx, cy, sc, T);
      const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
      glow(ctx, p.x, p.y, 6, T.c5);
      ctx.fillStyle = T.tx; ctx.font = "12px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("原空间 Δ", cx, 48);
      const dx = S.W * 0.72, dy = S.H * 0.55;
      ctx.strokeStyle = T.c7; ctx.lineWidth = 1.4;
      ctx.strokeRect(dx - 90, dy - 90, 180, 170);
      ctx.fillStyle = T.c7; ctx.fillText("对偶 Rᵏ（log）", dx, dy - 102);
      zeta.forEach((z, i) => {
        const y = dy + 40 - z * 18;
        ctx.fillStyle = [T.c2, T.c3, T.c6][i];
        ctx.fillRect(dx - 50 + i * 36, y, 22, 8);
        ctx.fillStyle = T.tx; ctx.font = "10px sans-serif";
        ctx.fillText("ζ" + (i + 1), dx - 40 + i * 36, dy + 70);
      });
      if (S.phase === 1) arrow(ctx, p.x + 12, p.y, dx - 90 - p.x, dy - p.y, T.c5, 2);
      if (S.phase === 2) callout(ctx, dx - 80, 70, "对偶空间无单纯形约束", T, T.c7);
      if (S.phase === 3) {
        arrow(ctx, dx - 90, dy, p.x - (dx - 90), p.y - dy, T.c3, 2);
        callout(ctx, 40, 54, "exp+归一化 = softmax 拉回", T, T.c3);
      }
    },
  });

  R("mirror_descent", {
    init(S) { S.sim = { a: [0.7, 0.18, 0.12], hist: [] }; },
    tick(S, dt) {
      const eta = sl(S, "eta", 0.25);
      const g = [1.2, -0.2, -1.0];
      onPhase(S, { 0() { S.sim.a = [0.7, 0.18, 0.12]; S.sim.hist = []; } });
      if (S.phase >= 1) {
        const z = S.sim.a.map((v, i) => Math.log(v + 1e-12) - eta * g[i] * dt * 3.4);
        S.sim.a = softmax(z);
      }
      const F = 1.2 * S.sim.a[0] - 0.2 * S.sim.a[1] - 1.0 * S.sim.a[2];
      if (S.frame % 3 === 0) { S.sim.hist.push(F); if (S.sim.hist.length > 60) S.sim.hist.shift(); }
      S.metrics.F = F;
      S.metrics["∑α"] = S.sim.a.reduce((p, q) => p + q, 0);
      S.metrics["η"] = eta;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eta = sl(S, "eta", 0.25);
      const g = [1.2, -0.2, -1.0];
      const aNow = (S.sim.a && S.sim.a.length === 3) ? S.sim.a : [0.7, 0.18, 0.12];
      const a1 = softmax(aNow.map((v, i) => Math.log(v + 1e-12) - eta * g[i] * (S.phase >= 1 ? 2 : 0.3)));
      const cx = S.W * 0.36, cy = S.H * 0.6, sc = Math.min(S.W, S.H) * 0.26;
      drawSimplex(ctx, cx, cy, sc, T);
      const p = simplexXY(aNow[0], aNow[1], aNow[2], cx, cy, sc);
      const p1 = simplexXY(a1[0], a1[1], a1[2], cx, cy, sc);
      glow(ctx, p.x, p.y, 6, T.c6);
      if (S.phase >= 1) { glow(ctx, p1.x, p1.y, 5, T.c3); arrow(ctx, p.x, p.y, p1.x - p.x, p1.y - p.y, T.c5, 2); }
      spark(ctx, S.sim.hist, S.W - 150, 48, 130, 50, T, T.c4);
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("F(α)=c·α", S.W - 150, 46);
      const stages = ["原空间点", "∇Ψ 到对偶", "减梯度", "∇Ψ* 拉回"];
      ctx.font = "11px sans-serif";
      stages.forEach((s, i) => {
        ctx.fillStyle = S.phase === i ? T.c5 : T.mu;
        ctx.fillText((i + 1) + ". " + s, S.W - 150, 118 + i * 16);
      });
      if (S.phase === 3) callout(ctx, 40, 54, "点始终可行  ∑α=1, α>0", T, T.c4);
      badge(ctx, 16, S.H - 72, "η=" + eta.toFixed(2) + "  F=" + (g[0]*a1[0]+g[1]*a1[1]+g[2]*a1[2]).toFixed(3), T, T.c4);
    },
  });

  R("mirror_descent_three_steps", {
    init(S) { S.sim = { a: [0.58, 0.27, 0.15], zeta: [0, 0, 0] }; },
    tick(S) {
      const eta = sl(S, "eta", 0.25);
      const a0 = [0.58, 0.27, 0.15];
      const g = [0.9, -0.3, -0.6];
      const z0 = a0.map((v) => Math.log(v + 1e-12));
      const z1 = z0.map((v, i) => v - eta * g[i]);
      const a1 = softmax(z1);
      S.sim.a0 = a0; S.sim.z0 = z0; S.sim.z1 = z1; S.sim.a1 = a1; S.sim.g = g;
      S.metrics["η"] = eta;
      S.metrics["F0"] = g[0] * a0[0] + g[1] * a0[1] + g[2] * a0[2];
      S.metrics["F1"] = g[0] * a1[0] + g[1] * a1[1] + g[2] * a1[2];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eta = sl(S, "eta", 0.25);
      const a0 = [0.58, 0.27, 0.15];
      const g = [0.9, -0.3, -0.6];
      const z0 = a0.map((v) => Math.log(v + 1e-12));
      const z1 = z0.map((v, i) => v - eta * g[i]);
      const a1 = softmax(z1);
      S.sim.a0 = a0; S.sim.z0 = z0; S.sim.z1 = z1; S.sim.a1 = a1;
      S.metrics.F0 = g[0] * a0[0] + g[1] * a0[1] + g[2] * a0[2];
      S.metrics.F1 = g[0] * a1[0] + g[1] * a1[1] + g[2] * a1[2];
      const titles = ["① 出门 ζ=∇Ψ(z)", "② 对偶走直线", "③ 回家 z=∇Ψ*(ζ)", "循环直到 F↓"];
      const W = S.W, H = S.H;
      const panels = 3;
      const pw = (W - 40) / panels;
      for (let i = 0; i < 3; i++) {
        const x = 12 + i * pw;
        ctx.strokeStyle = S.phase === i || S.phase === 3 ? T.c5 : T.line;
        ctx.lineWidth = S.phase === i ? 2.4 : 1;
        rr(ctx, x, 40, pw - 10, H - 88, 8); ctx.stroke();
        ctx.fillStyle = S.phase === i ? T.c5 : T.mu;
        ctx.font = "11px sans-serif"; ctx.textAlign = "center";
        ctx.fillText(titles[i], x + (pw - 10) / 2, 56);
        const cx = x + (pw - 10) / 2, cy = H * 0.62, sc = Math.min(pw, H) * 0.22;
        if (i === 0 || i === 2) {
          drawSimplex(ctx, cx, cy, sc, T);
          const a = i === 0 ? S.sim.a0 : S.sim.a1;
          const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
          glow(ctx, p.x, p.y, 6, i === 0 ? T.c2 : T.c3);
        } else {
          S.sim.z0.forEach((z, k) => {
            ctx.fillStyle = [T.c2, T.c3, T.c6][k];
            ctx.fillRect(cx - 40 + k * 30, cy - z * 16, 18, 8);
          });
          S.sim.z1.forEach((z, k) => {
            ctx.fillStyle = alpha([T.c2, T.c3, T.c6][k], 0.5);
            ctx.fillRect(cx - 40 + k * 30, cy - 40 - z * 16, 18, 8);
          });
          arrow(ctx, cx, cy - 10, 0, -36, T.c5, 2);
          ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
          ctx.fillText("ζ ← ζ − η∇F", cx, cy + 40);
        }
      }
      if (S.phase === 3) {
        ctx.fillStyle = T.c4; font(ctx, 12, false); ctx.textAlign = "center";
        ctx.fillText("F: " + S.metrics.F0.toFixed(3) + " → " + S.metrics.F1.toFixed(3) + "  （与 KEMS 的 log/exp 对照）", W / 2, H - 52);
      }
      badge(ctx, 16, H - 72, "η=" + eta.toFixed(2) + "  ΔF=" + (S.metrics.F1 - S.metrics.F0).toFixed(3), T, T.c5);
    },
  });

  /* ============================================================
   *  2.3  P2 / 归一化 / 传输 / 连续性 / W2
   * ============================================================ */

  R("wasserstein_space_p2", {
    init(S) {
      const rnd = mulberry(4);
      S.sim = { z: [], w: [], traj: [] };
      for (let i = 0; i < 42; i++) {
        S.sim.z.push({ x: nrm(rnd) * 0.52, y: nrm(rnd) * 0.44 });
        S.sim.w.push(1 / 42);
      }
    },
    tick(S, dt) {
      const spread = sl(S, "spread", 1);
      const sep = sl(S, "sep", 1);
      const ph = S.phase;

      let m2 = 0, sw = 0;
      const t = S.t;
      S.sim.z.forEach((p, i) => {
        const baseAng = (i / 42) * Math.PI * 2;
        const driftX = (sep - 1) * 0.55 + 0.12 * Math.sin(t * 0.8 + baseAng);
        const driftY = 0.10 * Math.cos(t * 0.6 + baseAng);
        p.curX = p.x * spread + driftX;
        p.curY = p.y * spread + driftY;
        sw += S.sim.w[i];
        m2 += S.sim.w[i] * (p.curX * p.curX + p.curY * p.curY);
      });

      const ptX = (sep - 1) * 0.85;
      const ptY = (spread - 1) * 0.75;
      if (!S.sim.traj) S.sim.traj = [];
      S.sim.traj.push({ x: ptX, y: ptY, m2 });
      while (S.sim.traj.length > 50) S.sim.traj.shift();

      S.metrics["∑w"] = sw;
      S.metrics["E‖z‖²"] = m2;
      const bounded = m2 < 4.2;
      S.metrics["∈P2"] = (Math.abs(sw - 1) < 1e-3 && bounded) ? 1 : 0;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const midX = S.W * 0.5;
      const H = S.H;

      // 分隔中线与背景分区
      ctx.strokeStyle = T.line;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(midX, 42);
      ctx.lineTo(midX, H - 24);
      ctx.stroke();
      ctx.setLineDash([]);

      // 左视窗：微观状态空间 R^d
      ctx.fillStyle = T.mu;
      ctx.font = "bold 12px " + FONT;
      ctx.textAlign = "center";
      ctx.fillText("【微观视窗】状态空间 R^d · 粒子云 Q(z)", midX * 0.5, 54);

      const cx1 = midX * 0.5, cy1 = H * 0.55, sc1 = Math.min(midX, H) * 0.32;
      ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
      ctx.beginPath();
      ctx.moveTo(cx1 - 90, cy1); ctx.lineTo(cx1 + 90, cy1);
      ctx.moveTo(cx1, cy1 - 65); ctx.lineTo(cx1, cy1 + 65);
      ctx.stroke();

      const isOk = S.metrics["∈P2"] === 1;
      const col = isOk ? T.c2 : T.c6;
      S.sim.z.forEach((p) => {
        glow(ctx, cx1 + p.curX * sc1, cy1 - p.curY * sc1, 4, col);
      });

      // 右视窗：宏观奥托流形 P2
      ctx.fillStyle = T.mu;
      ctx.fillText("【宏观视窗】沃瑟斯坦流形 P2 (Otto Calculus)", midX + midX * 0.5, 54);

      const cx2 = midX + midX * 0.5, cy2 = H * 0.56;
      ctx.strokeStyle = T.dark ? "rgba(91,140,255,0.22)" : "rgba(91,140,255,0.3)";
      for (let u = -3; u <= 3; u++) {
        ctx.beginPath();
        for (let v = -28; v <= 28; v += 4) {
          const rx = v * 3.4;
          const ry = u * 18 + 0.009 * (rx * rx);
          if (v === -28) ctx.moveTo(cx2 + rx, cy2 + ry);
          else ctx.lineTo(cx2 + rx, cy2 + ry);
        }
        ctx.stroke();
      }

      // 流形质点与切空间切线
      const lastPt = (S.sim.traj && S.sim.traj[S.sim.traj.length - 1]) || { x: 0, y: 0 };
      const dotX = cx2 + lastPt.x * 55;
      const dotY = cy2 + lastPt.y * 32 + 0.009 * Math.pow(lastPt.x * 55, 2);

      // 切空间切线平面
      ctx.strokeStyle = T.c5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(dotX - 35, dotY + 10);
      ctx.lineTo(dotX + 35, dotY - 10);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.fillStyle = T.c5;
      ctx.font = "10px " + FONT;
      ctx.fillText("切空间 T_Q P2", dotX + 48, dotY - 12);

      // 流形质点高亮发光
      glow(ctx, dotX, dotY, 7, isOk ? T.c3 : T.c6);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = T.tx;
      ctx.fillText("整团分布 Q 在流形上是一点", dotX, dotY + 22);

      // 二阶矩状态面板
      const gx = S.W - 138, gy = 66;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 132, 54, 6); ctx.fill();
      ctx.strokeStyle = isOk ? T.c4 : T.c6; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("二阶矩入场券检验", gx, gy + 11);
      ctx.fillStyle = isOk ? T.c4 : T.c6;
      ctx.fillText("E[‖z‖²] = " + S.metrics["E‖z‖²"].toFixed(2), gx, gy + 27);
      ctx.fillText(isOk ? "✓ 处于 P2 流形内" : "⚠ 二阶矩发散(移出)", gx, gy + 42);

      if (S.phase === 0) callout(ctx, 24, 76, "微观粒子云 = 一个分布 Q", T, T.c2);
      if (S.phase === 1) callout(ctx, midX + 16, 76, "整团分布在 P2 上只是一点", T, T.c3);
      if (S.phase === 2) callout(ctx, 24, 76, "二阶矩有限：赋流形度量的入场券", T, isOk ? T.c4 : T.c6);
      if (S.phase === 3) callout(ctx, midX + 16, 76, "切向量对应连续性方程速度场 φ", T, T.c5);
    }
  });

  R("normalization_constraint", {
    init(S) {
      S.sim = { raw: new Float64Array(40) };
      for (let i = 0; i < 40; i++) S.sim.raw[i] = gauss(-3 + 6 * i / 39, 0, 0.55);
    },
    tick(S) {
      const spread = sl(S, "spread", 0.7);
      const amp = S.phase === 0 ? 1.8 + 0.6 * Math.sin(S.t) : 1;
      for (let i = 0; i < 40; i++) S.sim.raw[i] = amp * gauss(-3 + 6 * i / 39, 0.2 * Math.sin(S.t * 0.5), 0.28 + 0.7 * spread);
      let Z = 0;
      for (let i = 0; i < 40; i++) Z += S.sim.raw[i] * (6 / 39);
      S.sim.Z = Z;
      S.metrics["∫Q"] = Z;
      S.metrics["合法"] = Math.abs(Z - 1) < 0.05 ? 1 : 0;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const spread = sl(S, "spread", 0.7);
      const amp = S.phase === 0 ? 1.85 : S.phase === 1 ? 1.55 : 1;
      const sig = 0.22 + 0.85 * spread;
      const raw = new Float64Array(40);
      let Z = 0;
      for (let i = 0; i < 40; i++) {
        raw[i] = amp * gauss(-3 + 6 * i / 39, 0.18 * (spread - 0.7), sig);
        Z += raw[i] * (6 / 39);
      }
      S.metrics["∫Q"] = Z;
      const showNorm = S.phase >= 2;
      const scale = showNorm ? 1 / Math.max(1e-6, Z) : 1;
      const yMax = showNorm ? 1.15 : Math.max(1.3, Z * 0.75);
      const m = mapper(boxOf(S), -3, 3, 0, yMax);
      axes(ctx, m, T, { xl: "z", yl: showNorm ? "Q 密度" : "未归一化高度" });
      for (let i = 0; i < 40; i++) {
        const x = -3 + 6 * i / 39, y = raw[i] * scale;
        const px = m.X(x), py = m.Y(y), pw = m.X(-3 + 6 * (i + 1) / 39) - px - 1;
        ctx.fillStyle = alpha(S.phase === 0 ? T.c6 : T.c2, 0.7);
        ctx.fillRect(px, py, Math.max(1, pw), m.box.y1 - py);
      }
      ctx.strokeStyle = T.c5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(m.X(-3), m.Y(1)); ctx.lineTo(m.X(3), m.Y(1)); ctx.stroke();
      ctx.setLineDash([]);
      callout(ctx, 56, 54, S.phase === 0 ? "高度乱涨，∫=" + Z.toFixed(2) : S.phase === 1 ? "∫≠1 时 KL/熵无定义" : S.phase === 2 ? "除以积分，恢复合法密度" : "微扰后必须继续保 ∫=1", T, T.c5);
      legend(ctx, [{ c: T.c2, l: "Q" }, { c: T.c5, l: "高度=1 参考" }], S.W - 130, 48, T);
      badge(ctx, 16, S.H - 72, "spread=" + spread.toFixed(2) + "  ∫Q=" + Z.toFixed(2), T, Math.abs((showNorm ? 1 : Z) - 1) < 0.08 ? T.c4 : T.c6);
    },
  });

  R("transport_map", {
    init(S) {
      const rnd = mulberry(5);
      S.sim = { z: [] };
      for (let i = 0; i < 48; i++) S.sim.z.push(-1.6 + 3.2 * rnd());
    },
    tick(S) {
      const eps = sl(S, "eps", 0.2);
      S.metrics["ε"] = eps;
      S.metrics["E[φ]"] = 0;
      let e = 0;
      S.sim.z.forEach((z) => { e += -Math.tanh(z); });
      S.metrics["E[φ]"] = e / S.sim.z.length;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eps = sl(S, "eps", 0.2);
      const phi = (z) => -Math.tanh(z); /* 向 0 收缩 */
      const Tmap = (z) => z + eps * phi(z);
      const m = mapper(boxOf(S, { t: 56 }), -2.6, 2.6, 0, 0.9);
      axes(ctx, m, T, { xl: "z", yl: "密度" });
      /* 体积→密度：1/|T'| 加深填充 */
      const dphi = (z) => { const s = 1 / Math.cosh(z); return -(s * s); };
      for (let i = 0; i < 24; i++) {
        const z = -2.6 + 5.2 * (i + 0.5) / 24;
        const det = Math.abs(1 + eps * dphi(z));
        const inv = 1 / Math.max(0.15, det);
        ctx.fillStyle = alpha(T.c2, clamp((inv - 0.6) / 2.4, 0.05, 0.55));
        const x0 = m.X(-2.6 + 5.2 * i / 24), x1 = m.X(-2.6 + 5.2 * (i + 1) / 24);
        ctx.fillRect(x0, m.box.y0, x1 - x0, m.box.h);
      }
      const H0 = hist(S.sim.z, -2.6, 2.6, 20);
      const moved = S.sim.z.map(Tmap);
      const H1 = hist(moved, -2.6, 2.6, 20);
      if (S.phase === 0) {
        drawHist(ctx, m, H0, T.c2);
        S.sim.z.forEach((z) => glow(ctx, m.X(z), m.box.y1 - 8, 3, T.c5));
      }
      if (S.phase === 1) {
        S.sim.z.forEach((z) => {
          const x0 = m.X(z), x1 = m.X(Tmap(z));
          arrow(ctx, x0, m.box.y1 - 16, x1 - x0, 0, T.c5, 1.4);
          glow(ctx, x0, m.box.y1 - 16, 3, T.c2);
        });
        callout(ctx, 56, 42, "每个粒子沿 φ(z)=−tanh z 走 ε", T, T.c5);
      }
      if (S.phase >= 2) {
        drawHist(ctx, m, H0, T.mu);
        drawHist(ctx, m, H1, T.c3);
        curve(ctx, m, (x) => gauss(x, 0, 0.85), 80, T.mu, 1);
        if (S.phase === 3) callout(ctx, 56, 42, eps > 0.4 ? "ε 大：线性近似开始失效" : "小 ε：形状微变", T, T.c6);
      }
      S.metrics["中心 1/|T'|"] = 1 / Math.max(0.15, Math.abs(1 + eps * dphi(0)));
      legend(ctx, [{ c: T.c2, l: "1/|T'| 热力" }, { c: T.c3, l: "T#Q" }, { c: T.c5, l: "φ 箭头" }], S.W - 150, 48, T);
      hitBox(S, "state", m.box);
      hit(S, "ctrl", { type: "rect", x: m.box.x0, y: m.box.y1 - 40, w: m.box.w, h: 36 });
    },
  });

  R("change_of_variables_density", {
    init(S) {
      const rnd = mulberry(8);
      S.sim = { p: [] };
      for (let i = 0; i < 70; i++) S.sim.p.push({ x: 0.5 * nrm(rnd), y: 0.45 * nrm(rnd) });
    },
    tick(S) {
      const eps = sl(S, "eps", 0.25);
      const det = (1 + eps) * (1 + 0.35 * eps);
      S.metrics["|det ∇T|"] = det;
      S.metrics["密度比"] = 1 / det;
      S.metrics["ε"] = eps;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eps = sl(S, "eps", 0.25);
      const sx = 1 + (S.phase === 1 ? eps : S.phase === 2 ? -0.45 * eps : 0.55 * eps);
      const sy = 1 + (S.phase === 1 ? 0.35 * eps : S.phase === 2 ? 0.8 * eps : 0.2 * eps);
      const det = Math.abs(sx * sy);
      const cx = S.W * 0.45, cy = S.H * 0.56, sc = Math.min(S.W, S.H) * 0.22;
      ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(cx - 150, cy); ctx.lineTo(cx + 150, cy); ctx.moveTo(cx, cy - 110); ctx.lineTo(cx, cy + 110); ctx.stroke();
      /* 网格变形 */
      ctx.strokeStyle = alpha(T.c2, 0.35); ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        ctx.beginPath();
        for (let j = -12; j <= 12; j++) {
          const x = cx + i * 0.28 * sc * sx, y = cy - (j / 12) * 1.1 * sc * sy;
          if (j === -12) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const densCol = det > 1 ? T.c3 : T.c6;
      S.sim.p.forEach((p) => {
        glow(ctx, cx + p.x * sc * sx, cy - p.y * sc * sy, 3.4, densCol);
      });
      ctx.strokeStyle = densCol; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, 0.72 * sc * sx, 0.62 * sc * sy, 0, 0, TWO); ctx.stroke();
      ctx.fillStyle = T.tx; ctx.font = "12px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("|det ∇T| = " + det.toFixed(2) + "    Q_T = Q / |det ∇T|", 24, S.H - 50);
      if (S.phase === 1) callout(ctx, 40, 54, "拉长 → 颜色变浅（密度降）", T, T.c3);
      if (S.phase === 2) callout(ctx, 40, 54, "压缩 → 颜色变深", T, T.c6);
      if (S.phase === 3) callout(ctx, 40, 54, "高度与 |det ∇T| 成反比", T, T.c5);
    },
  });

  R("log_density_first_order_expansion", {
    init(S) { S.sim = {}; },
    tick(S) {
      const eps = sl(S, "eps", 0.25);
      /* Q=N(0,1), φ(z)=z, T=(1+ε)z, det=1+ε */
      S.metrics["ε"] = eps;
      S.metrics["div φ"] = 1;
      const z = 0.8;
      const logQ = logG(z, 0, 1);
      const logQT = logG(z, 0, 1 + eps);
      const approx = logQT + eps * ((-z / ((1 + eps) * (1 + eps))) * z + 1);
      S.metrics["真 log Q"] = logQ;
      S.metrics["一阶误差"] = Math.abs(logQ - (logG(z / (1 + eps), 0, 1) - Math.log(1 + eps)));
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eps = sl(S, "eps", 0.25);
      const m = mapper(boxOf(S), -2.6, 2.6, -4.2, 0.4);
      axes(ctx, m, T, { xl: "z", yl: "log 密度" });
      const logQ = (z) => logG(z, 0, 1);
      const logQT = (z) => logG(z, 0, 1 + eps); /* 宽高斯 */
      const conv = (z) => { const s = 1 + eps; return (-z / (s * s)) * z; }; /* φ·∇log Q_T , φ=z */
      const fo = (z) => logQT(z) + eps * (conv(z) + 1);
      curve(ctx, m, logQ, 100, T.c2, hi(S, 0) ? 3 : 1.6);
      if (S.phase >= 1) curve(ctx, m, (z) => logQT(z) + eps * conv(z), 80, T.c5, hi(S, 1) ? 2.6 : 1.4);
      if (S.phase >= 2) curve(ctx, m, (z) => logQT(z) + eps * 1, 80, T.c7, hi(S, 2) ? 2.6 : 1.4);
      if (S.phase >= 3) {
        curve(ctx, m, fo, 100, T.c4, 2.4);
        curve(ctx, m, (z) => logG(z / (1 + eps), 0, 1) - Math.log(Math.abs(1 + eps)), 100, T.c6, 1.6);
        callout(ctx, 50, 54, "绿=一阶合成，粉=有限 ε 精确", T, T.c4);
      }
      legend(ctx, [
        { c: T.c2, l: "log Q" },
        { c: T.c5, l: "+对流 φ·∇logQ" },
        { c: T.c7, l: "+体积 ∇·φ" },
        { c: T.c4, l: "一阶近似" },
      ], S.W - 160, 44, T);
    },
  });

  R("continuity_equation", {
    init(S) {
      const N = 64;
      const Q = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const x = -2.4 + 4.8 * i / (N - 1);
        Q[i] = gauss(x, -0.6, 0.42);
      }
      let Z = 0; for (let i = 0; i < N; i++) Z += Q[i];
      for (let i = 0; i < N; i++) Q[i] /= Z;
      S.sim = { Q, N, acc: 0 };
    },
    tick(S, dt) {
      const vx = sl(S, "vx", 0.6);
      const N = S.sim.N, Q = S.sim.Q;
      const dx = 4.8 / N;
      if (S.sim.mass0 == null) {
        let m0 = 0; for (let i = 0; i < N; i++) m0 += Q[i] * dx;
        S.sim.mass0 = m0;
      }
      const flux = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        const im = (i - 1 + N) % N;
        const phi = vx * (0.55 + 0.22 * Math.sin(TWO * i / N));
        flux[i] = (phi >= 0 ? Q[im] : Q[i]) * phi;
      }
      const dtA = Math.min(dt * 1.8, 0.4 * dx / Math.max(0.12, Math.abs(vx)));
      for (let i = 0; i < N; i++) {
        const ip = (i + 1) % N;
        Q[i] = Math.max(0, Q[i] - dtA / dx * (flux[ip] - flux[i]));
      }
      let mass = 0; for (let i = 0; i < N; i++) mass += Q[i] * dx;
      S.sim.mass = mass;
      S.metrics["∑Q"] = mass;
      S.metrics["∑Q₀"] = S.sim.mass0;
      S.metrics["流速"] = vx;
      let mean = 0;
      for (let i = 0; i < N; i++) mean += (-2.4 + dx * i) * Q[i];
      S.metrics["质心"] = mean;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const N = S.sim.N, Q = S.sim.Q, vx = sl(S, "vx", 0.6);
      let mx = 0; for (let i = 0; i < N; i++) if (Q[i] > mx) mx = Q[i];
      const m = mapper(boxOf(S), -2.4, 2.4, 0, mx * 1.25 + 0.002);
      axes(ctx, m, T, { xl: "z", yl: "Q" });
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const x = -2.4 + 4.8 * i / (N - 1);
        const px = m.X(x), py = m.Y(Q[i]);
        if (i === 0) { ctx.moveTo(px, m.Y(0)); ctx.lineTo(px, py); } else ctx.lineTo(px, py);
      }
      ctx.lineTo(m.X(2.4), m.Y(0)); ctx.closePath();
      ctx.fillStyle = alpha(T.c2, hi(S, 0) ? 0.45 : 0.28); ctx.fill();
      ctx.strokeStyle = T.c2; ctx.lineWidth = 2; ctx.stroke();
      if (S.phase >= 1) {
        for (let i = 4; i < N; i += 6) {
          const x = -2.4 + 4.8 * i / (N - 1);
          const phi = vx * (0.55 - 0.15 * x);
          arrow(ctx, m.X(x), m.Y(Q[i]) - 8, phi * 28, 0, T.c5, 1.5);
        }
      }
      if (S.phase >= 2) callout(ctx, 56, 54, "质量从源流向汇", T, T.c5);
      if (S.phase === 3) {
        const ok = Math.abs(S.sim.mass - (S.sim.mass0 || 1)) < 0.05 * (S.sim.mass0 || 1);
        callout(ctx, 56, 76, "∑Q=" + S.sim.mass.toFixed(3) + (ok ? " 周期守恒" : ""), T, ok ? T.c4 : T.c6);
      }
      legend(ctx, [{ c: T.c2, l: "Q(z,τ)" }, { c: T.c5, l: "速度场 φ" }], S.W - 140, 48, T);
      hitBox(S, "state", m.box);
      hit(S, "ctrl", { type: "rect", x: m.box.x0, y: m.box.y0, w: m.box.w, h: Math.max(48, m.box.h * 0.45) });
    },
  });

  R("pushforward_measure", {
    init(S) {
      const rnd = mulberry(12);
      S.sim = { z: [] };
      for (let i = 0; i < 50; i++) S.sim.z.push(-1.8 + 3.6 * rnd());
    },
    tick(S) {
      const eps = sl(S, "eps", 0.25);
      const Tm = (z) => z + eps * (0.6 + 0.4 * Math.sin(z));
      const A0 = [-0.7, 0.2];
      let m0 = 0, m1 = 0;
      S.sim.z.forEach((z) => {
        if (z >= A0[0] && z <= A0[1]) m0++;
        const tz = Tm(z);
        /* A = T(A0) 近似区间 */
        const a = Tm(A0[0]), b = Tm(A0[1]);
        const lo = Math.min(a, b), hi = Math.max(a, b);
        if (tz >= lo && tz <= hi) m1++;
      });
      S.metrics["Q(A0)"] = m0 / S.sim.z.length;
      S.metrics["QT(A)"] = m1 / S.sim.z.length;
      S.metrics["ε"] = eps;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const eps = sl(S, "eps", 0.25);
      const Tm = (z) => z + eps * (0.6 + 0.4 * Math.sin(z));
      const m = mapper(boxOf(S, { t: 50 }), -2.4, 2.8, 0, 1);
      axes(ctx, m, T, { xl: "z", yl: "" });
      const A0 = [-0.7, 0.2];
      const a1 = Tm(A0[0]), b1 = Tm(A0[1]);
      ctx.fillStyle = alpha(T.c5, S.phase === 0 ? 0.35 : 0.16);
      ctx.fillRect(m.X(A0[0]), m.box.y0, m.X(A0[1]) - m.X(A0[0]), m.box.h);
      if (S.phase >= 1) {
        ctx.fillStyle = alpha(T.c3, 0.28);
        ctx.fillRect(m.X(Math.min(a1, b1)), m.box.y0, m.X(Math.max(a1, b1)) - m.X(Math.min(a1, b1)), m.box.h);
      }
      S.sim.z.forEach((z) => {
        const inA = z >= A0[0] && z <= A0[1];
        const tz = Tm(z);
        glow(ctx, m.X(z), m.box.y1 - 14, 3, inA ? T.c5 : T.mu);
        if (S.phase >= 1 && inA) {
          arrow(ctx, m.X(z), m.box.y1 - 28, m.X(tz) - m.X(z), 0, T.c3, 1.3);
          glow(ctx, m.X(tz), m.box.y1 - 42, 3, T.c3);
        }
      });
      ctx.fillStyle = T.c5; ctx.font = "11px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("A0", m.X(0.5 * (A0[0] + A0[1])), m.box.y0 + 12);
      if (S.phase >= 1) { ctx.fillStyle = T.c3; ctx.fillText("A=T(A0)", m.X(0.5 * (a1 + b1)), m.box.y0 + 24); }
      if (S.phase >= 2) callout(ctx, 50, 54, "Q(A0) = " + S.metrics["Q(A0)"].toFixed(2) + " = QT(A) = " + S.metrics["QT(A)"].toFixed(2), T, T.c4);
      if (S.phase === 3) callout(ctx, 50, 70, "集合语言 = 密度公式的测度版", T, T.c7);
    },
  });

  R("w2_distance", {
    init(S) {
      const rnd = mulberry(2);
      S.sim = { A: [], B: [] };
      for (let i = 0; i < 16; i++) { S.sim.A.push(-1.1 + 0.12 * nrm(rnd)); S.sim.B.push(0.9 + 0.12 * nrm(rnd)); }
    },
    tick(S) {
      const sep = sl(S, "sep", 1);
      const A = S.sim.A, B0 = S.sim.B;
      const B = B0.map((x) => x + (sep - 1) * 0.85);
      const As = A.slice().sort((a, b) => a - b);
      const Bs = B.slice().sort((a, b) => a - b);
      const Br = B.slice().sort((a, b) => b - a);
      let opt = 0, cross = 0;
      for (let i = 0; i < As.length; i++) {
        opt += (As[i] - Bs[i]) ** 2;
        cross += (As[i] - Br[i]) ** 2;
      }
      S.sim.Bnow = B; S.sim.As = As; S.sim.Bs = Bs; S.sim.Br = Br;
      S.sim.W2 = Math.sqrt(opt / As.length);
      S.sim.W2x = Math.sqrt(cross / As.length);
      S.metrics.W2 = S.sim.W2;
      S.metrics["交叉匹配"] = S.sim.W2x;
      S.metrics["间距"] = sep;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const sep = sl(S, "sep", 1);
      const A = S.sim.A, B0 = S.sim.B;
      const B = B0.map((x) => x + (sep - 1) * 0.85);
      const As = A.slice().sort((a, b) => a - b);
      const Bs = B.slice().sort((a, b) => a - b);
      const Br = B.slice().sort((a, b) => b - a);
      let opt = 0, cross = 0;
      for (let i = 0; i < As.length; i++) {
        opt += (As[i] - Bs[i]) ** 2;
        cross += (As[i] - Br[i]) ** 2;
      }
      const W2 = Math.sqrt(opt / As.length), W2x = Math.sqrt(cross / As.length);
      S.metrics.W2 = W2; S.metrics["交叉匹配"] = W2x;
      const yA = S.H * 0.38, yB = S.H * 0.7;
      const X = (x) => 50 + (x + 2.4) / 4.8 * (S.W - 80);
      ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(40, yA); ctx.lineTo(S.W - 20, yA); ctx.moveTo(40, yB); ctx.lineTo(S.W - 20, yB); ctx.stroke();
      ctx.fillStyle = T.mu; font(ctx, 11, false); ctx.textAlign = "left";
      ctx.fillText("Q", 16, yA - 8); ctx.fillText("QT", 12, yB - 8);
      A.forEach((x) => glow(ctx, X(x), yA, 5, T.c2));
      B.forEach((x) => glow(ctx, X(x), yB, 5, T.c6));
      const useCross = S.phase === 1;
      const matchB = useCross ? Br : Bs;
      ctx.strokeStyle = alpha(useCross ? T.c6 : T.c4, 0.55); ctx.lineWidth = 1.2;
      As.forEach((x, i) => {
        ctx.beginPath(); ctx.moveTo(X(x), yA + 6); ctx.lineTo(X(matchB[i]), yB - 6); ctx.stroke();
      });
      ctx.fillStyle = T.tx; font(ctx, 12, false); ctx.textAlign = "left";
      ctx.fillText((useCross ? "交叉代价 " : "最优（1D 排序） ") + (useCross ? W2x : W2).toFixed(3), 50, 54);
      if (S.phase === 2) callout(ctx, 50, 70, "最优匹配近似不交叉", T, T.c4);
      if (S.phase === 3) callout(ctx, 50, 70, "W₂ 随分离近似线性增长（不像 KL 爆炸）", T, T.c5);
      badge(ctx, 16, S.H - 72, "sep=" + sep.toFixed(2) + "  W₂=" + W2.toFixed(3), T, T.c4);
    },
  });

  R("w2_perturbative_form", {
    init(S) {
      const rnd = mulberry(6);
      S.sim = { z: [] };
      for (let i = 0; i < 22; i++) S.sim.z.push(-1.2 + 2.4 * rnd());
    },
    tick(S) {
      const sep = sl(S, "sep", 1);
      const eps = 0.15 + 0.55 * (sep - 0.25) / 1.55;
      const phi = (z) => 0.8 + 0.25 * z;
      let e = 0, w2 = 0;
      S.sim.z.forEach((z) => {
        const d = eps * phi(z);
        e += phi(z) * phi(z);
        w2 += d * d;
      });
      e /= S.sim.z.length; w2 = Math.sqrt(w2 / S.sim.z.length);
      const approx = eps * Math.sqrt(e);
      S.sim.eps = eps; S.sim.e = e; S.sim.w2 = w2; S.sim.approx = approx; S.sim.phi = phi;
      S.metrics["ε"] = eps;
      S.metrics["ε√E‖φ‖²"] = approx;
      S.metrics["真位移"] = w2;
      S.metrics["相对误差"] = Math.abs(w2 - approx) / (w2 + 1e-6);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const sep = sl(S, "sep", 1);
      const eps = 0.15 + 0.55 * (sep - 0.25) / 1.55;
      const phi = (z) => 0.8 + 0.25 * z;
      let e = 0, w2s = 0;
      S.sim.z.forEach((z) => { const d = eps * phi(z); e += phi(z) * phi(z); w2s += d * d; });
      e /= S.sim.z.length; w2s = Math.sqrt(w2s / S.sim.z.length);
      const approx = eps * Math.sqrt(e);
      S.sim.eps = eps; S.sim.approx = approx; S.sim.w2 = w2s; S.sim.phi = phi;
      const y = S.H * 0.55;
      const X = (x) => 50 + (x + 2.2) / 4.4 * (S.W - 90);
      ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(40, y); ctx.lineTo(S.W - 24, y); ctx.stroke();
      S.sim.z.forEach((z) => {
        glow(ctx, X(z), y, 4, T.c2);
        const dx = X(z + eps * phi(z)) - X(z);
        arrow(ctx, X(z), y - 10, dx, 0, T.c5, S.phase === 0 ? 2.2 : 1.4);
      });
      /* 误差条 */
      const bx = 50, by = 48;
      ctx.fillStyle = T.c4; ctx.fillRect(bx, by, 160 * clamp(S.sim.approx / 2, 0, 1), 10);
      ctx.fillStyle = T.c6; ctx.fillRect(bx, by + 16, 160 * clamp(S.sim.w2 / 2, 0, 1), 10);
      ctx.fillStyle = T.tx; ctx.font = "10px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("ε√E‖φ‖²  " + S.sim.approx.toFixed(3), bx + 170, by + 8);
      ctx.fillText("真 W₂     " + S.sim.w2.toFixed(3), bx + 170, by + 24);
      if (S.phase === 1) callout(ctx, 50, 90, "代价 ≈ ε² E‖φ‖²", T, T.c4);
      if (S.phase === 2) callout(ctx, 50, 90, eps > 0.45 ? "ε 大：线性近似偏离真 W₂" : "仍接近", T, T.c6);
      if (S.phase === 3) callout(ctx, 50, 90, "所以训练要用小步长", T, T.c5);
      badge(ctx, 16, S.H - 72, "ε=" + eps.toFixed(2) + "  相对误差=" + (Math.abs(w2s - approx) / (w2s + 1e-6)).toFixed(3), T, T.c5);
    },
  });

  /* ============================================================
   *  2.4  受控 ODE 与 PMP
   * ============================================================ */

  function drawTraj(ctx, m, z, col, lw) {
    ctx.strokeStyle = col; ctx.lineWidth = lw || 2;
    ctx.beginPath();
    for (let i = 0; i < z.length; i++) {
      const x = m.X(i / (z.length - 1)), y = m.Y(z[i]);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    }
    ctx.stroke();
  }

  R("state_ode", {
    init(S) { S.sim = {}; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.4);
      S.metrics["u强度"] = uamp;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const uamp = sl(S, "uamp", 0.4);
      const m = mapper(boxOf(S), 0, 1, -2.2, 2.2);
      axes(ctx, m, T, { xl: "时间 t", yl: "z(t)" });
      const a = -0.35, n = 50, dt = 2.0 / n;
      const run = (uFn, z0) => {
        const z = [z0];
        let x = z0;
        for (let i = 0; i < n; i++) { x = x + dt * (a * x + uFn(x, i * dt)); z.push(x); }
        return z;
      };
      if (S.phase === 0) {
        for (let k = 0; k < 6; k++) drawTraj(ctx, m, run(() => 0, -1.4 + 0.45 * k), alpha(T.c2, 0.5 + 0.1 * k), 1.5);
        callout(ctx, 56, 54, "无控制：沿 f(z)=az 漂向 0", T, T.c2);
      } else if (S.phase === 1) {
        for (let k = 0; k < 5; k++) drawTraj(ctx, m, run(() => uamp, -1.2 + 0.4 * k), T.c5, 1.6);
        callout(ctx, 56, 54, "恒定 u：轨迹整体平移", T, T.c5);
      } else if (S.phase === 2) {
        const tgt = 1.0;
        for (let k = 0; k < 5; k++) drawTraj(ctx, m, run((z) => uamp * 1.8 * (tgt - z), -1.5 + 0.5 * k), T.c3, 1.7);
        ctx.setLineDash([4, 3]); ctx.strokeStyle = T.c4;
        ctx.beginPath(); ctx.moveTo(m.X(0), m.Y(1)); ctx.lineTo(m.X(1), m.Y(1)); ctx.stroke(); ctx.setLineDash([]);
        callout(ctx, 56, 54, "反馈 u(z)∝(z*−z)：拧向目标", T, T.c3);
      } else {
        for (let k = 0; k < 8; k++) drawTraj(ctx, m, run((z) => uamp * 1.4 * (1 - z), -1.6 + 0.35 * k), alpha(T.c7, 0.45), 1.3);
        callout(ctx, 56, 54, "一束轨迹形成管", T, T.c7);
      }
      S.metrics["z(T)|u=0"] = run(() => 0, -0.9)[n];
      S.metrics["z(T)|反馈"] = run((z) => uamp * 1.8 * (1 - z), -0.9)[n];
    },
  });

  R("performance_functional", {
    init(S) { S.sim = {}; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.45);
      const W = pmpWorld(S, (z, t) => uamp * Math.sin(Math.PI * t / 2));
      const C = pmpCost(W, 1.2);
      S.sim.W = W; S.sim.C = C;
      S.metrics["∫L"] = C.L;
      S.metrics["Φ"] = C.Phi;
      S.metrics.F = C.F;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const uamp = sl(S, "uamp", 0.45);
      const W = pmpWorld(S, (z, t) => uamp * Math.sin(Math.PI * t / 2));
      const C = pmpCost(W, 1.2);
      S.sim.W = W; S.sim.C = C;
      S.metrics["∫L"] = C.L; S.metrics["Φ"] = C.Phi; S.metrics.F = C.F;
      const m = mapper(boxOf(S, { r: 140 }), 0, 1, -2, 2);
      axes(ctx, m, T, { xl: "t", yl: "z / u" });
      drawTraj(ctx, m, W.z, T.c2, 2.4);
      ctx.strokeStyle = T.c5; ctx.lineWidth = 1.6; ctx.setLineDash([4, 3]);
      ctx.beginPath();
      for (let i = 0; i < W.u.length; i++) {
        const x = m.X(i / (W.u.length - 1)), y = m.Y(W.u[i]);
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      /* 运行成本面积 */
      if (S.phase >= 1) {
        ctx.beginPath();
        for (let i = 0; i < W.u.length; i++) {
          const x = m.X(i / (W.u.length - 1)), y = m.Y(0.5 * W.u[i] * W.u[i]);
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, m.Y(0));
        }
        ctx.lineTo(m.X(1), m.Y(0)); ctx.closePath();
        ctx.fillStyle = alpha(T.c5, 0.22); ctx.fill();
      }
      if (S.phase >= 2) {
        glow(ctx, m.X(1), m.Y(W.z[W.n]), 7, T.c6);
        callout(ctx, m.X(0.62), m.Y(W.z[W.n]) - 10, "Φ=½w(zT−z*)²=" + C.Phi.toFixed(2), T, T.c6);
      }
      const bx = S.W - 128, by = 48;
      ctx.fillStyle = T.c5; ctx.fillRect(bx, by + 80 - clamp(C.L, 0, 2) / 2 * 80, 28, clamp(C.L, 0, 2) / 2 * 80);
      ctx.fillStyle = T.c6; ctx.fillRect(bx + 40, by + 80 - clamp(C.Phi, 0, 2) / 2 * 80, 28, clamp(C.Phi, 0, 2) / 2 * 80);
      ctx.fillStyle = T.tx; ctx.font = "10px sans-serif"; ctx.textAlign = "center";
      ctx.fillText("∫L", bx + 14, by + 94); ctx.fillText("Φ", bx + 54, by + 94);
      if (S.phase === 3) callout(ctx, 168, 54, "改 u（滑块）⇒ 总代价 F 变", T, T.c4);
      legend(ctx, [{ c: T.c2, l: "轨迹 z" }, { c: T.c5, l: "控制 u / 能量" }, { c: T.c6, l: "终端 Φ" }], 56, 48, T);
      badge(ctx, 16, S.H - 72, "u=" + uamp.toFixed(2) + "  F=" + C.F.toFixed(3), T, T.c4);
    },
  });

  R("hamiltonian_pmp", {
    init(S) { S.sim = { lam: 0.8 }; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.45);
      S.sim.lam = 0.3 + uamp;
      /* H = ½u² + λ(az+u) ，对 u 的抛物线 */
      const lam = S.sim.lam;
      const ustar = -lam;
      S.metrics["λ"] = lam;
      S.metrics["u*"] = ustar;
      S.metrics["H(u*)"] = 0.5 * ustar * ustar + lam * ustar;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const uamp = sl(S, "uamp", 0.45);
      const lam = 0.3 + uamp;
      S.sim.lam = lam;
      const H = (u) => 0.5 * u * u + lam * u;
      const m = mapper(boxOf(S), -3.2, 2.2, -2.2, 4);
      axes(ctx, m, T, { xl: "控制 u", yl: "H(u)" });
      if (S.phase === 1) {
        ctx.fillStyle = alpha(T.c5, 0.12);
        ctx.beginPath();
        ctx.moveTo(m.X(-3.2), m.Y(0));
        for (let i = 0; i <= 80; i++) {
          const u = -3.2 + 5.4 * i / 80;
          ctx.lineTo(m.X(u), m.Y(0.5 * u * u));
        }
        ctx.lineTo(m.X(2.2), m.Y(0)); ctx.closePath(); ctx.fill();
        callout(ctx, 56, 54, "二次能量 ½u² ⇒ 开口向上", T, T.c5);
      }
      curve(ctx, m, H, 100, T.c2, 2.4);
      const ustar = -lam;
      if (S.phase === 0) {
        const us = -2.4 + 3.6 * sm(frac(S));
        glow(ctx, m.X(us), m.Y(H(us)), 5, T.c3);
        callout(ctx, 56, 54, "扫描 u，读出 H(u,λ=" + lam.toFixed(2) + ")", T, T.c2);
      }
      if (S.phase >= 2) {
        glow(ctx, m.X(ustar), m.Y(H(ustar)), 7, T.c5);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = T.c5;
        ctx.beginPath(); ctx.moveTo(m.X(ustar), m.Y(m.yMin)); ctx.lineTo(m.X(ustar), m.Y(H(ustar))); ctx.stroke();
        ctx.setLineDash([]);
        callout(ctx, m.X(ustar) + 8, m.Y(H(ustar)) - 8, "u*=−λ=" + ustar.toFixed(2), T, T.c5);
      }
      if (S.phase === 3) {
        const lam2 = lam + 0.7;
        curve(ctx, m, (u) => 0.5 * u * u + lam2 * u, 80, T.c7, 1.6);
        glow(ctx, m.X(-lam2), m.Y(0.5 * lam2 * lam2 - lam2 * lam2), 5, T.c7);
        callout(ctx, 56, 54, "λ 改变会平移最优点", T, T.c7);
      }
      legend(ctx, [{ c: T.c2, l: "H(u)" }, { c: T.c5, l: "u*" }, { c: T.c7, l: "另一 λ" }], S.W - 130, 48, T);
      badge(ctx, 16, S.H - 72, "λ=" + lam.toFixed(2) + "  u*=" + ustar.toFixed(2), T, T.c5);
    },
  });

  R("adjoint_state_pmp", {
    init(S) { S.sim = {}; },
    tick(S) {
      const w = sl(S, "uamp", 1);
      const uFn = pmpOptimalU(S);
      const W = pmpWorld(S, uFn);
      pmpAdjoint(W, w);
      S.sim.W = W;
      S.metrics["λ(T)"] = W.lam[W.n];
      S.metrics["λ(0)"] = W.lam[0];
      S.metrics["z(T)"] = W.z[W.n];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const w = sl(S, "uamp", 1);
      const W = pmpWorld(S, pmpOptimalU(S));
      pmpAdjoint(W, w);
      S.sim.W = W;
      S.metrics["λ(T)"] = W.lam[W.n]; S.metrics["λ(0)"] = W.lam[0];
      const m1 = mapper(boxOf(S, { b: S.H * 0.5, t: 40 }), 0, 1, -2, 2);
      const m2 = mapper(boxOf(S, { t: S.H * 0.52, b: 46 }), 0, 1, Math.min(-0.2, W.lam[W.n] - 0.4), Math.max(0.2, W.lam[0] + 0.4));
      axes(ctx, m1, T, { xl: "", yl: "z 正向" });
      axes(ctx, m2, T, { xl: "t", yl: "λ 反向" });
      if (S.phase >= 0) drawTraj(ctx, m1, W.z, T.c2, hi(S, 0) ? 3 : 2);
      glow(ctx, m1.X(0), m1.Y(W.z[0]), 5, T.c3);
      if (S.phase >= 1) {
        glow(ctx, m1.X(1), m1.Y(W.z[W.n]), 6, T.c6);
        callout(ctx, m1.X(0.7), m1.Y(W.z[W.n]) - 8, "λ(T)=∇ψ=∂Φ/∂z", T, T.c7);
      }
      if (S.phase >= 2) {
        drawTraj(ctx, m2, W.lam, T.c7, 2.4);
        arrow(ctx, m2.X(0.85), m2.Y(W.lam[Math.floor(W.n * 0.85)]), -40, 0, T.c5, 2);
      }
      if (S.phase === 3) {
        let im = 0;
        for (let i = 1; i < W.lam.length; i++) if (Math.abs(W.lam[i]) > Math.abs(W.lam[im])) im = i;
        callout(ctx, m2.X(im / W.n), m2.Y(W.lam[im]) - 8, "此处 |λ| 大：状态很敏感", T, T.c5);
      }
      badge(ctx, 16, S.H - 72, "w=" + w.toFixed(2) + "  λ(T)=" + W.lam[W.n].toFixed(2), T, T.c7);
    },
  });

  R("pmp_stationarity", {
    init(S) { S.sim = {}; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.45);
      const lam = 0.4 + 0.8 * uamp;
      S.sim.lam = lam;
      S.sim.ustar = -lam;
      const uFnStar = (z, t) => -lam * Math.exp(0.42 * t) * 0.3 - lam * 0.4;
      const uFnRnd = (z, t) => uamp * Math.sin(3 * t);
      const Ws = pmpWorld(S, () => -lam);
      const Wr = pmpWorld(S, (z, t) => uamp * Math.sin(2.2 * t + z));
      S.sim.Cs = pmpCost(Ws, 1); S.sim.Cr = pmpCost(Wr, 1);
      S.sim.Ws = Ws; S.sim.Wr = Wr;
      S.metrics["u*"] = -lam;
      S.metrics["F(u*)"] = S.sim.Cs.F;
      S.metrics["F(随机u)"] = S.sim.Cr.F;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const uamp = sl(S, "uamp", 0.45);
      const lam = 0.4 + 0.8 * uamp;
      const H = (u) => 0.5 * u * u + lam * u;
      const Ws = pmpWorld(S, () => -lam);
      const Wr = pmpWorld(S, (z, t) => uamp * Math.sin(2.2 * t + z));
      const Cs = pmpCost(Ws, 1), Cr = pmpCost(Wr, 1);
      S.metrics["u*"] = -lam; S.metrics["F(u*)"] = Cs.F; S.metrics["F(随机u)"] = Cr.F;
      const m = mapper(boxOf(S, { r: S.W * 0.42 }), -3, 2, -2, 3.5);
      axes(ctx, m, T, { xl: "u", yl: "H" });
      curve(ctx, m, H, 90, T.c2, 2.2);
      glow(ctx, m.X(-lam), m.Y(H(-lam)), 6, T.c5);
      if (S.phase >= 1) callout(ctx, m.X(-lam) + 6, m.Y(H(-lam)) - 6, "∂H/∂u=0", T, T.c5);
      const m2 = mapper(boxOf(S, { l: S.W * 0.58, t: 40 }), 0, 1, -2, 2);
      axes(ctx, m2, T, { xl: "t", yl: "z" });
      if (S.phase >= 2) {
        drawTraj(ctx, m2, Ws.z, T.c3, 2.2);
        drawTraj(ctx, m2, Wr.z, alpha(T.c6, 0.7), 1.5);
      }
      if (S.phase === 3) callout(ctx, S.W * 0.58, 54, "随机 u 的 F 更大", T, T.c6);
      legend(ctx, [{ c: T.c3, l: "u*" }, { c: T.c6, l: "乱试的 u" }], S.W - 140, 48, T);
      badge(ctx, 16, S.H - 72, "u*=" + (-lam).toFixed(2) + "  F*=" + Cs.F.toFixed(2) + "  Frnd=" + Cr.F.toFixed(2), T, T.c5);
    },
  });

  R("pmp_state_equation", {
    init(S) { S.sim = {}; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.4);
      const W = pmpWorld(S, (z, t) => uamp * Math.cos(1.2 * t));
      S.sim.W = W;
      /* 非法：随便画一条不服从动力学的曲线 */
      S.sim.fake = W.z.map((v, i) => v + 0.55 * Math.sin(i * 0.4));
      S.metrics["u强度"] = uamp;
      S.metrics["z(T)"] = W.z[W.n];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const uamp = sl(S, "uamp", 0.4);
      const W = pmpWorld(S, (z, t) => uamp * Math.cos(1.2 * t));
      const fake = W.z.map((v, i) => v + 0.55 * Math.sin(i * 0.4));
      S.metrics["u强度"] = uamp; S.metrics["z(T)"] = W.z[W.n];
      const m = mapper(boxOf(S), 0, 1, -2.4, 2.4);
      axes(ctx, m, T, { xl: "t", yl: "z" });
      if (S.phase === 0 || S.phase === 2 || S.phase === 3) drawTraj(ctx, m, W.z, T.c2, 2.5);
      if (S.phase === 1) {
        ctx.setLineDash([6, 4]);
        drawTraj(ctx, m, fake, T.c6, 2.2);
        ctx.setLineDash([]);
        callout(ctx, 56, 54, "不服从 ż=f+u 的轨迹直接非法", T, T.c6);
      }
      if (S.phase === 0) callout(ctx, 56, 54, "用候选 u 正向积分", T, T.c2);
      if (S.phase === 2) callout(ctx, 56, 54, "满足动力学后再看伴随与驻点", T, T.c5);
      if (S.phase === 3) {
        const items = ["驻点 ∂H/∂u=0", "状态方程", "伴随方程", "边值"];
        items.forEach((s, i) => {
          ctx.fillStyle = i === 1 ? T.c5 : T.mu;
          font(ctx, 12, false); ctx.textAlign = "left";
          ctx.fillText((i === 1 ? "● " : "○ ") + s, S.W - 160, 56 + i * 18);
        });
      }
      badge(ctx, 16, S.H - 72, "u=" + uamp.toFixed(2) + "  z(T)=" + W.z[W.n].toFixed(2), T, T.c2);
    },
  });

  R("pmp_adjoint_equation", {
    init(S) { S.sim = {}; },
    tick(S) {
      const w = sl(S, "uamp", 1);
      const W = pmpWorld(S, pmpOptimalU(S));
      pmpAdjoint(W, w);
      S.sim.W = W;
      /* 放大：把 a 变得更负看 λ 增长 */
      S.metrics["λ(T)"] = W.lam[W.n];
      S.metrics["λ(0)"] = W.lam[0];
      S.metrics["放大比"] = Math.abs(W.lam[0] / (W.lam[W.n] + 1e-6));
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const w = sl(S, "uamp", 1);
      const W = pmpWorld(S, pmpOptimalU(S));
      pmpAdjoint(W, w);
      const W2 = pmpWorld(S, pmpOptimalU(S));
      W2.a = -1.15;
      pmpAdjoint(W2, w);
      S.metrics["λ(T)"] = W.lam[W.n]; S.metrics["λ(0)"] = W.lam[0];
      S.metrics["放大比"] = Math.abs(W.lam[0] / (W.lam[W.n] + 1e-6));
      const yLo = Math.min(-0.4, Math.min.apply(null, W.lam.concat(W2.lam)) - 0.2);
      const yHi = Math.max(0.4, Math.max.apply(null, W.lam.concat(W2.lam)) + 0.2);
      const m = mapper(boxOf(S), 0, 1, yLo, yHi);
      axes(ctx, m, T, { xl: "t （反向积分）", yl: "λ(t)" });
      if (S.phase === 0) {
        glow(ctx, m.X(1), m.Y(W.lam[W.n]), 7, T.c6);
        callout(ctx, m.X(0.55), m.Y(W.lam[W.n]) - 8, "终点 λ 已给定", T, T.c6);
      }
      /* 填充 |λ| 敏感带 */
      ctx.beginPath();
      ctx.moveTo(m.X(0), m.Y(0));
      for (let i = 0; i < W.lam.length; i++) ctx.lineTo(m.X(i / W.n), m.Y(W.lam[i]));
      ctx.lineTo(m.X(1), m.Y(0)); ctx.closePath();
      ctx.fillStyle = alpha(T.c7, hi(S, 2) || hi(S, 3) ? 0.22 : 0.1); ctx.fill();
      drawTraj(ctx, m, W.lam, T.c7, 2.4);
      if (S.phase === 2) {
        drawTraj(ctx, m, W2.lam, T.c6, 1.8);
        callout(ctx, 56, 54, "粉：|a| 更大，λ 被放大", T, T.c6);
      }
      if (S.phase >= 1) arrow(ctx, m.X(0.8), m.Y(W.lam[Math.floor(0.8 * W.n)]), -50, 0, T.c5, 2);
      if (S.phase === 3) callout(ctx, 56, 54, "这就是长期信用分配不稳定的来源", T, T.c6);
      legend(ctx, [{ c: T.c7, l: "伴随 λ" }, { c: T.c6, l: "|a| 更大" }], S.W - 140, 48, T);
      badge(ctx, 16, S.H - 72, "w=" + w.toFixed(2) + "  |λ0/λT|=" + S.metrics["放大比"].toFixed(2), T, T.c7);
    },
  });

  R("pmp_boundary_condition", {
    init(S) { S.sim = {}; },
    tick(S) {
      const w = sl(S, "uamp", 1);
      const W = pmpWorld(S, pmpOptimalU(S));
      pmpAdjoint(W, w);
      S.sim.W = W;
      S.metrics["z(0)"] = W.z[0];
      S.metrics["λ(T)"] = W.lam[W.n];
      S.metrics["残差λT"] = W.lam[W.n] - w * (W.z[W.n] - W.zd);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const w = sl(S, "uamp", 1);
      const W = pmpWorld(S, pmpOptimalU(S));
      pmpAdjoint(W, w);
      S.metrics["z(0)"] = W.z[0]; S.metrics["λ(T)"] = W.lam[W.n];
      S.metrics["残差λT"] = W.lam[W.n] - w * (W.z[W.n] - W.zd);
      const m1 = mapper(boxOf(S, { b: S.H * 0.5, t: 40 }), 0, 1, -2, 2);
      const m2 = mapper(boxOf(S, { t: S.H * 0.52, b: 46 }), 0, 1, Math.min(-0.3, W.lam[W.n] - 0.3), Math.max(0.3, W.lam[0] + 0.3));
      axes(ctx, m1, T, { yl: "z" }); axes(ctx, m2, T, { xl: "t", yl: "λ" });
      drawTraj(ctx, m1, W.z, T.c2, 2);
      drawTraj(ctx, m2, W.lam, T.c7, 2);
      if (S.phase === 0 || S.phase === 2) {
        ctx.strokeStyle = T.c3; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m1.X(0), m1.Y(-2)); ctx.lineTo(m1.X(0), m1.Y(2)); ctx.stroke();
        callout(ctx, m1.X(0) + 8, m1.Y(W.z[0]), "钉 z(0)", T, T.c3);
      }
      if (S.phase === 1 || S.phase === 2) {
        ctx.strokeStyle = T.c6; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(m2.X(1), m2.Y(m2.yMin)); ctx.lineTo(m2.X(1), m2.Y(m2.yMax)); ctx.stroke();
        callout(ctx, m2.X(0.55), m2.Y(W.lam[W.n]), "终端横截 λ(T)=∇ψ", T, T.c7);
      }
      if (S.phase === 3) {
        ctx.setLineDash([5, 4]);
        drawTraj(ctx, m1, W.z.map((v) => v + 0.7), alpha(T.c6, 0.7), 1.6);
        ctx.setLineDash([]);
        callout(ctx, 58, 54, "不满足边值的轨迹被丢弃", T, T.c6);
      }
      badge(ctx, 16, S.H - 72, "w=" + w.toFixed(2) + "  λ(T)=" + W.lam[W.n].toFixed(2), T, T.c6);
      hitBox(S, "state", m1.box);
      hitBox(S, "adj", m2.box);
    },
  });

  R("pontryagin_maximum_principle", {
    init(S) { S.sim = { shoot: 0 }; },
    tick(S, dt) {
      const w = sl(S, "uamp", 0.45);
      S.sim.shoot = Math.min(1, S.sim.shoot + dt * 0.25);
      const uFn = pmpOptimalU(S);
      const W = pmpWorld(S, uFn);
      pmpAdjoint(W, 0.6 + w);
      const C = pmpCost(W, 0.6 + w);
      S.sim.W = W; S.sim.C = C;
      S.metrics.F = C.F;
      S.metrics["∂H/∂u"] = W.u[10] + W.lam[10];
      S.metrics["λ(T)"] = W.lam[W.n];
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const w = sl(S, "uamp", 0.45);
      const uFn = pmpOptimalU(S);
      const W = pmpWorld(S, uFn);
      pmpAdjoint(W, 0.6 + w);
      const C = pmpCost(W, 0.6 + w);
      S.sim.W = W; S.sim.C = C;
      S.metrics.F = C.F; S.metrics["λ(T)"] = W.lam[W.n];
      const labs = ["驻点 ∂H/∂u=0", "状态 ż=f+u", "伴随 λ̇=−∂H/∂z", "边值 z(0),λ(T)"];
      const cols = [T.c5, T.c2, T.c7, T.c3];
      const pw = (S.W - 36) / 2, ph = (S.H - 100) / 2;
      for (let i = 0; i < 4; i++) {
        const c = i % 2, r = Math.floor(i / 2);
        const x = 12 + c * pw, y = 38 + r * ph;
        const on = S.phase === 0 ? (i <= Math.floor(frac(S) * 4)) : (S.phase >= 1);
        const dim = S.phase === 2 && i !== (S.frame % 4);
        ctx.strokeStyle = on && !dim ? cols[i] : T.line;
        ctx.lineWidth = on && !dim ? 2.4 : 1;
        rr(ctx, x, y, pw - 12, ph - 12, 8); ctx.stroke();
        ctx.fillStyle = on && !dim ? cols[i] : T.mu;
        font(ctx, 12, true); ctx.textAlign = "center";
        ctx.fillText(labs[i], x + (pw - 12) / 2, y + 18);
        font(ctx, 11, false); ctx.fillStyle = T.tx;
        if (i === 0) ctx.fillText("u*=−λ  F=" + C.F.toFixed(2), x + (pw - 12) / 2, y + 40);
        if (i === 1) {
          const mm = mapper({ x0: x + 16, y0: y + 30, x1: x + pw - 28, y1: y + ph - 24, w: pw - 44, h: ph - 54 }, 0, 1, -2, 2);
          drawTraj(ctx, mm, W.z, T.c2, 1.6);
        }
        if (i === 2) {
          const mm = mapper({ x0: x + 16, y0: y + 30, x1: x + pw - 28, y1: y + ph - 24, w: pw - 44, h: ph - 54 }, 0, 1, -1.5, 1.5);
          drawTraj(ctx, mm, W.lam, T.c7, 1.6);
        }
        if (i === 3) {
          ctx.fillText("z0=" + W.z[0].toFixed(2), x + (pw - 12) / 2, y + 42);
          ctx.fillText("λT=" + W.lam[W.n].toFixed(2), x + (pw - 12) / 2, y + 58);
        }
      }
      if (S.phase === 1) callout(ctx, 20, S.H - 52, "四块全亮：候选最优", T, T.c4);
      if (S.phase === 2) callout(ctx, 20, S.H - 52, "缺一块就不是完整 PMP", T, T.c6);
      if (S.phase === 3) callout(ctx, 20, S.H - 52, "换终端 Φ（滑块）⇒ u* 跟着变  F=" + C.F.toFixed(3), T, T.c5);
      badge(ctx, S.W - 168, S.H - 72, "uamp=" + w.toFixed(2) + "  F=" + C.F.toFixed(3), T, T.c5);
    },
  });

  window._CH2_READY = true;
})();
