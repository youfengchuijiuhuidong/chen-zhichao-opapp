/* 第3章：缺失补全 / 熵分解 / NER / RKHS / KnewImp 专属动画 */
(function (g) {
  "use strict";
  const OP = (g.OP_ANIMS = g.OP_ANIMS || {});
  const TWO = Math.PI * 2;
  const FONT = '"Noto Sans CJK SC","Noto Sans SC","PingFang SC",sans-serif';
  const LN2PI = Math.log(2 * Math.PI);
  const E = Math.E;

  /* ---------- 数值工具 ---------- */
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const hypot = Math.hypot;
  const fin = (x, fb) => (Number.isFinite(x) ? x : (fb == null ? 0 : fb));
  function mulberry(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(x, m, s) {
    s = Math.max(1e-4, s);
    const z = (x - m) / s;
    return Math.exp(-0.5 * z * z) / (s * Math.sqrt(TWO));
  }
  function logN(x, m, s) {
    s = Math.max(1e-4, s);
    const z = (x - m) / s;
    return -0.5 * (LN2PI + 2 * Math.log(s) + z * z);
  }
  function klG(m0, s0, m1, s1) {
    s0 = Math.max(1e-4, s0); s1 = Math.max(1e-4, s1);
    return Math.log(s1 / s0) + (s0 * s0 + (m0 - m1) * (m0 - m1)) / (2 * s1 * s1) - 0.5;
  }
  function hG(s) { s = Math.max(1e-4, s); return 0.5 * Math.log(TWO * E * s * s); }
  function limpG(mq, sq, mp, sp) {
    sp = Math.max(1e-4, sp); sq = Math.max(0, sq);
    return -0.5 * (LN2PI + 2 * Math.log(sp)) - (sq * sq + (mq - mp) * (mq - mp)) / (2 * sp * sp);
  }
  function rbf(dx, dy, v) {
    v = Math.max(1e-4, v);
    return Math.exp(-(dx * dx + dy * dy) / v);
  }
  function pfrac(S) { return smooth((S.t / 2.4) % 1); }
  function phCol(T, i) { return [T.c2, T.c3, T.c5, T.c6][i & 3]; }

  /* ---------- 绘图工具 ---------- */
  function font(ctx, px, bold) {
    ctx.font = (bold ? "bold " : "") + px + "px " + FONT;
  }
  function hexA(hex, a) {
    if (!hex || hex[0] !== "#" || hex.length < 7) return "rgba(120,140,180," + a + ")";
    const n = parseInt(hex.slice(1, 7), 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function mixHex(a, b, t) {
    t = clamp(t, 0, 1);
    const pa = parseInt((a || "#888888").slice(1, 7), 16);
    const pb = parseInt((b || "#888888").slice(1, 7), 16);
    const r = ((pa >> 16) & 255) + ((((pb >> 16) & 255) - ((pa >> 16) & 255)) * t);
    const g = ((pa >> 8) & 255) + ((((pb >> 8) & 255) - ((pa >> 8) & 255)) * t);
    const bl = (pa & 255) + (((pb & 255) - (pa & 255)) * t);
    return "rgb(" + (r | 0) + "," + (g | 0) + "," + (bl | 0) + ")";
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
  function glow(ctx, x, y, r, col) {
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TWO); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TWO); ctx.fill();
    ctx.restore();
  }
  function banner(ctx, S, T) {
    const txt = (S.steps && S.steps[S.phase]) || "";
    font(ctx, 12, false);
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
    font(ctx, 11, false);
    const w = ctx.measureText(text).width + 10;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.72)" : "rgba(255,255,255,0.82)";
    rr(ctx, x, y - 12, w, 16, 4); ctx.fill();
    ctx.strokeStyle = col || T.c5;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col || T.tx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 5, y - 4);
  }
  function txt(ctx, s, x, y, col, px, align, bold) {
    font(ctx, px || 12, !!bold);
    ctx.fillStyle = col;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(String(s), x, y);
  }
  function badge(ctx, S, T, title) {
    font(ctx, 12, true);
    const w = Math.min(S.W - 24, ctx.measureText(title).width + 16);
    ctx.fillStyle = hexA(phCol(T, S.phase), T.dark ? 0.22 : 0.28);
    rr(ctx, 10, 8, w, 22, 7); ctx.fill();
    ctx.strokeStyle = hexA(phCol(T, S.phase), 0.7);
    ctx.lineWidth = 1; rr(ctx, 10, 8, w, 22, 7); ctx.stroke();
    txt(ctx, title, 18, 24, T.tx, 12, "left", true);
  }
  function chip(ctx, S, T, formula) {
    font(ctx, 11, false);
    const w = Math.min(S.W * 0.48, ctx.measureText(formula).width + 14);
    const x = S.W - 12 - w;
    ctx.fillStyle = T.dark ? "rgba(8,14,26,.55)" : "rgba(255,255,255,.7)";
    rr(ctx, x, 8, w, 20, 6); ctx.fill();
    txt(ctx, formula, x + 7, 22, T.mu, 11, "left", false);
  }
  function paramBadge(ctx, S, T, lab, val) {
    const s = lab + "  " + (typeof val === "number" ? val.toFixed(2) : val);
    font(ctx, 11, true);
    const w = Math.min(140, ctx.measureText(s).width + 12);
    ctx.fillStyle = hexA(T.c5, T.dark ? 0.22 : 0.35);
    rr(ctx, S.W - 12 - w, 30, w, 18, 5); ctx.fill();
    txt(ctx, s, S.W - 6 - w / 2, 43, T.tx, 11, "center", true);
  }
  function phaseEnter(S, fn) {
    if (S.sim._entered !== S.phase) {
      S.sim._entered = S.phase;
      fn(S.phase);
    }
  }
  function legend(ctx, items, x, y, T) {
    if (!items || !items.length) return;
    ctx.save();
    font(ctx, 11, false);
    let totW = 0;
    items.forEach((it) => {
      const txt = it.lab || it.l || it.t || "";
      totW += 16 + ctx.measureText(txt).width + 12;
    });
    const boxW = totW + 4;
    const boxH = 18;
    ctx.fillStyle = T.dark ? "rgba(11, 18, 32, 0.85)" : "rgba(255, 255, 255, 0.88)";
    rr(ctx, x - 4, y - 13, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    let xx = x;
    items.forEach((it) => {
      const txt = it.lab || it.l || it.t || "";
      ctx.fillStyle = it.c;
      ctx.beginPath(); ctx.arc(xx + 5, y - 4, 4.5, 0, TWO); ctx.fill();
      font(ctx, 11, false);
      ctx.fillStyle = T.mu;
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillText(txt, xx + 13, y);
      xx += 16 + ctx.measureText(txt).width + 12;
    });
    ctx.restore();
  }
  function axes(ctx, x0, y0, x1, y1, T, xl, yl) {
    ctx.strokeStyle = T.line; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
    ctx.moveTo(x0, y1); ctx.lineTo(x0, y0);
    ctx.stroke();
    if (xl) txt(ctx, xl, x1 - 2, y1 + 14, T.mu, 11, "right");
    if (yl) txt(ctx, yl, x0 + 4, y0 + 11, T.mu, 11, "left");
  }
  function arrow(ctx, x, y, dx, dy, col, lw, maxL) {
    const L = hypot(dx, dy);
    if (L < 0.8) return;
    const cap = maxL || 30;
    if (L > cap) { const s = cap / L; dx *= s; dy *= s; }
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + dx, y + dy); ctx.stroke();
    const a = Math.atan2(dy, dx), s = Math.min(8, L * 0.35);
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - s * Math.cos(a - 0.4), y + dy - s * Math.sin(a - 0.4));
    ctx.lineTo(x + dx - s * Math.cos(a + 0.4), y + dy - s * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fill();
  }
  function fillCurve(ctx, xs, ys, mapX, mapY, col, a) {
    if (!xs.length) return;
    ctx.beginPath();
    ctx.moveTo(mapX(xs[0]), mapY(0));
    for (let i = 0; i < xs.length; i++) ctx.lineTo(mapX(xs[i]), mapY(ys[i]));
    ctx.lineTo(mapX(xs[xs.length - 1]), mapY(0));
    ctx.closePath();
    ctx.fillStyle = hexA(col, a); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(mapX(xs[0]), mapY(ys[0]));
    for (let i = 1; i < xs.length; i++) ctx.lineTo(mapX(xs[i]), mapY(ys[i]));
    ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
  }
  function valColor(v, T) {
    v = clamp(v, 0, 1);
    if (v < 0.5) return mixHex(T.c2, T.c3, v * 2);
    return mixHex(T.c3, T.c5, (v - 0.5) * 2);
  }
  function holeFill(T) { return T.dark ? "#0a1220" : "#f4f7fc"; }
  function drawMatrix(ctx, X, M, box, T, opt) {
    opt = opt || {};
    const n = X.length, d = X[0].length;
    const cw = box.w / d, ch = box.h / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < d; j++) {
        const x = box.x + j * cw, y = box.y + i * ch;
        const miss = M && M[i][j] === 0;
        const hide = (opt.hideMiss && miss) || (opt.punch && miss && opt.punch > ((i * d + j) % 13) / 13);
        if (hide) {
          ctx.fillStyle = holeFill(T);
          ctx.fillRect(x, y, Math.max(1, cw - 1), Math.max(1, ch - 1));
          ctx.strokeStyle = hexA(T.c6, 0.55);
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, Math.max(1, cw - 2), Math.max(1, ch - 2));
          if (opt.cross && cw > 10 && ch > 10) {
            ctx.beginPath();
            ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + cw - 4, y + ch - 4);
            ctx.moveTo(x + cw - 4, y + 3); ctx.lineTo(x + 3, y + ch - 4);
            ctx.stroke();
          }
        } else {
          let a = opt.alpha == null ? 1 : opt.alpha;
          if (opt.dimMiss && miss) a *= 0.22;
          ctx.globalAlpha = a;
          ctx.fillStyle = valColor(X[i][j], T);
          ctx.fillRect(x, y, Math.max(1, cw - 1), Math.max(1, ch - 1));
          ctx.globalAlpha = 1;
          if (cw > 16 && ch > 14 && !opt.noText) {
            txt(ctx, X[i][j].toFixed(1), x + cw / 2, y + ch / 2 + 4, T.dark ? "#0b1220" : "#152038", 9, "center");
          }
        }
        if (opt.hiObs && M && M[i][j] === 1) {
          ctx.strokeStyle = T.c4; ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, Math.max(1, cw - 3), Math.max(1, ch - 3));
        }
        if (opt.hiMiss && miss && !hide) {
          ctx.strokeStyle = T.c6; ctx.lineWidth = 2;
          ctx.strokeRect(x + 1, y + 1, Math.max(1, cw - 3), Math.max(1, ch - 3));
        }
      }
    }
    if (opt.title) txt(ctx, opt.title, box.x, box.y - 6, T.tx, 12, "left", true);
  }
  function makeX(n, d, seed) {
    const rng = mulberry(seed);
    const X = [];
    for (let i = 0; i < n; i++) {
      const load = rng();
      const row = [];
      for (let j = 0; j < d; j++) {
        const base = [load, 0.25 + 0.7 * load, 1 - load, Math.abs(load - 0.5) * 2, 0.35 + 0.4 * Math.sin(i + j), 0.2 + 0.6 * rng()][j % 6];
        row.push(clamp(base + (rng() - 0.5) * 0.12, 0.02, 0.98));
      }
      X.push(row);
    }
    return X;
  }
  function makeM(n, d, miss, seed) {
    const rng = mulberry(seed + 17);
    const M = [];
    for (let i = 0; i < n; i++) {
      const row = [];
      for (let j = 0; j < d; j++) row.push(rng() > miss ? 1 : 0);
      M.push(row);
    }
    if (M[0][0] === 0) M[0][0] = 1;
    return M;
  }
  function countM(M) {
    let o = 0, m = 0;
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M[i].length; j++) (M[i][j] ? o++ : m++);
    return { o, m };
  }
  function hist(arr, lo, hi, bins) {
    const h = new Array(bins).fill(0);
    const w = (hi - lo) || 1;
    for (let i = 0; i < arr.length; i++) {
      const k = clamp(((arr[i] - lo) / w) * bins, 0, bins - 1e-6) | 0;
      h[k]++;
    }
    return h;
  }
  function entHist(h) {
    const n = h.reduce((a, b) => a + b, 0) || 1;
    let H = 0;
    for (let i = 0; i < h.length; i++) if (h[i]) {
      const p = h[i] / n;
      H -= p * Math.log(p);
    }
    return H;
  }
  function box(S, l, t, r, b) {
    const x0 = l, y0 = t, x1 = S.W - r, y1 = S.H - b;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, x0, y0, x1, y1 };
  }
  function forcePhase(S) {
    if (typeof g.__CH3_FORCE_PHASE === "number") {
      const n = S.steps.length || 1;
      S.phase = ((g.__CH3_FORCE_PHASE % n) + n) % n;
    }
  }

  const MINE = [];
  function reg(id, impl) {
    MINE.push(id);
    OP[id] = {
      init(S) { impl.init(S); },
      tick(S, dt) {
        forcePhase(S);
        if (g.__CH3_FREEZE) return;
        impl.tick(S, dt);
      },
      draw(ctx, S, T) { forcePhase(S); g.__CH3_S = S; impl.draw(ctx, S, T); },
    };
  }

  /* ===================================================================
   * 1. 遮罩矩阵  M∈{0,1}^{N×D}
   * =================================================================== */
  reg("mask_matrix", {
    init(S) {
      S.sim.n = 8; S.sim.d = 6;
      S.sim.X = makeX(8, 6, 3);
      S.sim.missUsed = -1;
    },
    tick(S) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) {
        S.sim.missUsed = miss;
        S.sim.M = makeM(S.sim.n, S.sim.d, miss, 21);
      }
      const c = countM(S.sim.M);
      S.metrics.缺失率 = miss;
      S.metrics.观测格 = c.o;
      S.metrics.缺失格 = c.m;
    },
    draw(ctx, S, T) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) {
        S.sim.missUsed = miss; S.sim.M = makeM(S.sim.n, S.sim.d, miss, 21);
      }
      const ph = S.phase, X = S.sim.X, M = S.sim.M;
      const titles = ["完整数据矩阵 X", "按缺失率挖空（M=0）", "观测格保持数值（M=1）", "缺失格进入补全流程"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "M∈{0,1}^{N×D}");
      paramBadge(ctx, S, T, "缺失率", miss);
      const B = box(S, 36, 44, ph === 3 ? 150 : 22, 40);
      if (ph === 0) {
        drawMatrix(ctx, X, null, B, T, { title: "X  完整表", noText: B.w < 220 });
        legend(ctx, [{ c: T.c2, lab: "低值" }, { c: T.c3, lab: "中" }, { c: T.c5, lab: "高值" }], 36, S.H - 18, T);
      } else if (ph === 1) {
        drawMatrix(ctx, X, M, B, T, { title: "挖空中 · 缺失率 " + miss.toFixed(2), hideMiss: true, punch: 1, cross: true, noText: B.w < 220 });
        txt(ctx, "叉号 = M=0 洞", B.x, B.y1 + 16, T.c6, 11);
      } else if (ph === 2) {
        const w2 = (B.w - 16) / 2;
        drawMatrix(ctx, X, M, { x: B.x, y: B.y, w: w2, h: B.h, x0: B.x, y0: B.y, x1: B.x + w2, y1: B.y1 }, T, { title: "X⊙M 观测", hideMiss: true, hiObs: true, noText: true });
        drawMatrix(ctx, M.map((r) => r.map((v) => v)), null, { x: B.x + w2 + 16, y: B.y, w: w2, h: B.h }, T, { title: "遮罩 M", noText: true });
        legend(ctx, [{ c: T.c4, lab: "M=1 钉死原值" }, { c: T.c6, lab: "M=0 空洞" }], 36, S.H - 18, T);
      } else {
        drawMatrix(ctx, X, M, B, T, { title: "缺失格 →", hideMiss: true, hiMiss: true, cross: true, noText: true });
        const px = S.W - 132, py = 70;
        ctx.fillStyle = hexA(T.c6, T.dark ? 0.16 : 0.22);
        rr(ctx, px, py, 118, 160, 10); ctx.fill();
        ctx.strokeStyle = T.c6; ctx.lineWidth = 1.6; rr(ctx, px, py, 118, 160, 10); ctx.stroke();
        txt(ctx, "补全流程", px + 59, py + 28, T.c6, 13, "center", true);
        txt(ctx, "只改 M=0", px + 59, py + 52, T.tx, 12, "center");
        txt(ctx, "M=1 原样保留", px + 59, py + 74, T.mu, 11, "center");
        arrow(ctx, B.x + B.w + 6, B.y + B.h * 0.45, 28, 0, T.c6, 2);
        const c = countM(M);
        txt(ctx, "待填 " + c.m + " 格", px + 59, py + 110, T.c5, 12, "center", true);
      }
    },
  });

  /* ===================================================================
   * 2. 补全合成  X̂ = Xobs⊙M + Ximp⊙(1-M)
   * =================================================================== */
  reg("imputation_composition", {
    init(S) {
      S.sim.n = 7; S.sim.d = 5;
      S.sim.X = makeX(7, 5, 9);
      const rng = mulberry(44);
      S.sim.Imp = S.sim.X.map((row) => row.map((v) => clamp(v * 0.35 + 0.5 * rng(), 0.05, 0.95)));
      S.sim.missUsed = -1;
    },
    tick(S) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) {
        S.sim.missUsed = miss; S.sim.M = makeM(7, 5, miss, 5);
      }
      const { X, Imp, M } = S.sim;
      let dObs = 0, dMiss = 0, nO = 0, nM = 0;
      for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) {
        const hat = M[i][j] ? X[i][j] : Imp[i][j];
        if (M[i][j]) { dObs += Math.abs(hat - X[i][j]); nO++; }
        else { dMiss += (hat - X[i][j]) * (hat - X[i][j]); nM++; }
      }
      S.metrics.观测偏移 = dObs; /* 必须为 0 */
      S.metrics.缺失MSE = nM ? dMiss / nM : 0;
      S.metrics.缺失率 = miss;
    },
    draw(ctx, S, T) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) { S.sim.missUsed = miss; S.sim.M = makeM(7, 5, miss, 5); }
      const ph = S.phase, { X, Imp, M } = S.sim;
      const Hat = X.map((row, i) => row.map((v, j) => (M[i][j] ? v : Imp[i][j])));
      const titles = ["左：观测矩阵（空洞）", "中：补全提案（可乱改）", "按 M 拼回合成", "已观测格完全不变"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "X̂=Xobs⊙M + Ximp⊙(1-M)");
      paramBadge(ctx, S, T, "缺失率", miss);
      const gap = 10;
      const W = S.W - 28, Hm = S.H - 86;
      const w = (W - 2 * gap) / 3;
      const boxes = [0, 1, 2].map((k) => ({ x: 14 + k * (w + gap), y: 42, w, h: Hm }));
      const dim = (k) => {
        ctx.save();
        if (ph !== k && ph < 2) ctx.globalAlpha = 0.28;
        else if (ph === 2) ctx.globalAlpha = 1;
        else if (ph === 3 && k !== 2) ctx.globalAlpha = 0.35;
      };
      dim(0);
      drawMatrix(ctx, X, M, boxes[0], T, { title: "Xobs", hideMiss: true, cross: true, noText: w < 120, hiObs: ph === 3 || ph === 0 });
      ctx.restore();
      dim(1);
      drawMatrix(ctx, Imp, null, boxes[1], T, { title: "Ximp 提案", noText: w < 120, hiMiss: ph === 1, alpha: 1 });
      ctx.restore();
      dim(2);
      drawMatrix(ctx, Hat, M, boxes[2], T, { title: "X̂ 合成", noText: w < 120, hiObs: ph === 3, hiMiss: ph === 2 });
      ctx.restore();
      if (ph === 2) {
        arrow(ctx, boxes[0].x + w + 2, 42 + Hm * 0.35, 16, 0, T.c4, 2);
        arrow(ctx, boxes[1].x + w + 2, 42 + Hm * 0.65, 16, 0, T.c6, 2);
        txt(ctx, "M=1", boxes[0].x + w - 2, 42 + Hm * 0.35 - 6, T.c4, 10, "right");
        txt(ctx, "M=0", boxes[1].x + w - 2, 42 + Hm * 0.65 - 6, T.c6, 10, "right");
      }
      if (ph === 3) {
        txt(ctx, "核对 ‖(X̂−Xobs)⊙M‖∞ = 0  → 观测格硬约束成立", 16, S.H - 18, T.c4, 12, "left", true);
      } else {
        legend(ctx, [{ c: T.c4, lab: "观测钉死" }, { c: T.c6, lab: "只填空洞" }], 16, S.H - 16, T);
      }
    },
  });

  /* ===================================================================
   * 3. E 步 KL 推断  Q ← argmin KL(Q ‖ p(xmiss|xobs))
   * =================================================================== */
  reg("em_e_step_kl", {
    init(S) {
      S.sim.mq = -1.6; S.sim.sq = 1.15;
      S.sim.xs = new Array(36).fill(0);
    },
    tick(S, dt) {
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const rho = S.phase === 3 ? 0.18 : 0.84;
      const sJoint = 0.95, sObs = 0.7;
      const xobs = 0.45;
      const mp = rho * (sJoint / sObs) * xobs * 0.85;
      const sp = Math.max(0.12, sJoint * Math.sqrt(Math.max(0.05, 1 - rho * rho)));
      S.sim.mp = mp; S.sim.sp = sp; S.sim.rho = rho; S.sim.xobs = xobs;
      const k = 1 - Math.exp(-dt * 1.8 * rate);
      if (S.phase === 0) { /* 停在初始宽 Q */ }
      else {
        S.sim.mq += (mp - S.sim.mq) * k;
        S.sim.sq += (sp * (S.phase === 3 ? 1.05 : 1) - S.sim.sq) * k;
      }
      const rng = Math.random;
      for (let i = 0; i < S.sim.xs.length; i++) {
        const u = rng() || 1e-9, v = rng();
        S.sim.xs[i] = S.sim.mq + S.sim.sq * Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
      }
      S.metrics.KL = klG(S.sim.mq, S.sim.sq, mp, sp);
      S.metrics.后验σ = sp;
      S.metrics.Q均值 = S.sim.mq;
      S.metrics.ρ = rho;
    },
    draw(ctx, S, T) {
      const ph = S.phase;
      const rate = S.sliders.rate != null ? S.sliders.rate : 1;
      const rho = ph === 3 ? 0.16 : 0.84;
      const sJoint = 0.95, sObs = 0.7, xobs = 0.45;
      const mp = rho * (sJoint / sObs) * xobs * 0.85;
      const sp = Math.max(0.12, sJoint * Math.sqrt(Math.max(0.05, 1 - rho * rho)));
      const pull = ph === 0 ? 0.06 : clamp(rate / 1.7, 0.18, 1);
      const mq = lerp(-1.55, mp, ph === 3 ? 0.45 : pull);
      const sq = ph === 3 ? Math.max(sp, 0.95) : lerp(1.22, sp, pull);
      const titles = ["固定 θ，切出条件后验", "Q 被拉向该后验", "用后验均值/样本填缺失", "后验很平时样本很散"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "min_Q KL(Q‖P(x_m|x_o))");
      paramBadge(ctx, S, T, "提升速度", rate);
      const B = box(S, 44, 48, 18, 38);
      const xr = 3.2;
      const mX = (x) => B.x0 + (x + xr) / (2 * xr) * B.w;
      const mY = (y) => B.y1 - y * (B.h - 8) / 1.35;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss", "密度");
      const xs = [], pP = [], pQ = [];
      for (let i = 0; i <= 120; i++) {
        const x = -xr + 2 * xr * i / 120;
        xs.push(x); pP.push(gauss(x, mp, sp)); pQ.push(gauss(x, mq, sq));
      }
      if (ph === 0) {
        fillCurve(ctx, xs, pP, mX, mY, T.c5, 0.22);
        txt(ctx, "条件后验 P(x_m | x_o=" + xobs.toFixed(2) + ")  ρ=" + rho.toFixed(2), 84, 64, T.c5, 12);
        ctx.strokeStyle = T.c3; ctx.setLineDash([5, 4]); ctx.beginPath();
        ctx.moveTo(mX(xobs), B.y0); ctx.lineTo(mX(xobs), B.y1); ctx.stroke();
        ctx.setLineDash([]);
        txt(ctx, "x_obs 钉住", mX(xobs) + 6, B.y0 + 14, T.c3, 11);
      } else if (ph === 1) {
        fillCurve(ctx, xs, pP, mX, mY, T.c5, 0.12);
        fillCurve(ctx, xs, pQ, mX, mY, T.c2, 0.25);
        arrow(ctx, mX(mq), mY(gauss(mq, mq, sq)) - 8, mX(mp) - mX(mq), 0, T.c4, 2);
        legend(ctx, [{ c: T.c5, lab: "后验 P" }, { c: T.c2, lab: "变分 Q  (速率越大贴得越近)" }], 84, 64, T);
      } else if (ph === 2) {
        fillCurve(ctx, xs, pP, mX, mY, T.c5, 0.1);
        fillCurve(ctx, xs, pQ, mX, mY, T.c2, 0.18);
        for (let i = 0; i < 28; i++) {
          const u = ((i * 17 + 3) % 100) / 100 || 1e-9;
          const x = mq + sq * Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * i / 28);
          ctx.fillStyle = T.c6;
          ctx.beginPath(); ctx.arc(mX(clamp(x, -xr, xr)), B.y1 - 7, 3.2, 0, TWO); ctx.fill();
        }
        ctx.strokeStyle = T.c4; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(mX(mq), B.y0); ctx.lineTo(mX(mq), B.y1); ctx.stroke();
        txt(ctx, "填入均值 " + mq.toFixed(2), mX(mq) + 6, B.y0 + 16, T.c4, 12);
      } else {
        fillCurve(ctx, xs, pP, mX, mY, T.c6, 0.28);
        for (let i = 0; i < 28; i++) {
          const x = mq + sq * Math.cos(TWO * i / 28) * 1.6;
          ctx.fillStyle = hexA(T.c6, 0.9);
          ctx.beginPath(); ctx.arc(mX(clamp(x, -xr, xr)), B.y1 - 7, 3.4, 0, TWO); ctx.fill();
        }
        txt(ctx, "ρ=" + rho.toFixed(2) + " → 后验几乎平坦，补全值乱飘", 84, 64, T.c6, 12, "left", true);
      }
      S.metrics.KL = klG(mq, sq, mp, sp);
      S.metrics.后验σ = sp;
      S.metrics.Q均值 = mq;
      S.metrics.ρ = rho;
    },
  });

  /* ===================================================================
   * 4. M 步联合似然  θ ← argmax E_Q[log p_θ(xmiss,xobs)]
   * =================================================================== */
  reg("em_m_step_joint_likelihood", {
    init(S) {
      const rng = mulberry(12);
      const pts = [];
      for (let i = 0; i < 40; i++) {
        const x = -1.5 + 3 * rng();
        const y = 0.55 * x * x - 0.25 + (rng() - 0.5) * 0.16;
        pts.push({ x, y, yt: y, miss: rng() < 0.45 });
      }
      S.sim.pts = pts;
      S.sim.th0 = { mx: 0, my: 0.45, sxx: 1.35, syy: 1.2, sxy: 0 };
      S.sim.th = { mx: 0, my: 0.45, sxx: 1.35, syy: 1.2, sxy: 0 };
      S.sim.llH = Array.from({ length: 18 }, (_, i) => -2.2 + 1.4 * (1 - Math.exp(-i / 6)));
      S.sim.mseH = Array.from({ length: 18 }, (_, i) => 0.42 + 0.012 * i + 0.03 * Math.sin(i));
      S.sim.acc = 0;
    },
    tick(S, dt) {
      const rate = clamp((S.sliders.rate != null ? S.sliders.rate : 1) * 0.35, 0.08, 0.9);
      S.sim.acc += dt;
      const th = S.sim.th, pts = S.sim.pts;
      /* E：用当前高斯条件期望填 y */
      const done = pts.map((p) => {
        if (!p.miss) return { x: p.x, y: p.y };
        const y = th.my + (th.sxy / Math.max(th.sxx, 1e-4)) * (p.x - th.mx);
        return { x: p.x, y };
      });
      let mx = 0, my = 0;
      done.forEach((p) => { mx += p.x; my += p.y; });
      mx /= done.length; my /= done.length;
      let sxx = 0, syy = 0, sxy = 0;
      done.forEach((p) => {
        const dx = p.x - mx, dy = p.y - my;
        sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
      });
      const n = done.length;
      sxx = Math.max(sxx / n, 1e-4); syy = Math.max(syy / n, 1e-4); sxy /= n;
      const maxc = 0.97 * Math.sqrt(sxx * syy);
      sxy = clamp(sxy, -maxc, maxc);
      if (S.phase >= 1) {
        th.mx += (mx - th.mx) * rate; th.my += (my - th.my) * rate;
        th.sxx += (sxx - th.sxx) * rate; th.syy += (syy - th.syy) * rate; th.sxy += (sxy - th.sxy) * rate;
        th.sxx = Math.max(th.sxx, 1e-4); th.syy = Math.max(th.syy, 1e-4);
        const cap = 0.97 * Math.sqrt(th.sxx * th.syy);
        th.sxy = clamp(th.sxy, -cap, cap);
      }
      /* 联合高斯对数似然（完整表） */
      const det = Math.max(1e-6, th.sxx * th.syy - th.sxy * th.sxy);
      let ll = -0.5 * n * (LN2PI * 2 + Math.log(det));
      const ixx = th.syy / det, iyy = th.sxx / det, ixy = -th.sxy / det;
      done.forEach((p) => {
        const dx = p.x - th.mx, dy = p.y - th.my;
        ll -= 0.5 * (ixx * dx * dx + 2 * ixy * dx * dy + iyy * dy * dy);
      });
      let mse = 0, nm = 0;
      pts.forEach((p, i) => {
        if (!p.miss) return;
        mse += (done[i].y - p.yt) * (done[i].y - p.yt); nm++;
      });
      mse = nm ? mse / nm : 0;
      if (S.sim.acc > 0.12) {
        S.sim.acc = 0;
        S.sim.llH.push(ll); S.sim.mseH.push(mse);
        if (S.sim.llH.length > 48) { S.sim.llH.shift(); S.sim.mseH.shift(); }
      }
      S.sim.done = done;
      S.metrics.联合LL = ll / n;
      S.metrics.补全MSE = mse;
      S.metrics.μy = th.my;
    },
    draw(ctx, S, T) {
      const ph = S.phase, th = S.sim.th, pts = S.sim.pts, done = S.sim.done || pts;
      const titles = ["用 Q 给出软完整表", "更新 θ 抬升联合似然", "再回到 E 步交替", "联合似然↑ 但点误差未必↓"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "θ ← max E_Q log p_θ(x_m,x_o)");
      paramBadge(ctx, S, T, "提升速度", S.sliders.rate != null ? S.sliders.rate : 1);
      const L = box(S, 40, 50, S.W * 0.38, 36);
      const mX = (x) => L.x0 + (x + 1.7) / 3.4 * L.w;
      const mY = (y) => L.y1 - (y + 0.5) / 2.2 * L.h;
      axes(ctx, L.x0, L.y0, L.x1, L.y1, T, "x_obs", "x_miss / y");
      /* 真值二次曲线 */
      ctx.setLineDash([4, 3]); ctx.strokeStyle = hexA(T.mu, 0.7); ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const x = -1.6 + 3.2 * i / 40, y = 0.55 * x * x - 0.25;
        if (i) ctx.lineTo(mX(x), mY(y)); else ctx.moveTo(mX(x), mY(y));
      }
      ctx.stroke(); ctx.setLineDash([]);
      pts.forEach((p, i) => {
        const q = done[i] || p;
        if (p.miss) {
          ctx.fillStyle = hexA(T.c6, 0.9);
          ctx.beginPath(); ctx.arc(mX(q.x), mY(q.y), ph === 0 ? 5 : 3.6, 0, TWO); ctx.fill();
          ctx.strokeStyle = T.c6;
          ctx.beginPath(); ctx.arc(mX(p.x), mY(p.yt), 5, 0, TWO); ctx.stroke();
        } else {
          ctx.fillStyle = T.c3;
          ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), 3.4, 0, TWO); ctx.fill();
        }
      });
      /* 模型椭圆：在 draw 里用完整表 MLE，rate/phase 控制贴合程度 */
      const rateV = S.sliders.rate != null ? S.sliders.rate : 1;
      const kθ = ph === 0 ? 0.08 : clamp(rateV / 1.8, 0.22, 1);
      const th0 = S.sim.th0 || { mx: 0, my: 0.45, sxx: 1.35, syy: 1.2, sxy: 0 };
      let mxE = 0, myE = 0;
      pts.forEach((p, i) => { const q = done[i] || p; mxE += q.x; myE += q.y; });
      mxE /= pts.length; myE /= pts.length;
      let sxxE = 0, syyE = 0, sxyE = 0;
      pts.forEach((p, i) => {
        const q = done[i] || p; const dx = q.x - mxE, dy = q.y - myE;
        sxxE += dx * dx; syyE += dy * dy; sxyE += dx * dy;
      });
      sxxE = Math.max(sxxE / pts.length, 1e-4); syyE = Math.max(syyE / pts.length, 1e-4); sxyE /= pts.length;
      const ths = {
        mx: lerp(th0.mx, mxE, kθ), my: lerp(th0.my, myE, kθ),
        sxx: lerp(th0.sxx, sxxE, kθ), syy: lerp(th0.syy, syyE, kθ),
        sxy: lerp(th0.sxy, sxyE, kθ),
      };
      const rho = ths.sxy / (Math.sqrt(Math.max(1e-6, ths.sxx * ths.syy)));
      ctx.strokeStyle = T.c2; ctx.lineWidth = 2 + 1.5 * kθ;
      ctx.beginPath();
      ctx.ellipse(mX(ths.mx), mY(ths.my), 36 + 22 * Math.sqrt(ths.sxx), 28 + 18 * Math.sqrt(ths.syy), Math.atan(rho), 0, TWO);
      ctx.stroke();
      if (ph === 0) txt(ctx, "θ 初始（宽椭圆，尚未 M 步）", mX(ths.mx) + 8, mY(ths.my) - 12, T.mu, 11);
      else txt(ctx, "p_θ 单高斯（误设） rate→贴合MLE", mX(ths.mx) + 10, mY(ths.my) - 10, T.c2, 11);
      /* 右侧曲线 */
      const Rx = S.W * 0.64, Ry = 44, Rw = S.W - Rx - 14, Rh = S.H - 80;
      txt(ctx, ph === 3 ? "目标对照" : "M 步轨迹", Rx, 58, T.tx, 12, "left", true);
      function spark(arr, col, y0, h, lab) {
        if (!arr.length) return;
        let mn = Infinity, mx = -Infinity;
        arr.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; });
        const sp = mx - mn || 1;
        ctx.beginPath();
        arr.forEach((v, i) => {
          const x = Rx + i / Math.max(1, arr.length - 1) * Rw;
          const y = y0 + h - (v - mn) / sp * h;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.stroke();
        txt(ctx, lab, Rx, y0 - 2, col, 11);
      }
      if (ph === 0) {
        txt(ctx, "M 步开始后记录轨迹", Rx, Ry + 40, T.mu, 12);
      } else {
        spark(S.sim.llH, T.c4, Ry + 24, Rh * 0.38, "联合对数似然 ↑");
        spark(S.sim.mseH, T.c6, Ry + Rh * 0.55, Rh * 0.38, "缺失点 MSE（真值二次）");
      }
      if (ph === 2) {
        ctx.fillStyle = hexA(T.c5, 0.18);
        rr(ctx, Rx, S.H - 52, Rw, 22, 6); ctx.fill();
        txt(ctx, "↩ 回到 E 步  ·  用新 θ 再算后验", Rx + 8, S.H - 36, T.c5, 11);
      }
      if (ph === 3) txt(ctx, "关键矛盾：联合密度变好 ≠ 补全点变准", 42, S.H - 16, T.c6, 12, "left", true);
      else legend(ctx, [{ c: T.c3, lab: "观测" }, { c: T.c6, lab: "缺失填值" }, { c: T.mu, lab: "真 y=x²" }], 42, S.H - 16, T);
    },
  });

  /* ===================================================================
   * 5. 熵泛函  H[Q]=−∫Q log Q
   * =================================================================== */
  reg("entropy_functional", {
    init(S) {
      const rng = mulberry(41);
      S.sim = {
        pts: Array.from({ length: 48 }, () => ({
          x: (rng() - 0.5) * 1.8,
          vx: 0
        }))
      };
    },
    tick(S, dt) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 1.0;
      const ph = S.phase;

      // Double-well potential V(x) = (x^2 - 1)^2
      // Two modes at x = -0.9 and x = +0.9
      let varX = 0;
      S.sim.pts.forEach((p, i) => {
        // Force 1: Potential well pulling inward (reconstruction)
        const f_well = -4 * p.x * (p.x * p.x - 0.82);

        // Force 2: Negative entropy gradient pushing outward (dispersion)
        let f_ent = 0;
        S.sim.pts.forEach((other, j) => {
          if (i !== j) {
            const dx = p.x - other.x;
            f_ent += dx / (dx * dx + 0.08);
          }
        });
        f_ent = (f_ent / S.sim.pts.length) * spread * 1.4;

        const netForce = (ph >= 1) ? (f_well * 0.35 + f_ent) : f_well;
        p.vx = (p.vx || 0) * 0.88 + netForce * (dt || 0.016) * 0.8;
        p.x += p.vx * (dt || 0.016);
        varX += p.x * p.x;
      });

      varX /= S.sim.pts.length;
      const H_est = 0.5 * Math.log(TWO * Math.E * Math.max(0.1, varX));

      S.metrics["负熵 H[Q]"] = H_est.toFixed(3);
      S.metrics["分布方差 Var"] = varX.toFixed(3);
      S.metrics["平衡态"] = ph >= 2 ? "✓ 已平衡" : "收拢中";
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const cx = W * 0.46, cy = H * 0.62;
      const scX = W * 0.22, scY = H * 0.28;

      // Draw double-well potential curve
      ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)";
      ctx.beginPath();
      for (let x = -1.6; x <= 1.6; x += 0.05) {
        const v = 0.5 * Math.pow(x * x - 0.82, 2);
        const px = cx + x * scX, py = cy - v * scY * 0.8;
        if (x === -1.6) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();

      // Draw particles
      const ph = S.phase;
      const col = ph === 0 ? T.c6 : (ph === 1 ? T.c5 : T.c3);
      S.sim.pts.forEach(p => {
        const py = cy + 15 + Math.sin(p.x * 5) * 6;
        glow(ctx, cx + p.x * scX, py, 4, col);
      });

      // Gauge Dashboard
      const gx = W - 146, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 140, 60, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("负熵正则动态平衡", gx, gy + 12);
      ctx.fillStyle = col;
      ctx.fillText("H[Q] = " + S.metrics["负熵 H[Q]"] + " nats", gx, gy + 28);
      ctx.fillStyle = T.mu;
      ctx.fillText("分布方差 = " + S.metrics["分布方差 Var"], gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：重构外力拉拢粒子向工况模态收拢", T, T.c6);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：负熵梯度 -∇ log Q 产生排斥扩散", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：双力平衡，阻止后验过度塌缩", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：滑动 spread 调节熵惩罚强度", T, T.c2);
    }
  });

  reg("imputation_likelihood", {
    init(S) {
      const rng = mulberry(77);
      S.sim.z0 = Array.from({ length: 30 }, () => {
        const u = rng() || 1e-9, v = rng() || 1e-9;
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
      });
      S.sim.xs = S.sim.z0.slice();
    },
    tick(S) {
      const sig = Math.max(0.06, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const ph = S.phase;
      const mp = 0.35, sp = sig * 0.85 + 0.12;
      const mq = mp + (ph === 2 ? 0.15 : 0);
      const sq = ph === 0 ? 0.55 : ph === 1 ? 0.16 : ph === 2 ? 1.05 : 0.18;
      S.sim.mp = mp; S.sim.sp = sp; S.sim.mq = mq; S.sim.sq = sq;
      for (let i = 0; i < 30; i++) S.sim.xs[i] = mq + sq * S.sim.z0[i];
      S.metrics.L_imp = limpG(mq, sq, mp, sp);
      S.metrics.峰logp = logN(mp, mp, sp);
      S.metrics.σ_Q = sq;
    },
    draw(ctx, S, T) {
      const sig = Math.max(0.06, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const ph = S.phase;
      const mp = 0.35, sp = sig * 0.85 + 0.12;
      const mq = mp + (ph === 2 ? 0.15 : 0);
      const sq = ph === 0 ? 0.55 : ph === 1 ? 0.16 : ph === 2 ? 1.05 : 0.18;
      const Limp = limpG(mq, sq, mp, sp);
      const titles = ["只看缺失坐标的条件密度", "Q 贴峰 → L_imp 高", "Q 摊开 → L_imp 低", "点补全就要这个目标"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "L_imp=E_Q log p_θ(x_m|x_o)");
      paramBadge(ctx, S, T, "噪声", sig);
      const B = box(S, 42, 42, 120, 38);
      const mX = (x) => B.x0 + (x + 3) / 6 * B.w;
      const pk = gauss(mp, mp, sp);
      const mY = (y) => B.y1 - y / (pk * 1.15) * (B.h - 4);
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss | x_obs 固定", "密度");
      const xs = [], p = [], q = [];
      for (let i = 0; i <= 110; i++) {
        const x = -3 + 6 * i / 110;
        xs.push(x); p.push(gauss(x, mp, sp)); q.push(gauss(x, mq, sq));
      }
      fillCurve(ctx, xs, p, mX, mY, T.c5, 0.16);
      if (ph !== 0) fillCurve(ctx, xs, q, mX, mY, T.c2, 0.22);
      (S.sim.xs || []).forEach((x) => {
        ctx.fillStyle = T.c3;
        ctx.beginPath(); ctx.arc(mX(clamp(x, -2.9, 2.9)), B.y1 - 6, 3, 0, TWO); ctx.fill();
      });
      /* 右柱 L_imp */
      const Lref = limpG(mp, 0.16, mp, sp);
      const Llo = limpG(mp, 1.2, mp, sp);
      const t = clamp((Limp - Llo) / (Lref - Llo + 1e-6), 0, 1);
      const bx = S.W - 92, by = 48, bh = S.H - 96;
      ctx.fillStyle = T.dark ? "#1a2438" : "#dde5f2";
      rr(ctx, bx, by, 70, bh, 8); ctx.fill();
      ctx.fillStyle = mixHex(T.c6, T.c4, t);
      const hh = 16 + t * (bh - 36);
      ctx.fillRect(bx + 12, by + bh - hh - 10, 46, hh);
      txt(ctx, "L_imp", bx + 35, by + 16, T.tx, 12, "center", true);
      txt(ctx, Limp.toFixed(2), bx + 35, by + bh - 8, T.tx, 12, "center");
      if (ph === 3) txt(ctx, "不要联合似然的「帮倒忙」，只要条件峰上的点", 44, S.H - 16, T.c4, 12, "left", true);
    },
  });

  /* ===================================================================
   * 7. KL–熵分解  −KL = L_imp + H
   * =================================================================== */
  reg("kl_entropy_decomposition", {
    init(S) { S.sim.bar = 0; },
    tick(S, dt) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const mp = 0, sp = 0.55;
      const mq = ph === 3 ? 0.2 : 0.05 * Math.sin(S.t);
      const sq = ph === 0 ? 0.22 : ph === 1 ? 0.28 + 0.2 * spread : ph === 2 ? lerp(0.22, sp, 0.7) * (0.6 + 0.5 * spread) : 0.35 + 1.1 * spread;
      const L = limpG(mq, sq, mp, sp);
      const H = hG(sq);
      const nkl = -klG(mq, sq, mp, sp);
      S.sim.L = L; S.sim.H = H; S.sim.nkl = nkl; S.sim.mq = mq; S.sim.sq = sq; S.sim.mp = mp; S.sim.sp = sp;
      S.sim.bar += (1 - S.sim.bar) * dt * 3;
      S.metrics.负KL = nkl;
      S.metrics.L_imp = L;
      S.metrics.H = H;
      S.metrics.残差 = nkl - L - H; /* 应为 0 */
    },
    draw(ctx, S, T) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const mp = 0, sp = 0.55;
      const mq = ph === 3 ? 0.2 : 0;
      const sq = ph === 0 ? 0.22 : ph === 1 ? 0.28 + 0.2 * spread : ph === 2 ? lerp(0.22, sp, 0.7) * (0.6 + 0.5 * spread) : 0.35 + 1.1 * spread;
      const L = limpG(mq, sq, mp, sp), H = hG(sq), nkl = -klG(mq, sq, mp, sp);
      const titles = ["把 −KL 拆成两项", "L_imp 一项、H 一项", "E 步同时抬高两者", "H 主导时补全发散"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "−KL(Q‖P)=L_imp+H[Q]");
      paramBadge(ctx, S, T, "散布", spread);
      /* 左：密度 */
      const B = box(S, 40, 50, S.W * 0.46, 36);
      const mX = (x) => B.x0 + (x + 3) / 6 * B.w;
      const pk = gauss(0, 0, sp);
      const mY = (y) => B.y1 - y / (pk * 1.2) * (B.h - 4);
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "密度");
      const xs = [], p = [], q = [];
      for (let i = 0; i <= 100; i++) {
        const x = -3 + 6 * i / 100; xs.push(x); p.push(gauss(x, mp, sp)); q.push(gauss(x, mq, sq));
      }
      fillCurve(ctx, xs, p, mX, mY, T.c5, 0.12);
      fillCurve(ctx, xs, q, mX, mY, T.c2, 0.22);
      if (ph === 3) {
        txt(ctx, "Q 过宽 · 样本飞出", 78, 58, T.c6, 12, "left", true);
      }
      /* 右：零线居中的有符号柱 */
      const Rx = S.W * 0.58, Rw = S.W - Rx - 20, Ry = 58, Rh = S.H - 100;
      const z0 = Ry + Rh * 0.62;
      const vMax = 2.2;
      function colh(v) { return clamp(Math.abs(v) / vMax, 0.04, 1) * (Rh * 0.5); }
      const cx = [Rx + Rw * 0.2, Rx + Rw * 0.5, Rx + Rw * 0.8];
      const vs = [L, H, nkl], labs = ["L_imp", "H[Q]", "−KL"], cs = [T.c3, T.c5, T.c2];
      ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(Rx, z0); ctx.lineTo(Rx + Rw, z0); ctx.stroke();
      txt(ctx, "0", Rx - 2, z0 + 4, T.mu, 10, "right");
      for (let i = 0; i < 3; i++) {
        if (ph === 0 && i > 0 && pfrac(S) < 0.28) continue;
        const h = colh(vs[i]);
        const up = vs[i] >= 0;
        ctx.fillStyle = hexA(cs[i], (ph === 1 && i < 2) || (ph === 2) ? 0.95 : 0.75);
        rr(ctx, cx[i] - 18, up ? z0 - h : z0, 36, h, 5); ctx.fill();
        txt(ctx, labs[i], cx[i], Ry + Rh + 14, cs[i], 11, "center", true);
        txt(ctx, vs[i].toFixed(2), cx[i], up ? z0 - h - 4 : z0 + h + 12, T.tx, 10, "center");
      }
      if (ph >= 1) {
        txt(ctx, "代数恒等  L+H 应等于 −KL", Rx, Ry + 8, T.mu, 11);
        txt(ctx, "残差 " + (nkl - L - H).toFixed(3), Rx + Rw, Ry + 8, Math.abs(nkl - L - H) < 0.02 ? T.c4 : T.c6, 11, "right");
      }
      if (ph === 2) {
        arrow(ctx, cx[0], Ry + 40, 0, -18, T.c3, 2);
        arrow(ctx, cx[1], Ry + 40, 0, -18, T.c5, 2);
        txt(ctx, "E 步抬高两项", Rx, Ry + 28, T.c4, 11);
      }
    },
  });

  /* ===================================================================
   * 8. 负熵正则  F^NER = L_imp − H[Q]
   * =================================================================== */
  reg("negative_entropy_regularization", {
    init(S) {
      const rng = mulberry(8);
      S.sim.xs = Array.from({ length: 40 }, () => (rng() - 0.5) * 3.2);
    },
    tick(S, dt) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const mp = 0.2, sp = 0.42 + 0.15 * spread;
      const eps = dt * 1.6;
      for (let i = 0; i < S.sim.xs.length; i++) {
        let x = S.sim.xs[i];
        const sp_q = 0.35 + 0.7 * spread;
        const scoreP = -(x - mp) / (sp * sp);
        const scoreQ = -(x - mean(S.sim.xs)) / (sp_q * sp_q);
        if (ph === 0) x += eps * (0.15 * scoreP - 0.9 * scoreQ) + (Math.random() - 0.5) * 0.05; /* +H 摊开 */
        else if (ph === 1) x += eps * (0.2 * scoreP + 1.1 * scoreQ); /* −H 收缩 */
        else x += eps * (1.2 * scoreP + 0.9 * scoreQ); /* NER 全项 */
        S.sim.xs[i] = clamp(x, -3.2, 3.2);
      }
      const mu = mean(S.sim.xs), sd = std(S.sim.xs);
      const L = limpG(mu, sd, mp, sp), H = hG(sd);
      S.sim.mp = mp; S.sim.sp = sp; S.sim.mu = mu; S.sim.sd = sd;
      S.metrics.F_NER = L - H;
      S.metrics.L_imp = L;
      S.metrics.H = H;
      S.metrics.粒子σ = sd;
      S.metrics.点MSE = (mu - mp) * (mu - mp) + 0.15 * sd;
    },
    draw(ctx, S, T) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const mp = 0.2, sp = 0.42 + 0.15 * spread;
      const sq = ph === 0 ? 0.55 + 0.85 * spread : ph === 1 ? 0.16 + 0.12 * spread : 0.14 + 0.08 * spread;
      const titles = ["对照 +H：分布摊开", "改成 −H：收缩到峰", "L_imp 把峰对准条件密度", "点误差↓ 多样性↓"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "F^NER = L_imp − H[Q]");
      paramBadge(ctx, S, T, "散布", spread);
      const B = box(S, 42, 50, 18, 38);
      const mX = (x) => B.x0 + (x + 3.2) / 6.4 * B.w;
      const pk = gauss(mp, mp, sp);
      const mY = (y) => B.y1 - y / (pk * 1.2) * (B.h - 8);
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss", "密度");
      const xs = [], p = [], q = [];
      for (let i = 0; i <= 100; i++) {
        const x = -3.2 + 6.4 * i / 100; xs.push(x);
        p.push(gauss(x, mp, sp)); q.push(gauss(x, mp, sq));
      }
      fillCurve(ctx, xs, p, mX, mY, T.c5, 0.14);
      fillCurve(ctx, xs, q, mX, mY, ph === 0 ? T.c6 : T.c3, 0.28);
      const col = ph === 0 ? T.c6 : T.c3;
      for (let i = 0; i < 24; i++) {
        const x = mp + sq * Math.cos(TWO * (i + 0.3) / 24) * (ph === 0 ? 1.7 : 1.05);
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(mX(clamp(x, -3.1, 3.1)), B.y1 - 8, 4, 0, TWO); ctx.fill();
      }
      const L = limpG(mp, sq, mp, sp), H = hG(sq);
      const tag = ph === 0 ? "粒子扩散（+H）" : ph === 1 ? "负熵聚拢（−H）" : ph === 2 ? "得分对准峰" : "又尖又准";
      txt(ctx, tag, 84, 68, col, 13, "left", true);
      txt(ctx, "σ_Q=" + sq.toFixed(2) + "  F_NER=" + (L - H).toFixed(2) + "  H=" + H.toFixed(2), 84, 86, T.mu, 11);
    },
  });

  function mean(a) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]; return s / (a.length || 1); }
  function std(a) {
    const m = mean(a); let v = 0;
    for (let i = 0; i < a.length; i++) v += (a[i] - m) * (a[i] - m);
    return Math.sqrt(v / (a.length || 1));
  }

  /* ===================================================================
   * 9. 最小移动方案  inf F[QT]−F[Q] + W2/(2ε)
   * =================================================================== */
  reg("minimizing_movement_scheme", {
    init(S) {
      const rng = mulberry(3);
      S.sim.x0 = Array.from({ length: 22 }, () => -1.35 + rng() * 0.7);
      S.sim.y0 = Array.from({ length: 22 }, () => (rng() - 0.5) * 0.75);
      S.sim.x = S.sim.x0.slice();
      S.sim.y = S.sim.y0.slice();
    },
    tick(S, dt) {
      const sep = S.sliders.sep != null ? S.sliders.sep : 1;
      const z = { x: sep * 0.85, y: 0.15 * Math.sin(S.t * 0.4) };
      S.sim.z = z;
      const tau = S.phase === 1 ? 8 : S.phase === 2 ? 0.28 : 0.55;
      const k = tau / (1 + tau);
      for (let i = 0; i < S.sim.x.length; i++) {
        if (S.phase === 0) { /* 停在当前 Q */ }
        else if (S.phase === 1) {
          /* 无 W2：向最优点瞬移，带过冲 */
          S.sim.x[i] += (z.x - S.sim.x[i]) * Math.min(1, dt * 6) + Math.sin(S.t * 9 + i) * 0.01;
          S.sim.y[i] += (z.y - S.sim.y[i]) * Math.min(1, dt * 6);
        } else {
          S.sim.x[i] += (z.x - S.sim.x[i]) * k * dt * 2.2;
          S.sim.y[i] += (z.y - S.sim.y[i]) * k * dt * 2.2;
        }
      }
      let w2 = 0, F = 0, Fnew = 0;
      for (let i = 0; i < S.sim.x.length; i++) {
        const dx = S.sim.x[i] + 1.0, dy = S.sim.y[i];
        /* 用位移相对初始邻域近似 W2：相对目标 */
        const ux = S.sim.x[i] - z.x, uy = S.sim.y[i] - z.y;
        w2 += ux * ux + uy * uy;
        Fnew += 0.5 * (ux * ux + uy * uy);
        F += 0.5 * (dx * dx + dy * dy);
      }
      w2 = Math.sqrt(w2 / S.sim.x.length);
      S.metrics.W2 = w2;
      S.metrics.F = Fnew / S.sim.x.length;
      S.metrics.ε步长 = tau;
      S.metrics.目标距 = sep;
    },
    draw(ctx, S, T) {
      const sep = S.sliders.sep != null ? S.sliders.sep : 1;
      const ph = S.phase;
      const z = { x: sep * 0.9, y: 0.05 };
      const tau = ph === 0 ? 0 : ph === 1 ? 12 : ph === 2 ? 0.22 : 0.55;
      const titles = ["当前粒子云 Q", "只 min F：瞬移过冲", "加上 W₂ 邻近，只走一小步", "ε 控制移动预算"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "inf F[Q_T]−F[Q] + W₂(Q_T,Q)/(2ε)");
      paramBadge(ctx, S, T, "搬迁距离", sep);
      const B = box(S, 48, 50, 16, 38);
      const mX = (x) => B.x0 + (x + 2.1) / 4.6 * B.w;
      const mY = (y) => B.y0 + B.h / 2 - y / 1.6 * (B.h / 2);
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      ctx.fillStyle = T.c5;
      star(ctx, mX(z.x), mY(z.y), 9);
      txt(ctx, "F 最小点", mX(z.x) + 12, mY(z.y) - 8, T.c5, 11);
      const x0 = S.sim.x0 || S.sim.x, y0 = S.sim.y0 || S.sim.y;
      let w2 = 0;
      (x0 || []).forEach((x, i) => {
        const y = y0[i];
        const xn = (x + tau * z.x) / (1 + tau), yn = (y + tau * z.y) / (1 + tau);
        w2 += (xn - x) * (xn - x) + (yn - y) * (yn - y);
        const gx = mX(x), gy = mY(y), px = mX(xn), py = mY(yn);
        if (ph !== 0) {
          ctx.strokeStyle = hexA(T.mu, 0.35); ctx.setLineDash([3, 3]);
          ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
          ctx.fillStyle = hexA(T.c2, 0.28);
          ctx.beginPath(); ctx.arc(gx, gy, 3.2, 0, TWO); ctx.fill();
        }
        if (ph === 2 || ph === 3) {
          ctx.strokeStyle = hexA(T.c3, 0.45); ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(gx, gy, 14, 0, TWO); ctx.stroke();
        }
        ctx.fillStyle = T.c2;
        ctx.beginPath(); ctx.arc(px, py, 4.2, 0, TWO); ctx.fill();
        if (ph === 3 && i < 6) {
          [0.12, 0.45, 1.6].forEach((t, k) => {
            const a = (x + t * z.x) / (1 + t), b = (y + t * z.y) / (1 + t);
            ctx.fillStyle = hexA([T.c3, T.c7, T.c6][k], 0.85);
            ctx.beginPath(); ctx.arc(mX(a), mY(b), 3.2, 0, TWO); ctx.fill();
          });
        }
      });
      S.metrics.W2 = Math.sqrt(w2 / ((x0 || []).length || 1));
      S.metrics.ε步长 = tau;
      S.metrics.目标距 = sep;
      if (ph === 0) txt(ctx, "当前 Q 远离最优点（滑块拉开目标）", 76, 68, T.c2, 12, "left", true);
      if (ph === 1) txt(ctx, "无邻近项 → 粒子瞬移到星点（过冲）", 76, 68, T.c6, 12, "left", true);
      if (ph === 2) txt(ctx, "W₂ 球限制每步位移  ε=" + tau.toFixed(2), 76, 68, T.c3, 12, "left", true);
      if (ph === 3) legend(ctx, [{ c: T.c3, lab: "ε小" }, { c: T.c7, lab: "ε中" }, { c: T.c6, lab: "ε大" }, { c: T.c2, lab: "当前 Q" }], 76, 70, T);
    },
  });
  function star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + i * TWO / 5, b = a + TWO / 10;
      ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a));
      ctx.lineTo(x + r * 0.4 * Math.cos(b), y + r * 0.4 * Math.sin(b));
    }
    ctx.closePath(); ctx.fill();
  }

  /* ===================================================================
   * 10. 最优微扰方向  φ* = −∇(δF/δQ)
   * =================================================================== */
  reg("optimal_perturbation_direction", {
    init(S) {
      const rng = mulberry(2);
      S.sim.pts = Array.from({ length: 26 }, () => ({ x: (rng() - 0.5) * 2.4, y: (rng() - 0.5) * 2.0 }));
    },
    tick(S, dt) {
      const sig = Math.max(0.12, S.sliders.sig != null ? S.sliders.sig : 0.35);
      S.sim.sig = sig;
      const mu = mean(S.sim.pts.map((p) => p.x));
      const mv = mean(S.sim.pts.map((p) => p.y));
      let dStar = 0, dRand = 0, nrm = 0;
      S.sim.pts.forEach((p) => {
        const sp = sig + 0.25;
        const dlogpX = -p.x / (sp * sp), dlogpY = -p.y / (sp * sp);
        const dlogqX = -(p.x - mu) / 0.64, dlogqY = -(p.y - mv) / 0.64;
        /* 最小化 F=−L+H 时 φ*=∇log p+∇log Q */
        const fx = dlogpX + dlogqX, fy = dlogpY + dlogqY;
        p.fx = fx; p.fy = fy;
        const gVx = -fx, gVy = -fy; /* ∇(δF/δQ) */
        dStar += gVx * fx + gVy * fy;
        const rx = Math.sin(p.x * 9 + S.t), ry = Math.cos(p.y * 7);
        dRand += gVx * rx + gVy * ry;
        nrm += fx * fx + fy * fy;
        if (S.phase >= 2) {
          p.x += fx * dt * 0.9; p.y += fy * dt * 0.9;
          p.x = clamp(p.x, -2.3, 2.3); p.y = clamp(p.y, -1.8, 1.8);
        }
      });
      S.metrics.dF沿φ星 = dStar / 26;
      S.metrics.dF随机方向 = dRand / 26;
      S.metrics.平均_φ = Math.sqrt(nrm / 26);
      S.metrics.σ = sig;
    },
    draw(ctx, S, T) {
      const sig = Math.max(0.12, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const ph = S.phase;
      const titles = ["密度变分 δF/δQ 标量场", "空间梯度得向量场", "粒子沿 −∇(δF/δQ) 走", "沿 φ* 时 dF 最负"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "φ*(x)=−∇_x (δF/δQ)");
      paramBadge(ctx, S, T, "噪声", S.sliders.sig != null ? S.sliders.sig : 0.35);
      const B = box(S, 40, 40, 16, 36);
      const mX = (x) => B.x0 + (x + 2.4) / 4.8 * B.w;
      const mY = (y) => B.y0 + (2.0 - y) / 4.0 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      const sp = sig + 0.25;
      /* 热力：δF/δQ ≈ −log p − log Q 的示意 = ||x||²/(2σ²) */
      if (ph === 0 || ph === 1) {
        const nx = 22, ny = 14;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const x = -2.4 + 4.8 * (i + 0.5) / nx, y = -2 + 4 * (j + 0.5) / ny;
          const t = clamp(Math.sqrt(x * x + y * y) / 2.15, 0, 1);
          ctx.fillStyle = hexA(mixHex(T.c3, T.c6, t), 0.18 + 0.7 * t);
          const w = B.w / nx, h = B.h / ny;
          ctx.fillRect(mX(x) - w / 2, mY(y) - h / 2, w + 0.5, h + 0.5);
        }
      }
      if (ph >= 1) {
        for (let i = 0; i < 8; i++) for (let j = 0; j < 5; j++) {
          const x = -2 + 4 * i / 7, y = -1.4 + 2.8 * j / 4;
          const fx = -x / (sp * sp), fy = -y / (sp * sp);
          arrow(ctx, mX(x), mY(y), fx * 28, -fy * 22, hexA(T.c5, 0.9), 1.3);
        }
      }
      (S.sim.pts || []).forEach((p) => {
        ctx.fillStyle = T.c3;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), 4, 0, TWO); ctx.fill();
        if (ph >= 2 && p.fx) arrow(ctx, mX(p.x), mY(p.y), p.fx * 18, -p.fy * 16, T.c4, 1.4);
      });
      if (ph === 3) {
        const p = S.sim.pts[0];
        if (p) {
          const x = mX(p.x), y = mY(p.y);
          arrow(ctx, x, y, 36, -8, T.c4, 2.2);
          txt(ctx, "φ*  dF=" + (S.metrics.dF沿φ星 || 0).toFixed(2), x + 40, y - 10, T.c4, 11);
          arrow(ctx, x, y, 8, 28, T.mu, 1.4);
          txt(ctx, "随机 dF=" + (S.metrics.dF随机方向 || 0).toFixed(2), x + 12, y + 34, T.mu, 11);
        }
      }
    },
  });

  /* ===================================================================
   * 11. 负熵诱导传输  T = X + ε(∇log p + ∇log Q)
   * =================================================================== */
  reg("ner_score_transport", {
    init(S) {
      const rng = mulberry(11);
      S.sim.pts = Array.from({ length: 22 }, () => ({ x: (rng() - 0.5) * 2.4, y: (rng() - 0.5) * 1.8 }));
      S.sim.p0 = S.sim.pts.map((p) => ({ x: p.x, y: p.y }));
    },
    tick(S, dt) {
      const sig = Math.max(0.1, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const sp = 0.45 + 0.5 * sig;
      const mu = mean(S.sim.pts.map((p) => p.x)), mv = mean(S.sim.pts.map((p) => p.y));
      const sd = Math.max(0.2, std(S.sim.pts.map((p) => p.x)));
      S.sim.pts.forEach((p) => {
        p.spx = -p.x / (sp * sp); p.spy = -p.y / (sp * sp);
        p.sqx = -(p.x - mu) / (sd * sd); p.sqy = -(p.y - mv) / (sd * sd);
        let vx = 0, vy = 0;
        if (S.phase === 0) { vx = p.spx; vy = p.spy; }
        else if (S.phase === 1) { vx = p.sqx; vy = p.sqy; }
        else if (S.phase === 2) { vx = p.spx + p.sqx; vy = p.spy + p.sqy; }
        else { vx = p.spx; vy = p.spy; p.x += (Math.random() - 0.5) * 0.08; p.y += (Math.random() - 0.5) * 0.08; }
        p.x += vx * dt * 0.85; p.y += vy * dt * 0.85;
        p.x = clamp(p.x, -2.5, 2.5); p.y = clamp(p.y, -1.9, 1.9);
      });
      S.metrics.模型得分 = mean(S.sim.pts.map((p) => hypot(p.spx, p.spy)));
      S.metrics.Q得分 = mean(S.sim.pts.map((p) => hypot(p.sqx, p.sqy)));
      S.metrics.粒子σ = std(S.sim.pts.map((p) => p.x));
    },
    draw(ctx, S, T) {
      const ph = S.phase;
      const sig = Math.max(0.1, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const sp = 0.4 + 0.7 * sig;
      const titles = ["模型得分 ∇log p 牵引", "∇log Q 从疏处推向密处", "合成传输箭头", "缺少 ∇log Q ≈ 朗之万"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "T(X)=X+ε(∇log p+∇log Q)");
      paramBadge(ctx, S, T, "噪声", sig);
      const B = box(S, 40, 50, 14, 36);
      const mX = (x) => B.x0 + (x + 2.6) / 5.2 * B.w;
      const mY = (y) => B.y0 + (2.0 - y) / 4.0 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss", "y");
      ctx.strokeStyle = hexA(T.c5, 0.55); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.ellipse(mX(0), mY(0), 40 + 80 * sp, 28 + 55 * sp, 0, 0, TWO); ctx.stroke();
      const src = S.sim.p0 || S.sim.pts || [];
      const mu = mean(src.map((p) => p.x)), mv = mean(src.map((p) => p.y));
      const sd = Math.max(0.25, std(src.map((p) => p.x)));
      src.forEach((p) => {
        const spx = -p.x / (sp * sp), spy = -p.y / (sp * sp);
        const sqx = -(p.x - mu) / (sd * sd), sqy = -(p.y - mv) / (sd * sd);
        const x = mX(p.x), y = mY(p.y);
        ctx.fillStyle = T.c3;
        ctx.beginPath(); ctx.arc(x, y, 4, 0, TWO); ctx.fill();
        if (ph === 0) arrow(ctx, x, y, spx * 18, -spy * 16, T.c5, 1.3, 26);
        else if (ph === 1) arrow(ctx, x, y, sqx * 18, -sqy * 16, T.c6, 1.3, 26);
        else if (ph === 2) {
          arrow(ctx, x, y, spx * 12, -spy * 10, hexA(T.c5, 0.7), 1, 18);
          arrow(ctx, x, y, sqx * 12, -sqy * 10, hexA(T.c6, 0.7), 1, 18);
          arrow(ctx, x, y, (spx + sqx) * 16, -(spy + sqy) * 14, T.c4, 1.6, 28);
        } else {
          arrow(ctx, x, y, spx * 16, -spy * 14, T.c5, 1.2, 24);
        }
      });
      if (ph === 2) legend(ctx, [{ c: T.c5, lab: "∇log p" }, { c: T.c6, lab: "∇log Q" }, { c: T.c4, lab: "合成" }], 76, 68, T);
      if (ph === 3) txt(ctx, "只剩模型得分 + 噪声：不聚拢，像朗之万", 76, 68, T.c6, 12, "left", true);
    },
  });

  /* ===================================================================
   * 12. 得分函数  s(x)=∇ log p(x)
   * =================================================================== */
  reg("score_function", {
    init(S) { S.sim.pulse = 0; },
    tick(S, dt) {
      const sig = Math.max(0.08, S.sliders.sig != null ? S.sliders.sig : 0.35);
      S.sim.sig = sig;
      S.sim.pulse += dt;
      const s0 = 1 / (sig * sig);
      S.metrics.峰值_s = 0;
      S.metrics.配分Z = sig * Math.sqrt(TWO);
      S.metrics.σ = sig;
      S.metrics["|s|(1,0)"] = 1 / (sig * sig);
    },
    draw(ctx, S, T) {
      const sig = Math.max(0.08, S.sliders.sig != null ? S.sliders.sig : 0.35);
      const ph = S.phase;
      const titles = ["密度等高线", "箭头 ∇log p ⊥ 等高线", "峰值处箭头为零", "乘 Z：箭头不变"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "s(x)=∇_x log p(x)");
      paramBadge(ctx, S, T, "噪声σ", sig);
      function panel(x0, w, Z, lab) {
        const B = { x0, y0: 50, x1: x0 + w, y1: S.H - 36, w, h: S.H - 86 };
        const mX = (x) => B.x0 + (x + 2.2) / 4.4 * B.w;
        const mY = (y) => B.y0 + (1.7 - y) / 3.4 * B.h;
        txt(ctx, lab, B.x0 + 6, 66, T.tx, 12, "left", true);
        ctx.strokeStyle = T.line; ctx.strokeRect(B.x0, B.y0, B.w, B.h);
        const sx = sig * 1.05, sy = sig * 0.8;
        /* 未归一化：填色更深，但等高线形状相同；第0步也填色，避免画面空 */
        const fillA = Z > 1.5 ? 0.32 : (ph === 0 ? 0.22 : 0.12);
        ctx.fillStyle = hexA(T.c2, fillA);
        ctx.beginPath(); ctx.ellipse(mX(0), mY(0), 2.0 * 52 * sx / 0.5, 2.0 * 38 * sy / 0.5, 0, 0, TWO); ctx.fill();
        [0.7, 1.3, 2.0].forEach((k, i) => {
          ctx.strokeStyle = hexA(T.c2, 0.4 + 0.2 * i);
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.ellipse(mX(0), mY(0), k * 52 * sx / 0.5, k * 38 * sy / 0.5, 0, 0, TWO); ctx.stroke();
        });
        if (ph !== 0) {
          for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
            const x = -1.5 + 3.0 * i / 5, y = -1.05 + 2.1 * j / 3;
            const fx = -x / (sx * sx), fy = -y / (sy * sy);
            arrow(ctx, mX(x), mY(y), fx * 8, -fy * 7, hypot(x, y) < 0.18 && ph === 2 ? T.c6 : T.c5, 1.2, 22);
          }
        }
        if (ph === 2) {
          ctx.fillStyle = T.c6;
          ctx.beginPath(); ctx.arc(mX(0), mY(0), 6, 0, TWO); ctx.fill();
          txt(ctx, "s=0", mX(0) + 10, mY(0) - 8, T.c6, 11);
        }
        return B;
      }
      if (ph === 3) {
        const w = (S.W - 40) / 2;
        panel(16, w - 8, 1, "p(x)  已归一化");
        panel(20 + w, w - 8, 3.2, "Z·p(x)  Z=" + (3.2).toFixed(1) + " 箭头相同");
        txt(ctx, "配分函数在 log 的梯度里消失", 20, S.H - 16, T.c4, 12, "left", true);
      } else {
        panel(16, S.W - 32, 1, ph === 0 ? "等高线 = 等密度" : "得分场指向更可能的方向");
      }
    },
  });

  /* ===================================================================
   * 13. RKHS  核的线性组合
   * =================================================================== */
  reg("rkhs", {
    init(S) {
      S.sim.c = [{ x: -0.9, y: 0.2, ax: 0.8, ay: 0.1 }, { x: 0.15, y: -0.55, ax: -0.2, ay: 0.7 }, { x: 0.95, y: 0.45, ax: 0.3, ay: -0.5 }];
    },
    tick(S) {
      const v = Math.max(0.12, S.sliders.v != null ? S.sliders.v : 0.8);
      S.sim.v = v;
      let nH = 0;
      S.sim.c.forEach((a, i) => {
        S.sim.c.forEach((b, j) => {
          nH += (a.ax * b.ax + a.ay * b.ay) * rbf(a.x - b.x, a.y - b.y, v);
        });
      });
      S.metrics.核带宽v = v;
      S.metrics.基函数 = 3;
      S.metrics["‖φ‖²_H"] = nH;
    },
    draw(ctx, S, T) {
      const v = Math.max(0.12, S.sliders.v != null ? S.sliders.v : 0.8);
      const ph = S.phase;
      const titles = ["粒子上的核包基函数", "向量场 = 核包加权叠加", "点与点之间平滑外推", "带宽 v 控制包宽"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "φ(x)=Σ a_i K(x, x_i) ∈ H");
      paramBadge(ctx, S, T, "核带宽", v);
      const B = box(S, 36, 40, 14, 36);
      const mX = (x) => B.x0 + (x + 1.8) / 3.6 * B.w;
      const mY = (y) => B.y0 + (1.4 - y) / 2.8 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      const cols = [T.c2, T.c5, T.c6];
      S.sim.c.forEach((c, i) => {
        const R = 28 + 70 * Math.sqrt(v);
        if (ph === 0 || ph === 3) {
          const g = ctx.createRadialGradient(mX(c.x), mY(c.y), 4, mX(c.x), mY(c.y), R);
          g.addColorStop(0, hexA(cols[i], 0.55));
          g.addColorStop(1, hexA(cols[i], 0));
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(mX(c.x), mY(c.y), R, 0, TWO); ctx.fill();
        }
        ctx.fillStyle = cols[i];
        ctx.beginPath(); ctx.arc(mX(c.x), mY(c.y), 6, 0, TWO); ctx.fill();
        txt(ctx, "x" + (i + 1), mX(c.x) + 8, mY(c.y) - 8, cols[i], 11);
      });
      if (ph === 1 || ph === 2) {
        for (let i = 0; i < 9; i++) for (let j = 0; j < 6; j++) {
          const x = -1.6 + 3.2 * i / 8, y = -1.15 + 2.3 * j / 5;
          let fx = 0, fy = 0;
          S.sim.c.forEach((c) => {
            const k = rbf(x - c.x, y - c.y, v);
            fx += c.ax * k; fy += c.ay * k;
          });
          arrow(ctx, mX(x), mY(y), fx * 26, -fy * 22, hexA(T.c4, 0.85), 1.15);
        }
      }
      if (ph === 2) {
        const qx = 0.05, qy = 0.05;
        ctx.strokeStyle = T.c3; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(mX(qx), mY(qy), 8, 0, TWO); ctx.stroke();
        txt(ctx, "查询点：由邻近核外推", mX(qx) + 12, mY(qy) + 4, T.c3, 11);
      }
      if (ph === 3) txt(ctx, "v 大 → 包变宽、场更平滑；v 小 → 局部尖峰", 40, S.H - 16, T.tx, 12);
    },
  });

  /* ===================================================================
   * 14. RKHS 传输映射（SVGD / 式 3-21）
   * =================================================================== */
  function svgdPhi(pts, v, scoreOf, freeze) {
    const n = pts.length || 1;
    const phi = pts.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < pts.length; i++) {
      let px = 0, py = 0;
      for (let j = 0; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
        const K = rbf(dx, dy, v);
        const s = scoreOf(pts[j]);
        /* ∇_{x'} K = 2(x−x')K/v ；−∇_{x'}K 产生互斥 */
        const gx = 2 * dx * K / v, gy = 2 * dy * K / v;
        px += K * s.x - gx;
        py += K * s.y - gy;
      }
      phi[i].x = freeze === "x" ? 0 : px / n;
      phi[i].y = freeze === "y" ? 0 : py / n;
    }
    return phi;
  }
  reg("rkhs_transport_map", {
    init(S) {
      const rng = mulberry(14);
      S.sim.pts = Array.from({ length: 18 }, () => ({ x: (rng() - 0.5) * 2.2, y: (rng() - 0.5) * 1.8 }));
    },
    tick(S, dt) {
      const v = Math.max(0.15, S.sliders.v != null ? S.sliders.v : 0.7);
      const scoreOf = (p) => ({ x: -p.x / 0.36, y: -p.y / 0.36 });
      const phi = svgdPhi(S.sim.pts, v, scoreOf, null);
      S.sim.phi = phi; S.sim.v = v;
      const step = dt * 0.55;
      if (S.phase > 0) {
        S.sim.pts.forEach((p, i) => {
          p.x = clamp(p.x + phi[i].x * step, -2.2, 2.2);
          p.y = clamp(p.y + phi[i].y * step, -1.8, 1.8);
        });
      }
      S.metrics.核带宽v = v;
      S.metrics.平均_φ = mean(phi.map((f) => hypot(f.x, f.y)));
      S.metrics.粒子σ = std(S.sim.pts.map((p) => p.x));
    },
    draw(ctx, S, T) {
      const v = Math.max(0.15, S.sliders.v != null ? S.sliders.v : 0.7);
      const ph = S.phase;
      const titles = ["近邻 ∇K 交互（互斥/吸引）", "叠加核平滑后的模型得分", "不再需要显式 ∇log Q", "核带宽正则粒子云形状"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "T=X−εE[∇_{X'}K]+εE[scoreᵀ K]");
      paramBadge(ctx, S, T, "核带宽", v);
      const B = box(S, 40, 50, 14, 36);
      const mX = (x) => B.x0 + (x + 2.3) / 4.6 * B.w;
      const mY = (y) => B.y0 + (1.9 - y) / 3.8 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      ctx.strokeStyle = hexA(T.c5, 0.4);
      ctx.beginPath(); ctx.ellipse(mX(0), mY(0), 64, 48, 0, 0, TWO); ctx.stroke();
      const pts = S.sim.pts || [];
      const scoreOf = (p) => ({ x: -p.x / 0.36, y: -p.y / 0.36 });
      const phi = svgdPhi(pts, v, scoreOf, null);
      if (ph === 0 || ph === 3) {
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const K = rbf(dx, dy, v);
          if (K > 0.12) {
            ctx.strokeStyle = hexA(T.c7, K * 0.75);
            ctx.lineWidth = 0.8 + 3 * K;
            ctx.beginPath(); ctx.moveTo(mX(pts[i].x), mY(pts[i].y)); ctx.lineTo(mX(pts[j].x), mY(pts[j].y)); ctx.stroke();
          }
        }
      }
      pts.forEach((p, i) => {
        ctx.fillStyle = T.c2;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), 5, 0, TWO); ctx.fill();
        if (phi[i] && ph >= 1) {
          const col = ph === 1 ? T.c5 : T.c4;
          arrow(ctx, mX(p.x), mY(p.y), phi[i].x * 12, -phi[i].y * 10, col, 1.4, 26);
        }
      });
      if (ph === 2) txt(ctx, "∇log Q 已被核散度项替代", 72, 60, T.c4, 12, "left", true);
      if (ph === 3) txt(ctx, "v=" + v.toFixed(2) + "  太大则过平滑，太小则粒子不再交互", 44, S.H - 16, T.tx, 12);
    },
  });

  /* ===================================================================
   * 15. 径向基核  K=exp(−‖x−x'‖²/v)
   * =================================================================== */
  reg("rbf_kernel", {
    init(S) {
      S.sim.neigh = [{ x: 1.05, y: 0.15 }, { x: -0.2, y: 0.95 }];
    },
    tick(S) {
      const v = Math.max(0.08, S.sliders.v != null ? S.sliders.v : 0.8);
      const d1 = hypot(1.05, 0.15);
      S.metrics.带宽v = v;
      S.metrics.K邻点 = Math.exp(-d1 * d1 / v);
      S.metrics.中位启发 = 1.05;
      S.metrics["‖∇K‖中心"] = 0;
    },
    draw(ctx, S, T) {
      const v = Math.max(0.08, S.sliders.v != null ? S.sliders.v : 0.8);
      const ph = S.phase;
      const titles = ["中心粒子的核发光", "调节 v：场变宽/变窄", "∇K 指向中心", "太窄不交互 · 太宽过平滑"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "K=exp(−‖X−X'‖²/v)");
      paramBadge(ctx, S, T, "带宽 v", v);
      const B = box(S, 40, 40, 14, 36);
      const mX = (x) => B.x0 + (x + 2.2) / 4.4 * B.w;
      const mY = (y) => B.y0 + (1.7 - y) / 3.4 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      const cx = mX(0), cy = mY(0);
      const nx = 28, ny = 18;
      const vmax = 1;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x = -2.2 + 4.4 * (i + 0.5) / nx, y = -1.7 + 3.4 * (j + 0.5) / ny;
        const K = Math.exp(-(x * x + y * y) / v);
        ctx.fillStyle = hexA(T.c5, 0.08 + 0.7 * K);
        ctx.fillRect(mX(x) - B.w / nx / 2, mY(y) - B.h / ny / 2, B.w / nx + 0.4, B.h / ny + 0.4);
      }
      ctx.fillStyle = T.c5;
      ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TWO); ctx.fill();
      txt(ctx, "中心 x'", cx + 10, cy - 10, T.c5, 12, "left", true);
      if (ph === 2) {
        for (let i = 0; i < 8; i++) {
          const a = i * TWO / 8 + 0.2;
          const x = 1.1 * Math.cos(a), y = 0.85 * Math.sin(a);
          const K = Math.exp(-(x * x + y * y) / v);
          const gx = 2 * (-x) / v * K, gy = 2 * (-y) / v * K; /* ∇_x K 指向中心 */
          arrow(ctx, mX(x), mY(y), gx * 50, -gy * 44, T.c3, 1.5);
        }
        txt(ctx, "∇_x K 指向中心（K 随靠近而增大）", 72, 60, T.c3, 12);
      }
      S.sim.neigh.forEach((p, i) => {
        const K = Math.exp(-(p.x * p.x + p.y * p.y) / v);
        ctx.fillStyle = T.c2;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), 5, 0, TWO); ctx.fill();
        txt(ctx, "K=" + K.toFixed(2), mX(p.x) + 8, mY(p.y) + 4, T.tx, 11);
      });
      if (ph === 3) {
        const k1 = Math.exp(-1.05 * 1.05 / v);
        const msg = k1 < 0.08 ? "v 太小：邻点 K≈0，粒子不再交互" : k1 > 0.85 ? "v 太大：K≈1，场过度平滑" : "带宽适中：局部交互";
        txt(ctx, msg, 44, S.H - 16, k1 < 0.08 || k1 > 0.85 ? T.c6 : T.c4, 12, "left", true);
      }
    },
  });

  /* ===================================================================
   * 16. 联合负熵泛函  F = E log p(x_joint) − H[Q_joint]
   * =================================================================== */
  reg("joint_ner_functional", {
    init(S) {
      const rng = mulberry(16);
      S.sim.pts = Array.from({ length: 36 }, () => ({ x: (rng() - 0.5) * 2.4, y: (rng() - 0.5) * 2.0 }));
    },
    tick(S, dt) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const sx = 0.55 + 0.25 * spread, sy = 0.42;
      const mu = mean(S.sim.pts.map((p) => p.x)), mv = mean(S.sim.pts.map((p) => p.y));
      const sdx = Math.max(0.18, std(S.sim.pts.map((p) => p.x)));
      const sdy = Math.max(0.18, std(S.sim.pts.map((p) => p.y)));
      S.sim.pts.forEach((p) => {
        const spx = -p.x / (sx * sx), spy = -(p.y - 0.1) / (sy * sy);
        const sqx = -(p.x - mu) / (sdx * sdx), sqy = -(p.y - mv) / (sdy * sdy);
        let vx = 0, vy = 0;
        if (ph === 0) { /* 展示联合密度，轻微抖动 */ p.x += (Math.random() - 0.5) * 0.01; }
        else if (ph === 1) { vx = spx + sqx; vy = spy + sqy; }
        else if (ph === 2) { vy = spy + sqy; vx = 0.15 * spx; } /* 观测轴钉住：y→数据 */
        else { vx = spx + sqx; vy = 0; } /* 缺失轴被推 */
        p.x = clamp(p.x + vx * dt * 0.9, -2.3, 2.3);
        p.y = clamp(p.y + vy * dt * 0.9, -1.8, 1.8);
      });
      const sd = std(S.sim.pts.map((p) => p.x));
      S.metrics.F_joint = -0.5 * (mean(S.sim.pts.map((p) => p.x * p.x / (sx * sx) + p.y * p.y / (sy * sy)))) - hG(sd);
      S.metrics.σ_miss = std(S.sim.pts.map((p) => p.x));
      S.metrics.σ_obs = std(S.sim.pts.map((p) => p.y));
    },
    draw(ctx, S, T) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const titles = ["联合平面上的密度", "NER 使其变尖", "观测轴被数据钉住", "缺失轴被得分推动"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "F^{joint-NER}=E log p(Xj)−H[Q]");
      paramBadge(ctx, S, T, "散布", S.sliders.spread != null ? S.sliders.spread : 0.7);
      const B = box(S, 48, 42, 16, 36);
      const mX = (x) => B.x0 + (x + 2.4) / 4.8 * B.w;
      const mY = (y) => B.y0 + (1.9 - y) / 3.8 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss", "x_obs");
      const sx = 0.55 + 0.25 * spread, sy = 0.42;
      const nx = 20, ny = 12;
      if (ph === 0 || ph === 1) {
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const x = -2.4 + 4.8 * (i + 0.5) / nx, y = -1.9 + 3.8 * (j + 0.5) / ny;
          const p = Math.exp(-0.5 * (x * x / (sx * sx) + y * y / (sy * sy)));
          ctx.fillStyle = hexA(T.c2, 0.08 + 0.55 * p);
          ctx.fillRect(mX(x) - B.w / nx / 2, mY(y) - B.h / ny / 2, B.w / nx + 0.4, B.h / ny + 0.4);
        }
      }
      if (ph === 2) {
        ctx.strokeStyle = T.c3; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(B.x0, mY(0.1)); ctx.lineTo(B.x1, mY(0.1)); ctx.stroke();
        ctx.setLineDash([]);
        txt(ctx, "观测钉在数据层", B.x0 + 8, mY(0.1) - 8, T.c3, 12);
      }
      (S.sim.pts || []).forEach((p) => {
        const y = ph === 2 ? lerp(p.y, 0.1, 0.85) : p.y;
        ctx.fillStyle = ph === 3 ? T.c6 : T.c5;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(y), 4.2, 0, TWO); ctx.fill();
        if (ph === 3) arrow(ctx, mX(p.x), mY(y), -p.x * 10, 0, T.c4, 1.3);
      });
    },
  });

  /* ===================================================================
   * 17. 联合空间 RKHS 微扰（梯度乘遮罩）
   * =================================================================== */
  reg("joint_rkhs_perturbation", {
    init(S) {
      const rng = mulberry(17);
      S.sim.pts = Array.from({ length: 16 }, () => ({
        x: (rng() - 0.5) * 2.0, y: (rng() - 0.5) * 1.6, miss: rng() > 0.28,
      }));
    },
    tick(S, dt) {
      const v = Math.max(0.15, S.sliders.v != null ? S.sliders.v : 0.7);
      const scoreOf = (p) => ({ x: -p.x / 0.4, y: -p.y / 0.4 });
      const freeze = S.phase >= 1 ? "y" : null;
      const phi = svgdPhi(S.sim.pts, v, scoreOf, freeze);
      /* 再按每点 miss 遮罩：观测点完全不动 */
      phi.forEach((f, i) => { if (!S.sim.pts[i].miss) { f.x = 0; f.y = 0; } });
      S.sim.phi = phi;
      if (S.phase >= 2) {
        S.sim.pts.forEach((p, i) => {
          p.x = clamp(p.x + phi[i].x * dt * 0.5, -2.1, 2.1);
          p.y = clamp(p.y + phi[i].y * dt * 0.5, -1.7, 1.7);
        });
      }
      S.metrics.φ_miss = mean(phi.map((f, i) => S.sim.pts[i].miss ? Math.abs(f.x) : 0));
      S.metrics.φ_obs = mean(phi.map((f, i) => S.sim.pts[i].miss ? Math.abs(f.y) : hypot(f.x, f.y)));
      S.metrics.v = v;
    },
    draw(ctx, S, T) {
      const v = Math.max(0.15, S.sliders.v != null ? S.sliders.v : 0.7);
      const ph = S.phase;
      const titles = ["联合得分箭头（全坐标）", "乘 (1−M)：观测分量掐断", "只移动缺失坐标", "核仍用联合距离交互"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "φ_RKHS · 梯度仅作用于缺失位");
      paramBadge(ctx, S, T, "核带宽", v);
      const B = box(S, 42, 50, 14, 36);
      const mX = (x) => B.x0 + (x + 2.2) / 4.4 * B.w;
      const mY = (y) => B.y0 + (1.8 - y) / 3.6 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "缺失坐标", "观测坐标");
      const pts = S.sim.pts || [];
      const scoreOf = (p) => ({ x: -p.x / 0.4, y: -p.y / 0.4 });
      const phi = svgdPhi(pts, v, scoreOf, ph >= 1 ? "y" : null);
      phi.forEach((f, i) => { if (!pts[i].miss) { f.x = 0; f.y = 0; } });
      if (ph !== 0) {
        for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
          const K = rbf(pts[i].x - pts[j].x, pts[i].y - pts[j].y, v);
          if (K > 0.15) {
            ctx.strokeStyle = hexA(T.c7, K * 0.7);
            ctx.lineWidth = 0.7 + 2.5 * K;
            ctx.beginPath(); ctx.moveTo(mX(pts[i].x), mY(pts[i].y)); ctx.lineTo(mX(pts[j].x), mY(pts[j].y)); ctx.stroke();
          }
        }
      }
      pts.forEach((p, i) => {
        ctx.fillStyle = p.miss ? T.c6 : T.c3;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), 5, 0, TWO); ctx.fill();
        if (ph === 0) {
          const s = { x: -p.x / 0.4, y: -p.y / 0.4 };
          arrow(ctx, mX(p.x), mY(p.y), s.x * 16, -s.y * 14, T.c5, 1.3, 24);
        } else if (ph === 1) {
          const s = { x: -p.x / 0.4, y: -p.y / 0.4 };
          arrow(ctx, mX(p.x), mY(p.y), s.x * 14, 0, T.c4, 1.5, 24);
          ctx.setLineDash([3, 3]);
          arrow(ctx, mX(p.x), mY(p.y), 0, -s.y * 14, hexA(T.mu, 0.5), 1, 20);
          ctx.setLineDash([]);
        } else if (phi[i]) {
          arrow(ctx, mX(p.x), mY(p.y), phi[i].x * 16, -phi[i].y * 14, T.c4, 1.4, 24);
        }
      });
      legend(ctx, [{ c: T.c6, lab: "缺失点（可动）" }, { c: T.c3, lab: "观测点（钉死）" }], 44, S.H - 16, T);
    },
  });

  /* ===================================================================
   * 18. 平均场分解  Q(x_m,x_o)=Q(x_m) p(x_o)
   * =================================================================== */
  reg("mean_field_factorization", {
    init(S) {
      const rng = mulberry(18);
      S.sim.pts = Array.from({ length: 40 }, () => {
        const z = rng() * TWO, r = 0.35 + rng() * 0.5;
        return { x: 0.9 * Math.cos(z) * r * 2.2 + (rng() - 0.5) * 0.2, y: 0.7 * Math.sin(z) * r * 2.0 };
      });
    },
    tick(S) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const rho = S.phase === 0 ? 0.72 * (0.5 + 0.5 * spread) : 0;
      S.sim.rho = rho; S.sim.sx = 0.7 * spread + 0.35; S.sim.sy = 0.45;
      let cov = 0;
      const mx = mean(S.sim.pts.map((p) => p.x)), my = mean(S.sim.pts.map((p) => p.y));
      S.sim.pts.forEach((p) => { cov += (p.x - mx) * (p.y - my); });
      cov /= S.sim.pts.length;
      S.metrics.相关ρ = rho;
      S.metrics.样本cov = cov;
      S.metrics.交叉项 = rho * S.sim.sx * S.sim.sy;
    },
    draw(ctx, S, T) {
      const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
      const ph = S.phase;
      const rho = ph === 0 ? 0.72 * (0.5 + 0.5 * spread) : 0;
      const sx = 0.7 * spread + 0.35, sy = 0.45;
      const titles = ["联合密度网格（有相关）", "因子化：缺失边缘 × 观测钉死", "交叉项消失", "移动只发生在缺失轴"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "Q(Xj)=Q(Xm) p(Xo)");
      paramBadge(ctx, S, T, "散布", spread);
      const B = box(S, 48, 42, 16, 36);
      const mX = (x) => B.x0 + (x + 2.4) / 4.8 * B.w;
      const mY = (y) => B.y0 + (1.8 - y) / 3.6 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x_miss", "x_obs");
      const nx = 22, ny = 14;
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const x = -2.4 + 4.8 * (i + 0.5) / nx, y = -1.8 + 3.6 * (j + 0.5) / ny;
        const z1 = x / sx, z2 = y / sy;
        const q = Math.exp(-0.5 / Math.max(1e-4, 1 - rho * rho) * (z1 * z1 + z2 * z2 - 2 * rho * z1 * z2));
        ctx.fillStyle = hexA(ph === 0 ? T.c7 : T.c2, 0.08 + 0.55 * q);
        ctx.fillRect(mX(x) - B.w / nx / 2, mY(y) - B.h / ny / 2, B.w / nx + 0.4, B.h / ny + 0.4);
      }
      const ang = Math.atan2(2 * rho * sx * sy, sx * sx - sy * sy) / 2;
      ctx.strokeStyle = T.c5; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(mX(0), mY(0), 70 * sx, 52 * sy, ph === 0 ? ang : 0, 0, TWO); ctx.stroke();
      if (ph >= 1) {
        txt(ctx, "ρ=0 轴对齐  Q(xm)p(xo)", 96, 60, T.c3, 12, "left", true);
      }
      if (ph === 2) {
        txt(ctx, "交叉项 ρ σm σo = " + (rho * sx * sy).toFixed(3) + " → 0", 96, 78, T.c4, 12);
      }
      if (ph === 3) {
        for (let k = 0; k < 8; k++) {
          const y = -1.1 + 2.2 * k / 7;
          arrow(ctx, mX(-0.3), mY(y), 28, 0, T.c6, 1.5);
        }
        txt(ctx, "p(x_o) 不参与优化，位移只沿缺失轴", 96, 60, T.c6, 12, "left", true);
      }
    },
  });

  /* ===================================================================
   * 19. 去噪得分匹配  L_DSM = ½ E ‖s_θ(x̂) − ∇log q_σ(x̂|x)‖²
   * =================================================================== */
  reg("denoising_score_matching", {
    init(S) {
      const rng = mulberry(19);
      S.sim.clean = [];
      for (let i = 0; i < 22; i++) {
        const left = rng() < 0.5;
        S.sim.clean.push({
          x: (left ? -0.85 : 0.9) + (rng() - 0.5) * 0.35,
          y: (left ? 0.15 : -0.1) + (rng() - 0.5) * 0.5,
        });
      }
      S.sim.th = { ax: 0.2, ay: 0.2, c: 0, mx: 0, my: 0 };
      S.sim.noisy = [];
      S.sim.Lh = [];
      const rng2 = mulberry(191);
      S.sim.eps = S.sim.clean.map(() => {
        const u = rng2() || 1e-9, v = rng2();
        return { e1: Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v), e2: Math.sqrt(-2 * Math.log(u)) * Math.sin(TWO * v) };
      });
    },
    tick(S, dt) {
      const sig = Math.max(0.12, S.sliders.sig != null ? S.sliders.sig : 0.45);
      const th = S.sim.th, C = S.sim.clean;
      /* 生成噪声样本 */
      S.sim.noisy = C.map((p) => {
        const u = Math.random() || 1e-9, v = Math.random() || 1e-9;
        const e1 = Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
        const e2 = Math.sqrt(-2 * Math.log(u)) * Math.sin(TWO * v);
        return { x: p.x + sig * e1, y: p.y + sig * e2, cx: p.x, cy: p.y };
      });
      function score(th, x, y) {
        const dx = x - th.mx, dy = y - th.my;
        return { sx: -th.ax * dx - th.c * dy, sy: -th.ay * dy - th.c * dx };
      }
      function loss(th) {
        let L = 0;
        S.sim.noisy.forEach((q) => {
          const s = score(th, q.x, q.y);
          const tx = -(q.x - q.cx) / (sig * sig), ty = -(q.y - q.cy) / (sig * sig);
          L += 0.5 * ((s.sx - tx) * (s.sx - tx) + (s.sy - ty) * (s.sy - ty));
        });
        return L / S.sim.noisy.length;
      }
      /* 有限差 SGD，让网络箭头逐步对齐 */
      if (S.phase >= 3 || S.phase === 2) {
        const eta = 0.08 * (S.phase >= 3 ? 1 : 0.4);
        const keys = ["ax", "ay", "c", "mx", "my"];
        keys.forEach((k) => {
          const old = th[k], eps = 0.04;
          th[k] = old + eps; const lp = loss(th);
          th[k] = old - eps; const lm = loss(th);
          th[k] = old;
          th[k] -= eta * (lp - lm) / (2 * eps);
        });
        th.ax = clamp(th.ax, 0.05, 8); th.ay = clamp(th.ay, 0.05, 8);
      }
      const L = loss(th);
      S.sim.L = L;
      if (S.sim.Lh.length > 60) S.sim.Lh.shift();
      S.sim.Lh.push(L);
      let cos = 0, n = 0;
      S.sim.noisy.forEach((q) => {
        const s = { sx: -th.ax * (q.x - th.mx) - th.c * (q.y - th.my), sy: -th.ay * (q.y - th.my) - th.c * (q.x - th.mx) };
        const tx = -(q.x - q.cx) / (sig * sig), ty = -(q.y - q.cy) / (sig * sig);
        const a = hypot(s.sx, s.sy), b = hypot(tx, ty);
        if (a > 1e-6 && b > 1e-6) { cos += (s.sx * tx + s.sy * ty) / (a * b); n++; }
      });
      S.metrics.L_DSM = L;
      S.metrics.σ = sig;
      S.metrics.方向余弦 = n ? cos / n : 0;
    },
    draw(ctx, S, T) {
      const sig = Math.max(0.12, S.sliders.sig != null ? S.sliders.sig : 0.45);
      const ph = S.phase, th = S.sim.th;
      const titles = ["干净样本 x", "加高斯噪声得 x̂", "真得分指向干净点", "网络箭头对齐真得分"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "s_true=−(x̂−x)/σ²");
      paramBadge(ctx, S, T, "噪声σ", sig);
      const B = box(S, 40, 50, ph === 3 ? 118 : 14, 36);
      const mX = (x) => B.x0 + (x + 2.1) / 4.2 * B.w;
      const mY = (y) => B.y0 + (1.6 - y) / 3.2 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "x", "y");
      (S.sim.clean || []).forEach((p) => {
        ctx.fillStyle = T.c3;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(p.y), ph === 0 ? 6 : 4, 0, TWO); ctx.fill();
      });
      if (ph >= 1) {
        const noisy = (S.sim.clean || []).map((p, i) => {
          const e = (S.sim.eps || [])[i] || { e1: 0.5, e2: -0.3 };
          return { x: p.x + sig * e.e1, y: p.y + sig * e.e2, cx: p.x, cy: p.y };
        });
        noisy.forEach((q) => {
          ctx.fillStyle = hexA(T.c6, 0.85);
          ctx.beginPath(); ctx.arc(mX(q.x), mY(q.y), 3.4, 0, TWO); ctx.fill();
          if (ph === 1) {
            ctx.strokeStyle = hexA(T.mu, 0.45);
            ctx.beginPath(); ctx.moveTo(mX(q.cx), mY(q.cy)); ctx.lineTo(mX(q.x), mY(q.y)); ctx.stroke();
          }
          const tx = -(q.x - q.cx) / (sig * sig), ty = -(q.y - q.cy) / (sig * sig);
          if (ph === 2) arrow(ctx, mX(q.x), mY(q.y), tx * 12, -ty * 10, T.c5, 1.3, 24);
          if (ph === 3) {
            const sx = -th.ax * (q.x - th.mx) - th.c * (q.y - th.my);
            const sy = -th.ay * (q.y - th.my) - th.c * (q.x - th.mx);
            const a = 0.62;
            arrow(ctx, mX(q.x), mY(q.y), (sx * (1 - a) + tx * a) * 10, -(sy * (1 - a) + ty * a) * 9, T.c4, 1.4, 24);
          }
        });
      }
      if (ph === 3) {
        const Rx = S.W - 108, Ry = 48;
        txt(ctx, "L_DSM", Rx, Ry, T.tx, 11, "left", true);
        const arr = S.sim.Lh || [];
        if (arr.length > 2) {
          let mn = Infinity, mx = -Infinity;
          arr.forEach((v) => { if (v < mn) mn = v; if (v > mx) mx = v; });
          const sp = mx - mn || 1;
          ctx.beginPath();
          arr.forEach((v, i) => {
            const x = Rx + i / (arr.length - 1) * 90;
            const y = Ry + 90 - (v - mn) / sp * 80;
            if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
          });
          ctx.strokeStyle = T.c4; ctx.lineWidth = 2; ctx.stroke();
        }
        txt(ctx, (S.metrics.L_DSM || 0).toFixed(2), Rx, Ry + 108, T.c4, 12);
      }
      legend(ctx, [{ c: T.c3, lab: "干净 x" }, { c: T.c6, lab: "噪声 x̂" }, { c: T.c5, lab: "真得分" }, { c: T.c4, lab: "s_θ" }], 42, S.H - 16, T);
    },
  });

  /* ===================================================================
   * 20. KnewImp 补全更新  Xmiss ← Xmiss + ε φ_RKHS(Xjoint)
   * =================================================================== */
  reg("knewimp_imputation_update", {
    init(S) {
      S.sim.n = 6; S.sim.d = 5;
      S.sim.X = makeX(6, 5, 20);
      const rng = mulberry(20);
      S.sim.pts = [];
      for (let i = 0; i < 20; i++) {
        const x = -1.2 + rng() * 2.4;
        const y = 0.55 * x + (rng() - 0.5) * 0.35;
        S.sim.pts.push({ x, yt: y, y: y + (rng() - 0.5) * 1.4, miss: rng() < 0.5 });
      }
      S.sim.missUsed = -1;
      S.sim.iter = 0;
    },
    tick(S, dt) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) {
        S.sim.missUsed = miss;
        S.sim.M = makeM(6, 5, miss, 31);
        S.sim.pts.forEach((p, i) => { p.miss = ((i * 17) % 100) / 100 < miss + 0.08; });
      }
      const v = 0.55;
      const scoreOf = (p) => ({ x: -(p.x - 0) / 0.7, y: -(p.y - 0.55 * p.x) / 0.22 });
      const movable = S.sim.pts;
      const phi = svgdPhi(movable, v, scoreOf, "x"); /* 观测维 A 钉死，只更新缺失维 B */
      phi.forEach((f, i) => { if (!movable[i].miss) { f.x = 0; f.y = 0; } });
      if (S.phase >= 2) {
        movable.forEach((p, i) => {
          p.y = clamp(p.y + phi[i].y * dt * 1.6, -2, 2);
        });
        S.sim.iter++;
      }
      S.sim.phi = phi;
      let mse = 0, nm = 0;
      movable.forEach((p) => { if (p.miss) { mse += (p.y - p.yt) * (p.y - p.yt); nm++; } });
      S.metrics.缺失率 = miss;
      S.metrics.补全MSE = nm ? mse / nm : 0;
      S.metrics.平均_φ = mean(phi.map((f) => hypot(f.x, f.y)));
      S.metrics.迭代 = S.sim.iter;
    },
    draw(ctx, S, T) {
      const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
      if (S.sim.missUsed !== miss) {
        S.sim.missUsed = miss; S.sim.M = makeM(6, 5, miss, 31);
      }
      const ph = S.phase;
      const titles = ["遮罩空洞", "得分网络给出联合得分", "RKHS 向量场只推缺失格", "若干步后合成完整表"];
      badge(ctx, S, T, titles[ph]); chip(ctx, S, T, "X_m ← X_m + ε φ_RKHS(X_joint)");
      paramBadge(ctx, S, T, "缺失率", miss);
      const Mw = Math.min(240, S.W * 0.34);
      const MB = { x: 16, y: 44, w: Mw, h: 110 };
      const Imp = S.sim.X.map((row, i) => row.map((v, j) => {
        if (!S.sim.M[i][j]) return clamp(v * 0.3 + 0.4 + 0.02 * Math.sin(S.t + i + j), 0, 1);
        return v;
      }));
      const Show = ph === 3 ? Imp.map((row, i) => row.map((v, j) => S.sim.M[i][j] ? S.sim.X[i][j] : v)) : S.sim.X;
      drawMatrix(ctx, Show, S.sim.M, MB, T, {
        title: ph === 3 ? "合成 X̂" : "数据表",
        hideMiss: ph < 3, cross: ph === 0, hiMiss: ph === 2, hiObs: ph === 3, noText: true,
      });
      const B = { x0: Mw + 36, y0: 44, x1: S.W - 14, y1: S.H - 36 };
      B.w = B.x1 - B.x0; B.h = B.y1 - B.y0;
      const mX = (x) => B.x0 + (x + 1.6) / 3.2 * B.w;
      const mY = (y) => B.y0 + (1.5 - y) / 3.0 * B.h;
      axes(ctx, B.x0, B.y0, B.x1, B.y1, T, "特征 A", "缺失特征 B");
      ctx.setLineDash([4, 3]); ctx.strokeStyle = hexA(T.mu, 0.6);
      ctx.beginPath();
      for (let i = 0; i <= 20; i++) {
        const x = -1.5 + 3 * i / 20, y = 0.55 * x;
        if (i) ctx.lineTo(mX(x), mY(y)); else ctx.moveTo(mX(x), mY(y));
      }
      ctx.stroke(); ctx.setLineDash([]);
      (S.sim.pts || []).forEach((p, i) => {
        const yy = !p.miss ? p.yt : (ph === 3 ? lerp(p.y, p.yt, 0.78) : p.y);
        ctx.fillStyle = p.miss ? T.c6 : T.c3;
        ctx.beginPath(); ctx.arc(mX(p.x), mY(yy), p.miss ? 5 : 3.5, 0, TWO); ctx.fill();
        if (p.miss && ph >= 1) {
          const s = { x: -(p.x) / 0.7, y: -(p.y - 0.55 * p.x) / 0.22 };
          if (ph === 1) arrow(ctx, mX(p.x), mY(p.y), s.x * 12, -s.y * 14, T.c5, 1.2);
          if (ph >= 2 && S.sim.phi && S.sim.phi[i]) arrow(ctx, mX(p.x), mY(p.y), 0, -S.sim.phi[i].y * 16, T.c4, 1.4);
        }
      });
      txt(ctx, "KnewImp：DSM 得分 + RKHS 场 + 遮罩合成", 18, S.H - 16, T.tx, 12);
    },
  });

  g.__CH3_IDS = MINE;
})(window);
