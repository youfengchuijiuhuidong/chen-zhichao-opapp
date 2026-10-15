#!/usr/bin/env python3
"""Replace weak ch4 operator bodies with draw-self-contained versions."""
from pathlib import Path
import re

SRC = Path("/workspace/opapp/app/js/anim/ch4.js")

OPS = {}

OPS["particle_ode"] = r'''
  OP.particle_ode = {
    init(S) {
      const n = 7;
      S.sim = {
        z0: Array.from({ length: n }, (_, i) => {
          const a = (i / n) * TAU + 0.2;
          const r = 0.55 + 0.22 * (i % 3);
          return { x: r * Math.cos(a), y: r * Math.sin(a) };
        }),
        acc: 0
      };
    },
    tick(S, dt) {
      S.sim.acc += dt * (0.35 + 0.9 * sl(S, "uamp", 0.4));
    },
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1);
      const Tfin = ph === 0 ? 0.22 : ph === 1 ? 1.55 : 3.15;
      const dt = 0.045;
      function integ(z0, ua, Tf) {
        const pts = [{ x: z0.x, y: z0.y }];
        let x = z0.x, y = z0.y;
        for (let t = 0; t < Tf; t += dt) {
          const f = fspiral({ x, y }, ua);
          x += dt * f.x; y += dt * f.y;
          pts.push({ x, y });
        }
        return pts;
      }
      const traces = S.sim.z0.map(z => integ(z, uamp, Tfin));
      const traces0 = ph >= 2 ? S.sim.z0.map(z => integ(z, 0, Tfin)) : null;
      const box = { x: 16, y: 28, w: W - 32, h: H - 54 };
      axes(ctx, box, [-1.7, 1.7], [-1.7, 1.7], T, "x", "y");
      const sx = (x) => box.x + ((x + 1.7) / 3.4) * box.w;
      const sy = (y) => box.y + box.h - ((y + 1.7) / 3.4) * box.h;
      if (ph >= 1) {
        // 速度场采样
        ctx.save();
        ctx.globalAlpha = 0.45;
        for (let i = -3; i <= 3; i++) {
          for (let j = -3; j <= 3; j++) {
            const x = i * 0.42, y = j * 0.42;
            const f = fspiral({ x, y }, uamp);
            const px = sx(x), py = sy(y);
            ctx.strokeStyle = T.c4;
            ctx.lineWidth = 1.1;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + f.x * 18, py - f.y * 18);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
      traces.forEach((tr, i) => {
        ctx.strokeStyle = mix(T.c1, T.c3, i / 7);
        ctx.lineWidth = 1.6;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        tr.forEach((p, k) => (k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
        ctx.stroke();
        const last = tr[tr.length - 1];
        ctx.fillStyle = T.c1;
        ctx.beginPath();
        ctx.arc(sx(last.x), sy(last.y), 4, 0, TAU);
        ctx.fill();
        if (traces0) {
          const g = traces0[i];
          ctx.strokeStyle = T.mu;
          ctx.lineWidth = 1;
          ctx.globalAlpha = 0.35;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          g.forEach((p, k) => (k ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      });
      const z = traces[0][traces[0].length - 1];
      const f = fspiral(z, uamp);
      S.metrics["|ẋ|"] = Math.hypot(f.x, f.y);
      S.metrics["uamp"] = uamp;
      S.metrics["T"] = Tfin;
      glow(ctx, 16, 14, ph === 0 ? "ẋ = f(x)+g(x)u  短时切向" : ph === 1 ? "积分流线 ẋ = f+gu" : ph === 2 ? "实线有控 / 虚线 u=0" : "控制仿射扰动改变轨道族", T.c1);
    }
  };
'''

