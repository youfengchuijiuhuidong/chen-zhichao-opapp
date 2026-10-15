// chapter 6 custom animations
// 第6章：随机路径 / Girsanov / 有限时域最优控制 / OC-NDPLVM
(function (G) {
  "use strict";

  const OP = (G.OP_ANIMS = G.OP_ANIMS || {});
  const TWO = Math.PI * 2;
  const FS = G.OP_FONT_STACK || '"Noto Sans SC","Noto Sans CJK SC","WenQuanYi Micro Hei","Droid Sans Fallback","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
  const FONT = "12px " + FS;
  const FONTB = "bold 13px " + FS;
  const FONTSM = "11px " + FS;

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const sm = (t) => t * t * (3 - 2 * t);
  const hypot = Math.hypot;

  function sl(S, k, fb) {
    const v = S.sliders ? S.sliders[k] : undefined;
    return v == null ? fb : +v;
  }
  function PH(S) {
    const f = G.__CH6_FORCE;
    if (f && (f.id === S.opId || f.id === "*") && f.phase != null) return f.phase | 0;
    return S.phase | 0;
  }
  function FR(S) {
    const f = G.__CH6_FORCE;
    if (f && f.frac != null) return clamp(f.frac, 0, 1);
    return (S.t / 2.4) % 1;
  }
  function on(ph, i) {
    return ph === i ? 1 : 0;
  }
  function glow(ph, i) {
    return ph === i ? 1 : 0.28;
  }

  function col(c, a) {
    if (a == null || a >= 0.999) return c;
    if (!c || c[0] !== "#") return c;
    let h = c.slice(1);
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }

  function Rng(seed) {
    this.s = seed | 0;
    this.sp = null;
  }
  Rng.prototype.u = function () {
    this.s = (this.s + 0x6d2b79f5) | 0;
    let t = Math.imul(this.s ^ (this.s >>> 15), 1 | this.s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  Rng.prototype.n = function () {
    if (this.sp != null) {
      const v = this.sp;
      this.sp = null;
      return v;
    }
    let u = 0;
    while (!u) u = this.u();
    const v = this.u();
    const r = Math.sqrt(-2 * Math.log(u));
    const th = TWO * v;
    this.sp = r * Math.sin(th);
    return r * Math.cos(th);
  };

  function boxOf(S, pad) {
    pad = pad || {};
    const l = pad.l != null ? pad.l : 46;
    const r = pad.r != null ? pad.r : 14;
    const t = pad.t != null ? pad.t : 34;
    const b = pad.b != null ? pad.b : 42;
    return { x: l, y: t, w: Math.max(40, S.W - l - r), h: Math.max(40, S.H - t - b), l, r, t, b };
  }
  function mapXY(box, x0, x1, y0, y1) {
    const w = box.w, h = box.h;
    return {
      X: (x) => box.x + ((x - x0) / (x1 - x0 || 1)) * w,
      Y: (y) => box.y + h - ((y - y0) / (y1 - y0 || 1)) * h,
      x0, x1, y0, y1, box,
    };
  }
  function axes(ctx, box, T, xlab, ylab) {
    ctx.strokeStyle = T.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(box.x, box.y);
    ctx.lineTo(box.x, box.y + box.h);
    ctx.lineTo(box.x + box.w, box.y + box.h);
    ctx.stroke();
    ctx.fillStyle = T.mu;
    ctx.font = FONTSM;
    ctx.textAlign = "center";
    ctx.fillText(xlab || "", box.x + box.w * 0.5, box.y + box.h + 16);
    ctx.save();
    ctx.translate(box.x - 16, box.y + box.h * 0.5);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(ylab || "", 0, 0);
    ctx.restore();
    ctx.textAlign = "left";
  }
  function banner(ctx, S, T, ph) {
    const n = (S.steps && S.steps.length) || 1;
    const msg = (S.steps && S.steps[ph]) || "";
    ctx.font = FONTB;
    const tw = Math.min(S.W - 20, 28 + ctx.measureText(msg).width);
    ctx.fillStyle = col(T.c5, T.dark ? 0.16 : 0.22);
    ctx.fillRect(8, 6, tw, 22);
    ctx.fillStyle = T.c5;
    ctx.textAlign = "left";
    ctx.fillText(ph + 1 + "/" + n + "  " + msg, 14, 22);
  }
  function legend(ctx, items, x, y, T) {
    ctx.font = FONTSM;
    ctx.textAlign = "left";
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      ctx.fillStyle = it.c;
      ctx.fillRect(x, y + i * 15, 10, 10);
      ctx.fillStyle = T.tx;
      ctx.fillText(it.t, x + 14, y + i * 15 + 10);
    }
  }
  function arrow(ctx, x0, y0, x1, y1, color, lw) {
    const dx = x1 - x0, dy = y1 - y0, L = hypot(dx, dy);
    if (L < 1.5) return;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw || 1.6;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const a = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - 8 * Math.cos(a - 0.4), y1 - 8 * Math.sin(a - 0.4));
    ctx.lineTo(x1 - 8 * Math.cos(a + 0.4), y1 - 8 * Math.sin(a + 0.4));
    ctx.closePath();
    ctx.fill();
  }
  function strokeArr(ctx, map, ys, color, lw, a, xmax) {
    const n = ys.length;
    ctx.beginPath();
    ctx.strokeStyle = col(color, a == null ? 1 : a);
    ctx.lineWidth = lw || 1.5;
    for (let i = 0; i < n; i++) {
      const x = xmax != null ? (xmax * i) / (n - 1 || 1) : i;
      const px = map.X(x), py = map.Y(ys[i]);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  }
  function fillBand(ctx, map, lo, hi, color, a, xmax) {
    const n = lo.length;
    ctx.beginPath();
    ctx.fillStyle = col(color, a);
    for (let i = 0; i < n; i++) {
      const x = xmax != null ? (xmax * i) / (n - 1 || 1) : i;
      const px = map.X(x), py = map.Y(hi[i]);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    for (let i = n - 1; i >= 0; i--) {
      const x = xmax != null ? (xmax * i) / (n - 1 || 1) : i;
      ctx.lineTo(map.X(x), map.Y(lo[i]));
    }
    ctx.closePath();
    ctx.fill();
  }
  function meanStd(arr, idx) {
    const n = arr.length;
    if (!n) return { m: 0, s: 0 };
    let m = 0;
    for (let i = 0; i < n; i++) m += idx == null ? arr[i] : arr[i][idx];
    m /= n;
    let v = 0;
    for (let i = 0; i < n; i++) {
      const x = (idx == null ? arr[i] : arr[i][idx]) - m;
      v += x * x;
    }
    return { m, s: Math.sqrt(v / n) };
  }
  function hist(vals, lo, hi, bins) {
    const h = new Float64Array(bins);
    const w = (hi - lo) / bins || 1;
    for (let i = 0; i < vals.length; i++) {
      let b = Math.floor((vals[i] - lo) / w);
      if (b < 0) b = 0;
      if (b >= bins) b = bins - 1;
      h[b]++;
    }
    let s = 0;
    for (let i = 0; i < bins; i++) s += h[i];
    if (s) for (let i = 0; i < bins; i++) h[i] /= s;
    return h;
  }
  function klDisc(p, q) {
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const a = Math.max(p[i], 1e-9), b = Math.max(q[i], 1e-9);
      s += a * Math.log(a / b);
    }
    return s;
  }
  function klGauss1(m1, s1, m2, s2) {
    s1 = Math.max(s1, 1e-6);
    s2 = Math.max(s2, 1e-6);
    return Math.log(s2 / s1) + (s1 * s1 + (m1 - m2) * (m1 - m2)) / (2 * s2 * s2) - 0.5;
  }
  function inv2(a00, a01, a11) {
    const det = a00 * a11 - a01 * a01;
    const d = Math.abs(det) < 1e-10 ? 1e-10 : det;
    return [a11 / d, -a01 / d, a00 / d];
  }
  function covEllipse(ctx, cx, cy, s00, s01, s11, sc, stroke, fillC, fa, lw) {
    const tr = s00 + s11;
    const det = s00 * s11 - s01 * s01;
    const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
    const l1 = Math.max(1e-8, tr / 2 + disc);
    const l2 = Math.max(1e-8, tr / 2 - disc);
    const ang = Math.abs(s01) < 1e-12 ? (s00 >= s11 ? 0 : Math.PI / 2) : Math.atan2(l1 - s00, s01);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(0, 0, sc * Math.sqrt(l1), sc * Math.sqrt(l2), 0, 0, TWO);
    if (fa) {
      ctx.fillStyle = col(fillC || stroke, fa);
      ctx.fill();
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw || 2;
    ctx.stroke();
    ctx.restore();
  }
  function barh(ctx, x, y, w, h, v, vmax, color) {
    const hh = clamp(v / (vmax || 1), 0, 1) * h;
    ctx.fillStyle = color;
    ctx.fillRect(x, y + h - hh, w, hh);
  }
  function roundchip(ctx, x, y, w, h, fill, stroke) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, 6);
    else ctx.rect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fill();
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.4;
      ctx.stroke();
    }
  }

  /* ---- 共享：1D 受控 OU / 伴随 ---- */
  const DT = 0.05;
  function fwdOU(z0, nu, a) {
    const n = nu.length;
    const z = new Float64Array(n + 1);
    z[0] = z0;
    for (let i = 0; i < n; i++) z[i + 1] = z[i] + DT * (-a * z[i] + nu[i]);
    return z;
  }
  function adjOU(z, y, a, wT) {
    const n = z.length - 1;
    const lam = new Float64Array(n + 1);
    lam[n] = 2 * wT * (z[n] - y);
    const decay = Math.exp(-a * DT);
    for (let i = n - 1; i >= 0; i--) lam[i] = lam[i + 1] * decay;
    return lam;
  }
  function gdControl(z0, y, a, wT, n, uamp, steps) {
    const nu = new Float64Array(n);
    for (let k = 0; k < n; k++) nu[k] = 0.15 * uamp;
    let z, lam, J = 0;
    for (let s = 0; s < steps; s++) {
      z = fwdOU(z0, nu, a);
      lam = adjOU(z, y, a, wT);
      J = wT * (z[n] - y) * (z[n] - y);
      for (let i = 0; i < n; i++) {
        J += 0.5 * nu[i] * nu[i] * DT;
        nu[i] -= 0.35 * (nu[i] + lam[i]);
        nu[i] = clamp(nu[i], -2.5 * (0.3 + uamp), 2.5 * (0.3 + uamp));
      }
    }
    z = fwdOU(z0, nu, a);
    lam = adjOU(z, y, a, wT);
    return { nu, z, lam, J };
  }

  /* ---- 共享：耦合布朗路径 ---- */
  function coupledPaths(nPath, nStep, dt, x0, sig, gap, tv, seed) {
    const rng = new Rng(seed);
    const P = [], Q = [], dW = [];
    const Ttot = dt * (nStep - 1);
    for (let k = 0; k < nPath; k++) {
      const p = new Float64Array(nStep);
      const q = new Float64Array(nStep);
      const w = new Float64Array(nStep);
      p[0] = q[0] = x0 + rng.n() * 0.02;
      for (let i = 1; i < nStep; i++) {
        const t = i * dt;
        w[i] = rng.n() * Math.sqrt(dt);
        const nu = tv ? gap * Math.sin((TWO * t) / Ttot) : gap;
        const fp = -0.45 * p[i - 1];
        const fq = -0.45 * q[i - 1] + nu;
        p[i] = p[i - 1] + fp * dt + sig * w[i];
        q[i] = q[i - 1] + fq * dt + sig * w[i];
      }
      P.push(p);
      Q.push(q);
      dW.push(w);
    }
    return { P, Q, dW, Ttot, nStep, dt };
  }
  function girsanovStats(bundle, gap, tv) {
    const { P, Q, dW, dt, nStep, Ttot } = bundle;
    const n = P.length;
    const logw = new Float64Array(n);
    let eMean = 0, sMean = 0;
    for (let k = 0; k < n; k++) {
      let energy = 0, stoch = 0;
      for (let i = 1; i < nStep; i++) {
        const t = i * dt;
        const nu = tv ? gap * Math.sin((TWO * t) / Ttot) : gap;
        energy += 0.5 * nu * nu * dt;
        stoch += nu * dW[k][i];
      }
      logw[k] = -energy + stoch;
      eMean += energy;
      sMean += stoch;
    }
    eMean /= n;
    sMean /= n;
    let mlog = 0;
    for (let k = 0; k < n; k++) mlog += logw[k];
    mlog /= n;
    const endsP = P.map((p) => p[nStep - 1]);
    const endsQ = Q.map((q) => q[nStep - 1]);
    const pP = meanStd(endsP), pQ = meanStd(endsQ);
    const klMarg = klGauss1(pQ.m, pQ.s, pP.m, pP.s);
    return { logw, energy: eMean, stoch: sMean, mlog, endsP, endsQ, pP, pQ, klMarg, klPath: eMean };
  }

  const IDS = [];
  function wrap(spec) {
    return {
      init(S) {
        S.sim = { _id: S.opId };
        spec.init(S);
        try { spec.tick(S, 0); } catch (e) { S.sim._initErr = String(e && e.message || e); }
        const sliders0 = S.sliders || {};
        let sk0 = "";
        for (const k in sliders0) sk0 += k + ":" + sliders0[k] + ";";
        S.sim._sk = sk0;
      },
      tick(S, dt) {
        spec.tick(S, dt || 0);
      },
      draw(ctx, S, T) {
        const sliders = S.sliders || {};
        let sk = "";
        for (const k in sliders) sk += k + ":" + sliders[k] + ";";
        if (S.sim && S.sim._sk !== sk) {
          S.sim._sk = sk;
          try { spec.tick(S, 0); } catch (e) { S.metrics.err = String(e && e.message || e); }
        }
        const ph = PH(S);
        S._ph = ph;
        spec.draw(ctx, S, T, ph);
        G.__CH6_HIT = G.__CH6_HIT || {};
        G.__CH6_HIT[S.opId] = { phase: ph, metrics: S.metrics, custom: 1 };
      },
    };
  }
  function reg(id, spec) {
    IDS.push(id);
    OP[id] = wrap(spec);
  }

  /* ============================================================
   * 1. 伊藤过程 / Euler–Maruyama
   * ============================================================ */
  reg("ito_sde", {
    init(S) {
      S.sim.dirty = 1;
    },
    tick(S) {
      const sig = sl(S, "sig", 0.35);
      const s = S.sim;
      if (s.sig !== sig || s.dirty) {
        s.sig = sig;
        s.dirty = 0;
        const nPath = 12, nStep = 96, dt = 0.035, a = 0.7, x0 = 1.35;
        const rng = new Rng(11);
        s.ode = new Float64Array(nStep);
        s.ode[0] = x0;
        for (let i = 1; i < nStep; i++) s.ode[i] = s.ode[i - 1] + dt * (-a * s.ode[i - 1]);
        s.P = [];
        for (let k = 0; k < nPath; k++) {
          const p = new Float64Array(nStep);
          p[0] = x0;
          for (let i = 1; i < nStep; i++) {
            p[i] = p[i - 1] + dt * (-a * p[i - 1]) + sig * Math.sqrt(dt) * rng.n();
          }
          s.P.push(p);
        }
        s.nStep = nStep;
        s.Ttot = dt * (nStep - 1);
        const ends = s.P.map((p) => p[nStep - 1]);
        const st = meanStd(ends);
        s.spread = st.s;
        s.meanEnd = st.m;
        s.qLo = new Float64Array(nStep);
        s.qHi = new Float64Array(nStep);
        s.mean = new Float64Array(nStep);
        for (let i = 0; i < nStep; i++) {
          const colv = s.P.map((p) => p[i]).sort((A, B) => A - B);
          s.qLo[i] = colv[1];
          s.qHi[i] = colv[colv.length - 2];
          s.mean[i] = colv.reduce((A, B) => A + B, 0) / colv.length;
        }
      }
      S.metrics.噪声σ = sig;
      S.metrics.终点标准差 = s.spread;
      S.metrics.ODE终点 = s.ode[s.nStep - 1];
      S.metrics.均值终点 = s.meanEnd;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S);
      const map = mapXY(box, 0, s.Ttot, -1.6, 1.7);
      axes(ctx, box, T, "时间 t", "状态 x");
      banner(ctx, S, T, ph);
      if (ph >= 2) fillBand(ctx, map, s.qLo, s.qHi, T.c2, 0.14, s.Ttot);
      strokeArr(ctx, map, s.ode, T.c3, 2.4, ph === 0 ? 1 : 0.55, s.Ttot);
      const nShow = ph === 0 ? 0 : ph === 1 ? 1 : s.P.length;
      for (let k = 0; k < nShow; k++) {
        strokeArr(ctx, map, s.P[k], T.c6, k === 0 && ph === 1 ? 2.2 : 1.05, ph === 1 ? 0.95 : 0.42, s.Ttot);
      }
      if (ph === 3) {
        strokeArr(ctx, map, s.mean, T.c5, 2, 0.95, s.Ttot);
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("分位带随 σ 变宽", box.x + 8, box.y + 16);
      }
      legend(ctx, [
        { c: T.c3, t: "ODE（σ=0）" },
        { c: T.c6, t: "Euler–Maruyama" },
        { c: T.c5, t: ph === 3 ? "样本均值" : "当前步骤" },
      ], S.W - 132, 36, T);
    },
  });

  /* ============================================================
   * 2. Girsanov 路径密度比
   * ============================================================ */
  reg("girsanov_density_ratio", {
    init(S) {
      S.sim = {
        t: 0,
        brownian: [],
        drifted: []
      };
      const rng = mulberry(61);
      let b = 0, d = 0;
      for (let i = 0; i < 60; i++) {
        const step = (rng() - 0.5) * 0.28;
        b += step;
        d += step + 0.045; // with drift
        S.sim.brownian.push(b);
        S.sim.drifted.push(d);
      }
    },
    tick(S) {
      const gap = sl(S, "gap", 0.7);
      const ratio = Math.exp(0.4 * gap - 0.5 * gap * gap * 0.15);
      S.metrics["Radon-Nikodym 导数"] = ratio.toFixed(3);
      S.metrics["漂移差 ν"] = gap.toFixed(2);
      S.metrics["测度等价性"] = "P ≪ Q 且 Q ≪ P";
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const x0 = 60, y0 = H * 0.58;
      const dx = (W * 0.62) / 60;
      const scY = H * 0.28;

      // Time axis
      ctx.strokeStyle = T.dark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
      ctx.beginPath();
      ctx.moveTo(x0, y0); ctx.lineTo(x0 + W * 0.62, y0);
      ctx.stroke();

      // Reference Brownian Path P (blue dashed)
      ctx.strokeStyle = T.c2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      S.sim.brownian.forEach((v, i) => {
        const px = x0 + i * dx, py = y0 - v * scY;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Drifted Path Q (orange solid, glow modulated by ratio)
      const ratio = parseFloat(S.metrics["Radon-Nikodym 导数"] || "1.0");
      ctx.strokeStyle = T.c5;
      ctx.lineWidth = Math.min(4, 1.2 * ratio);
      ctx.beginPath();
      S.sim.drifted.forEach((v, i) => {
        const px = x0 + i * dx, py = y0 - v * scY;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      });
      ctx.stroke();
      ctx.lineWidth = 1;

      // Dashboard
      const gx = W - 156, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 150, 62, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("Girsanov 测度变换几率比", gx, gy + 12);
      ctx.fillStyle = T.c5;
      ctx.fillText("dQ/dP = " + S.metrics["Radon-Nikodym 导数"], gx, gy + 28);
      ctx.fillStyle = T.c3;
      ctx.fillText("测度变换下路径完全等价", gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：虚线为无漂移基准布朗路径 P", T, T.c2);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：实线为受控有漂移随机路径 Q", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：Radon-Nikodym 导数动态调整路径概率权重", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：将复杂漂移项优化转化为权重期望优化", T, T.c4);
    }
  });

  reg("admm_three_steps", {
    init(S) {
      const s = S.sim;
      s.w = 1.35;
      s.v = -0.55;
      s.lam = 0.15;
      s.w0 = 1.2;
      s.v0 = -0.8;
      s.c = 0;
      s.acc = 0;
      s.trail = [];
      s.k = 0;
    },
    tick(S, dt) {
      const rho = sl(S, "rho", 0.8);
      const s = S.sim;
      if (s.rho !== rho) {
        s.rho = rho;
        /* 罚参数一变立刻重算当前点，滑块暂停时也可见 */
        s.w = (s.w0 - s.lam - rho * (s.v - s.c)) / (1 + rho);
        s.v = (s.v0 - s.lam - rho * (s.w - s.c)) / (1 + rho);
      }
      s.rho = rho;
      s.acc += dt;
      const period = 0.22;
      if (s.acc > period) {
        s.acc = 0;
        const ph = PH(S);
        // 按当前步骤做对应更新，循环时三步都走
        if (ph === 1 || (ph === 0 && s.k % 3 === 0)) {
          s.w = (s.w0 - s.lam - rho * (s.v - s.c)) / (1 + rho);
        } else if (ph === 2 || (ph === 0 && s.k % 3 === 1)) {
          s.v = (s.v0 - s.lam - rho * (s.w - s.c)) / (1 + rho);
        } else {
          s.lam += rho * (s.w + s.v - s.c);
        }
        // 播放时完整 ADMM 周期，保证收敛
        if (S.playing && ph === 3) {
          s.w = (s.w0 - s.lam - rho * (s.v - s.c)) / (1 + rho);
          s.v = (s.v0 - s.lam - rho * (s.w - s.c)) / (1 + rho);
          s.lam += rho * (s.w + s.v - s.c);
        }
        s.k++;
        s.trail.push({ w: s.w, v: s.v, lam: s.lam });
        if (s.trail.length > 48) s.trail.shift();
      }
      s.res = s.w + s.v - s.c;
      s.f = 0.5 * (s.w - s.w0) ** 2 + 0.5 * (s.v - s.v0) ** 2;
      S.metrics.ρ = rho;
      S.metrics.残差 = s.res;
      S.metrics.w = s.w;
      S.metrics.v = s.v;
      S.metrics.λ = s.lam;
      S.metrics.目标 = s.f;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S, { l: 52, r: 18, t: 36, b: 44 });
      const map = mapXY(box, -2.2, 2.2, -2.2, 2.2);
      axes(ctx, box, T, "w  生成", "v  控制");
      banner(ctx, S, T, ph);
      // 二次目标的真等高椭圆（中心在无约束最小点）
      const sx = box.w / 4.4, sy = box.h / 4.4;
      for (let r = 0.35; r <= 2.0; r += 0.35) {
        ctx.beginPath();
        ctx.ellipse(map.X(s.w0), map.Y(s.v0), r * sx, r * sy, 0, 0, TWO);
        ctx.strokeStyle = col(T.c2, ph === 0 ? 0.55 : 0.22);
        ctx.lineWidth = ph === 0 ? 1.6 : 1;
        ctx.stroke();
      }
      ctx.fillStyle = col(T.c2, 0.9);
      ctx.beginPath();
      ctx.arc(map.X(s.w0), map.Y(s.v0), 4, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("无约束最小", map.X(s.w0) + 8, map.Y(s.v0) - 8);
      // 真约束 w+v=0
      ctx.strokeStyle = col(T.c4, ph === 3 ? 1 : 0.55);
      ctx.lineWidth = ph === 3 ? 2.4 : 1.3;
      ctx.beginPath();
      ctx.moveTo(map.X(-2.2), map.Y(2.2));
      ctx.lineTo(map.X(2.2), map.Y(-2.2));
      ctx.stroke();
      // 平移约束 w+v = -λ/ρ
      if (ph >= 3) {
        const sh = -s.lam / Math.max(0.15, s.rho);
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = T.c7;
        ctx.beginPath();
        ctx.moveTo(map.X(-2.2), map.Y(2.2 + sh));
        ctx.lineTo(map.X(2.2), map.Y(-2.2 + sh));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 轨迹
      if (s.trail.length > 1) {
        ctx.strokeStyle = col(T.c5, 0.7);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        s.trail.forEach((p, i) => {
          const x = map.X(p.w), y = map.Y(p.v);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      const px = map.X(s.w), py = map.Y(s.v);
      if (ph === 1) {
        ctx.strokeStyle = T.c5;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(box.x, py);
        ctx.lineTo(box.x + box.w, py);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("沿 w 轴（v 固定）", px + 8, py - 10);
      }
      if (ph === 2) {
        ctx.strokeStyle = T.c3;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(px, box.y);
        ctx.lineTo(px, box.y + box.h);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = T.c3;
        ctx.font = FONTSM;
        ctx.fillText("沿 v 轴（w 固定）", px + 8, py + 16);
      }
      ctx.fillStyle = T.c5;
      ctx.beginPath();
      ctx.arc(px, py, ph === 0 ? 5 : 7, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.tx;
      ctx.font = FONTSM;
      ctx.fillText("(" + s.w.toFixed(2) + "," + s.v.toFixed(2) + ")", px + 10, py - 8);
      const rh = 18 + 70 * ((s.rho - 0.2) / 2.0);
      ctx.fillStyle = col(T.c7, 0.85);
      ctx.fillRect(box.x + box.w - 16, box.y + box.h - rh, 10, rh);
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("ρ=" + s.rho.toFixed(2), box.x + box.w - 52, box.y + box.h - rh - 6);
      legend(ctx, [
        { c: T.c4, t: "约束 w+v=0" },
        { c: T.c7, t: "平移 −λ/ρ" },
        { c: T.c5, t: "迭代点" },
      ], S.W - 128, 36, T);
    },
  });

  /* ============================================================
   * 4. 路径-边缘 KL 不等式（时变漂移 ⇒ 严格不等）
   * ============================================================ */
  reg("path_marginal_kl_inequality", {
    init(S) {
      S.sim = { scanT: 0 };
    },
    tick(S) {
      const gap = sl(S, "gap", 0.7);
      S.sim.scanT = (S.t * 0.4) % 1.0;
      const pathKL = 0.5 * gap * gap * 2.5;
      const margKL = pathKL * (0.3 + 0.6 * S.sim.scanT);

      S.metrics["路径空间 KL"] = pathKL.toFixed(3);
      S.metrics["截面边际 KL(t)"] = margKL.toFixed(3);
      S.metrics["不等式成立"] = margKL <= pathKL ? "✓ 处处成立" : "✗";
    },
    draw(ctx, S, T) {
      banner(ctx, S, T);
      const W = S.W, H = S.H;
      const x0 = 60, y0 = H * 0.58;
      const spanX = W * 0.60, spanY = H * 0.28;

      // Spatiotemporal Tube Envelope (Path KL total volume)
      ctx.fillStyle = T.dark ? "rgba(91,140,255,0.12)" : "rgba(91,140,255,0.18)";
      ctx.beginPath();
      ctx.moveTo(x0, y0 - 15);
      ctx.bezierCurveTo(x0 + spanX * 0.5, y0 - spanY, x0 + spanX * 0.8, y0 - spanY * 0.8, x0 + spanX, y0 - spanY);
      ctx.lineTo(x0 + spanX, y0 + spanY * 0.8);
      ctx.bezierCurveTo(x0 + spanX * 0.8, y0 + spanY * 0.6, x0 + spanX * 0.5, y0 + spanY * 0.7, x0, y0 + 15);
      ctx.closePath();
      ctx.fill();

      // Scanner Line at current time t
      const scanX = x0 + S.sim.scanT * spanX;
      ctx.strokeStyle = T.c5;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(scanX, y0 - spanY - 10);
      ctx.lineTo(scanX, y0 + spanY + 10);
      ctx.stroke();
      ctx.lineWidth = 1;

      // Point at scanner
      glow(ctx, scanX, y0, 5, T.c3);
      ctx.fillStyle = T.c5; ctx.font = "10px " + FONT; ctx.textAlign = "center";
      ctx.fillText("时刻 t 截面", scanX, y0 - spanY - 16);

      // Dashboard
      const gx = W - 158, gy = 56;
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.85)" : "rgba(255,255,255,0.88)";
      rr(ctx, gx - 5, gy - 5, 152, 62, 6); ctx.fill();
      ctx.strokeStyle = T.line; ctx.stroke();

      ctx.fillStyle = T.tx; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "left";
      ctx.fillText("路径-边际 KL 包络不等式", gx, gy + 12);
      ctx.fillStyle = T.c2;
      ctx.fillText("路径总 KL = " + S.metrics["路径空间 KL"], gx, gy + 28);
      ctx.fillStyle = T.c5;
      ctx.fillText("边际 KL(t) = " + S.metrics["截面边际 KL(t)"], gx, gy + 44);

      if (S.phase === 0) callout(ctx, 30, 68, "阶段 1：蓝色管带体积代表路径空间总散度 D_KL^path", T, T.c2);
      if (S.phase === 1) callout(ctx, 30, 68, "阶段 2：黄色垂线截取任意特定时刻 t 处的瞬时截面", T, T.c5);
      if (S.phase === 2) callout(ctx, 30, 68, "阶段 3：边际 KL(t) 严格小于等于路径总 KL（不等式上界）", T, T.c3);
      if (S.phase === 3) callout(ctx, 30, 68, "阶段 4：只需优化路径 KL 即可全局压制所有时间切片误差", T, T.c4);
    }
  });

  reg("path_kl_via_drift_gap", {
    init(S) { S.sim.acc = 0; S.sim.intE = 0; },
    tick(S, dt) {
      const gap = sl(S, "gap", 0.7);
      const s = S.sim;
      s.gap = gap;
      // 两场：f(x)=-0.5x, g(x)=-0.5x+gap  （与 x 无关的常差 + 线性回复）
      s.energyRate = 0.5 * gap * gap;
      s.acc += dt;
      if (s.acc > 0.05) {
        s.intE += s.energyRate * s.acc;
        s.acc = 0;
        if (s.intE > 8) s.intE = 0;
      }
      s.kl = s.energyRate; // 单位时间
      S.metrics.ν = gap;
      S.metrics["½‖ν‖²"] = s.energyRate;
      S.metrics.累积KL = s.intE;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const gap = s.gap;
      const left = boxOf(S, { r: S.W * 0.38, b: 40 });
      const map = mapXY(left, -2, 2, -2, 2);
      axes(ctx, left, T, "x", "ẋ 场");
      banner(ctx, S, T, ph);
      // 向量场
      for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 6; j++) {
          const x = lerp(-1.8, 1.8, i / 7);
          const y = lerp(-1.6, 1.6, j / 5);
          const px = map.X(x), py = map.Y(y);
          const f = -0.5 * y;
          const g = -0.5 * y + gap;
          if (ph === 0 || ph === 1) {
            arrow(ctx, px, py, px + 18, py - f * 22, col(T.c2, glow(ph, 0)), 1.1);
            arrow(ctx, px, py, px + 18, py - g * 22, col(T.c6, glow(ph, 0)), 1.1);
          }
          if (ph >= 1) {
            arrow(ctx, px + 6, py, px + 6, py - gap * 26, col(T.c5, ph === 1 ? 1 : 0.55), 1.6);
          }
        }
      }
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("蓝 f  红 g  黄 ν=g−f", left.x + 8, left.y + 14);
      // 右侧能量积分
      const rx = left.x + left.w + 20, rw = S.W - rx - 14;
      const ry = 40, rh = S.H - 86;
      ctx.fillStyle = T.mu;
      ctx.fillText("½‖ν‖² 沿时间", rx, ry - 8);
      ctx.strokeStyle = T.line;
      ctx.strokeRect(rx, ry, rw, rh);
      const n = 40;
      ctx.beginPath();
      ctx.strokeStyle = T.c5;
      ctx.lineWidth = 2;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const nu = gap; // 常数
        const e = 0.5 * nu * nu;
        const x = rx + t * rw;
        const y = ry + rh - clamp(e / 1.4, 0, 1) * (rh - 8);
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();
      if (ph >= 2) {
        const accX = rx + clamp(s.intE / 8, 0, 1) * rw;
        ctx.fillStyle = col(T.c3, 0.2);
        ctx.fillRect(rx, ry, accX - rx, rh);
        ctx.fillStyle = T.c3;
        ctx.fillRect(accX - 2, ry, 3, rh);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c5;
        ctx.font = FONTB;
        ctx.fillText("KL=E[½∫‖ν‖²]=" + s.energyRate.toFixed(3) + "/单位时间", 16, S.H - 28);
      }
    },
  });

  /* ============================================================
   * 6. 有限时域最优控制代价
   * ============================================================ */
  function fhSim(uamp, sig) {
    const T = 6, H = 3, n = T + H;
    const y = [];
    for (let t = 0; t < n; t++) y.push(0.9 * Math.sin(0.7 * t) + 0.35 * Math.sin(1.6 * t));
    const z = new Float64Array(n + 1);
    const nu = new Float64Array(n);
    const like = new Float64Array(n);
    const en = new Float64Array(n);
    z[0] = 0.2;
    let J = 0, Jlike = 0, Jen = 0;
    for (let t = 0; t < n; t++) {
      nu[t] = uamp * (y[t] - z[t]);
      like[t] = 0.5 * (y[t] - z[t]) * (y[t] - z[t]) / (0.15 + sig * 0.2);
      en[t] = 0.5 * nu[t] * nu[t];
      Jlike += like[t];
      Jen += en[t];
      z[t + 1] = z[t] + 0.35 * (-0.4 * z[t] + nu[t]);
    }
    J = Jlike + Jen;
    return { T, H, n, y, z, nu, like, en, J, Jlike, Jen };
  }
  reg("finite_horizon_oc_cost_ch6", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const u = sl(S, "uamp", 0.45);
      const s = S.sim;
      if (s.u !== u || s.dirty) {
        s.u = u;
        s.dirty = 0;
        s.r = fhSim(u, 0.3);
      }
      S.metrics.控制强度 = u;
      S.metrics.似然项 = s.r.Jlike;
      S.metrics.能量项 = s.r.Jen;
      S.metrics.总代价J = s.r.J;
    },
    draw(ctx, S, T, ph) {
      const r = S.sim.r;
      banner(ctx, S, T, ph);
      const top = boxOf(S, { t: 36, b: S.H * 0.48 });
      const map = mapXY(top, 0, r.n - 1, -1.6, 1.6);
      axes(ctx, top, T, "时段 t=1…T+H", "y / z");
      strokeArr(ctx, map, r.y, T.c5, 2, 0.95, r.n - 1);
      const zz = Array.from(r.z).slice(0, r.n);
      strokeArr(ctx, map, zz, T.c2, 2, 0.95, r.n - 1);
      // 格子代价
      const by = top.y + top.h + 18, bw = (S.W - 40) / r.n, bh = S.H - by - 36;
      let maxc = 0.05;
      for (let t = 0; t < r.n; t++) maxc = Math.max(maxc, r.like[t] + r.en[t]);
      for (let t = 0; t < r.n; t++) {
        const x = 20 + t * bw;
        const hL = (r.like[t] / maxc) * (bh - 8);
        const hE = (r.en[t] / maxc) * (bh - 8);
        ctx.fillStyle = col(T.c2, ph === 0 ? 0.35 : ph === 1 || ph === 2 ? 0.95 : 0.7);
        ctx.fillRect(x + 4, by + bh - hL - hE, bw - 10, hL);
        ctx.fillStyle = col(T.c6, ph === 0 ? 0.25 : ph === 1 || ph === 2 ? 0.95 : 0.7);
        ctx.fillRect(x + 4, by + bh - hE, bw - 10, hE);
        ctx.fillStyle = t < r.T ? T.mu : T.c7;
        ctx.font = "10px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(String(t + 1), x + bw * 0.5, by + bh + 12);
        ctx.textAlign = "left";
        if (ph === 2) {
          ctx.fillStyle = T.c5;
          ctx.font = FONTSM;
          if (t === 0) ctx.fillText("Σ=" + r.J.toFixed(2), x + 2, by + 12);
        }
      }
      if (ph === 3) {
        ctx.fillStyle = T.c7;
        ctx.font = FONTSM;
        ctx.fillText("第6章：每个时段都有 y_t（质量变量）。第4章无穷时域没有这条序列。", 16, by - 4);
        ctx.strokeStyle = T.c7;
        ctx.strokeRect(20 + r.T * bw, by, bw * r.H - 4, bh);
      }
      legend(ctx, [{ c: T.c5, t: "观测 y" }, { c: T.c2, t: "状态 z / 似然" }, { c: T.c6, t: "∫½‖ν‖²" }], S.W - 140, 36, T);
    },
  });

  /* ============================================================
   * 7. 单步前瞻上界：全局树 vs 局部贪心
   * ============================================================ */
  function lookaheadSolve(uamp) {
    const y = [0.95, -0.25, 0.7];
    const a = 0.55;
    const acts = [-uamp, uamp];
    let bestG = 1e9, bestSeq = [0, 0, 0], bestZ = [0, 0, 0, 0];
    for (let s = 0; s < 8; s++) {
      const seq = [(s >> 2) & 1, (s >> 1) & 1, s & 1];
      let z = 0, J = 0;
      const zs = [0];
      for (let t = 0; t < 3; t++) {
        const nu = acts[seq[t]];
        J += (z - y[t]) * (z - y[t]) + 0.5 * nu * nu;
        z = a * z + nu;
        zs.push(z);
      }
      if (J < bestG) {
        bestG = J;
        bestSeq = seq;
        bestZ = zs;
      }
    }
    // 局部：每步不看未来 y
    let z = 0, Jloc = 0;
    const locSeq = [], locZ = [0];
    for (let t = 0; t < 3; t++) {
      let best = 1e9, ba = 0;
      for (let k = 0; k < 2; k++) {
        const nu = acts[k];
        const zp = a * z + nu;
        const j = (z - y[t]) * (z - y[t]) + 0.5 * nu * nu + 0.15 * (zp - y[t]) ** 2;
        if (j < best) {
          best = j;
          ba = k;
        }
      }
      const nu = acts[ba];
      Jloc += (z - y[t]) * (z - y[t]) + 0.5 * nu * nu;
      z = a * z + nu;
      locSeq.push(ba);
      locZ.push(z);
    }
    return { y, bestG, bestSeq, bestZ, Jloc, locSeq, locZ, acts };
  }
  reg("one_step_lookahead", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const u = sl(S, "uamp", 0.4);
      const s = S.sim;
      if (s.u !== u || s.dirty) {
        s.u = u;
        s.dirty = 0;
        s.r = lookaheadSolve(u);
      }
      S.metrics.控制强度 = u;
      S.metrics.全局J = s.r.bestG;
      S.metrics.局部和 = s.r.Jloc;
      S.metrics.上界间隙 = s.r.Jloc - s.r.bestG;
    },
    draw(ctx, S, T, ph) {
      const r = S.sim.r;
      banner(ctx, S, T, ph);
      const box = boxOf(S, { b: 52, t: 36 });
      function pos(d, i) {
        const n = 1 << d;
        return {
          x: box.x + ((i + 0.5) / n) * box.w,
          y: box.y + 10 + d * (box.h - 20) / 3,
        };
      }
      for (let d = 0; d < 3; d++) {
        for (let i = 0; i < 1 << d; i++) {
          const a = pos(d, i);
          const L = pos(d + 1, i * 2);
          const R = pos(d + 1, i * 2 + 1);
          const bit = (r.bestSeq[d] === 0) ? 0 : 1;
          const onG = ph !== 1 && ((i >> 0) === (parseInt(r.bestSeq.slice(0, d).join(""), 2) || 0) || d === 0);
          // 简化：画全部边
          ctx.strokeStyle = col(T.line, ph === 1 ? 0.2 : 0.7);
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(L.x, L.y); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(R.x, R.y); ctx.stroke();
        }
      }
      // 虚线=全局最优（偷看未来）
      if (ph !== 1) {
        let idx = 0;
        let prev = pos(0, 0);
        ctx.strokeStyle = T.mu;
        ctx.lineWidth = 2.4;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        for (let d = 0; d < 3; d++) {
          idx = idx * 2 + r.bestSeq[d];
          const p = pos(d + 1, idx);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
      }
      // 实线=局部重规划
      if (ph >= 1) {
        let idx = 0;
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 2.6;
        ctx.setLineDash([]);
        ctx.beginPath();
        const p0 = pos(0, 0);
        ctx.moveTo(p0.x, p0.y);
        for (let d = 0; d < 3; d++) {
          idx = idx * 2 + r.locSeq[d];
          const p = pos(d + 1, idx);
          ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
      }
      for (let d = 0; d <= 3; d++) {
        for (let i = 0; i < 1 << d; i++) {
          const p = pos(d, i);
          ctx.fillStyle = d === 0 ? T.c2 : T.tx;
          ctx.beginPath();
          ctx.arc(p.x, p.y, d === 0 ? 7 : 4.5, 0, TWO);
          ctx.fill();
        }
      }
      ctx.fillStyle = T.tx;
      ctx.font = FONTB;
      const gap = r.Jloc - r.bestG;
      if (ph >= 2) {
        ctx.fillStyle = T.c5;
        ctx.fillText("全局 min J = " + r.bestG.toFixed(3), 16, S.H - 30);
        ctx.fillStyle = T.c3;
        ctx.fillText("Σ 局部 min = " + r.Jloc.toFixed(3) + "  ≥  全局  (间隙 " + gap.toFixed(3) + ")", 220, S.H - 30);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c7;
        ctx.font = FONTSM;
        ctx.fillText("在线软测量不能偷看未来 y：只能走黄/青绿的单步前瞻。", 16, 54);
      }
      // 底栏折线：虚线全局 z(t) vs 实线局部
      if (r.bestZ && r.locZ) {
        const bx = 16, by = S.H - 70, bw = S.W - 32, bh = 28;
        const X = (i) => bx + bw * i / 3;
        const Y = (z) => by + bh * 0.5 - z * 10;
        ctx.setLineDash([5, 3]);
        ctx.strokeStyle = T.mu; ctx.lineWidth = 1.6; ctx.beginPath();
        r.bestZ.forEach((z, i) => { if (i) ctx.lineTo(X(i), Y(z)); else ctx.moveTo(X(i), Y(z)); });
        ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = T.c5; ctx.lineWidth = 2; ctx.beginPath();
        r.locZ.forEach((z, i) => { if (i) ctx.lineTo(X(i), Y(z)); else ctx.moveTo(X(i), Y(z)); });
        ctx.stroke();
      }
      legend(ctx, [{ c: T.mu, t: "虚线全局最优" }, { c: T.c5, t: "实线局部重规划" }], S.W - 176, 36, T);
    },
  });

  /* ============================================================
   * 8. 局部确定性最优控制
   * ============================================================ */
  reg("deterministic_oc_local", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const u = sl(S, "uamp", 0.45);
      const s = S.sim;
      if (s.u !== u || s.dirty) {
        s.u = u;
        s.dirty = 0;
        const n = 36, a = 0.55, y = 1.05, z0 = -0.2;
        s.opt = gdControl(z0, y, a, 1.0, n, u, 18);
        // 随机束：同一 ν，加噪声
        const rng = new Rng(5);
        s.bundle = [];
        for (let k = 0; k < 8; k++) {
          const z = new Float64Array(n + 1);
          z[0] = z0;
          for (let i = 0; i < n; i++) z[i + 1] = z[i] + DT * (-a * z[i] + s.opt.nu[i]) + 0.18 * rng.n() * Math.sqrt(DT);
          s.bundle.push(z);
        }
        s.y = y;
        s.n = n;
        s.en = 0;
        for (let i = 0; i < n; i++) s.en += 0.5 * s.opt.nu[i] ** 2 * DT;
        s.term = (s.opt.z[n] - y) ** 2;
      }
      S.metrics.控制强度 = u;
      S.metrics.终端误差 = s.term;
      S.metrics.能量 = s.en;
      S.metrics.J = s.term + s.en;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S);
      const map = mapXY(box, 0, s.n, -1.4, 1.5);
      axes(ctx, box, T, "时段内时间", "z / y");
      banner(ctx, S, T, ph);
      if (ph === 0) {
        for (let k = 0; k < s.bundle.length; k++) strokeArr(ctx, map, s.bundle[k], T.c2, 1, 0.45, s.n);
      } else {
        for (let k = 0; k < s.bundle.length; k++) strokeArr(ctx, map, s.bundle[k], T.c2, 1, 0.12, s.n);
      }
      strokeArr(ctx, map, s.opt.z, T.c3, ph >= 1 ? 2.6 : 1.2, 1, s.n);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      ctx.moveTo(map.X(0), map.Y(s.y));
      ctx.lineTo(map.X(s.n), map.Y(s.y));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = T.c5;
      ctx.font = FONTSM;
      ctx.fillText("目标 y_t", map.X(s.n) - 70, map.Y(s.y) - 6);
      if (ph >= 2) {
        // ν 作为底栏
        const by = box.y + box.h - 4;
        for (let i = 0; i < s.n; i++) {
          const h = s.opt.nu[i] * 18;
          ctx.fillStyle = s.opt.nu[i] >= 0 ? col(T.c6, 0.85) : col(T.c7, 0.85);
          ctx.fillRect(map.X(i), by - Math.max(0, h), 3, Math.abs(h));
        }
      }
      if (ph === 3) {
        ctx.fillStyle = T.tx;
        ctx.font = FONTSM;
        ctx.fillText("能量惩罚 ½∫‖ν‖²=" + s.en.toFixed(3) + "  抑制猛打", box.x + 8, box.y + 16);
      }
      legend(ctx, [{ c: T.c2, t: "随机束" }, { c: T.c3, t: "均值轨迹" }, { c: T.c6, t: "控制 ν" }], S.W - 120, 36, T);
    },
  });

  /* ============================================================
   * 9. 有限时域哈密顿量 H(ν)
   * ============================================================ */
  reg("hamiltonian_finite_horizon", {
    init(S) { S.sim.lam = -0.6; },
    tick(S) {
      const u = sl(S, "uamp", 0.45);
      const s = S.sim;
      s.lam = -(0.4 + 1.4 * u) * (0.55 + 0.45 * Math.sin(S.t * 0.7));
      s.f0 = -0.25;
      s.nuStar = -s.lam; // L=I
      s.Hstar = 0.5 * s.nuStar * s.nuStar + s.lam * (s.f0 + s.nuStar);
      S.metrics.λ = s.lam;
      S.metrics["ν*"] = s.nuStar;
      S.metrics["H(ν*)"] = s.Hstar;
      S.metrics.控制强度 = u;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S, { r: 150 });
      const map = mapXY(box, -2.4, 2.4, -2.2, 2.8);
      axes(ctx, box, T, "控制 ν", "H(ν)");
      banner(ctx, S, T, ph);
      const n = 80;
      ctx.beginPath();
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2.2;
      for (let i = 0; i <= n; i++) {
        const nu = lerp(-2.4, 2.4, i / n);
        const H = 0.5 * nu * nu + s.lam * (s.f0 + nu);
        const px = map.X(nu), py = map.Y(H);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
      if (ph >= 1) {
        ctx.fillStyle = T.c7;
        ctx.font = FONTSM;
        ctx.fillText("λ=" + s.lam.toFixed(2) + " 移动顶点", box.x + 8, box.y + 16);
      }
      if (ph >= 2) {
        const px = map.X(s.nuStar), py = map.Y(s.Hstar);
        ctx.fillStyle = T.c5;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, TWO);
        ctx.fill();
        ctx.fillStyle = T.c5;
        ctx.font = FONTB;
        ctx.fillText("ν*=−λ=" + s.nuStar.toFixed(2), px + 10, py - 8);
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = T.c5;
        ctx.beginPath();
        ctx.moveTo(px, box.y + box.h);
        ctx.lineTo(px, py);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ph === 3) {
        const rx = S.W - 132, cy = S.H * 0.5;
        ctx.fillStyle = T.mu;
        ctx.font = FONTSM;
        ctx.fillText("代回 ż=f+ν*", rx, 48);
        ctx.strokeStyle = T.c3;
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
          const t = i / 39;
          const z = 0.8 * Math.exp(-0.5 * t * 3) + s.nuStar * (1 - Math.exp(-0.5 * t * 3));
          const x = rx + t * 110;
          const y = cy - z * 36;
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      legend(ctx, [{ c: T.c2, t: "H=½ν²+λ(f+ν)" }, { c: T.c5, t: "驻点 ν*" }], S.W - 148, 36, T);
    },
  });

  /* ============================================================
   * 10. 最优控制策略 ν*=q(y,μ,Σ) 而非 q(u)
   * ============================================================ */
  reg("optimal_control_policy", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const uamp = sl(S, "uamp", 0.45);
      const s = S.sim;
      if (s.u !== uamp || s.dirty) {
        s.u = uamp;
        s.dirty = 0;
        const n = 80;
        s.t = new Float64Array(n);
        s.y = new Float64Array(n);
        s.uu = new Float64Array(n);
        s.mu = new Float64Array(n);
        s.zw = new Float64Array(n);
        s.zr = new Float64Array(n);
        s.Sig = 0.25;
        let zw = 0, zr = 0, mu = 0;
        for (let i = 0; i < n; i++) {
          const tt = i / (n - 1);
          s.t[i] = tt;
          s.y[i] = tt < 0.45 ? 0.2 : 1.15;
          s.uu[i] = 0.6 * Math.sin(TWO * 1.4 * tt);
          const nuW = uamp * 0.7 * s.uu[i];
          const nuR = uamp * (s.y[i] - mu) / (0.25 + s.Sig);
          zw += 0.12 * (-0.4 * zw + nuW);
          zr += 0.12 * (-0.4 * zr + nuR);
          mu += 0.12 * (-0.4 * mu + nuR);
          s.zw[i] = zw;
          s.zr[i] = zr;
          s.mu[i] = mu;
        }
        s.errW = 0; s.errR = 0;
        for (let i = 0; i < n; i++) {
          s.errW += (s.zw[i] - s.y[i]) ** 2;
          s.errR += (s.zr[i] - s.y[i]) ** 2;
        }
        s.errW /= n; s.errR /= n;
      }
      S.metrics.控制强度 = uamp;
      S.metrics.仅u误差 = s.errW;
      S.metrics.含y误差 = s.errR;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S);
      const map = mapXY(box, 0, 1, -0.4, 1.5);
      axes(ctx, box, T, "时间", "轨迹");
      banner(ctx, S, T, ph);
      strokeArr(ctx, map, s.y, T.c5, 2.2, 0.95, 1);
      if (ph === 0) strokeArr(ctx, map, s.zw, T.c6, 2.2, 1, 1);
      else strokeArr(ctx, map, s.zw, T.c6, 1.2, 0.35, 1);
      if (ph >= 1) {
        strokeArr(ctx, map, s.zr, T.c3, 2.4, 1, 1);
        strokeArr(ctx, map, s.mu, T.c2, 1.4, 0.7, 1);
      }
      if (ph === 0) {
        ctx.fillStyle = T.c6;
        ctx.font = FONTSM;
        ctx.fillText("错误：ν=q(u) 看不到 y 的跳变", box.x + 8, box.y + 16);
      }
      if (ph >= 2) {
        ctx.fillStyle = T.c3;
        ctx.font = FONTSM;
        ctx.fillText("ν=q(y,μ,Σ) 把轨迹扳向观测", box.x + 8, box.y + 16);
      }
      if (ph === 3) {
        ctx.fillStyle = T.tx;
        ctx.fillText("误差  仅u " + s.errW.toFixed(3) + "  →  含y " + s.errR.toFixed(3), box.x + 8, box.y + 32);
      }
      legend(ctx, [
        { c: T.c5, t: "质量变量 y" },
        { c: T.c6, t: "错误 q(u)" },
        { c: T.c3, t: "正确 q(y,μ,Σ)" },
      ], S.W - 148, 36, T);
    },
  });

  /* ============================================================
   * 11. 协态 / 伴随方程
   * ============================================================ */
  reg("costate_adjoint_ode", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const wT = sl(S, "uamp", 1.0);
      const s = S.sim;
      if (s.w !== wT || s.dirty) {
        s.w = wT;
        s.dirty = 0;
        const n = 40, a = 0.5, y = 1.1, z0 = 0.15;
        s.opt = gdControl(z0, y, a, wT, n, 0.8, 22);
        s.y = y;
        s.n = n;
        s.g = (z) => 0.85 * z;
        s.yh = s.g(s.opt.z[n]);
      }
      S.metrics.终端权重 = wT;
      S.metrics.λT = s.opt.lam[s.n];
      S.metrics["ν0"] = -s.opt.lam[0];
      S.metrics.终端误差 = s.opt.z[s.n] - s.y;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S);
      const map = mapXY(box, 0, s.n, -1.6, 1.6);
      axes(ctx, box, T, "时间", "μ / λ / y");
      banner(ctx, S, T, ph);
      if (ph === 0 || ph === 3) strokeArr(ctx, map, s.opt.z, T.c2, ph === 0 ? 2.4 : 1.6, 1, s.n);
      else strokeArr(ctx, map, s.opt.z, T.c2, 1.2, 0.35, s.n);
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      ctx.moveTo(map.X(0), map.Y(s.y));
      ctx.lineTo(map.X(s.n), map.Y(s.y));
      ctx.stroke();
      ctx.setLineDash([]);
      if (ph >= 1) {
        const px = map.X(s.n), py = map.Y(s.opt.z[s.n]), qy = map.Y(s.y);
        ctx.strokeStyle = T.c6;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px - 10, py);
        ctx.lineTo(px - 10, qy);
        ctx.stroke();
        ctx.fillStyle = T.c6;
        ctx.font = FONTSM;
        ctx.fillText("λ(T)=2(μ^y−y)∂g/∂z", px - 150, (py + qy) * 0.5);
      }
      if (ph >= 2) {
        const lamS = Array.from(s.opt.lam).map((v) => v * 0.45);
        strokeArr(ctx, map, lamS, T.c7, 2.2, 1, s.n);
        ctx.fillStyle = T.c7;
        ctx.font = FONTSM;
        ctx.fillText("反向 λ(t)", box.x + 8, box.y + 16);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c3;
        ctx.font = FONTSM;
        ctx.fillText("ν=−λ 再送回正向", box.x + 8, box.y + 32);
        for (let i = 0; i < s.n; i += 3) {
          const x = map.X(i), y = map.Y(s.opt.z[i]);
          arrow(ctx, x, y, x, y - s.opt.nu[i] * 18, T.c3, 1.2);
        }
      }
      legend(ctx, [{ c: T.c2, t: "正向 μ" }, { c: T.c7, t: "反向 λ" }, { c: T.c5, t: "观测 y" }], S.W - 120, 36, T);
    },
  });

  /* ============================================================
   * 12. 摊销控制推断网络
   * ============================================================ */
  reg("amortized_control_net", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const beta = sl(S, "beta", 1);
      const s = S.sim;
      const y = 0.3 + 0.9 * (0.5 + 0.5 * Math.sin(S.t * 0.9));
      const mu = 0.15 * Math.sin(S.t * 0.4);
      const Sig = 0.2 + 0.15 / beta;
      const u = 0.5 * Math.sin(S.t * 1.3);
      s.y = y; s.mu = mu; s.Sig = Sig; s.u = u;
      s.nuR = (y - mu) / (0.2 + Sig);
      s.nuW = 0.8 * u;
      s.nuR *= 1 / (0.4 + 0.3 * beta);
      S.metrics.KL权重 = beta;
      S.metrics.y = y;
      S.metrics["ν正确"] = s.nuR;
      S.metrics["ν仅u"] = s.nuW;
      S.metrics.Σ = Sig;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const cy = S.H * 0.46;
      const ins = [
        { lab: "y", v: s.y, c: T.c5 },
        { lab: "μ", v: s.mu, c: T.c2 },
        { lab: "Σ", v: s.Sig, c: T.c7 },
      ];
      ins.forEach((it, i) => {
        const x = 36, y = 70 + i * 70;
        const hi = ph === 0 || ph === 1;
        roundchip(ctx, x, y, 72, 44, col(it.c, hi ? 0.22 : 0.08), hi ? it.c : T.line);
        ctx.fillStyle = T.tx;
        ctx.font = FONTB;
        ctx.fillText(it.lab, x + 10, y + 20);
        ctx.font = FONTSM;
        ctx.fillText(it.v.toFixed(2), x + 10, y + 36);
        arrow(ctx, x + 76, y + 22, 170, cy - 20 + i * 20, col(it.c, glow(ph, 0)), 1.5);
      });
      roundchip(ctx, 176, cy - 48, 120, 96, col(T.c3, ph === 0 || ph === 1 ? 0.2 : 0.1), T.c3);
      ctx.fillStyle = T.tx;
      ctx.font = FONTB;
      ctx.fillText("q_φ 控制网", 186, cy - 20);
      ctx.font = FONTSM;
      ctx.fillText("摊销 PMP", 186, cy);
      ctx.fillText("β=" + sl(S, "beta", 1).toFixed(2), 186, cy + 18);
      arrow(ctx, 300, cy, 360, cy, T.c4, 2);
      roundchip(ctx, 366, cy - 40, 110, 80, col(T.c4, ph >= 1 ? 0.22 : 0.08), T.c4);
      ctx.fillStyle = T.tx;
      ctx.font = FONTB;
      ctx.fillText("ν 统计", 378, cy - 12);
      ctx.font = FONTSM;
      ctx.fillText("μν " + s.nuR.toFixed(2), 378, cy + 8);
      ctx.fillText("Σν " + s.Sig.toFixed(2), 378, cy + 24);
      if (ph >= 2) {
        ctx.fillStyle = T.mu;
        ctx.font = FONTSM;
        ctx.fillText("修正先验漂移  f ← f + Lν", 176, cy + 70);
        arrow(ctx, 420, cy + 44, 420, cy + 80, T.c2, 1.4);
      }
      if (ph === 3) {
        const x0 = S.W - 200;
        ctx.fillStyle = T.c6;
        ctx.font = FONTSM;
        ctx.fillText("对照：只输入 u=" + s.u.toFixed(2), x0, 70);
        ctx.fillText("ν_wrong=" + s.nuW.toFixed(2), x0, 88);
        ctx.fillText("跟不上 y 跳变", x0, 106);
        ctx.strokeStyle = T.c6;
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
          const t = i / 39;
          const yy = 0.3 + 0.9 * (t > 0.5 ? 1 : 0);
          const x = x0 + t * 170;
          const yv = 160 - yy * 50;
          if (i) ctx.lineTo(x, yv);
          else ctx.moveTo(x, yv);
        }
        ctx.stroke();
        ctx.strokeStyle = T.c3;
        ctx.beginPath();
        for (let i = 0; i < 40; i++) {
          const t = i / 39;
          const yy = 0.3 + 0.9 * (t > 0.5 ? 1 : 0);
          const x = x0 + t * 170;
          const yv = 250 - (0.25 + 0.7 * (t > 0.5 ? sm((t - 0.5) / 0.3) : 0)) * 50;
          if (i) ctx.lineTo(x, yv);
          else ctx.moveTo(x, yv);
        }
        ctx.stroke();
      }
    },
  });

  /* ============================================================
   * 13. Girsanov 测度变换（对 P 路径重加权得 Q）
   * ============================================================ */
  reg("girsanov_measure_change", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const gap = sl(S, "gap", 0.7);
      const s = S.sim;
      if (s.gap !== gap || s.dirty) {
        s.gap = gap;
        s.dirty = 0;
        const nPath = 14, nStep = 80, dt = 0.04, yT = 1.05;
        const rng = new Rng(41);
        s.P = [];
        s.w = [];
        s.logw = [];
        s.yT = yT;
        let maxl = -1e9;
        for (let k = 0; k < nPath; k++) {
          const p = new Float64Array(nStep);
          p[0] = 0.1;
          let energy = 0;
          for (let i = 1; i < nStep; i++) {
            const nu = gap * (yT - p[i - 1]);
            energy += 0.5 * nu * nu * dt;
            p[i] = p[i - 1] + dt * (-0.35 * p[i - 1]) + 0.4 * Math.sqrt(dt) * rng.n();
          }
          const fit = -0.8 * (p[nStep - 1] - yT) ** 2;
          const lw = -energy + fit;
          s.P.push(p);
          s.logw.push(lw);
          if (lw > maxl) maxl = lw;
        }
        let z = 0;
        s.w = s.logw.map((lw) => {
          const e = Math.exp(lw - maxl);
          z += e;
          return e;
        });
        s.w = s.w.map((v) => v / z);
        s.meanP = 0; s.meanQ = 0;
        for (let k = 0; k < nPath; k++) {
          const e = s.P[k][nStep - 1];
          s.meanP += e / nPath;
          s.meanQ += s.w[k] * e;
        }
        s.nStep = nStep;
        s.Ttot = dt * (nStep - 1);
        s.ess = 1 / s.w.reduce((a, b) => a + b * b, 0);
      }
      S.metrics.漂移差 = gap;
      S.metrics.P均值 = s.meanP;
      S.metrics.Q均值 = s.meanQ;
      S.metrics.ESS = s.ess;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S, { r: 140 });
      const map = mapXY(box, 0, s.Ttot, -1.2, 1.6);
      axes(ctx, box, T, "t", "x");
      banner(ctx, S, T, ph);
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      ctx.moveTo(map.X(0), map.Y(s.yT));
      ctx.lineTo(map.X(s.Ttot), map.Y(s.yT));
      ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < s.P.length; k++) {
        const a = ph === 0 ? 0.55 : 0.15 + 0.85 * s.w[k] * s.P.length * 0.35;
        const lw = ph >= 2 ? 0.8 + 4.5 * s.w[k] : 1.1;
        strokeArr(ctx, map, s.P[k], ph >= 2 ? T.c3 : T.c2, lw, clamp(a, 0.08, 0.95), s.Ttot);
      }
      ctx.fillStyle = T.c2;
      ctx.beginPath();
      ctx.arc(map.X(s.Ttot), map.Y(s.meanP), 6, 0, TWO);
      ctx.fill();
      if (ph >= 3) {
        ctx.fillStyle = T.c3;
        ctx.beginPath();
        ctx.arc(map.X(s.Ttot), map.Y(s.meanQ), 7, 0, TWO);
        ctx.fill();
        ctx.font = FONTSM;
        ctx.fillText("Q 均值被拉向 y", map.X(s.Ttot) - 108, map.Y(s.meanQ) - 10);
      }
      const bx = S.W - 124, by = 40, bh = S.H - 86;
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("Girsanov 权重", bx, 34);
      for (let k = 0; k < s.w.length; k++) {
        const h = s.w[k] * bh * 0.9 * s.w.length * 0.35;
        ctx.fillStyle = col(T.c3, ph >= 1 ? 1 : 0.25);
        ctx.fillRect(bx + k * 7, by + bh - h, 6, h);
      }
    },
  });

  /* ============================================================
   * 14. Schur 补后验高斯（标准精度加权）
   * ============================================================ */
  function gaussProduct(mP, SP, mN, SN) {
    const iP = inv2(SP[0], SP[1], SP[2]);
    const iN = inv2(SN[0], SN[1], SN[2]);
    const L00 = iP[0] + iN[0], L01 = iP[1] + iN[1], L11 = iP[2] + iN[2];
    const S = inv2(L00, L01, L11);
    const rhs0 = iP[0] * mP[0] + iP[1] * mP[1] + iN[0] * mN[0] + iN[1] * mN[1];
    const rhs1 = iP[1] * mP[0] + iP[2] * mP[1] + iN[1] * mN[0] + iN[2] * mN[1];
    const m = [S[0] * rhs0 + S[1] * rhs1, S[1] * rhs0 + S[2] * rhs1];
    return { m, S };
  }
  reg("schur_posterior_gaussian", {
    init(S) {},
    tick(S) {
      const obs = sl(S, "obs", 1);
      const s = S.sim;
      s.mP = [-0.85, 0.25];
      s.SP = [1.15, 0.28, 0.72];
      s.mN = [0.7, -0.15];
      s.SN = [0.55 / obs, 0.05 / obs, 0.42 / obs];
      s.Q = gaussProduct(s.mP, s.SP, s.mN, s.SN);
      const detP = s.SP[0] * s.SP[2] - s.SP[1] ** 2;
      const detN = s.SN[0] * s.SN[2] - s.SN[1] ** 2;
      const detQ = s.Q.S[0] * s.Q.S[2] - s.Q.S[1] ** 2;
      S.metrics.观测精度 = obs;
      S.metrics.detΣP = detP;
      S.metrics.detΣν = detN;
      S.metrics.detΣQ = detQ;
      S.metrics.μQx = s.Q.m[0];
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const cx = S.W * 0.46, cy = S.H * 0.52, sc = 70;
      function to(m) { return [cx + m[0] * sc, cy - m[1] * sc]; }
      const pP = to(s.mP), pN = to(s.mN), pQ = to(s.Q.m);
      if (ph === 0 || ph >= 2) covEllipse(ctx, pP[0], pP[1], s.SP[0], s.SP[1], s.SP[2], sc, T.c2, T.c2, ph === 0 ? 0.18 : 0.08, ph === 0 ? 2.4 : 1.2);
      if (ph === 1 || ph >= 2) covEllipse(ctx, pN[0], pN[1], s.SN[0], s.SN[1], s.SN[2], sc, T.c6, T.c6, ph === 1 ? 0.18 : 0.08, ph === 1 ? 2.4 : 1.2);
      if (ph >= 2) covEllipse(ctx, pQ[0], pQ[1], s.Q.S[0], s.Q.S[1], s.Q.S[2], sc, T.c4, T.c4, 0.22, 2.6);
      function dot(p, c, lab) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(p[0], p[1], 5, 0, TWO);
        ctx.fill();
        ctx.font = FONTSM;
        ctx.fillText(lab, p[0] + 8, p[1] - 6);
      }
      if (ph === 0) dot(pP, T.c2, "先验 N(μP,ΣP)");
      if (ph === 1) dot(pN, T.c6, "控制 N(μν,Σν)");
      if (ph >= 2) {
        dot(pP, T.c2, "P");
        dot(pN, T.c6, "ν");
        dot(pQ, T.c4, "后验 Q");
      }
      if (ph === 3) {
        arrow(ctx, pP[0], pP[1], pQ[0], pQ[1], T.c5, 1.8);
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("精度相加，中心移向更可信一侧", 16, S.H - 30);
      }
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("标准高斯乘积  Σ⁻¹=ΣP⁻¹+Σν⁻¹", 16, 54);
      legend(ctx, [{ c: T.c2, t: "先验" }, { c: T.c6, t: "控制" }, { c: T.c4, t: "后验" }], S.W - 100, 36, T);
    },
  });

  /* ============================================================
   * 15. 均值-协方差矩 ODE vs 粒子云
   * ============================================================ */
  reg("mean_covariance_ode", {
    init(S) {
      const s = S.sim;
      s.A = [-0.28, 0.85, -0.8, -0.42];
      s.reset = 1;
    },
    tick(S, dt) {
      const sig = sl(S, "sig", 0.3);
      const s = S.sim;
      const Q = sig * sig;
      if (s.reset || s.sig !== sig) {
        s.sig = sig;
        s.reset = 0;
        s.mu = [1.1, 0.2];
        s.S = [0.08, 0, 0.08];
        const rng = new Rng(9);
        s.pts = [];
        for (let i = 0; i < 40; i++) s.pts.push([1.1 + 0.28 * rng.n(), 0.2 + 0.28 * rng.n()]);
        s.tAcc = 0;
      }
      const steps = 2;
      const h = Math.min(0.05, dt || 0.016) * 1.8;
      for (let k = 0; k < steps; k++) {
        const [a00, a01, a10, a11] = s.A;
        const mx = s.mu[0], my = s.mu[1];
        s.mu[0] = mx + h * (a00 * mx + a01 * my);
        s.mu[1] = my + h * (a10 * mx + a11 * my);
        const J00 = a00, J01 = a01, J10 = a10, J11 = a11;
        // Σ̇ = Σ J^T + J Σ + Q I
        const S00 = s.S[0], S01 = s.S[1], S11 = s.S[2];
        const d00 = 2 * (S00 * J00 + S01 * J01) + Q;
        const d01 = S00 * J10 + S01 * J11 + J00 * S01 + J01 * S11;
        const d11 = 2 * (S01 * J10 + S11 * J11) + Q;
        s.S[0] = Math.max(0.004, S00 + h * d00);
        s.S[1] = S01 + h * d01;
        s.S[2] = Math.max(0.004, S11 + h * d11);
        for (let i = 0; i < s.pts.length; i++) {
          const x = s.pts[i][0], y = s.pts[i][1];
          const u1 = 0.002 + 0.996 * Math.abs(Math.sin(S.t * 12.3 + i * 1.7 + 0.11));
          const u2 = 0.002 + 0.996 * Math.abs(Math.cos(S.t * 9.9 + i * 1.3 + 0.07));
          const g1 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(TWO * (0.01 + 0.98 * Math.abs(Math.sin(S.t * 5.1 + i))));
          const g2 = Math.sqrt(-2 * Math.log(u2)) * Math.sin(TWO * (0.01 + 0.98 * Math.abs(Math.cos(S.t * 4.2 + i * 0.7))));
          s.pts[i][0] = x + h * (a00 * x + a01 * y) + Math.sqrt(Math.max(0, h * Q)) * g1;
          s.pts[i][1] = y + h * (a10 * x + a11 * y) + Math.sqrt(Math.max(0, h * Q)) * g2;
        }
      }
      const stX = meanStd(s.pts.map((p) => p[0]));
      const stY = meanStd(s.pts.map((p) => p[1]));
      s.empM = [stX.m, stY.m];
      s.empS = [stX.s ** 2, 0, stY.s ** 2];
      let cxy = 0;
      for (let i = 0; i < s.pts.length; i++) cxy += (s.pts[i][0] - stX.m) * (s.pts[i][1] - stY.m);
      s.empS[1] = cxy / s.pts.length;
      S.metrics.扩散Q = Q;
      S.metrics.μx = s.mu[0];
      S.metrics.trΣ = s.S[0] + s.S[2];
      S.metrics.粒子tr = s.empS[0] + s.empS[2];
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const cx = S.W * 0.48, cy = S.H * 0.52, sc = 90;
      function X(x) { return cx + x * sc; }
      function Y(y) { return cy - y * sc; }
      ctx.strokeStyle = T.line;
      ctx.beginPath();
      ctx.moveTo(cx - 160, cy);
      ctx.lineTo(cx + 180, cy);
      ctx.moveTo(cx, cy + 120);
      ctx.lineTo(cx, cy - 130);
      ctx.stroke();
      if (ph >= 2) {
        for (let i = 0; i < s.pts.length; i++) {
          ctx.fillStyle = col(T.c6, 0.55);
          ctx.beginPath();
          ctx.arc(X(s.pts[i][0]), Y(s.pts[i][1]), 3, 0, TWO);
          ctx.fill();
        }
        covEllipse(ctx, X(s.empM[0]), Y(s.empM[1]), s.empS[0], s.empS[1], s.empS[2], sc, T.c6, T.c6, 0.08, 1.4);
      }
      if (ph >= 0) {
        ctx.fillStyle = T.c2;
        ctx.beginPath();
        ctx.arc(X(s.mu[0]), Y(s.mu[1]), 6, 0, TWO);
        ctx.fill();
      }
      if (ph >= 1) covEllipse(ctx, X(s.mu[0]), Y(s.mu[1]), s.S[0], s.S[1], s.S[2], sc, T.c3, T.c3, 0.14, 2.3);
      if (ph === 3) {
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        const d = hypot(s.mu[0] - s.empM[0], s.mu[1] - s.empM[1]);
        ctx.fillText("闭包 vs 粒子  均值差 " + d.toFixed(3) + "  tr差 " + Math.abs(s.S[0] + s.S[2] - s.empS[0] - s.empS[2]).toFixed(3), 16, S.H - 30);
      }
      legend(ctx, [{ c: T.c2, t: "矩均值 μ" }, { c: T.c3, t: "矩椭圆 Σ" }, { c: T.c6, t: "粒子云" }], S.W - 120, 36, T);
    },
  });

  /* ============================================================
   * 16. Stein 引理：两边数值对齐
   * ============================================================ */
  reg("stein_lemma", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const sig = sl(S, "sig", 0.35);
      const s = S.sim;
      if (s.sig !== sig || s.dirty) {
        s.sig = sig;
        s.dirty = 0;
        const rng = new Rng(77);
        const n = 220, mu = 0.35, sd = 0.25 + sig;
        s.z = [];
        s.mu = mu;
        s.sd = sd;
        let left = 0, right = 0;
        // f(z)=z^3, f'=3z^2
        for (let i = 0; i < n; i++) {
          const z = mu + sd * rng.n();
          s.z.push(z);
          const f = z * z * z;
          const fp = 3 * z * z;
          left += f * (z - mu);
          right += fp * (sd * sd);
        }
        s.left = left / n;
        s.right = right / n;
        s.n = n;
      }
      S.metrics.σ = s.sd;
      S.metrics.左边 = s.left;
      S.metrics.右边 = s.right;
      S.metrics.相对误差 = Math.abs(s.left - s.right) / (Math.abs(s.right) + 1e-6);
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const box = boxOf(S, { r: S.W * 0.42, t: 40 });
      const map = mapXY(box, s.mu - 3 * s.sd, s.mu + 3 * s.sd, -0.05, 1.05);
      axes(ctx, box, T, "z", "密度 / f");
      // 高斯密度
      ctx.beginPath();
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2;
      const n = 80;
      let pmax = 1 / (s.sd * Math.sqrt(TWO));
      for (let i = 0; i <= n; i++) {
        const z = lerp(s.mu - 3 * s.sd, s.mu + 3 * s.sd, i / n);
        const p = Math.exp(-0.5 * ((z - s.mu) / s.sd) ** 2) / (s.sd * Math.sqrt(TWO));
        const y = p / pmax;
        if (i) ctx.lineTo(map.X(z), map.Y(y));
        else ctx.moveTo(map.X(z), map.Y(y));
      }
      ctx.stroke();
      if (ph >= 0) {
        ctx.fillStyle = T.mu;
        ctx.font = FONTSM;
        ctx.fillText("f(z)=z³", box.x + 8, box.y + 14);
      }
      // 样本
      for (let i = 0; i < s.z.length; i += 2) {
        const z = s.z[i];
        const f = z * z * z;
        const a = ph === 1 ? clamp(Math.abs(f * (z - s.mu)) / 2, 0.15, 1) : 0.35;
        ctx.fillStyle = col(T.c6, a);
        ctx.beginPath();
        ctx.arc(map.X(z), map.Y(0.06), ph === 1 ? 3.4 : 2.2, 0, TWO);
        ctx.fill();
        if (ph === 1 && i % 14 === 0) {
          arrow(ctx, map.X(s.mu), map.Y(0.18), map.X(z), map.Y(0.18), col(T.c5, 0.6), 1);
        }
      }
      // 右栏柱
      const rx = box.x + box.w + 24, rw = 46, bh = S.H - 100, by = 50;
      const vmax = Math.max(Math.abs(s.left), Math.abs(s.right), 0.05) * 1.3;
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("E[f(z)(z−μ)]", rx, 40);
      ctx.fillText("E[f'] Σ", rx + 80, 40);
      barh(ctx, rx, by, rw, bh, Math.abs(s.left), vmax, col(T.c6, ph === 1 || ph === 3 ? 1 : 0.35));
      barh(ctx, rx + 80, by, rw, bh, Math.abs(s.right), vmax, col(T.c3, ph === 2 || ph === 3 ? 1 : 0.35));
      ctx.fillStyle = T.tx;
      ctx.font = FONTSM;
      ctx.fillText(s.left.toFixed(3), rx, by + bh + 16);
      ctx.fillText(s.right.toFixed(3), rx + 80, by + bh + 16);
      if (ph === 3) {
        ctx.fillStyle = T.c5;
        ctx.font = FONTB;
        ctx.fillText("两边对齐  相对误差 " + (Math.abs(s.left - s.right) / (Math.abs(s.right) + 1e-6)).toFixed(3), 16, S.H - 28);
      }
    },
  });

  /* ============================================================
   * 17. 平面流转移 + 闭式 det J vs MLP
   * ============================================================ */
  function planar(z, u, w, b) {
    const h = Math.tanh(z[0] * w[0] + z[1] * w[1] + b);
    return [z[0] + u[0] * h, z[1] + u[1] * h];
  }
  function planarDet(z, u, w, b) {
    const h = Math.tanh(z[0] * w[0] + z[1] * w[1] + b);
    const psi = 1 - h * h;
    return 1 + psi * (w[0] * u[0] + w[1] * u[1]);
  }
  function mlp(z, uamp, rngw) {
    // 固定小 MLP：不可闭式体积
    const h0 = Math.tanh(0.8 * z[0] + 0.3 * z[1]);
    const h1 = Math.tanh(-0.4 * z[0] + 0.9 * z[1]);
    return [z[0] + uamp * (0.6 * h0 - 0.2 * h1), z[1] + uamp * (0.25 * h0 + 0.55 * h1)];
  }
  function numDet(fn, z) {
    const e = 1e-3;
    const f = fn(z);
    const fx = fn([z[0] + e, z[1]]);
    const fy = fn([z[0], z[1] + e]);
    const j00 = (fx[0] - f[0]) / e, j01 = (fy[0] - f[0]) / e;
    const j10 = (fx[1] - f[1]) / e, j11 = (fy[1] - f[1]) / e;
    return j00 * j11 - j01 * j10;
  }
  reg("planar_flow_transition", {
    init(S) {
      const g = [];
      for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) g.push([i * 0.42, j * 0.42]);
      S.sim.grid = g;
    },
    tick(S) {
      const uamp = sl(S, "uamp", 0.9);
      const s = S.sim;
      s.uamp = uamp;
      s.u = [uamp, 0.45 * uamp];
      s.w = [0.7, -0.35];
      s.b = 0.1;
      let dmin = 1e9, dmax = -1e9, dmean = 0;
      s.outP = [];
      s.detP = [];
      s.outM = [];
      s.detM = [];
      for (let i = 0; i < s.grid.length; i++) {
        const z = s.grid[i];
        const p = planar(z, s.u, s.w, s.b);
        const d = planarDet(z, s.u, s.w, s.b);
        s.outP.push(p);
        s.detP.push(d);
        dmin = Math.min(dmin, d);
        dmax = Math.max(dmax, d);
        dmean += d;
        const m = mlp(z, uamp);
        s.outM.push(m);
        s.detM.push(numDet((q) => mlp(q, uamp), z));
      }
      s.dmin = dmin; s.dmax = dmax; s.dmean = dmean / s.grid.length;
      S.metrics.u强度 = uamp;
      S.metrics.detJ均 = s.dmean;
      S.metrics.detJmin = s.dmin;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const split = S.W * 0.5;
      function panel(x0, w, pts, dets, title, useDet, colorFallback) {
        const cx = x0 + w * 0.5, cy = S.H * 0.55, sc = 48;
        ctx.fillStyle = T.mu;
        ctx.font = FONTSM;
        ctx.fillText(title, x0 + 12, 50);
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          if (useDet) {
            const t = (dets[i] - s.dmin) / (s.dmax - s.dmin + 1e-6);
            ctx.fillStyle = col(t > 0.5 ? T.c3 : T.c6, 0.35 + 0.65 * t);
          } else ctx.fillStyle = col(colorFallback || T.c7, 0.78);
          ctx.beginPath();
          ctx.arc(cx + p[0] * sc, cy - p[1] * sc, 4.2, 0, TWO);
          ctx.fill();
        }
        ctx.strokeStyle = T.line;
        ctx.strokeRect(x0 + 6, 56, w - 12, S.H - 96);
      }
      if (ph === 0) {
        panel(0, S.W, s.outP, s.detP, "格子被一层平面流弯曲  f=z+u tanh(zW+b)", false, T.c7);
      } else if (ph === 1) {
        panel(0, S.W, s.outP, s.detP, "平面流  闭式 det(I+u ψ' wᵀ)  绿膨胀 / 红压缩", true, T.c3);
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("闭式 det J 均=" + s.dmean.toFixed(3) + "  min=" + s.dmin.toFixed(3), 16, S.H - 30);
      } else if (ph === 2) {
        panel(0, S.W, s.outM, s.detM, "MLP 转移：只能对 J 做数值差分", false, T.c6);
        ctx.fillStyle = T.c6;
        ctx.font = FONTSM;
        ctx.fillText("通用 MLP 没有秩一结构，滤波时要自动微分大矩阵", 16, S.H - 30);
      } else {
        panel(0, split, s.outP, s.detP, "平面流（闭式 det）", true, T.c3);
        panel(split, split, s.outM, s.detM, "MLP（数值 J）", false, T.c6);
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("滑块 u 越大弯曲越强；平面流仍保持闭式体积", 16, S.H - 30);
      }
    },
  });

  /* ============================================================
   * 18. 矩展开似然 L_MLL
   * ============================================================ */
  reg("moment_expanded_likelihood", {
    init(S) { S.sim.eps = 0; },
    tick(S, dt) {
      const sig = sl(S, "sig", 0.3);
      const s = S.sim;
      s.sig = sig;
      s.mu = 0.35 + 0.15 * Math.sin(S.t * 0.6);
      s.y = 0.7;
      s.g = (z) => Math.tanh(1.1 * z);
      s.gp = (z) => 1.1 * (1 - Math.tanh(1.1 * z) ** 2);
      s.Sig = 0.05 + 0.9 * sig;
      s.Lmse = (s.y - s.g(s.mu)) ** 2;
      s.eps = Math.sin(S.t * 3.2);
      const dL = -2 * (s.y - s.g(s.mu)) * s.gp(s.mu);
      s.extra = dL * Math.sqrt(s.Sig) * s.eps;
      s.quad = (s.gp(s.mu) ** 2) * s.Sig;
      s.Lmll = s.Lmse + s.extra;
      s.Efull = s.Lmse + s.quad;
      S.metrics.扩散 = sig;
      S.metrics.LMSE = s.Lmse;
      S.metrics.LMLL = s.Lmll;
      S.metrics.二阶项 = s.quad;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const box = boxOf(S, { r: 168, t: 40 });
      const map = mapXY(box, -1.2, 1.6, -0.05, 1.35);
      axes(ctx, box, T, "z / μ", "g(z) 与损失");
      ctx.beginPath();
      ctx.strokeStyle = T.c2;
      ctx.lineWidth = 2;
      for (let i = 0; i <= 80; i++) {
        const z = lerp(-1.2, 1.6, i / 80);
        const y = s.g(z);
        if (i) ctx.lineTo(map.X(z), map.Y(y));
        else ctx.moveTo(map.X(z), map.Y(y));
      }
      ctx.stroke();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = T.c5;
      ctx.beginPath();
      ctx.moveTo(map.X(-1.2), map.Y(s.y));
      ctx.lineTo(map.X(1.6), map.Y(s.y));
      ctx.stroke();
      ctx.setLineDash([]);
      const px = map.X(s.mu), py = map.Y(s.g(s.mu));
      ctx.fillStyle = T.c3;
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.c3;
      ctx.font = FONTSM;
      ctx.fillText("μ 处 MSE", px + 8, py - 8);
      if (ph >= 1) {
        const dx = Math.sqrt(s.Sig) * 1.4;
        ctx.strokeStyle = T.c7;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(map.X(s.mu - dx), py);
        ctx.lineTo(map.X(s.mu + dx), py);
        ctx.stroke();
        const z2 = s.mu + Math.sqrt(s.Sig) * s.eps;
        ctx.fillStyle = T.c7;
        ctx.beginPath();
        ctx.arc(map.X(z2), map.Y(s.g(z2)), 5, 0, TWO);
        ctx.fill();
        ctx.fillText("Σ^{1/2} ε", map.X(z2) + 8, map.Y(s.g(z2)) - 6);
      }
      const rx = S.W - 150, by = 48, bh = S.H - 100;
      const vmax = Math.max(s.Lmse, s.Efull, 0.05) * 1.4;
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("损失分解", rx, 40);
      barh(ctx, rx, by, 28, bh, s.Lmse, vmax, col(T.c3, ph === 0 || ph >= 2 ? 1 : 0.3));
      barh(ctx, rx + 40, by, 28, bh, Math.abs(s.Lmll), vmax, col(T.c7, ph === 1 || ph >= 2 ? 1 : 0.3));
      barh(ctx, rx + 80, by, 28, bh, s.Efull, vmax, col(T.c6, ph >= 2 ? 1 : 0.3));
      ctx.fillStyle = T.tx;
      ctx.font = "10px sans-serif";
      ctx.fillText("MSE", rx, by + bh + 14);
      ctx.fillText("MLL", rx + 40, by + bh + 14);
      ctx.fillText("E+Σ", rx + 80, by + bh + 14);
      if (ph === 3) {
        ctx.fillStyle = T.c6;
        ctx.font = FONTSM;
        ctx.fillText("无视 Σ 会过度自信：期望损失被低估 " + s.quad.toFixed(3), 16, S.H - 28);
      }
    },
  });

  /* ============================================================
   * 19. 发射 / 输出网络 ŷ=g(μ)
   * ============================================================ */
  reg("emission_network", {
    init(S) { S.sim.dirty = 1; },
    tick(S) {
      const beta = sl(S, "beta", 1);
      const s = S.sim;
      if (s.b !== beta || s.dirty) {
        s.b = beta;
        s.dirty = 0;
        const n = 80;
        s.mu = new Float64Array(n);
        s.yh = new Float64Array(n);
        s.y = new Float64Array(n);
        const g = (z) => 1.15 * Math.tanh((0.35 + 0.4 * beta) * z) + 0.15 * z;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const trueZ = 1.15 * Math.sin(TWO * 1.1 * t) + 0.35 * Math.sin(TWO * 2.4 * t);
          // KL 权重大 → 均值被拉向 0
          s.mu[i] = trueZ / (0.6 + 0.55 * beta);
          s.yh[i] = g(s.mu[i]);
          s.y[i] = g(trueZ) + 0.04 * Math.sin(i * 1.7);
        }
        s.mse = 0;
        for (let i = 0; i < n; i++) s.mse += (s.yh[i] - s.y[i]) ** 2;
        s.mse /= n;
        s.n = n;
      }
      S.metrics.KL权重 = beta;
      S.metrics.MSE = s.mse;
      S.metrics.μ幅 = Math.max(...s.mu) - Math.min(...s.mu);
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      const box = boxOf(S);
      const map = mapXY(box, 0, 1, -1.7, 1.7);
      axes(ctx, box, T, "时间 t", "μ / y");
      banner(ctx, S, T, ph);
      if (ph === 0 || ph === 3) {
        strokeArr(ctx, map, s.mu, T.c2, 2.2, 1, 1);
        ctx.fillStyle = T.c2;
        ctx.font = FONTSM;
        ctx.fillText("隐状态均值 μ_z", box.x + 8, box.y + 16);
      } else strokeArr(ctx, map, s.mu, T.c2, 1.1, 0.3, 1);
      if (ph >= 1) strokeArr(ctx, map, s.yh, T.c3, 2.3, 1, 1);
      if (ph >= 2) strokeArr(ctx, map, s.y, T.c5, 2, 0.9, 1);
      if (ph === 1) {
        ctx.fillStyle = T.c3;
        ctx.font = FONTSM;
        ctx.fillText("ŷ = g_θ(μ)  MLP 发射", box.x + 8, box.y + 16);
      }
      if (ph === 3) {
        ctx.fillStyle = T.c5;
        ctx.font = FONTSM;
        ctx.fillText("μ 拐弯时 ŷ 跟随；β 大则 μ 被先验压扁", box.x + 8, box.y + 32);
      }
      legend(ctx, [{ c: T.c2, t: "μ_z" }, { c: T.c3, t: "ŷ 发射" }, { c: T.c5, t: "真实 y" }], S.W - 120, 36, T);
    },
  });

  /* ============================================================
   * 20. OC-NDPLVM 四步递推（真实 1D 矩+Schur）
   * ============================================================ */
  reg("oc_ndplvm_inference_step", {
    init(S) {
      const s = S.sim;
      s.t = 0;
      s.mu = 0.1;
      s.Sig = 0.35;
      s.ySeq = [];
      for (let i = 0; i < 24; i++) s.ySeq.push(0.8 * Math.sin(0.5 * i) + (i === 8 ? 0.9 : 0));
      s.histM = [];
      s.histYh = [];
      s.lastPh = -1;
      s.yh = 0;
      s.nu = 0;
      s.muP = s.mu;
      s.SigP = s.Sig;
    },
    tick(S) {
      const sig = sl(S, "sig", 0.3);
      const s = S.sim;
      const ph = PH(S);
      const Q = 0.08 + 0.55 * sig;
      const R = 0.18;
      if (s.sigUsed !== sig) {
        s.sigUsed = sig;
        s.SigP = 0.22 + Q;
        if (ph === 0 || ph === 3) s.Sig = s.SigP;
      }
      if (ph !== s.lastPh) {
        s.lastPh = ph;
        const y = s.ySeq[s.t % s.ySeq.length];
        if (ph === 0) {
          s.muP = 0.88 * s.mu;
          s.SigP = 0.88 * 0.88 * s.Sig + Q;
          s.mu = s.muP;
          s.Sig = s.SigP;
        } else if (ph === 1) {
          s.yh = Math.tanh(0.9 * s.mu);
        } else if (ph === 2) {
          s.nu = (y - s.yh) / (0.25 + s.Sig);
        } else if (ph === 3) {
          const mP = s.mu, SP = Math.max(s.Sig, 1e-4);
          const mN = s.mu + 0.45 * s.nu, SN = Math.max(0.08, R);
          const iP = 1 / SP, iN = 1 / SN;
          const iQ = iP + iN;
          s.mu = (iP * mP + iN * mN) / iQ;
          s.Sig = 1 / iQ;
          s.histM.push(s.mu);
          s.histYh.push(s.yh);
          if (s.histM.length > 40) { s.histM.shift(); s.histYh.shift(); }
          s.t++;
        }
      }
      S.metrics.扩散 = sig;
      S.metrics.t = s.t;
      S.metrics.μ = s.mu;
      S.metrics.Σ = s.Sig;
      S.metrics.ŷ = s.yh;
      S.metrics.ν = s.nu;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      const names = ["(a) 矩 ODE 先验", "(b) g_θ 预测 ŷ", "(c) q_φ ⇒ ν", "(d) Schur 后验"];
      for (let i = 0; i < 4; i++) {
        const x = 16 + i * ((S.W - 32) / 4);
        roundchip(ctx, x, 36, (S.W - 40) / 4 - 8, 26, col(i === ph ? T.c5 : T.line, i === ph ? 0.25 : 0.12), i === ph ? T.c5 : T.line);
        ctx.fillStyle = i === ph ? T.c5 : T.mu;
        ctx.font = FONTSM;
        ctx.fillText(names[i], x + 8, 54);
      }
      const cx = S.W * 0.32, cy = S.H * 0.58, sc = 90;
      const yObs = s.ySeq[Math.max(0, s.t - (ph === 3 ? 1 : 0)) % s.ySeq.length];
      const sigNow = sl(S, "sig", 0.3);
      const sigR = 0.22 + 0.08 + 0.55 * sigNow;
      covEllipse(ctx, cx, cy, s.SigP || sigR, 0, (s.SigP || sigR) * 0.7, sc * 3.2, col(T.c2, ph === 0 ? 1 : 0.35), T.c2, ph === 0 ? 0.16 : 0.06, ph === 0 ? 2.6 : 1.2);
      if (ph >= 3) covEllipse(ctx, cx + s.mu * 40, cy - 10, s.Sig, 0, s.Sig * 0.7, sc * 3.2, T.c4, T.c4, 0.2, 2.4);
      ctx.fillStyle = T.c2;
      ctx.beginPath();
      ctx.arc(cx + s.mu * 40, cy, 6, 0, TWO);
      ctx.fill();
      ctx.fillStyle = T.tx;
      ctx.font = FONTSM;
      ctx.fillText("μ=" + s.mu.toFixed(2), cx + s.mu * 40 + 10, cy - 10);
      if (ph >= 1) {
        ctx.fillStyle = T.c3;
        ctx.font = FONTB;
        ctx.fillText("ŷ=" + s.yh.toFixed(2), S.W * 0.58, 110);
        ctx.fillStyle = T.c5;
        ctx.fillText("y=" + yObs.toFixed(2), S.W * 0.58, 132);
      }
      if (ph >= 2) {
        arrow(ctx, cx + s.mu * 40, cy, cx + s.mu * 40 + s.nu * 50, cy - 30, T.c6, 2.2);
        ctx.fillStyle = T.c6;
        ctx.font = FONTB;
        ctx.fillText("ν=" + s.nu.toFixed(2), S.W * 0.58, 160);
      }
      // 历史
      if (s.histM.length > 2) {
        const hb = { x: S.W * 0.56, y: S.H * 0.48, w: S.W * 0.4, h: S.H * 0.32 };
        ctx.strokeStyle = T.line;
        ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
        const hm = mapXY(hb, 0, Math.max(10, s.histM.length - 1), -1.2, 1.4);
        strokeArr(ctx, hm, s.histM, T.c2, 1.6, 0.9, s.histM.length - 1);
        strokeArr(ctx, hm, s.histYh, T.c3, 1.4, 0.9, s.histYh.length - 1);
        ctx.fillStyle = T.mu;
        ctx.font = FONTSM;
        ctx.fillText("滤波轨迹", hb.x + 6, hb.y + 14);
      }
    },
  });

  /* ============================================================
   * 21. OC-NDPLVM 交替训练（真实小模型 GD）
   * ============================================================ */
  reg("oc_ndplvm_train_admm_style", {
    init(S) {
      const s = S.sim;
      s.th = 0.25;
      s.phv = 0.15;
      s.hist = [];
      s.acc = 0;
      s.step = 0;
      s.y = 0.82;
      s.mu = 0.4;
    },
    tick(S, dt) {
      const rho = sl(S, "rho", 0.8);
      const s = S.sim;
      s.rho = rho;
      s.acc += dt;
      const ph = PH(S);
      // 前向：ŷ=θ μ, ν=φ (y-ŷ)
      s.yh = s.th * s.mu;
      s.nu = s.phv * (s.y - s.yh);
      s.SigNu = 0.05 + 0.2 * Math.abs(s.phv);
      s.Lmll = (s.y - s.yh) ** 2 + 0.15 * s.SigNu;
      s.Een = s.nu * s.nu;
      s.Etr = s.SigNu;
      s.L = s.Lmll + rho * s.Een + 0.5 * s.Etr;
      if (s.acc > 0.16) {
        s.acc = 0;
        const eta = 0.12;
        if (ph === 2 || (S.playing && ph !== 3 && s.step % 2 === 0)) {
          // ∇θ: ŷ=θμ, dL/dθ = -2(y-ŷ)μ + chain through ν
          const dth = -2 * (s.y - s.yh) * s.mu + rho * 2 * s.nu * s.phv * (-s.mu);
          s.th -= eta * dth;
        }
        if (ph === 3 || (S.playing && ph !== 2 && s.step % 2 === 1)) {
          const dph = rho * 2 * s.nu * (s.y - s.yh) + 0.5 * 0.2 * Math.sign(s.phv || 1);
          s.phv -= eta * dph;
        }
        s.th = clamp(s.th, -1.5, 2.2);
        s.phv = clamp(s.phv, -1.5, 2.2);
        s.hist.push({ L: s.L, th: s.th, ph: s.phv, Lmll: s.Lmll, Een: s.Een });
        if (s.hist.length > 60) s.hist.shift();
        s.step++;
      }
      S.metrics.ρ = rho;
      S.metrics.L = s.L;
      S.metrics.LMLL = s.Lmll;
      S.metrics["‖μν‖²"] = s.Een;
      S.metrics["TrΣν"] = s.Etr;
      S.metrics.θ = s.th;
      S.metrics.φ = s.phv;
    },
    draw(ctx, S, T, ph) {
      const s = S.sim;
      banner(ctx, S, T, ph);
      // 前向块
      const y0 = 70;
      const blocks = [
        { lab: "前向 ŷ, ν", sub: "ŷ=" + s.yh.toFixed(2) + "  ν=" + s.nu.toFixed(2), hi: ph === 0, c: T.c2 },
        { lab: "损失三块", sub: "L=" + s.L.toFixed(3), hi: ph === 1, c: T.c5 },
        { lab: "更新 θ 生成", sub: "θ=" + s.th.toFixed(2), hi: ph === 2, c: T.c3 },
        { lab: "更新 φ 控制", sub: "φ=" + s.phv.toFixed(2), hi: ph === 3, c: T.c7 },
      ];
      blocks.forEach((b, i) => {
        const x = 16 + i * ((S.W - 24) / 4);
        roundchip(ctx, x, y0, (S.W - 36) / 4 - 8, 58, col(b.c, b.hi ? 0.22 : 0.08), b.hi ? b.c : T.line);
        ctx.fillStyle = T.tx;
        ctx.font = FONTB;
        ctx.fillText(b.lab, x + 8, y0 + 22);
        ctx.font = FONTSM;
        ctx.fillStyle = T.mu;
        ctx.fillText(b.sub, x + 8, y0 + 42);
        if (i < 3) arrow(ctx, x + (S.W - 36) / 4 - 10, y0 + 29, x + (S.W - 36) / 4 + 2, y0 + 29, T.mu, 1.2);
      });
      // 三块损失条
      const bx = 24, by = 148, bw = S.W - 48, bh = 54;
      const tot = s.Lmll + s.rho * s.Een + 0.5 * s.Etr + 1e-6;
      const w1 = (s.Lmll / tot) * bw, w2 = ((s.rho * s.Een) / tot) * bw, w3 = bw - w1 - w2;
      ctx.fillStyle = col(T.c2, ph === 1 ? 1 : 0.45);
      ctx.fillRect(bx, by, w1, bh);
      ctx.fillStyle = col(T.c6, ph === 1 ? 1 : 0.45);
      ctx.fillRect(bx + w1, by, w2, bh);
      ctx.fillStyle = col(T.c7, ph === 1 ? 1 : 0.45);
      ctx.fillRect(bx + w1 + w2, by, w3, bh);
      ctx.fillStyle = T.tx;
      ctx.font = FONTSM;
      ctx.fillText("似然 L_MLL", bx + 8, by + 20);
      ctx.fillText("ρ‖μν‖²", bx + w1 + 8, by + 20);
      ctx.fillText("Tr(Σν)", bx + w1 + w2 + 8, by + 20);
      // 损失曲线
      const hb = { x: 24, y: by + 70, w: S.W - 48, h: S.H - (by + 110) };
      ctx.strokeStyle = T.line;
      ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
      if (s.hist.length > 1) {
        let mx = 0.01;
        for (let i = 0; i < s.hist.length; i++) mx = Math.max(mx, s.hist[i].L);
        const m = mapXY(hb, 0, s.hist.length - 1, 0, mx * 1.1);
        ctx.beginPath();
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 2;
        s.hist.forEach((h, i) => {
          const x = m.X(i), y = m.Y(h.L);
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.beginPath();
        ctx.strokeStyle = T.c3;
        s.hist.forEach((h, i) => {
          const x = m.X(i), y = m.Y(Math.abs(h.th));
          if (i) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.fillStyle = T.mu;
      ctx.font = FONTSM;
      ctx.fillText("黄: 总损失 L    绿: |θ|    交替下降（ADMM/EM 精神）", hb.x + 8, hb.y + 14);
    },
  });

  G.__CH6_IDS = IDS.slice();
  G.__CH6_READY = true;
})(typeof window !== "undefined" ? window : globalThis);
