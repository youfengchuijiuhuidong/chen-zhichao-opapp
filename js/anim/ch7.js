// chapter 7 custom animations
// 第7章展望：RKHS 正则替换、哈密顿/动量加速、W₂ 传输 vs FR 传送、Stein 冷启动对齐
(function (global) {
  "use strict";

  var OP = (global.OP_ANIMS = global.OP_ANIMS || {});
  var TWO = Math.PI * 2;
  var clamp = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var ease = function (t) {
    t = clamp(t, 0, 1);
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  };
  var hypot = Math.hypot;

  function sl(S, k, d) {
    var v = S.sliders ? S.sliders[k] : null;
    return v == null || v === "" ? d : +v;
  }
  function frac(S) { return (S.t / 2.4) % 1; }
  function hook(S) { global.__CH7_S = S; }
  function finite(x) { return typeof x === "number" && isFinite(x) ? x : 0; }
  function setm(S, o) {
    var k;
    for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) S.metrics[k] = finite(o[k]) === o[k] && typeof o[k] === "number" ? finite(o[k]) : o[k];
  }
  function rgba(col, a) {
    if (!col) return "rgba(139,152,181," + a + ")";
    if (col[0] === "r") {
      var m = col.match(/[\d.]+/g) || ["139", "152", "181"];
      return "rgba(" + m[0] + "," + m[1] + "," + m[2] + "," + a + ")";
    }
    var h = col.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (!isFinite(n)) return "rgba(139,152,181," + a + ")";
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function rr(ctx, x, y, w, h, r) {
    var R = Math.min(r || 8, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + R, y);
    ctx.arcTo(x + w, y, x + w, y + h, R);
    ctx.arcTo(x + w, y + h, x, y + h, R);
    ctx.arcTo(x, y + h, x, y, R);
    ctx.arcTo(x, y, x + w, y, R);
    ctx.closePath();
  }
  var OP_FONT = global.OP_FONT_STACK || '"Noto Sans SC","PingFang SC",sans-serif';
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
    var txt = (S.steps && S.steps[S.phase]) || "";
    ctx.font = "12px " + OP_FONT;
    var t = txt;
    while (t.length > 4 && ctx.measureText(t).width > S.W - 28) t = t.slice(0, -2);
    if (t !== txt) t += "…";
    var w = Math.min(S.W - 16, ctx.measureText(t).width + 18);
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
    ctx.font = "11px " + OP_FONT;
    var w = ctx.measureText(text).width + 10;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.72)" : "rgba(255,255,255,0.82)";
    rr(ctx, x, y - 12, w, 16, 4); ctx.fill();
    ctx.strokeStyle = col || T.c5;
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = col || T.tx;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(text, x + 5, y - 4);
  }
  function mulberry(a) {
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function nrm(rng) {
    var u = 0, v = 0;
    while (!u) u = rng();
    while (!v) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
  }
  function onPhase(sim, S) {
    if (sim._ph !== S.phase) {
      sim._ph = S.phase;
      sim._enter = true;
      sim._phT = S.t;
      return true;
    }
    sim._enter = false;
    return false;
  }
  function push(arr, v, cap) {
    arr.push(v);
    if (arr.length > cap) arr.shift();
  }
  function area(S) {
    return { x: 12, y: 30, w: S.W - 24, h: S.H - 58 };
  }
  function splitLR(S, ratio) {
    ratio = ratio == null ? 0.58 : ratio;
    var A = area(S);
    var gap = 10;
    var lw = A.w * ratio - gap / 2;
    return {
      L: { x: A.x, y: A.y, w: lw, h: A.h },
      R: { x: A.x + lw + gap, y: A.y, w: A.w - lw - gap, h: A.h },
    };
  }
  function panel(ctx, box, T, title, on) {
    ctx.save();
    ctx.fillStyle = T.dark ? "rgba(10,16,28,0.55)" : "rgba(255,255,255,0.62)";
    rr(ctx, box.x, box.y, box.w, box.h, 10);
    ctx.fill();
    ctx.strokeStyle = on ? T.c5 : T.line;
    ctx.lineWidth = on ? 2 : 1;
    ctx.stroke();
    if (title) {
      ctx.fillStyle = on ? T.c5 : T.mu;
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(title, box.x + 10, box.y + 16);
    }
    ctx.restore();
  }
  function axes(ctx, box, T, xlab, ylab) {
    ctx.save();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x + 28, box.y + 10);
    ctx.lineTo(box.x + 28, box.y + box.h - 22);
    ctx.lineTo(box.x + box.w - 10, box.y + box.h - 22);
    ctx.stroke();
    ctx.fillStyle = T.mu;
    ctx.font = "11px sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(xlab || "", box.x + box.w - 12, box.y + box.h - 6);
    ctx.save();
    ctx.translate(box.x + 12, box.y + 22);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = "right";
    ctx.fillText(ylab || "", 0, 0);
    ctx.restore();
    ctx.restore();
  }
  function map2(box, xmin, xmax, ymin, ymax) {
    var x0 = box.x + 28, y0 = box.y + 10, x1 = box.x + box.w - 10, y1 = box.y + box.h - 22;
    return {
      x0: x0, y0: y0, x1: x1, y1: y1,
      X: function (x) { return x0 + (x - xmin) / (xmax - xmin || 1) * (x1 - x0); },
      Y: function (y) { return y1 - (y - ymin) / (ymax - ymin || 1) * (y1 - y0); },
    };
  }
  function arrow(ctx, x, y, dx, dy, col, lw) {
    var L = hypot(dx, dy);
    if (L < 0.7) return;
    ctx.save();
    ctx.strokeStyle = ctx.fillStyle = col;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
    var a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x + dx, y + dy);
    ctx.lineTo(x + dx - 6.2 * Math.cos(a - 0.42), y + dy - 6.2 * Math.sin(a - 0.42));
    ctx.lineTo(x + dx - 6.2 * Math.cos(a + 0.42), y + dy - 6.2 * Math.sin(a + 0.42));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  function pill(ctx, S, T) {
    var txt = (S.steps && S.steps[S.phase]) || "";
    ctx.save();
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    var w = Math.min(S.W - 28, ctx.measureText(txt).width + 18);
    ctx.fillStyle = rgba(T.c5, T.dark ? 0.18 : 0.32);
    rr(ctx, 10, 6, w, 20, 6);
    ctx.fill();
    ctx.fillStyle = T.c5;
    ctx.fillText(txt, 18, 20);
    ctx.restore();
  }
  function legend(ctx, items, x, y, T) {
    if (!items || !items.length) return;
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    var maxW = 0;
    items.forEach(function (it) {
      var txt = it.l || it.lab || it.t || "";
      var w = ctx.measureText(txt).width;
      if (w > maxW) maxW = w;
    });
    var boxW = maxW + 24;
    var boxH = items.length * 15 + 6;
    ctx.fillStyle = T.dark ? "rgba(11, 18, 32, 0.85)" : "rgba(255, 255, 255, 0.88)";
    rr(ctx, x - 5, y - 4, boxW, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.stroke();
    items.forEach(function (it, i) {
      ctx.fillStyle = it.c;
      ctx.fillRect(x, y + i * 15, 9, 9);
      ctx.fillStyle = T.tx;
      ctx.fillText(it.l || it.lab || it.t || "", x + 14, y + i * 15 + 9);
    });
    ctx.restore();
  }
  function meter(ctx, x, y, t, T, label, col) {
    t = clamp(t, 0, 1);
    ctx.save();
    ctx.font = "11px sans-serif";
    ctx.textAlign = "left";
    ctx.fillStyle = T.mu;
    ctx.fillText(label, x, y);
    ctx.fillStyle = T.dark ? "#1a2438" : "#d7deea";
    rr(ctx, x, y + 5, 92, 9, 4);
    ctx.fill();
    ctx.fillStyle = col || T.c5;
    rr(ctx, x, y + 5, Math.max(3, 92 * t), 9, 4);
    ctx.fill();
    ctx.restore();
  }
  function slSig(S) {
    var k, s = "";
    if (!S.sliders) return "";
    for (k in S.sliders) if (Object.prototype.hasOwnProperty.call(S.sliders, k)) s += k + S.sliders[k];
    return s;
  }
  function clipBox(ctx, box) {
    ctx.beginPath();
    rr(ctx, box.x + 2, box.y + 20, box.w - 4, box.h - 24, 8);
    ctx.clip();
  }
  function spark(ctx, box, hist, T, col, ymin, ymax) {
    if (!hist || hist.length < 2) return;
    ymin = ymin == null ? Math.min.apply(null, hist) : ymin;
    ymax = ymax == null ? Math.max.apply(null, hist) : ymax;
    var sp = ymax - ymin || 1;
    ctx.save();
    ctx.strokeStyle = col || T.c3;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    hist.forEach(function (v, i) {
      var x = box.x + 8 + i / Math.max(1, hist.length - 1) * (box.w - 16);
      var y = box.y + box.h - 10 - (v - ymin) / sp * (box.h - 28);
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
    ctx.stroke();
    ctx.restore();
  }
  function linsolve(A, b) {
    var n = b.length, i, j, r, piv, tmp, d, f, M = [];
    if (!n) return [];
    for (i = 0; i < n; i++) M[i] = A[i].slice().concat([b[i]]);
    for (i = 0; i < n; i++) {
      piv = i;
      for (r = i + 1; r < n; r++) if (Math.abs(M[r][i]) > Math.abs(M[piv][i])) piv = r;
      tmp = M[i]; M[i] = M[piv]; M[piv] = tmp;
      d = M[i][i];
      if (Math.abs(d) < 1e-12) d = 1e-12;
      for (j = i; j <= n; j++) M[i][j] /= d;
      for (r = 0; r < n; r++) if (r !== i) {
        f = M[r][i];
        for (j = i; j <= n; j++) M[r][j] -= f * M[i][j];
      }
    }
    return M.map(function (row) { return row[n]; });
  }
  function rbf(dx, dy, h) {
    var s = h * h + 1e-8;
    return Math.exp(-(dx * dx + dy * dy) / (2 * s));
  }
  function cov2(pts) {
    var n = pts.length || 1, mx = 0, my = 0, i, cxx = 0, cxy = 0, cyy = 0;
    for (i = 0; i < pts.length; i++) { mx += pts[i].x; my += pts[i].y; }
    mx /= n; my /= n;
    for (i = 0; i < pts.length; i++) {
      var dx = pts[i].x - mx, dy = pts[i].y - my;
      cxx += dx * dx; cxy += dx * dy; cyy += dy * dy;
    }
    return { mx: mx, my: my, cxx: cxx / n + 1e-4, cxy: cxy / n, cyy: cyy / n };
  }
  function ellipseAt(ctx, cx, cy, cxx, cxy, cyy, sc, col) {
    var tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
    var tmp = Math.sqrt(Math.max(0, tr * tr / 4 - det));
    var l1 = tr / 2 + tmp, l2 = tr / 2 - tmp;
    var ang = Math.abs(cxy) < 1e-9 ? (cxx >= cyy ? 0 : Math.PI / 2) : Math.atan2(l1 - cxx, cxy);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(0, 0, sc * Math.sqrt(Math.max(1e-4, l1)), sc * Math.sqrt(Math.max(1e-4, l2)), 0, 0, TWO);
    ctx.stroke();
    ctx.restore();
  }
  function gauss(x, m, s) {
    return Math.exp(-0.5 * ((x - m) / s) * ((x - m) / s)) / (s * Math.sqrt(TWO));
  }
  function fill1d(ctx, X, Y, xs, ys, col) {
    if (!xs.length) return;
    ctx.beginPath();
    ctx.moveTo(X(xs[0]), Y(0));
    var i;
    for (i = 0; i < xs.length; i++) ctx.lineTo(X(xs[i]), Y(ys[i]));
    ctx.lineTo(X(xs[xs.length - 1]), Y(0));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.fill();
  }
  function stroke1d(ctx, X, Y, xs, ys, col, lw) {
    ctx.beginPath();
    xs.forEach(function (x, i) {
      if (i) ctx.lineTo(X(x), Y(ys[i])); else ctx.moveTo(X(x), Y(ys[i]));
    });
    ctx.strokeStyle = col;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
  }
  function linspace(a, b, n) {
    var o = [], i;
    for (i = 0; i < n; i++) o.push(a + (b - a) * i / (n - 1));
    return o;
  }
  function logsumexp(arr) {
    var m = -Infinity, i, s = 0;
    for (i = 0; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    for (i = 0; i < arr.length; i++) s += Math.exp(arr[i] - m);
    return m + Math.log(s + 1e-15);
  }

  /* ---------- 香蕉分布 / 病态椭圆 ---------- */
  function bananaScore(x, y) {
    var s = 0.32, u = y - x * x;
    return { gx: -x + (2 * x * u) / (s * s), gy: -u / (s * s) };
  }
  function bananaLogp(x, y) {
    var s = 0.32, u = y - x * x;
    return -0.5 * (x * x + (u / s) * (u / s));
  }
  function mixLogp(x, y) {
    var a = -0.5 * (((x + 1.15) * (x + 1.15)) / 0.22 + (y * y) / 0.28);
    var b = -0.5 * (((x - 1.18) * (x - 1.18)) / 0.22 + (y * y) / 0.28);
    return logsumexp([a, b]) + Math.log(0.5);
  }
  function mixScore(x, y) {
    var a = Math.exp(-0.5 * (((x + 1.15) * (x + 1.15)) / 0.22 + (y * y) / 0.28));
    var b = Math.exp(-0.5 * (((x - 1.18) * (x - 1.18)) / 0.22 + (y * y) / 0.28));
    var z = a + b + 1e-12;
    return {
      gx: (a * (-(x + 1.15) / 0.22) + b * (-(x - 1.18) / 0.22)) / z,
      gy: (a * (-y / 0.28) + b * (-y / 0.28)) / z,
    };
  }
  function kdeScore(pts, x, y, h, w) {
    var n = pts.length, i, s = 0, sx = 0, sy = 0, k, dx, dy;
    for (i = 0; i < n; i++) {
      dx = x - pts[i].x; dy = y - pts[i].y;
      k = rbf(dx, dy, h) * (w ? w[i] : 1 / n);
      s += k;
      sx += k * (-dx / (h * h + 1e-8));
      sy += k * (-dy / (h * h + 1e-8));
    }
    s += 1e-12;
    return { gx: sx / s, gy: sy / s, q: s };
  }
  function svgdPhi(pts, i, h, scoreFn, w) {
    var n = pts.length, px = 0, py = 0, j, dx, dy, k, sc, wi, wj;
    wi = w ? w[i] : 1 / n;
    for (j = 0; j < n; j++) {
      wj = w ? w[j] : 1 / n;
      dx = pts[i].x - pts[j].x;
      dy = pts[i].y - pts[j].y;
      k = rbf(dx, dy, h);
      sc = scoreFn(pts[j].x, pts[j].y);
      px += wj * (k * sc.gx + k * dx / (h * h + 1e-8));
      py += wj * (k * sc.gy + k * dy / (h * h + 1e-8));
    }
    return { x: px, y: py, w: wi };
  }
  function klProxy(pts, logpFn, h, w) {
    var n = pts.length, i, s = 0, q, lp;
    for (i = 0; i < n; i++) {
      q = kdeScore(pts, pts[i].x, pts[i].y, h, w);
      lp = logpFn(pts[i].x, pts[i].y);
      s += (w ? w[i] : 1 / n) * (Math.log(q.q + 1e-12) - lp);
    }
    return s;
  }
  function ess(w) {
    var s = 0, i;
    for (i = 0; i < w.length; i++) s += w[i] * w[i];
    return s > 0 ? 1 / s : w.length;
  }
  function bananaPath(ctx, M, T, alpha) {
    var xs = linspace(-1.35, 1.35, 50), i, y1, y2, s = 0.32, E = 2.2;
    ctx.beginPath();
    for (i = 0; i < xs.length; i++) {
      var x = xs[i];
      var inside = Math.max(0, 2 * E - x * x);
      y1 = x * x + s * Math.sqrt(inside);
      if (i) ctx.lineTo(M.X(x), M.Y(y1)); else ctx.moveTo(M.X(x), M.Y(y1));
    }
    for (i = xs.length - 1; i >= 0; i--) {
      var x2 = xs[i];
      var ins2 = Math.max(0, 2 * E - x2 * x2);
      y2 = x2 * x2 - s * Math.sqrt(ins2);
      ctx.lineTo(M.X(x2), M.Y(y2));
    }
    ctx.closePath();
    ctx.fillStyle = rgba(T.c6, alpha == null ? 0.16 : alpha);
    ctx.fill();
    ctx.strokeStyle = rgba(T.c6, 0.85);
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  function twoBlobs(ctx, M, T) {
    ctx.fillStyle = rgba(T.c6, 0.16);
    ctx.beginPath(); ctx.ellipse(M.X(-1.15), M.Y(0), 36, 26, 0, 0, TWO); ctx.fill();
    ctx.beginPath(); ctx.ellipse(M.X(1.18), M.Y(0), 36, 26, 0, 0, TWO); ctx.fill();
    ctx.strokeStyle = rgba(T.c6, 0.7);
    ctx.beginPath(); ctx.ellipse(M.X(-1.15), M.Y(0), 36, 26, 0, 0, TWO); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(M.X(1.18), M.Y(0), 36, 26, 0, 0, TWO); ctx.stroke();
  }

  /* ============================================================
   * 1. RKHS 范数正则
   * φ* = argmin_H L(φ)+½‖φ‖_H² ，表示定理 φ=Σ a_i K(x,x_i)
   * ============================================================ */
  function rkhsInit(S) {
    var rng = mulberry(7), n = 8, i, pts = [];
    for (i = 0; i < n; i++) pts.push({ x: nrm(rng) * 0.85, y: nrm(rng) * 0.55, u: nrm(rng) * 1.1, v: nrm(rng) * 1.1 });
    S.sim = { pts: pts, a: [], nShow: n, hist: [] };
  }
  function rkhsFit(pts, h, lam) {
    var n = pts.length, K = [], yx = [], yy = [], i, j;
    for (i = 0; i < n; i++) {
      K[i] = [];
      for (j = 0; j < n; j++) K[i][j] = rbf(pts[i].x - pts[j].x, pts[i].y - pts[j].y, h) + (i === j ? lam : 0);
      yx[i] = pts[i].u;
      yy[i] = pts[i].v;
    }
    return { ax: linsolve(K, yx), ay: linsolve(K, yy), K: K };
  }
  function rkhsField(pts, ax, ay, x, y, h) {
    var px = 0, py = 0, i, k;
    for (i = 0; i < pts.length; i++) {
      k = rbf(x - pts[i].x, y - pts[i].y, h);
      px += ax[i] * k;
      py += ay[i] * k;
    }
    return { x: px, y: py };
  }
  function rkhsTick(S) {
    var sim = S.sim, h = sl(S, "v", 0.8), ph = S.phase, n0 = 8, n1 = 16;
    onPhase(sim, S);
    if (ph === 2 && sim.pts.length < n1) {
      var rng = mulberry(21 + sim.pts.length), i;
      for (i = sim.pts.length; i < n1; i++) {
        sim.pts.push({ x: nrm(rng) * 1.0, y: nrm(rng) * 0.65, u: nrm(rng) * 1.2, v: nrm(rng) * 1.2 });
      }
    }
    if (ph < 2 && sim.pts.length > n0) sim.pts = sim.pts.slice(0, n0);
    var lam = ph === 0 ? 1e-4 : 0.55;
    var fit = rkhsFit(sim.pts, h, lam);
    sim.ax = fit.ax; sim.ay = fit.ay; sim.K = fit.K;
    var nh = 0, i2, j2;
    for (i2 = 0; i2 < fit.ax.length; i2++) {
      for (j2 = 0; j2 < fit.ax.length; j2++) nh += fit.ax[i2] * fit.K[i2][j2] * fit.ax[j2] + fit.ay[i2] * fit.K[i2][j2] * fit.ay[j2];
    }
    sim.nh = nh;
    push(sim.hist, nh, 70);
    setm(S, { "核带宽": h, "RKHS范数": nh, "粒子数": sim.pts.length, "矩阵n²": sim.pts.length * sim.pts.length });
  }
  function rkhsDraw(ctx, S, T) {
    var sim = S.sim, h = sl(S, "v", 0.8), ph = S.phase, P = splitLR(S, ph === 2 ? 0.42 : 0.62);
    pill(ctx, S, T);
    panel(ctx, P.L, T, ph === 3 ? "向量场 φ(x)" : "粒子上的向量场", ph === 0 || ph === 1);
    panel(ctx, P.R, T, ph === 2 ? "核矩阵 K  （O(n²)）" : (ph === 3 ? "展望：换正则" : "表示系数 a"), ph >= 2);
    var ML = map2(P.L, -2.4, 2.4, -1.6, 1.6);
    var pts = sim.pts, i, j, gx, gy, f, col;
    var lamOn = ph !== 0;
    /* 核带宽圆 */
    if (ph === 1 || ph === 2) {
      for (i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(ML.X(pts[i].x), ML.Y(pts[i].y), 18 * h, 0, TWO);
        ctx.strokeStyle = rgba(T.c4, 0.35);
        ctx.stroke();
      }
    }
    var step = ph === 0 ? 0.55 : 0.7;
    for (gx = -2.1; gx <= 2.1; gx += step) {
      for (gy = -1.3; gy <= 1.3; gy += step) {
        if (ph === 0) {
          /* 无正则：直接用观测噪声场（乱颤） */
          var nearest = pts[0], nd = 1e9, d;
          for (i = 0; i < pts.length; i++) {
            d = hypot(gx - pts[i].x, gy - pts[i].y);
            if (d < nd) { nd = d; nearest = pts[i]; }
          }
          f = { x: nearest.u * 0.28, y: nearest.v * 0.28 };
          col = T.c6;
        } else {
          f = rkhsField(pts, sim.ax || [], sim.ay || [], gx, gy, h);
          f = { x: f.x * 0.22, y: f.y * 0.22 };
          col = ph === 3 ? T.c7 : T.c3;
        }
        arrow(ctx, ML.X(gx), ML.Y(gy), f.x * 26, -f.y * 26, rgba(col, ph === 0 ? 0.7 : 0.85), 1.2);
      }
    }
    for (i = 0; i < pts.length; i++) {
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(ML.X(pts[i].x), ML.Y(pts[i].y), ph === 2 ? 3.2 : 4.2, 0, TWO);
      ctx.fill();
    }
    legend(ctx, [
      { c: T.c5, l: "粒子 x_i" },
      { c: ph === 0 ? T.c6 : T.c3, l: ph === 0 ? "无正则乱场" : "核平滑 φ" },
    ], P.L.x + 10, P.L.y + 28, T);
    meter(ctx, P.L.x + 10, P.L.y + P.L.h - 28, (h - 0.25) / 1.85, T, "核带宽 h=" + h.toFixed(2), T.c4);

    if (ph === 2 && sim.K) {
      var n = sim.K.length, cell = Math.min(14, (P.R.w - 24) / n, (P.R.h - 40) / n);
      var x0 = P.R.x + 14, y0 = P.R.y + 28;
      for (i = 0; i < n; i++) for (j = 0; j < n; j++) {
        var v = sim.K[i][j];
        ctx.fillStyle = rgba(T.c2, 0.12 + 0.88 * clamp(v, 0, 1));
        ctx.fillRect(x0 + j * cell, y0 + i * cell, cell - 1, cell - 1);
      }
      ctx.fillStyle = T.tx;
      ctx.font = "11px sans-serif";
      ctx.fillText("n=" + n + "  →  n²=" + (n * n) + "  计算涨", x0, y0 + n * cell + 16);
    } else if (ph === 3) {
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("RKHS 核范数：解析、稳", P.R.x + 14, P.R.y + 48);
      ctx.fillStyle = T.c6;
      ctx.fillText("但函数类被核绑死", P.R.x + 14, P.R.y + 68);
      ctx.fillStyle = T.c3;
      ctx.fillText("展望：一般泛函正则 / PFG", P.R.x + 14, P.R.y + 96);
      ctx.fillStyle = T.c7;
      ctx.fillText("可用神经网络当速度场", P.R.x + 14, P.R.y + 116);
      spark(ctx, { x: P.R.x + 8, y: P.R.y + 140, w: P.R.w - 16, h: P.R.h - 155 }, sim.hist, T, T.c5, 0, null);
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("‖φ‖_H² 轨迹", P.R.x + 14, P.R.y + 136);
    } else {
      var ax = sim.ax || [];
      ax.forEach(function (a, i) {
        var bh = clamp(Math.abs(a) * 18, 2, P.R.h - 50);
        ctx.fillStyle = a >= 0 ? T.c2 : T.c6;
        ctx.fillRect(P.R.x + 16 + i * 14, P.R.y + P.R.h - 18 - bh, 10, bh);
      });
      ctx.fillStyle = T.mu;
      ctx.font = "11px sans-serif";
      ctx.fillText("a_i  （φ=Σ a_i K(·,x_i)）", P.R.x + 12, P.R.y + 32);
      ctx.fillStyle = T.tx;
      ctx.fillText(lamOn ? "λ>0 场被核平滑" : "λ≈0 过拟合乱颤", P.R.x + 12, P.R.y + 50);
    }
  }

  /* ============================================================
   * 2. 预条件泛函梯度流 PFG
   * ż = -P(z) ∇(δF/δQ)
   * ============================================================ */
  function pfgSpawn(rng, n) {
    var a = [], i;
    for (i = 0; i < n; i++) a.push({ x: nrm(rng) * 0.18, y: nrm(rng) * 0.62 });
    return a;
  }
  function pfgInit(S) {
    var rng = mulberry(11);
    S.sim = {
      svgd: pfgSpawn(rng, 22),
      pfg: pfgSpawn(mulberry(12), 22),
      tgt: (function () {
        var r = mulberry(3), o = [], k;
        for (k = 0; k < 40; k++) {
          var x = nrm(r) * 0.85;
          o.push({ x: x, y: x * x + 0.32 * nrm(r) });
        }
        return o;
      })(),
      histS: [], histP: [],
    };
  }
  function pfgStep(pts, h, dt, precond) {
    var n = pts.length, i, ph = [], C, inv, fx, fy;
    for (i = 0; i < n; i++) ph[i] = svgdPhi(pts, i, h, bananaScore, null);
    if (precond) {
      C = cov2(pts);
      var det = C.cxx * C.cyy - C.cxy * C.cxy + 1e-8;
      inv = { a: C.cyy / det, b: -C.cxy / det, c: C.cxx / det }; /* P ≈ Σ */
      /* 用协方差拉伸：P φ 而不是 Σ^{-1} φ，让长轴走得更快 */
      for (i = 0; i < n; i++) {
        fx = C.cxx * ph[i].x + C.cxy * ph[i].y;
        fy = C.cxy * ph[i].x + C.cyy * ph[i].y;
        pts[i].x = clamp(pts[i].x + dt * 0.55 * fx, -2.2, 2.2);
        pts[i].y = clamp(pts[i].y + dt * 0.55 * fy, -0.6, 2.4);
        pts[i].fx = fx; pts[i].fy = fy;
      }
    } else {
      for (i = 0; i < n; i++) {
        pts[i].x = clamp(pts[i].x + dt * 0.85 * ph[i].x, -2.2, 2.2);
        pts[i].y = clamp(pts[i].y + dt * 0.85 * ph[i].y, -0.6, 2.4);
        pts[i].fx = ph[i].x; pts[i].fy = ph[i].y;
      }
    }
  }
  function pfgTick(S, dt) {
    var sim = S.sim, h = sl(S, "v", 0.7), ph = S.phase;
    if (onPhase(sim, S) && (ph === 1 || ph === 2)) {
      var rng = mulberry(11);
      if (ph === 1) sim.svgd = pfgSpawn(rng, 22);
      if (ph === 2) sim.pfg = pfgSpawn(mulberry(12), 22);
    }
    if (ph === 1) pfgStep(sim.svgd, h, dt * 1.1, false);
    if (ph === 2) pfgStep(sim.pfg, h, dt * 1.1, true);
    if (ph === 3) {
      pfgStep(sim.svgd, h, dt * 0.85, false);
      pfgStep(sim.pfg, h, dt * 0.85, true);
    }
    var ks = klProxy(sim.svgd, bananaLogp, h, null);
    var kp = klProxy(sim.pfg, bananaLogp, h, null);
    push(sim.histS, ks, 60);
    push(sim.histP, kp, 60);
    var C = cov2(sim.pfg);
    var cond = (C.cxx + C.cyy + Math.sqrt(Math.max(0, (C.cxx - C.cyy) * (C.cxx - C.cyy) + 4 * C.cxy * C.cxy))) /
      (C.cxx + C.cyy - Math.sqrt(Math.max(0, (C.cxx - C.cyy) * (C.cxx - C.cyy) + 4 * C.cxy * C.cxy)) + 1e-6);
    setm(S, { "KL_SVGD": ks, "KL_PFG": kp, "预条件条件数": cond, "核带宽": h });
  }
  function pfgDraw(ctx, S, T) {
    var sim = S.sim, h = sl(S, "v", 0.7), ph = S.phase, P = splitLR(S, ph === 3 ? 0.68 : 0.7);
    pill(ctx, S, T);
    panel(ctx, P.L, T, "病态香蕉后验  p(z)", true);
    panel(ctx, P.R, T, ph === 3 ? "KL 代理↓" : "说明", ph === 3);
    var M = map2(P.L, -2.0, 2.0, -0.5, 2.3);
    bananaPath(ctx, M, T, 0.14);
    sim.tgt.forEach(function (p) {
      ctx.fillStyle = rgba(T.c6, 0.35);
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), 2.2, 0, TWO); ctx.fill();
    });
    ctx.save();
    clipBox(ctx, P.L);
    var showPts = ph === 2 ? sim.pfg : sim.svgd;
    showPts.forEach(function (p, i) {
      if (i % 3) return;
      ctx.strokeStyle = rgba(T.c4, 0.45);
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), 8 + 18 * h, 0, TWO); ctx.stroke();
    });
    function dots(arr, col, r) {
      arr.forEach(function (p) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), r, 0, TWO); ctx.fill();
      });
    }
    if (ph === 0) {
      dots(sim.svgd, T.c2, 4);
    }
    if (ph === 1 || ph === 3) {
      dots(sim.svgd, T.c2, 4);
      sim.svgd.forEach(function (p) {
        if (p.fx) arrow(ctx, M.X(p.x), M.Y(p.y), p.fx * 10, -p.fy * 10, rgba(T.c2, 0.7), 1.1);
      });
    }
    if (ph === 2 || ph === 3) {
      dots(sim.pfg, T.c3, 4.4);
      var C = cov2(sim.pfg);
      ellipseAt(ctx, M.X(C.mx), M.Y(C.my), C.cxx, C.cxy, C.cyy, 48, T.c5);
      sim.pfg.forEach(function (p) {
        if (p.fx) arrow(ctx, M.X(p.x), M.Y(p.y), p.fx * 8, -p.fy * 8, rgba(T.c3, 0.8), 1.1);
      });
    }
    ctx.restore();
    legend(ctx, [
      { c: T.c6, l: "目标香蕉" },
      { c: T.c2, l: "SVGD / RKHS" },
      { c: T.c3, l: "PFG 预条件" },
    ], P.L.x + 10, P.L.y + 26, T);
    meter(ctx, P.R.x + 12, P.R.y + P.R.h - 36, (h - 0.25) / 1.65, T, "核带宽 h=" + h.toFixed(2), T.c4);
    if (ph === 0) {
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("目标：沿抛物线 y=x² 的香蕉", P.R.x + 12, P.R.y + 48);
      ctx.fillStyle = T.mu;
      ctx.fillText("短轴极薄、长轴弯曲", P.R.x + 12, P.R.y + 70);
      ctx.fillText("各向同性核会在短轴过挤", P.R.x + 12, P.R.y + 90);
    }
    if (ph === 1) {
      ctx.fillStyle = T.c6;
      ctx.font = "12px sans-serif";
      ctx.fillText("短轴被挤、长轴爬行慢", P.R.x + 12, P.R.y + 50);
      ctx.fillStyle = T.mu;
      ctx.fillText("各向同性核场", P.R.x + 12, P.R.y + 72);
    }
    if (ph === 2) {
      ctx.fillStyle = T.c3;
      ctx.font = "12px sans-serif";
      ctx.fillText("P≈Cov 拉伸长轴", P.R.x + 12, P.R.y + 50);
      ctx.fillStyle = T.mu;
      ctx.fillText("椭圆=经验协方差", P.R.x + 12, P.R.y + 72);
      ctx.fillText("带宽 h=" + h.toFixed(2), P.R.x + 12, P.R.y + 94);
    }
    if (ph === 3) {
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 36, w: P.R.w - 12, h: 70 }, sim.histS, T, T.c2, null, null);
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 36, w: P.R.w - 12, h: 70 }, sim.histP, T, T.c3, null, null);
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText("蓝 SVGD  青绿 PFG", P.R.x + 12, P.R.y + 118);
    }
  }

  /* ============================================================
   * 3. 哈密顿流  q̇=∂H/∂p, ṗ=-∂H/∂q
   * ============================================================ */
  function Vdw(q) { var u = q * q - 1; return 0.25 * u * u; }
  function dVdw(q) { return q * (q * q - 1); }
  function hamInit(S) {
    S.sim = {
      q: -1.05, p: 0,
      qgd: -1.05,
      tr: [], trg: [],
      ens: (function () {
        var r = mulberry(5), a = [], i;
        for (i = 0; i < 14; i++) a.push({ q: -1.1 + 0.08 * nrm(r), p: 0.15 * nrm(r) });
        return a;
      })(),
      crossed: 0,
      Hhist: [],
    };
  }
  function hamTick(S, dt) {
    var sim = S.sim, damp = sl(S, "damp", 0.995), ph = S.phase, i, k;
    onPhase(sim, S);
    if (sim._enter) {
      if (ph === 0) { sim.qgd = 0.72; sim.trg = []; }
      if (ph === 1) { sim.q = 1.05; sim.p = 0.62; sim.tr = []; }
      if (ph === 2) { sim.q = -1.05; sim.p = 0.78; sim.tr = []; sim.crossed = 0; }
      if (ph === 3) {
        var r = mulberry(5);
        sim.ens = [];
        for (i = 0; i < 14; i++) sim.ens.push({ q: -1.1 + 0.1 * nrm(r), p: 0.2 * nrm(r) });
      }
    }
    var h = dt * 5.2;
    if (ph === 0) {
      /* 过阻尼：遇窄谷（这里用双阱左壁）只能滑向最近极小 */
      sim.qgd -= dVdw(sim.qgd) * h * 0.55;
      push(sim.trg, sim.qgd, 120);
    }
    if (ph === 1 || ph === 2) {
      /* 辛欧拉 */
      var fric = ph === 1 ? damp : Math.pow(damp, 0.3);
      if (ph === 2 && sim._enter) sim.p = 1.15; /* 给冲垒的初动量 */
      sim.p += -dVdw(sim.q) * h;
      sim.q += sim.p * h;
      sim.p *= fric;
      push(sim.tr, { q: sim.q, p: sim.p }, 180);
      if (sim.q > 0.2) sim.crossed = 1;
    }
    if (ph === 3) {
      for (k = 0; k < sim.ens.length; k++) {
        var e = sim.ens[k];
        e.p += -dVdw(e.q) * h;
        e.q += e.p * h;
        e.p *= damp;
      }
    }
    var H = 0.5 * sim.p * sim.p + Vdw(sim.q);
    push(sim.Hhist, H, 80);
    setm(S, { "H": H, "q": sim.q, "p": sim.p, "阻尼": damp, "越垒": sim.crossed });
  }
  function hamDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, damp = sl(S, "damp", 0.995);
    pill(ctx, S, T);
    var P = splitLR(S, ph === 1 || ph === 3 ? 0.5 : 0.62);
    panel(ctx, P.L, T, "势能 V(q)=(q²−1)²/4", ph !== 1);
    panel(ctx, P.R, T, ph === 1 || ph === 3 ? "相空间 (q,p)" : "能量 / 注释", true);
    var xs = linspace(-2.1, 2.1, 80), ys = xs.map(Vdw);
    var ML = map2(P.L, -2.1, 2.1, -0.05, 1.15);
    fill1d(ctx, ML.X, ML.Y, xs, ys, rgba(T.c2, 0.12));
    stroke1d(ctx, ML.X, ML.Y, xs, ys, T.c2, 2);
    /* 垒 */
    ctx.strokeStyle = T.c6;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(ML.X(0), ML.Y(0));
    ctx.lineTo(ML.X(0), ML.Y(0.25));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = T.c6;
    ctx.font = "11px sans-serif";
    ctx.fillText("垒", ML.X(0) + 4, ML.Y(0.25) - 4);

    if (ph === 0) {
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(ML.X(sim.qgd), ML.Y(Vdw(sim.qgd)), 7, 0, TWO);
      ctx.fill();
      arrow(ctx, ML.X(sim.qgd), ML.Y(Vdw(sim.qgd)), -Math.sign(dVdw(sim.qgd) || 1) * 28, 8, T.c6, 1.6);
      ctx.fillStyle = T.tx;
      ctx.font = "12px sans-serif";
      ctx.fillText("只有位置：过阻尼梯度流", P.R.x + 12, P.R.y + 44);
      ctx.fillStyle = T.mu;
      ctx.fillText("无法越过势垒，困在最近井", P.R.x + 12, P.R.y + 66);
      spark(ctx, { x: P.R.x + 8, y: P.R.y + 90, w: P.R.w - 16, h: P.R.h - 110 }, sim.trg, T, T.c5, -2, 2);
    }
    if (ph === 1) {
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(ML.X(clamp(sim.q, -2.05, 2.05)), ML.Y(Vdw(clamp(sim.q, -2.05, 2.05))), 7, 0, TWO);
      ctx.fill();
      arrow(ctx, ML.X(clamp(sim.q, -2.05, 2.05)), ML.Y(Vdw(clamp(sim.q, -2.05, 2.05))), sim.p * 22, -18, T.c7, 1.6);
    }
    if (ph === 2) {
      var f2 = ease(frac(S)), qPath = -1.05 + 2.1 * f2, i2;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = rgba(T.c5, 0.75);
      ctx.beginPath();
      for (i2 = 0; i2 <= 24; i2++) {
        var qq = -1.05 + 2.1 * i2 / 24;
        if (i2) ctx.lineTo(ML.X(qq), ML.Y(Vdw(qq))); else ctx.moveTo(ML.X(qq), ML.Y(Vdw(qq)));
      }
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(ML.X(qPath), ML.Y(Vdw(qPath)), 7, 0, TWO);
      ctx.fill();
      arrow(ctx, ML.X(qPath), ML.Y(Vdw(qPath)), 26, 0, T.c7, 1.6);
    }
    if (ph === 3) {
      sim.ens.forEach(function (e) {
        ctx.fillStyle = rgba(T.c3, 0.8);
        ctx.beginPath();
        ctx.arc(ML.X(clamp(e.q, -2.05, 2.05)), ML.Y(Vdw(clamp(e.q, -2.05, 2.05))), 4, 0, TWO);
        ctx.fill();
      });
    }
    if (ph === 1 || ph === 3) {
      var MR = map2(P.R, -2.2, 2.2, -2.2, 2.2);
      ctx.strokeStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(MR.X(-2.2), MR.Y(0)); ctx.lineTo(MR.X(2.2), MR.Y(0));
      ctx.moveTo(MR.X(0), MR.Y(-2.2)); ctx.lineTo(MR.X(0), MR.Y(2.2));
      ctx.stroke();
      if (ph === 1) {
        var gq = sim.q, gp = sim.p, gi, gh = 0.07;
        ctx.strokeStyle = rgba(T.c7, 0.85);
        ctx.beginPath();
        ctx.moveTo(MR.X(gq), MR.Y(gp));
        for (gi = 0; gi < 90; gi++) {
          gp += -dVdw(gq) * gh;
          gq += gp * gh;
          gp *= damp;
          ctx.lineTo(MR.X(clamp(gq, -2.15, 2.15)), MR.Y(clamp(gp, -2.15, 2.15)));
        }
        ctx.stroke();
        ctx.fillStyle = T.c5;
        ctx.beginPath(); ctx.arc(MR.X(sim.q), MR.Y(sim.p), 5, 0, TWO); ctx.fill();
        meter(ctx, P.R.x + 10, P.R.y + P.R.h - 32, (damp - 0.92) / 0.08, T, "阻尼=" + damp.toFixed(3), T.c7);
      } else {
        sim.ens.forEach(function (e) {
          ctx.fillStyle = T.c3;
          ctx.beginPath(); ctx.arc(MR.X(e.q), MR.Y(e.p), 3.4, 0, TWO); ctx.fill();
          arrow(ctx, MR.X(e.q), MR.Y(e.p), e.p * 8, -dVdw(e.q) * 8, rgba(T.c7, 0.7), 1);
        });
        ctx.fillStyle = T.tx; ctx.font = "11px sans-serif";
        ctx.fillText("密度+动量 = 高阶流", P.R.x + 10, P.R.y + 32);
      }
    }
    if (ph === 2) {
      ctx.fillStyle = frac(S) > 0.55 ? T.c3 : T.c6;
      ctx.font = "13px sans-serif";
      ctx.fillText(frac(S) > 0.55 ? "冲过浅垒 → 右井" : "初动量正在爬垒", P.R.x + 12, P.R.y + 48);
      ctx.fillStyle = T.mu;
      ctx.fillText("H = p²/2 + V(q)  近守恒", P.R.x + 12, P.R.y + 70);
      spark(ctx, { x: P.R.x + 8, y: P.R.y + 90, w: P.R.w - 16, h: 80 }, sim.Hhist, T, T.c7, 0, null);
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText("哈密顿量 H(t)", P.R.x + 12, P.R.y + 88);
      meter(ctx, P.R.x + 12, P.R.y + P.R.h - 32, (damp - 0.92) / 0.08, T, "阻尼=" + damp.toFixed(3), T.c7);
    }
  }

  /* ============================================================
   * 4. 动量空间迭代  Heavy-ball
   * z←z+εv , v←μv − ε∇F
   * ============================================================ */
  function Fmom(x, y) { return 0.5 * (0.18 * x * x + 5.5 * y * y); }
  function gmom(x, y) { return { gx: 0.18 * x, gy: 5.5 * y }; }
  function momRoll(kind, mu, steps) {
    var z = { x: -1.7, y: 0.85, vx: 0, vy: 0 }, path = [], s, g, eps = 0.085, muHi;
    muHi = Math.max(mu, 0.93);
    for (s = 0; s < steps; s++) {
      g = gmom(z.x, z.y);
      if (kind === "gd") { z.x -= eps * g.gx; z.y -= eps * g.gy; }
      else {
        var m = kind === "hi" ? muHi : mu;
        z.vx = m * z.vx - eps * g.gx;
        z.vy = m * z.vy - eps * g.gy;
        z.x += z.vx; z.y += z.vy;
      }
      path.push({ x: z.x, y: z.y, F: Fmom(z.x, z.y) });
    }
    return path;
  }
  function momInit(S) {
    S.sim = {
      gd: { x: -1.7, y: 0.85 },
      hb: { x: -1.7, y: 0.85, vx: 0, vy: 0 },
      hi: { x: -1.7, y: 0.85, vx: 0, vy: 0 },
      pg: [], ph: [], pi: [],
      eg: [], eh: [], ei: [],
    };
  }
  function momTick(S, dt) {
    var sim = S.sim, mu = sl(S, "mu", 0.7), ph = S.phase, eps = 0.085;
    if (onPhase(sim, S)) {
      sim.gd = { x: -1.7, y: 0.85 };
      sim.hb = { x: -1.7, y: 0.85, vx: 0, vy: 0 };
      sim.hi = { x: -1.7, y: 0.85, vx: 0, vy: 0 };
      sim.pg = []; sim.ph = []; sim.pi = [];
      sim.eg = []; sim.eh = []; sim.ei = [];
    }
    var steps = Math.max(1, Math.round(3 * dt / 0.016));
    var s;
    for (s = 0; s < steps; s++) {
      if (ph === 0 || ph === 3) {
        var g = gmom(sim.gd.x, sim.gd.y);
        sim.gd.x -= eps * g.gx;
        sim.gd.y -= eps * g.gy;
      }
      if (ph === 1 || ph === 3) {
        var g2 = gmom(sim.hb.x, sim.hb.y);
        sim.hb.vx = mu * sim.hb.vx - eps * g2.gx;
        sim.hb.vy = mu * sim.hb.vy - eps * g2.gy;
        sim.hb.x += sim.hb.vx;
        sim.hb.y += sim.hb.vy;
      }
      if (ph === 2 || ph === 3) {
        var muHi = Math.max(mu, 0.93);
        var g3 = gmom(sim.hi.x, sim.hi.y);
        sim.hi.vx = muHi * sim.hi.vx - eps * g3.gx;
        sim.hi.vy = muHi * sim.hi.vy - eps * g3.gy;
        sim.hi.x += sim.hi.vx;
        sim.hi.y += sim.hi.vy;
      }
    }
    if (ph === 0 || ph === 3) { push(sim.pg, { x: sim.gd.x, y: sim.gd.y }, 90); push(sim.eg, Fmom(sim.gd.x, sim.gd.y), 90); }
    if (ph === 1 || ph === 3) { push(sim.ph, { x: sim.hb.x, y: sim.hb.y }, 90); push(sim.eh, Fmom(sim.hb.x, sim.hb.y), 90); }
    if (ph === 2 || ph === 3) { push(sim.pi, { x: sim.hi.x, y: sim.hi.y }, 90); push(sim.ei, Fmom(sim.hi.x, sim.hi.y), 90); }
    setm(S, {
      "μ": mu,
      "F_GD": Fmom(sim.gd.x, sim.gd.y),
      "F_HB": Fmom(sim.hb.x, sim.hb.y),
      "F_过大μ": Fmom(sim.hi.x, sim.hi.y),
    });
  }
  function momDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, mu = sl(S, "mu", 0.7);
    pill(ctx, S, T);
    var P = splitLR(S, ph === 3 ? 0.52 : 0.64);
    panel(ctx, P.L, T, "狭长二次谷  F=½(0.18x²+5.5y²)", true);
    panel(ctx, P.R, T, ph === 3 ? "F(k) 收敛对比" : "当前步", ph === 3);
    var M = map2(P.L, -2.1, 2.1, -1.2, 1.2);
    /* 等高椭圆 */
    var lv, k;
    for (k = 1; k <= 4; k++) {
      lv = 0.12 * k * k;
      ctx.strokeStyle = rgba(T.c2, 0.35);
      ctx.beginPath();
      ctx.ellipse(M.X(0), M.Y(0), (M.X(Math.sqrt(2 * lv / 0.18)) - M.X(0)), (M.Y(0) - M.Y(Math.sqrt(2 * lv / 5.5))), 0, 0, TWO);
      ctx.stroke();
    }
    function path(arr, col) {
      if (!arr || !arr.length) return;
      ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
      arr.forEach(function (p, i) {
        if (i) ctx.lineTo(M.X(clamp(p.x, -2.05, 2.05)), M.Y(clamp(p.y, -1.15, 1.15)));
        else ctx.moveTo(M.X(clamp(p.x, -2.05, 2.05)), M.Y(clamp(p.y, -1.15, 1.15)));
      });
      ctx.stroke();
      var p = arr[arr.length - 1];
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(M.X(clamp(p.x, -2.05, 2.05)), M.Y(clamp(p.y, -1.15, 1.15)), 5.5, 0, TWO); ctx.fill();
    }
    var rollG = momRoll("gd", mu, 70);
    var rollH = momRoll("hb", mu, 70);
    var rollI = momRoll("hi", mu, 70);
    if (ph === 0 || ph === 3) path(rollG, T.c6);
    if (ph === 1 || ph === 3) path(rollH, T.c3);
    if (ph === 2 || ph === 3) path(rollI, T.c7);
    legend(ctx, [
      { c: T.c6, l: "无动量 GD（锯齿/先坠 y）" },
      { c: T.c3, l: "Heavy-ball μ=" + mu.toFixed(2) },
      { c: T.c7, l: "μ过大 过冲振荡" },
    ], P.L.x + 10, P.L.y + 26, T);
    meter(ctx, P.L.x + 10, P.L.y + P.L.h - 28, mu / 0.95, T, "动量 μ=" + mu.toFixed(2), T.c3);
    if (ph !== 3) {
      ctx.fillStyle = T.tx; ctx.font = "12px sans-serif";
      var msg = ["无动量：先被陡轴甩下去", "有动量：冲过平坦长轴", "μ过大：在短轴来回振荡"][ph] || "";
      ctx.fillText(msg, P.R.x + 12, P.R.y + 48);
      ctx.fillStyle = T.mu;
      ctx.fillText("离散：v←μv−ε∇F, z←z+v", P.R.x + 12, P.R.y + 72);
      ctx.fillStyle = T.c5;
      ctx.fillText("滑块 μ 改变整条轨迹", P.R.x + 12, P.R.y + 96);
      spark(ctx, { x: P.R.x + 8, y: P.R.y + 120, w: P.R.w - 16, h: 70 }, (ph === 0 ? rollG : ph === 1 ? rollH : rollI).map(function (p) { return p.F; }), T, T.c5, 0, null);
    } else {
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 30, w: P.R.w - 12, h: P.R.h - 48 }, rollG.map(function (p) { return p.F; }), T, T.c6, 0, null);
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 30, w: P.R.w - 12, h: P.R.h - 48 }, rollH.map(function (p) { return p.F; }), T, T.c3, 0, null);
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 30, w: P.R.w - 12, h: P.R.h - 48 }, rollI.map(function (p) { return p.F; }), T, T.c7, 0, null);
    }
  }

  /* ============================================================
   * 5. GAD-PVI：加速位移 + 动态权重
   * ============================================================ */
  function gadInit(S) {
    var rng = mulberry(17), i, p = [], w = [];
    for (i = 0; i < 20; i++) {
      p.push({ x: nrm(rng) * 0.55, y: nrm(rng) * 0.45, vx: 0, vy: 0 });
      w.push(1 / 20);
    }
    S.sim = { p: p, w: w, hist: [], histEq: [] };
  }
  function logqW(pts, w, x, y, h) {
    var i, s = 0;
    for (i = 0; i < pts.length; i++) s += w[i] * rbf(x - pts[i].x, y - pts[i].y, h);
    return Math.log(s + 1e-12);
  }
  function gadTick(S, dt) {
    var sim = S.sim, rate = sl(S, "rate", 1), ph = S.phase, h = 0.55, n = sim.p.length, i;
    if (onPhase(sim, S) && ph === 0) {
      var rng = mulberry(17);
      for (i = 0; i < n; i++) {
        sim.p[i].x = nrm(rng) * 0.55;
        sim.p[i].y = nrm(rng) * 0.45;
        sim.p[i].vx = 0; sim.p[i].vy = 0;
        sim.w[i] = 1 / n;
      }
    }
    var accPos = ph === 1 || ph === 3;
    var accW = ph === 2 || ph === 3;
    if (accPos) {
      for (i = 0; i < n; i++) {
        var phv = svgdPhi(sim.p, i, h, mixScore, sim.w);
        sim.p[i].vx = 0.72 * sim.p[i].vx + 2.4 * rate * phv.x * dt;
        sim.p[i].vy = 0.72 * sim.p[i].vy + 2.4 * rate * phv.y * dt;
        sim.p[i].x = clamp(sim.p[i].x + sim.p[i].vx, -2.4, 2.4);
        sim.p[i].y = clamp(sim.p[i].y + sim.p[i].vy, -1.5, 1.5);
      }
    }
    if (accW) {
      var z = 0;
      for (i = 0; i < n; i++) {
        var lp = mixLogp(sim.p[i].x, sim.p[i].y);
        var lq = logqW(sim.p, sim.w, sim.p[i].x, sim.p[i].y, h);
        sim.w[i] *= Math.exp(dt * 1.7 * rate * (lp - lq));
        z += sim.w[i];
      }
      for (i = 0; i < n; i++) sim.w[i] /= (z || 1);
    }
    var kl = 0;
    for (i = 0; i < n; i++) kl += sim.w[i] * (logqW(sim.p, sim.w, sim.p[i].x, sim.p[i].y, h) - mixLogp(sim.p[i].x, sim.p[i].y));
    push(sim.hist, kl, 70);
    setm(S, { "KL": kl, "ESS": ess(sim.w), "调权速度": rate, "max w": Math.max.apply(null, sim.w) });
  }
  function gadDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, P = splitLR(S, 0.66);
    pill(ctx, S, T);
    panel(ctx, P.L, T, "双峰目标 + 粒子", true);
    panel(ctx, P.R, T, ph === 3 ? "KL 下降" : "权重直方图", ph === 2 || ph === 3);
    var M = map2(P.L, -2.5, 2.5, -1.6, 1.6);
    twoBlobs(ctx, M, T);
    sim.p.forEach(function (p, i) {
      var r = 3.2 + 16 * Math.sqrt(sim.w[i]);
      ctx.fillStyle = rgba(ph === 2 || ph === 3 ? T.c5 : T.c2, 0.3 + 0.7 * Math.min(1, sim.w[i] * 12));
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), r, 0, TWO); ctx.fill();
      if ((ph === 1 || ph === 3) && (p.vx || p.vy)) {
        arrow(ctx, M.X(p.x), M.Y(p.y), p.vx * 18, -p.vy * 18, T.c3, 1.2);
      }
    });
    legend(ctx, [
      { c: T.c6, l: "目标模态" },
      { c: T.c2, l: "等权粒子" },
      { c: T.c5, l: "动态权重（越大越亮）" },
      { c: T.c3, l: "加速位移" },
    ], P.L.x + 10, P.L.y + 26, T);
    var rate = sl(S, "rate", 1);
    meter(ctx, P.L.x + 10, P.L.y + P.L.h - 28, (rate - 0.3) / 1.9, T, "调权速度=" + rate.toFixed(2), T.c5);
    if (ph === 3) {
      spark(ctx, { x: P.R.x + 6, y: P.R.y + 28, w: P.R.w - 12, h: P.R.h - 44 }, sim.hist, T, T.c3, null, null);
    } else {
      sim.w.forEach(function (wi, i) {
        ctx.fillStyle = i % 2 ? T.c5 : T.c2;
        ctx.fillRect(P.R.x + 12 + i * 8, P.R.y + P.R.h - 16 - wi * 140, 6, wi * 140);
      });
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText(ph === 0 ? "等权：覆盖差" : ph === 1 ? "先加速靠拢模态" : "按 log(p/q) 调权", P.R.x + 12, P.R.y + 34);
    }
  }

  /* ============================================================
   * 6. 加速信息梯度流 AIG — 多度量
   * μ̈ = −∇_metric F − γ μ̇
   * ============================================================ */
  var AIG_MET = ["W₂", "Stein", "FR", "KW"];
  function aigInit(S) {
    var rng = mulberry(19), i, p = [];
    for (i = 0; i < 18; i++) p.push({ x: -1.3 + nrm(rng) * 0.25, y: nrm(rng) * 0.2, vx: 0, vy: 0, w: 1 / 18 });
    S.sim = { p: p, hist: [], hist1: [], met: 0 };
  }
  function aigTick(S, dt) {
    var sim = S.sim, damp = sl(S, "damp", 0.995), ph = S.phase, h = 0.5, i, n = sim.p.length;
    onPhase(sim, S);
    if (sim._enter && ph === 0) {
      var rng = mulberry(19);
      for (i = 0; i < n; i++) {
        sim.p[i].x = -1.3 + nrm(rng) * 0.25;
        sim.p[i].y = nrm(rng) * 0.2;
        sim.p[i].vx = 0; sim.p[i].vy = 0; sim.p[i].w = 1 / n;
      }
    }
    var met = ph === 0 ? 0 : ph === 2 ? 1 : ph === 1 ? 0 : 3;
    sim.met = met;
    var gamma = (1 - damp) * 18 + 0.15;
    var accel = ph === 1 || ph === 3 || (ph === 2 && met !== 2);
    for (i = 0; i < n; i++) {
      var scp = mixScore(sim.p[i].x, sim.p[i].y);
      var scq = kdeScore(sim.p, sim.p[i].x, sim.p[i].y, h, sim.p.map(function (z) { return z.w; }));
      var fx, fy;
      if (met === 0 || met === 3) { /* W2 / KW：分数差，KW 再按协方差拉伸 */
        fx = scp.gx - scq.gx;
        fy = scp.gy - scq.gy;
        if (met === 3) {
          var C = cov2(sim.p);
          var tx = C.cxx * fx + C.cxy * fy, ty = C.cxy * fx + C.cyy * fy;
          fx = tx; fy = ty;
        }
      } else if (met === 1) {
        var pv = svgdPhi(sim.p, i, h, mixScore, sim.p.map(function (z) { return z.w; }));
        fx = pv.x; fy = pv.y;
      } else {
        fx = 0; fy = 0;
      }
      if (ph === 0) {
        sim.p[i].x += dt * 1.6 * fx;
        sim.p[i].y += dt * 1.6 * fy;
      } else if (accel) {
        sim.p[i].vx = (1 - gamma * dt) * sim.p[i].vx + dt * 3.2 * fx;
        sim.p[i].vy = (1 - gamma * dt) * sim.p[i].vy + dt * 3.2 * fy;
        sim.p[i].x += sim.p[i].vx * dt * 6;
        sim.p[i].y += sim.p[i].vy * dt * 6;
      }
      sim.p[i].x = clamp(sim.p[i].x, -2.5, 2.5);
      sim.p[i].y = clamp(sim.p[i].y, -1.6, 1.6);
    }
    if (met === 2 || ph === 2 && met === 2) {
      var z = 0;
      for (i = 0; i < n; i++) {
        var lp = mixLogp(sim.p[i].x, sim.p[i].y);
        var lq = logqW(sim.p, sim.p.map(function (z) { return z.w; }), sim.p[i].x, sim.p[i].y, h);
        sim.p[i].w *= Math.exp(dt * 2.2 * (lp - lq));
        z += sim.p[i].w;
      }
      for (i = 0; i < n; i++) sim.p[i].w /= z || 1;
    }
    var wts = sim.p.map(function (z) { return z.w; });
    var kl = klProxy(sim.p, mixLogp, h, wts);
    push(sim.hist, kl, 70);
    setm(S, { "KL": kl, "度量": AIG_MET[met], "阻尼γ": gamma, "‖v‖": hypot(sim.p[0].vx, sim.p[0].vy) });
  }
  function aigDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, P = splitLR(S, 0.64);
    pill(ctx, S, T);
    panel(ctx, P.L, T, "均值场粒子", true);
    panel(ctx, P.R, T, "信息度量", ph === 2);
    var M = map2(P.L, -2.5, 2.5, -1.6, 1.6);
    twoBlobs(ctx, M, T);
    sim.p.forEach(function (p) {
      ctx.fillStyle = rgba(T.c2, 0.35 + 0.65 * Math.min(1, p.w * 10));
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), 3.5 + 10 * Math.sqrt(p.w), 0, TWO); ctx.fill();
      if (ph === 1 || ph === 3) arrow(ctx, M.X(p.x), M.Y(p.y), p.vx * 14, -p.vy * 14, T.c7, 1.1);
    });
    if (ph === 2) {
      var i, j, n = sim.p.length;
      for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) {
        var dx = sim.p[i].x - sim.p[j].x, dy = sim.p[i].y - sim.p[j].y;
        if (dx * dx + dy * dy < 0.55) {
          ctx.strokeStyle = rgba(T.c4, 0.35);
          ctx.beginPath();
          ctx.moveTo(M.X(sim.p[i].x), M.Y(sim.p[i].y));
          ctx.lineTo(M.X(sim.p[j].x), M.Y(sim.p[j].y));
          ctx.stroke();
        }
      }
    }
    AIG_MET.forEach(function (name, i) {
      var on = sim.met === i;
      ctx.fillStyle = on ? T.c5 : (T.dark ? "#1c2740" : "#d8dee8");
      rr(ctx, P.R.x + 12, P.R.y + 36 + i * 36, P.R.w - 24, 28, 6);
      ctx.fill();
      ctx.fillStyle = on ? "#061018" : T.tx;
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(name, P.R.x + 24, P.R.y + 55 + i * 36);
    });
    var damp = sl(S, "damp", 0.995);
    meter(ctx, P.R.x + 12, P.R.y + P.R.h - 36, (damp - 0.92) / 0.08, T, "阻尼=" + damp.toFixed(3), T.c7);
    ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
    ctx.fillText(ph === 0 ? "一阶 W₂：平移" : ph === 1 ? "加速：带振荡更快" : ph === 2 ? "Stein 核交互" : "KW 预条件加速", P.R.x + 12, P.R.y + P.R.h - 52);
    if (ph === 3) spark(ctx, { x: P.R.x + 8, y: P.R.y + 188, w: P.R.w - 16, h: 48 }, sim.hist, T, T.c3, null, null);
  }

  /* ============================================================
   * 7. 概率分布加速流（Taghvaei PMP on P₂）
   * ============================================================ */
  function accfInit(S) {
    var rng = mulberry(23), i, src = [], tgt = [];
    for (i = 0; i < 24; i++) {
      src.push({ x: -1.25 + 0.18 * nrm(rng), y: 0.22 * nrm(rng), vx: 0, vy: 0 });
      tgt.push({ x: 1.2 + 0.18 * nrm(mulberry(40 + i)), y: 0.22 * nrm(mulberry(80 + i)) });
    }
    src.sort(function (a, b) { return a.x - b.x; });
    tgt.sort(function (a, b) { return a.x - b.x; });
    S.sim = { src: src, tgt: tgt, fo: src.map(function (p) { return { x: p.x, y: p.y }; }), hist: [], over: 0 };
  }
  function accfTick(S, dt) {
    var sim = S.sim, damp = sl(S, "damp", 0.995), ph = S.phase, i, n = sim.src.length;
    if (onPhase(sim, S) && (ph === 0 || ph === 1 || ph === 2)) {
      for (i = 0; i < n; i++) {
        sim.src[i].x = sim.fo[i].x; sim.src[i].y = sim.fo[i].y;
        sim.src[i].vx = 0; sim.src[i].vy = 0;
      }
    }
    var gamma = (1 - damp) * 14 + 0.2;
    for (i = 0; i < n; i++) {
      var tx = sim.tgt[i].x - sim.src[i].x, ty = sim.tgt[i].y - sim.src[i].y;
      if (ph === 1) {
        sim.src[i].x += dt * 0.85 * tx;
        sim.src[i].y += dt * 0.85 * ty;
      } else if (ph === 2 || ph === 3) {
        sim.src[i].vx = (1 - gamma * dt) * sim.src[i].vx + dt * 2.4 * tx;
        sim.src[i].vy = (1 - gamma * dt) * sim.src[i].vy + dt * 2.4 * ty;
        sim.src[i].x += sim.src[i].vx * dt;
        sim.src[i].y += sim.src[i].vy * dt;
      }
      sim.src[i].x = clamp(sim.src[i].x, -2.15, 2.15);
      sim.src[i].y = clamp(sim.src[i].y, -1.25, 1.25);
    }
    var mx = 0, mp = 0, w2 = 0;
    for (i = 0; i < n; i++) {
      mx += sim.src[i].x; mp += sim.src[i].vx;
      w2 += hypot(sim.src[i].x - sim.tgt[i].x, sim.src[i].y - sim.tgt[i].y) ** 2;
    }
    mx /= n; mp /= n;
    sim.mean = mx; sim.mp = mp;
    sim.over = mx > 1.25 ? 1 : sim.over;
    push(sim.hist, w2 / n, 70);
    setm(S, { "W2²": w2 / n, "均值": mx, "动量": mp, "过冲": sim.over, "阻尼": damp });
  }
  function accfDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, P = splitLR(S, ph === 3 ? 0.55 : 0.68);
    pill(ctx, S, T);
    panel(ctx, P.L, T, "两坨分布要对齐", true);
    panel(ctx, P.R, T, ph === 3 ? "相空间 (ρ均值, 动量)" : "PMP 注释", ph === 3);
    var M = map2(P.L, -2.3, 2.3, -1.4, 1.4);
    ctx.save();
    clipBox(ctx, P.L);
    sim.tgt.forEach(function (p) {
      ctx.fillStyle = rgba(T.c6, 0.55);
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), 4.2, 0, TWO); ctx.fill();
    });
    sim.src.forEach(function (p, i) {
      ctx.strokeStyle = rgba(T.c5, ph === 0 ? 0.15 : 0.35);
      ctx.beginPath(); ctx.moveTo(M.X(p.x), M.Y(p.y)); ctx.lineTo(M.X(sim.tgt[i].x), M.Y(sim.tgt[i].y)); ctx.stroke();
      ctx.fillStyle = T.c2;
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), 4.5, 0, TWO); ctx.fill();
      if (ph >= 2) arrow(ctx, M.X(p.x), M.Y(p.y), clamp(p.vx * 6, -28, 28), clamp(-p.vy * 6, -28, 28), T.c7, 1);
    });
    ctx.restore();
    legend(ctx, [{ c: T.c2, l: "当前 ρ" }, { c: T.c6, l: "目标" }, { c: T.c7, l: "动量场" }], P.L.x + 10, P.L.y + 26, T);
    meter(ctx, P.L.x + 10, P.L.y + P.L.h - 28, (sl(S, "damp", 0.995) - 0.92) / 0.08, T, "阻尼=" + sl(S, "damp", 0.995).toFixed(3), T.c7);
    if (ph === 3) {
      var MR = map2(P.R, -2, 2.4, -1.8, 1.8);
      ctx.strokeStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(MR.X(-2), MR.Y(0)); ctx.lineTo(MR.X(2.4), MR.Y(0));
      ctx.moveTo(MR.X(0), MR.Y(-1.8)); ctx.lineTo(MR.X(0), MR.Y(1.8));
      ctx.stroke();
      ctx.fillStyle = T.c5;
      ctx.beginPath(); ctx.arc(MR.X(sim.mean || 0), MR.Y(sim.mp || 0), 6, 0, TWO); ctx.fill();
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText("ρ̇=∇·(ρ∇δpH)  ṗ=−∇δρH", P.R.x + 10, P.R.y + 32);
    } else {
      ctx.fillStyle = T.tx; ctx.font = "12px sans-serif";
      ctx.fillText(["初始两坨分离", "一阶 W₂：沿匹配缓推", "加速流：过冲再贴合"][ph] || "", P.R.x + 12, P.R.y + 48);
      ctx.fillStyle = T.mu;
      ctx.fillText("由 PMP 导出 Hamilton 方程", P.R.x + 12, P.R.y + 72);
      spark(ctx, { x: P.R.x + 8, y: P.R.y + 100, w: P.R.w - 16, h: 80 }, sim.hist, T, T.c3, 0, null);
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText("W₂²(t)", P.R.x + 12, P.R.y + 96);
    }
  }

  /* ============================================================
   * 8. 沃瑟斯坦空间传输
   * ============================================================ */
  function w2Init(S) {
    var i, src = [], tgt = [];
    for (i = 0; i < 16; i++) {
      src.push(-0.35 + (i % 8) * 0.1);
      tgt.push(0.05 + (i % 8) * 0.1);
    }
    S.sim = { src: src, tgt: tgt, hist: [] };
  }
  function w2Tick(S) {
    var sep = sl(S, "sep", 1), n = 16, i, w2 = 0;
    var src = [], tgt = [];
    for (i = 0; i < n; i++) {
      src[i] = -sep * 1.05 + (i / (n - 1) - 0.5) * 0.5;
      tgt[i] = sep * 1.05 + (i / (n - 1) - 0.5) * 0.5;
      w2 += (src[i] - tgt[i]) * (src[i] - tgt[i]);
    }
    S.sim.src = src; S.sim.tgt = tgt;
    push(S.sim.hist, w2 / n, 60);
    setm(S, { "总质量": 1, "W2²": w2 / n, "搬迁距离": sep, "质量守恒": 1 });
  }
  function w2Draw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, sep = sl(S, "sep", 1), f = ease(frac(S));
    pill(ctx, S, T);
    var box = area(S);
    panel(ctx, box, T, "一维推土：左山 → 右坑", true);
    var M = map2(box, -2.4, 2.4, -0.15, 1.25);
    /* 地面 */
    ctx.strokeStyle = T.line; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(M.X(-2.4), M.Y(0)); ctx.lineTo(M.X(2.4), M.Y(0)); ctx.stroke();
    var xs = linspace(-2.4, 2.4, 80);
    var ysL = xs.map(function (x) { return 0.9 * gauss(x, -sep * 1.05, 0.28); });
    var ysR = xs.map(function (x) { return 0.9 * gauss(x, sep * 1.05, 0.28); });
    if (ph === 0) {
      fill1d(ctx, M.X, M.Y, xs, ysL, rgba(T.c2, 0.55));
      stroke1d(ctx, M.X, M.Y, xs, ysR, T.c6, 1.5);
      ctx.setLineDash([5, 4]);
      stroke1d(ctx, M.X, M.Y, xs, ysR, T.c6, 1.5);
      ctx.setLineDash([]);
      ctx.fillStyle = T.c6; ctx.font = "12px sans-serif";
      ctx.fillText("右坑（目标）", M.X(sep * 1.05) - 20, M.Y(0.95));
      ctx.fillStyle = T.c2;
      ctx.fillText("左山土", M.X(-sep * 1.05) - 16, M.Y(0.95));
    }
    if (ph === 1 || ph === 2) {
      /* 粒子沿地面运输，质量守恒 */
      var t = ph === 1 ? f : 1;
      sim.src.forEach(function (s, i) {
        var x = lerp(s, sim.tgt[i], t);
        var y = 0.05 + (i % 4) * 0.08;
        ctx.fillStyle = T.c5;
        rr(ctx, M.X(x) - 6, M.Y(y) - 6, 12, 10, 2);
        ctx.fill();
        if (ph === 1) {
          /* 小车 */
          ctx.fillStyle = T.c3;
          ctx.fillRect(M.X(x) - 8, M.Y(0) - 4, 16, 6);
        }
      });
      fill1d(ctx, M.X, M.Y, xs, ysL.map(function (v) { return v * (1 - t); }), rgba(T.c2, 0.35));
      fill1d(ctx, M.X, M.Y, xs, ysR.map(function (v) { return v * t; }), rgba(T.c6, 0.35));
      ctx.fillStyle = T.tx; ctx.font = "bold 16px sans-serif";
      ctx.fillText("∫Q = 1  质量守恒", M.X(-0.5), M.Y(1.12));
    }
    if (ph === 3) {
      /* 对照：传送闪现（不沿地面） */
      var a = 0.5 + 0.5 * Math.sin(S.t * 4);
      fill1d(ctx, M.X, M.Y, xs, ysL.map(function (v) { return v * (1 - a); }), rgba(T.c2, 0.4));
      fill1d(ctx, M.X, M.Y, xs, ysR.map(function (v) { return v * a; }), rgba(T.c4, 0.45));
      ctx.strokeStyle = T.c4;
      ctx.setLineDash([2, 6]);
      ctx.beginPath();
      ctx.moveTo(M.X(-sep), M.Y(0.5));
      ctx.lineTo(M.X(sep), M.Y(0.5));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c4; ctx.font = "13px sans-serif";
      ctx.fillText("对照下一算子：传送（不沿地面搬）", M.X(-1.6), M.Y(1.12));
    }
    ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
    ctx.fillText("v=∇ψ  连续性方程  ∂τQ=−∇·(Q v)", box.x + 220, box.y + box.h - 8);
    meter(ctx, box.x + 14, box.y + box.h - 32, (sep - 0.25) / 1.55, T, "搬迁距离=" + sep.toFixed(2), T.c5);
  }

  /* ============================================================
   * 9. Fisher–Rao 流形演化（出生–死亡）
   * ∂t q = q ( E[log(q/p)] − log(q/p) )
   * ============================================================ */
  function frInit(S) {
    var n = 48, q = [], i, x;
    for (i = 0; i < n; i++) {
      x = -2.4 + 4.8 * i / (n - 1);
      q[i] = 0.75 * gauss(x, -1.15, 0.32) + 0.25 * gauss(x, 1.15, 0.32);
    }
    var z = q.reduce(function (s, v) { return s + v; }, 0);
    for (i = 0; i < n; i++) q[i] /= z;
    S.sim = { q: q, n: n, walk: [], hist: [] };
    for (i = 0; i < 18; i++) S.sim.walk.push({ x: -1.15 + 0.2 * Math.sin(i) });
  }
  function frTick(S, dt) {
    var sim = S.sim, rate = sl(S, "rate", 1), ph = S.phase, n = sim.n, i, x, p, q, lr, mean = 0;
    var tgtRight = ph === 3;
    /* 目标 p */
    var P = [];
    for (i = 0; i < n; i++) {
      x = -2.4 + 4.8 * i / (n - 1);
      P[i] = tgtRight ? gauss(x, 1.15, 0.32) : 0.5 * gauss(x, -1.15, 0.32) + 0.5 * gauss(x, 1.15, 0.32);
    }
    var zp = P.reduce(function (s, v) { return s + v; }, 0);
    for (i = 0; i < n; i++) P[i] /= zp;
    sim.P = P;
    if (onPhase(sim, S) && ph <= 1) {
      for (i = 0; i < n; i++) {
        x = -2.4 + 4.8 * i / (n - 1);
        sim.q[i] = 0.8 * gauss(x, -1.15, 0.3) + 0.2 * gauss(x, 1.15, 0.3);
      }
      var z0 = sim.q.reduce(function (s, v) { return s + v; }, 0);
      for (i = 0; i < n; i++) sim.q[i] /= z0;
      sim.walk.forEach(function (w, k) { w.x = -1.15 + 0.18 * Math.sin(k); });
    }
    if (ph === 1) {
      sim.walk.forEach(function (w) { w.x += dt * 0.55 * rate * (1.15 - w.x); });
    }
    if (ph === 2 || ph === 3) {
      for (i = 0; i < n; i++) {
        q = sim.q[i] + 1e-12;
        p = P[i] + 1e-12;
        lr = Math.log(q) - Math.log(p);
        mean += q * lr;
      }
      for (i = 0; i < n; i++) {
        q = sim.q[i] + 1e-12;
        p = P[i] + 1e-12;
        lr = Math.log(q) - Math.log(p);
        sim.q[i] += dt * 2.4 * rate * q * (mean - lr);
        if (sim.q[i] < 0) sim.q[i] = 0;
      }
      var z = sim.q.reduce(function (s, v) { return s + v; }, 0) || 1;
      for (i = 0; i < n; i++) sim.q[i] /= z;
    }
    var mL = 0, mR = 0;
    for (i = 0; i < n; i++) {
      x = -2.4 + 4.8 * i / (n - 1);
      if (x < 0) mL += sim.q[i]; else mR += sim.q[i];
    }
    push(sim.hist, mR, 60);
    setm(S, { "左质量": mL, "右质量": mR, "传送速率": rate, "质量和": mL + mR });
  }
  function frDraw(ctx, S, T) {
    banner(ctx, S, T);
    var rate = sl(S, "rate", 1);
    var W = S.W, H = S.H;
    var cx = W * 0.46, cy = H * 0.58;
    var ph = S.phase;

    // Dual Tracks:
    // 上轨：Wasserstein W2 搬迁（质点水平位移，成本与距离平方成正比）
    ctx.fillStyle = T.mu; ctx.font = "bold 11px " + OP_FONT; ctx.textAlign = "left";
    ctx.fillText("【上轨】Wasserstein W2 物理搬运（远距离代价高昂 ∝ Dist²）", 50, cy - 65);

    var w2X = 120 + ((S.t * 60 * rate) % 220);
    ctx.strokeStyle = T.line; ctx.setLineDash([2, 2]);
    ctx.beginPath(); ctx.moveTo(120, cy - 40); ctx.lineTo(340, cy - 40); ctx.stroke();
    ctx.setLineDash([]);
    glow(ctx, w2X, cy - 40, 4 + 2 * rate, T.c2);

    // 下轨：Fisher-Rao 流形就地生灭/传送（本地消失 + 远端重组，成本与距离无关）
    ctx.fillStyle = T.mu;
    ctx.fillText("【下轨】Fisher-Rao 就地生灭（传送 Teleportation，代价与距离无关）", 50, cy + 20);

    var massSource = Math.max(0, 1 - ((S.t * 0.4 * rate) % 1));
    var massTarget = 1 - massSource;
    glow(ctx, 120, cy + 45, (8 * massSource + 1) * Math.min(2, rate), T.c6);
    glow(ctx, 340, cy + 45, (8 * massTarget + 1) * Math.min(2, rate), T.c3);

    // Dashboard
    var gx = W - 156, gy = 56;
    ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
    rr(ctx, gx - 5, gy - 5, 150, 62, 6); ctx.fill();
    ctx.strokeStyle = T.line; ctx.stroke();

    ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("W2-FR 双传输几何对比", gx, gy + 12);
    ctx.fillStyle = T.c2;
    ctx.fillText("W2 搬迁代价: 极高", gx, gy + 28);
    ctx.fillStyle = T.c3;
    ctx.fillText("FR 传送速率: " + rate.toFixed(2), gx, gy + 44);

    if (ph === 0) callout(ctx, 30, 68, "阶段 1：当两个多峰工况相距甚远时，纯 W2 物理搬运极慢", T, T.c2);
    if (ph === 1) callout(ctx, 30, 68, "阶段 2：Fisher-Rao 机制允许概率质量就地消解与远端重组", T, T.c6);
    if (ph === 2) callout(ctx, 30, 68, "阶段 3：W2-FR 融合几何实现最优测地线跳跃", T, T.c3);
    if (ph === 3) callout(ctx, 30, 68, "阶段 4：工业多工况突变软测量的理论保证", T, T.c4);
  }
  /* ============================================================
   * 10. 概率测度传送 — 不平衡 OT / Sinkhorn
   * ============================================================ */
  function sinkhornUB(a, b, C, eps, rho, iters) {
    var n = a.length, m = b.length, i, j, t;
    var K = [], u = [], v = [];
    for (i = 0; i < n; i++) {
      K[i] = [];
      for (j = 0; j < m; j++) K[i][j] = Math.exp(-C[i][j] / (eps + 1e-8));
      u[i] = 1;
    }
    for (j = 0; j < m; j++) v[j] = 1;
    var ex = eps / (eps + rho);
    for (t = 0; t < iters; t++) {
      for (i = 0; i < n; i++) {
        var Kv = 0;
        for (j = 0; j < m; j++) Kv += K[i][j] * v[j];
        u[i] = Math.pow(a[i] / (Kv + 1e-12), ex);
      }
      for (j = 0; j < m; j++) {
        var KTu = 0;
        for (i = 0; i < n; i++) KTu += K[i][j] * u[i];
        v[j] = Math.pow(b[j] / (KTu + 1e-12), ex);
      }
    }
    var pi = [], cost = 0, m1 = [], m2 = [];
    for (j = 0; j < m; j++) m2[j] = 0;
    for (i = 0; i < n; i++) {
      pi[i] = []; m1[i] = 0;
      for (j = 0; j < m; j++) {
        pi[i][j] = u[i] * K[i][j] * v[j];
        cost += pi[i][j] * C[i][j];
        m1[i] += pi[i][j];
        m2[j] += pi[i][j];
      }
    }
    function kl(x, y) {
      var s = 0, k;
      for (k = 0; k < x.length; k++) s += x[k] * Math.log((x[k] + 1e-12) / (y[k] + 1e-12)) - x[k] + y[k];
      return s;
    }
    return { pi: pi, cost: cost, m1: m1, m2: m2, kl1: kl(m1, a), kl2: kl(m2, b) };
  }
  function tpInit(S) {
    S.sim = { histB: [], histU: [] };
  }
  function tpTick(S) {
    var rate = sl(S, "rate", 1), n = 8, i, j;
    var xs = linspace(-1.2, -0.4, n), ys = linspace(0.4, 1.2, n);
    var a = [], b = [], C = [];
    for (i = 0; i < n; i++) {
      a[i] = gauss(xs[i], -0.8, 0.22); b[i] = gauss(ys[i], 0.8, 0.22);
    }
    var za = a.reduce(function (s, v) { return s + v; }, 0), zb = b.reduce(function (s, v) { return s + v; }, 0);
    for (i = 0; i < n; i++) { a[i] /= za; b[i] = (b[i] / zb) * (0.55 + 0.2 * rate / 2); } /* 目标质量更少：不均衡 */
    for (i = 0; i < n; i++) {
      C[i] = [];
      for (j = 0; j < n; j++) C[i][j] = (xs[i] - ys[j]) * (xs[i] - ys[j]);
    }
    var bal = sinkhornUB(a, b.map(function (v, k) { return a[k]; }), C, 0.05, 80, 22);
    var ub = sinkhornUB(a, b, C, 0.05, 0.28 / rate, 22);
    S.sim.a = a; S.sim.b = b; S.sim.xs = xs; S.sim.ys = ys;
    S.sim.bal = bal; S.sim.ub = ub;
    push(S.sim.histB, bal.cost, 50);
    push(S.sim.histU, ub.cost + 0.35 * (ub.kl1 + ub.kl2), 50);
    setm(S, {
      "传输功": bal.cost,
      "传送功": ub.cost + 0.35 * (ub.kl1 + ub.kl2),
      "质量亏损": 1 - b.reduce(function (s, v) { return s + v; }, 0),
      "KL边": ub.kl1 + ub.kl2,
    });
  }
  function tpDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, rate = sl(S, "rate", 1), f = ease(frac(S));
    pill(ctx, S, T);
    var P = splitLR(S, 0.58);
    panel(ctx, P.L, T, ph === 1 ? "传输：卡车沿地面" : ph === 2 ? "传送：就地生灭" : "左堆 / 右空地", true);
    panel(ctx, P.R, T, ph === 3 ? "功对比" : "耦合 π", ph === 3);
    var M = map2(P.L, -1.8, 1.8, -0.1, 1.1);
    ctx.strokeStyle = T.line; ctx.beginPath(); ctx.moveTo(M.X(-1.8), M.Y(0)); ctx.lineTo(M.X(1.8), M.Y(0)); ctx.stroke();
    var a = sim.a || [1], b = sim.b || [1], xs = sim.xs || [-1], ys = sim.ys || [1];
    a.forEach(function (ai, i) {
      var h = ai * 8;
      ctx.fillStyle = rgba(T.c2, ph === 2 ? (1 - f) * 0.9 : 0.9);
      ctx.fillRect(M.X(xs[i]) - 6, M.Y(h), 12, M.Y(0) - M.Y(h));
    });
    b.forEach(function (bi, i) {
      var h = bi * 8;
      var grow = ph === 2 ? f : ph === 0 ? 0.15 : 1;
      ctx.fillStyle = rgba(T.c6, 0.35 + 0.65 * grow);
      ctx.fillRect(M.X(ys[i]) - 6, M.Y(h * grow), 12, M.Y(0) - M.Y(h * grow));
    });
    if (ph === 1) {
      a.forEach(function (ai, i) {
        var x = lerp(xs[i], ys[i % ys.length], f);
        ctx.fillStyle = T.c5;
        ctx.fillRect(M.X(x) - 7, M.Y(0) - 8, 14, 8);
      });
    }
    if (ph === 2) {
      ctx.strokeStyle = T.c4;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(M.X(-0.8), M.Y(0.5)); ctx.lineTo(M.X(0.8), M.Y(0.5)); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c4; ctx.font = "12px sans-serif";
      ctx.fillText("传送 ↝  允许创造/消灭质量", M.X(-1.1), M.Y(0.95));
    }
    if (ph === 3 && sim.bal && sim.ub) {
      var cW = 0, ii;
      for (ii = 0; ii < sim.a.length; ii++) cW += sim.a[ii] * (sim.xs[ii] - sim.ys[ii]) * (sim.xs[ii] - sim.ys[ii]);
      var c1 = Math.max(cW, sim.bal.cost);
      var c2 = sim.ub.cost + (0.28 / rate) * (sim.ub.kl1 + sim.ub.kl2);
      var mx = Math.max(c1, c2, 1e-4);
      var h1 = Math.max(10, (c1 / mx) * 130), h2 = Math.max(10, (c2 / mx) * 130);
      ctx.fillStyle = T.c2; ctx.fillRect(P.R.x + 28, P.R.y + P.R.h - 28 - h1, 40, h1);
      ctx.fillStyle = T.c4; ctx.fillRect(P.R.x + 88, P.R.y + P.R.h - 28 - h2, 40, h2);
      ctx.fillStyle = T.tx; ctx.font = "11px sans-serif";
      ctx.fillText("传输 " + c1.toFixed(2), P.R.x + 22, P.R.y + P.R.h - 10);
      ctx.fillText("传送 " + c2.toFixed(2), P.R.x + 80, P.R.y + P.R.h - 10);
      ctx.fillStyle = T.mu;
      ctx.fillText("不平衡 OT：消灭多余质量，功可更小", P.R.x + 12, P.R.y + 36);
      ctx.fillText("ρ∝1/速率=" + (0.28 / rate).toFixed(2), P.R.x + 12, P.R.y + 54);
      meter(ctx, P.R.x + 12, P.R.y + 70, (rate - 0.3) / 1.9, T, "传送速率=" + rate.toFixed(2), T.c4);
    } else if (sim.ub) {
      var pi = sim.ub.pi, n = pi.length, cell = Math.min(12, (P.R.w - 24) / n);
      var x0 = P.R.x + 14, y0 = P.R.y + 36;
      var mxp = 0;
      pi.forEach(function (row) { row.forEach(function (v) { if (v > mxp) mxp = v; }); });
      pi.forEach(function (row, i) {
        row.forEach(function (v, j) {
          ctx.fillStyle = rgba(T.c5, 0.1 + 0.9 * v / (mxp || 1));
          ctx.fillRect(x0 + j * cell, y0 + i * cell, cell - 1, cell - 1);
        });
      });
      ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
      ctx.fillText("π  松弛边际", x0, y0 + n * cell + 14);
      meter(ctx, P.R.x + 12, P.R.y + P.R.h - 32, (rate - 0.3) / 1.9, T, "传送速率=" + rate.toFixed(2), T.c4);
    }
  }

  /* ============================================================
   * 11. DPVI 动态权重粒子 VI
   * ============================================================ */
  function dpviInit(S) {
    var rng = mulberry(29), i, p = [], w = [];
    for (i = 0; i < 22; i++) {
      p.push({ x: (i < 14 ? -1.05 : 1.1) + nrm(rng) * 0.22, y: nrm(rng) * 0.28 });
      w.push(1 / 22);
    }
    S.sim = { p: p, w: w, hist: [] };
  }
  function dpviTick(S, dt) {
    var sim = S.sim, rate = sl(S, "rate", 1), ph = S.phase, h = 0.48, n = sim.p.length, i;
    if (onPhase(sim, S) && ph === 0) {
      for (i = 0; i < n; i++) sim.w[i] = 1 / n;
    }
    if (ph >= 1) {
      var z = 0;
      for (i = 0; i < n; i++) {
        var lp = mixLogp(sim.p[i].x, sim.p[i].y);
        var lq = logqW(sim.p, sim.w, sim.p[i].x, sim.p[i].y, h);
        sim.w[i] *= Math.exp(dt * 1.8 * rate * (lp - lq));
        z += sim.w[i];
      }
      if (ph >= 2) for (i = 0; i < n; i++) sim.w[i] /= z || 1;
      else {
        /* 未归一化，展示「过密处变暗」前的原始乘子 */
      }
    }
    if (ph === 3) {
      for (i = 0; i < n; i++) {
        var pv = svgdPhi(sim.p, i, h, mixScore, sim.w);
        sim.p[i].x = clamp(sim.p[i].x + dt * 0.4 * pv.x, -2.4, 2.4);
        sim.p[i].y = clamp(sim.p[i].y + dt * 0.4 * pv.y, -1.5, 1.5);
      }
    }
    var kl = 0;
    for (i = 0; i < n; i++) {
      var ww = sim.w[i];
      kl += ww * (logqW(sim.p, sim.w, sim.p[i].x, sim.p[i].y, h) - mixLogp(sim.p[i].x, sim.p[i].y));
    }
    push(sim.hist, ess(sim.w), 70);
    var Hent = 0;
    var z2 = sim.w.reduce(function (s, v) { return s + v; }, 0) || 1;
    for (i = 0; i < n; i++) {
      var wi = sim.w[i] / z2;
      Hent -= wi * Math.log(wi + 1e-12);
    }
    setm(S, { "ESS": ess(sim.w.map(function (v) { var z = sim.w.reduce(function (s, x) { return s + x; }, 0) || 1; return v / z; })), "权重熵": Hent, "调权速度": rate, "Σw": sim.w.reduce(function (s, v) { return s + v; }, 0) });
  }
  function dpviDraw(ctx, S, T) {
    var sim = S.sim, ph = S.phase, P = splitLR(S, 0.62);
    pill(ctx, S, T);
    panel(ctx, P.L, T, "粒子（面积∝权重）", true);
    panel(ctx, P.R, T, ph === 3 ? "等效传送" : "权重条", true);
    var M = map2(P.L, -2.5, 2.5, -1.6, 1.6);
    twoBlobs(ctx, M, T);
    var z = sim.w.reduce(function (s, v) { return s + v; }, 0) || 1;
    sim.p.forEach(function (p, i) {
      var wi = sim.w[i] / (ph >= 2 ? z : Math.max(z, 1));
      var r = 3 + 15 * Math.sqrt(Math.max(0, wi));
      ctx.fillStyle = rgba(T.c2, 0.25 + 0.75 * Math.min(1, wi * 14));
      ctx.beginPath(); ctx.arc(M.X(p.x), M.Y(p.y), r, 0, TWO); ctx.fill();
    });
    if (ph === 3) {
      /* 从左峰暗点画虚线到右峰 */
      ctx.strokeStyle = rgba(T.c4, 0.55);
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(M.X(-1.15), M.Y(0));
      ctx.lineTo(M.X(1.18), M.Y(0));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c4; ctx.font = "12px sans-serif";
      ctx.fillText("质量传送：不必走路", M.X(-0.7), M.Y(0.9));
    }
    var wshow = sim.w.map(function (v) { return v / z; });
    wshow.forEach(function (wi, i) {
      ctx.fillStyle = wi > 1.2 / sim.w.length ? T.c5 : T.c2;
      ctx.fillRect(P.R.x + 10 + i * 8, P.R.y + P.R.h - 18 - wi * 150, 6, wi * 150);
    });
    ctx.fillStyle = T.mu; ctx.font = "11px sans-serif";
    ctx.fillText(ph === 0 ? "等权" : ph === 1 ? "乘 exp(ε(log p−log q))" : ph === 2 ? "再归一化 Σw=1" : "Stein 位移 + 调权", P.R.x + 10, P.R.y + 32);
    spark(ctx, { x: P.R.x + 6, y: P.R.y + 44, w: P.R.w - 12, h: 50 }, sim.hist, T, T.c3, 0, null);
    meter(ctx, P.R.x + 10, P.R.y + 100, (sl(S, "rate", 1) - 0.3) / 1.9, T, "调权速度=" + sl(S, "rate", 1).toFixed(2), T.c5);
  }

  /* ============================================================
   * 12. Stein 路径对齐（冷启动）
   * γ* = argmin KSD(Psrc ∘ γ^{-1}, Ptgt)
   * ============================================================ */
  function ksd2(pts, scoreFn, h) {
    var n = pts.length, i, j, s = 0, dx, dy, k, gx, gy, px, py, invh2, n2, div;
    invh2 = 1 / (h * h + 1e-8);
    for (i = 0; i < n; i++) {
      px = scoreFn(pts[i].x, pts[i].y);
      for (j = 0; j < n; j++) {
        py = scoreFn(pts[j].x, pts[j].y);
        dx = pts[i].x - pts[j].x; dy = pts[i].y - pts[j].y;
        n2 = dx * dx + dy * dy;
        k = Math.exp(-n2 * invh2 / 2);
        gx = -k * dx * invh2; gy = -k * dy * invh2; /* ∇_x k */
        div = k * (2 * invh2 - n2 * invh2 * invh2);
        s += k * (px.gx * py.gx + px.gy * py.gy) + px.gx * (k * dx * invh2) + px.gy * (k * dy * invh2) + py.gx * gx + py.gy * gy + div;
      }
    }
    return s / (n * n);
  }
  function steinInit(S) {
    var rs = mulberry(31), rt = mulberry(37), i, src = [], tgt = [];
    for (i = 0; i < 22; i++) src.push({ x: -1.35 + nrm(rs) * 0.28, y: nrm(rs) * 0.42, ylab: 0 });
    src.forEach(function (p) { p.ylab = 0.7 * p.x + 0.25 * p.y; });
    for (i = 0; i < 6; i++) tgt.push({ x: 1.15 + nrm(rt) * 0.18, y: 0.15 + nrm(rt) * 0.22, ylab: 0 });
    tgt.forEach(function (p) { p.ylab = 0.7 * p.x + 0.25 * p.y; });
    S.sim = { src: src, tgt: tgt, src0: src.map(function (p) { return { x: p.x, y: p.y }; }), hist: [] };
  }
  function tgtScore(sim, x, y, h) {
    return kdeScore(sim.tgt, x, y, h, null);
  }
  function steinTick(S, dt) {
    var sim = S.sim, h = sl(S, "v", 0.8), ph = S.phase, i, n = sim.src.length;
    if (onPhase(sim, S) && ph <= 1) {
      for (i = 0; i < n; i++) { sim.src[i].x = sim.src0[i].x; sim.src[i].y = sim.src0[i].y; }
    }
    if (ph === 2 || ph === 3) {
      var scFn = function (x, y) { return tgtScore(sim, x, y, h * 0.7); };
      for (i = 0; i < n; i++) {
        var pv = svgdPhi(sim.src, i, h * 0.7, scFn, null);
        sim.src[i].x = clamp(sim.src[i].x + dt * 1.6 * pv.x, -2.4, 2.4);
        sim.src[i].y = clamp(sim.src[i].y + dt * 1.6 * pv.y, -1.7, 1.7);
      }
    }
    var scFn2 = function (x, y) { return tgtScore(sim, x, y, h * 0.7); };
    var ksd = ksd2(sim.src, scFn2, h * 0.7);
    var mse = 0, mx = 0, my = 0;
    for (i = 0; i < sim.tgt.length; i++) { mx += sim.tgt[i].x; my += sim.tgt[i].y; }
    mx /= sim.tgt.length; my /= sim.tgt.length;
    var sx = 0, sy = 0;
    for (i = 0; i < n; i++) { sx += sim.src[i].x; sy += sim.src[i].y; }
    sx /= n; sy /= n;
    var align = hypot(sx - mx, sy - my);
    for (i = 0; i < n; i++) {
      var yhat = 0.7 * sim.src[i].x + 0.25 * sim.src[i].y;
      mse += (yhat - sim.src[i].ylab) * (yhat - sim.src[i].ylab);
    }
    /* 冷启动：用对齐后的源预测目标稀少点 */
    var pred = 0;
    for (i = 0; i < sim.tgt.length; i++) {
      var yh = 0.7 * (sim.tgt[i].x - mx + sx) + 0.25 * (sim.tgt[i].y - my + sy);
      pred += (yh - sim.tgt[i].ylab) * (yh - sim.tgt[i].ylab);
    }
    push(sim.hist, ksd, 60);
    setm(S, { "KSD": ksd, "对齐误差": align, "核带宽": h, "预测MSE": pred / sim.tgt.length });
  }
  function steinDraw(ctx, S, T) {
    banner(ctx, S, T);
    var h = sl(S, "v", 0.8);
    var W = S.W, H = S.H;
    var cx = W * 0.46, cy = H * 0.58;
    var sim = S.sim, ph = S.phase;

    // Draw Target Domain contour (pink)
    var boxSize = 80 + 35 * h;
    ctx.fillStyle = rgba(T.c6, T.dark ? 0.14 : 0.2);
    ctx.fillRect(cx + 40, cy - 60, boxSize, boxSize);
    ctx.strokeStyle = T.c6;
    ctx.lineWidth = 2;
    ctx.strokeRect(cx + 40, cy - 60, boxSize, boxSize);
    ctx.fillStyle = T.c6; ctx.font = "11px " + OP_FONT; ctx.textAlign = "center";
    ctx.fillText("目标域 (冷启动工况)", cx + 40 + boxSize / 2, cy - 68);

    // Draw Source Domain Particles migrating under Stein field
    var progress = Math.min(1.0, ((S.t * 0.25) % 1.2));
    ctx.lineWidth = 1;
    var arrowL = 10 + 10 * h;
    sim.src.forEach(function (p, i) {
      var curX = cx - 110 + progress * 170 + Math.sin(i * 3 + S.t) * 12;
      var curY = cy - 20 + Math.cos(i * 2 + S.t) * 25;

      // Draw Stein velocity vector arrow
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      ctx.moveTo(curX, curY);
      ctx.lineTo(curX + arrowL, curY - 4);
      ctx.stroke();

      glow(ctx, curX, curY, 3 + 2 * h, T.c2);
    });

    // Dashboard
    var gx = W - 156, gy = 56;
    ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
    rr(ctx, gx - 5, gy - 5, 150, 62, 6); ctx.fill();
    ctx.strokeStyle = T.line; ctx.stroke();

    ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
    ctx.fillText("Stein 路径域对齐场", gx, gy + 12);
    ctx.fillStyle = T.c2;
    ctx.fillText("源域粒子数: 22", gx, gy + 28);
    ctx.fillStyle = T.c5;
    ctx.fillText("核带宽 h = " + h.toFixed(2), gx, gy + 44);

    if (ph === 0) callout(ctx, 30, 68, "阶段 1：冷启动初期，源域（历史工况）与新工况严重漂移", T, T.c2);
    if (ph === 1) callout(ctx, 30, 68, "阶段 2：Stein 变分向量场通过再生核驱动分布迁移", T, T.c5);
    if (ph === 2) callout(ctx, 30, 68, "阶段 3：核斥力维持多模态，防止粒子塌缩成单点", T, T.c3);
    if (ph === 3) callout(ctx, 30, 68, "阶段 4：完成工业冷启动无缝校准", T, T.c4);
  }
  /* ---------- 注册 ---------- */
  function wrap(id, spec) {
    OP[id] = {
      init: function (S) {
        hook(S);
        S.sim = {};
        spec.init(S);
        S.sim._ph = S.phase;
        S.sim._sl = slSig(S);
      },
      tick: function (S, dt) {
        hook(S);
        spec.tick(S, dt || 0.016);
      },
      draw: function (ctx, S, T) {
        hook(S);
        var k, sig = slSig(S);
        if (S.sim._ph !== S.phase) {
          for (k = 0; k < 22; k++) spec.tick(S, 0.055);
        }
        if (S.sim._sl !== sig) {
          S.sim._sl = sig;
          for (k = 0; k < 12; k++) spec.tick(S, 0.05);
        }
        spec.draw(ctx, S, T);
      },
    };
  }

  wrap("rkhs_norm_regularization", { init: rkhsInit, tick: rkhsTick, draw: rkhsDraw });
  wrap("preconditioned_functional_gradient_flow", { init: pfgInit, tick: pfgTick, draw: pfgDraw });
  wrap("hamiltonian_flow", { init: hamInit, tick: hamTick, draw: hamDraw });
  wrap("momentum_space_iteration", { init: momInit, tick: momTick, draw: momDraw });
  wrap("accelerated_dynamic_weight_particle_vi", { init: gadInit, tick: gadTick, draw: gadDraw });
  wrap("accelerated_information_gradient_flow", { init: aigInit, tick: aigTick, draw: aigDraw });
  wrap("accelerated_flow_probability_distributions", { init: accfInit, tick: accfTick, draw: accfDraw });
  wrap("wasserstein_transport", { init: w2Init, tick: w2Tick, draw: w2Draw });
  wrap("fisher_rao_manifold_evolution", { init: frInit, tick: frTick, draw: frDraw });
  wrap("probability_teleportation", { init: tpInit, tick: tpTick, draw: tpDraw });
  wrap("dynamic_weight_particle_vi", { init: dpviInit, tick: dpviTick, draw: dpviDraw });
  wrap("stein_path_alignment", { init: steinInit, tick: steinTick, draw: steinDraw });
})(typeof window !== "undefined" ? window : this);