OPS["monte_carlo_expectation"] = r'''
  OP.monte_carlo_expectation = {
    init(S) {
      const rnd = rng(2026);
      const pool = [];
      for (let i = 0; i < 900; i++) pool.push({ x: rnd() * 2 - 1, y: rnd() * 2 - 1 });
      S.sim = { pool, pi: Math.PI };
    },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const n = Math.max(20, Math.round(clamp(sl(S, "n", 120), 20, 400)));
      const pts = S.sim.pool.slice(0, n);
      const inside = pts.filter(p => p.x * p.x + p.y * p.y <= 1);
      const est = 4 * inside.length / n;
      const err = Math.abs(est - Math.PI);
      S.metrics["n"] = n;
      S.metrics["π̂"] = est;
      S.metrics["|误差|"] = err;
      S.metrics["1/√n"] = 1 / Math.sqrt(n);

      if (ph <= 1) {
        const side = Math.min(W * 0.52, H - 70);
        const box = { x: 18, y: 32, w: side, h: side };
        roundRect(ctx, box.x, box.y, box.w, box.h, 8, T.panel, T.grid);
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2, R = box.w * 0.42;
        ctx.strokeStyle = T.c2;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = T.muted;
        ctx.lineWidth = 1;
        ctx.strokeRect(cx - R, cy - R, 2 * R, 2 * R);
        pts.forEach(p => {
          const inC = p.x * p.x + p.y * p.y <= 1;
          ctx.fillStyle = inC ? T.c1 : T.c5;
          ctx.globalAlpha = 0.75;
          ctx.beginPath();
          ctx.arc(cx + p.x * R, cy - p.y * R, 2.2, 0, TAU);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
        const rx = box.x + box.w + 16;
        panel(ctx, rx, 32, W - rx - 12, 88, T);
        glow(ctx, rx + 12, 58, "命中 " + inside.length + " / " + n, T.c1);
        glow(ctx, rx + 12, 82, "π̂ = 4·(圆内/n) = " + est.toFixed(4), T.c3);
        if (ph === 1) {
          const bar = { x: rx, y: 136, w: W - rx - 12, h: 90 };
          panel(ctx, bar.x, bar.y, bar.w, bar.h, T);
          glow(ctx, bar.x + 12, 158, "经验平均 → 期望", T.c4);
          const frac = inside.length / n;
          ctx.fillStyle = T.c1;
          ctx.fillRect(bar.x + 16, bar.y + 50, (bar.w - 32) * frac, 18);
          ctx.strokeStyle = T.c2;
          ctx.strokeRect(bar.x + 16, bar.y + 50, bar.w - 32, 18);
          glow(ctx, bar.x + 16, bar.y + 84, "圆内比例 " + (100 * frac).toFixed(1) + "%  (真值 π/4≈78.5%)", T.mu);
        }
        glow(ctx, 18, 18, ph === 0 ? "均匀采样正方形，着色：圆内/外" : "大数定律：频率 → 面积比", T.c1);
      } else if (ph === 2) {
        // 用不同偏移做 48 次独立估计，画直方图
        const bins = new Array(18).fill(0);
        const lo = 2.4, hi = 3.8, bw = (hi - lo) / bins.length;
        const nBatch = 48;
        for (let b = 0; b < nBatch; b++) {
          const off = (b * 17) % (900 - n);
          let ins = 0;
          for (let i = 0; i < n; i++) {
            const p = S.sim.pool[off + i];
            if (p.x * p.x + p.y * p.y <= 1) ins++;
          }
          const e = 4 * ins / n;
          const k = clamp(Math.floor((e - lo) / bw), 0, bins.length - 1);
          bins[k]++;
        }
        const box = { x: 24, y: 36, w: W - 48, h: H - 70 };
        axes(ctx, box, [lo, hi], [0, Math.max(...bins) * 1.25], T, "π̂", "次数");
        const maxb = Math.max(...bins, 1);
        bins.forEach((c, i) => {
          const x0 = box.x + (i / bins.length) * box.w;
          const bh = (c / maxb) * (box.h * 0.82);
          ctx.fillStyle = T.c3;
          ctx.globalAlpha = 0.85;
          ctx.fillRect(x0 + 1, box.y + box.h - bh, box.w / bins.length - 2, bh);
        });
        ctx.globalAlpha = 1;
        const sx = (v) => box.x + ((v - lo) / (hi - lo)) * box.w;
        ctx.strokeStyle = T.c1;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx(Math.PI), box.y);
        ctx.lineTo(sx(Math.PI), box.y + box.h);
        ctx.stroke();
        glow(ctx, 24, 20, "重复抽样：π̂ 的分布集中在 π（红线）", T.c1);
      } else {
        const box = { x: 28, y: 36, w: W - 52, h: H - 72 };
        axes(ctx, box, [20, 400], [0, 0.55], T, "n", "|π̂−π|");
        const sx = (nn) => box.x + ((nn - 20) / 380) * box.w;
        const sy = (e) => box.y + box.h - (e / 0.55) * box.h;
        ctx.strokeStyle = T.c4;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let nn = 20; nn <= 400; nn += 8) {
          const th = 0.85 / Math.sqrt(nn);
          nn === 20 ? ctx.moveTo(sx(nn), sy(th)) : ctx.lineTo(sx(nn), sy(th));
        }
        ctx.stroke();
        glow(ctx, box.x + 8, box.y + 16, "理论 O(1/√n)", T.c4);
        // 经验误差曲线
        ctx.strokeStyle = T.c1;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        let first = true;
        for (let nn = 20; nn <= 400; nn += 12) {
          const slc = S.sim.pool.slice(0, nn);
          const ins = slc.filter(p => p.x * p.x + p.y * p.y <= 1).length;
          const e = Math.abs(4 * ins / nn - Math.PI);
          first ? ctx.moveTo(sx(nn), sy(e)) : ctx.lineTo(sx(nn), sy(e));
          first = false;
        }
        ctx.stroke();
        ctx.fillStyle = T.c2;
        ctx.beginPath();
        ctx.arc(sx(n), sy(err), 6, 0, TAU);
        ctx.fill();
        glow(ctx, 28, 20, "误差随 n 下降（橙点 = 当前 n）", T.c1);
      }
    }
  };
'''

