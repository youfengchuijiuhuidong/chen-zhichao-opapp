/* 第5章：镜像下降 / E²AG / KEMS 专属动画
 * 每个算子对应 op.steps 四拍，数值按定义式真实计算。
 * 仅注册 window.OP_ANIMS[id]，不改框架。
 */
(function (global) {
  "use strict";

  const OP = (global.OP_ANIMS = global.OP_ANIMS || {});
  const TWO = Math.PI * 2;
  const SQ3 = Math.sqrt(3);
  const FONT = global.OP_FONT_STACK || '"Noto Sans SC","PingFang SC",sans-serif';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => {
    const x = clamp(t, 0, 1);
    return x * x * (3 - 2 * x);
  };
  const hypot = Math.hypot;

  function rgba(c, a) {
    if (c == null) return "rgba(91,140,255," + a + ")";
    const s = String(c).trim();
    if (s[0] === "#") {
      let h = s.slice(1);
      if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
      const n = parseInt(h, 16);
      if (isNaN(n)) return "rgba(91,140,255," + a + ")";
      return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
    }
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) {
      const p = m[1].split(",").map((x) => parseFloat(x));
      return "rgba(" + p[0] + "," + p[1] + "," + p[2] + "," + a + ")";
    }
    return s;
  }
  function aa(T, c, dk, lt) {
    return rgba(c, T.dark ? dk : lt);
  }

  function softmax(z) {
    let m = -1e9;
    for (let i = 0; i < z.length; i++) if (z[i] > m) m = z[i];
    const e = new Array(z.length);
    let s = 0;
    for (let i = 0; i < z.length; i++) {
      e[i] = Math.exp(clamp(z[i] - m, -30, 30));
      s += e[i];
    }
    if (s < 1e-12) return z.map(() => 1 / z.length);
    return e.map((v) => v / s);
  }
  function floorSimplex(a, eps) {
    const e = eps == null ? 1e-6 : eps;
    const b = a.map((v) => Math.max(e, v));
    let s = 0;
    for (let i = 0; i < b.length; i++) s += b[i];
    return b.map((v) => v / s);
  }
  function logGamma(z) {
    if (z < 0.4) {
      const zz = Math.max(1e-4, z);
      return Math.log(Math.PI / Math.max(1e-8, Math.sin(Math.PI * zz))) - logGamma(1 - zz);
    }
    const x = Math.max(z, 1e-4);
    const iz = 1 / x;
    const iz2 = iz * iz;
    return (x - 0.5) * Math.log(x) - x + 0.5 * Math.log(TWO) + iz / 12 - iz2 * iz / 360 + iz2 * iz2 * iz / 1260;
  }
  function digamma(z) {
    let x = Math.max(z, 1e-4);
    let acc = 0;
    while (x < 8) {
      acc -= 1 / x;
      x += 1;
    }
    const iz = 1 / x;
    const iz2 = iz * iz;
    return acc + Math.log(x) - 0.5 * iz - iz2 / 12 + iz2 * iz2 / 120 - iz2 * iz2 * iz2 / 252;
  }
  function dirichletEntropy(th) {
    const K = th.length;
    let a0 = 0;
    let lg = 0;
    for (let i = 0; i < K; i++) {
      const t = Math.max(1e-3, th[i]);
      a0 += t;
      lg += logGamma(t);
    }
    const logB = lg - logGamma(a0);
    let s = 0;
    for (let i = 0; i < K; i++) s += (th[i] - 1) * digamma(th[i]);
    return logB + (a0 - K) * digamma(a0) - s;
  }
  function klGauss(mq, sq, mp, sp) {
    const a = Math.max(1e-6, sq);
    const b = Math.max(1e-6, sp);
    return Math.log(b / a) + (a * a + (mq - mp) * (mq - mp)) / (2 * b * b) - 0.5;
  }
  function gauss(x, m, s) {
    const z = (x - m) / Math.max(1e-6, s);
    return Math.exp(-0.5 * z * z) / (Math.max(1e-6, s) * Math.sqrt(TWO));
  }
  function rbf(a, b, h) {
    let d = 0;
    for (let i = 0; i < a.length; i++) {
      const t = a[i] - b[i];
      d += t * t;
    }
    const hh = Math.max(0.04, h);
    return Math.exp(-d / (2 * hh * hh));
  }
  function pushHist(arr, v, cap) {
    arr.push(v);
    while (arr.length > cap) arr.shift();
  }

  /* —— 单纯形：α∈Δ² 画到平面 —— */
  function simplexXY(a, b, c, cx, cy, sc) {
    /* 顶点 α₃ 朝上（画布 y 向下，故取负） */
    return {
      x: cx + (b - a) * sc,
      y: cy - (SQ3 / 2) * (2 * c - a - b) * sc * 0.92,
    };
  }
  function dualXY(z) {
    const m = (z[0] + z[1] + z[2]) / 3;
    const a = z[0] - m, b = z[1] - m, c = z[2] - m;
    return { x: (a - b) / Math.SQRT2, y: (a + b - 2 * c) / Math.sqrt(6) };
  }
  function drawSimplex(ctx, cx, cy, sc, T, labs) {
    const v = [
      simplexXY(1, 0, 0, cx, cy, sc),
      simplexXY(0, 1, 0, cx, cy, sc),
      simplexXY(0, 0, 1, cx, cy, sc),
    ];
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    ctx.lineTo(v[1].x, v[1].y);
    ctx.lineTo(v[2].x, v[2].y);
    ctx.closePath();
    ctx.fillStyle = aa(T, T.c2, 0.07, 0.1);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    const L = labs || ["α₁", "α₂", "α₃"];
    ctx.font = "11px sans-serif";
    ctx.fillStyle = T.mu;
    ctx.textAlign = "center";
    ctx.fillText(L[0], v[0].x - 6, v[0].y + 14);
    ctx.fillText(L[1], v[1].x + 6, v[1].y + 14);
    ctx.fillText(L[2], v[2].x, v[2].y - 8);
    ctx.textAlign = "left";
    return v;
  }

  function arrow(ctx, x, y, dx, dy, color, w) {
    const L = hypot(dx, dy);
    if (L < 1.2) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = w || 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    const a = Math.atan2(dy, dx);
    const s = 6;
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - s * Math.cos(a - 0.4), y + dy - s * Math.sin(a - 0.4));
    ctx.lineTo(x + dx - s * Math.cos(a + 0.4), y + dy - s * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  function banner(ctx, S, T) {
    const step = S.steps[S.phase] || "";
    ctx.fillStyle = aa(T, T.c5, 0.16, 0.28);
    ctx.fillRect(10, 16, Math.max(120, S.W * 0.7), 28);
    ctx.fillStyle = T.tx;
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText((S.phase + 1) + " / " + S.steps.length + "  " + step, 18, 35);
  }
  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r || 6, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function glow(ctx, x, y, r, col) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TWO); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
    ctx.restore();
  }
  function callout(ctx, x, y, text, T, col) {
    ctx.font = "11px " + FONT;
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.72)" : "rgba(255,255,255,0.82)";
    rr(ctx, x, y - 12, w, 16, 4); ctx.fill();
    ctx.strokeStyle = col || T.c5;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col || T.tx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 5, y - 4);
  }
  function legend(ctx, items, x, y, T) {
    if (!items || !items.length) return;
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    let maxW = 0;
    items.forEach((it) => {
      const txt = it.lab || it.l || it.t || "";
      const w = ctx.measureText(txt).width;
      if (w > maxW) maxW = w;
    });
    const boxW = maxW + 24;
    const boxH = items.length * 15 + 6;
    ctx.fillStyle = T.dark ? "rgba(11, 18, 32, 0.85)" : "rgba(255, 255, 255, 0.88)";
    rr(ctx, x - 5, y - 4, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    for (let i = 0; i < items.length; i++) {
      ctx.fillStyle = items[i].c;
      ctx.fillRect(x, y + i * 15, 10, 10);
      ctx.fillStyle = T.tx;
      ctx.fillText(items[i].lab || items[i].l || items[i].t || "", x + 14, y + i * 15 + 9);
    }
    ctx.restore();
  }
  function axisBox(ctx, x0, y0, x1, y1, T, xlab, ylab) {
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.fillStyle = T.mu;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "center";
    if (xlab) ctx.fillText(xlab, (x0 + x1) / 2, y1 + 12);
    ctx.save();
    if (ylab) {
      ctx.translate(x0 - 10, (y0 + y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(ylab, 0, 0);
    }
    ctx.restore();
    ctx.textAlign = "left";
  }
  function spark(ctx, hist, x, y, w, h, color, T, lo, hi) {
    ctx.fillStyle = aa(T, color, 0.1, 0.14);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = T.line;
    ctx.strokeRect(x, y, w, h);
    if (!hist || hist.length < 2) return;
    let mn = lo, mx = hi;
    if (mn == null) {
      mn = Infinity; mx = -Infinity;
      for (let i = 0; i < hist.length; i++) {
        if (hist[i] < mn) mn = hist[i];
        if (hist[i] > mx) mx = hist[i];
      }
    }
    const sp = mx - mn || 1;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const px = x + (w - 2) * i / Math.max(1, hist.length - 1);
      const py = y + h - 2 - (hist[i] - mn) / sp * (h - 4);
      if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }
  function heatCell(ctx, x, y, s, v, T, hi) {
    const t = clamp(v / (hi || 1), 0, 1);
    ctx.fillStyle = t < 1e-3 ? (T.dark ? "#121a2b" : "#e8edf7") : rgba(T.c2, 0.12 + 0.85 * t);
    ctx.fillRect(x, y, s - 2, s - 2);
  }
  function roundDot(ctx, x, y, r, c) {
    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TWO);
    ctx.fill();
  }
  function panel(ctx, x, y, w, h, T, on, col) {
    ctx.fillStyle = aa(T, on ? (col || T.c5) : T.line, on ? 0.16 : 0.06, on ? 0.22 : 0.1);
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = on ? (col || T.c5) : T.line;
    ctx.lineWidth = on ? 2 : 1;
    ctx.strokeRect(x, y, w, h);
  }
  function frac(S) {
    const t = S.t / 2.4;
    return t - Math.floor(t);
  }
  function sl(S, k, d) {
    const v = S.sliders ? S.sliders[k] : undefined;
    return v == null || v !== v ? d : +v;
  }
  function nv(v) {
    const x = +v;
    return x === x ? x : 0;
  }
  function sliderChips(ctx, S, T) {
    const sls = S.sliders || {};
    const keys = Object.keys(sls);
    if (!keys.length) return;
    ctx.font = "10px sans-serif";
    ctx.textAlign = "right";
    let y = 30;
    keys.forEach((k) => {
      const s = k + " " + nv(sls[k]).toFixed(2);
      const w = Math.max(52, ctx.measureText(s).width + 10);
      const x = S.W - 14 - w;
      ctx.fillStyle = aa(T, T.c4, 0.2, 0.28);
      ctx.fillRect(x, y, w, 15);
      ctx.fillStyle = T.tx;
      ctx.fillText(s, x + w - 5, y + 11);
      y += 17;
    });
    ctx.textAlign = "left";
  }

  /* 工艺小图：精馏五节点 */
  const NAMES = ["T进料", "P压力", "L回流", "Q再沸", "y组成"];
  const SHORT = ["T", "P", "L", "Q", "y"];
  const EDGES = [[0, 1], [0, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
  const AHAT = [
    [0, 1, 1, 0, 0],
    [1, 0, 0, 1, 1],
    [1, 0, 0, 1, 1],
    [0, 1, 1, 0, 1],
    [0, 1, 1, 1, 0],
  ];
  function nodePos(W, H) {
    const L = 22, R = W * 0.58, T = 58, B = H - 34;
    return [
      { x: L + 0.12 * (R - L), y: T + 0.16 * (B - T) },
      { x: L + 0.55 * (R - L), y: T + 0.10 * (B - T) },
      { x: L + 0.14 * (R - L), y: T + 0.68 * (B - T) },
      { x: L + 0.56 * (R - L), y: T + 0.62 * (B - T) },
      { x: L + 0.92 * (R - L), y: T + 0.38 * (B - T) },
    ];
  }
  function featAt(t, i) {
    return 0.5 + 0.45 * Math.sin(t * (0.65 + 0.18 * i) + i * 0.9);
  }
  function drawGraph(ctx, pos, F, T, opt) {
    opt = opt || {};
    const hi = opt.hi;
    const packets = opt.packets;
    EDGES.forEach(([i, j], e) => {
      const a = pos[i], b = pos[j];
      ctx.strokeStyle = opt.edgeOn && (i === hi || j === hi) ? T.c5 : T.line;
      ctx.lineWidth = opt.edgeOn && (i === hi || j === hi) ? 2.4 : 1.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (packets) {
        const u = (packets + e * 0.13) % 1;
        roundDot(ctx, lerp(a.x, b.x, u), lerp(a.y, b.y, u), 4.2, T.c5);
      }
    });
    pos.forEach((p, i) => {
      const r = 12 + 10 * (F[i] || 0);
      const on = hi === i;
      roundDot(ctx, p.x, p.y, r + (on ? 4 : 0), on ? T.c5 : T.c2);
      ctx.fillStyle = T.dark ? "#061018" : "#0b1220";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(SHORT[i], p.x, p.y + 4);
      ctx.fillStyle = T.tx;
      ctx.font = "10px sans-serif";
      ctx.fillText(NAMES[i], p.x, p.y + r + 12);
    });
    ctx.textAlign = "left";
  }
  function messFn(Fi, Fj, Eij, rate) {
    return rate * Eij * (0.7 * Fj + 0.3 * Fi);
  }
  function namOf(selfloop) {
    const n = 5;
    const A = AHAT.map((row, i) => row.map((v, j) => (i === j ? selfloop : v)));
    const deg = A.map((row) => row.reduce((s, v) => s + v, 0));
    const An = A.map((row, i) =>
      row.map((v, j) => (deg[i] > 1e-9 && deg[j] > 1e-9 ? v / Math.sqrt(deg[i] * deg[j]) : 0))
    );
    return { A, deg, An };
  }
  function mulVec(M, x) {
    return M.map((row) => {
      let s = 0;
      for (let j = 0; j < row.length; j++) s += row[j] * x[j];
      return s;
    });
  }
  function meanMat(Ms) {
    const n = Ms[0].length;
    const out = Array.from({ length: n }, () => Array(n).fill(0));
    for (let k = 0; k < Ms.length; k++) {
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] += Ms[k][i][j] / Ms.length;
    }
    return out;
  }

  /* RKHS 场：下降 L_ER 的方向（向高似然 + 核排斥） */
  function phiRKHS(pts, scores, h) {
    const n = pts.length, d = pts[0].length;
    const phi = Array.from({ length: n }, () => Array(d).fill(0));
    const hh = Math.max(0.08, h);
    const inv = 1 / (hh * hh);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const K = rbf(pts[i], pts[j], hh);
        for (let k = 0; k < d; k++) {
          phi[i][k] += (K * scores[j][k] + K * (pts[i][k] - pts[j][k]) * inv) / n;
        }
      }
    }
    return phi;
  }
  function projectTangent(a, v) {
    /* 单纯形切空间：减去均值，保持和为 0 */
    let m = 0;
    for (let i = 0; i < v.length; i++) m += v[i];
    m /= v.length;
    return v.map((x, i) => {
      /* 边界处若要穿出则截断 */
      const t = x - m;
      if (a[i] <= 1e-4 && t < 0) return 0;
      return t;
    });
  }
  function mirrorStep(a, phi, eps) {
    const z = a.map((v, i) => Math.log(Math.max(1e-8, v)) + eps * phi[i]);
    return softmax(z);
  }
  function bregmanEnt(a, at) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const x = Math.max(1e-8, a[i]);
      const y = Math.max(1e-8, at[i]);
      s += x * Math.log(x / y) - x + y;
    }
    return s;
  }
  function psiEnt(a) {
    let s = 0;
    for (let i = 0; i < a.length; i++) {
      const x = Math.max(1e-8, a[i]);
      s += x * Math.log(x) - x;
    }
    return s;
  }
  function klDisc(p, q) {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = Math.max(1e-8, p[i]);
      const b = Math.max(1e-8, q[i]);
      s += a * Math.log(a / b);
    }
    return s;
  }

  function scoreToward(a, tgt) {
    /* ∇_α log p ≈ 把行拉向目标结构（单纯形对数坐标差） */
    return a.map((v, i) => Math.log(Math.max(1e-6, tgt[i])) - Math.log(Math.max(1e-6, v)));
  }

  /* ============================================================
   * 1. MPNN 消息聚合  (5-1)
   * ============================================================ */
  OP.mpnn_message = {
    init(S) {
      S.sim = { pack: 0, Mi: [0, 0, 0], hist: [] };
    },
    tick(S, dt) {
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const F = SHORT.map((_, i) => featAt(S.t, i));
      const hi = 4;
      let m = 0;
      const parts = [];
      EDGES.forEach(([i, j]) => {
        if (i === hi || j === hi) {
          const nb = i === hi ? j : i;
          const v = messFn(F[hi], F[nb], 1, rate);
          parts.push(v);
          m += v;
        }
      });
      S.sim.F = F;
      S.sim.parts = parts;
      S.sim.Mi = m;
      S.sim.pack += dt * (0.35 + 0.5 * rate);
      pushHist(S.sim.hist, m, 70);
      S.metrics["‖M_y‖"] = m;
      S.metrics.邻居数 = parts.length;
      S.metrics.消息强度 = rate;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const pos = nodePos(S.W, S.H);
      const ph = S.phase;
      const F = S.sim.F || [0.5, 0.5, 0.5, 0.5, 0.5];
      const showP = ph >= 2;
      drawGraph(ctx, pos, F, T, {
        hi: ph >= 1 ? 4 : -1,
        edgeOn: ph >= 2,
        packets: showP ? S.sim.pack : 0,
      });
      const rx = S.W * 0.62, ry = 58, rw = S.W * 0.36, rh = S.H - 92;
      if (ph >= 2) {
        panel(ctx, rx, ry, rw, rh, T, ph === 3, T.c3);
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("中心 y 的消息 M_y", rx + 10, ry + 18);
        const parts = S.sim.parts || [];
        const mx = Math.max(0.2, nv(S.sim.Mi) || 0.2);
        parts.forEach((v, i) => {
          const y = ry + 36 + i * 28;
          ctx.fillStyle = T.c5;
          ctx.fillRect(rx + 12, y, (rw - 24) * clamp(v / mx, 0, 1), 14);
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText("Mess(F_y, F_nb" + i + ")", rx + 12, y - 2);
        });
        if (ph >= 3) {
          ctx.fillStyle = T.c3;
          const y = ry + rh - 48;
          ctx.fillRect(rx + 12, y, (rw - 24) * clamp(nv(S.sim.Mi) / (mx * 1.2), 0, 1), 18);
          ctx.fillStyle = T.tx;
          ctx.fillText("Σ → M_y = " + nv(S.sim.Mi).toFixed(3), rx + 12, y - 6);
        }
        spark(ctx, S.sim.hist, rx + 12, ry + rh - 22, rw - 24, 16, T.c3, T);
      } else if (ph === 1) {
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("选中中心 y：只向 N(y) 要消息", rx + 4, 80);
      }
      legend(ctx, [
        { c: T.c2, lab: "过程变量节点" },
        { c: T.c5, lab: ph >= 1 ? "中心 y / 邮件" : "未选中心" },
        { c: T.c3, lab: "聚合 M_i" },
      ], 18, S.H - 64, T);
    },
  };

  /* ============================================================
   * 2. MPNN 节点更新  (5-2)
   * ============================================================ */
  OP.mpnn_update = {
    init(S) {
      S.sim = { F: 0.35, M: 0.2, Fp: 0.35, raw: 0.28, hist: [] };
    },
    tick(S, dt) {
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const F = featAt(S.t, 4);
      const nb = featAt(S.t, 1) + featAt(S.t, 2) + featAt(S.t, 3);
      const M = rate * 0.35 * Math.tanh(nb);
      const mix = phBlend(S, 2);
      const raw = Math.tanh(0.55 * F + 0.9 * M);
      const Fp = (1 - mix) * F + mix * (0.35 * F + 0.65 * raw);
      S.sim.F = F; S.sim.M = M; S.sim.Fp = Fp; S.sim.raw = raw;
      pushHist(S.sim.hist, Fp, 70);
      S.metrics.F_y = F;
      S.metrics.M_y = M;
      S.metrics["F'_y"] = Fp;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const W = S.W, H = S.H;
      const boxes = [
        { lab: "F_y 自身", v: S.sim.F, c: T.c2, on: ph === 0, show: true },
        { lab: "收到 M_y", v: S.sim.M, c: T.c5, on: ph === 1, show: ph >= 1 },
        { lab: "Update 融合", v: S.sim.raw, c: T.c7, on: ph === 2, show: ph >= 2 },
        { lab: "F'_y 新特征", v: S.sim.Fp, c: T.c3, on: ph === 3, show: ph >= 3 },
      ];
      const bw = Math.min(120, (W - 80) / 4);
      const y = H * 0.38;
      boxes.forEach((b, i) => {
        const x = 28 + i * (bw + 22);
        if (!b.show) {
          ctx.strokeStyle = T.line;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x, y - 50, bw, 110);
          ctx.setLineDash([]);
          ctx.fillStyle = T.mu;
          ctx.font = "11px sans-serif";
          ctx.fillText(b.lab, x + 8, y - 32);
          if (i < 3) arrow(ctx, x + bw + 2, y, 16, 0, T.mu);
          return;
        }
        panel(ctx, x, y - 50, bw, 110, T, b.on, b.c);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText(b.lab, x + 8, y - 32);
        const h = 48 * clamp(Math.abs(nv(b.v)), 0, 1);
        ctx.fillStyle = b.c;
        ctx.fillRect(x + bw * 0.3, y + 40 - h, bw * 0.4, h);
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.fillText(nv(b.v).toFixed(2), x + 8, y + 52);
        if (i < 3) arrow(ctx, x + bw + 2, y, 16, 0, T.mu);
      });
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("F' = Update(F, M) = 0.35 F + 0.65 tanh(0.55 F + 0.9 M)", 28, 58);
      /* 节点颜色/位置改变 */
      const cx = W * 0.5, cy = H * 0.78;
      const shift = ph >= 3 ? 40 * (S.sim.Fp - S.sim.F) : 0;
      roundDot(ctx, cx + shift, cy, 16 + 10 * S.sim.Fp, ph >= 3 ? T.c3 : T.c2);
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(ph >= 3 ? "更新后 y" : "原节点 y", cx + shift, cy + 34);
      ctx.textAlign = "left";
      spark(ctx, S.sim.hist, W - 150, H - 70, 130, 28, T.c3, T);
    },
  };

  function phBlend(S, from) {
    if (S.phase < from) return 0;
    if (S.phase > from) return 1;
    return smooth(frac(S));
  }

  /* ============================================================
   * 3. 归一化邻接 NAM
   * ============================================================ */
  OP.nam_normalize = {
    init(S) { S.sim = { blend: 0 }; },
    tick(S) {
      const sl = S.sliders.selfloop != null ? S.sliders.selfloop : 1;
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const nam = namOf(sl);
      S.sim.nam = nam;
      S.sim.blend = phBlend(S, 2);
      const row = nam.An[1];
      const rs = row.reduce((a, b) => a + b, 0);
      S.metrics.自环 = sl;
      S.metrics.最大度 = Math.max.apply(null, nam.deg);
      S.metrics.A行和 = rs;
      S.metrics.进度 = S.sim.blend * rate;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const nam = S.sim.nam || namOf(1);
      const n = 5;
      const cell = Math.min(30, (S.W * 0.36) / n);
      const y0 = 58;
      const drawM = (M, x0, title, on) => {
        ctx.fillStyle = on ? T.c5 : T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText(title, x0, 50);
        for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
          heatCell(ctx, x0 + j * cell, y0 + i * cell, cell, M[i][j], T, title[0] === "Â" ? 1 : 0.7);
          if (M[i][j] > 0.02) {
            ctx.fillStyle = T.tx;
            ctx.font = "8px sans-serif";
            ctx.fillText(M[i][j] >= 0.995 ? "1" : M[i][j].toFixed(2), x0 + j * cell + 2, y0 + i * cell + 12);
          }
        }
        if (ph >= 3) {
          ctx.strokeStyle = T.c5;
          ctx.lineWidth = 2;
          ctx.strokeRect(x0, y0 + cell, n * cell - 2, cell - 2);
        }
      };
      drawM(nam.A, 16, "Â 二值+自环", ph === 0);
      if (ph <= 1) {
        const gx = S.W * 0.58, gy = 58, gw = S.W * 0.4, gh = S.H - 120;
        const pos = [
          { x: gx + 0.18 * gw, y: gy + 0.16 * gh },
          { x: gx + 0.55 * gw, y: gy + 0.12 * gh },
          { x: gx + 0.18 * gw, y: gy + 0.68 * gh },
          { x: gx + 0.55 * gw, y: gy + 0.64 * gh },
          { x: gx + 0.88 * gw, y: gy + 0.40 * gh },
        ];
        drawGraph(ctx, pos, [0.45, 0.5, 0.48, 0.52, 0.55], T, { hi: -1, edgeOn: true });
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText(sl(S, "selfloop", 1) > 0.5 ? "自环开：对角 = 1" : "自环关：对角 = 0", gx, gy - 4);
      }
      if (ph >= 1) {
        nam.deg.forEach((d, i) => {
          ctx.fillStyle = T.c5;
          ctx.fillRect(16 + n * cell + 6, y0 + i * cell + 4, 10, Math.min(cell - 6, d * 7));
          ctx.fillStyle = T.tx;
          ctx.font = "9px sans-serif";
          ctx.fillText(String(d.toFixed(0)), 16 + n * cell + 18, y0 + i * cell + 14);
        });
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.fillText("度 D", 16 + n * cell + 2, y0 - 4);
      }
      if (ph >= 2) {
        const mix = nam.A.map((row, i) => row.map((v, j) => lerp(v, nam.An[i][j], nv(S.sim.blend))));
        drawM(mix, 16 + n * cell + 40, "A=D^{-1/2}ÂD^{-1/2}", true);
      }
      if (ph >= 3) {
        const row = nam.An[1];
        const cx = S.W * 0.82, cy = S.H * 0.58, sc = Math.min(70, S.W * 0.12);
        drawSimplex(ctx, cx, cy, sc, T, ["1", "2", "3"]);
        const a = floorSimplex([row[0], row[1], Math.max(1e-4, 1 - row[0] - row[1])]);
        const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
        roundDot(ctx, p.x, p.y, 6, T.c5);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("第2行 → Δ 上的点", cx, cy + sc * 0.95);
        ctx.textAlign = "left";
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.fillText("行和 " + row.reduce((s, v) => s + v, 0).toFixed(2), cx - 40, cy + sc * 0.95 + 14);
      }
      legend(ctx, [
        { c: T.c2, lab: "矩阵元" },
        { c: T.c5, lab: "度 / 高亮行" },
      ], 16, S.H - 48, T);
    },
  };

  /* ============================================================
   * 4. 单纯形行因子化
   * ============================================================ */
  OP.simplex_factorization = {
    init(S) {
      const pts0 = [
        [0.82, 0.11, 0.07],
        [0.08, 0.18, 0.74],
        [0.62, 0.28, 0.10],
        [0.22, 0.55, 0.23],
        [0.40, 0.12, 0.48],
      ];
      S.sim = { pts0, pts: pts0.map((p) => p.slice()), hist: [] };
    },
    tick(S, dt) {
      const rate = sl(S, "rate", 1);
      const tgts = [
        [0.7, 0.2, 0.1],
        [0.15, 0.7, 0.15],
        [0.2, 0.15, 0.65],
        [0.45, 0.4, 0.15],
        [0.2, 0.5, 0.3],
      ];
      /* 暂停时 dt=0，仍按 rate 把行往目标插值，滑块立刻改柱宽/点位 */
      const go = S.phase >= 3 ? 1 : S.phase >= 2 ? 0.62 : 0.18;
      const mix = 1 - Math.exp(-0.72 * rate * go);
      S.sim.pts = (S.sim.pts0 || []).map((p, i) =>
        floorSimplex(p.map((v, k) => v + mix * (tgts[i][k] - v)))
      );
      if (S.phase >= 3 && dt > 0) {
        S.sim.pts = S.sim.pts.map((p, i) => {
          const g = p.map((v, k) => Math.log(tgts[i][k] + 1e-8) - Math.log(v + 1e-8));
          return mirrorStep(p, g, dt * 1.4 * rate);
        });
      }
      const rs = S.sim.pts.map((p) => p[0] + p[1] + p[2]);
      S.metrics.行和均值 = rs.reduce((a, b) => a + b, 0) / rs.length;
      S.metrics.KL到目标 = klDisc(S.sim.pts[1], tgts[1]);
      S.metrics.插值 = mix;
      pushHist(S.sim.hist, S.metrics.KL到目标, 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const n = 5, cell = Math.min(22, S.W * 0.04);
      const cols = [T.c2, T.c3, T.c5, T.c6, T.c7];
      if (ph === 0) {
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("邻接矩阵 A（五行 = 五个变量的邻居权重）", 18, 56);
        const cs = Math.min(36, (S.W * 0.42) / n);
        for (let i = 0; i < n; i++) {
          const a = S.sim.pts[i];
          const row = [a[0], a[1], a[2], 0.02, 0.02];
          const z = row.reduce((s, v) => s + v, 0);
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText(SHORT[i], 8, 86 + i * (cs + 4));
          for (let j = 0; j < n; j++) {
            heatCell(ctx, 28 + j * (cs + 3), 70 + i * (cs + 4), cs + 2, row[j] / z, T, 1);
          }
        }
      }
      if (ph >= 1) {
        S.sim.pts.forEach((a, i) => {
          const y = 58 + i * ((S.H - 90) / 5);
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText("α" + (i + 1), 16, y + 12);
          let x = 40;
          a.forEach((v, k) => {
            const w = v * (S.W * 0.34);
            ctx.fillStyle = cols[k];
            ctx.fillRect(x, y, w - 1, 16);
            x += w;
          });
        });
      }
      const cx = S.W * 0.74, cy = S.H * 0.58, sc = Math.min(110, S.W * 0.16);
      if (ph >= 2) {
        drawSimplex(ctx, cx, cy, sc, T);
        S.sim.pts.forEach((a, i) => {
          const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
          roundDot(ctx, p.x, p.y, ph >= 3 ? 6 : 5, cols[i]);
        });
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText(ph >= 3 ? "各行独立镜像更新" : "五行 → 五个单纯形点", cx - 70, 56);
      }
      spark(ctx, S.sim.hist, S.W - 150, S.H - 50, 130, 22, T.c6, T, 0, 1.2);
    },
  };

  /* ============================================================
   * 5. Dirichlet 熵泛函
   * ============================================================ */
  OP.dirichlet_entropy = {
    init(S) { S.sim = { hist: [] }; },
    tick(S) {
      const rate = sl(S, "rate", 1);
      const c0 = [0.7, 1.35, 0.85];
      /* 第0步：θ 靠近 1（平坦）；之后变尖。滑块仍能把平坦/尖锐拉开 */
      const peak = S.phase === 0 ? (0.45 + 0.55 * rate) : (1.6 + 2.4 * rate);
      const th = c0.map((v) => Math.max(0.35, v * peak));
      S.sim.th = th;
      S.sim.H = dirichletEntropy(th);
      S.sim.Hflat = dirichletEntropy([1, 1, 1]);
      pushHist(S.sim.hist, S.sim.H, 80);
      S.metrics.θ和 = th[0] + th[1] + th[2];
      S.metrics["H[Dir]"] = S.sim.H;
      S.metrics["H(均匀)"] = S.sim.Hflat;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const th = S.sim.th || [1, 1, 1];
      const cx = S.W * 0.32, cy = S.H * 0.6, sc = Math.min(120, S.W * 0.18);
      drawSimplex(ctx, cx, cy, sc, T);
      /* 密度云 */
      const a0 = th[0] + th[1] + th[2];
      let logB = 0;
      th.forEach((t) => { logB += logGamma(t); });
      logB -= logGamma(a0);
      const N = 18;
      let dmax = 1e-9;
      const grid = [];
      for (let i = 1; i < N; i++) {
        for (let j = 1; j < N - i; j++) {
          const a = i / N, b = j / N, c = 1 - a - b;
          let ld = -logB;
          ld += (th[0] - 1) * Math.log(a) + (th[1] - 1) * Math.log(b) + (th[2] - 1) * Math.log(c);
          const dens = Math.exp(clamp(ld, -12, 12));
          if (dens > dmax) dmax = dens;
          grid.push({ a, b, c, dens });
        }
      }
      grid.forEach((g) => {
        const p = simplexXY(g.a, g.b, g.c, cx, cy, sc);
        const t = g.dens / dmax;
        roundDot(ctx, p.x, p.y, 2.4 + 4.2 * t, rgba(t > 0.55 ? T.c5 : T.c2, 0.12 + 0.8 * t));
      });
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("Dir(θ) 密度  θ=[" + th.map((x) => x.toFixed(1)).join(",") + "]", 16, 56);

      /* 右：熵对浓度 */
      const x0 = S.W * 0.58, y0 = 58, x1 = S.W - 18, y1 = S.H * 0.62;
      axisBox(ctx, x0, y0, x1, y1, T, "浓度 c", "");
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.fillText("H", x0 + 4, y0 + 12);
      ctx.beginPath();
      let Hmin = 1e9, Hmax = -1e9;
      const Cs = [], Hs = [];
      for (let k = 0; k <= 40; k++) {
        const c = 0.4 + 3.2 * k / 40;
        const H = dirichletEntropy([c, c * 1.1, c * 0.9]);
        Cs.push(c); Hs.push(H);
        if (H < Hmin) Hmin = H; if (H > Hmax) Hmax = H;
      }
      const sp = Hmax - Hmin || 1;
      ctx.beginPath();
      Hs.forEach((H, k) => {
        const px = x0 + (x1 - x0) * k / 40;
        const py = y1 - (H - Hmin) / sp * (y1 - y0 - 8);
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      });
      ctx.strokeStyle = T.c4;
      ctx.lineWidth = 2;
      ctx.stroke();
      const cNow = (th[0] + th[1] + th[2]) / 3;
      const px = x0 + (x1 - x0) * clamp((cNow - 0.4) / 3.2, 0, 1);
      const py = y1 - (S.sim.H - Hmin) / sp * (y1 - y0 - 8);
      roundDot(ctx, px, py, 6, T.c5);
      if (ph >= 2) {
        panel(ctx, x0, y1 + 10, x1 - x0, 48, T, true, T.c6);
        ctx.fillStyle = T.c6;
        ctx.font = "bold 12px sans-serif";
        ctx.fillText("Γ / ψ 计算昂贵，不适合 GPU 热路径", x0 + 8, y1 + 30);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("logΓ(θ₁)+… 每步都要算", x0 + 8, y1 + 48);
      }
      if (ph >= 3) {
        panel(ctx, 16, S.H - 78, Math.min(280, S.W * 0.42), 42, T, true, T.c3);
        ctx.fillStyle = T.c3;
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("改走镜像下降，避开显式熵", 26, S.H - 52);
      }
      spark(ctx, S.sim.hist, 16, S.H - 28, 140, 16, T.c4, T);
    },
  };

  /* ============================================================
   * 6. 隐式期望似然
   * ============================================================ */
  OP.implicit_likelihood = {
    init(S) {
      const parts = [];
      for (let l = 0; l < 5; l++) {
        const A = AHAT.map((row) => row.map((v) => (v ? 0.6 + 0.4 * Math.random() : 0.02 + 0.08 * Math.random())));
        parts.push(A.map((r) => floorSimplex(r.concat([]).slice(0, 5).length ? r : r)));
        parts[l] = A.map((row) => {
          const s = row.reduce((a, b) => a + b, 0) || 1;
          return row.map((v) => v / s);
        });
      }
      S.sim = { parts, y: 1.15, hist: [] };
    },
    tick(S) {
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const u = SHORT.map((_, i) => featAt(S.t, i));
      const Gs = S.sim.parts.map((A) => {
        const g = mulVec(A, u);
        return g.reduce((s, v) => s + v, 0) / g.length;
      });
      const Gbar = Gs.reduce((s, v) => s + v, 0) / Gs.length;
      const yhatImp = 0.25 + rate * (0.85 * Gbar + 0.35);
      const nllImp = 0.5 * (S.sim.y - yhatImp) ** 2;
      let nllExp = 0;
      Gs.forEach((g) => { nllExp += 0.5 * (S.sim.y - rate * g) ** 2; });
      nllExp /= Gs.length;
      S.sim.u = u; S.sim.Gs = Gs; S.sim.Gbar = Gbar;
      S.sim.nllImp = nllImp; S.sim.nllExp = nllExp;
      S.sim.yhatImp = yhatImp;
      pushHist(S.sim.hist, nllImp, 70);
      S.metrics["log p(y|E G)"] = -nllImp;
      S.metrics["E log p"] = -nllExp;
      S.metrics.Jensen间隙 = nllImp - nllExp;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const m = S.sim.parts.length;
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("邻接粒子 A_l  （结构不确定）", 16, 54);
      const w = Math.min(70, (S.W * 0.55) / m);
      for (let l = 0; l < m; l++) {
        const x = 16 + l * (w + 8);
        panel(ctx, x, 62, w, w + 8, T, ph === 0, T.c2);
        const A = S.sim.parts[l];
        const c = w / 5;
        const rate = sl(S, "rate", 1);
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          heatCell(ctx, x + 4 + j * c, 70 + i * c, c, A[i][j] * (0.45 + 0.7 * rate), T, 0.8);
        }
      }
      if (ph >= 1) {
        const Abar = meanMat(S.sim.parts);
        const x = 16;
        const y = 62 + w + 24;
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("Ā = (1/M) Σ A_l", x, y);
        const c = 14;
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          heatCell(ctx, x + j * c, y + 8 + i * c, c, Abar[i][j], T, 0.8);
        }
      }
      const rx = S.W * 0.62, ry = 54;
      if (ph >= 2) {
        panel(ctx, rx, ry, S.W - rx - 12, 70, T, true, T.c3);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText("G(Ā, u) → ŷ = " + nv(S.sim.yhatImp).toFixed(3), rx + 8, ry + 20);
        ctx.fillText("真值 y = " + nv(S.sim.y).toFixed(2), rx + 8, ry + 40);
        ctx.fillStyle = T.c3;
        ctx.fillRect(rx + 8, ry + 50, 80 * clamp(nv(S.sim.yhatImp) / 2, 0, 1), 10);
        ctx.fillStyle = T.c6;
        ctx.fillRect(rx + 8 + 80 * clamp(nv(S.sim.y) / 2, 0, 1), ry + 46, 3, 18);
      }
      if (ph >= 3) {
        panel(ctx, rx, ry + 86, S.W - rx - 12, S.H - ry - 120, T, true, T.c6);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText("隐式：log p(y | E[G])  ≠  E log p", rx + 8, ry + 108);
        const h1 = 70 * clamp(nv(S.sim.nllImp), 0, 1.2) / 1.2;
        ctx.fillStyle = T.c5;
        ctx.fillRect(rx + 16, ry + 210 - h1, 40, h1);
        ctx.fillStyle = T.mu;
        ctx.fillText("隐式NLL", rx + 10, ry + 224);
        const h2 = 70 * clamp(nv(S.sim.nllExp), 0, 1.2) / 1.2;
        ctx.fillStyle = T.c3;
        ctx.fillRect(rx + 78, ry + 210 - h2, 40, h2);
        ctx.fillText("E[NLL]", rx + 74, ry + 224);
        ctx.fillStyle = T.c6;
        ctx.font = "11px sans-serif";
        ctx.fillText("期望在 log 外，InfO 分数断了", rx + 8, ry + 132);
        ctx.fillText("间隙 " + (nv(S.sim.nllImp) - nv(S.sim.nllExp)).toFixed(3), rx + 8, ry + 150);
      }
    },
  };

  /* ============================================================
   * 7. 熵正则泛函 L_ER
   * ============================================================ */
  OP.entropy_regularized_functional = {
    init(S) {
      const pts = Array.from({ length: 14 }, () => softmax([Math.random(), Math.random(), Math.random()]));
      S.sim = { pts, histL: [], histH: [] };
    },
    tick(S, dt) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const tgt = [0.2, 0.65, 0.15];
      const useEnt = S.phase < 3;
      if (S.phase === 3 && S.sim._ph !== 3) {
        /* 高熵 = 云散开（不是挤到均匀点） */
        S.sim.pts = Array.from({ length: 16 }, () => softmax([Math.random(), Math.random(), Math.random()]));
      }
      S.sim._ph = S.phase;
      const scs = S.sim.pts.map((z) => scoreToward(z, tgt));
      const phiAll = (S.phase >= 1 && useEnt) ? phiRKHS(S.sim.pts, scs, 0.16 + 0.22 * spread) : null;
      S.sim.pts = S.sim.pts.map((p, idx) => {
        let q = p.slice();
        if (S.phase >= 1 && useEnt) {
          q = mirrorStep(q, scs[idx], dt * 1.25);
          q = mirrorStep(q, phiAll[idx], dt * 0.25 * spread);
        }
        if (!useEnt) {
          q = q.map((v) => v + (Math.random() - 0.5) * dt * (2.4 + 2.2 * spread));
        }
        return floorSimplex(q);
      });
      const mean = [0, 0, 0];
      S.sim.pts.forEach((p) => { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; });
      mean[0] /= S.sim.pts.length; mean[1] /= S.sim.pts.length; mean[2] /= S.sim.pts.length;
      const nll = klDisc(mean, tgt);
      let H = 0;
      S.sim.pts.forEach((p) => { H -= p.reduce((s, v) => s + v * Math.log(Math.max(1e-8, v)), 0); });
      H /= S.sim.pts.length;
      const L = nll + (useEnt ? -H * 0.35 : 0);
      S.sim.nll = nll; S.sim.H = H; S.sim.L = L; S.sim.mean = mean;
      pushHist(S.sim.histL, L, 70);
      pushHist(S.sim.histH, H, 70);
      S.metrics.NLL = nll;
      S.metrics["H[Q]"] = H;
      S.metrics.L_ER = L;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const cx = S.W * 0.3, cy = S.H * 0.58, sc = Math.min(120, S.W * 0.18);
      drawSimplex(ctx, cx, cy, sc, T);
      const spr = sl(S, "spread", 0.7);
      S.sim.pts.forEach((a) => {
        const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
        roundDot(ctx, p.x, p.y, 3.2 + 3.4 * spr, T.c2);
      });
      if (S.sim.mean) {
        const p = simplexXY(S.sim.mean[0], S.sim.mean[1], S.sim.mean[2], cx, cy, sc);
        roundDot(ctx, p.x, p.y, 7, T.c5);
      }
      const rx = S.W * 0.58;
      panel(ctx, rx, 52, S.W - rx - 14, 70, T, ph === 0, T.c6);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("似然项  −log p(y|G(mean α))", rx + 8, 72);
      ctx.fillStyle = T.c6;
      ctx.fillRect(rx + 10, 84, (S.W - rx - 40) * clamp(S.sim.nll / 0.55, 0.04, 1), 16);

      panel(ctx, rx, 130, S.W - rx - 14, 70, T, ph === 1, T.c4);
      ctx.fillStyle = T.tx;
      ctx.fillText("负熵项  E_Q[log Q] = −H[Q]", rx + 8, 150);
      ctx.fillStyle = T.c4;
      ctx.fillRect(rx + 10, 162, (S.W - rx - 40) * clamp(1.2 - S.sim.H, 0, 1.2) / 1.2, 16);

      panel(ctx, rx, 210, S.W - rx - 14, 70, T, ph >= 2, T.c3);
      ctx.fillStyle = T.tx;
      ctx.fillText("L_ER = NLL + (−H)   " + (S.phase < 3 ? "" : "（关掉负熵）"), rx + 8, 230);
      ctx.fillStyle = T.c3;
      ctx.fillRect(rx + 10, 242, (S.W - rx - 40) * clamp((S.sim.L + 0.5) / 2, 0, 1), 16);

      if (ph >= 3) {
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("无负熵：粒子散开，图变糊", 16, S.H - 36);
        /* 糊图示意：全连接淡边 */
        const gx = 18, gy = S.H * 0.22;
        for (let i = 0; i < 5; i++) {
          const a = { x: gx + (i % 3) * 28, y: gy + Math.floor(i / 3) * 26 };
          for (let j = i + 1; j < 5; j++) {
            const b = { x: gx + (j % 3) * 28, y: gy + Math.floor(j / 3) * 26 };
            ctx.strokeStyle = aa(T, T.c6, 0.35, 0.45);
            ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
          roundDot(ctx, a.x, a.y, 4, T.c6);
        }
      }
      spark(ctx, S.sim.histL, rx, S.H - 40, S.W - rx - 16, 22, T.c3, T);
    },
  };

  /* ============================================================
   * 8. 泛函微扰差 定理5.1
   * ============================================================ */
  OP.functional_perturbation = {
    init(S) {
      const pts = Array.from({ length: 12 }, () => softmax([Math.random(), Math.random(), Math.random()]));
      S.sim = { pts, hist: [] };
    },
    tick(S) {
      const eps = S.sliders.eps != null ? S.sliders.eps : 0.18;
      const tgt = [0.18, 0.67, 0.15];
      const scores = S.sim.pts.map((p) => scoreToward(p, tgt));
      const phi = scores.map((s, i) => projectTangent(S.sim.pts[i], s));
      /* 体积项：收缩场 ∇φ ≈ −I 的对角近似 */
      const vol = Math.log(Math.abs(Math.pow(1 - 0.45 * eps, 3)) + 1e-8);
      let like = 0;
      S.sim.pts.forEach((p, i) => {
        like += -eps * (phi[i][0] * scores[i][0] + phi[i][1] * scores[i][1] + phi[i][2] * scores[i][2]);
      });
      like /= S.sim.pts.length;
      S.sim.eps = eps; S.sim.phi = phi; S.sim.like = like; S.sim.vol = vol;
      S.sim.dL = like + vol;
      S.sim.moved = S.sim.pts.map((p, i) => floorSimplex(p.map((v, k) => v + eps * phi[i][k] * phBlend(S, 1))));
      pushHist(S.sim.hist, S.sim.dL, 70);
      S.metrics.ε = eps;
      S.metrics["−ε φ·∇logp"] = like;
      S.metrics["log|det|"] = vol;
      S.metrics.ΔL_ER = S.sim.dL;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const cx = S.W * 0.3, cy = S.H * 0.58, sc = Math.min(120, S.W * 0.18);
      drawSimplex(ctx, cx, cy, sc, T);
      const src = S.phase >= 1 ? S.sim.moved : S.sim.pts;
      src.forEach((a, i) => {
        const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
        if (ph === 3) {
          const scV = Math.max(3, 14 * Math.exp(nv(S.sim.vol)));
          ctx.strokeStyle = aa(T, T.c7, 0.7, 0.8);
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, scV, 0, TWO);
          ctx.stroke();
        }
        roundDot(ctx, p.x, p.y, 4.5, ph >= 1 ? T.c3 : T.c2);
        if (ph >= 1 && S.sim.phi) {
          const q0 = S.sim.pts[i];
          const p0 = simplexXY(q0[0], q0[1], q0[2], cx, cy, sc);
          arrow(ctx, p0.x, p0.y, p.x - p0.x, p.y - p0.y, T.c5);
        }
      });
      const rx = S.W * 0.58;
      panel(ctx, rx, 54, S.W - rx - 12, 90, T, ph === 2, T.c5);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("似然灵敏度  −ε φᵀ∇log p", rx + 8, 74);
      const w = S.W - rx - 40;
      ctx.fillStyle = S.sim.like < 0 ? T.c3 : T.c6;
      ctx.fillRect(rx + 10, 90, w * clamp(Math.abs(S.sim.like) * 4, 0.02, 1), 16);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText((S.sim.like || 0).toFixed(3) + (S.sim.like < 0 ? "  下降" : "  上升"), rx + 10, 128);

      panel(ctx, rx, 156, S.W - rx - 12, 90, T, ph === 3, T.c7);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("体积项  log|det(I+ε∇φ)|", rx + 8, 176);
      ctx.fillStyle = T.c7;
      ctx.fillRect(rx + 10, 192, w * clamp(Math.abs(S.sim.vol), 0.02, 1), 16);
      ctx.fillStyle = T.mu;
      ctx.fillText((S.sim.vol || 0).toFixed(3) + "  收缩→熵减", rx + 10, 230);

      ctx.fillStyle = T.tx;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText("ΔL_ER = " + (S.sim.dL || 0).toFixed(3) + (S.sim.dL < 0 ? "  <0 可下降" : ""), rx + 8, S.H - 40);
    },
  };

  /* ============================================================
   * 9. RKHS 微扰方向
   * ============================================================ */
  OP.rkhs_perturbation_direction = {
    init(S) {
      const pts = Array.from({ length: 10 }, () => softmax([Math.random() * 0.8, Math.random(), Math.random() * 0.6]));
      S.sim = { pts, hist: [] };
    },
    tick(S, dt) {
      const v = S.sliders.v != null ? S.sliders.v : 0.7;
      const tgt = [0.16, 0.7, 0.14];
      const scores = S.sim.pts.map((p) => projectTangent(p, scoreToward(p, tgt)));
      const phi = phiRKHS(S.sim.pts, scores, 0.22 * v);
      if (S.phase >= 3) {
        S.sim.pts = S.sim.pts.map((p, i) => mirrorStep(p, projectTangent(p, phi[i]), dt * 1.4));
      }
      S.sim.scores = scores; S.sim.phi = phi; S.sim.v = v;
      const mean = [0, 0, 0];
      S.sim.pts.forEach((p) => { mean[0] += p[0]; mean[1] += p[1]; mean[2] += p[2]; });
      const n = S.sim.pts.length;
      S.metrics.核带宽 = v;
      S.metrics["‖φ‖"] = hypot(phi[0][0], phi[0][1], phi[0][2]);
      S.metrics.KL = klDisc([mean[0] / n, mean[1] / n, mean[2] / n], tgt);
      pushHist(S.sim.hist, S.metrics.KL, 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const cx = S.W * 0.42, cy = S.H * 0.58, sc = Math.min(140, S.W * 0.22);
      drawSimplex(ctx, cx, cy, sc, T);
      const hpx = 18 + 28 * S.sim.v;
      S.sim.pts.forEach((a, i) => {
        const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
        ctx.fillStyle = aa(T, T.c4, ph >= 1 ? 0.14 : 0.06, ph >= 1 ? 0.2 : 0.1);
        ctx.beginPath();
        ctx.arc(p.x, p.y, hpx, 0, TWO);
        ctx.fill();
        roundDot(ctx, p.x, p.y, 5, T.c2);
        if (ph === 0 && S.sim.scores) {
          const s = S.sim.scores[i];
          const q = simplexXY(a[0] + 0.12 * s[0], a[1] + 0.12 * s[1], a[2] + 0.12 * s[2], cx, cy, sc);
          arrow(ctx, p.x, p.y, q.x - p.x, q.y - p.y, T.c6);
        }
        if (ph === 2 && S.sim.phi) {
          /* ∇K 排斥：画离群短箭头 */
          const phv = S.sim.phi[i];
          const q = simplexXY(a[0] + 0.1 * phv[0], a[1] + 0.1 * phv[1], a[2] + 0.1 * phv[2], cx, cy, sc);
          arrow(ctx, p.x, p.y, q.x - p.x, q.y - p.y, T.c7);
        }
        if (ph >= 3 && S.sim.phi) {
          const phv = S.sim.phi[i];
          const q = simplexXY(a[0] + 0.14 * phv[0], a[1] + 0.14 * phv[1], a[2] + 0.14 * phv[2], cx, cy, sc);
          arrow(ctx, p.x, p.y, q.x - p.x, q.y - p.y, T.c5);
        }
      });
      legend(ctx, [
        { c: T.c6, lab: "似然梯度 ∇log p" },
        { c: T.c4, lab: "核 K 带宽 ~ v" },
        { c: T.c7, lab: "∇K 排斥" },
        { c: T.c5, lab: "合成 φ_RKHS 流动" },
      ], 16, S.H - 78, T);
      spark(ctx, S.sim.hist, S.W - 150, 54, 130, 28, T.c3, T, 0, 1.4);
    },
  };

  /* ============================================================
   * 10. KL 下降充分条件
   * ============================================================ */
  OP.kl_descent_sufficient_condition = {
    init(S) {
      S.sim = { mu: -0.9, mp: 0.85, sep: 1, ok: true, KL: 1.4, phi: 1.2, histF: [], histR: [] };
    },
    tick(S, dt) {
      const sep = S.sliders.sep != null ? S.sliders.sep : 1;
      const mp = sep * 0.85;
      const s = 0.55;
      if (S.phase === 3 && S.sim._ph !== 3) {
        S.sim.mu = -0.85 * mp; /* 反向实验从分离状态重来 */
        S.sim.histR = [];
      }
      if (S.phase < 3 && S.sim._ph === 3) S.sim.mu = -0.9;
      S.sim._ph = S.phase;
      const mq = S.sim.mu;
      const phiGood = mp - mq;
      const reverse = S.phase >= 3;
      const phi = reverse ? -Math.abs(phiGood) - 0.35 : Math.abs(phiGood) + 0.15;
      const ok = phi * (mp - mq) / (s * s) >= -1e-9;
      if (S.phase >= 1) {
        S.sim.mu += dt * 0.42 * phi;
        S.sim.mu = clamp(S.sim.mu, -2.2, 2.2);
      }
      const KL = klGauss(S.sim.mu, s, mp, s);
      if (reverse) pushHist(S.sim.histR, KL, 70);
      else pushHist(S.sim.histF, KL, 70);
      S.sim.mp = mp; S.sim.sep = sep; S.sim.ok = ok; S.sim.KL = KL; S.sim.phi = phi;
      S.metrics.间距 = sep;
      S.metrics["φ·Δscore"] = phi * (mp - mq) / (s * s);
      S.metrics["KL(Q‖P)"] = KL;
      S.metrics.充分条件 = ok ? 1 : 0;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const x0 = 40, x1 = S.W * 0.62, y0 = 54, y1 = S.H - 78;
      axisBox(ctx, x0, y0, x1, y1, T, "x", "密度 / 得分差");
      const X = (x) => x0 + (x + 3) / 6 * (x1 - x0);
      const Yd = (v) => y1 - v * (y1 - y0) * 1.15;
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = -3 + 6 * i / 80;
        const y = gauss(x, S.sim.mu, 0.55);
        if (i) ctx.lineTo(X(x), Yd(y)); else ctx.moveTo(X(x), Yd(y));
      }
      ctx.strokeStyle = T.c2; ctx.lineWidth = 2; ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = -3 + 6 * i / 80;
        const y = gauss(x, nv(S.sim.mp) || 0.85, 0.55);
        if (i) ctx.lineTo(X(x), Yd(y)); else ctx.moveTo(X(x), Yd(y));
      }
      ctx.strokeStyle = T.c6; ctx.lineWidth = 2; ctx.stroke();
      if (ph >= 0) {
        for (let k = 0; k < 9; k++) {
          const x = -2 + k * 0.5;
          const dscore = (S.sim.mp - S.sim.mu) / (0.55 * 0.55);
          const px = X(x), py = (y0 + y1) / 2;
          if (ph >= 1) arrow(ctx, px, py, 22 * Math.sign(S.sim.phi), 0, ph >= 3 ? T.c6 : T.c5);
          else arrow(ctx, px, py, 18 * Math.sign(dscore), -10, T.c4);
        }
      }
      const rx = S.W * 0.66;
      panel(ctx, rx, 54, S.W - rx - 12, 80, T, true, S.sim.ok ? T.c3 : T.c6);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText(S.sim.ok ? "内积 ≥ 0  充分条件成立" : "内积 < 0  条件失败", rx + 8, 78);
      ctx.fillText("KL = " + (S.sim.KL != null ? S.sim.KL.toFixed(3) : "—"), rx + 8, 100);
      spark(ctx, S.sim.histF, rx, 150, S.W - rx - 16, 50, T.c3, T, 0, 3);
      ctx.fillStyle = T.mu; ctx.font = "10px sans-serif"; ctx.fillText("正向 φ：KL 下降", rx, 146);
      if (ph >= 3) {
        spark(ctx, S.sim.histR, rx, 220, S.W - rx - 16, 50, T.c6, T, 0, 3);
        ctx.fillText("反向 φ：KL 上升", rx, 216);
      }
      legend(ctx, [
        { c: T.c2, lab: "Q 变分" },
        { c: T.c6, lab: "P 目标" },
        { c: T.c5, lab: "φ 方向" },
      ], 40, S.H - 52, T);
    },
  };

  /* ============================================================
   * 11. 熵布雷格曼势
   * ============================================================ */
  OP.entropy_bregman_potential = {
    init(S) {
      S.sim = { a: [0.55, 0.3, 0.15], hist: [] };
    },
    tick(S, dt) {
      const z0 = S.sliders.z0 != null ? S.sliders.z0 : 0.6;
      /* 参考方向：线性目标想把质量赶到顶点 2 */
      const c = [0.2 - 0.3 * z0, -0.8 + 0.2 * z0, 0.6];
      const a = S.sim.a;
      if (S.phase === 2) {
        /* 欧氏一步：α₂ 猛增、其余变负 → 离开 Δ */
        S.sim.eucRaw = [a[0] - 0.95, a[1] + 1.35, a[2] - 0.55];
      } else S.sim.eucRaw = a.slice();
      if (S.phase >= 3) {
        const g = a.map((v, i) => -c[i]); /* 镜像：对偶走 -∇F, F=c·α */
        S.sim.a = mirrorStep(a, g, dt * 1.3);
      }
      S.sim.z0 = z0;
      S.sim.Psi = psiEnt(S.sim.a);
      S.sim.ref = floorSimplex([0.45 + 0.2 * z0, 0.35, 0.2 - 0.2 * z0]);
      S.metrics.Ψ = S.sim.Psi;
      S.metrics.minα = Math.min.apply(null, S.sim.a);
      S.metrics.行和 = S.sim.a[0] + S.sim.a[1] + S.sim.a[2];
      pushHist(S.sim.hist, S.sim.Psi, 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const cx = S.W * 0.38, cy = S.H * 0.58, sc = Math.min(140, S.W * 0.22);
      drawSimplex(ctx, cx, cy, sc, T);
      /* 势等高：中心低、顶点高 */
      const N = 16;
      let pmin = 1e9, pmax = -1e9;
      const grid = [];
      for (let i = 1; i < N; i++) {
        for (let j = 1; j < N - i; j++) {
          const a = i / N, b = j / N, c = 1 - a - b;
          const ps = psiEnt([a, b, c]);
          grid.push({ a, b, c, ps });
          if (ps < pmin) pmin = ps;
          if (ps > pmax) pmax = ps;
        }
      }
      if (ph >= 1) {
        grid.forEach((g) => {
          const t = (g.ps - pmin) / (pmax - pmin || 1); /* 0=中心低, 1=顶点高 */
          const p = simplexXY(g.a, g.b, g.c, cx, cy, sc);
          roundDot(ctx, p.x, p.y, 2.6 + 2.2 * t, rgba(t > 0.65 ? T.c6 : T.c3, 0.14 + 0.7 * t));
        });
      }
      if (ph >= 3) {
        const v = [
          simplexXY(1, 0, 0, cx, cy, sc),
          simplexXY(0, 1, 0, cx, cy, sc),
          simplexXY(0, 0, 1, cx, cy, sc),
        ];
        ctx.strokeStyle = aa(T, T.c3, 0.85, 0.9);
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y);
        ctx.lineTo(v[1].x, v[1].y);
        ctx.lineTo(v[2].x, v[2].y);
        ctx.closePath();
        ctx.stroke();
      }
      const p = simplexXY(S.sim.a[0], S.sim.a[1], S.sim.a[2], cx, cy, sc);
      roundDot(ctx, p.x, p.y, 7, T.c5);
      if (ph === 2 && S.sim.eucRaw) {
        const v2 = simplexXY(0, 1, 0, cx, cy, sc);
        const q2 = { x: clamp(v2.x + 26, 10, S.W - 24), y: clamp(v2.y + 16, 48, S.H - 24) };
        roundDot(ctx, q2.x, q2.y, 7, T.c6);
        arrow(ctx, p.x, p.y, q2.x - p.x, q2.y - p.y, T.c6);
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("二次势 / 欧氏 GD 穿出边界", 16, 56);
        ctx.fillText("出界", q2.x + 6, q2.y - 6);
      }
      if (ph >= 3) {
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("熵势：边界 Ψ→墙，镜像步留在 Δ 内", 16, 56);
      }
      if (ph <= 1) {
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("Ψ(α)=Σ(α log α − α)  中心低、顶点高", 16, 56);
      }
      const rx = S.W * 0.7;
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("当前 Ψ", rx, 70);
      ctx.fillStyle = T.c3;
      const h = 80 * clamp((-S.sim.Psi - 0.8) / 1.4, 0, 1);
      ctx.fillRect(rx, 200 - h, 22, h);
      spark(ctx, S.sim.hist, rx - 10, S.H - 48, 120, 22, T.c3, T);
    },
  };

  /* ============================================================
   * 12. 熵布雷格曼散度
   * ============================================================ */
  OP.entropy_bregman_divergence = {
    init(S) {
      const at = [0.62, 0.22, 0.16];
      S.sim = { t: 0.35, hist: [], at: at, a: at.slice(), B: 0, kl: 0, Psi: psiEnt(at), PsiT: psiEnt(at), uT: 0.35 };
    },
    tick(S) {
      const z0 = S.sliders.z0 != null ? S.sliders.z0 : 0.6;
      const at = floorSimplex([0.55 + 0.2 * Math.tanh(z0), 0.22, 0.23 - 0.12 * Math.tanh(z0)]);
      const u = 0.08 + 0.75 * (0.5 + 0.5 * Math.sin(S.t * 0.6));
      const e2 = [0.05, 0.9, 0.05];
      let a = at.map((v, i) => lerp(v, e2[i], u));
      a = floorSimplex(a);
      if (S.phase >= 3) {
        /* 把质量赶到 α₂ 并溢出顶点，离开 Δ */
        const u = 0.55 + 0.25 * Math.sin(S.t * 0.8);
        a = [a[0] - 0.22, a[1] + 0.95 + 0.2 * u, a[2] - 0.18];
      }
      const B = bregmanEnt(a, at);
      const massA = a[0] + a[1] + a[2];
      const massT = at[0] + at[1] + at[2];
      const kl = (Math.abs(massA - 1) < 0.02 && Math.abs(massT - 1) < 0.02) ? klDisc(a, at) : NaN;
      S.sim.at = at; S.sim.a = a; S.sim.B = B; S.sim.kl = kl; S.sim.Psi = psiEnt(a); S.sim.PsiT = psiEnt(at); S.sim.uT = u;
      S.metrics.Bregman = B;
      S.metrics.KL = isNaN(kl) ? -1 : kl;
      S.metrics.质量差 = massA - massT;
      pushHist(S.sim.hist, B, 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      /* 左：1D 势与切线 */
      const x0 = 40, x1 = S.W * 0.5, y0 = 58, y1 = S.H - 70;
      axisBox(ctx, x0, y0, x1, y1, T, "切片坐标", "Ψ");
      const at = S.sim.at || [0.62, 0.22, 0.16];
      const a = S.sim.a || at.slice();
      const e2s = [0.05, 0.9, 0.05];
      const ptOn = (t) => floorSimplex(at.map((v, i) => lerp(v, e2s[i], t)));
      const X = (t) => x0 + t * (x1 - x0);
      const vals = [];
      for (let k = 0; k <= 40; k++) vals.push(psiEnt(ptOn(k / 40)));
      const tang = (t) => {
        const pt = ptOn(t);
        let s = S.sim.PsiT;
        for (let i = 0; i < 3; i++) s += Math.log(Math.max(1e-8, at[i])) * (pt[i] - at[i]);
        return s;
      };
      const tgs = [];
      for (let k = 0; k <= 40; k++) tgs.push(tang(k / 40));
      let mn = Math.min.apply(null, vals.concat(tgs));
      let mx = Math.max.apply(null, vals.concat(tgs));
      const Y = (v) => y1 - (v - mn) / (mx - mn || 1) * (y1 - y0 - 10);
      ctx.beginPath();
      vals.forEach((v, k) => {
        const px = X(k / 40);
        if (k) ctx.lineTo(px, Y(v)); else ctx.moveTo(px, Y(v));
      });
      ctx.strokeStyle = T.c2; ctx.lineWidth = 2; ctx.stroke();
      const t1 = clamp(S.sim.uT != null ? S.sim.uT : 0.4, 0.02, 0.98);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      for (let k = 0; k <= 40; k++) {
        const t = k / 40;
        const px = X(t), py = Y(tang(t));
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      roundDot(ctx, X(0), Y(nv(S.sim.PsiT)), 6, T.c3);
      roundDot(ctx, X(t1), Y(psiEnt(floorSimplex(a))), 6, T.c6);
      if (ph >= 1) {
        const xa = X(t1);
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(xa, Y(psiEnt(floorSimplex(a))));
        ctx.lineTo(xa, Y(tang(t1)));
        ctx.stroke();
        ctx.fillStyle = T.c5;
        ctx.font = "11px sans-serif";
        ctx.fillText("Bregman 间隙", xa + 6, (Y(psiEnt(floorSimplex(a))) + Y(tang(t1))) / 2);
      }
      const cx = S.W * 0.76, cy = S.H * 0.55, sc = Math.min(90, S.W * 0.13);
      drawSimplex(ctx, cx, cy, sc, T);
      const p0 = simplexXY(at[0], at[1], at[2], cx, cy, sc);
      const massA = a[0] + a[1] + a[2];
      const p1raw = ph >= 3
        ? simplexXY(a[0], a[1], a[2], cx, cy, sc)
        : (function () { const aa = floorSimplex(a); return simplexXY(aa[0], aa[1], aa[2], cx, cy, sc); })();
      const p1 = {
        x: clamp(p1raw.x, cx - sc * 1.25, cx + sc * 1.35),
        y: clamp(p1raw.y, cy - sc * 1.15, cy + sc * 1.05),
      };
      roundDot(ctx, p0.x, p0.y, 6, T.c3);
      roundDot(ctx, p1.x, p1.y, 6, T.c6);
      if (ph >= 3) {
        ctx.strokeStyle = T.c6;
        ctx.setLineDash([3, 3]);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c6;
        ctx.font = "11px sans-serif";
        ctx.fillText("质量和=" + massA.toFixed(2) + "  罚=" + (massA - 1).toFixed(2), cx - 50, cy + sc * 0.95);
      }
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText(ph >= 2 && !isNaN(S.sim.kl) && S.sim.kl >= 0 ? "单纯形上 B = KL" : (ph >= 3 ? "质量和≠1：多出质量罚" : "α_τ 参考点"), S.W * 0.58, 56);
      spark(ctx, S.sim.hist, S.W * 0.58, S.H - 48, S.W * 0.38, 22, T.c5, T);
    },
  };

  /* ============================================================
   * 13. 镜像映射 log/exp
   * ============================================================ */
  OP.mirror_map_log = {
    init(S) {
      const a = [0.55, 0.28, 0.17];
      const z = a.map((v) => Math.log(Math.max(1e-8, v)));
      S.sim = { a: a, z: z, z2: z.slice(), hist: [], phi: [0, 0, 0], eta: 0.25 };
    },
    tick(S, dt) {
      const eta = S.sliders.eta != null ? S.sliders.eta : 0.25;
      const tgt = [0.12, 0.7, 0.18];
      const a = S.sim.a;
      const z = a.map((v) => Math.log(Math.max(1e-8, v)));
      const phi = scoreToward(a, tgt);
      S.sim.z = z;
      S.sim.z2 = z.map((v, i) => v + (0.45 + 2.4 * eta) * phi[i]);
      if (S.phase >= 3) {
        S.sim.a = softmax(S.sim.z2);
      } else if (S.phase === 2) {
        /* 预览对偶平移但不拉回 */
      }
      S.sim.eta = eta; S.sim.phi = phi;
      S.metrics.η = eta;
      S.metrics.行和 = S.sim.a[0] + S.sim.a[1] + S.sim.a[2];
      S.metrics.minα = Math.min.apply(null, S.sim.a);
      S.metrics.KL = klDisc(S.sim.a, tgt);
      pushHist(S.sim.hist, S.metrics.KL, 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const cx = S.W * 0.28, cy = S.H * 0.58, sc = Math.min(120, S.W * 0.18);
      drawSimplex(ctx, cx, cy, sc, T, ["α₁", "α₂", "α₃"]);
      const p = simplexXY(S.sim.a[0], S.sim.a[1], S.sim.a[2], cx, cy, sc);
      roundDot(ctx, p.x, p.y, 7, T.c5);
      const z0s = S.sim.z || S.sim.a.map((v) => Math.log(Math.max(1e-8, v)));
      /* 对偶平面：第 0 步先只看三角形 */
      const bx = S.W * 0.58, by = 70, bw = S.W * 0.4, bh = S.H - 120;
      if (ph >= 1) {
      panel(ctx, bx, by, bw, bh, T, true, T.c7);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("对偶空间  ζ = log α  （中心化平面）", bx + 8, by + 18);
      const zUse = ph >= 2 ? (S.sim.z2 || S.sim.z) : S.sim.z;
      const d = dualXY(zUse || z0s);
      const d0 = dualXY(z0s);
      const mx = bx + bw / 2, my = by + bh / 2 + 10, scd = 52;
      ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(bx + 12, my); ctx.lineTo(bx + bw - 12, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, by + 28); ctx.lineTo(mx, by + bh - 12); ctx.stroke();
      roundDot(ctx, mx + d0.x * scd, my - d0.y * scd, 6, T.c2);
      if (ph >= 2) {
        roundDot(ctx, mx + d.x * scd, my - d.y * scd, 6, T.c5);
        arrow(ctx, mx + d0.x * scd, my - d0.y * scd, (d.x - d0.x) * scd, -(d.y - d0.y) * scd, T.c5);
        ctx.fillStyle = T.mu;
        ctx.font = "11px sans-serif";
        ctx.fillText("ζ ← ζ + η φ", bx + 10, by + bh - 16);
      }
      (zUse || S.sim.z || []).forEach((v, i) => {
        ctx.fillStyle = [T.c2, T.c3, T.c6][i];
        const ww = 28 + Math.abs(v) * 14;
        ctx.fillRect(bx + 16 + i * 28, by + bh - 28, 22, 8);
        ctx.fillRect(bx + 16 + i * 28, by + bh - 28 - clamp(ww, 6, 40), 22, clamp(ww, 6, 40));
      });
      } /* ph >= 1 对偶平面 */
      if (ph >= 3) {
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("softmax 拉回，行和=1 仍在三角形", 16, 56);
        const aOld = softmax(z0s);
        const pOld = simplexXY(aOld[0], aOld[1], aOld[2], cx, cy, sc);
        ctx.strokeStyle = T.c2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.arc(pOld.x, pOld.y, 9, 0, TWO); ctx.stroke();
        ctx.setLineDash([]);
        arrow(ctx, pOld.x, pOld.y, p.x - pOld.x, p.y - pOld.y, T.c3);
      } else if (ph === 1) {
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("log 把门打开：约束暂时消失", 16, 56);
      }
      spark(ctx, S.sim.hist, 16, S.H - 40, 150, 20, T.c3, T);
    },
  };

  /* ============================================================
   * 14. KEMS 单纯形迭代
   * ============================================================ */
  OP.kems_simplex_update = {
    init(S) {
      S.sim = {
        w: [0.2, 0.5, 0.3],
        dual: [-1.2, 0.4, 0.1],
        traj: []
      };
    },
    tick(S, dt) {
      const eps = S.sliders.eps != null ? S.sliders.eps : 0.22;
      const ph = S.phase;

      // Gradient direction in dual space
      const grad = [0.4 * Math.sin(S.t), -0.3 * Math.cos(S.t * 0.8), 0.2 * Math.sin(S.t * 1.2)];
      const newDual = S.sim.dual.map((v, i) => v - eps * grad[i]);
      S.sim.dual = newDual;

      // Softmax mirror map: back to simplex
      const exps = newDual.map(v => Math.exp(v));
      const sumExp = exps.reduce((a, b) => a + b, 0);
      const w = exps.map(v => v / sumExp);
      S.sim.w = w;

      if (!S.sim.traj) S.sim.traj = [];
      S.sim.traj.push([...w]);
      while (S.sim.traj.length > 36) S.sim.traj.shift();

      S.metrics["单纯形权重 w"] = w.map(v => v.toFixed(2)).join(", ");
      S.metrics["可行性 ∑w"] = w.reduce((a, b) => a + b, 0).toFixed(3);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const cx = W * 0.46, cy = H * 0.62;
      const R = Math.min(W, H) * 0.35;

      // Equilateral triangle vertices of 3D simplex Δ^3
      const v1 = { x: cx, y: cy - R };
      const v2 = { x: cx - R * 0.866, y: cy + R * 0.5 };
      const v3 = { x: cx + R * 0.866, y: cy + R * 0.5 };

      // Draw Simplex Triangle
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2;
      ctx.fillStyle = T.dark ? "rgba(91,140,255,0.06)" : "rgba(91,140,255,0.10)";
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.lineTo(v3.x, v3.y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.lineWidth = 1;

      // Label vertices
      ctx.fillStyle = T.tx; ctx.font = "bold 10px " + FONT; ctx.textAlign = "center";
      ctx.fillText("基准 A1 (1,0,0)", v1.x, v1.y - 8);
      ctx.fillText("基准 A2 (0,1,0)", v2.x - 20, v2.y + 15);
      ctx.fillText("基准 A3 (0,0,1)", v3.x + 20, v3.y + 15);

      // Map barycentric w = [w1, w2, w3] to 2D
      const w = S.sim.w;
      const ptX = w[0] * v1.x + w[1] * v2.x + w[2] * v3.x;
      const ptY = w[0] * v1.y + w[1] * v2.y + w[2] * v3.y;

      // Trajectory inside simplex
      if (S.sim.traj && S.sim.traj.length > 1) {
        ctx.strokeStyle = T.c5;
        ctx.beginPath();
        S.sim.traj.forEach((tw, i) => {
          const tx = tw[0] * v1.x + tw[1] * v2.x + tw[2] * v3.x;
          const ty = tw[0] * v1.y + tw[1] * v2.y + tw[2] * v3.y;
          if (i === 0) ctx.moveTo(tx, ty); else ctx.lineTo(tx, ty);
        });
        ctx.stroke();
      }

      // Active state point
      glow(ctx, ptX, ptY, 7, T.c3);
      ctx.fillStyle = "#ffffff";
      ctx.beginPath(); ctx.arc(ptX, ptY, 3, 0, Math.PI * 2); ctx.fill();

      // Dashboard
      const gx = W - 152, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 146, 62, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("KEMS 镜像单纯形映射", gx, gy + 12);
      ctx.fillStyle = T.c3;
      ctx.fillText("权重: [" + S.metrics["单纯形权重 w"] + "]", gx, gy + 28);
      ctx.fillStyle = T.c4;
      ctx.fillText("约束: ∑w = " + S.metrics["可行性 ∑w"] + " ✓", gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：定义概率单纯形 Δ^3 闭凸可行域", T, T.c2);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：对偶空间无约束自由梯度下降", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：Softmax 镜像回投影，严格锁死在单纯形内", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：负熵势阻断边界，无需任何硬性截断投影", T, T.c4);
    }
  };

  OP.forward_euler_ode = {
    init(S) {
      S.sim = { pathC: [], pathE: [], pathBig: [], zE: { x: 1.1, y: 0.7 }, zB: { x: 1.1, y: 0.7 }, kappa: 0.6, omega: 2 };
    },
    tick(S) {
      const eps = sl(S, "eps", 0.2);
      const uamp = sl(S, "uamp", 0.4);
      const tgt = [0.15, 0.7, 0.15];
      /* 对偶平面线性振荡：dζ/dτ = −κζ + Jωζ，欧拉步 = 旋转+缩放 */
      const kappa = 0.48 + 0.28 * uamp;
      const omega = 1.75 + 1.15 * uamp;
      const z0 = { x: 1.15, y: 0.82 };
      function flow(p, h) {
        const dx = -kappa * p.x + omega * p.y;
        const dy = -omega * p.x - kappa * p.y;
        return { x: p.x + h * dx, y: p.y + h * dy };
      }
      function capR(p, rmax) {
        const r = Math.hypot(p.x, p.y);
        if (r <= rmax || r < 1e-9) return p;
        return { x: p.x * rmax / r, y: p.y * rmax / r };
      }
      let zc = { x: z0.x, y: z0.y };
      const pathC = [{ x: zc.x, y: zc.y }];
      for (let k = 0; k < 90; k++) {
        zc = flow(zc, 0.028);
        pathC.push({ x: zc.x, y: zc.y });
      }
      const hE = 0.16 + 0.18 * eps; /* 小步：沿螺线的折线 */
      let ze = { x: z0.x, y: z0.y };
      const pathE = [{ x: ze.x, y: ze.y }];
      for (let k = 0; k < 16; k++) {
        ze = capR(flow(ze, hE), 2.4);
        pathE.push({ x: ze.x, y: ze.y });
      }
      const hB = 0.42 + 0.38 * eps; /* 大步：每拍转 ~60–90°，折线明显振荡 */
      let zb = { x: z0.x, y: z0.y };
      const pathBig = [{ x: zb.x, y: zb.y }];
      for (let k = 0; k < 10; k++) {
        zb = capR(flow(zb, hB), 2.35);
        pathBig.push({ x: zb.x, y: zb.y });
      }
      S.sim.pathC = pathC; S.sim.pathE = pathE; S.sim.pathBig = pathBig;
      S.sim.zE = ze; S.sim.zB = zb; S.sim.eps = eps; S.sim.uamp = uamp;
      S.sim.kappa = kappa; S.sim.omega = omega;
      const zShow = S.phase === 2 ? zb : ze;
      const aE = softmax([zShow.x, zShow.y, 0.15]);
      S.metrics.ε = eps;
      S.metrics.控制 = uamp;
      S.metrics["hω"] = (S.phase === 2 ? hB : hE) * omega;
      S.metrics.行和 = aE[0] + aE[1] + aE[2];
      S.metrics.KL = klDisc(aE, tgt);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const bx = 30, by = 54, bw = S.W * 0.58, bh = S.H - 90;
      panel(ctx, bx, by, bw, bh, T, true, T.c7);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("对偶平面  dζ/dτ = −κζ + Jωζ   (镜像 ODE)", bx + 8, by + 18);
      const mx = bx + bw / 2, my = by + bh / 2 + 8, scd = 68;
      ctx.strokeStyle = T.line;
      ctx.beginPath(); ctx.moveTo(bx + 8, my); ctx.lineTo(bx + bw - 8, my); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, by + 28); ctx.lineTo(mx, by + bh - 8); ctx.stroke();
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.clip();
      if (ph === 0) {
        const kappa = nv(S.sim.kappa) || 0.6, omega = nv(S.sim.omega) || 2;
        for (let i = -3; i <= 3; i++) {
          for (let j = -3; j <= 3; j++) {
            if (!i && !j) continue;
            const x = i * 0.38, y = j * 0.38;
            const dx = -kappa * x + omega * y, dy = -omega * x - kappa * y;
            const L = Math.hypot(dx, dy) || 1;
            arrow(ctx, mx + x * scd, my - y * scd, (dx / L) * 11, -(dy / L) * 11, aa(T, T.c4, 0.35, 0.45), 1);
          }
        }
      }
      const strokePath = (path, col, dash, lw) => {
        if (!path || path.length < 2) return;
        ctx.beginPath();
        path.forEach((p, i) => {
          const x = mx + p.x * scd, y = my - p.y * scd;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.strokeStyle = col;
        ctx.lineWidth = lw || 2;
        ctx.setLineDash(dash || []);
        ctx.stroke();
        ctx.setLineDash([]);
      };
      strokePath(S.sim.pathC, T.c3, ph === 0 ? [] : [5, 4], 2.2);
      roundDot(ctx, mx, my, 4, T.c3);
      ctx.fillStyle = T.mu;
      ctx.font = "10px sans-serif";
      ctx.fillText("ζ*", mx + 6, my - 6);
      if (ph === 1 || ph === 3) {
        strokePath(S.sim.pathE, T.c5, [], 2.4);
        (S.sim.pathE || []).forEach((p, i) => {
          roundDot(ctx, mx + p.x * scd, my - p.y * scd, i === S.sim.pathE.length - 1 ? 6 : 3.2, T.c5);
          if (ph === 3 && i < 9) {
            ctx.fillStyle = T.tx;
            ctx.font = "9px sans-serif";
            ctx.fillText(String(i), mx + p.x * scd + 4, my - p.y * scd - 6);
          }
        });
      }
      if (ph === 2) {
        strokePath(S.sim.pathBig, T.c6, [], 2.6);
        (S.sim.pathBig || []).forEach((p, i) => {
          roundDot(ctx, mx + p.x * scd, my - p.y * scd, 5, T.c6);
          if (i <= 8) {
            ctx.fillStyle = T.tx;
            ctx.font = "9px sans-serif";
            ctx.fillText(String(i), mx + p.x * scd + 5, my - p.y * scd - 7);
          }
        });
      }
      ctx.restore();
      if (ph === 2) {
        ctx.fillStyle = T.c6;
        ctx.font = "11px sans-serif";
        ctx.fillText("ε 大：折线绕 ζ* 振荡并偏离光滑螺线", bx + 10, by + 34);
      }
      const rx = S.W * 0.66;
      const zShow = ph === 2 ? (S.sim.zB || S.sim.zE) : (S.sim.zE || { x: 0, y: 0 });
      const aE = softmax([nv(zShow.x), nv(zShow.y), 0.15]);
      const cx = rx + 70, cy = S.H * 0.55, sc = 70;
      drawSimplex(ctx, cx, cy, sc, T);
      const p = simplexXY(aE[0], aE[1], aE[2], cx, cy, sc);
      roundDot(ctx, p.x, p.y, 6, ph === 2 ? T.c6 : T.c5);
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText(ph >= 3 ? "对应 KEMS 离散步" : "softmax 拉回单纯形", rx, 56);
      legend(ctx, [
        { c: T.c3, lab: "连续镜像 ODE" },
        { c: T.c5, lab: "前向欧拉折线" },
        { c: T.c6, lab: "大 ε 振荡" },
      ], rx, S.H - 70, T);
    },
  };

  /* ============================================================
   * 16. 嵌入层
   * ============================================================ */
  OP.embed_layer = {
    init(S) {
      /* 4 传感器 × 6 隐维，每个粒子略扰动 */
      const D = 6, M = 4;
      const W0 = [];
      for (let i = 0; i < 4; i++) {
        W0[i] = [];
        for (let d = 0; d < D; d++) W0[i][d] = 0.4 * Math.sin(i * 1.3 + d * 0.7) + 0.15;
      }
      S.sim = { W0, D, M, hist: [], x: [0.4, 0.5, 0.6, 0.5], gems: [], gain: 1 };
    },
    tick(S) {
      const hid = S.sliders.hid != null ? S.sliders.hid : 8;
      const gain = hid / 8;
      const x = [0, 1, 2, 3].map((i) => featAt(S.t, i));
      const gems = [];
      for (let l = 0; l < S.sim.M; l++) {
        const g = [];
        for (let d = 0; d < S.sim.D; d++) {
          let s = 0.08 * (l - 1.5) * gain;
          for (let i = 0; i < 4; i++) s += x[i] * S.sim.W0[i][d] * gain * 1.85;
          g.push(s);
        }
        gems.push(g);
      }
      S.sim.x = x; S.sim.gems = gems; S.sim.gain = gain;
      S.metrics["‖x‖"] = hypot.apply(null, x);
      S.metrics["‖g⁰‖"] = hypot.apply(null, gems[0]);
      S.metrics.隐维增益 = gain;
      pushHist(S.sim.hist, S.metrics["‖g⁰‖"], 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const x = S.sim.x || [0, 0, 0, 0];
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("原始过程变量 x", 18, 56);
      x.forEach((v, i) => {
        const y = 70 + i * 28;
        panel(ctx, 16, y, 90, 24, T, ph === 0, T.c2);
        ctx.fillStyle = T.c2;
        ctx.fillRect(110, y + 4, 80 * clamp(v, 0, 1), 16);
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText(SHORT[i] + "  " + v.toFixed(2), 20, y + 16);
      });
      if (ph >= 1) {
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
          ctx.fillText("W^{PV}  （×增益 " + nv(S.sim.gain).toFixed(2) + "）", S.W * 0.42, 56);
        const cell = 16;
        for (let i = 0; i < 4; i++) for (let d = 0; d < S.sim.D; d++) {
          const v = 0.5 + 0.5 * Math.tanh(S.sim.W0[i][d] * S.sim.gain);
          heatCell(ctx, S.W * 0.42 + d * cell, 70 + i * cell, cell, v, T, 1);
        }
        arrow(ctx, 200, 130, 40, 0, T.mu);
      }
      if (ph >= 2) {
        const g0 = (S.sim.gems && S.sim.gems[0]) || [];
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("g^{embed} = x W + b", S.W * 0.72, 56);
        g0.forEach((v, d) => {
          ctx.fillStyle = v >= 0 ? T.c3 : T.c6;
          const h = 40 * clamp(Math.abs(v), 0, 1.2) / 1.2;
          ctx.fillRect(S.W * 0.74 + d * 18, 150 - h, 14, h);
        });
      }
      if (ph >= 3) {
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("M 个粒子 → M 份嵌入（结构不确定）", 16, S.H - 92);
        (S.sim.gems || []).forEach((g, l) => {
          const x0 = 16 + l * ((S.W - 40) / 4);
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText("l=" + (l + 1), x0, S.H - 78);
          g.forEach((v, d) => {
            ctx.fillStyle = [T.c2, T.c3, T.c5, T.c7][l];
            const h = 22 * clamp(Math.abs(v), 0, 1.4) / 1.4;
            ctx.fillRect(x0 + d * 10, S.H - 52 - h, 8, h);
          });
        });
      }
    },
  };

  /* ============================================================
   * 17. NAM 加权消息平均
   * ============================================================ */
  OP.nam_message_average = {
    init(S) {
      const M = 4;
      const As = [];
      for (let l = 0; l < M; l++) {
        const A = AHAT.map((row, i) =>
          row.map((v, j) => {
            if (i === j) return 0.15;
            return v ? 0.5 + 0.5 * Math.abs(Math.sin(l * 1.7 + i + j)) : 0.03;
          })
        );
        As.push(A.map((row) => {
          const s = row.reduce((a, b) => a + b, 0) || 1;
          return row.map((v) => v / s);
        }));
      }
      S.sim = { As, hist: [] };
    },
    tick(S) {
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const gemb = SHORT.map((_, i) => featAt(S.t, i) * (0.6 + 0.1 * rate));
      const msgs = S.sim.As.map((A) => mulVec(A, gemb).map((v) => v * rate));
      const gmess = msgs[0].map((_, i) => msgs.reduce((s, m) => s + m[i], 0) / msgs.length);
      S.sim.gemb = gemb; S.sim.msgs = msgs; S.sim.gmess = gmess;
      S.metrics["‖g_embed‖"] = hypot.apply(null, gemb);
      S.metrics["‖g_mess‖"] = hypot.apply(null, gmess);
      S.metrics.M = S.sim.As.length;
      pushHist(S.sim.hist, S.metrics["‖g_mess‖"], 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const M = S.sim.As.length;
      const w = Math.min(78, (S.W * 0.7) / M);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("粒子化邻接 A_l", 16, 54);
      for (let l = 0; l < M; l++) {
        const x = 16 + l * (w + 10);
        panel(ctx, x, 62, w, w, T, ph === 0, T.c2);
        const c = (w - 8) / 5;
        for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) {
          heatCell(ctx, x + 4 + j * c, 66 + i * c, c, S.sim.As[l][i][j], T, 0.7);
        }
        ctx.fillStyle = T.mu;
        ctx.font = "10px sans-serif";
        ctx.fillText("A_" + (l + 1), x + 6, 62 + w + 12);
      }
      if (ph >= 1) {
        ctx.fillStyle = T.tx;
        ctx.font = "11px sans-serif";
        ctx.fillText("各自 g_embed @ A_l", 16, 62 + w + 28);
        (S.sim.msgs || []).forEach((m, l) => {
          const x = 16 + l * (w + 10);
          m.forEach((v, i) => {
            ctx.fillStyle = T.c5;
            ctx.fillRect(x + i * 10, 62 + w + 54 - 28 * clamp(v, 0, 1), 8, 28 * clamp(v, 0, 1));
          });
        });
      }
      if (ph >= 2 && S.sim.gmess) {
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("再对 l 平均  (1/M) Σ_l", S.W * 0.68, 56);
        const gx = S.W * 0.72, gy = 90;
        (S.sim.msgs || []).forEach((m, l) => {
          arrow(ctx, 16 + l * (w + 10) + w * 0.5, 62 + w + 58, gx - (16 + l * (w + 10) + w * 0.5) + 20, gy + 40 - (62 + w + 58), aa(T, T.c3, 0.45, 0.55));
        });
        panel(ctx, gx - 8, gy, S.W - gx, 110, T, ph >= 3, T.c3);
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText(ph >= 3 ? "稳健消息 g^{mess}" : "平均中…", gx, gy + 18);
        S.sim.gmess.forEach((v, i) => {
          ctx.fillStyle = T.c3;
          const h = 60 * clamp(v, 0, 1.2) / 1.2;
          const x = gx + 8 + i * 22;
          ctx.fillRect(x, gy + 96 - h, 16, h);
          ctx.fillStyle = T.mu;
          ctx.font = "10px sans-serif";
          ctx.fillText(SHORT[i], x, gy + 108);
        });
      }
      spark(ctx, S.sim.hist, 16, S.H - 36, 160, 18, T.c3, T);
    },
  };

  /* ============================================================
   * 18. 残差特征更新
   * ============================================================ */
  OP.residual_feature_update = {
    init(S) { S.sim = { hist: [], x: [0.4, 0.5, 0.5, 0.4, 0.6], Wid: [0.3, 0.4, 0.4, 0.3, 0.5], mess: [0, 0, 0, 0, 0], upd: [0.3, 0.4, 0.4, 0.3, 0.5], gain: 1 }; },
    tick(S) {
      const hid = S.sliders.hid != null ? S.sliders.hid : 8;
      const gain = hid / 8;
      const x = SHORT.map((_, i) => featAt(S.t, i));
      const Wid = x.map((v) => v * 0.85 * gain);
      const mess = x.map((v, i) => 0.35 * gain * Math.sin(S.t * 0.8 + i) * v);
      const drop = S.phase >= 3 ? 0.08 : 1; /* 消掉消息的对比 */
      const upd = Wid.map((v, i) => v + drop * mess[i]);
      S.sim.x = x; S.sim.Wid = Wid; S.sim.mess = mess; S.sim.upd = upd; S.sim.gain = gain;
      S.metrics["‖xW_id‖"] = hypot.apply(null, Wid);
      S.metrics["‖g_mess‖"] = hypot.apply(null, mess);
      S.metrics["‖g_upd‖"] = hypot.apply(null, upd);
      pushHist(S.sim.hist, S.metrics["‖g_upd‖"], 70);
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const W = S.W, H = S.H;
      /* 双支路 */
      const x0 = 40, x1 = W * 0.38, x2 = W * 0.7;
      const yTop = H * 0.32, yBot = H * 0.62, yM = H * 0.48;
      panel(ctx, x0, yBot - 36, 110, 72, T, ph === 0, T.c2);
      ctx.fillStyle = T.tx; ctx.font = "11px sans-serif";
      ctx.fillText("恒等  x W_id", x0 + 8, yBot - 16);
      (S.sim.Wid || []).forEach((v, i) => {
        ctx.fillStyle = T.c2;
        ctx.fillRect(x0 + 8 + i * 18, yBot + 24 - 28 * clamp(v, 0, 1), 14, 28 * clamp(v, 0, 1));
      });
      panel(ctx, x0, yTop - 36, 110, 72, T, ph === 1, T.c5);
      ctx.fillStyle = T.tx;
      ctx.fillText("图消息 g_mess", x0 + 8, yTop - 16);
      if (ph >= 1) {
        (S.sim.mess || []).forEach((v, i) => {
          ctx.fillStyle = T.c5;
          ctx.fillRect(x0 + 8 + i * 18, yTop + 24 - 28 * clamp(Math.abs(v) * 2, 0, 1), 14, 28 * clamp(Math.abs(v) * 2, 0, 1));
        });
      }
      if (ph >= 1) {
        arrow(ctx, x0 + 114, yTop, x1 - x0 - 130, yM - yTop, T.c5);
      }
      arrow(ctx, x0 + 114, yBot, x1 - x0 - 130, yM - yBot, T.c2);
      if (ph >= 2) {
        roundDot(ctx, x1, yM, 16, T.c3);
        ctx.fillStyle = T.dark ? "#061018" : "#0b1220";
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("+", x1, yM + 5);
        ctx.textAlign = "left";
        arrow(ctx, x1 + 20, yM, 36, 0, T.c3);
        panel(ctx, x2 - 20, yM - 50, W - x2, 100, T, true, T.c3);
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("g^{update}", x2 - 8, yM - 30);
        (S.sim.upd || []).forEach((v, i) => {
          ctx.fillStyle = T.c3;
          ctx.fillRect(x2 + i * 20, yM + 36 - 50 * clamp(v, 0, 1.2) / 1.2, 16, 50 * clamp(v, 0, 1.2) / 1.2);
        });
      }
      if (ph >= 3) {
        ctx.fillStyle = T.c6;
        ctx.font = "12px sans-serif";
        ctx.fillText("消息≈0 时，输出仍是 x 的线性变换（退路）", 18, 56);
      }
      spark(ctx, S.sim.hist, 16, H - 36, 150, 18, T.c3, T);
    },
  };

  /* ============================================================
   * 19. ReLU MLP 解码
   * ============================================================ */
  OP.relu_mlp_decoder = {
    init(S) {
      /* 手工构造可学的分段线性网络，tick 里对目标做 SGD */
      const units = 8;
      const W1 = [], b1 = [], W2 = [], b2 = 0.1;
      for (let i = 0; i < units; i++) {
        W1.push(1.2 * Math.sin(i * 0.9));
        b1.push(-1.4 + i * 0.4);
        W2.push(0.25 * Math.cos(i * 0.8));
      }
      const target0 = (x) => 0.55 * Math.sin(1.55 * x) + 0.22 * x;
      S.sim = { W1, b1, W2, b2, units, lossH: [], target: target0, fwd: (x) => 0.28 * x, lin: (x) => 0.22 * x, depth: 2, gain: 1, loss: 1, lossLin: 1, knots: [-2, 0, 2], ys: [0, 0, 0] };
    },
    tick(S) {
      const depth = Math.round(clamp(S.sliders.depth != null ? S.sliders.depth : 2, 1, 4));
      const hid = S.sliders.hid != null ? S.sliders.hid : 8;
      const gain = hid / 8;
      const target = (x) => 0.55 * Math.sin(1.55 * x) + 0.22 * x;
      /* ReLU 可表示任意分段线性：折点数随隐层增加 */
      const nK = 1 + 2 * depth;
      const knots = [];
      for (let i = 0; i <= nK; i++) knots.push(-2 + 4 * i / nK);
      const ys = knots.map((t) => target(t) * (0.25 + 0.75 * clamp(gain / 1.4, 0.2, 1.4)));
      const fwd = (x) => {
        if (x <= knots[0]) return ys[0];
        const last = knots.length - 1;
        if (x >= knots[last]) return ys[last];
        for (let i = 0; i < last; i++) {
          if (x <= knots[i + 1]) {
            const u = (x - knots[i]) / (knots[i + 1] - knots[i] || 1);
            return ys[i] + u * (ys[i + 1] - ys[i]);
          }
        }
        return ys[last];
      };
      const lin = (x) => 0.22 * x;
      let loss = 0, lossLin = 0;
      for (let k = 0; k < 16; k++) {
        const x = -2 + 4 * k / 15;
        const d = fwd(x) - target(x);
        const dl = lin(x) - target(x);
        loss += d * d; lossLin += dl * dl;
      }
      loss /= 16; lossLin /= 16;
      S.sim.fwd = fwd; S.sim.lin = lin; S.sim.target = target;
      S.sim.depth = depth; S.sim.gain = gain; S.sim.loss = loss; S.sim.lossLin = lossLin;
      S.sim.knots = knots; S.sim.ys = ys;
      pushHist(S.sim.lossH, loss, 80);
      S.metrics.隐层数 = depth;
      S.metrics.折点数 = nK;
      S.metrics.MSE = loss;
      S.metrics.线性MSE = lossLin;
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const ph = S.phase;
      const x0 = 40, y0 = 54, x1 = S.W - 24, y1 = S.H - 64;
      axisBox(ctx, x0, y0, x1, y1, T, "g^{update}", "");
      const X = (x) => x0 + (x + 2) / 4 * (x1 - x0);
      const Y = (v) => y1 - (v + 1.2) / 2.6 * (y1 - y0);
      ctx.beginPath();
      for (let i = 0; i <= 80; i++) {
        const x = -2 + 4 * i / 80;
        const y = S.sim.target(x);
        if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
      }
      ctx.strokeStyle = T.c6; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
      if (ph === 2) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const x = -2 + 4 * i / 80;
          const px = X(x), py1 = Y(S.sim.target(x)), py2 = Y(S.sim.fwd(x));
          if (i) ctx.lineTo(px, py1); else ctx.moveTo(px, py1);
        }
        for (let i = 80; i >= 0; i--) {
          const x = -2 + 4 * i / 80;
          ctx.lineTo(X(x), Y(S.sim.fwd(x)));
        }
        ctx.closePath();
        ctx.fillStyle = aa(T, T.c6, 0.18, 0.22);
        ctx.fill();
      }
      if (ph >= 1) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const x = -2 + 4 * i / 80;
          const y = S.sim.fwd(x);
          if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
        }
        ctx.strokeStyle = T.c3;
        ctx.lineWidth = 2.6;
        ctx.stroke();
      }
      if (ph === 3) {
        ctx.beginPath();
        for (let i = 0; i <= 80; i++) {
          const x = -2 + 4 * i / 80;
          const y = S.sim.lin(x);
          if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
        }
        ctx.strokeStyle = T.mu;
        ctx.lineWidth = 2.8;
        ctx.stroke();
      }
      if (ph === 1 && S.sim.knots) {
        S.sim.knots.forEach((t, i) => {
          roundDot(ctx, X(t), Y(S.sim.ys[i]), 5, T.c5);
        });
      }
      if (ph === 0) {
        for (let i = 0; i < 5; i++) {
          const b = -1.6 + i * 0.7;
          ctx.beginPath();
          for (let k = 0; k <= 40; k++) {
            const x = -2 + 4 * k / 40;
            const y = 0.28 * nv(S.sim.gain) * Math.max(0, x - b);
            if (k) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y));
          }
          ctx.strokeStyle = aa(T, T.c5, 0.55, 0.7);
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
        ctx.fillStyle = T.tx;
        ctx.font = "12px sans-serif";
        ctx.fillText("ReLU 折线基：max(0, x−b)", 50, 72);
      }
      if (ph === 1) {
        ctx.fillStyle = T.c5;
        ctx.font = "12px sans-serif";
        ctx.fillText("隐层 " + S.sim.depth + "  →  折点 " + (S.sim.knots.length - 1) + "  （黄点）", 50, 72);
      }
      if (ph === 2) {
        ctx.fillStyle = T.c3;
        ctx.font = "12px sans-serif";
        ctx.fillText("ŷ 跟踪目标 y（红虚线）  MSE=" + nv(S.sim.loss).toFixed(3), 50, 72);
      }
      if (ph === 3) {
        ctx.fillStyle = T.mu;
        ctx.font = "12px sans-serif";
        ctx.fillText("纯线性 MSE=" + nv(S.sim.lossLin).toFixed(3) + "  vs ReLU " + nv(S.sim.loss).toFixed(3), 50, 72);
      }
      legend(ctx, [
        { c: T.c6, lab: "真值 y" },
        { c: T.c3, lab: "ReLU 分段线性 ŷ" },
        { c: T.c5, lab: "折点 / 单支 ReLU" },
      ], 40, S.H - 48, T);
      spark(ctx, S.sim.lossH, S.W - 150, 58, 126, 24, T.c3, T, 0, 0.5);
    },
  };

  /* reset() 只 init+draw 不 tick：这里保证每个算子 init 后立刻有可画状态，
     且 draw 抛错时补一次 tick 再画，避免「动画错误」红字。 */
  const CH5_IDS = [
    "mpnn_message", "mpnn_update", "nam_normalize", "simplex_factorization",
    "dirichlet_entropy", "implicit_likelihood", "entropy_regularized_functional",
    "functional_perturbation", "rkhs_perturbation_direction", "kl_descent_sufficient_condition",
    "entropy_bregman_potential", "entropy_bregman_divergence", "mirror_map_log",
    "kems_simplex_update", "forward_euler_ode", "embed_layer", "nam_message_average",
    "residual_feature_update", "relu_mlp_decoder",
  ];
  CH5_IDS.forEach(function (id) {
    const orig = OP[id];
    if (!orig || orig.__ch5wrap) return;
    const wrapped = {
      __ch5wrap: true,
      init: function (S) {
        orig.init(S);
        try { orig.tick(S, 0); } catch (e) { S.metrics._e = String(e && e.message || e); }
      },
      tick: function (S, dt) { orig.tick(S, dt || 0); },
      draw: function (ctx, S, T) {
        try {
          const sig = JSON.stringify(S.sliders || {});
          if (!S.playing && S.sim && S.sim._sls !== sig) {
            S.sim._sls = sig;
            try { orig.tick(S, 0); } catch (e0) {}
          }
          orig.draw(ctx, S, T);
          sliderChips(ctx, S, T);
        } catch (e) {
          try {
            orig.tick(S, 0);
            orig.draw(ctx, S, T);
            sliderChips(ctx, S, T);
          } catch (e2) {
            ctx.fillStyle = T.c6;
            ctx.font = "12px sans-serif";
            ctx.fillText("动画错误: " + (e2 && e2.message || e2), 16, 48);
          }
        }
      },
    };
    OP[id] = wrapped;
  });

})(typeof window !== "undefined" ? window : globalThis);
