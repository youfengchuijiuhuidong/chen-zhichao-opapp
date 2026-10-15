// chapter 4 custom animations
// 第4章 InfO / 粒子最优控制：每个算子专属、按 steps 分镜、真实数值
(function (global) {
  "use strict";

  const OP = (global.OP_ANIMS = global.OP_ANIMS || {});
  const TWO = Math.PI * 2;
  const PI = Math.PI;

  /* ---------- 数值小工具 ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    t = clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const hypot = Math.hypot;
  const gauss = (x, m, s) => {
    const ss = Math.max(1e-4, s);
    const z = (x - m) / ss;
    return Math.exp(-0.5 * z * z) / (ss * Math.sqrt(TWO));
  };
  function rngFn(seed) {
    let a = (seed || 1) | 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function randn(rng) {
    let u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
  }
  function rgba(col, a) {
    if (!col) return "rgba(139,152,181," + a + ")";
    if (col[0] === "#") {
      let r, g, b;
      if (col.length >= 7) {
        r = parseInt(col.slice(1, 3), 16);
        g = parseInt(col.slice(3, 5), 16);
        b = parseInt(col.slice(5, 7), 16);
      } else {
        r = parseInt(col[1] + col[1], 16);
        g = parseInt(col[2] + col[2], 16);
        b = parseInt(col[3] + col[3], 16);
      }
      return "rgba(" + r + "," + g + "," + b + "," + a + ")";
    }
    if (col.indexOf("rgb") === 0) {
      const m = col.match(/[\d.]+/g);
      if (m && m.length >= 3) return "rgba(" + m[0] + "," + m[1] + "," + m[2] + "," + a + ")";
    }
    return col;
  }
  function push(arr, v, cap) {
    arr.push(v);
    while (arr.length > cap) arr.shift();
  }

  /* 双峰混合密度 / 得分（1D） */
  const MIX = { m1: -1.15, s1: 0.38, m2: 1.18, s2: 0.40, w: 0.48 };
  function mixDens(x) {
    return MIX.w * gauss(x, MIX.m1, MIX.s1) + (1 - MIX.w) * gauss(x, MIX.m2, MIX.s2);
  }
  function mixScore(x) {
    const a = MIX.w * gauss(x, MIX.m1, MIX.s1);
    const b = (1 - MIX.w) * gauss(x, MIX.m2, MIX.s2);
    const p = a + b + 1e-12;
    return (a * (-(x - MIX.m1) / (MIX.s1 * MIX.s1)) + b * (-(x - MIX.m2) / (MIX.s2 * MIX.s2))) / p;
  }
  function mixLog(x) {
    return Math.log(mixDens(x) + 1e-12);
  }

  /* 2D 双峰后验 */
  function post2d(x, y) {
    const a = Math.exp(-0.5 * (((x + 1.12) / 0.34) ** 2 + (y / 0.38) ** 2));
    const b = Math.exp(-0.5 * (((x - 1.16) / 0.34) ** 2 + (y / 0.38) ** 2));
    const z = a + b + 1e-12;
    return {
      p: a + b,
      sx: (a * (-(x + 1.12) / (0.34 * 0.34)) + b * (-(x - 1.16) / (0.34 * 0.34))) / z,
      sy: (a * (-y / (0.38 * 0.38)) + b * (-y / (0.38 * 0.38))) / z,
    };
  }

  function kde1d(xs, x, h) {
    const n = xs.length || 1;
    let q = 0, dq = 0;
    const hh = Math.max(0.04, h);
    for (let i = 0; i < xs.length; i++) {
      const g = gauss(x, xs[i], hh);
      q += g;
      dq += g * (-(x - xs[i]) / (hh * hh));
    }
    q /= n;
    dq /= n;
    return { q, score: dq / (q + 1e-12) };
  }

  function klMC(xs, h) {
    if (!xs.length) return 0;
    let s = 0;
    for (let i = 0; i < xs.length; i++) {
      const { q } = kde1d(xs, xs[i], h);
      s += Math.log(q + 1e-12) - mixLog(xs[i]);
    }
    return s / xs.length;
  }

  /* RKHS / InfO 场：ψ(z_i)=平均_j [K_ij score_P(z_j)+∇_{z_j}K] */
  function rkhs(pts, h) {
    const n = pts.length;
    const ih = 1 / (Math.max(0.08, h) * Math.max(0.08, h));
    const acc = new Array(n);
    for (let i = 0; i < n; i++) acc[i] = { x: 0, y: 0 };
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const dx = pts[i].x - pts[j].x;
        const dy = pts[i].y - pts[j].y;
        const k = Math.exp(-0.5 * (dx * dx + dy * dy) * ih);
        const sj = post2d(pts[j].x, pts[j].y);
        acc[i].x += k * sj.sx + k * dx * ih;
        acc[i].y += k * sj.sy + k * dy * ih;
      }
      acc[i].x /= n;
      acc[i].y /= n;
    }
    return acc;
  }

  function kdeScore2d(pts, x, y, h) {
    const n = pts.length || 1;
    const ih = 1 / (Math.max(0.08, h) * Math.max(0.08, h));
    let q = 0, dx = 0, dy = 0;
    for (let i = 0; i < pts.length; i++) {
      const ux = x - pts[i].x, uy = y - pts[i].y;
      const k = Math.exp(-0.5 * (ux * ux + uy * uy) * ih);
      q += k;
      dx += -ux * ih * k;
      dy += -uy * ih * k;
    }
    q = q / n + 1e-12;
    return { q, sx: dx / n / q, sy: dy / n / q };
  }

  /* ---------- 绘图 ---------- */
  function phof(S) {
    const n = Math.max(1, (S.steps && S.steps.length) || 1);
    const ph = ((S.phase % n) + n) % n;
    const frac = clamp((S.t / 2.4) % 1, 0, 1);
    return { ph, frac, e: smooth(frac), n };
  }
  function sl(S, k, d) {
    const v = S.sliders && S.sliders[k];
    return v == null || v === "" ? d : +v;
  }
  function clonePts(pts) {
    const o = [];
    for (let i = 0; i < pts.length; i++) o.push({ x: pts[i].x, y: pts[i].y });
    return o;
  }
  function gaussKL(m, s2, mP, sP2) {
    const s = Math.max(1e-4, s2), sp = Math.max(1e-4, sP2);
    return 0.5 * (Math.log(sp / s) + (s + (m - mP) * (m - mP)) / sp - 1);
  }
  function gaussRoll(uamp, Tmax, steps) {
    let m = -1.28, s2 = 0.34;
    const mP = 1.12, sP2 = 0.17;
    const n = steps || 40;
    const dt = Math.max(1e-3, Tmax) / n;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      const u = uamp * (mP - m);
      energy += 0.5 * u * u * dt;
      m += u * dt;
      s2 = Math.max(0.06, Math.min(1.1, s2 * (1 - 0.55 * uamp * dt) + 0.012 * dt));
    }
    return { m, s2, s: Math.sqrt(Math.max(s2, 1e-4)), energy, kl: gaussKL(m, s2, mP, sP2), mP, sP2 };
  }
  function infoSnaps(v, seed, nPart, nInner, start) {
    const rng = rngFn(seed);
    const st = start || { mx: -0.08, my: 0, sx: 0.48, sy: 0.40 };
    let pts = makeCloud(rng, nPart || 24, st.mx, st.my, st.sx, st.sy);
    const snaps = [clonePts(pts)];
    const hist = [];
    const inner = nInner || 12;
    for (let k = 0; k < 3; k++) {
      for (let s = 0; s < inner; s++) {
        const acc = rkhs(pts, v);
        let nrm = 0;
        for (let i = 0; i < pts.length; i++) {
          pts[i].x = Math.max(-2.45, Math.min(2.45, pts[i].x + acc[i].x * 0.11));
          pts[i].y = Math.max(-1.55, Math.min(1.55, pts[i].y + acc[i].y * 0.11));
          nrm += Math.hypot(acc[i].x, acc[i].y);
        }
        hist.push(nrm / pts.length);
      }
      snaps.push(clonePts(pts));
    }
    return { snaps, hist };
  }
  function cachedSnaps(S, slot, v, seed, nPart, nInner, start) {
    const key = slot + ":" + Number(v).toFixed(2) + ":" + (nPart || 24);
    if (S.sim[slot + "K"] === key) return S.sim[slot];
    S.sim[slot + "K"] = key;
    S.sim[slot] = infoSnaps(v, seed, nPart, nInner, start);
    return S.sim[slot];
  }
  function evolveCloud(pts0, steps, dt, fn) {
    const pts = clonePts(pts0);
    for (let s = 0; s < steps; s++) {
      for (let i = 0; i < pts.length; i++) {
        const f = fn(pts[i]);
        pts[i].x = clamp(pts[i].x + dt * f.x, -2.4, 2.4);
        pts[i].y = clamp(pts[i].y + dt * f.y, -1.6, 1.6);
      }
    }
    return pts;
  }
  function plotCurves(ctx, B, T, xmin, xmax, specs, xlab) {
    const sampled = specs.map((sp) => sample1d(120, xmin, xmax, sp.fn));
    let ymax = 0.02;
    for (let k = 0; k < sampled.length; k++) {
      for (let i = 0; i < sampled[k].ys.length; i++) {
        if (sampled[k].ys[i] > ymax) ymax = sampled[k].ys[i];
      }
    }
    ymax *= 1.18;
    const X = (x) => B.x0 + (x - xmin) / (xmax - xmin) * (B.x1 - B.x0);
    const Y = (y) => B.y1 - (y / ymax) * (B.y1 - B.y0);
    axes(ctx, B, T, xlab || "z", "");
    for (let k = 0; k < specs.length; k++) {
      const sp = specs[k];
      if (sp.fillA) area(ctx, sampled[k].xs, sampled[k].ys, X, Y, B.y1, rgba(sp.col, sp.fillA));
      if (sp.dash) ctx.setLineDash(sp.dash);
      curve(ctx, sampled[k].xs, sampled[k].ys, X, Y, sp.col, sp.lw || 2);
      ctx.setLineDash([]);
    }
    return { X, Y, ymax };
  }
  function vbar(ctx, x, y, w, h, v, vmax, col, lab, T) {
    const hh = clamp(v / (vmax || 1), 0, 1) * h;
    ctx.fillStyle = rgba(col, T.dark ? 0.16 : 0.22);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = col;
    ctx.fillRect(x, y + h - hh, w, hh);
    ctx.fillStyle = T.mu;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(lab, x + w / 2, y + h + 12);
    ctx.fillStyle = T.tx;
    ctx.fillText(typeof v === "number" ? v.toFixed(2) : String(v), x + w / 2, y + h - hh - 4);
    ctx.textAlign = "left";
  }
  function modeLabels(ctx, V, T) {
    ctx.font = "11px sans-serif";
    ctx.fillStyle = T.c6;
    ctx.fillText("峰 A", V.X(-1.12) - 12, V.Y(0.85));
    ctx.fillText("峰 B", V.X(1.16) - 12, V.Y(0.85));
  }
  function bind(S, id) {
    S.sim.tag = id;
    S.sim.ch4 = 1;
    global.__CH4_S = S;
    global.__CH4_ID = id;
  }
  function padBox(S, extra) {
    const t = 34, b = 44, l = 24, r = 16;
    const e = extra || {};
    return {
      x0: l + (e.l || 0),
      y0: t + (e.t || 0),
      x1: S.W - r - (e.r || 0),
      y1: S.H - b - (e.b || 0),
    };
  }
  function view2d(S, xr, yr, extra) {
    const B = padBox(S, extra);
    xr = xr || [-2.5, 2.5];
    yr = yr || [-1.7, 1.7];
    const w = B.x1 - B.x0, h = B.y1 - B.y0;
    return {
      ...B, w, h, xr, yr,
      X: (x) => B.x0 + (x - xr[0]) / (xr[1] - xr[0]) * w,
      Y: (y) => B.y1 - (y - yr[0]) / (yr[1] - yr[0]) * h,
    };
  }
  function axes(ctx, V, T, xlab, ylab) {
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(V.x0, V.y1);
    ctx.lineTo(V.x1, V.y1);
    ctx.moveTo(V.x0, V.y1);
    ctx.lineTo(V.x0, V.y0);
    ctx.stroke();
    ctx.fillStyle = T.mu;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "center";
    if (xlab) ctx.fillText(xlab, (V.x0 + V.x1) / 2, V.y1 + 14);
    ctx.textAlign = "left";
    if (ylab) {
      ctx.fillStyle = T.mu;
      ctx.textAlign = "left";
      ctx.fillText(ylab, V.x0 + 6, V.y0 + 12);
    }
  }
  function arrow(ctx, x, y, dx, dy, color, w) {
    const L = hypot(dx, dy);
    if (L < 0.6) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w || 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    const a = Math.atan2(dy, dx);
    const s = clamp(5 + L * 0.08, 5, 8);
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - s * Math.cos(a - 0.42), y + dy - s * Math.sin(a - 0.42));
    ctx.lineTo(x + dx - s * Math.cos(a + 0.42), y + dy - s * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
  }
  function caption(ctx, S, T, text, on) {
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "left";
    const w = Math.min(S.W - 24, ctx.measureText(text).width + 18);
    ctx.fillStyle = rgba(T.c5, on ? (T.dark ? 0.18 : 0.28) : 0.08);
    ctx.fillRect(12, 8, w, 20);
    ctx.fillStyle = on ? T.c5 : T.tx;
    ctx.fillText(text, 20, 22);
  }
  function chip(ctx, text, x, y, T, on) {
    ctx.font = "11px sans-serif";
    const w = ctx.measureText(text).width + 12;
    ctx.fillStyle = on ? rgba(T.c5, T.dark ? 0.22 : 0.35) : rgba(T.line, 0.55);
    ctx.fillRect(x, y - 12, w, 16);
    ctx.fillStyle = on ? T.c5 : T.mu;
    ctx.fillText(text, x + 6, y);
    return w + 6;
  }
  function legend(ctx, items, x, y, T) {
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    let yy = y;
    items.forEach((it) => {
      ctx.fillStyle = it.c;
      ctx.fillRect(x, yy - 8, 10, 10);
      ctx.fillStyle = T.tx;
      ctx.fillText(it.lab, x + 14, yy);
      yy += 15;
    });
  }
  function panel(ctx, x, y, w, h, T, on) {
    ctx.fillStyle = on
      ? rgba(T.c5, T.dark ? 0.10 : 0.16)
      : (T.dark ? "rgba(255,255,255,0.03)" : "rgba(15,23,42,0.04)");
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = on ? T.c5 : T.line;
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  function spark(ctx, hist, x, y, w, h, color, T) {
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    if (!hist || hist.length < 2) return;
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < hist.length; i++) {
      const v = hist[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const sp = mx - mn || 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const px = x + (i / (hist.length - 1)) * w;
      const py = y + h - ((hist[i] - mn) / sp) * (h - 2) - 1;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  function curve(ctx, xs, ys, X, Y, color, lw) {
    ctx.strokeStyle = color;
    ctx.lineWidth = lw || 2;
    ctx.beginPath();
    for (let i = 0; i < xs.length; i++) {
      const px = X(xs[i]), py = Y(ys[i]);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  function area(ctx, xs, ys, X, Y, yBase, color) {
    if (!xs.length) return;
    ctx.beginPath();
    ctx.moveTo(X(xs[0]), yBase);
    for (let i = 0; i < xs.length; i++) ctx.lineTo(X(xs[i]), Y(ys[i]));
    ctx.lineTo(X(xs[xs.length - 1]), yBase);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
  function sample1d(n, xmin, xmax, fn) {
    const xs = [], ys = [];
    for (let i = 0; i <= n; i++) {
      const x = xmin + (xmax - xmin) * i / n;
      xs.push(x);
      ys.push(fn(x));
    }
    return { xs, ys };
  }
  function heat2d(ctx, V, T, col) {
    const modes = [{ x: -1.12, y: 0 }, { x: 1.16, y: 0 }];
    const rx = Math.abs(V.X(0.55) - V.X(0));
    const ry = Math.abs(V.Y(0.55) - V.Y(0));
    modes.forEach((md) => {
      const gx = V.X(md.x), gy = V.Y(md.y);
      const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, Math.max(rx, ry) * 1.35);
      g.addColorStop(0, rgba(col, T.dark ? 0.5 : 0.38));
      g.addColorStop(0.45, rgba(col, T.dark ? 0.22 : 0.16));
      g.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(gx, gy, rx * 1.35, ry * 1.25, 0, 0, TWO);
      ctx.fill();
    });
  }
  function fieldArrows(ctx, V, T, fn, color, nx, ny, sc, fade) {
    nx = nx || 8;
    ny = ny || 5;
    const a0 = fade == null ? 1 : fade;
    ctx.globalAlpha = a0;
    for (let i = 0; i < nx; i++) {
      for (let j = 0; j < ny; j++) {
        const x = lerp(V.xr[0] + 0.25, V.xr[1] - 0.25, (i + 0.5) / nx);
        const y = lerp(V.yr[0] + 0.2, V.yr[1] - 0.2, (j + 0.5) / ny);
        const f = fn(x, y);
        const px = V.X(x), py = V.Y(y);
        let dx = f.x * sc, dy = -f.y * sc;
        const L = hypot(dx, dy);
        const cap = 22;
        if (L > cap) {
          dx *= cap / L;
          dy *= cap / L;
        }
        arrow(ctx, px, py, dx, dy, color, 1.2);
      }
    }
    ctx.globalAlpha = 1;
  }
  function dots(ctx, pts, V, color, r, pred) {
    ctx.fillStyle = color;
    for (let i = 0; i < pts.length; i++) {
      if (pred && !pred(pts[i], i)) continue;
      ctx.beginPath();
      ctx.arc(V.X(pts[i].x), V.Y(pts[i].y), r || 3.4, 0, TWO);
      ctx.fill();
    }
  }
  function linspace(a, b, n) {
    const o = [];
    for (let i = 0; i < n; i++) o.push(a + (b - a) * i / Math.max(1, n - 1));
    return o;
  }

  /* 螺旋 ODE（前向欧拉对照） */
  function fspiral(z, uamp) {
    const k = 0.75 + 1.05 * uamp;
    return { x: -k * z.y, y: k * z.x };
  }
  function stepRK4(z, dt, uamp) {
    const k1 = fspiral(z, uamp);
    const k2 = fspiral({ x: z.x + 0.5 * dt * k1.x, y: z.y + 0.5 * dt * k1.y }, uamp);
    const k3 = fspiral({ x: z.x + 0.5 * dt * k2.x, y: z.y + 0.5 * dt * k2.y }, uamp);
    const k4 = fspiral({ x: z.x + dt * k3.x, y: z.y + dt * k3.y }, uamp);
    return {
      x: z.x + dt / 6 * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
      y: z.y + dt / 6 * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
    };
  }
  function stepEuler(z, dt, uamp) {
    const k = fspiral(z, uamp);
    return { x: z.x + dt * k.x, y: z.y + dt * k.y };
  }

  function makeCloud(rng, n, mx, my, sx, sy) {
    const p = [];
    for (let i = 0; i < n; i++) p.push({ x: mx + sx * randn(rng), y: my + sy * randn(rng) });
    return p;
  }

  function occModes(pts) {
    let L = 0, R = 0;
    for (let i = 0; i < pts.length; i++) {
      if (pts[i].x < 0) L++;
      else R++;
    }
    return { L, R };
  }

  /* ============================================================
   * 1. 粒子量子化  Q=(1/M)Σ δ(z−z_i)
   * ============================================================ */
  OP.particle_quantization = {
    init(S) {
      const rng = rngFn(11);
      S.sim = {
        rng,
        pts: Array.from({ length: 64 }, () => (rng() < 0.5 ? -1.0 + 0.3 * randn(rng) : 1.0 + 0.3 * randn(rng)))
      };
      bind(S, "particle_quantization");
    },
    tick(S) {
      const ph = S.phase;
      const nActive = ph === 0 ? 8 : (ph === 1 ? 18 : (ph === 2 ? 36 : 64));
      S.metrics["粒子数 N"] = nActive;
      S.metrics["误差界 O(1/√N)"] = (1 / Math.sqrt(nActive)).toFixed(3);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const cx = W * 0.46, cy = H * 0.58;
      const scX = W * 0.20, scY = H * 0.32;

      // 上层：连续光滑真实密度 Q(z)（蓝色面积曲线）
      ctx.fillStyle = T.dark ? "rgba(91,140,255,0.18)" : "rgba(91,140,255,0.22)";
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx - 1.8 * scX, cy);
      for (let x = -1.8; x <= 1.8; x += 0.05) {
        const dens = 0.5 * (gauss(x, -1.0, 0.35) + gauss(x, 1.0, 0.35));
        ctx.lineTo(cx + x * scX, cy - dens * scY);
      }
      ctx.lineTo(cx + 1.8 * scX, cy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;

      // 下层：离散 Dirac delta 脉冲针
      const n = S.metrics["粒子数 N"] || 16;
      for (let i = 0; i < n; i++) {
        const x = S.sim.pts[i];
        const px = cx + x * scX;
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(px, cy);
        ctx.lineTo(px, cy + 38);
        ctx.stroke();
        glow(ctx, px, cy + 38, 3, T.c3);
      }
      ctx.lineWidth = 1;

      // 仪表板
      const gx = W - 148, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 142, 60, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("经验测度经验量化", gx, gy + 12);
      ctx.fillStyle = T.c5;
      ctx.fillText("采样粒子数 N = " + n, gx, gy + 28);
      ctx.fillStyle = T.c3;
      ctx.fillText("误差 O(1/√N) ≈ " + S.metrics["误差界 O(1/√N)"], gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：连续多峰光滑目标分布 Q(z)", T, T.c2);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：离散 Dirac δ 脉冲经验测度抽样", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：粒子数激增，脉冲逼近连续边界", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：依弱收敛拓扑逼近无穷维极限", T, T.c4);
    }
  };

  OP.dirac_delta = {
    init(S) {
      S.sim = { z0: 0.42 };
      bind(S, "dirac_delta");
    },
    tick(S) {
      const { ph } = phof(S);
      const sp = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const h = [sp * 0.95 + 0.18, 0.048 + 0.03 * sp, 0.10 + 0.06 * sp, 0.14 + 0.08 * sp][ph];
      const z0 = S.sim.z0;
      const f = (x) => Math.cos(1.2 * x) + 1.15;
      let integ = 0, inner = 0;
      const N = 180, xmin = -3, xmax = 3, dx = (xmax - xmin) / N;
      for (let i = 0; i <= N; i++) {
        const x = xmin + i * dx;
        const k = gauss(x, z0, h);
        integ += k * dx;
        inner += k * f(x) * dx;
      }
      S.sim.h = h;
      S.sim.integ = integ;
      S.sim.inner = inner;
      S.sim.f0 = f(z0);
      S.metrics.核宽 = h;
      S.metrics.积分 = integ;
      S.metrics.内积 = inner;
      S.metrics.f_zi = S.sim.f0;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const sp = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const h = [sp * 0.95 + 0.18, 0.048 + 0.03 * sp, 0.10 + 0.06 * sp, 0.14 + 0.08 * sp][ph];
      const z0 = S.sim.z0;
      const B = padBox(S, { r: 132 });
      const xmin = -3, xmax = 3;
      const kfn = (x) => gauss(x, z0, h);
      const ffn = (x) => Math.cos(1.2 * x) + 1.15;
      const Ks = sample1d(160, xmin, xmax, kfn);
      const Fs = sample1d(160, xmin, xmax, ffn);
      let kmax = 0.01;
      Ks.ys.forEach((v) => { if (v > kmax) kmax = v; });
      kmax *= 1.12;
      const X = (x) => B.x0 + (x - xmin) / 6 * (B.x1 - B.x0);
      const Yk = (y) => B.y1 - y / kmax * (B.y1 - B.y0);
      const Yf = (y) => B.y1 - (y / 2.5) * (B.y1 - B.y0);
      axes(ctx, B, T, "z", "");
      if (ph === 3) {
        curve(ctx, Fs.xs, Fs.ys, X, Yf, T.c3, 2.2);
        ctx.fillStyle = T.c3;
        ctx.font = "11px sans-serif";
        ctx.fillText("测试函数 f(z)", B.x0 + 8, B.y0 + 14);
      }
      area(ctx, Ks.xs, Ks.ys, X, Yk, B.y1, rgba(T.c5, ph === 2 ? 0.42 : 0.18));
      curve(ctx, Ks.xs, Ks.ys, X, Yk, T.c5, ph === 1 ? 2.8 : 2);
      ctx.strokeStyle = T.c6;
      ctx.lineWidth = ph >= 1 ? 3 : 1.2;
      ctx.beginPath();
      ctx.moveTo(X(z0), B.y1);
      ctx.lineTo(X(z0), B.y0 + 4);
      ctx.stroke();
      ctx.fillStyle = T.c6;
      ctx.beginPath();
      ctx.arc(X(z0), B.y1, 5.5, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("zᵢ", X(z0) + 8, B.y1 - 10);
      if (ph === 0) {
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("平滑核 kₕ  带宽 h=" + h.toFixed(2), B.x0 + 8, B.y0 + 16);
      }
      if (ph === 1) {
        ctx.fillStyle = T.c6;
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("h→0 ：核收成一根针", B.x0 + 8, B.y0 + 16);
      }
      if (ph === 2) {
        ctx.fillStyle = T.c5;
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("∫ kₕ dz = " + (S.sim.integ || 0).toFixed(3) + "  （质量守恒 = 1）", B.x0 + 8, B.y0 + 16);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c6;
        ctx.beginPath();
        ctx.arc(X(z0), Yf(S.sim.f0), 7, 0, TWO);
        ctx.fill();
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("⟨δ,f⟩ = f(zᵢ) = " + (S.sim.f0 || 0).toFixed(3), B.x0 + 8, B.y0 + 34);
        ctx.fillStyle = T.mu;
        ctx.fillText("⟨kₕ,f⟩ = " + (S.sim.inner || 0).toFixed(3) + "  → 逼近点取值", B.x0 + 8, B.y0 + 52);
      }
      caption(ctx, S, T, ["平滑核逐渐变窄", "极限变成一根针", "积分保持 1", "对测试函数只取点值"][ph], true);
      legend(ctx, [
        { c: T.c5, lab: "核 kₕ" },
        { c: T.c6, lab: "δ 支撑" },
        { c: T.c3, lab: "f(z)" },
      ], S.W - 126, 50, T);
    },
  };

  /* ============================================================
   * 3. 粒子常微分方程  dz/dτ = φ(z)
   * 每帧从初值重积分，phase 切换立刻换分镜
   * ============================================================ */
  OP.particle_ode = {
    init(S) {
      S.sim = {};
      bind(S, "particle_ode");
    },
    tick(S) {
      const { ph } = phof(S);
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1.3);
      S.metrics.控制强度 = uamp;
      S.metrics.ε离散 = 0.42;
      S.metrics.转向 = ph === 3 ? "反向" : "正向";
      S.metrics.粒子数 = String([3, 4, 7, 7][ph]);
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1.3);
      const sign = ph === 3 ? -1 : 1;
      const omega = (0.55 + 0.9 * uamp) * sign;
      const phi = (z) => ({ x: 0.62, y: omega * Math.sin(1.15 * z.x) - 0.22 * z.y });
      const V = view2d(S, [-2.4, 2.6], [-1.85, 1.85]);
      axes(ctx, V, T, "τ（水平推进）", "z");
      fieldArrows(ctx, V, T, (x, y) => phi({ x, y }), rgba(T.c7, ph === 3 ? 0.95 : ph === 0 ? 0.28 : 0.5), 8, 5, 18, 1);
      if (ph === 0) {
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("ε = 0.42  有限跳步", V.x0 + 8, V.y0 + 16);
      }
      const nShow = [3, 4, 7, 7][ph];
      const cols = [T.c2, T.c3, T.c4, T.c5, T.c6, T.c7, T.c2];
      for (let i = 0; i < nShow; i++) {
        const y0 = -1.08 + i * 0.32;
        const z0 = { x: -2.05, y: y0 };
        const cont = [z0];
        let z = { x: z0.x, y: z0.y };
        for (let s = 0; s < 72; s++) {
          const f = phi(z);
          z = { x: z.x + 0.048 * f.x, y: z.y + 0.048 * f.y };
          cont.push(z);
        }
        const disc = [z0];
        z = { x: z0.x, y: z0.y };
        for (let s = 0; s < 8; s++) {
          const f = phi(z);
          z = { x: z.x + 0.42 * f.x, y: z.y + 0.42 * f.y };
          disc.push(z);
        }
        if (ph >= 1) {
          ctx.strokeStyle = cols[i];
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          cont.forEach((q, k) => {
            const px = V.X(q.x), py = V.Y(q.y);
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          });
          ctx.stroke();
        }
        if (ph <= 1) {
          ctx.strokeStyle = T.c6;
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          disc.forEach((q, k) => {
            const px = V.X(q.x), py = V.Y(q.y);
            if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          });
          ctx.stroke();
          disc.forEach((q) => {
            ctx.fillStyle = T.c6;
            ctx.beginPath();
            ctx.arc(V.X(q.x), V.Y(q.y), 3.4, 0, TWO);
            ctx.fill();
          });
        }
        const last = ph === 0 ? disc[disc.length - 1] : cont[cont.length - 1];
        ctx.fillStyle = cols[i];
        ctx.beginPath();
        ctx.arc(V.X(last.x), V.Y(last.y), 5, 0, TWO);
        ctx.fill();
      }
      if (ph === 3) {
        ctx.fillStyle = T.c6;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("φ 反向：整族轨迹对折", V.x0 + 8, V.y0 + 16);
      }
      caption(ctx, S, T, ["离散跳步 z←z+εφ", "ε→0 变成连续曲线", "多粒子并行积分", "φ 改方向，整族转向"][ph], true);
      legend(ctx, [
        { c: T.c6, lab: "欧拉折线" },
        { c: T.c2, lab: "连续轨迹" },
        { c: T.c7, lab: "φ 场" },
      ], S.W - 118, 46, T);
    },
  };

  /* ============================================================
   * 4. 蒙特卡洛期望  E_Q[f] ≈ (1/M) Σ f(z_i)
   * ============================================================ */
  OP.monte_carlo_expectation = {
    init(S) {
      const rng = rngFn(41);
      const darts = [];
      for (let i = 0; i < 280; i++) {
        const x = rng() * 2 - 1, y = rng() * 2 - 1;
        darts.push({ x, y, hit: x * x + y * y <= 1 });
      }
      const bias = [];
      for (let i = 0; i < 280; i++) {
        let z = randn(rng);
        if (Math.abs(z) > 0.85) z = rng() * 1.6 - 0.8;
        bias.push(z);
      }
      const curveM = [], curveE = [], curveT = [];
      let hits = 0;
      for (let m = 1; m <= 280; m++) {
        if (darts[m - 1].hit) hits++;
        if (m % 4 === 0 || m < 8) {
          curveM.push(m);
          curveE.push(Math.abs(4 * hits / m - PI));
          curveT.push(1 / Math.sqrt(m));
        }
      }
      S.sim = { darts, bias, curveM, curveE, curveT };
      bind(S, "monte_carlo_expectation");
    },
    tick(S) {
      const { ph } = phof(S);
      const cap = Math.round(clamp(sl(S, "n", 120), 40, 280));
      const M = ph === 0 ? 28 : cap;
      if (ph <= 2) {
        let hits = 0;
        for (let i = 0; i < M; i++) if (S.sim.darts[i].hit) hits++;
        const est = 4 * hits / M;
        S.sim.est = est;
        S.sim.err = Math.abs(est - PI);
        S.sim.theory = 1 / Math.sqrt(M);
        S.sim.M = M;
        S.metrics.M = String(M);
        S.metrics.pi估 = est;
        S.metrics.绝对误差 = S.sim.err;
        S.metrics.理论1sqrtM = S.sim.theory;
      } else {
        const M3 = cap;
        let s = 0;
        for (let i = 0; i < M3; i++) s += S.sim.bias[i] * S.sim.bias[i];
        S.sim.biasEst = s / M3;
        S.sim.M = M3;
        S.metrics.M = String(M3);
        S.metrics.E截断z2 = S.sim.biasEst;
        S.metrics.真值 = 1;
        S.metrics.偏差 = S.sim.biasEst - 1;
      }
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const cap = Math.round(clamp(sl(S, "n", 120), 40, 280));
      caption(ctx, S, T, ["随机撒点估 π", "M 增大，估计更稳", "误差 ~ 1/√M", "尾部未覆盖 → 有偏"][ph], true);
      if (ph <= 2) {
        const M = ph === 0 ? 28 : cap;
        const side = Math.min(S.W * 0.46, S.H - 86);
        const x0 = 22, y0 = 36;
        ctx.strokeStyle = T.line;
        ctx.strokeRect(x0, y0, side, side);
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x0 + side / 2, y0 + side / 2, side / 2, 0, TWO);
        ctx.stroke();
        for (let i = 0; i < M; i++) {
          const p = S.sim.darts[i];
          ctx.fillStyle = p.hit ? T.c3 : T.c6;
          ctx.beginPath();
          ctx.arc(x0 + (p.x + 1) / 2 * side, y0 + (1 - p.y) / 2 * side, ph === 0 ? 3.6 : 2.0, 0, TWO);
          ctx.fill();
        }
        const rx = x0 + side + 16, rw = S.W - rx - 16;
        panel(ctx, rx, 36, rw, S.H - 80, T, ph === 2);
        ctx.fillStyle = T.tx;
        ctx.font = "13px sans-serif";
        ctx.fillText("π ≈ " + (S.sim.est || 0).toFixed(4), rx + 10, 58);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("真值 3.14159   M=" + M, rx + 10, 76);
        const cut = Math.max(2, Math.floor(S.sim.curveM.length * M / 280));
        spark(ctx, S.sim.curveE.slice(0, cut), rx + 10, 100, rw - 20, 64, T.c6, T);
        ctx.fillStyle = T.mu;
        ctx.fillText("绝对误差 vs M", rx + 10, 96);
        vbar(ctx, rx + 16, S.H - 150, 28, 56, S.sim.err || 0, 0.35, T.c6, "误差", T);
        vbar(ctx, rx + 56, S.H - 150, 28, 56, S.sim.theory || 0, 0.35, T.c2, "1/√M", T);
        if (ph === 2) {
          ctx.fillStyle = T.c5;
          ctx.font = "11px sans-serif";
          ctx.fillText("误差按 1/√M 下降", rx + 10, S.H - 78);
        }
      } else {
        const B = padBox(S, { t: 6 });
        const { X, Y } = plotCurves(ctx, B, T, -3, 3, [{ fn: (x) => gauss(x, 0, 1), col: T.c2, fillA: 0.2, lw: 2 }], "z");
        ctx.fillStyle = rgba(T.c6, 0.12);
        ctx.fillRect(X(-0.85), B.y0, X(0.85) - X(-0.85), B.y1 - B.y0);
        ctx.strokeStyle = T.c6;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(X(-0.85), B.y0, X(0.85) - X(-0.85), B.y1 - B.y0);
        ctx.setLineDash([]);
        const M3 = cap;
        for (let i = 0; i < Math.min(M3, 120); i++) {
          ctx.fillStyle = T.c5;
          ctx.beginPath();
          ctx.arc(X(clamp(S.sim.bias[i], -2.9, 2.9)), B.y1 - 6, 3, 0, TWO);
          ctx.fill();
        }
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("E[z²] 截断估 " + (S.sim.biasEst || 0).toFixed(3) + "  ≠  1（尾部缺失）", B.x0 + 8, B.y0 + 14);
      }
    },
  };

  /* ============================================================
   * 5. 控制仿射微扰分解  φ = score_P + u
   * ============================================================ */
  OP.control_affine_perturbation = {
    init(S) {
      const rng = rngFn(51);
      S.sim = { rng, pts0: makeCloud(rng, 22, -0.2, 0, 0.55, 0.45) };
      bind(S, "control_affine_perturbation");
    },
    tick(S) {
      const { ph } = phof(S);
      const sig = clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      const amp = 0.35 + sig * 1.4;
      const fnP = (p) => { const P = post2d(p.x, p.y); return { x: P.sx, y: P.sy }; };
      const fnU = (p) => ({ x: -amp * p.y - 0.15 * p.x, y: amp * p.x - 0.15 * p.y });
      const fnF = (p) => { const a = fnP(p), b = fnU(p); return { x: a.x + b.x, y: a.y + b.y }; };
      const steps = [0, 0, 14, 24][ph];
      const fn = [fnP, fnU, fnF, fnF][ph];
      const pts = evolveCloud(S.sim.pts0, steps, 0.08, fn);
      let energy = 0, nrm = 0, osc = 0;
      pts.forEach((p) => {
        const u = fnU(p), f = fnF(p);
        energy += 0.5 * (u.x * u.x + u.y * u.y);
        nrm += hypot(f.x, f.y);
        osc += p.x * u.x + p.y * u.y;
      });
      S.sim.pts = pts;
      S.sim.amp = amp;
      S.metrics.噪声 = sig;
      S.metrics.控制能 = energy / pts.length;
      S.metrics.φ范数 = nrm / pts.length;
      S.metrics.过冲指示 = osc / pts.length;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S);
      const amp = S.sim.amp != null ? S.sim.amp : 0.7;
      heat2d(ctx, V, T, T.c6);
      axes(ctx, V, T, "z₁", "z₂");
      modeLabels(ctx, V, T);
      const scP = (x, y) => { const P = post2d(x, y); return { x: P.sx, y: P.sy }; };
      const scU = (x, y) => ({ x: -amp * y - 0.15 * x, y: amp * x - 0.15 * y });
      const scF = (x, y) => { const a = scP(x, y), b = scU(x, y); return { x: a.x + b.x, y: a.y + b.y }; };
      if (ph === 0) fieldArrows(ctx, V, T, scP, T.mu, 8, 5, 15);
      if (ph === 1) fieldArrows(ctx, V, T, scU, T.c6, 8, 5, 16);
      if (ph === 2) fieldArrows(ctx, V, T, scF, T.c5, 8, 5, 15);
      if (ph === 3) {
        fieldArrows(ctx, V, T, scP, rgba(T.mu, 0.35), 6, 4, 10);
        fieldArrows(ctx, V, T, scU, rgba(T.c6, 0.75), 6, 4, 12);
        fieldArrows(ctx, V, T, scF, T.c5, 8, 5, 17);
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("u 过大 → 旋转过冲", V.x0 + 8, V.y0 + 16);
      }
      dots(ctx, S.sim.pts || S.sim.pts0, V, T.c2, ph === 0 ? 5 : 4);
      caption(ctx, S, T, ["后验得分 ∇log P（灰）", "控制 u（红）", "合成 φ = 得分 + u", "调 u：过冲 / 振荡"][ph], true);
      legend(ctx, [
        { c: T.mu, lab: "∇log P" },
        { c: T.c6, lab: "u(z)" },
        { c: T.c5, lab: "φ 合成" },
        { c: T.c2, lab: "粒子" },
      ], S.W - 118, 46, T);
    },
  };

  /* 1D 有限/无穷时域共享积分 */
  function ocRollout(uamp, Tmax, nStep) {
    // Q0 ~ N(-1.1, 0.55²)，P = 双峰混合；控制 u = uamp * (mixScore - kdeScore) 的粒子版
    const rng = rngFn(99 + Math.round(uamp * 20) + Math.round(Tmax * 10));
    const M = 28;
    const xs = [];
    for (let i = 0; i < M; i++) xs.push(-1.15 + 0.55 * randn(rng));
    const dt = Tmax / nStep;
    let energy = 0;
    const means = [];
    for (let s = 0; s < nStep; s++) {
      const h = 0.32;
      let mean = 0;
      for (let i = 0; i < M; i++) {
        const scP = mixScore(xs[i]);
        const scQ = kde1d(xs, xs[i], h).score;
        const u = -uamp * scQ; // 往最优结构靠
        const phi = scP + u;
        energy += 0.5 * u * u * dt;
        xs[i] += phi * dt;
        xs[i] = clamp(xs[i], -3, 3);
        mean += xs[i];
      }
      means.push(mean / M);
    }
    const kl = klMC(xs, 0.32);
    return { xs, energy: energy / M, kl, means };
  }

  /* ============================================================
   * 6. 有限时域最优控制代价
   * ============================================================ */
  OP.finite_horizon_oc_cost = {
    init(S) {
      S.sim = { cache: {}, lastKey: "", hist: [] };
      bind(S, "finite_horizon_oc_cost");
    },
    tick(S) {
      const { ph } = phof(S);
      const uamp = clamp(sl(S, "uamp", 0.45), 0, 1.3);
      const Tlist = [0.28, 0.32, 1.35, 1.35];
      const Ulist = [0.18, Math.max(0.85, uamp), 0.35 + 0.35 * uamp, uamp];
      const Tmax = Tlist[ph];
      const u = Ulist[ph];
      const key = ph + ":" + u.toFixed(2) + ":" + Tmax.toFixed(2);
      if (S.sim.lastKey !== key) {
        S.sim.lastKey = key;
        S.sim.roll = ocRollout(u, Tmax, 36);
        if (ph === 3) {
          S.sim.pareto = [0.15, 0.4, 0.7, 1.0, 1.3].map((uu) => {
            const r = ocRollout(uu, Tmax, 28);
            return { u: uu, kl: r.kl, energy: r.energy, F: r.kl + r.energy };
          });
        }
      }
      const r = S.sim.roll;
      const F = r.kl + r.energy;
      S.sim.uamp = uamp;
      S.sim.Tmax = Tmax;
      S.metrics.时域T = Tmax;
      S.metrics.终端KL = r.kl;
      S.metrics.控制能 = r.energy;
      S.metrics.总代价F = F;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const r = S.sim.roll || { xs: [], kl: 0, energy: 0 };
      const B = padBox(S, { r: 154 });
      plotCurves(ctx, B, T, -3, 3, [
        { fn: mixDens, col: T.c6, fillA: 0.16, lw: 2 },
        { fn: (x) => kde1d(r.xs || [], x, 0.32).q, col: T.c2, fillA: 0.12, lw: 2.2 },
      ], "z");
      const X = (x) => B.x0 + (x + 3) / 6 * (B.x1 - B.x0);
      (r.xs || []).forEach((z) => {
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(X(z), B.y1 - 5, 3.2, 0, TWO);
        ctx.fill();
      });
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("T=" + (S.sim.Tmax || 0).toFixed(2), B.x0 + 8, B.y0 + 12);
      const rx = B.x1 + 12;
      panel(ctx, rx, 36, 140, S.H - 82, T, ph >= 2);
      const mx = Math.max(0.2, r.kl, r.energy, r.kl + r.energy);
      vbar(ctx, rx + 12, 50, 28, S.H - 170, r.kl, mx, T.c6, "KL", T);
      vbar(ctx, rx + 52, 50, 28, S.H - 170, r.energy, mx, T.c5, "能量", T);
      vbar(ctx, rx + 92, 50, 28, S.H - 170, r.kl + r.energy, mx, T.c3, "F", T);
      if (ph === 3 && S.sim.pareto) {
        ctx.fillStyle = T.c5;
        ctx.font = "10px sans-serif";
        ctx.fillText("Pareto u↦F", rx + 10, S.H - 78);
        spark(ctx, S.sim.pareto.map((p) => p.F), rx + 10, S.H - 74, 118, 22, T.c3, T);
      }
      caption(ctx, S, T, [
        "短 T：来不及靠近，终端 KL 大",
        "加大控制：KL 降、能量升",
        "折中出现（F=KL+能量）",
        "T 固定时的最优权衡",
      ][ph], true);
    },
  };

  /* ============================================================
   * 7. 无穷时域最优控制代价
   * ============================================================ */
  OP.infinite_horizon_oc_cost = {
    init(S) {
      S.sim = { sweeps: [], lastU: -1 };
      bind(S, "infinite_horizon_oc_cost");
    },
    tick(S) {
      const uamp = clamp(sl(S, "uamp", 0.45), 0, 1.3);
      if (Math.abs(uamp - S.sim.lastU) > 0.04 || !S.sim.sweeps.length) {
        S.sim.lastU = uamp;
        const Ts = [0.25, 0.6, 1.2, 2.4, 4.0];
        S.sim.sweeps = Ts.map((Tm) => {
          const r = ocRollout(uamp, Tm, 36);
          return { T: Tm, kl: r.kl, energy: r.energy, xs: r.xs };
        });
      }
      const { ph } = phof(S);
      const idx = [0, 1, 4, 4][ph];
      const cur = S.sim.sweeps[idx];
      S.sim.idx = idx;
      S.metrics.T = cur.T;
      S.metrics.终端KL = cur.kl;
      S.metrics.控制能 = cur.energy;
      S.metrics.说明 = ph >= 2 ? "T→∞ 只剩能量" : "KL 随 T 下降";
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const sweeps = S.sim.sweeps || [];
      caption(ctx, S, T, [
        "T 增大，终端 KL 柱缩短",
        "控制能量柱变成主导",
        "T=∞：贴上后验后只关心路上的 u",
        "对比有限时域的双目标",
      ][ph], true);
      // 上：当前 Q
      const cur = sweeps[S.sim.idx] || sweeps[sweeps.length - 1];
      if (cur) {
        const B = { x0: 24, y0: 34, x1: S.W * 0.48, y1: S.H * 0.55 };
        const xmin = -3, xmax = 3;
        const X = (x) => B.x0 + (x - xmin) / 6 * (B.x1 - B.x0);
        const trueY = sample1d(80, xmin, xmax, mixDens);
        const kde = sample1d(80, xmin, xmax, (x) => kde1d(cur.xs, x, 0.32).q);
        let ymax = 0.02;
        trueY.ys.concat(kde.ys).forEach((v) => { if (v > ymax) ymax = v; });
        ymax *= 1.2;
        const Y = (y) => B.y1 - y / ymax * (B.y1 - B.y0);
        ctx.strokeStyle = T.line;
        ctx.strokeRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
        curve(ctx, trueY.xs, trueY.ys, X, Y, T.c6, 1.6);
        curve(ctx, kde.xs, kde.ys, X, Y, T.c2, 2);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("T = " + cur.T.toFixed(2), B.x0 + 8, B.y0 + 14);
      }
      // 下/右：T 扫描柱
      const x0 = S.W * 0.52, y0 = 34, w = S.W * 0.46, h = S.H - 78;
      panel(ctx, x0, y0, w, h, T, ph >= 1);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("随 T 扫描：粉=KL  黄=能量", x0 + 10, y0 + 18);
      if (!sweeps.length) return;
      const mx = Math.max(0.2, ...sweeps.map((s) => Math.max(s.kl, s.energy)));
      const bw = (w - 24) / sweeps.length;
      sweeps.forEach((s, i) => {
        const on = i === S.sim.idx;
        const bx = x0 + 12 + i * bw;
        const kh = s.kl / mx * (h - 70);
        const eh = s.energy / mx * (h - 70);
        ctx.globalAlpha = on ? 1 : 0.4;
        ctx.fillStyle = T.c6;
        ctx.fillRect(bx, y0 + h - 28 - kh, bw * 0.35, kh);
        ctx.fillStyle = T.c5;
        ctx.fillRect(bx + bw * 0.38, y0 + h - 28 - eh, bw * 0.35, eh);
        ctx.globalAlpha = 1;
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("T" + s.T.toFixed(1), bx + bw * 0.35, y0 + h - 12);
      });
      ctx.textAlign = "left";
      /* 无穷时域：协态渐近包络 λ(t)~e^{-αt} → 0 */
      if (ph >= 2) {
        const ex0 = 28, ey0 = S.H * 0.58, ew = S.W * 0.44, eh = 46;
        ctx.strokeStyle = T.c7;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const t = i / 40;
          const px = ex0 + t * ew;
          const py = ey0 + 8 + (1 - Math.exp(-2.6 * t)) * (eh - 16);
          if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c7;
        ctx.font = "11px sans-serif";
        ctx.fillText("渐近包络  λ(t)→0 = 无穷时域横截", ex0, ey0);
      }
      if (ph === 3) {
        panel(ctx, 24, S.H * 0.72, S.W * 0.46, S.H * 0.16, T, true);
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("有限时域：双目标", 36, S.H * 0.72 + 16);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText("F = KL + ∫‖u‖²/2；无穷时域横截 λ(∞)=0 后只剩能量", 36, S.H * 0.72 + 36);
      }
    },
  };

  /* ============================================================
   * 8. 无穷时域哈密顿量
   * ============================================================ */
  OP.hamiltonian_infinite_horizon = {
    init(S) {
      S.sim = { traj: [] };
      bind(S, "hamiltonian_infinite_horizon");
    },
    tick(S, dt) {
      const uamp = clamp(sl(S, "uamp", 0.45), 0, 1.3);
      const t = S.t;
      // Hyperbolic saddle point flow: z decays to 0, lambda decays to 0
      const z = 1.2 * Math.exp(-0.8 * (t % 4.0));
      const lambda = 0.9 * Math.exp(-1.1 * (t % 4.0));
      if (!S.sim.traj || (t % 4.0 < 0.05)) S.sim.traj = [];
      S.sim.traj.push({ z, lambda });

      S.metrics["状态偏离 z"] = z;
      S.metrics["伴随协态 λ"] = lambda;
      S.metrics["哈密顿量 H"] = -0.5 * (z * z + lambda * lambda) * uamp;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const cx = W * 0.46, cy = H * 0.58;
      const scZ = W * 0.22, scL = H * 0.28;

      // 相空间坐标轴 (z 横轴, lambda 纵轴)
      ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
      ctx.beginPath();
      ctx.moveTo(cx - 160, cy); ctx.lineTo(cx + 160, cy);
      ctx.moveTo(cx, cy - 110); ctx.lineTo(cx, cy + 110);
      ctx.stroke();

      ctx.fillStyle = T.mu; ctx.font = "10px " + FONT;
      ctx.fillText("状态偏差 z", cx + 130, cy + 14);
      ctx.fillText("协态 λ", cx + 8, cy - 95);

      // 鞍点相空间流动等高线
      ctx.strokeStyle = T.dark ? "rgba(192,132,252,0.18)" : "rgba(192,132,252,0.22)";
      for (let c = 0.3; c <= 1.2; c += 0.3) {
        ctx.beginPath();
        for (let x = 0.1; x <= 1.5; x += 0.05) {
          const y = c / x;
          if (y < 2.0) {
            const px = cx + x * scZ * 0.7, py = cy - y * scL * 0.5;
            if (x === 0.1) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
        }
        ctx.stroke();
      }

      // 稳定流形轨迹
      if (S.sim.traj && S.sim.traj.length > 1) {
        ctx.strokeStyle = T.c7;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        S.sim.traj.forEach((pt, i) => {
          const px = cx + pt.z * scZ, py = cy - pt.lambda * scL;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        });
        ctx.stroke();
        ctx.lineWidth = 1;

        const cur = S.sim.traj[S.sim.traj.length - 1];
        glow(ctx, cx + cur.z * scZ, cy - cur.lambda * scL, 6, T.c3);
      }

      // 仪表板
      const gx = W - 150, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 144, 60, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("哈密顿鞍点相空间", gx, gy + 12);
      ctx.fillStyle = T.c7;
      ctx.fillText("协态 λ(t) → " + S.metrics["伴随协态 λ"].toFixed(3), gx, gy + 28);
      ctx.fillStyle = T.c3;
      ctx.fillText("横截条件: lim λ(t)=0", gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：构建相空间 (z, λ) 状态-协态对偶坐标", T, T.c7);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：哈密顿向量场引导鞍点双曲流动", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：无穷时域横截条件迫使 λ(∞) 渐近衰减至 0", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：达到最优稳态控制闭环", T, T.c4);
    }
  };

  OP.adjoint_state = {
    init(S) {
      S.sim = { xs: linspace(-2.4, 2.4, 40).map((x) => x * 0.15) };
      bind(S, "adjoint_state");
    },
    tick(S) {
      const w = clamp(sl(S, "uamp", 1), 0.2, 2);
      S.sim.w = w;
      // Q = 单峰高斯，位置随时间极慢漂移（λ 时间不变）
      S.sim.m = 0.15 * Math.sin(S.t * 0.2);
      S.sim.s = 0.42;
      S.metrics.终端权重 = w;
      S.metrics.λ均值 = 1 / gauss(S.sim.m, S.sim.m, S.sim.s);
      S.metrics.Q峰 = gauss(S.sim.m, S.sim.m, S.sim.s);
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const B = padBox(S, { r: 8 });
      const xmin = -2.6, xmax = 2.6;
      const X = (x) => B.x0 + (x - xmin) / (xmax - xmin) * (B.x1 - B.x0);
      const m = 0;
      const w = clamp(sl(S, "uamp", 1), 0.2, 2);
      const s = 0.22 + 0.38 / Math.max(0.25, w);
      const Q = (x) => gauss(x, m, s);
      const lam = (x) => w / (Q(x) + 0.05);
      const qs = sample1d(120, xmin, xmax, Q);
      const ls = sample1d(120, xmin, xmax, lam);
      let qmx = 0.01;
      qs.ys.forEach((v) => { if (v > qmx) qmx = v; });
      const lmx = 8 + 18 * w;
      const Yq = (y) => B.y1 - y / (qmx * 1.15) * (B.y1 - B.y0);
      const Yl = (y) => B.y1 - y / (lmx * 1.15) * (B.y1 - B.y0);
      axes(ctx, B, T, ph === 0 ? "时间 τ" : "z", "");
      if (ph === 0) {
        const ys = [0.28, 0.48, 0.68];
        const cols = [T.c7, T.c2, T.c5];
        ys.forEach((yy, k) => {
          ctx.strokeStyle = cols[k];
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          ctx.moveTo(B.x0, B.y0 + 24 + yy * (B.y1 - B.y0));
          ctx.lineTo(B.x1, B.y0 + 24 + yy * (B.y1 - B.y0));
          ctx.stroke();
          ctx.fillStyle = cols[k];
          ctx.font = "11px sans-serif";
          ctx.fillText("λ(z=" + [-1.2, 0, 1.2][k] + ") 常数", B.x0 + 8, B.y0 + 18 + yy * (B.y1 - B.y0));
        });
        ctx.fillStyle = T.c7;
        ctx.font = "13px sans-serif";
        ctx.fillText("λ̇ = −∂H/∂Q = 0  →  伴随不随时间变", B.x0 + 8, B.y0 + 16);
      } else {
        area(ctx, qs.xs, qs.ys, X, Yq, B.y1, rgba(T.c2, 0.22));
        curve(ctx, qs.xs, qs.ys, X, Yq, T.c2, 2);
      }
      if (ph === 1) {
        ctx.strokeStyle = T.c5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(X(2.05), Yq(Q(2.05)));
        ctx.lineTo(X(2.05), Yl(Math.min(lmx, lam(2.05))));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(X(2.05), Yq(Q(2.05)), 6, 0, TWO);
        ctx.fill();
        ctx.font = "12px sans-serif";
        ctx.fillText("终端 KL 变分  配平 λ 边值", B.x0 + 8, B.y0 + 16);
        ctx.fillStyle = T.mu;
        ctx.fillText("尾部 Q 小 → 需要更大的 λ 来配平", B.x0 + 8, B.y0 + 34);
      }
      if (ph >= 2) {
        curve(ctx, ls.xs, ls.ys, X, Yl, T.c6, 2.4);
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("λ = w/Q  （密度低处定价更高）", B.x0 + 8, B.y0 + 16);
      }
      if (ph === 3) {
        for (let i = 0; i < 9; i++) {
          const x = -2.1 + i * 0.52;
          const sc = -(x - m) / (s * s);
          arrow(ctx, X(x), Yq(Q(x)), -sc * 18, 0, T.c5, 1.8);
        }
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("驻点：u* = −∇log Q = −∇Q / Q", B.x0 + 8, B.y0 + 36);
      }
      const bh = 24 + 88 * ((w - 0.2) / 1.8);
      ctx.fillStyle = rgba(T.c5, 0.9);
      ctx.fillRect(B.x1 - 18, B.y1 - bh, 12, bh);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("w=" + w.toFixed(2), B.x1 - 52, B.y1 - bh - 6);
      legend(ctx, [
        { c: T.c2, lab: "Q(z)" },
        { c: T.c6, lab: "λ=w/Q" },
        { c: T.c5, lab: "−∇log Q" },
      ], S.W - 120, 46, T);
      caption(ctx, S, T, ["λ 随时间不变", "用终端 KL 变分配平", "得到 λ=1/Q", "代入驻点出现 −∇log Q"][ph], true);
    },
  };

  /* ============================================================
   * 10. 最优控制律  u* = −∇log Q
   * ============================================================ */
  OP.optimal_control_law = {
    init(S) {
      S.sim = {};
      bind(S, "optimal_control_law");
    },
    tick(S) {
      const { ph } = phof(S);
      const sig = clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      const h = 0.28 + 0.5 * sig;
      const pack = cachedSnaps(S, "ocLaw", h, 101, 24, 10, { mx: -0.1, my: 0, sx: 0.62, sy: 0.48 });
      const pts = pack.snaps[[0, 0, 1, 3][ph]];
      S.sim.h = h;
      S.sim.pts = pts;
      let nU = 0, nPhi = 0, nQ = 0;
      pts.forEach((p) => {
        const Q = kdeScore2d(pts, p.x, p.y, h);
        const P = post2d(p.x, p.y);
        nU += hypot(Q.sx, Q.sy);
        nQ += hypot(Q.sx, Q.sy);
        nPhi += hypot(P.sx - Q.sx, P.sy - Q.sy);
      });
      const n = pts.length;
      S.metrics.σ = sig;
      S.metrics.u范数 = nU / n;
      S.metrics.scoreQ = nQ / n;
      S.metrics.净φ = nPhi / n;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S);
      const h = S.sim.h || 0.5;
      const pts = S.sim.pts || [];
      heat2d(ctx, V, T, T.c6);
      axes(ctx, V, T, "z₁", "z₂");
      modeLabels(ctx, V, T);
      const scQ = (x, y) => { const Q = kdeScore2d(pts, x, y, h); return { x: Q.sx, y: Q.sy }; };
      const scU = (x, y) => { const Q = kdeScore2d(pts, x, y, h); return { x: -Q.sx, y: -Q.sy }; };
      const scF = (x, y) => {
        const P = post2d(x, y), Q = kdeScore2d(pts, x, y, h);
        return { x: P.sx - Q.sx, y: P.sy - Q.sy };
      };
      if (ph === 0) fieldArrows(ctx, V, T, scQ, T.c2, 8, 5, 16);
      if (ph === 1) fieldArrows(ctx, V, T, scU, T.c6, 8, 5, 16);
      if (ph === 2) fieldArrows(ctx, V, T, scF, T.c5, 8, 5, 16);
      if (ph === 3) {
        fieldArrows(ctx, V, T, scF, rgba(T.c5, 0.45), 8, 5, 8);
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("Q≈P 时净流≈0", V.x0 + 8, V.y0 + 16);
      }
      dots(ctx, pts, V, T.c5, ph === 3 ? 5 : 4);
      if (pts.length) {
        ctx.strokeStyle = rgba(T.c7, 0.5);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(V.X(pts[0].x), V.Y(pts[0].y), Math.abs(V.X(pts[0].x + h) - V.X(pts[0].x)), 0, TWO);
        ctx.stroke();
      }
      caption(ctx, S, T, ["Q 的得分场 ∇log Q", "u* 正好反向", "净 φ = ∇log P − ∇log Q", "Q≈P 时净流趋于零"][ph], true);
      legend(ctx, [
        { c: T.c2, lab: "∇log Q" },
        { c: T.c6, lab: "u* = −∇log Q" },
        { c: T.c5, lab: "净 φ" },
      ], S.W - 140, 46, T);
    },
  };

  /* ============================================================
   * 11. InfO 微扰场
   * ============================================================ */
  OP.info_perturbation_field = {
    init(S) {
      S.sim = {};
      bind(S, "info_perturbation_field");
    },
    tick(S) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      const pack = cachedSnaps(S, "infoPhi", v, 111, 24, 12, { mx: -0.05, my: 0, sx: 0.42, sy: 0.38 });
      const pts = pack.snaps[[0, 0, 1, 3][ph]];
      S.sim.v = v;
      S.sim.pts = pts;
      S.sim.hist = pack.hist.slice(0, Math.max(2, [3, 8, 20, pack.hist.length][ph]));
      let nPhi = 0;
      pts.forEach((p) => {
        const P = post2d(p.x, p.y);
        const Q = kdeScore2d(pts, p.x, p.y, v);
        nPhi += hypot(P.sx - Q.sx, P.sy - Q.sy);
      });
      const { L, R } = occModes(pts);
      S.metrics.核带宽 = v;
      S.metrics.φ范数 = nPhi / pts.length;
      S.metrics.左峰粒子 = String(L);
      S.metrics.右峰粒子 = String(R);
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S, [-2.5, 2.5], [-1.65, 1.65], { r: 124 });
      heat2d(ctx, V, T, T.c6);
      axes(ctx, V, T, "z₁", "z₂");
      modeLabels(ctx, V, T);
      if (ph === 0) {
        ctx.fillStyle = T.c6;
        ctx.font = "13px sans-serif";
        ctx.fillText("双峰后验 P(z|x)", V.x0 + 8, V.y0 + 18);
      }
      if (ph >= 1) {
        dots(ctx, S.sim.pts, V, ph === 3 ? T.c5 : T.c2, ph === 1 ? 5.2 : 4);
        if (ph === 1) {
          ctx.fillStyle = T.c2;
          ctx.font = "12px sans-serif";
          ctx.fillText("单团 Q 粒子（尚未分开）", V.x0 + 8, V.y0 + 18);
        }
      }
      if (ph >= 2) {
        fieldArrows(ctx, V, T, (x, y) => {
          const P = post2d(x, y);
          const Q = kdeScore2d(S.sim.pts, x, y, S.sim.v);
          return { x: P.sx - Q.sx, y: P.sy - Q.sy };
        }, T.c5, 7, 5, ph === 3 ? 7 : 16);
      }
      spark(ctx, S.sim.hist, S.W - 126, 44, 108, 46, T.c5, T);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("‖φ‖ 随迭代下降", S.W - 126, 40);
      caption(ctx, S, T, ["双峰后验 P", "单团 Q 粒子", "场把一部分拽向另一峰", "对齐后箭头变短"][ph], true);
    },
  };

  /* ============================================================
   * 12. 后验得分分解
   * ============================================================ */
  OP.posterior_score_decomposition = {
    init(S) {
      S.sim = { xobs: 1.05, th: 1.15 };
      bind(S, "posterior_score_decomposition");
    },
    tick(S) {
      const sig = clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      const th = S.sim.th, x = S.sim.xobs, s2 = sig * sig;
      const z = 0.55;
      S.sim.sig = sig;
      S.sim.sprior = -z;
      S.sim.slike = th * (x - th * z) / s2;
      S.sim.spost = S.sim.sprior + S.sim.slike;
      const prec = 1 + th * th / s2;
      S.sim.post_m = (th * x / s2) / prec;
      S.sim.post_s = 1 / Math.sqrt(prec);
      S.sim.like_m = x / th;
      S.sim.like_s = sig / Math.abs(th);
      S.metrics.σ = sig;
      S.metrics.先验得分 = S.sim.sprior;
      S.metrics.似然得分 = S.sim.slike;
      S.metrics.后验得分 = S.sim.spost;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const sig = S.sim.sig, th = S.sim.th, xobs = S.sim.xobs, s2 = sig * sig;
      const top = padBox(S, { b: (S.H - 44) * 0.42, r: 8 });
      const specs = [];
      if (ph === 0 || ph === 2) specs.push({ fn: (z) => gauss(z, 0, 1), col: T.c2, fillA: ph === 0 ? 0.28 : 0.1, lw: ph === 0 ? 2.4 : 1.3 });
      if (ph === 1 || ph === 2) specs.push({ fn: (z) => gauss(z, S.sim.like_m, S.sim.like_s), col: T.c6, fillA: ph === 1 ? 0.28 : 0.1, lw: ph === 1 ? 2.4 : 1.3 });
      if (ph >= 2) specs.push({ fn: (z) => gauss(z, S.sim.post_m, S.sim.post_s), col: T.c5, fillA: 0.22, lw: 2.4 });
      if (!specs.length) specs.push({ fn: (z) => gauss(z, 0, 1), col: T.c2, fillA: 0.1, lw: 1 });
      const { X } = plotCurves(ctx, top, T, -2.6, 2.6, specs, "z");
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("密度", top.x0 + 6, top.y0 + 12);
      const bot = { x0: top.x0, y0: top.y1 + 22, x1: top.x1, y1: S.H - 44 };
      ctx.strokeStyle = T.line;
      ctx.strokeRect(bot.x0, bot.y0, bot.x1 - bot.x0, bot.y1 - bot.y0);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("得分 ∇_z log", bot.x0 + 6, bot.y0 + 12);
      const scoreFn = (z) => {
        if (ph === 0) return -z;
        if (ph === 1) return th * (xobs - th * z) / s2;
        return -z + th * (xobs - th * z) / s2;
      };
      let smax = 0.5;
      for (let i = 0; i <= 40; i++) {
        const a = Math.abs(scoreFn(-2.6 + 5.2 * i / 40));
        if (a > smax) smax = a;
      }
      const Ys = (s) => {
        const mid = (bot.y0 + bot.y1) / 2;
        return mid - clamp(s / smax, -1, 1) * (bot.y1 - bot.y0) * 0.38;
      };
      ctx.strokeStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(bot.x0, (bot.y0 + bot.y1) / 2);
      ctx.lineTo(bot.x1, (bot.y0 + bot.y1) / 2);
      ctx.stroke();
      const drawScore = (fn, col, on, lab) => {
        ctx.globalAlpha = on ? 1 : 0.2;
        ctx.strokeStyle = col;
        ctx.lineWidth = on ? 2.2 : 1;
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const z = -2.6 + 5.2 * i / 80;
          const py = Ys(fn(z));
          if (i) ctx.lineTo(X(z), py); else ctx.moveTo(X(z), py);
        }
        ctx.stroke();
        for (let i = 0; i < 9; i++) {
          const z = -2 + i * 0.5;
          arrow(ctx, X(z), Ys(0), 0, Ys(fn(z)) - Ys(0), col, on ? 1.6 : 1);
        }
        ctx.fillStyle = col;
        ctx.font = "11px sans-serif";
        ctx.fillText(lab, bot.x0 + 8, bot.y1 - 6);
        ctx.globalAlpha = 1;
      };
      if (ph === 0) drawScore((z) => -z, T.c2, true, "先验 −z （拉回 0）");
      if (ph === 1) drawScore((z) => th * (xobs - th * z) / s2, T.c6, true, "似然 拉向 z≈x/θ");
      if (ph === 2) {
        drawScore((z) => -z, T.c2, false, "");
        drawScore((z) => th * (xobs - th * z) / s2, T.c6, false, "");
        drawScore((z) => -z + th * (xobs - th * z) / s2, T.c5, true, "后验 = 先验+似然");
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("高斯后验 ⇒ 得分是直线", bot.x0 + 148, bot.y1 - 6);
      }
      if (ph === 3) {
        drawScore((z) => -z + th * (xobs - th * z) / s2, T.c5, true, "后验得分");
        panel(ctx, S.W * 0.56, 36, S.W * 0.4, 88, T, true);
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("∇_z log p(x) = 0  （划掉）", S.W * 0.56 + 10, 58);
        ctx.strokeStyle = T.c6;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(S.W * 0.56 + 12, 54);
        ctx.lineTo(S.W * 0.56 + S.W * 0.36, 54);
        ctx.stroke();
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("边缘 p(x) 对 z 无梯度", S.W * 0.56 + 10, 80);
        ctx.fillText("实现：解析先验 + 自动微分似然", S.W * 0.56 + 10, 98);
      }
      ctx.fillStyle = T.c5;
      ctx.font = "11px sans-serif";
      ctx.fillText("x=" + xobs.toFixed(2) + "  似然峰 z≈" + (xobs / th).toFixed(2) + "  σ=" + sig.toFixed(2), top.x0 + 80, top.y0 + 12);
      caption(ctx, S, T, ["先验得分拉回原点", "似然得分拉向能解释 x 的 z", "相加得后验得分", "p(x) 项导数为零"][ph], true);
    },
  };

  /* ============================================================
   * 13. RKHS 拟设控制
   * ============================================================ */
  OP.rkhs_ansatz_control = {
    init(S) {
      const rng = rngFn(131);
      S.sim = { rng, pts: makeCloud(rng, 16, -0.2, 0, 0.55, 0.42) };
      bind(S, "rkhs_ansatz_control");
    },
    tick(S) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      const pack = cachedSnaps(S, "rkhsA", v, 131, 16, 10, { mx: -0.2, my: 0, sx: 0.55, sy: 0.42 });
      const pts = pack.snaps[ph === 3 ? 2 : 0];
      S.sim.v = v;
      S.sim.pts = pts;
      const n = pts.length;
      const ih = 1 / (v * v);
      const acc = new Array(n);
      let tScore = 0, tRep = 0;
      for (let i = 0; i < n; i++) {
        let sx = 0, sy = 0, rx = 0, ry = 0;
        for (let j = 0; j < n; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const k = Math.exp(-0.5 * (dx * dx + dy * dy) * ih);
          const sj = post2d(pts[j].x, pts[j].y);
          sx += k * sj.sx;
          sy += k * sj.sy;
          rx += k * dx * ih;
          ry += k * dy * ih;
        }
        acc[i] = { sx: sx / n, sy: sy / n, rx: rx / n, ry: ry / n, x: (sx + rx) / n, y: (sy + ry) / n };
        tScore += hypot(acc[i].sx, acc[i].sy);
        tRep += hypot(acc[i].rx, acc[i].ry);
      }
      S.sim.acc = acc;
      S.metrics.核带宽 = v;
      S.metrics.得分输送 = tScore / n;
      S.metrics.排斥项 = tRep / n;
      S.metrics.ψ范数 = (tScore + tRep) / n;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S);
      heat2d(ctx, V, T, T.c6, 18, 11);
      axes(ctx, V, T, "z₁", "z₂");
      const pts = S.sim.pts;
      const v = S.sim.v;
      // 核连线
      if (ph === 0) {
        const ih = 1 / (v * v);
        for (let i = 0; i < pts.length; i++) {
          for (let j = i + 1; j < pts.length; j++) {
            const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
            const k = Math.exp(-0.5 * (dx * dx + dy * dy) * ih);
            if (k < 0.18) continue;
            ctx.strokeStyle = rgba(T.c2, clamp(k * 0.7, 0.08, 0.55));
            ctx.lineWidth = 1 + k;
            ctx.beginPath();
            ctx.moveTo(V.X(pts[i].x), V.Y(pts[i].y));
            ctx.lineTo(V.X(pts[j].x), V.Y(pts[j].y));
            ctx.stroke();
          }
        }
      }
      const acc = S.sim.acc || [];
      pts.forEach((p, i) => {
        const a = acc[i];
        if (!a) return;
        if (ph === 0 || ph === 2) {
          arrow(ctx, V.X(p.x), V.Y(p.y), a.sx * 18, -a.sy * 18, T.c2, 1.4);
        }
        if (ph === 1 || ph === 2) {
          arrow(ctx, V.X(p.x), V.Y(p.y), a.rx * 36, -a.ry * 36, T.c3, 1.6);
        }
        if (ph >= 2) {
          arrow(ctx, V.X(p.x), V.Y(p.y), a.x * 20, -a.y * 20, T.c5, 1.8);
        }
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(V.X(p.x), V.Y(p.y), 4.2, 0, TWO);
        ctx.fill();
        if (ph === 0) {
          ctx.strokeStyle = rgba(T.c7, 0.35);
          const rx = Math.abs(V.X(p.x + v) - V.X(p.x));
          ctx.beginPath();
          ctx.arc(V.X(p.x), V.Y(p.y), rx, 0, TWO);
          ctx.stroke();
        }
      });
      const msgs = [
        "核把后验得分从邻居投过来",
        "∇K 交互项（防塌缩）",
        "平滑控制场 ψ_RKHS",
        "粒子沿该场走",
      ];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.c2, lab: "K·score_P" },
        { c: T.c3, lab: "∇K 排斥" },
        { c: T.c5, lab: "ψ 合成" },
      ], S.W - 126, 42, T);
    },
  };

  /* ============================================================
   * 14. 前向欧拉离散
   * ============================================================ */
  OP.forward_euler_discretization = {
    init(S) {
      S.sim = { true: [], eu: [], err: 0, blow: false };
      bind(S, "forward_euler_discretization");
    },
    tick(S) {
      const { ph } = phof(S);
      const eps = clamp(sl(S, "eps", 0.2), 0.05, 0.7);
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1.3);
      const eUse = ph === 2 ? clamp(0.045 + 0.22 * (eps / 0.7), 0.045, 0.22)
        : ph === 3 ? Math.max(eps, 0.48)
        : eps;
      const key = ph + ":" + eUse.toFixed(3) + ":" + uamp.toFixed(2);
      if (S.sim._ek === key) {
        S.metrics.ε = eUse;
        S.metrics.控制强度 = uamp;
        S.metrics.轨迹误差 = S.sim.err;
        S.metrics.发散 = S.sim.blow ? 1 : 0;
        return;
      }
      S.sim._ek = key;
      const z0 = { x: 1.55, y: 0.15 };
      const tru = [z0];
      let z = { x: z0.x, y: z0.y };
      const fine = 0.02;
      for (let t = 0; t < 3.2; t += fine) {
        z = stepRK4(z, fine, uamp);
        tru.push(z);
        if (hypot(z.x, z.y) > 8) break;
      }
      const eu = [z0];
      z = { x: z0.x, y: z0.y };
      S.sim.blow = false;
      for (let t = 0; t < 3.2; t += eUse) {
        z = stepEuler(z, eUse, uamp);
        eu.push({ x: z.x, y: z.y });
        if (hypot(z.x, z.y) > 6) {
          S.sim.blow = true;
          break;
        }
      }
      // 误差：在相同时间对齐
      let err = 0, cnt = 0;
      const n = Math.min(tru.length, 80);
      for (let i = 0; i < n; i++) {
        const tau = i * fine;
        const j = Math.min(eu.length - 1, Math.round(tau / eUse));
        err += hypot(tru[i].x - eu[j].x, tru[i].y - eu[j].y);
        cnt++;
      }
      S.sim.true = tru;
      S.sim.eu = eu;
      S.sim.err = err / (cnt || 1);
      S.sim.eUse = eUse;
      S.metrics.ε = eUse;
      S.metrics.控制强度 = uamp;
      S.metrics.轨迹误差 = S.sim.err;
      S.metrics.发散 = S.sim.blow ? 1 : 0;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S, [-2.8, 2.8], [-2.1, 2.1]);
      axes(ctx, V, T, "z₁", "z₂");
      fieldArrows(ctx, V, T, (x, y) => fspiral({ x, y }, sl(S, "uamp", 0.4)), rgba(T.mu, 0.4), 7, 5, 12);
      const stroke = (path, col, lw, dash) => {
        if (!path || path.length < 2) return;
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        path.forEach((p, i) => {
          const px = V.X(p.x), py = V.Y(p.y);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      };
      if (ph === 0) stroke(S.sim.true, T.c3, 2.4);
      if (ph === 1) {
        stroke(S.sim.true, rgba(T.c3, 0.35), 1.5);
        stroke(S.sim.eu, T.c6, 2.2);
        S.sim.eu.forEach((p) => {
          ctx.fillStyle = T.c6;
          ctx.beginPath();
          ctx.arc(V.X(p.x), V.Y(p.y), 3, 0, TWO);
          ctx.fill();
        });
      }
      if (ph === 2) {
        stroke(S.sim.true, T.c3, 2.2);
        stroke(S.sim.eu, T.c5, 2);
      }
      if (ph === 3) {
        stroke(S.sim.true, rgba(T.c3, 0.4), 1.5);
        stroke(S.sim.eu, T.c6, 2.4);
        if (S.sim.blow) {
          ctx.fillStyle = T.c6;
          ctx.font = "bold 14px sans-serif";
          ctx.fillText("ε 过大：欧拉飞出", V.x0 + 10, V.y0 + 22);
        }
      }
      const msgs = ["真向量场积分（弧）", "欧拉折线", "减小 ε，折线贴弧", "过大 ε：粒子飞出"];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.c3, lab: "RK4 真弧" },
        { c: T.c6, lab: "前向欧拉" },
        { c: T.mu, lab: "φ 场" },
      ], S.W - 120, 42, T);
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillStyle = T.c5;
      ctx.font = "bold 12px sans-serif";
      ctx.fillText("ε = " + (S.sim.eUse || 0).toFixed(2), S.W - 120, 96);
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("误差 " + (S.sim.err || 0).toFixed(3), S.W - 120, 114);
    },
  };

  /* ============================================================
   * 15. InfO 粒子更新（算法 4.1）
   * ============================================================ */
  OP.info_particle_update = {
    init(S) {
      S.sim = {};
      bind(S, "info_particle_update");
    },
    tick(S) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      const pack = cachedSnaps(S, "infoAlg", v, 151, 26, 12, { mx: 0, my: 0, sx: 0.85, sy: 0.7 });
      const pts = pack.snaps[[0, 1, 2, 3][ph]];
      S.sim.pts = pts;
      S.sim.histKL = pack.hist.slice(0, Math.max(2, [3, 14, 26, pack.hist.length][ph]));
      S.sim.tstep = [0, 12, 24, 36][ph];
      const { L, R } = occModes(pts);
      let kl = 0;
      pts.forEach((p) => {
        const Q = kdeScore2d(pts, p.x, p.y, v);
        const P = post2d(p.x, p.y);
        kl += Math.log(Q.q + 1e-12) - Math.log(P.p + 1e-12);
      });
      kl /= pts.length;
      S.metrics.核带宽 = v;
      S.metrics.步数 = String(S.sim.tstep);
      S.metrics.KL近似 = kl;
      S.metrics.右峰占比 = R / pts.length;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S, [-2.5, 2.5], [-1.7, 1.7], { r: 128 });
      heat2d(ctx, V, T, T.c6, 22, 13);
      axes(ctx, V, T, "z₁", "z₂");
      dots(ctx, S.sim.pts, V, ph === 3 ? T.c5 : T.c2, ph === 3 ? 5 : 3.8);
      if (ph >= 2) {
        ctx.strokeStyle = rgba(T.c3, 0.8);
        ctx.strokeRect(V.X(-1.9), V.Y(0.7), V.X(-0.4) - V.X(-1.9), V.Y(-0.7) - V.Y(0.7));
        ctx.strokeStyle = rgba(T.c6, 0.8);
        ctx.strokeRect(V.X(0.4), V.Y(0.7), V.X(1.9) - V.X(0.4), V.Y(-0.7) - V.Y(0.7));
      }
      if (ph === 3) {
        ctx.fillStyle = rgba(T.c5, 0.15);
        ctx.fillRect(V.x0 + 6, V.y0 + 6, 168, 36);
        ctx.fillStyle = T.c5;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("返回 {zᵢ,T}  ≈ Q_T", V.x0 + 12, V.y0 + 28);
      }
      spark(ctx, S.sim.histKL, S.W - 122, 40, 106, 50, T.c6, T);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("KL 近似", S.W - 122, 36);
      const msgs = [
        "初始化粒子（先验）",
        "反复核化 InfO 更新",
        "粒子分开占据两个后验峰",
        "到达 T 后当作 Q_T",
      ];
      caption(ctx, S, T, msgs[ph], true);
    },
  };

  /* ============================================================
   * 16. InfO-EM 的 M 步
   * ============================================================ */
  OP.info_em_m_step = {
    init(S) {
      S.sim = { x: 1.35 };
      bind(S, "info_em_m_step");
    },
    tick(S) {
      const { ph } = phof(S);
      const rate = clamp(sl(S, "rate", 1), 0.2, 2);
      const x = S.sim.x, sig = 0.35, s2 = sig * sig;
      const sampleZ = (thv, seed) => {
        const prec = 1 + thv * thv / s2;
        const mz = (thv * x / s2) / prec;
        const sz = 1 / Math.sqrt(prec);
        const rng = rngFn(161 + seed);
        const zs = [];
        for (let i = 0; i < 20; i++) zs.push(mz + sz * randn(rng));
        return { zs, mz, sz };
      };
      let th = 0.32;
      const histTh = [th], histL = [], snaps = [];
      for (let k = 0; k < 8; k++) {
        const pack = sampleZ(th, k);
        let g = 0, ll = 0, recon = 0;
        pack.zs.forEach((z) => {
          g += (x - th * z) * z / s2;
          const xh = th * z;
          ll += -0.5 * (x - xh) * (x - xh) / s2;
          recon += (x - xh) * (x - xh);
        });
        g /= pack.zs.length;
        ll /= pack.zs.length;
        histL.push(ll);
        snaps.push({ th, zs: pack.zs, ll, recon: recon / pack.zs.length });
        th = clamp(th + 0.12 * g, 0.05, 2.6);
        histTh.push(th);
      }
      const idx = clamp(Math.round([0, 1, 3, 6][ph] * rate), 0, snaps.length - 1);
      const cur = snaps[idx];
      S.sim.th = cur.th;
      S.sim.zs = cur.zs;
      S.sim.histTh = histTh;
      S.sim.histL = histL;
      S.sim.emIdx = idx;
      S.metrics.θ = cur.th;
      S.metrics.重建MSE = cur.recon;
      S.metrics.似然 = cur.ll;
      S.metrics.提升速度 = rate;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const th = S.sim.th, x = S.sim.x, zs = S.sim.zs || [];
      const mid = S.W * 0.5;
      panel(ctx, 16, 32, mid - 24, S.H - 76, T, ph === 0 || ph === 3);
      panel(ctx, mid, 32, S.W - mid - 16, S.H - 76, T, ph === 1 || ph === 2);
      const B = { x0: 44, y0: 50, x1: mid - 36, y1: S.H - 52 };
      const X = (z) => B.x0 + (z + 2.2) / 4.4 * (B.x1 - B.x0);
      const Y = (xv) => B.y1 - (xv + 0.4) / 2.6 * (B.y1 - B.y0);
      ctx.strokeStyle = T.line;
      ctx.strokeRect(B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0);
      ctx.strokeStyle = T.c5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(B.x0, Y(x));
      ctx.lineTo(B.x1, Y(x));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c5;
      ctx.font = "11px sans-serif";
      ctx.fillText("观测 x", B.x1 - 54, Y(x) - 6);
      ctx.strokeStyle = T.c3;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(X(-2), Y(th * -2));
      ctx.lineTo(X(2), Y(th * 2));
      ctx.stroke();
      zs.forEach((z) => {
        const xh = th * z;
        ctx.fillStyle = T.c2;
        ctx.beginPath();
        ctx.arc(X(z), Y(xh), 4, 0, TWO);
        ctx.fill();
        if (ph === 0 || ph === 3) {
          ctx.strokeStyle = rgba(T.c5, 0.5);
          ctx.beginPath();
          ctx.moveTo(X(z), Y(xh));
          ctx.lineTo(X(z), Y(x));
          ctx.stroke();
        }
        if (ph === 1) arrow(ctx, X(z), Y(xh), 0, (Y(x) - Y(xh)) * 0.5, T.c6, 1.3);
      });
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("z →  x̂=θz", B.x0 + 6, B.y0 + 14);
      spark(ctx, S.sim.histL, mid + 16, 52, S.W - mid - 40, 64, T.c4, T);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("平均对数似然", mid + 16, 48);
      spark(ctx, S.sim.histTh, mid + 16, 148, S.W - mid - 40, 64, T.c7, T);
      ctx.fillText("θ 轨迹", mid + 16, 144);
      if (S.sim.histTh && S.sim.histTh.length > 1) {
        const i0 = clamp(S.sim.emIdx || 0, 0, S.sim.histTh.length - 1);
        const px = mid + 16 + (S.W - mid - 40) * i0 / (S.sim.histTh.length - 1);
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(px, 148);
        ctx.lineTo(px, 212);
        ctx.stroke();
      }
      ctx.fillStyle = T.tx;
      ctx.font = "13px sans-serif";
      ctx.fillText("θ = " + th.toFixed(3), mid + 16, 236);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText(ph <= 1 ? "E 步：粒子对齐后验" : "M 步：粒子平均似然梯度", mid + 16, 256);
      if (ph === 3) {
        ctx.fillStyle = T.c3;
        ctx.fillText("新 E 步：后验更尖、重建残差更短", mid + 16, 274);
      }
      caption(ctx, S, T, ["粒子已对齐后验", "用粒子平均似然梯度", "θ 更新，解码更好", "下一轮 E 步后验更准"][ph], true);
    },
  };

  /* ============================================================
   * 17. 路径空间松弛 vs 扩散 / 薛定谔桥
   * ============================================================ */
  OP.path_space_relaxation_choice = {
    init(S) {
      const rng = rngFn(171);
      const mkPath = (kind) => {
        const n = 48;
        const pts = [];
        let x = kind === "sb" ? -1.4 : 0;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          if (kind === "diff") x += 0.18 * randn(rng);
          else if (kind === "sb") {
            // 布朗桥：两端钉住
            const target = 1.35;
            x = (1 - t) * (-1.4) + t * target + 0.22 * Math.sin(t * 9 + rng() * 0.2) * (t * (1 - t) * 4);
          } else if (kind === "ode") {
            x = -1.3 + 2.5 * (1 - Math.exp(-2.4 * t));
          } else {
            // 路径空间：一条光滑曲线当作「点」
            x = Math.sin(t * PI) * 1.3;
          }
          pts.push({ t, x });
        }
        return pts;
      };
      S.sim = {
        rng,
        path: mkPath("curve"),
        diffs: [0, 1, 2].map(() => mkPath("diff")),
        sbs: [0, 1, 2].map(() => mkPath("sb")),
        odes: [0, 1, 2, 3].map((k) => {
          const n = 48, pts = [];
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const x = -1.15 + k * 0.18 + (2.2 - k * 0.08) * (1 - Math.exp(-2.6 * t));
            pts.push({ t, x });
          }
          return pts;
        }),
      };
      bind(S, "path_space_relaxation_choice");
    },
    tick(S, dt) {
      const sig = clamp(sl(S, "sig", 0.3), 0.05, 0.95);
      S.sim.sig = sig;
      const rng = S.sim.rng;
      const { ph } = phof(S);
      // 扩散路径继续抖动
      if (ph === 1) {
        S.sim.diffs.forEach((p) => {
          for (let i = 1; i < p.length; i++) {
            p[i].x += randn(rng) * sig * 0.05;
            p[i].x = clamp(p[i].x, -2.2, 2.2);
          }
        });
      }
      S.metrics.扩散强度 = sig;
      S.metrics.选择 = ph === 3 ? "InfO 确定性粒子" : ["路径空间", "扩散 SDE", "薛定谔桥", "InfO"][ph];
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const cells = [
        { lab: "路径空间 C([0,∞))", sub: "整条曲线是一个点" },
        { lab: "扩散模型 SDE", sub: "随机路径" },
        { lab: "薛定谔桥", sub: "两端钉住的随机桥" },
        { lab: "本章：InfO 粒子 ODE", sub: "确定性最优控制" },
      ];
      const gw = (S.W - 36) / 2, gh = (S.H - 70) / 2;
      const pos = [
        { x: 16, y: 32 },
        { x: 20 + gw, y: 32 },
        { x: 16, y: 40 + gh },
        { x: 20 + gw, y: 40 + gh },
      ];
      const sigAmp = 0.45 + 2.2 * (S.sim.sig != null ? S.sim.sig : 0.3);
      const plot = (path, box, col, lw, amp) => {
        const a = amp == null ? 1 : amp;
        const X = (t) => box.x + 10 + t * (box.w - 20);
        const Y = (x) => box.y + box.h / 2 - (x * a) / 2.4 * (box.h / 2 - 16);
        ctx.strokeStyle = col;
        ctx.lineWidth = lw || 1.6;
        ctx.beginPath();
        path.forEach((p, i) => {
          const px = X(p.t), py = Y(p.x);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
      };
      cells.forEach((c, i) => {
        const p = pos[i];
        const on = i === ph;
        ctx.globalAlpha = on ? 1 : 0.38;
        panel(ctx, p.x, p.y, gw - 8, gh - 12, T, on);
        const box = { x: p.x, y: p.y + 28, w: gw - 8, h: gh - 48 };
        ctx.fillStyle = (i === ph || (ph === 3 && i === 3)) ? T.c5 : T.tx;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText(c.lab, p.x + 10, p.y + 18);
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.fillText(c.sub, p.x + 10, p.y + 32);
        if (i === 0) {
          plot(S.sim.path, box, T.c7, 3);
          ctx.fillStyle = T.c7;
          ctx.beginPath();
          ctx.arc(box.x + box.w - 18, box.y + 14, 7, 0, TWO);
          ctx.fill();
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText("曲线↦点", box.x + box.w - 64, box.y + 18);
        }
        if (i === 1) {
          S.sim.diffs.forEach((path, k) => plot(path, box, [T.c2, T.c3, T.c6][k], 1.3, sigAmp));
        }
        if (i === 2) {
          // 钉住两端
          ctx.fillStyle = T.c5;
          ctx.beginPath();
          ctx.arc(box.x + 14, box.y + box.h * 0.72, 5, 0, TWO);
          ctx.arc(box.x + box.w - 14, box.y + box.h * 0.28, 5, 0, TWO);
          ctx.fill();
          S.sim.sbs.forEach((path, k) => plot(path, box, [T.c2, T.c3, T.c7][k], 1.3, sigAmp));
        }
        if (i === 3) {
          S.sim.odes.forEach((path) => plot(path, box, T.c5, 1.8));
          if (on) {
            ctx.strokeStyle = T.c5;
            ctx.lineWidth = 2.6;
            ctx.strokeRect(p.x + 2, p.y + 2, gw - 12, gh - 16);
          }
        }
        ctx.globalAlpha = 1;
      });
      const msgs = [
        "路径空间：整条曲线是一个点",
        "扩散：随机路径",
        "薛定谔桥：两端钉住",
        "本章选择：确定性 OC 粒子（高亮）",
      ];
      caption(ctx, S, T, msgs[ph], true);
    },
  };

  /* 包装：init 后立刻 tick；暂停时滑块/步骤变化会重算，避免空白或旧帧 */
  const CH4_IDS = [
    "particle_quantization", "dirac_delta", "particle_ode", "monte_carlo_expectation",
    "control_affine_perturbation", "finite_horizon_oc_cost", "infinite_horizon_oc_cost",
    "hamiltonian_infinite_horizon", "adjoint_state", "optimal_control_law",
    "info_perturbation_field", "posterior_score_decomposition", "rkhs_ansatz_control",
    "forward_euler_discretization", "info_particle_update", "info_em_m_step",
    "path_space_relaxation_choice",
  ];
  CH4_IDS.forEach(function (id) {
    const orig = OP[id];
    if (!orig || orig.__ch4wrap) return;
    OP[id] = {
      __ch4wrap: true,
      init(S) {
        orig.init(S);
        bind(S, id);
        try { orig.tick(S, 0.02); } catch (e) { S.metrics.err = String(e && e.message || e); }
      },
      tick(S, dt) {
        try { orig.tick(S, dt || 0); } catch (e) { S.metrics.err = String(e && e.message || e); }
      },
      draw(ctx, S, T) {
        try {
          const sig = JSON.stringify(S.sliders || {}) + "|" + S.phase;
          if (S.sim && S.sim._sigDraw !== sig) {
            S.sim._sigDraw = sig;
            try { orig.tick(S, 0.02); } catch (e0) {}
          }
          orig.draw(ctx, S, T);
        } catch (e) {
          ctx.fillStyle = T.c6;
          ctx.font = "12px sans-serif";
          ctx.fillText("动画错误: " + (e && e.message || e), 16, 42);
        }
      },
    };
  });

})(window);