OPS["finite_horizon_oc_cost"] = r'''
  OP.finite_horizon_oc_cost = {
    init(S) { S.sim = {}; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1);
      const Th = ph === 0 ? 0.45 : ph === 1 ? 1.3 : 2.4;
      const roll = gaussRoll(uamp, Th);
      const xs = linspace(-3.2, 3.2, 180);
      const q = xs.map(x => gauss(x, 0, 1));
      const p = xs.map(x => gauss(x, roll.mu, roll.sig));
      S.metrics["T"] = Th;
      S.metrics["KL"] = roll.kl;
      S.metrics["R"] = roll.R;
      S.metrics["J"] = roll.J;
      const box = { x: 20, y: 32, w: W - 40, h: H - (ph === 3 ? 88 : 58) };
      axes(ctx, box, [-3.2, 3.2], [0, 0.55], T, "x", "密度");
      const sx = (x) => box.x + ((x + 3.2) / 6.4) * box.w;
      const sy = (y) => box.y + box.h - (y / 0.55) * box.h;
      if (ph >= 0) {
        ctx.strokeStyle = T.c5;
        ctx.lineWidth = 2;
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(q[i])) : ctx.moveTo(sx(x), sy(q[i]))));
        ctx.stroke();
        glow(ctx, box.x + 8, box.y + 16, "目标 q", T.c5);
      }
      if (ph >= 1) {
        ctx.strokeStyle = T.c1;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(p[i])) : ctx.moveTo(sx(x), sy(p[i]))));
        ctx.stroke();
        glow(ctx, box.x + 88, box.y + 16, "终端 p_T", T.c1);
      }
      if (ph >= 2) {
        ctx.fillStyle = T.c3;
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        xs.forEach((x, i) => {
          const y = Math.max(p[i], q[i]);
          i ? ctx.lineTo(sx(x), sy(y)) : ctx.moveTo(sx(x), sy(y));
        });
        for (let i = xs.length - 1; i >= 0; i--) ctx.lineTo(sx(xs[i]), sy(Math.min(p[i], q[i])));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
        glow(ctx, box.x + 8, box.y + 36, "KL(p_T‖q)=" + roll.kl.toFixed(3) + "  R=" + roll.R.toFixed(3), T.c3);
      }
      if (ph === 3) {
        glow(ctx, 20, H - 22, "有限时域 J = KL(p_T‖q) + ∫½|u|²  （滑块 uamp 权衡两项）", T.c4);
      } else {
        glow(ctx, 20, 16, ph === 0 ? "只看目标 q" : ph === 1 ? "有限时域把质量推到 p_T" : "终端 KL 与控制能量", T.c1);
      }
    }
  };
'''

