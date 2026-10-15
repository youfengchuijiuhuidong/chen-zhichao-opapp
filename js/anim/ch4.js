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
  function infoSnaps(v, seed, nPart, nInner) {
    const rng = rngFn(seed);
    let pts = makeCloud(rng, nPart || 28, 0.05, 0, 0.92, 0.62);
    const snaps = [clonePts(pts)];
    const hist = [];
    const inner = nInner || 16;
    for (let k = 0; k < 3; k++) {
      for (let s = 0; s < inner; s++) {
        const acc = rkhs(pts, v);
        let nrm = 0;
        for (let i = 0; i < pts.length; i++) {
          pts[i].x = Math.max(-2.45, Math.min(2.45, pts[i].x + acc[i].x * 0.1));
          pts[i].y = Math.max(-1.55, Math.min(1.55, pts[i].y + acc[i].y * 0.1));
          nrm += Math.hypot(acc[i].x, acc[i].y);
        }
        hist.push(nrm / pts.length);
      }
      snaps.push(clonePts(pts));
    }
    return { snaps, hist };
  }
  function bind(S, id) {
    S.sim.tag = id;
    S.sim.ch4 = 1;
    global.__CH4_S = S;
    global.__CH4_ID = id;
  }
  function padBox(S, extra) {
    const t = 28, b = 32, l = 18, r = 16;
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
    ctx.font = on ? "bold 13px sans-serif" : "12px sans-serif";
    ctx.fillStyle = on ? T.c5 : T.tx;
    ctx.textAlign = "left";
    ctx.fillText(text, 18, 20);
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
   * 1. 粒子量子化
   * ============================================================ */
  OP.particle_quantization = {
    init(S) {
      const rng = rngFn(11);
      const xs = [];
      for (let i = 0; i < 80; i++) {
        xs.push(rng() < MIX.w ? MIX.m1 + MIX.s1 * randn(rng) : MIX.m2 + MIX.s2 * randn(rng));
      }
      S.sim = { rng, xs, kde: [], l2: 0, Mshow: 8 };
      bind(S, "particle_quantization");
    },
    tick(S) {
      const { ph, e } = phof(S);
      const h = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const M = ph === 0 ? 0 : ph === 1 ? 10 : 52;
      S.sim.Mshow = M;
      const xs = S.sim.xs.slice(0, M);
      // L2(KDE, 真密度)
      let l2 = 0;
      const N = 64;
      for (let i = 0; i <= N; i++) {
        const x = -3 + 6 * i / N;
        const { q } = kde1d(xs, x, h);
        const d = q - mixDens(x);
        l2 += d * d;
      }
      S.sim.l2 = l2 / (N + 1);
      S.sim.h = h;
      S.metrics.M = M;
      S.metrics.核宽 = h;
      S.metrics.L2误差 = S.sim.l2;
      S.metrics.弱收敛 = ph >= 2 ? "更贴真密度" : "欠采样";
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const B = padBox(S, { r: 118, b: 8 });
      const xmin = -3, xmax = 3;
      const X = (x) => B.x0 + (x - xmin) / (xmax - xmin) * (B.x1 - B.x0);
      const trueY = sample1d(120, xmin, xmax, mixDens);
      let ymax = 0.02;
      for (let i = 0; i < trueY.ys.length; i++) if (trueY.ys[i] > ymax) ymax = trueY.ys[i];
      const h = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const M = ph === 0 ? 0 : ph === 1 ? 10 : 52;
      const xs = S.sim.xs.slice(0, Math.max(1, M));
      const kde = sample1d(120, xmin, xmax, (x) => kde1d(xs, x, h).q);
      for (let i = 0; i < kde.ys.length; i++) if (kde.ys[i] > ymax) ymax = kde.ys[i];
      ymax *= 1.18;
      const Y = (y) => B.y1 - 28 - y / ymax * (B.y1 - B.y0 - 36);
      axes(ctx, B, T, "z", "密度");
      // 真密度
      const showTrue = ph === 0 || ph >= 2;
      if (showTrue) {
        area(ctx, trueY.xs, trueY.ys, X, Y, B.y1 - 28, rgba(T.c2, ph === 0 ? 0.28 : 0.12));
        curve(ctx, trueY.xs, trueY.ys, X, Y, T.c2, ph === 0 ? 2.6 : 1.4);
      }
      if (ph >= 1) {
        area(ctx, kde.xs, kde.ys, X, Y, B.y1 - 28, rgba(T.c5, 0.16));
        curve(ctx, kde.xs, kde.ys, X, Y, T.c5, 2);
        xs.forEach((z) => {
          const px = X(z);
          ctx.strokeStyle = z < 0 ? T.c3 : T.c6;
          ctx.lineWidth = ph === 1 ? 2.2 : 1.4;
          ctx.beginPath();
          ctx.moveTo(px, B.y1 - 28);
          ctx.lineTo(px, Y(kde1d([z], z, Math.max(0.06, h * 0.25)).q * xs.length * 0.12 + 0.15));
          ctx.stroke();
          ctx.fillStyle = z < 0 ? T.c3 : T.c6;
          ctx.beginPath();
          ctx.arc(px, B.y1 - 28, ph === 3 ? 4.2 : 3.2, 0, TWO);
          ctx.fill();
        });
      }
      // 右侧说明
      const rx = B.x1 + 10;
      panel(ctx, rx, 30, 108, S.H - 64, T, true);
      legend(ctx, [
        { c: T.c2, lab: "真 Q 连续" },
        { c: T.c5, lab: "经验 KDE" },
        { c: T.c3, lab: "左峰粒子" },
        { c: T.c6, lab: "右峰粒子" },
      ], rx + 8, 50, T);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("Q=Σ δ/M", rx + 8, 122);
      const msgs = [
        "连续密度：参数族",
        "量子化成 M 个尖峰",
        "M↑ 弱收敛到原分布",
        "多峰：每峰一簇粒子",
      ];
      caption(ctx, S, T, msgs[ph], true);
      if (ph === 3) {
        ctx.strokeStyle = T.c3;
        ctx.strokeRect(X(-2.1), Y(ymax * 0.95), X(-0.2) - X(-2.1), 70);
        ctx.strokeStyle = T.c6;
        ctx.strokeRect(X(0.2), Y(ymax * 0.95), X(2.2) - X(0.2), 70);
        ctx.fillStyle = T.c3;
        ctx.font = "11px sans-serif";
        ctx.fillText("峰 1", X(-2.0), Y(ymax * 0.95) - 4);
        ctx.fillStyle = T.c6;
        ctx.fillText("峰 2", X(0.35), Y(ymax * 0.95) - 4);
      }
    },
  };

  /* ============================================================
   * 2. 狄拉克德尔塔
   * ============================================================ */
  OP.dirac_delta = {
    init(S) {
      S.sim = { z0: 0.35, integ: 1, inner: 0, f0: 0 };
      bind(S, "dirac_delta");
    },
    tick(S) {
      const { ph, e } = phof(S);
      const sp = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const hGoal = ph === 0 ? sp * 0.95 + 0.12 : ph === 1 ? 0.055 + 0.04 * sp : 0.08 + 0.05 * sp;
      S.sim.h = hGoal;
      const z0 = S.sim.z0;
      const f = (x) => Math.cos(1.2 * x) + 1.15;
      S.sim.f0 = f(z0);
      // 数值积分 ∫ k_h 与 ⟨k_h, f⟩
      let integ = 0, inner = 0;
      const N = 160, xmin = -3, xmax = 3, dx = (xmax - xmin) / N;
      for (let i = 0; i <= N; i++) {
        const x = xmin + i * dx;
        const k = gauss(x, z0, S.sim.h);
        integ += k * dx;
        inner += k * f(x) * dx;
      }
      S.sim.integ = integ;
      S.sim.inner = inner;
      S.metrics.核宽 = S.sim.h;
      S.metrics.积分 = integ;
      S.metrics.内积 = inner;
      S.metrics.f_zi = S.sim.f0;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const B = padBox(S, { r: 130 });
      const xmin = -3, xmax = 3;
      const sp = clamp(sl(S, "spread", 0.5), 0.1, 1.4);
      const h = ph === 0 ? sp * 0.95 + 0.12 : ph === 1 ? 0.055 + 0.04 * sp : 0.08 + 0.05 * sp;
      const z0 = S.sim.z0;
      const kfn = (x) => gauss(x, z0, h);
      const ffn = (x) => Math.cos(1.2 * x) + 1.15;
      const Ks = sample1d(140, xmin, xmax, kfn);
      const Fs = sample1d(140, xmin, xmax, ffn);
      let kmax = 0.01;
      for (let i = 0; i < Ks.ys.length; i++) if (Ks.ys[i] > kmax) kmax = Ks.ys[i];
      kmax *= 1.12;
      const X = (x) => B.x0 + (x - xmin) / (xmax - xmin) * (B.x1 - B.x0);
      const Yk = (y) => B.y1 - y / kmax * (B.y1 - B.y0 - 8);
      const Yf = (y) => B.y1 - (y / 2.4) * (B.y1 - B.y0 - 8);
      axes(ctx, B, T, "z", "");
      if (ph === 3) {
        curve(ctx, Fs.xs, Fs.ys, X, Yf, T.c3, 2);
        ctx.fillStyle = T.c3;
        ctx.font = "11px sans-serif";
        ctx.fillText("测试函数 f(z)", B.x0 + 8, B.y0 + 14);
      }
      area(ctx, Ks.xs, Ks.ys, X, Yk, B.y1, rgba(T.c5, ph === 2 ? 0.38 : 0.18));
      curve(ctx, Ks.xs, Ks.ys, X, Yk, T.c5, 2.2);
      // 针
      ctx.strokeStyle = T.c6;
      ctx.lineWidth = ph >= 1 ? 2.4 : 1.2;
      ctx.beginPath();
      ctx.moveTo(X(z0), B.y1);
      ctx.lineTo(X(z0), B.y0 + 6);
      ctx.stroke();
      ctx.fillStyle = T.c6;
      ctx.beginPath();
      ctx.arc(X(z0), B.y1, 5, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("zᵢ", X(z0) + 6, B.y1 - 8);
      if (ph === 2) {
        ctx.fillStyle = T.c5;
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("∫ kₕ = " + S.sim.integ.toFixed(3) + "  （保持 1）", B.x0 + 8, B.y0 + 16);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c6;
        ctx.beginPath();
        ctx.arc(X(z0), Yf(S.sim.f0), 6, 0, TWO);
        ctx.fill();
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("⟨δ,f⟩ = f(zᵢ) = " + S.sim.f0.toFixed(3), B.x0 + 8, B.y0 + 16);
        ctx.fillStyle = T.mu;
        ctx.fillText("⟨kₕ,f⟩ = " + S.sim.inner.toFixed(3) + "  → 逼近点取值", B.x0 + 8, B.y0 + 34);
      }
      const msgs = ["平滑核逐渐变窄", "极限变成一根针", "积分保持 1", "对测试函数只取点值"];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.c5, lab: "核 kₕ" },
        { c: T.c6, lab: "δ 支撑" },
        { c: T.c3, lab: "f(z)" },
      ], S.W - 126, 48, T);
    },
  };

  /* ============================================================
   * 3. 粒子常微分方程
   * ============================================================ */
  OP.particle_ode = {
    init(S) {
      const rng = rngFn(21);
      const pts = [];
      for (let i = 0; i < 7; i++) {
        pts.push({
          x: -2.1,
          y: -1.1 + i * 0.36,
          disc: [{ x: -2.1, y: -1.1 + i * 0.36 }],
          cont: [{ x: -2.1, y: -1.1 + i * 0.36 }],
        });
      }
      S.sim = { rng, pts, flip: 1, hops: 0 };
      bind(S, "particle_ode");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1.3);
      S.sim.flip = ph === 3 ? -1 : 1;
      const omega = (0.55 + 0.85 * uamp) * S.sim.flip;
      const phi = (z) => ({
        x: 0.55,
        y: omega * Math.sin(1.1 * z.x) - 0.25 * z.y,
      });
      const epsDisc = 0.42;
      S.sim._acc = (S.sim._acc || 0) + dt;
      const hop = S.sim._acc > 0.28;
      S.sim.pts.forEach((p) => {
        const fc = phi(p.cont[p.cont.length - 1]);
        const nc = {
          x: p.cont[p.cont.length - 1].x + fc.x * dt * 1.15,
          y: p.cont[p.cont.length - 1].y + fc.y * dt * 1.15,
        };
        if (nc.x > 2.4) {
          p.cont = [{ x: -2.1, y: p.y }];
          p.disc = [{ x: -2.1, y: p.y }];
          p.x = -2.1;
        } else {
          p.cont.push(nc);
          if (p.cont.length > 90) p.cont.shift();
        }
        if (hop) {
          const last = p.disc[p.disc.length - 1];
          const fd = phi(last);
          p.disc.push({ x: last.x + epsDisc * fd.x, y: last.y + epsDisc * fd.y });
          if (p.disc.length > 18) p.disc.shift();
        }
      });
      if (hop) {
        S.sim._acc = 0;
        S.sim.hops++;
      }
      S.metrics.控制强度 = uamp;
      S.metrics.ε离散 = 0.42;
      S.metrics.转向 = S.sim.flip < 0 ? "反向" : "正向";
      S.metrics.跳步 = S.sim.hops;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S, [-2.3, 2.5], [-1.7, 1.7], { r: 8 });
      axes(ctx, V, T, "τ 沿水平", "z");
      // φ 场
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1.3);
      const omega = (0.55 + 0.85 * uamp) * (ph === 3 ? -1 : 1);
      if (ph >= 1) {
        fieldArrows(ctx, V, T, (x, y) => ({ x: 0.55, y: omega * Math.sin(1.1 * x) - 0.25 * y }), rgba(T.c7, 0.55), 7, 5, 16, ph === 3 ? 1 : 0.55);
      }
      S.sim.pts.forEach((p, k) => {
        const col = [T.c2, T.c3, T.c4, T.c5, T.c6, T.c7, T.c2][k];
        if (ph !== 0) {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          p.cont.forEach((q, i) => {
            const px = V.X(q.x), py = V.Y(q.y);
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          });
          ctx.stroke();
        }
        if (ph === 0 || ph === 1) {
          ctx.strokeStyle = rgba(T.c6, 0.95);
          ctx.lineWidth = 2;
          ctx.beginPath();
          p.disc.forEach((q, i) => {
            const px = V.X(q.x), py = V.Y(q.y);
            if (i) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
          });
          ctx.stroke();
          p.disc.forEach((q) => {
            ctx.fillStyle = T.c6;
            ctx.beginPath();
            ctx.arc(V.X(q.x), V.Y(q.y), 3.2, 0, TWO);
            ctx.fill();
          });
        }
        const last = p.cont[p.cont.length - 1];
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(V.X(last.x), V.Y(last.y), 4.5, 0, TWO);
        ctx.fill();
      });
      const msgs = ["离散跳步 z←z+εφ", "ε→0 变成连续曲线", "多粒子并行积分", "φ 改方向，整族转向"];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.c6, lab: "欧拉折线" },
        { c: T.c2, lab: "连续轨迹" },
        { c: T.c7, lab: "φ 场" },
      ], S.W - 118, 42, T);
    },
  };

  /* ============================================================
   * 4. 蒙特卡洛期望
   * ============================================================ */
  OP.monte_carlo_expectation = {
    init(S) {
      const rng = rngFn(41);
      S.sim = { rng, pts: [], hits: 0, hist: [], histM: [], biasPts: [], biasEst: 0, trueSec: 1 };
      bind(S, "monte_carlo_expectation");
    },
    tick(S) {
      const { ph } = phof(S);
      const cap = Math.round(clamp(sl(S, "n", 120), 40, 280));
      const rng = S.sim.rng;
      if (ph <= 2) {
        if (S.sim.pts.length > cap) {
          S.sim.pts = [];
          S.sim.hits = 0;
        }
        const batch = ph === 0 ? 3 : 8;
        for (let k = 0; k < batch; k++) {
          const x = rng() * 2 - 1, y = rng() * 2 - 1;
          const hit = x * x + y * y <= 1;
          S.sim.pts.push({ x, y, hit });
          if (hit) S.sim.hits++;
        }
        const M = S.sim.pts.length;
        const est = M ? 4 * S.sim.hits / M : 0;
        S.sim.est = est;
        S.sim.err = Math.abs(est - PI);
        S.sim.theory = 1 / Math.sqrt(Math.max(1, M));
        push(S.sim.hist, S.sim.err, 80);
        push(S.sim.histM, M, 80);
        S.metrics.M = M;
        S.metrics.pi估 = est;
        S.metrics.绝对误差 = S.sim.err;
        S.metrics.理论1sqrtM = S.sim.theory;
      } else {
        // 截断采样估 E[z²]，真值=1（标准正态），截断 |z|<0.7 有偏
        if (S.sim.biasPts.length > cap) S.sim.biasPts = [];
        for (let k = 0; k < 6; k++) {
          let z = randn(rng);
          // 未覆盖尾部：拒绝 |z|>0.85
          if (Math.abs(z) > 0.85) z = (rng() * 1.6 - 0.8);
          S.sim.biasPts.push(z);
        }
        const M = S.sim.biasPts.length;
        let s = 0;
        for (let i = 0; i < M; i++) s += S.sim.biasPts[i] * S.sim.biasPts[i];
        S.sim.biasEst = s / M;
        S.metrics.M = M;
        S.metrics.E截断z2 = S.sim.biasEst;
        S.metrics.真值 = 1;
        S.metrics.偏差 = S.sim.biasEst - 1;
      }
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const msgs = ["随机撒点估 π", "M 增大，估计更稳", "误差 ~ 1/√M", "尾部未覆盖 → 有偏"];
      caption(ctx, S, T, msgs[ph], true);
      if (ph <= 2) {
        const side = Math.min(S.W * 0.46, S.H - 78);
        const x0 = 22, y0 = 34;
        ctx.strokeStyle = T.line;
        ctx.strokeRect(x0, y0, side, side);
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x0 + side / 2, y0 + side / 2, side / 2, 0, TWO);
        ctx.stroke();
        const pts = S.sim.pts;
        const start = Math.max(0, pts.length - 220);
        for (let i = start; i < pts.length; i++) {
          const p = pts[i];
          ctx.fillStyle = p.hit ? T.c3 : T.c6;
          ctx.beginPath();
          ctx.arc(x0 + (p.x + 1) / 2 * side, y0 + (1 - p.y) / 2 * side, i > pts.length - 10 ? 4.5 : 2.1, 0, TWO);
          ctx.fill();
        }
        // 右：误差曲线
        const rx = x0 + side + 16;
        const rw = S.W - rx - 16;
        panel(ctx, rx, 34, rw, S.H - 72, T, ph === 2);
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("π ≈ " + (S.sim.est || 0).toFixed(4), rx + 10, 56);
        ctx.fillStyle = T.mu;
        ctx.fillText("真值 3.14159", rx + 10, 74);
        spark(ctx, S.sim.hist, rx + 10, 96, rw - 20, 70, T.c6, T);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("绝对误差轨迹", rx + 10, 90);
        // 1/sqrt(M) 对照柱
        const err = S.sim.err || 0;
        const th = S.sim.theory || 0.1;
        const H = 70, by = S.H - 90;
        ctx.fillStyle = T.c6;
        ctx.fillRect(rx + 18, by - Math.min(H, err / 0.4 * H), 22, Math.min(H, err / 0.4 * H));
        ctx.fillStyle = T.c2;
        ctx.fillRect(rx + 52, by - Math.min(H, th / 0.4 * H), 22, Math.min(H, th / 0.4 * H));
        ctx.fillStyle = T.mu;
        ctx.fillText("误差", rx + 16, by + 14);
        ctx.fillText("1/√M", rx + 50, by + 14);
      } else {
        const B = padBox(S, { t: 8 });
        const xmin = -3, xmax = 3;
        const X = (x) => B.x0 + (x - xmin) / 6 * (B.x1 - B.x0);
        const trueN = sample1d(120, xmin, xmax, (x) => gauss(x, 0, 1));
        const ymax = 0.48;
        const Y = (y) => B.y1 - y / ymax * (B.y1 - B.y0 - 10);
        axes(ctx, B, T, "z", "密度");
        area(ctx, trueN.xs, trueN.ys, X, Y, B.y1, rgba(T.c2, 0.2));
        curve(ctx, trueN.xs, trueN.ys, X, Y, T.c2, 2);
        // 截断窗
        ctx.fillStyle = rgba(T.c6, 0.12);
        ctx.fillRect(X(-0.85), B.y0, X(0.85) - X(-0.85), B.y1 - B.y0);
        ctx.strokeStyle = T.c6;
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(X(-0.85), B.y0, X(0.85) - X(-0.85), B.y1 - B.y0);
        ctx.setLineDash([]);
        (S.sim.biasPts || []).slice(-80).forEach((z) => {
          ctx.fillStyle = T.c5;
          ctx.beginPath();
          ctx.arc(X(clamp(z, -2.9, 2.9)), B.y1 - 6, 3, 0, TWO);
          ctx.fill();
        });
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
      S.sim = { rng, pts: makeCloud(rng, 22, -0.2, 0, 0.55, 0.45), osc: 0 };
      bind(S, "control_affine_perturbation");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const sig = clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      S.sim.sig = sig;
      // u：旋转 + 轻度收缩，强度随 sig（噪声/增益）
      const amp = 0.35 + sig * 1.4;
      let energy = 0, nrm = 0;
      S.sim.pts.forEach((p) => {
        const P = post2d(p.x, p.y);
        const ux = -amp * p.y - 0.15 * p.x;
        const uy = amp * p.x - 0.15 * p.y;
        const phx = P.sx + ux, phy = P.sy + uy;
        energy += 0.5 * (ux * ux + uy * uy);
        nrm += hypot(phx, phy);
        if (ph >= 2) {
          p.x += phx * dt * 0.55;
          p.y += phy * dt * 0.55;
        } else if (ph === 0) {
          p.x += P.sx * dt * 0.35;
          p.y += P.sy * dt * 0.35;
        } else {
          p.x += ux * dt * 0.4;
          p.y += uy * dt * 0.4;
        }
        p.x = clamp(p.x, -2.4, 2.4);
        p.y = clamp(p.y, -1.6, 1.6);
      });
      if (ph === 3) {
        // 过冲检测：径向速度
        S.sim.osc = S.sim.pts.reduce((s, p) => s + p.x * (-amp * p.y) + p.y * (amp * p.x), 0) / S.sim.pts.length;
      }
      if (S.frame % 180 === 0) {
        S.sim.pts = makeCloud(S.sim.rng, 22, -0.2, 0, 0.55, 0.45);
      }
      S.metrics.噪声 = sig;
      S.metrics.控制能 = energy / S.sim.pts.length;
      S.metrics.φ范数 = nrm / S.sim.pts.length;
      S.metrics.过冲指示 = S.sim.osc || 0;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S);
      const sig = S.sim.sig || 0.35;
      const amp = 0.35 + sig * 1.4;
      heat2d(ctx, V, T, T.c6, 22, 13);
      axes(ctx, V, T, "z₁", "z₂");
      const scP = (x, y) => {
        const P = post2d(x, y);
        return { x: P.sx, y: P.sy };
      };
      const scU = (x, y) => ({ x: -amp * y - 0.15 * x, y: amp * x - 0.15 * y });
      const scF = (x, y) => {
        const a = scP(x, y), b = scU(x, y);
        return { x: a.x + b.x, y: a.y + b.y };
      };
      if (ph === 0) fieldArrows(ctx, V, T, scP, rgba(T.mu, 0.95), 8, 5, 14);
      if (ph === 1) fieldArrows(ctx, V, T, scU, T.c6, 8, 5, 14);
      if (ph === 2) fieldArrows(ctx, V, T, scF, T.c5, 8, 5, 14);
      if (ph === 3) {
        fieldArrows(ctx, V, T, scP, rgba(T.mu, 0.35), 6, 4, 10);
        fieldArrows(ctx, V, T, scU, rgba(T.c6, 0.7), 6, 4, 10);
        fieldArrows(ctx, V, T, scF, T.c5, 8, 5, 16);
      }
      dots(ctx, S.sim.pts, V, T.c2, 4);
      const msgs = ["后验得分 ∇log P（灰）", "控制 u（红）", "合成 φ = 得分 + u", "调 u：过冲 / 振荡"];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.mu, lab: "∇log P" },
        { c: T.c6, lab: "u(z)" },
        { c: T.c5, lab: "φ 合成" },
        { c: T.c2, lab: "粒子" },
      ], S.W - 118, 42, T);
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
      const uamp = clamp(sl(S, "uamp", 0.4)5, 0, 1.3);
      const Tlist = [0.35, 0.35, 1.2, 1.2];
      const Ulist = [0.25, uamp, uamp, uamp];
      const Tmax = Tlist[ph];
      const u = Ulist[ph];
      const key = ph + ":" + u.toFixed(2) + ":" + Tmax.toFixed(2);
      if (S.sim.lastKey !== key) {
        S.sim.lastKey = key;
        S.sim.roll = ocRollout(u, Tmax, 40);
      }
      const r = S.sim.roll;
      const F = r.kl + r.energy;
      push(S.sim.hist, F, 60);
      S.sim.uamp = uamp;
      S.sim.Tmax = Tmax;
      S.metrics.时域T = Tmax;
      S.metrics.终端KL = r.kl;
      S.metrics.控制能 = r.energy;
      S.metrics.总代价F = F;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const r = S.sim.roll || { xs: [], kl: 0, energy: 0, means: [] };
      const B = padBox(S, { r: 150 });
      const xmin = -3, xmax = 3;
      const X = (x) => B.x0 + (x - xmin) / 6 * (B.x1 - B.x0);
      const trueY = sample1d(100, xmin, xmax, mixDens);
      const kde = sample1d(100, xmin, xmax, (x) => kde1d(r.xs, x, 0.32).q);
      let ymax = 0.02;
      trueY.ys.forEach((v) => { if (v > ymax) ymax = v; });
      kde.ys.forEach((v) => { if (v > ymax) ymax = v; });
      ymax *= 1.2;
      const Y = (y) => B.y1 - y / ymax * (B.y1 - B.y0);
      axes(ctx, B, T, "z", "Q_T / P");
      area(ctx, trueY.xs, trueY.ys, X, Y, B.y1, rgba(T.c6, 0.16));
      curve(ctx, trueY.xs, trueY.ys, X, Y, T.c6, 2);
      curve(ctx, kde.xs, kde.ys, X, Y, T.c2, 2.2);
      (r.xs || []).forEach((z) => {
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(X(z), B.y1 - 6, 3.2, 0, TWO);
        ctx.fill();
      });
      // 右柱：KL vs 能量
      const rx = B.x1 + 12;
      panel(ctx, rx, 32, 136, S.H - 68, T, ph >= 2);
      const mx = Math.max(0.15, r.kl, r.energy, r.kl + r.energy);
      const colH = S.H - 140;
      const bar = (lab, v, c, x) => {
        const h = v / mx * colH;
        ctx.fillStyle = c;
        ctx.fillRect(x, 56 + colH - h, 28, h);
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(lab, x + 14, 56 + colH + 14);
        ctx.fillStyle = T.tx;
        ctx.fillText(v.toFixed(2), x + 14, 50 + colH - h);
      };
      bar("KL", r.kl, T.c6, rx + 12);
      bar("能量", r.energy, T.c5, rx + 52);
      bar("F", r.kl + r.energy, T.c3, rx + 92);
      ctx.textAlign = "left";
      const msgs = [
        "短 T：来不及靠近，终端 KL 大",
        "加大控制：KL 降、能量升",
        "折中出现（F=KL+能量）",
        "T 固定时的最优权衡",
      ];
      caption(ctx, S, T, msgs[ph], true);
      spark(ctx, S.sim.hist, rx + 10, S.H - 86, 116, 28, T.c3, T);
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
      const uamp = clamp(sl(S, "uamp", 0.4)5, 0, 1.3);
      if (Math.abs(uamp - S.sim.lastU) > 0.04 || !S.sim.sweeps.length) {
        S.sim.lastU = uamp;
        const Ts = [0.25, 0.6, 1.2, 2.4, 4.0];
        S.sim.sweeps = Ts.map((Tm) => {
          const r = ocRollout(uamp, Tm, 36);
          return { T: Tm, kl: r.kl, energy: r.energy, xs: r.xs };
        });
      }
      const { ph } = phof(S);
      const idx = ph === 3 ? S.sim.sweeps.length - 1 : Math.min(S.sim.sweeps.length - 1, ph + 1);
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
      if (ph === 3) {
        ctx.fillStyle = T.c3;
        ctx.font = "11px sans-serif";
        ctx.fillText("有限时域：双目标  F=KL_T + ∫u²/2", 28, S.H * 0.68);
        ctx.fillText("无穷时域：假设 KL_∞=0，只剩 ∫_0^∞ u²/2", 28, S.H * 0.68 + 16);
      }
    },
  };

  /* ============================================================
   * 8. 无穷时域哈密顿量
   * ============================================================ */
  OP.hamiltonian_infinite_horizon = {
    init(S) {
      const rng = rngFn(81);
      S.sim = { rng, z0: 0.7, pts: makeCloud(rng, 18, -0.4, 0, 0.7, 0.5) };
      bind(S, "hamiltonian_infinite_horizon");
    },
    tick(S) {
      const uamp = clamp(sl(S, "uamp", 0.4)5, 0, 1.3);
      const z0 = 0.55 + 0.4 * Math.sin(S.t * 0.35);
      S.sim.z0 = z0;
      const scQ = kdeScore2d(S.sim.pts, z0, 0, 0.45);
      const scP = post2d(z0, 0);
      // 约化 H(u)= 1/2 u² + u·score_Q   （驻点 u*=-score_Q）
      const sQ = scQ.sx;
      S.sim.sQ = sQ;
      S.sim.sP = scP.sx;
      S.sim.uStar = -sQ;
      S.sim.uTrial = lerp(-2.2, 2.2, (uamp / 1.3));
      const H = (u) => 0.5 * u * u + u * sQ;
      S.sim.Hstar = H(S.sim.uStar);
      S.sim.Htrial = H(S.sim.uTrial);
      S.sim.phi = scP.sx + S.sim.uStar;
      S.metrics.score_Q = sQ;
      S.metrics.u星 = S.sim.uStar;
      S.metrics.H星 = S.sim.Hstar;
      S.metrics.φ净 = S.sim.phi;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const left = { x0: 24, y0: 36, x1: S.W * 0.5 - 8, y1: S.H - 36 };
      const sQ = S.sim.sQ || 0;
      const H = (u) => 0.5 * u * u + u * sQ;
      const us = linspace(-2.4, 2.4, 80);
      const Hs = us.map(H);
      let hmn = Infinity, hmx = -Infinity;
      Hs.forEach((v) => { if (v < hmn) hmn = v; if (v > hmx) hmx = v; });
      const X = (u) => left.x0 + (u + 2.4) / 4.8 * (left.x1 - left.x0);
      const Y = (h) => left.y1 - (h - hmn) / (hmx - hmn || 1) * (left.y1 - left.y0 - 8);
      panel(ctx, left.x0 - 6, left.y0 - 8, left.x1 - left.x0 + 12, left.y1 - left.y0 + 16, T, ph <= 2);
      ctx.strokeStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(left.x0, Y(0));
      ctx.lineTo(left.x1, Y(0));
      ctx.stroke();
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      us.forEach((u, i) => {
        const px = X(u), py = Y(Hs[i]);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      });
      ctx.stroke();
      // 约束线性项
      if (ph >= 1) {
        ctx.strokeStyle = T.c7;
        ctx.setLineDash([5, 3]);
        ctx.beginPath();
        us.forEach((u, i) => {
          const v = u * sQ;
          const px = X(u), py = Y(v);
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ph >= 2) {
        ctx.fillStyle = T.c6;
        ctx.beginPath();
        ctx.arc(X(S.sim.uStar), Y(S.sim.Hstar), 6, 0, TWO);
        ctx.fill();
        ctx.fillStyle = T.c6;
        ctx.font = "11px sans-serif";
        ctx.fillText("u* = −∇log Q", X(S.sim.uStar) + 8, Y(S.sim.Hstar) - 6);
      }
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(X(S.sim.uTrial), Y(S.sim.Htrial), 5, 0, TWO);
      ctx.fill();
      // 右：场（独立坐标，避免 view2d 闭包仍用旧 x0）
      const VR = {
        x0: S.W * 0.52, y0: 36, x1: S.W - 16, y1: S.H - 36,
        xr: [-2.4, 2.4], yr: [-1.6, 1.6],
      };
      VR.w = VR.x1 - VR.x0;
      VR.h = VR.y1 - VR.y0;
      VR.X = (x) => VR.x0 + (x - VR.xr[0]) / (VR.xr[1] - VR.xr[0]) * VR.w;
      VR.Y = (y) => VR.y1 - (y - VR.yr[0]) / (VR.yr[1] - VR.yr[0]) * VR.h;
      heat2d(ctx, VR, T, T.c6, 16, 10);
      if (ph === 3) {
        fieldArrows(ctx, VR, T, (x, y) => {
          const P = post2d(x, y);
          const Q = kdeScore2d(S.sim.pts, x, y, 0.5);
          return { x: P.sx - Q.sx, y: P.sy - Q.sy };
        }, T.c5, 7, 5, 16);
        ctx.fillStyle = T.c5;
        ctx.font = "11px sans-serif";
        ctx.fillText("φ = ∇log P − ∇log Q", VR.x0 + 8, VR.y0 + 14);
      } else {
        dots(ctx, S.sim.pts, VR, T.c2, 3.5);
      }
      const msgs = [
        "H 作为 u 的二次函数",
        "加上连续性约束的线性定价",
        "极值条件得到 u*",
        "代回 φ = ∇log P − ∇log Q",
      ];
      caption(ctx, S, T, msgs[ph], true);
    },
  };

  /* ============================================================
   * 9. 伴随态  λ=1/Q
   * ============================================================ */
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
      const B = padBox(S, { r: 8, b: 4 });
      const xmin = -2.6, xmax = 2.6;
      const X = (x) => B.x0 + (x - xmin) / (xmax - xmin) * (B.x1 - B.x0);
      const m = 0;
      const w = clamp(sl(S, "uamp", 1), 0.2, 2);
      const s = 0.22 + 0.38 / Math.max(0.25, w); /* 终端权重大 → Q 更尖、λ 尾部更高 */
      S.sim.s = s;
      const Q = (x) => gauss(x, m, s);
      const lam = (x) => w / (Q(x) + 0.05);
      const qs = sample1d(120, xmin, xmax, Q);
      const ls = sample1d(120, xmin, xmax, lam);
      let qmx = 0.01;
      qs.ys.forEach((v) => { if (v > qmx) qmx = v; });
      const lmx = 8 + 18 * w; /* 固定随 w 变的纵轴，避免归一化把权重吃掉 */
      const Yq = (y) => B.y1 - 8 - y / (qmx * 1.15) * (B.y1 - B.y0 - 20);
      const Yl = (y) => B.y1 - 8 - y / (lmx * 1.15) * (B.y1 - B.y0 - 20);
      axes(ctx, B, T, "z", "");
      if (ph === 0) {
        // λ(t) 水平
        const ts = linspace(0, 1, 40);
        ctx.strokeStyle = T.c7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ts.forEach((t, i) => {
          const px = B.x0 + t * (B.x1 - B.x0);
          const py = B.y0 + 40 + 8 * Math.sin(0.2); // 几乎平
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        });
        ctx.stroke();
        ctx.fillStyle = T.c7;
        ctx.font = "12px sans-serif";
        ctx.fillText("λ̇ = −∂H/∂Q = 0  →  λ 不随时间变", B.x0 + 8, B.y0 + 18);
      }
      area(ctx, qs.xs, qs.ys, X, Yq, B.y1 - 8, rgba(T.c2, ph === 0 ? 0.08 : 0.22));
      curve(ctx, qs.xs, qs.ys, X, Yq, T.c2, 2);
      if (ph >= 2) {
        curve(ctx, ls.xs, ls.ys, X, Yl, T.c6, 2.2);
        ctx.fillStyle = T.c6;
        ctx.font = "11px sans-serif";
        ctx.fillText("λ = 1/Q  （密度低处定价更高）", B.x0 + 8, B.y0 + 16);
      }
      if (ph === 1) {
        ctx.strokeStyle = T.c5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(X(2.15), Yq(Q(2.15)));
        ctx.lineTo(X(2.15), Yl(lam(2.15)));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("终端 KL 变分  配平 λ", X(0.2), B.y0 + 18);
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(X(2.15), Yq(Q(2.15)), 5, 0, TWO);
        ctx.fill();
      }
      if (ph === 3) {
        for (let i = 0; i < 9; i++) {
          const x = -2.1 + i * 0.52;
          const sc = -(x - m) / (s * s); // ∇log Q
          arrow(ctx, X(x), Yq(Q(x)), -sc * 16, 0, T.c5, 1.6);
        }
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("驻点：u* = −∇log Q = −∇Q / Q", B.x0 + 8, B.y0 + 34);
      }
      const bh = 24 + 88 * ((w - 0.2) / 1.8);
      ctx.fillStyle = rgba(T.c5, 0.85);
      ctx.fillRect(B.x1 - 20, B.y1 - bh, 12, bh);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("w=" + w.toFixed(2), B.x1 - 48, B.y1 - bh - 6);
      legend(ctx, [
        { c: T.c2, lab: "Q(z)" },
        { c: T.c6, lab: "λ=w/Q" },
        { c: T.c5, lab: "−∇log Q" },
      ], S.W - 120, 42, T);
      const msgs = ["λ 随时间不变", "用终端 KL 变分配平", "得到 λ=1/Q", "代入驻点出现 −∇log Q"];
      caption(ctx, S, T, msgs[ph], true);
    },
  };

  /* ============================================================
   * 10. 最优控制律  u* = −∇log Q
   * ============================================================ */
  OP.optimal_control_law = {
    init(S) {
      const rng = rngFn(101);
      S.sim = { rng, pts: makeCloud(rng, 26, -0.15, 0.05, 0.62, 0.48), eq: false };
      bind(S, "optimal_control_law");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const sig = clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      const h = 0.28 + 0.5 * sig;
      S.sim.h = h;
      let nU = 0, nPhi = 0, nQ = 0;
      const acc = rkhs(S.sim.pts, h); // 用 RKHS 近似 −∇log Q 的可运行版；同时算显式 KDE 得分
      S.sim.pts.forEach((p, i) => {
        const Q = kdeScore2d(S.sim.pts, p.x, p.y, h);
        const P = post2d(p.x, p.y);
        p.ux = -Q.sx;
        p.uy = -Q.sy;
        p.qx = Q.sx;
        p.qy = Q.sy;
        p.px = P.sx;
        p.py = P.sy;
        p.fx = P.sx - Q.sx;
        p.fy = P.sy - Q.sy;
        nU += hypot(p.ux, p.uy);
        nPhi += hypot(p.fx, p.fy);
        nQ += hypot(p.qx, p.qy);
        if (ph >= 2) {
          // 沿净场走；第 4 步时若已接近则几乎静止
          const k = ph === 3 ? 0.15 : 0.7;
          p.x += p.fx * dt * k;
          p.y += p.fy * dt * k;
          p.x = clamp(p.x, -2.4, 2.4);
          p.y = clamp(p.y, -1.55, 1.55);
        }
      });
      const n = S.sim.pts.length;
      S.metrics.σ = sig;
      S.metrics.u范数 = nU / n;
      S.metrics.scoreQ = nQ / n;
      S.metrics.净φ = nPhi / n;
      if (ph === 0 && S.frame % 200 === 0) {
        S.sim.pts = makeCloud(S.sim.rng, 26, -0.15, 0.05, 0.62, 0.48);
      }
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S);
      const h = 0.28 + 0.5 * clamp(sl(S, "sig", 0.35), 0.04, 0.95);
      heat2d(ctx, V, T, T.c6);
      axes(ctx, V, T, "z₁", "z₂");
      if (ph === 0) {
        fieldArrows(ctx, V, T, (x, y) => {
          const Q = kdeScore2d(S.sim.pts, x, y, h);
          return { x: Q.sx, y: Q.sy };
        }, T.c2, 8, 5, 16);
      }
      if (ph === 1) {
        fieldArrows(ctx, V, T, (x, y) => {
          const Q = kdeScore2d(S.sim.pts, x, y, S.sim.h);
          return { x: -Q.sx, y: -Q.sy };
        }, T.c6, 8, 5, 16);
      }
      if (ph === 2) {
        fieldArrows(ctx, V, T, (x, y) => {
          const P = post2d(x, y);
          const Q = kdeScore2d(S.sim.pts, x, y, S.sim.h);
          return { x: P.sx - Q.sx, y: P.sy - Q.sy };
        }, T.c5, 8, 5, 16);
      }
      if (ph === 3) {
        fieldArrows(ctx, V, T, (x, y) => {
          const P = post2d(x, y);
          const Q = kdeScore2d(S.sim.pts, x, y, S.sim.h);
          return { x: P.sx - Q.sx, y: P.sy - Q.sy };
        }, rgba(T.c5, 0.55), 8, 5, 10);
      }
      dots(ctx, S.sim.pts, V, T.c5, 4);
      const msgs = [
        "Q 的得分场 ∇log Q",
        "u* 正好反向",
        "净 φ = ∇log P − ∇log Q",
        "Q≈P 时净流趋于零",
      ];
      caption(ctx, S, T, msgs[ph], true);
      legend(ctx, [
        { c: T.c2, lab: "∇log Q" },
        { c: T.c6, lab: "u* = −∇log Q" },
        { c: T.c5, lab: "净 φ" },
      ], S.W - 140, 42, T);
    },
  };

  /* ============================================================
   * 11. InfO 微扰场
   * ============================================================ */
  OP.info_perturbation_field = {
    init(S) {
      const rng = rngFn(111);
      S.sim = { rng, pts: makeCloud(rng, 28, -0.05, 0.0, 0.42, 0.38), hist: [], step: 0 };
      bind(S, "info_perturbation_field");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      S.sim.v = v;
      if (ph === 0 && S.sim.step > 0 && S.frame % 90 === 0) {
        S.sim.pts = makeCloud(S.sim.rng, 28, -0.05, 0.0, 0.42, 0.38);
        S.sim.hist = [];
        S.sim.step = 0;
      }
      let nPhi = 0;
      if (ph >= 2) {
        const acc = rkhs(S.sim.pts, v);
        S.sim.pts.forEach((p, i) => {
          p.x += acc[i].x * dt * 0.85;
          p.y += acc[i].y * dt * 0.85;
          p.x = clamp(p.x, -2.4, 2.4);
          p.y = clamp(p.y, -1.55, 1.55);
          nPhi += hypot(acc[i].x, acc[i].y);
        });
        S.sim.step++;
      } else {
        S.sim.pts.forEach((p) => {
          const P = post2d(p.x, p.y);
          const Q = kdeScore2d(S.sim.pts, p.x, p.y, v);
          nPhi += hypot(P.sx - Q.sx, P.sy - Q.sy);
        });
      }
      const n = S.sim.pts.length;
      const { L, R } = occModes(S.sim.pts);
      push(S.sim.hist, nPhi / n, 70);
      S.metrics.核带宽 = v;
      S.metrics.φ范数 = nPhi / n;
      S.metrics.左峰粒子 = L;
      S.metrics.右峰粒子 = R;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const V = view2d(S, [-2.5, 2.5], [-1.65, 1.65], { r: 120 });
      heat2d(ctx, V, T, T.c6, 24, 14);
      axes(ctx, V, T, "z₁", "z₂");
      if (ph === 0) {
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("双峰后验 P(z|x)", V.x0 + 8, V.y0 + 16);
      }
      if (ph >= 1) {
        dots(ctx, S.sim.pts, V, T.c2, ph === 1 ? 5 : 4);
        if (ph === 1) {
          ctx.fillStyle = T.c2;
          ctx.font = "12px sans-serif";
          ctx.fillText("单团 Q 粒子（尚未分开）", V.x0 + 8, V.y0 + 16);
        }
      }
      if (ph >= 2) {
        fieldArrows(ctx, V, T, (x, y) => {
          const P = post2d(x, y);
          const Q = kdeScore2d(S.sim.pts, x, y, S.sim.v);
          return { x: P.sx - Q.sx, y: P.sy - Q.sy };
        }, T.c5, 7, 5, ph === 3 ? 8 : 16);
      }
      spark(ctx, S.sim.hist, S.W - 126, 40, 108, 46, T.c5, T);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("‖φ‖ 下降", S.W - 126, 36);
      const msgs = ["双峰后验 P", "单团 Q 粒子", "场把一部分拽向另一峰", "对齐后箭头变短"];
      caption(ctx, S, T, msgs[ph], true);
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
      S.sim.sig = sig;
      // p(z)=N(0,1), p(x|z)=N(θ z, σ²), x 观测
      const th = S.sim.th, x = S.sim.xobs, s2 = sig * sig;
      // 在 z=0.6 处计算三支得分
      const z = 0.55;
      S.sim.z = z;
      S.sim.sprior = -z; // N(0,1)
      S.sim.slike = th * (x - th * z) / s2;
      S.sim.spost = S.sim.sprior + S.sim.slike;
      S.sim.spx = 0; // ∇_z log p(x) = 0
      S.metrics.σ = sig;
      S.metrics.先验得分 = S.sim.sprior;
      S.metrics.似然得分 = S.sim.slike;
      S.metrics.后验得分 = S.sim.spost;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const sig = S.sim.sig, th = S.sim.th, xobs = S.sim.xobs, s2 = sig * sig;
      const V = view2d(S, [-2.4, 2.4], [-1.6, 1.6]);
      axes(ctx, V, T, "z", "");
      const prior = (z) => ({ x: -z, y: 0 });
      const like = (z) => ({ x: th * (xobs - th * z) / s2, y: 0 });
      const post = (z) => {
        const a = prior(z), b = like(z);
        return { x: a.x + b.x, y: 0 };
      };
      // 1D 画在水平轴上的竖直偏移显示三种场
      const drawField = (fn, col, yoff, lab, on) => {
        ctx.globalAlpha = on ? 1 : 0.22;
        for (let i = 0; i < 11; i++) {
          const z = -2 + i * 0.4;
          const f = fn(z);
          const px = V.X(z), py = V.Y(0) + yoff;
          arrow(ctx, px, py, clamp(f.x * 12, -28, 28), 0, col, on ? 2 : 1);
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(px, py, 2.4, 0, TWO);
          ctx.fill();
        }
        ctx.fillStyle = col;
        ctx.font = "11px sans-serif";
        ctx.fillText(lab, V.x0 + 8, V.Y(0) + yoff - 10);
        ctx.globalAlpha = 1;
      };
      if (ph === 0) drawField(prior, T.c2, -48, "先验得分 ∇log P(z) = −z  （拉回原点）", true);
      else drawField(prior, T.c2, -48, "先验", ph === 2);
      if (ph === 1) drawField(like, T.c6, 8, "似然得分 ∇log p(x|z)  （拉向解释 x 的 z）", true);
      else if (ph >= 1) drawField(like, T.c6, 8, "似然", ph === 2);
      if (ph >= 2) drawField(post, T.c5, 64, "后验 = 先验 + 似然", true);
      if (ph === 3) {
        panel(ctx, S.W * 0.55, 36, S.W * 0.42, 84, T, true);
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("∇_z log p(x) = 0  （不出现）", S.W * 0.55 + 10, 58);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("边缘 p(x) 对隐变量 z 无梯度", S.W * 0.55 + 10, 78);
        ctx.fillText("实现：解析先验 + 自动微分似然", S.W * 0.55 + 10, 96);
      }
      // 观测标记
      ctx.fillStyle = T.c5;
      ctx.font = "11px sans-serif";
      ctx.fillText("x = " + xobs.toFixed(2) + "  似然峰 z≈x/θ=" + (xobs / th).toFixed(2), V.x0 + 8, V.y1 - 6);
      const msgs = ["先验得分拉回原点", "似然得分拉向能解释 x 的 z", "相加得后验得分", "p(x) 项导数为零"];
      caption(ctx, S, T, msgs[ph], true);
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
    tick(S, dt) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      S.sim.v = v;
      const n = S.sim.pts.length;
      const ih = 1 / (v * v);
      const acc = new Array(n);
      let tScore = 0, tRep = 0;
      for (let i = 0; i < n; i++) {
        let sx = 0, sy = 0, rx = 0, ry = 0;
        for (let j = 0; j < n; j++) {
          const dx = S.sim.pts[i].x - S.sim.pts[j].x;
          const dy = S.sim.pts[i].y - S.sim.pts[j].y;
          const k = Math.exp(-0.5 * (dx * dx + dy * dy) * ih);
          const sj = post2d(S.sim.pts[j].x, S.sim.pts[j].y);
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
      if (ph >= 3) {
        S.sim.pts.forEach((p, i) => {
          p.x += acc[i].x * dt * 0.9;
          p.y += acc[i].y * dt * 0.9;
          p.x = clamp(p.x, -2.4, 2.4);
          p.y = clamp(p.y, -1.55, 1.55);
        });
      }
      if (ph === 0 && S.frame % 160 === 0) {
        S.sim.pts = makeCloud(S.sim.rng, 16, -0.2, 0, 0.55, 0.42);
      }
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
      const eUse = ph === 2 ? Math.min(0.12, eps) : ph === 3 ? Math.max(eps, 0.45) : eps;
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
      ctx.fillText("误差 " + (S.sim.err || 0).toFixed(3), S.W - 120, 96);
    },
  };

  /* ============================================================
   * 15. InfO 粒子更新（算法 4.1）
   * ============================================================ */
  OP.info_particle_update = {
    init(S) {
      const rng = rngFn(151);
      S.sim = {
        rng,
        pts: makeCloud(rng, 30, 0, 0, 0.85, 0.7),
        tstep: 0,
        histKL: [],
        histL: [],
        done: false,
      };
      bind(S, "info_particle_update");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const v = clamp(sl(S, "v", 0.7), 0.25, 1.9);
      if (ph === 0 && S.sim.tstep > 8) {
        S.sim.pts = makeCloud(S.sim.rng, 30, 0, 0, 0.85, 0.7);
        S.sim.tstep = 0;
        S.sim.histKL = [];
        S.sim.histL = [];
        S.sim.done = false;
      }
      if (ph >= 1 && ph < 3) {
        const acc = rkhs(S.sim.pts, v);
        S.sim.pts.forEach((p, i) => {
          p.x += acc[i].x * dt * 1.05;
          p.y += acc[i].y * dt * 1.05;
          p.x = clamp(p.x, -2.45, 2.45);
          p.y = clamp(p.y, -1.6, 1.6);
        });
        S.sim.tstep++;
      }
      if (ph === 3) S.sim.done = true;
      const { L, R } = occModes(S.sim.pts);
      // 用粒子对数密度差近似 KL：E[log Q - log P]
      let kl = 0;
      S.sim.pts.forEach((p) => {
        const Q = kdeScore2d(S.sim.pts, p.x, p.y, v);
        const P = post2d(p.x, p.y);
        kl += Math.log(Q.q + 1e-12) - Math.log(P.p + 1e-12);
      });
      kl /= S.sim.pts.length;
      push(S.sim.histKL, kl, 70);
      push(S.sim.histL, L, 70);
      S.metrics.核带宽 = v;
      S.metrics.步数 = S.sim.tstep;
      S.metrics.KL近似 = kl;
      S.metrics.右峰占比 = R / S.sim.pts.length;
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
      const rng = rngFn(161);
      // 观测 x，潜变量 z 粒子，解码 x̂ = θ z
      const x = 1.35;
      const zs = [];
      for (let i = 0; i < 24; i++) zs.push(0.4 + 0.55 * randn(rng));
      S.sim = { rng, x, zs, th: 0.35, histL: [], histTh: [], round: 0 };
      bind(S, "info_em_m_step");
    },
    tick(S, dt) {
      const { ph } = phof(S);
      const rate = clamp(sl(S, "rate", 1), 0.2, 2);
      const sig = 0.35;
      const x = S.sim.x;
      // E 步：粒子沿后验得分（固定 θ）
      if (ph === 0 || ph === 3) {
        S.sim.zs.forEach((z, i) => {
          const scPrior = -z;
          const scLike = S.sim.th * (x - S.sim.th * z) / (sig * sig);
          const phi = scPrior + scLike;
          S.sim.zs[i] = clamp(z + phi * dt * 0.8, -2.5, 2.5);
        });
      }
      // M 步：θ ← θ + η mean( (x-θz) z / σ² )
      if (ph === 1 || ph === 2) {
        let g = 0;
        S.sim.zs.forEach((z) => {
          g += (x - S.sim.th * z) * z / (sig * sig);
        });
        g /= S.sim.zs.length;
        S.sim.th += rate * 0.15 * g * dt * 8;
        S.sim.th = clamp(S.sim.th, -0.2, 2.8);
      }
      let recon = 0;
      S.sim.zs.forEach((z) => {
        const xh = S.sim.th * z;
        recon += (x - xh) * (x - xh);
      });
      recon /= S.sim.zs.length;
      let ll = 0;
      S.sim.zs.forEach((z) => {
        const xh = S.sim.th * z;
        ll += -0.5 * (x - xh) * (x - xh) / (sig * sig);
      });
      ll /= S.sim.zs.length;
      push(S.sim.histL, ll, 70);
      push(S.sim.histTh, S.sim.th, 70);
      S.metrics.θ = S.sim.th;
      S.metrics.重建MSE = recon;
      S.metrics.似然 = ll;
      S.metrics.提升速度 = rate;
    },
    draw(ctx, S, T) {
      const { ph } = phof(S);
      const rate = clamp(sl(S, "rate", 1), 0.2, 2);
      const idx = Math.min(S.sim.histTh.length - 1, Math.round((ph === 0 ? 2 : ph === 1 ? 12 : ph === 2 ? 28 : 46) * rate));
      const th = S.sim.histTh[idx];
      const x = S.sim.x, sig = 0.35;
      const prec = 1 + th * th / (sig * sig);
      const mz = (th * x / (sig * sig)) / prec;
      const sz = 1 / Math.sqrt(prec);
      const rng = rngFn(900 + ph * 17);
      const zs = [];
      for (let i = 0; i < 20; i++) zs.push(mz + sz * randn(rng));
      const mid = S.W * 0.5;
      panel(ctx, 16, 30, mid - 24, S.H - 66, T, ph === 0 || ph === 3);
      panel(ctx, mid, 30, S.W - mid - 16, S.H - 66, T, ph === 1 || ph === 2);
      const B = { x0: 44, y0: 48, x1: mid - 36, y1: S.H - 48 };
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
      ctx.lineWidth = 2;
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
          ctx.strokeStyle = rgba(T.c5, 0.45);
          ctx.beginPath();
          ctx.moveTo(X(z), Y(xh));
          ctx.lineTo(X(z), Y(x));
          ctx.stroke();
        }
        if (ph === 1) {
          arrow(ctx, X(z), Y(xh), 0, (Y(x) - Y(xh)) * 0.45, T.c6, 1.2);
        }
      });
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("z →  x̂=θz", B.x0 + 6, B.y0 + 14);
      spark(ctx, S.sim.histL.slice(0, idx + 1), mid + 16, 50, S.W - mid - 40, 70, T.c4, T);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("平均对数似然", mid + 16, 46);
      spark(ctx, S.sim.histTh.slice(0, idx + 1), mid + 16, 150, S.W - mid - 40, 70, T.c7, T);
      ctx.fillText("θ 轨迹", mid + 16, 146);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("θ = " + th.toFixed(3), mid + 16, 246);
      ctx.fillStyle = T.mu;
      ctx.fillText(ph <= 1 ? "E 步：粒子对齐后验" : "M 步：粒子平均似然梯度", mid + 16, 266);
      const msgs = [
        "粒子已对齐后验",
        "用粒子平均似然梯度",
        "θ 更新，解码更好",
        "下一轮 E 步后验更准",
      ];
      caption(ctx, S, T, msgs[ph], true);
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
        panel(ctx, p.x, p.y, gw - 8, gh - 12, T, i === ph || (ph === 3 && i === 3));
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
          S.sim.odes.forEach((path, k) => plot(path, box, T.c5, 1.8));
          if (ph === 3) {
            ctx.strokeStyle = T.c5;
            ctx.lineWidth = 2.4;
            ctx.strokeRect(p.x + 2, p.y + 2, gw - 12, gh - 16);
          }
        }
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

})(window);