OPS["infinite_horizon_oc_cost"] = r'''
  OP.infinite_horizon_oc_cost = {
    init(S) { S.sim = { hist: [] }; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const uamp = clamp(sl(S, "uamp", 0.4), 0, 1);
      const Ts = [0.5, 1.6, 4.0, 9.0];
      const Th = Ts[clamp(ph, 0, 3)];
      const roll = gaussRoll(uamp, Th);
      S.metrics["T"] = Th;
      S.metrics["KL"] = roll.kl;
      S.metrics["R∞≈"] = roll.R;
      S.metrics["J"] = roll.J;
      if (ph < 3) {
        const xs = linspace(-3.2, 3.2, 180);
        const q = xs.map(x => gauss(x, 0, 1));
        const p = xs.map(x => gauss(x, roll.mu, roll.sig));
        const box = { x: 20, y: 32, w: W - 40, h: H - 58 };
        axes(ctx, box, [-3.2, 3.2], [0, 0.55], T, "x", "密度");
        const sx = (x) => box.x + ((x + 3.2) / 6.4) * box.w;
        const sy = (y) => box.y + box.h - (y / 0.55) * box.h;
        ctx.strokeStyle = T.c5; ctx.lineWidth = 2;
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(q[i])) : ctx.moveTo(sx(x), sy(q[i]))));
        ctx.stroke();
        ctx.strokeStyle = T.c1; ctx.lineWidth = 2.2;
        ctx.beginPath();
        xs.forEach((x, i) => (i ? ctx.lineTo(sx(x), sy(p[i])) : ctx.moveTo(sx(x), sy(p[i]))));
        ctx.stroke();
        glow(ctx, 20, 16, ph === 0 ? "短时：p_t 仍接近初值" : ph === 1 ? "中等时域，KL 下降" : "长时域折扣累积  J_∞", T.c1);
        glow(ctx, box.x + 8, box.y + 18, "KL=" + roll.kl.toFixed(3), T.c3);
      } else {
        const box = { x: 28, y: 36, w: W - 52, h: H - 70 };
        axes(ctx, box, [0.2, 10], [0, 2.2], T, "T", "J(T)");
        const sx = (tt) => box.x + ((tt - 0.2) / 9.8) * box.w;
        const sy = (j) => box.y + box.h - (j / 2.2) * box.h;
        ctx.strokeStyle = T.c1; ctx.lineWidth = 2;
        ctx.beginPath();
        let first = true;
        for (let tt = 0.25; tt <= 10; tt += 0.25) {
          const r = gaussRoll(uamp, tt);
          first ? ctx.moveTo(sx(tt), sy(Math.min(2.15, r.J))) : ctx.lineTo(sx(tt), sy(Math.min(2.15, r.J)));
          first = false;
        }
        ctx.stroke();
        ctx.fillStyle = T.c2;
        ctx.beginPath();
        ctx.arc(sx(Th), sy(Math.min(2.15, roll.J)), 6, 0, TAU);
        ctx.fill();
        glow(ctx, 28, 20, "J(T) 随视野拉长趋于稳定（折扣无穷时域）", T.c1);
      }
    }
  };
'''

OPS["info_perturbation_field"] = r'''
  OP.info_perturbation_field = {
    init(S) { S.sim = {}; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const v = clamp(sl(S, "v", 0.7), 0.15, 1.4);
      const snaps = infoSnaps(v, 11, 70, 12);
      const cur = snaps[clamp(ph, 0, 3)];
      const side = Math.min(W - 24, H - 48);
      const box = { x: (W - side) / 2, y: 28, w: side, h: side };
      roundRect(ctx, box.x, box.y, box.w, box.h, 8, T.panel, T.grid);
      const field = ph === 0 ? cur.prior : ph === 1 ? cur.like : cur.post;
      heat2d(ctx, {
        x0: box.x + 8, y0: box.y + 8, w: box.w - 16, h: box.h - 16,
        n: 28, lo: -2.2, hi: 2.2, f: field
      }, T, ph === 1 ? T.c4 : T.c1);
      if (ph >= 2) {
        fieldArrows(ctx, {
          x0: box.x + 8, y0: box.y + 8, w: box.w - 16, h: box.h - 16,
          n: 9, lo: -2.2, hi: 2.2,
          f: (x, y) => {
            const s = cur.score(x, y);
            return { x: v * s.x, y: v * s.y };
          }
        }, T.c2);
      }
      S.metrics["v"] = v;
      S.metrics["KL"] = cur.kl;
      glow(ctx, 16, 16,
        ph === 0 ? "先验密度 p" : ph === 1 ? "似然 ℓ(z)" : ph === 2 ? "后验 π ∝ p·ℓ" : "信息场 u = v ∇log π",
        T.c1);
    }
  };
'''

OPS["info_particle_update"] = r'''
  OP.info_particle_update = {
    init(S) { S.sim = {}; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const v = clamp(sl(S, "v", 0.7), 0.15, 1.4);
      const snaps = infoSnaps(v, 21, 90, 10);
      const cur = snaps[clamp(ph, 0, 3)];
      const side = Math.min(W - 28, H - 52);
      const box = { x: (W - side) / 2, y: 30, w: side, h: side };
      roundRect(ctx, box.x, box.y, box.w, box.h, 8, T.panel, T.grid);
      const x0 = box.x + 10, y0 = box.y + 10, bw = box.w - 20, bh = box.h - 20;
      const lo = -2.2, hi = 2.2;
      const sx = (x) => x0 + ((x - lo) / (hi - lo)) * bw;
      const sy = (y) => y0 + bh - ((y - lo) / (hi - lo)) * bh;
      if (ph === 3) {
        heat2d(ctx, { x0, y0, w: bw, h: bh, n: 24, lo, hi, f: cur.post }, T, T.c3);
      }
      const pts = ph >= 2 ? cur.after : cur.before;
      pts.forEach(p => {
        ctx.fillStyle = ph >= 2 ? T.c1 : T.c5;
        ctx.globalAlpha = 0.8;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), 3.2, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (ph === 1) {
        cur.before.forEach((p, i) => {
          if (i % 2) return;
          const q = cur.after[i];
          ctx.strokeStyle = T.c2;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(sx(p.x), sy(p.y));
          ctx.lineTo(sx(q.x), sy(q.y));
          ctx.stroke();
        });
      }
      S.metrics["v"] = v;
      S.metrics["mean_x"] = cur.mean[0];
      S.metrics["mean_y"] = cur.mean[1];
      S.metrics["KL"] = cur.kl;
      glow(ctx, 16, 16,
        ph === 0 ? "先验粒子" : ph === 1 ? "每粒子沿 u=v∇logπ 推一步" : ph === 2 ? "更新后的粒子云" : "粒子贴近后验热图",
        T.c1);
    }
  };
'''

OPS["forward_euler_discretization"] = r'''
  OP.forward_euler_discretization = {
    init(S) { S.sim = { z0: { x: 1.05, y: 0 } }; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const eps = clamp(sl(S, "eps", 0.2), 0.02, 0.55);
      const omega = 1.15;
      const z0 = S.sim.z0;
      const Tfin = 6.2;
      function eulerPath(h) {
        const pts = [{ x: z0.x, y: z0.y }];
        let x = z0.x, y = z0.y;
        for (let t = 0; t < Tfin; t += h) {
          const nx = x + h * (-omega * y);
          const ny = y + h * (omega * x);
          x = nx; y = ny;
          pts.push({ x, y });
          if (Math.hypot(x, y) > 8) break;
        }
        return pts;
      }
      function rk4Path(h) {
        const pts = [{ x: z0.x, y: z0.y }];
        let x = z0.x, y = z0.y;
        const f = (xx, yy) => ({ dx: -omega * yy, dy: omega * xx });
        for (let t = 0; t < Tfin; t += h) {
          const k1 = f(x, y);
          const k2 = f(x + 0.5 * h * k1.dx, y + 0.5 * h * k1.dy);
          const k3 = f(x + 0.5 * h * k2.dx, y + 0.5 * h * k2.dy);
          const k4 = f(x + h * k3.dx, y + h * k3.dy);
          x += (h / 6) * (k1.dx + 2 * k2.dx + 2 * k3.dx + k4.dx);
          y += (h / 6) * (k1.dy + 2 * k2.dy + 2 * k3.dy + k4.dy);
          pts.push({ x, y });
        }
        return pts;
      }
      function exactPath() {
        const pts = [];
        for (let t = 0; t <= Tfin; t += 0.05) {
          const c = Math.cos(omega * t), s = Math.sin(omega * t);
          pts.push({ x: z0.x * c - z0.y * s, y: z0.x * s + z0.y * c });
        }
        return pts;
      }
      const exact = exactPath();
      const eu = eulerPath(eps);
      const rk = rk4Path(Math.min(eps, 0.2));
      const box = { x: 16, y: 28, w: W - 32, h: H - 54 };
      const lim = ph === 1 ? 3.6 : 2.2;
      axes(ctx, box, [-lim, lim], [-lim, lim], T, "x", "y");
      const sx = (x) => box.x + ((x + lim) / (2 * lim)) * box.w;
      const sy = (y) => box.y + box.h - ((y + lim) / (2 * lim)) * box.h;
      function strokePath(pts, col, lw, dash) {
        ctx.strokeStyle = col;
        ctx.lineWidth = lw;
        ctx.setLineDash(dash || []);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(sx(p.x), sy(p.y)) : ctx.moveTo(sx(p.x), sy(p.y))));
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (ph === 0) {
        strokePath(exact, T.c1, 2.2);
        glow(ctx, 16, 16, "连续旋转 ODE  ẋ = Ωx （精确圆）", T.c1);
      } else if (ph === 1) {
        strokePath(exact, T.mu, 1, [4, 3]);
        strokePath(eu, T.c5, 2);
        glow(ctx, 16, 16, "前向 Euler：步长 ε=" + eps.toFixed(2) + " 半径漂移", T.c5);
      } else if (ph === 2) {
        strokePath(exact, T.mu, 1, [4, 3]);
        strokePath(rk, T.c2, 2.2);
        glow(ctx, 16, 16, "RK4 同 ε：贴近单位圆", T.c2);
      } else {
        strokePath(exact, T.c1, 1.4);
        strokePath(eu, T.c5, 1.8);
        strokePath(rk, T.c2, 1.8);
        glow(ctx, 16, 16, "叠加：Euler 发散 / RK4 守恒", T.c1);
      }
      const eLast = eu[eu.length - 1];
      const rLast = rk[rk.length - 1];
      S.metrics["ε"] = eps;
      S.metrics["|z|_Euler"] = Math.hypot(eLast.x, eLast.y);
      S.metrics["|z|_RK4"] = Math.hypot(rLast.x, rLast.y);
    }
  };
'''

OPS["info_em_m_step"] = r'''
  OP.info_em_m_step = {
    init(S) { S.sim = {}; },
    tick() {},
    draw(ctx, S, T) {
      const { W, H } = S;
      const ph = S.phase | 0;
      const v = clamp(sl(S, "v", 0.7), 0.15, 1.4);
      const rate = clamp(sl(S, "rate", 1), 0.2, 2);
      const snaps = infoSnaps(v, 8, 80, 8);
      const cur = snaps[2];
      const mean = cur.mean;
      const thetaStar = Math.atan2(mean[1], mean[0]);
      const theta = ph === 0 ? 0.15 : ph === 1 ? thetaStar * 0.45 * rate : thetaStar;
      S.metrics["θ"] = theta;
      S.metrics["θ*"] = thetaStar;
      S.metrics["‖μ̂‖"] = Math.hypot(mean[0], mean[1]);
      const box = { x: 18, y: 30, w: Math.min(W - 36, H - 50), h: Math.min(W - 36, H - 50) };
      box.x = (W - box.w) / 2;
      roundRect(ctx, box.x, box.y, box.w, box.h, 8, T.panel, T.grid);
      const lo = -2.2, hi = 2.2;
      const x0 = box.x + 10, y0 = box.y + 10, bw = box.w - 20, bh = box.h - 20;
      const sx = (x) => x0 + ((x - lo) / (hi - lo)) * bw;
      const sy = (y) => y0 + bh - ((y - lo) / (hi - lo)) * bh;
      if (ph === 3) {
        heat2d(ctx, {
          x0, y0, w: bw, h: bh, n: 22, lo, hi,
          f: (x, y) => {
            const c = Math.cos(theta), s = Math.sin(theta);
            const xr = c * x + s * y;
            return Math.exp(-0.5 * ((xr - 1.1) * (xr - 1.1) / 0.25 + ( -s * x + c * y) * (-s * x + c * y) / 0.7));
          }
        }, T, T.c4);
      }
      cur.after.forEach(p => {
        ctx.fillStyle = T.c1;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.arc(sx(p.x), sy(p.y), 3, 0, TAU);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (ph >= 1) {
        ctx.strokeStyle = T.c2;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(sx(0), sy(0));
        ctx.lineTo(sx(mean[0]), sy(mean[1]));
        ctx.stroke();
        glow(ctx, sx(mean[0]) + 6, sy(mean[1]), "μ̂", T.c2);
      }
      ctx.strokeStyle = T.c3;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sx(0), sy(0));
      ctx.lineTo(sx(1.6 * Math.cos(theta)), sy(1.6 * Math.sin(theta)));
      ctx.stroke();
      glow(ctx, 16, 16,
        ph === 0 ? "粒子云（E 步样本）" : ph === 1 ? "经验均值 μ̂" : ph === 2 ? "M 步：θ ← atan2(μ̂)" : "解码器随 θ 对齐后验",
        T.c1);
    }
  };
'''

# extra small fix for quantization empty slice
FIX_QTZ = (
    "const xs = M <= 0 ? [] : S.sim.xs.slice(0, M);",
)


def replace_op(src: str, name: str, body: str) -> str:
    pat = re.compile(r"  OP\." + re.escape(name) + r" = \{.*?\n  \};\n", re.S)
    m = pat.search(src)
    if not m:
        raise SystemExit(f"missing OP.{name}")
    print(f"replace {name}: {m.end()-m.start()} -> {len(body)}")
    return src[: m.start()] + body.strip() + "\n\n" + src[m.end() :]


def main():
    t = SRC.read_text(encoding="utf-8")
    t = t.replace(
        "const xs = S.sim.xs.slice(0, Math.max(1, M));",
        "const xs = M <= 0 ? [] : S.sim.xs.slice(0, M);",
        1,
    )
    for name, body in OPS.items():
        t = replace_op(t, name, body)
    SRC.write_text(t, encoding="utf-8")
    print("lines", len(t.splitlines()))
    # syntax check via node later


if __name__ == "__main__":
    main()
