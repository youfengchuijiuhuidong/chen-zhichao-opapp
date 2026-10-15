/* Interactive canvas demos for every operator. Vanilla JS, no CDN. */
(function (global) {
  "use strict";

  const TWO = Math.PI * 2;
  const FONT_STACK = global.OP_FONT_STACK || '"Noto Sans SC","Noto Sans CJK SC","WenQuanYi Micro Hei","WenQuanYi Zen Hei","Source Han Sans SC","Droid Sans Fallback","PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif';
  global.OP_FONT_STACK = FONT_STACK;
  const CHROME_H = 18; /* 底部播放条高度，专属动画内容应避开此带 */
  const PHASE_SEC = 2.4;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;
  const hypot = Math.hypot;
  const SEM = {
    state: "#5b8cff",
    ctrl: "#fbbf24",
    adj: "#c084fc",
    energy: "#34d399",
    base: "#8b98b5",
  };
  function ensureCjkFont(ctx) {
    const f = ctx.font || "12px sans-serif";
    if (/Noto|WenQuanYi|Source Han|Droid Sans Fallback|PingFang|YaHei|Hiragino|OP_FONT/.test(f)) return;
    ctx.font = f.replace(/\b(sans-serif|serif|monospace|system-ui|ui-sans-serif|Arial|Helvetica)\b/gi, FONT_STACK);
  }
  function randn() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TWO * v);
  }
  const gauss = (x, m, s) => Math.exp(-0.5 * ((x - m) / s) ** 2) / (s * Math.sqrt(TWO));
  function softmax(a) {
    const m = Math.max(...a);
    const e = a.map((x) => Math.exp(x - m));
    const z = e.reduce((p, q) => p + q, 0);
    return e.map((x) => x / z);
  }
  function css(name, fb) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fb;
  }
  function theme() {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      dark,
      bg: css("--bg", "#0b1220"),
      tx: css("--tx", "#e8eef9"),
      mu: css("--mu", "#8b98b5"),
      c2: css("--c2", "#5b8cff"),
      c3: css("--c3", "#2dd4bf"),
      c4: css("--c4", "#a3e635"),
      c5: css("--c5", "#fbbf24"),
      c6: css("--c6", "#fb7185"),
      c7: css("--c7", "#c084fc"),
      line: css("--line", "#243049"),
      state: SEM.state,
      ctrl: SEM.ctrl,
      adj: SEM.adj,
      energy: SEM.energy,
      base: SEM.base,
    };
  }

  function markHit(S, key, spec) {
    if (!S || !key || !spec) return;
    if (!S.hitRegions) S.hitRegions = {};
    (S.hitRegions[key] || (S.hitRegions[key] = [])).push(spec);
  }
  global.OP_MARK_HIT = markHit;

  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r || 8, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function glowRegion(ctx, r, col, pulse) {
    let x, y, w, h;
    if (r.type === "box" && r.box) {
      x = r.box.x0; y = r.box.y0; w = r.box.w; h = r.box.h;
    } else if (r.type === "rect" || r.w != null) {
      x = r.x; y = r.y; w = r.w; h = r.h;
    } else if (r.type === "circle") {
      ctx.save();
      ctx.shadowColor = col;
      ctx.shadowBlur = 10 + 22 * pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = 2 + 2.4 * pulse;
      ctx.globalAlpha = 0.4 + 0.5 * pulse;
      ctx.beginPath();
      ctx.arc(r.x, r.y, (r.r || 10) + 5 * pulse, 0, TWO);
      ctx.stroke();
      ctx.restore();
      return;
    } else {
      return;
    }
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 12 + 20 * pulse;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.2 + 2.6 * pulse;
    ctx.globalAlpha = 0.38 + 0.5 * pulse;
    rrPath(ctx, x, y, w, h, 10);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.07 + 0.1 * pulse;
    ctx.fillStyle = col;
    ctx.fill();
    ctx.restore();
  }

  function paintHover(ctx, S, T) {
    const h = S.hover;
    if (!h) return;
    const pulse = 0.5 + 0.5 * Math.sin((performance.now ? performance.now() : S.t * 1000) / 220);
    const colorOf = { state: T.state, ctrl: T.ctrl, adj: T.adj, energy: T.energy };
    const keys = h.targets || [];
    ctx.save();
    let painted = false;
    keys.forEach((k) => {
      const col = colorOf[k] || T.c2;
      const regions = (S.hitRegions && S.hitRegions[k]) || [];
      regions.forEach((r) => {
        painted = true;
        glowRegion(ctx, r, col, pulse);
      });
    });
    const col = colorOf[keys[0]] || T.c5;
    if (!painted) {
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.28 + 0.42 * pulse;
      ctx.lineWidth = 2.4 + 2.4 * pulse;
      rrPath(ctx, 6, 6, S.W - 12, S.H - CHROME_H - 12, 12);
      ctx.stroke();
    }
    const label = h.label || (keys.join(" / ") || "高亮");
    ctx.globalAlpha = 0.94;
    ctx.font = "12px " + FONT_STACK;
    const tw = Math.min(S.W - 24, ctx.measureText("聚焦 · " + label).width + 16);
    const bx = 10, by = 8;
    ctx.fillStyle = T.dark ? "rgba(7,13,24,0.88)" : "rgba(255,255,255,0.9)";
    rrPath(ctx, bx, by, tw, 22, 6);
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText("聚焦 · " + label, bx + 8, by + 11);
    ctx.restore();
  }

  function mount(canvas, opts) {
    const captionEl = opts.captionEl;
    const metricsEl = opts.metricsEl;
    const stepsEl = opts.stepsEl;
    const timelineEl = opts.timelineEl;
    const op = opts.operator;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const _fillText = ctx.fillText.bind(ctx);
    const _strokeText = ctx.strokeText.bind(ctx);
    const _measureText = ctx.measureText.bind(ctx);
    ctx.fillText = function (t, x, y, m) {
      ensureCjkFont(this);
      return m == null ? _fillText(t, x, y) : _fillText(t, x, y, m);
    };
    ctx.strokeText = function (t, x, y, m) {
      ensureCjkFont(this);
      return m == null ? _strokeText(t, x, y) : _strokeText(t, x, y, m);
    };
    ctx.measureText = function (t) {
      ensureCjkFont(this);
      return _measureText(t);
    };
    const sliders = {};
    (op.sliders || []).forEach((s) => { sliders[s.key] = s.value; });
    const S = {
      playing: true,
      t: 0,
      frame: 0,
      speed: 1,
      demo: op.demo || "svgd",
      steps: op.steps || ["演示运行中"],
      phase: 0,
      sliders,
      sim: {},
      W: 640,
      H: 360,
      dpr: 1,
      metrics: {},
      opId: op.id || "",
      opName: op.name || "",
      chromeH: CHROME_H,
      phaseSec: PHASE_SEC,
      cycleFrames: Math.max(1, (op.steps || ["演示"]).length) * 72,
    };
    let raf = 0;
    let last = 0;
    let dead = false;
    let hiddenPause = false;

    function resize() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      S.W = Math.max(320, r.width || 640);
      S.H = Math.max(220, r.height || 360);
      S.dpr = dpr;
      canvas.width = Math.floor(S.W * dpr);
      canvas.height = Math.floor(S.H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    const DEMOS = registry();
    const kind = DEMOS[S.demo] ? S.demo : "svgd";
    const custom = (window.OP_ANIMS || {})[S.opId];
    const impl = custom || DEMOS[kind];
    impl.init(S);

    function tick(dt) {
      S.t += dt;
      S.frame++;
      const n = S.steps.length || 1;
      S.phase = Math.floor(S.t / S.phaseSec) % n;
      S.cycleFrames = n * 72;
      try { impl.tick(S, dt); } catch (e) { S.metrics.err = String(e.message || e); }
    }
    function syncTimeline() {
      if (!timelineEl) return;
      const n = Math.max(1, S.steps.length);
      const cycle = n * S.phaseSec;
      const pos = (S.t % cycle) / cycle;
      const frac = (S.t / S.phaseSec) % 1;
      if (!timelineEl.dataset.ready) {
        timelineEl.innerHTML = S.steps.map((s, i) =>
          `<button type="button" class="tl-phase" data-phase="${i}" title="${String(s).replace(/"/g, "&quot;")}">${i + 1}</button>`
        ).join("") + `<div class="tl-fill"></div>`;
        timelineEl.dataset.ready = "1";
        timelineEl.style.setProperty("--n", String(n));
      }
      const fill = timelineEl.querySelector(".tl-fill");
      if (fill) fill.style.width = (pos * 100).toFixed(2) + "%";
      timelineEl.querySelectorAll(".tl-phase").forEach((b, i) => b.classList.toggle("on", i === S.phase));
      timelineEl.setAttribute("aria-valuenow", String(S.phase + frac));
    }
    function drawChrome(ctx, S, T) {
      const n = Math.max(1, S.steps.length);
      const barH = 5;
      const y = S.H - 9;
      const x0 = 10, W = S.W - 20;
      const w = W / n;
      const frac = (S.t / S.phaseSec) % 1;
      ctx.save();
      ctx.fillStyle = T.dark ? "rgba(11,18,32,0.72)" : "rgba(244,246,251,0.78)";
      ctx.fillRect(0, S.H - CHROME_H, S.W, CHROME_H);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i === S.phase ? T.ctrl : (T.dark ? "#1c2740" : "#d5dced");
        ctx.fillRect(x0 + i * w, y, Math.max(1, w - 2), barH);
      }
      ctx.fillStyle = T.state;
      ctx.fillRect(x0 + S.phase * w, y, Math.max(2, (w - 2) * frac), barH);
      const playX = x0 + S.phase * w + (w - 2) * frac;
      ctx.fillStyle = T.energy;
      ctx.fillRect(playX - 1, y - 3, 2, barH + 6);
      ctx.restore();
    }
    function syncForceFlags() {
      const n = Math.max(1, S.steps.length);
      const ph = ((S.phase % n) + n) % n;
      S.phase = ph;
      global.__CH3_FORCE_PHASE = ph;
      global.__CH6_FORCE = { id: "*", phase: ph, frac: (S.t / S.phaseSec) % 1 };
    }
    function expose() {
      global.__OP_PLAYER = {
        S,
        custom: !!custom,
        demo: kind,
        hit: !!custom,
        chromeH: CHROME_H,
        redraw: draw,
        setHover(spec) {
          S.hover = spec || null;
          const wrap = canvas.parentElement;
          if (wrap) wrap.classList.toggle("is-hover", !!spec);
        },
        setPhase(p) {
          S.playing = false;
          const n = Math.max(1, S.steps.length);
          S.phase = ((p % n) + n) % n;
          S.t = S.phase * S.phaseSec + 1.15;
          syncForceFlags();
          try { impl.tick(S, 0.02); } catch (e) { S.metrics.err = String(e.message || e); }
          draw();
        },
        nextPhase() {
          const n = Math.max(1, S.steps.length);
          this.setPhase(S.phase + 1);
          S.playing = false;
        },
        setSlider(k, v) {
          if (k === "speed") S.speed = v;
          else S.sliders[k] = v;
          try { impl.tick(S, 0.02); } catch (e) { S.metrics.err = String(e.message || e); }
          draw();
        },
      };
    }
    function draw() {
      const T = theme();
      S.hitRegions = {};
      ctx.save();
      ctx.font = "12px " + FONT_STACK;
      ctx.fillStyle = T.dark ? "#070d18" : "#eef2fb";
      ctx.fillRect(0, 0, S.W, S.H);
      try { impl.draw(ctx, S, T); } catch (e) {
        ctx.fillStyle = T.c6;
        ctx.font = "13px " + FONT_STACK;
        ctx.fillText("动画错误: " + e.message, 16, 28);
      }
      paintHover(ctx, S, T);
      drawChrome(ctx, S, T);
      ctx.restore();
      if (captionEl) captionEl.textContent = (S.phase + 1) + "/" + S.steps.length + "  " + (S.steps[S.phase] || "");
      if (stepsEl) {
        const items = stepsEl.querySelectorAll("li");
        items.forEach((li, i) => li.classList.toggle("on", i === S.phase));
      }
      if (metricsEl) {
        const parts = Object.keys(S.metrics).map((k) => k + " " + (typeof S.metrics[k] === "number" ? S.metrics[k].toFixed(3) : S.metrics[k]));
        metricsEl.innerHTML = parts.map((p) => "<span>" + p + "</span>").join("");
      }
      syncTimeline();
    }
    function loop(ts) {
      if (dead) return;
      if (document.hidden) {
        last = 0;
        raf = requestAnimationFrame(loop);
        return;
      }
      if (!last) last = ts;
      const dt = Math.min(0.033, (ts - last) / 1000) * S.speed;
      last = ts;
      if (S.playing) tick(dt);
      draw();
      raf = requestAnimationFrame(loop);
    }
    function onVis() {
      if (document.hidden) {
        hiddenPause = S.playing;
        S.playing = false;
        last = 0;
      } else {
        last = 0;
        if (hiddenPause) S.playing = true;
        hiddenPause = false;
      }
    }
    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);
    resize();
    expose();
    document.addEventListener("visibilitychange", onVis);
    raf = requestAnimationFrame(loop);

    return {
      play() { S.playing = true; hiddenPause = false; },
      pause() { S.playing = false; hiddenPause = false; },
      step() { S.playing = false; tick(0.08); draw(); },
      nextPhase() {
        const n = Math.max(1, S.steps.length);
        S.playing = false;
        S.phase = (S.phase + 1) % n;
        S.t = S.phase * S.phaseSec;
        syncForceFlags();
        try { impl.tick(S, 0.02); } catch (e) { S.metrics.err = String(e.message || e); }
        draw();
      },
      setPhase(p) {
        S.playing = false;
        const n = Math.max(1, S.steps.length);
        S.phase = ((p % n) + n) % n;
        S.t = S.phase * S.phaseSec;
        syncForceFlags();
        try { impl.tick(S, 0.02); } catch (e) { S.metrics.err = String(e.message || e); }
        draw();
      },
      reset() { S.t = 0; S.frame = 0; S.phase = 0; impl.init(S); S.cycleFrames = Math.max(1, S.steps.length) * 72; draw(); },
      setParam(k, v) {
        if (k === "speed") {
          S.speed = v;
          return;
        }
        S.sliders[k] = v;
        try { impl.tick(S, 0.02); } catch (e) { S.metrics.err = String(e.message || e); }
        draw();
      },
      isPlaying() { return S.playing; },
      setHover(spec) {
        if (dead) return;
        S.hover = spec || null;
        const wrap = canvas.parentElement;
        if (wrap) wrap.classList.toggle("is-hover", !!spec);
      },
      destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        ro.disconnect();
        document.removeEventListener("visibilitychange", onVis);
        if (global.__OP_PLAYER && global.__OP_PLAYER.S === S) global.__OP_PLAYER = null;
      },
    };
  }

  function registry() {
    const R = {};
    function add(names, spec) {
      names.forEach((n) => { R[n] = spec; });
    }

    /* ---------- helpers drawn on ctx ---------- */
    function plot1d(ctx, W, H, fn, color, pad) {
      pad = pad || { l: 36, r: 16, t: 18, b: 28 };
      const x0 = pad.l, x1 = W - pad.r, y0 = pad.t, y1 = H - pad.b;
      let mn = Infinity, mx = -Infinity;
      const N = 120, ys = [];
      for (let i = 0; i <= N; i++) {
        const x = -3 + 6 * i / N;
        const y = fn(x);
        ys.push(y);
        if (y < mn) mn = y;
        if (y > mx) mx = y;
      }
      const sp = mx - mn || 1;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const px = x0 + (x1 - x0) * i / N;
        const py = y1 - (ys[i] - mn) / sp * (y1 - y0 - 8);
        if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
      return { x0, x1, y0, y1, mn, mx, mapX: (x) => x0 + (x + 3) / 6 * (x1 - x0), mapY: (y) => y1 - (y - mn) / sp * (y1 - y0 - 8) };
    }
    function cloud(ctx, pts, color, r) {
      ctx.fillStyle = color;
      pts.forEach((p) => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, r || 3.2, 0, TWO);
        ctx.fill();
      });
    }
    function arrow(ctx, x, y, dx, dy, color) {
      const L = hypot(dx, dy);
      if (L < 1e-6) return;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
      const a = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(x + dx - 7 * Math.cos(a - 0.4), y + dy - 7 * Math.sin(a - 0.4));
      ctx.lineTo(x + dx - 7 * Math.cos(a + 0.4), y + dy - 7 * Math.sin(a + 0.4));
      ctx.closePath();
      ctx.fill();
    }
    function label(ctx, text, x, y, T, maxW) {
      let px = 12;
      ctx.fillStyle = T.mu;
      ctx.font = px + "px " + FONT_STACK;
      const cap = maxW != null ? maxW : 560;
      while (px > 8 && ctx.measureText(text).width > cap) {
        px -= 1;
        ctx.font = px + "px " + FONT_STACK;
      }
      let t = String(text || "");
      if (ctx.measureText(t).width > cap) {
        while (t.length > 1 && ctx.measureText(t + "…").width > cap) t = t.slice(0, -1);
        t += "…";
      }
      ctx.fillText(t, x, y);
    }
    function simplexXY(a, b, c, cx, cy, sc) {
      const x = cx + (b - a) * sc;
      const y = cy + (Math.sqrt(3) / 2) * (2 * c - a - b) * sc * 0.9;
      return { x, y };
    }
    function ellipse(ctx, cx, cy, rx, ry, rot, color) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot || 0);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, TWO);
      ctx.stroke();
      ctx.restore();
    }

    /* mixture / ELBO-ish 1d densities */
    add(["mixture"], {
      init(S) {
        S.sim.xs = Array.from({ length: 80 }, () => 0);
      },
      tick(S) {
        const mix = S.sliders.mix != null ? S.sliders.mix : 0.55;
        S.sim.xs = S.sim.xs.map(() => (Math.random() < mix ? randn() * 0.45 - 1.1 : randn() * 0.5 + 1.15));
        S.metrics.mix = mix;
      },
      draw(ctx, S, T) {
        const mix = S.sliders.mix != null ? S.sliders.mix : 0.55;
        const m = plot1d(ctx, S.W, S.H, (x) => mix * gauss(x, -1.1, 0.45) + (1 - mix) * gauss(x, 1.15, 0.5), T.c2);
        plot1d(ctx, S.W, S.H, (x) => mix * gauss(x, -1.1, 0.45), T.c3);
        plot1d(ctx, S.W, S.H, (x) => (1 - mix) * gauss(x, 1.15, 0.5), T.c6);
        S.sim.xs.forEach((x) => {
          ctx.fillStyle = x < 0 ? T.c3 : T.c6;
          ctx.beginPath();
          ctx.arc(m.mapX(x), m.y1 - 6, 3, 0, TWO);
          ctx.fill();
        });
        label(ctx, "P(x)=∫ P(x|z)P(z)dz  边缘可以多峰", 40, 20, T);
      },
    });

    add(["elbo"], {
      init(S) { S.sim.gap = 1.2; S.sim.th = -1; },
      tick(S, dt) {
        const fit = S.sliders.beta != null ? S.sliders.beta : 0.55;
        S.sim.th = -1.4 + 1.2 * (0.5 + 0.5 * Math.sin(S.t * 0.6));
        const q = clamp(0.2 + 0.75 * fit + 0.08 * Math.sin(S.t * 1.1), 0.05, 0.98);
        S.sim.gap = 1.1 * (1 - q);
        S.sim.elbo = Math.exp(-S.sim.th * S.sim.th) - S.sim.gap;
        S.sim.ll = Math.exp(-S.sim.th * S.sim.th);
        S.metrics.ELBO = S.sim.elbo;
        S.metrics.KL间隙 = S.sim.gap;
      },
      draw(ctx, S, T) {
        const { W, H } = S;
        const x0 = 50, x1 = W - 24, y0 = 24, y1 = H - 36;
        function X(t) { return x0 + (t + 1.6) / 3.2 * (x1 - x0); }
        function Y(v) { return y1 - v * (y1 - y0) * 0.85; }
        ctx.strokeStyle = T.c2; ctx.lineWidth = 2; ctx.beginPath();
        for (let t = -1.6; t <= 1.6; t += 0.04) {
          const v = Math.exp(-t * t);
          if (t === -1.6) ctx.moveTo(X(t), Y(v)); else ctx.lineTo(X(t), Y(v));
        }
        ctx.stroke();
        ctx.strokeStyle = T.c4; ctx.beginPath();
        for (let t = -1.6; t <= 1.6; t += 0.04) {
          const v = Math.exp(-t * t) - S.sim.gap;
          if (t === -1.6) ctx.moveTo(X(t), Y(v)); else ctx.lineTo(X(t), Y(v));
        }
        ctx.stroke();
        ctx.fillStyle = T.c6;
        ctx.beginPath(); ctx.arc(X(S.sim.th), Y(S.sim.elbo), 6, 0, TWO); ctx.fill();
        label(ctx, "蓝: log p(x)   绿: ELBO   间隙=KL", 50, 18, T);
        markHit(S, "energy", { type: "rect", x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        markHit(S, "state", { type: "rect", x: x0, y: y0, w: x1 - x0, h: (y1 - y0) * 0.55 });
      },
    });

    add(["jensen"], {
      init(S) { S.sim.t = 0.3; },
      tick(S) {
        const tp = S.sliders.tpos;
        S.sim.t = tp != null ? clamp(tp + 0.12 * Math.sin(S.t * 1.4), 0.02, 0.98) : (0.5 + 0.5 * Math.sin(S.t * 0.8));
      },
      draw(ctx, S, T) {
        /* plot1d samples x∈[-3,3]; keep log argument strictly positive */
        const f = (x) => Math.log(Math.max(0.08, 1.6 + x));
        const m = plot1d(ctx, S.W, S.H, f, T.c2);
        const a = -1.2, b = 1.6;
        ctx.strokeStyle = T.c5; ctx.setLineDash([6, 4]); ctx.beginPath();
        ctx.moveTo(m.mapX(a), m.mapY(f(a))); ctx.lineTo(m.mapX(b), m.mapY(f(b))); ctx.stroke();
        ctx.setLineDash([]);
        const t = S.sim.t;
        const xm = lerp(a, b, t);
        const chord = lerp(f(a), f(b), t);
        ctx.fillStyle = T.c6;
        ctx.beginPath(); ctx.arc(m.mapX(xm), m.mapY(f(xm)), 5, 0, TWO); ctx.fill();
        ctx.fillStyle = T.c5;
        ctx.beginPath(); ctx.arc(m.mapX(xm), m.mapY(chord), 5, 0, TWO); ctx.fill();
        S.metrics.gap = chord - f(xm);
        label(ctx, "凹函数 log：绿点在曲线上，黄点在弦上（弦更高）", 28, 20, T);
      },
    });

    add(["kl"], {
      init(S) { S.sim.sep = 1; },
      tick(S) {
        const base = S.sliders.sep != null ? S.sliders.sep : 1;
        S.sim.sep = base + 0.22 * Math.sin(S.t * 0.9);
        const s = S.sim.sep;
        S.metrics.KL_QP = 0.5 * s * s;
        S.metrics.KL_PQ = 0.5 * s * s;
      },
      draw(ctx, S, T) {
        const s = S.sim.sep;
        plot1d(ctx, S.W, S.H, (x) => gauss(x, -s / 2, 0.55), T.c2);
        plot1d(ctx, S.W, S.H, (x) => gauss(x, s / 2, 0.55), T.c6);
        label(ctx, "KL 不对称；支撑拉开时迅速变大", 40, 20, T);
      },
    });

    add(["varfit"], {
      init(S) {
        S.sim.q = { m: -1.8, s: 0.45 };
        S.sim.cycle = 0;
        S.sim.xs = Array.from({ length: 28 }, () => -1.8);
      },
      tick(S, dt) {
        const rate = S.sliders.rate != null ? S.sliders.rate : 0.8;
        const cyc = Math.floor(S.t / 4.0);
        if (cyc !== S.sim.cycle) {
          S.sim.cycle = cyc;
          S.sim.q.m = (cyc % 2 ? 1.85 : -1.85);
          S.sim.q.s = 0.32;
        }
        const tgtM = 0.15 + 1.05 * Math.sin(S.t * 1.15);
        S.sim.q.m += (tgtM - S.sim.q.m) * dt * 2.4 * rate;
        S.sim.q.s += ((0.55 + 0.45 * Math.sin(S.t * 1.6)) - S.sim.q.s) * dt * 2.2 * rate;
        S.sim.xs = S.sim.xs.map(() => S.sim.q.m + S.sim.q.s * randn());
        S.metrics.mean = S.sim.q.m;
        S.metrics.std = S.sim.q.s;
        S.metrics.KL示意 = Math.abs(S.sim.q.m) + Math.abs(S.sim.q.s - 0.7);
      },
      draw(ctx, S, T) {
        const mix = (x) => 0.5 * gauss(x, -1.1, 0.35) + 0.5 * gauss(x, 1.2, 0.4);
        const m = plot1d(ctx, S.W, S.H, mix, T.mu);
        plot1d(ctx, S.W, S.H, (x) => gauss(x, S.sim.q.m, S.sim.q.s), T.c2);
        S.sim.xs.forEach((x) => {
          ctx.fillStyle = T.c5;
          ctx.beginPath();
          ctx.arc(m.mapX(clamp(x, -2.9, 2.9)), m.y1 - 8, 4.2, 0, TWO);
          ctx.fill();
        });
        const barH = clamp(S.metrics.KL示意, 0.1, 2.4) / 2.4 * (S.H - 80);
        ctx.fillStyle = T.c6;
        ctx.fillRect(S.W - 28, S.H - 30 - barH, 14, barH);
        label(ctx, "灰: 多峰后验   蓝: 单高斯 Q   黄点: Q 样本   右柱: KL 示意", 28, 20, T);
      },
    });

    add(["emloop"], {
      init(S) { S.sim.L = [0.2]; S.sim.mode = 0; S.sim.acc = 0; },
      tick(S, dt) {
        S.sim.acc += dt;
        if (S.sim.acc > 0.28) {
          S.sim.acc = 0;
          S.sim.mode = 1 - S.sim.mode;
          const last = S.sim.L[S.sim.L.length - 1];
          S.sim.L.push(Math.min(0.98, last + (S.sim.mode ? 0.08 : 0.03) * (1 - last)));
          if (S.sim.L.length > 24) S.sim.L.shift();
        }
        S.metrics.ELBO = S.sim.L[S.sim.L.length - 1];
        S.metrics.步 = S.sim.mode ? "M" : "E";
      },
      draw(ctx, S, T) {
        const { W, H } = S;
        const x0 = 40, y1 = H - 30, h = H - 60;
        ctx.strokeStyle = T.c4; ctx.lineWidth = 2; ctx.beginPath();
        S.sim.L.forEach((v, i) => {
          const x = x0 + i * (W - 70) / 24;
          const y = y1 - v * h;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = S.sim.mode ? T.c5 : T.c2;
        ctx.fillRect(W - 88, 16, 70, 28);
        ctx.fillStyle = "#061018";
        ctx.font = "bold 14px sans-serif";
        ctx.fillText(S.sim.mode ? "M 步" : "E 步", W - 74, 36);
        label(ctx, S.opId === "info_em_m_step"
          ? "InfO-EM：粒子后验固定后，M 步升似然"
          : "交替提升 ELBO", 40, 22, T);
      },
    });

    add(["encoder", "vae"], {
      init(S) {
        S.sim.x = 0.2;
        S.sim.z = 0;
        S.sim.xh = 0.2;
      },
      tick(S, dt) {
        const beta = S.sliders.beta != null ? S.sliders.beta : 1;
        S.sim.x = Math.sin(S.t * 0.7);
        const mu = 0.6 * S.sim.x;
        const sig = 0.25 + 0.15 / (beta + 0.2);
        S.sim.z = mu + sig * Math.sin(S.t * 3);
        S.sim.xh = 0.85 * S.sim.z + 0.1 * Math.sin(S.t * 2);
        S.metrics.recon = Math.abs(S.sim.x - S.sim.xh);
        S.metrics.KL权重 = beta;
      },
      draw(ctx, S, T) {
        const y = S.H / 2;
        const boxes = [
          { lab: "x", x: 70, v: S.sim.x, c: T.c2 },
          { lab: "q_φ(z|x)", x: 220, v: S.sim.z, c: T.c7 },
          { lab: "z", x: 370, v: S.sim.z, c: T.c5 },
          { lab: "x̂", x: 520, v: S.sim.xh, c: T.c3 },
        ];
        boxes.forEach((b, i) => {
          ctx.strokeStyle = b.c; ctx.lineWidth = 2;
          ctx.strokeRect(b.x, y - 36, 90, 72);
          ctx.fillStyle = T.tx; ctx.font = "13px sans-serif";
          ctx.fillText(b.lab, b.x + 10, y - 16);
          ctx.fillStyle = b.c;
          ctx.fillRect(b.x + 12, y + 8, 66 * (0.5 + 0.5 * b.v), 10);
          if (i < boxes.length - 1) arrow(ctx, b.x + 92, y, 34, 0, T.mu);
        });
        label(ctx, "编码 → 重参数 → 解码；KL 权太大易后验塌缩", 40, 24, T);
      },
    });

    add(["gd"], {
      init(S) { S.sim.z = 2.2; S.sim.trace = []; },
      tick(S, dt) {
        const eps = S.sliders.eps != null ? S.sliders.eps : 0.25;
        const g = 2 * S.sim.z;
        S.sim.z -= eps * g * dt * 2.2;
        if (Math.abs(S.sim.z) < 0.04) S.sim.z = (Math.sin(S.t * 0.2) > 0 ? 1 : -1) * 2.15;
        S.sim.trace.push(S.sim.z);
        if (S.sim.trace.length > 80) S.sim.trace.shift();
        S.metrics.z = S.sim.z;
        S.metrics.eps = eps;
      },
      draw(ctx, S, T) {
        const F = (x) => x * x;
        const m = plot1d(ctx, S.W, S.H, F, T.c2);
        const z = clamp(S.sim.z, -2.8, 2.8);
        ctx.fillStyle = T.c6;
        ctx.beginPath(); ctx.arc(m.mapX(z), m.mapY(F(z)), 7, 0, TWO); ctx.fill();
        arrow(ctx, m.mapX(z), m.mapY(F(z)), -40 * Math.sign(z || 1), 8, T.c5);
        label(ctx, "z ← z − ε ∇F    二次碗", 40, 20, T);
      },
    });

    add(["bregman"], {
      init(S) { S.sim.z = 1.4; },
      tick(S) { S.sim.z = 0.5 + 1.2 * (0.5 + 0.5 * Math.sin(S.t * 0.5)); },
      draw(ctx, S, T) {
        const Psi = (x) => 0.5 * x * x;
        const z0 = S.sliders.z0 != null ? S.sliders.z0 : 0.6;
        const m = plot1d(ctx, S.W, S.H, Psi, T.c2);
        const tang = (x) => Psi(z0) + z0 * (x - z0);
        plot1d(ctx, S.W, S.H, tang, T.c5);
        const z = S.sim.z;
        ctx.fillStyle = T.c6;
        ctx.beginPath(); ctx.arc(m.mapX(z), m.mapY(Psi(z)), 6, 0, TWO); ctx.fill();
        ctx.beginPath(); ctx.arc(m.mapX(z0), m.mapY(Psi(z0)), 6, 0, TWO); ctx.fillStyle = T.c3; ctx.fill();
        S.metrics.Bregman = Math.max(0, Psi(z) - tang(z));
        label(ctx, "竖直间隙 = Bregman 散度（泰勒余项）", 36, 20, T);
      },
    });

    add(["mirror", "kems"], {
      init(S) {
        S.sim.a = [0.55, 0.25, 0.2];
        S.sim.stage = 0;
      },
      tick(S, dt) {
        const eta = S.sliders.eta != null ? S.sliders.eta : (S.sliders.eps != null ? S.sliders.eps : 0.25);
        S.sim.stage = Math.floor(S.t / 1.1) % 3;
        const g = [1.2, -0.4, -0.8];
        if (S.sim.stage === 1) {
          const z = S.sim.a.map((v, i) => Math.log(v + 1e-8) - eta * g[i] * dt * 8);
          S.sim.a = softmax(z);
        }
        S.metrics.rowSum = S.sim.a.reduce((p, q) => p + q, 0);
        S.metrics.stage = ["出门 log", "对偶走步", "softmax 回家"][S.sim.stage];
      },
      draw(ctx, S, T) {
        const cx = S.W * 0.38, cy = S.H * 0.58, sc = 110;
        const v = [
          simplexXY(1, 0, 0, cx, cy, sc),
          simplexXY(0, 1, 0, cx, cy, sc),
          simplexXY(0, 0, 1, cx, cy, sc),
        ];
        ctx.strokeStyle = T.line; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(v[1].x, v[1].y); ctx.lineTo(v[2].x, v[2].y); ctx.closePath(); ctx.stroke();
        const p = simplexXY(S.sim.a[0], S.sim.a[1], S.sim.a[2], cx, cy, sc);
        ctx.fillStyle = T.c5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, TWO); ctx.fill();
        /* dual space */
        ctx.strokeStyle = T.c7; ctx.strokeRect(S.W * 0.62, 70, S.W * 0.3, S.H - 120);
        label(ctx, "对偶空间 R^k", S.W * 0.64, 64, T);
        S.sim.a.forEach((a, i) => {
          ctx.fillStyle = [T.c2, T.c3, T.c6][i];
          ctx.fillRect(S.W * 0.66 + i * 28, S.H - 90 - Math.log(a + 0.05) * 40, 18, 8);
        });
        label(ctx, "单纯形 Δ  ·  镜像三拍", 36, 22, T);
      },
    });

    add(["simplex"], {
      init(S) {
        S.sim.pts = Array.from({ length: 12 }, () => softmax([randn(), randn(), randn()]));
      },
      tick(S, dt) {
        const rate = S.sliders.rate != null ? S.sliders.rate : 1;
        const tgt = [0.15 + 0.1 * Math.sin(S.t * 0.4), 0.7, 0.15];
        const zsum = tgt[0] + tgt[1] + tgt[2];
        const tnorm = tgt.map((v) => v / zsum);
        S.sim.pts = S.sim.pts.map((p) => {
          const z = p.map((v, i) => Math.log(v + 1e-8) + dt * 1.4 * rate * (Math.log(tnorm[i] + 1e-8) - Math.log(v + 1e-8)));
          return softmax(z);
        });
      },
      draw(ctx, S, T) {
        const cx = S.W / 2, cy = S.H * 0.62, sc = 130;
        const v = [
          simplexXY(1, 0, 0, cx, cy, sc),
          simplexXY(0, 1, 0, cx, cy, sc),
          simplexXY(0, 0, 1, cx, cy, sc),
        ];
        ctx.strokeStyle = T.c5; ctx.beginPath();
        ctx.moveTo(v[0].x, v[0].y); ctx.lineTo(v[1].x, v[1].y); ctx.lineTo(v[2].x, v[2].y); ctx.closePath(); ctx.stroke();
        S.sim.pts.forEach((a) => {
          const p = simplexXY(a[0], a[1], a[2], cx, cy, sc);
          ctx.fillStyle = T.c2;
          ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, TWO); ctx.fill();
        });
        label(ctx, "行向量活在单纯形上（非负且和为 1）", 36, 22, T);
      },
    });

    add(["w2"], {
      init(S) {
        S.sim.A0 = Array.from({ length: 18 }, (_, i) => ({ x: 90 + (i % 6) * 22, y: 118 + Math.floor(i / 6) * 30 }));
        S.sim.A = S.sim.A0.map((p) => ({ x: p.x, y: p.y }));
        S.sim.B = S.sim.A.map((p) => ({ x: p.x + 170, y: p.y }));
        S.sim.prog = 0;
      },
      tick(S, dt) {
        const sep = S.sliders.sep != null ? S.sliders.sep : 1;
        const wob = 22 * Math.sin(S.t * 2.1);
        S.sim.A = S.sim.A0.map((p, i) => ({
          x: p.x + 16 * Math.sin(S.t * 2.2 + i),
          y: p.y + 14 * Math.cos(S.t * 1.9 + i * 0.5),
        }));
        const pert = /perturbative|w2_perturbative/.test(S.opId || "");
        const reach = pert ? 46 * sep : 120 * sep + 50;
        S.sim.B = S.sim.A.map((p, i) => ({
          x: p.x + reach + 22 * Math.sin(S.t * 1.4 + i),
          y: p.y + 22 * Math.sin(i + S.t * 2.4) + wob,
        }));
        S.sim.prog = (S.sim.prog + dt * 1.35) % 1;
        S.metrics.W2近似 = 0.01 * S.sim.A.reduce((s, p, i) => s + hypot(p.x - S.sim.B[i].x, p.y - S.sim.B[i].y) ** 2, 0);
      },
      draw(ctx, S, T) {
        const a = S.sim.prog;
        const mms = /minimizing_movement/.test(S.opId || "");
        S.sim.A.forEach((p, i) => {
          ctx.strokeStyle = "rgba(251,191,36,.45)";
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(S.sim.B[i].x, S.sim.B[i].y); ctx.stroke();
          ctx.fillStyle = T.c5;
          ctx.beginPath();
          ctx.arc(lerp(p.x, S.sim.B[i].x, a), lerp(p.y, S.sim.B[i].y, a), 5.5, 0, TWO);
          ctx.fill();
        });
        cloud(ctx, S.sim.A, T.c2, 5);
        cloud(ctx, S.sim.B, T.c6, 5);
        if (mms) {
          const cx = S.sim.A.reduce((s, p) => s + p.x, 0) / S.sim.A.length;
          const cy = S.sim.A.reduce((s, p) => s + p.y, 0) / S.sim.A.length;
          ctx.strokeStyle = T.c4;
          ctx.setLineDash([5, 4]);
          ctx.beginPath();
          ctx.arc(cx, cy, 38 + 22 * Math.sin(S.t * 2), 0, TWO);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        const msg = /perturbative/.test(S.opId || "")
          ? "微扰形式：短箭头，代价 ≈ ε² E‖φ‖²"
          : mms
            ? "MMS：W₂ 球限制一步能搬多远（黄点=本步）"
            : "W₂：最小平方搬迁（交叉匹配更贵）";
        label(ctx, msg, 28, 22, T);
      },
    });

    add(["entropy"], {
      init(S) {
        S.sim.s = 0.25;
        S.sim.z0 = Array.from({ length: 36 }, () => randn());
        S.sim.xs = S.sim.z0.map((z) => S.sim.s * z);
      },
      tick(S, dt) {
        const spread = S.sliders.spread != null ? S.sliders.spread : 0.7;
        const ner = /ner|negative_entropy|entropy_regularized|joint_ner/i.test(S.opId || "");
        const ph = S.phase % 4;
        const table = ner ? [1.35, 0.95, 0.45, 0.22] : [0.22, 0.55, 0.95, 1.35];
        const goal = 0.12 + spread * table[ph];
        S.sim.s += (goal - S.sim.s) * dt * 5.2;
        S.sim.xs = S.sim.z0.map((z) => S.sim.s * z);
        S.metrics.H近似 = Math.log(S.sim.s * 2.5);
        S.metrics.方向 = ner ? "负熵收敛" : "熵发散";
      },
      draw(ctx, S, T) {
        const fn = (x) => gauss(x, 0, S.sim.s);
        const m = plot1d(ctx, S.W, S.H, fn, T.state);
        ctx.beginPath();
        ctx.moveTo(m.mapX(-3), m.y1);
        for (let i = 0; i <= 80; i++) {
          const x = -3 + 6 * i / 80;
          ctx.lineTo(m.mapX(x), m.mapY(fn(x)));
        }
        ctx.lineTo(m.mapX(3), m.y1);
        ctx.closePath();
        ctx.fillStyle = "rgba(91,140,255,.22)";
        ctx.fill();
        (S.sim.xs || []).forEach((x) => {
          ctx.fillStyle = T.ctrl;
          ctx.beginPath();
          ctx.arc(m.mapX(clamp(x, -2.9, 2.9)), m.y1 - 7, 4, 0, TWO);
          ctx.fill();
        });
        const barH = clamp((S.metrics.H近似 + 2.2) / 3.2, 0.05, 1) * (S.H - 80);
        ctx.fillStyle = T.energy;
        ctx.fillRect(S.W - 28, S.H - 30 - barH, 14, barH);
        const ner = /ner|negative_entropy|entropy_regularized|joint_ner/i.test(S.opId || "");
        label(ctx, ner ? "NER：x=σ z₀ 重参数，−H 把分布逼尖（绿柱=熵）" : "x=σ z₀ 重参数不闪烁；尖峰熵低，摊平熵高", 28, 22, T);
      },
    });

    add(["transport"], {
      init(S) {
        S.sim.p0 = Array.from({ length: 36 }, () => ({ x: randn() * 0.85, y: randn() * 0.65 }));
        S.sim.p = S.sim.p0.map((p) => ({ x: p.x, y: p.y }));
        S.sim.grid = [];
        for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) S.sim.grid.push({ x: i * 0.38, y: j * 0.38 });
      },
      tick(S) {
        const eps = S.sliders.eps != null ? S.sliders.eps : 0.2;
        const phiX = (x) => -Math.tanh(x);
        const phiY = (y) => -0.28 * Math.tanh(y);
        S.sim.p = S.sim.p0.map((p) => ({ x: p.x + eps * phiX(p.x), y: p.y + eps * phiY(p.y) }));
        /* T'(x)=1+ε φ'(x)=1−ε sech²(x) */
        const sech2 = (u) => { const c = 1 / Math.cosh(u); return c * c; };
        S.sim.invJac = (x, y) => 1 / Math.max(0.12, Math.abs((1 - eps * sech2(x)) * (1 - 0.28 * eps * sech2(y))));
        S.metrics["ε"] = eps;
        S.metrics["中心 1/|det∇T|"] = S.sim.invJac(0, 0);
      },
      draw(ctx, S, T) {
        const cx = S.W / 2, cy = S.H / 2 + 6, sc = 92;
        const eps = S.sliders.eps != null ? S.sliders.eps : 0.2;
        const Tm = (p) => ({ x: p.x + eps * (-Math.tanh(p.x)), y: p.y + eps * (-0.28 * Math.tanh(p.y)) });
        const cell = 0.38;
        for (let i = -4; i < 4; i++) for (let j = -3; j < 3; j++) {
          const c0 = { x: (i + 0.5) * cell, y: (j + 0.5) * cell };
          const q = Tm(c0);
          const inv = S.sim.invJac ? S.sim.invJac(c0.x, c0.y) : 1;
          const a = clamp((inv - 0.7) / 2.2, 0.06, 0.85);
          ctx.fillStyle = `rgba(91,140,255,${a})`;
          ctx.fillRect(cx + (q.x - cell * 0.45) * sc, cy + (q.y - cell * 0.45) * sc, cell * 0.9 * sc, cell * 0.9 * sc);
        }
        ctx.strokeStyle = "rgba(91,140,255,.35)";
        ctx.lineWidth = 1;
        for (let i = -4; i <= 4; i++) {
          ctx.beginPath();
          for (let j = -3; j <= 3; j++) {
            const q = Tm({ x: i * cell, y: j * cell });
            const px = cx + q.x * sc, py = cy + q.y * sc;
            if (j === -3) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.stroke();
        }
        S.sim.p.forEach((p, k) => {
          const p0 = S.sim.p0[k];
          ctx.fillStyle = T.state;
          ctx.beginPath(); ctx.arc(cx + p.x * sc, cy + p.y * sc, 3.4, 0, TWO); ctx.fill();
          arrow(ctx, cx + p.x * sc, cy + p.y * sc, -Math.tanh(p0.x) * 16, -0.28 * Math.tanh(p0.y) * 16, T.ctrl);
        });
        label(ctx, "体积被压 → 1/|det ∇T| 升高（格子加深）", 28, 22, T);
        markHit(S, "state", { type: "rect", x: 24, y: 32, w: S.W - 48, h: S.H - 70 });
        markHit(S, "ctrl", { type: "rect", x: cx - 90, y: cy - 70, w: 180, h: 140 });
      },
    });

    add(["continuity"], {
      init(S) {
        const nx = 24, ny = 14;
        S.sim.nx = nx; S.sim.ny = ny;
        S.sim.grid = Array.from({ length: nx }, (_, i) => Array.from({ length: ny }, (_, j) => Math.exp(-((i - 8) ** 2 + (j - 7) ** 2) / 18)));
        let m0 = 0;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) m0 += S.sim.grid[i][j];
        S.sim.mass0 = m0;
      },
      tick(S, dt) {
        const nx = S.sim.nx, ny = S.sim.ny, g = S.sim.grid;
        const vx = S.sliders.vx != null ? S.sliders.vx : 0.6;
        const dtA = Math.min(dt * 6, 0.35);
        const nxt = g.map((row) => row.slice());
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const im = (i - 1 + nx) % nx, ip = (i + 1) % nx;
          const jm = (j - 1 + ny) % ny, jp = (j + 1) % ny;
          const phi = vx * (0.55 + 0.22 * Math.sin(TWO * i / nx));
          const fxL = phi >= 0 ? phi * g[im][j] : phi * g[i][j];
          const fxR = phi >= 0 ? phi * g[i][j] : phi * g[ip][j];
          const fyB = 0.08 * vx * g[i][jm];
          const fyT = 0.08 * vx * g[i][j];
          nxt[i][j] = Math.max(0, g[i][j] - dtA * ((fxR - fxL) + (fyT - fyB)));
        }
        S.sim.grid = nxt;
        let mass = 0;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) mass += nxt[i][j];
        S.metrics["∑Q"] = mass;
        S.metrics["∑Q₀"] = S.sim.mass0;
        S.metrics["相对漂移"] = (mass - S.sim.mass0) / (S.sim.mass0 || 1);
      },
      draw(ctx, S, T) {
        const nx = S.sim.nx, ny = S.sim.ny;
        const cw = (S.W - 40) / nx, ch = (S.H - 56) / ny;
        for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
          const v = clamp(S.sim.grid[i][j], 0, 1);
          ctx.fillStyle = `rgba(91,140,255,${0.08 + 0.85 * v})`;
          ctx.fillRect(20 + i * cw, 36 + j * ch, cw - 1, ch - 1);
        }
        for (let j = 2; j < ny - 1; j += 2) arrow(ctx, 30, 40 + j * ch, 26, 0, T.ctrl);
        const ok = Math.abs(S.metrics["相对漂移"] || 0) < 0.08;
        label(ctx, "周期边界 + 守恒通量   ∑Q=" + (S.metrics["∑Q"] || 0).toFixed(3) + (ok ? " 守恒" : ""), 24, 22, T);
        markHit(S, "state", { type: "rect", x: 20, y: 36, w: S.W - 40, h: S.H - 56 });
        markHit(S, "ctrl", { type: "rect", x: 20, y: 40, w: 70, h: S.H - 80 });
      },
    });

    add(["ode", "lookahead"], {
      init(S) {
        S.sim.paths = Array.from({ length: 5 }, (_, k) => [{ x: 40, y: 80 + k * 40 }]);
        S.sim.u = 0.4;
        S.sim.y = [0.9, -0.2, 0.65, 0.1];
      },
      tick(S, dt) {
        const uamp = S.sliders.uamp != null ? S.sliders.uamp : 0.4;
        S.sim.u = uamp;
        if (S.demo === "lookahead") {
          const y = S.sim.y;
          const n = 48;
          const a = 0.45;
          const gZ = [0], lZ = [0];
          let zg = 0, zl = 0;
          for (let i = 0; i < n; i++) {
            const t = i / (n - 1);
            const yi = y[Math.min(3, Math.floor(t * 4))];
            const ug = uamp * (yi - zg) * 1.6 + uamp * 0.25 * Math.sin(t * Math.PI * 2);
            zg = zg + ( -a * zg + ug ) * 0.12;
            gZ.push(zg);
            const seg = Math.floor(t * 4);
            const ynow = y[Math.min(3, seg)];
            const ul = uamp * (ynow - zl) * 2.1;
            zl = zl + ( -a * zl + ul ) * 0.12;
            lZ.push(zl);
          }
          S.sim.gZ = gZ; S.sim.lZ = lZ;
          S.metrics.u = uamp;
          S.metrics.全局终端 = gZ[gZ.length - 1];
          S.metrics.局部终端 = lZ[lZ.length - 1];
          return;
        }
        S.sim.paths.forEach((path, k) => {
          const last = path[path.length - 1];
          if (last.x > S.W - 30) {
            path.length = 1;
            path[0] = { x: 40, y: 80 + k * 40 };
            return;
          }
          const f = 18 * Math.sin(0.02 * last.x + k);
          const u = uamp * 40 * Math.sin(0.03 * last.x);
          path.push({ x: last.x + 50 * dt, y: last.y + (f + u) * dt });
          if (path.length > 120) path.shift();
        });
      },
      draw(ctx, S, T) {
        if (S.demo === "lookahead") {
          const gZ = S.sim.gZ || [], lZ = S.sim.lZ || [];
          const x0 = 36, x1 = S.W - 24, y0 = 48, y1 = S.H - 36;
          const X = (i, n) => x0 + (x1 - x0) * i / (n - 1);
          const Y = (z) => (y0 + y1) / 2 - z * 70;
          ctx.setLineDash([7, 4]);
          ctx.strokeStyle = T.base;
          ctx.lineWidth = 2;
          ctx.beginPath();
          gZ.forEach((z, i) => { const p = i ? ctx.lineTo : ctx.moveTo; p.call(ctx, X(i, gZ.length), Y(z)); });
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = T.ctrl;
          ctx.lineWidth = 2.4;
          ctx.beginPath();
          const cuts = [0, 12, 24, 36, lZ.length - 1];
          for (let s = 0; s < 4; s++) {
            ctx.beginPath();
            for (let i = cuts[s]; i <= cuts[s + 1] && i < lZ.length; i++) {
              if (i === cuts[s]) ctx.moveTo(X(i, lZ.length), Y(lZ[i]));
              else ctx.lineTo(X(i, lZ.length), Y(lZ[i]));
            }
            ctx.stroke();
            const mid = cuts[s];
            ctx.fillStyle = T.ctrl;
            ctx.beginPath(); ctx.arc(X(mid, lZ.length), Y(lZ[mid] || 0), 4, 0, TWO); ctx.fill();
          }
          S.sim.y.forEach((yy, k) => {
            const x = x0 + (x1 - x0) * (k + 0.5) / 4;
            ctx.setLineDash([3, 3]);
            ctx.strokeStyle = T.state;
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = T.state;
            ctx.beginPath(); ctx.arc(x, Y(yy * 0.55), 4, 0, TWO); ctx.fill();
          });
          label(ctx, "虚线=全局最优（偷看未来 y）  实线=局部重规划", 28, 22, T);
          S.metrics.u = S.sim.u;
          return;
        }
        S.sim.paths.forEach((path, k) => {
          ctx.strokeStyle = [T.c2, T.c3, T.c4, T.c5, T.c7][k];
          ctx.lineWidth = 1.6; ctx.beginPath();
          path.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.stroke();
        });
        label(ctx, "ż = f(z,t)+u(z)   控制拧弯轨迹", 36, 22, T);
        S.metrics.u = S.sim.u;
      },
    });

    add(["pmp"], {
      init(S) {
        S.sim.z = []; S.sim.lam = []; S.sim.u = 0; S.sim.cost = 0;
      },
      tick(S, dt) {
        const uamp = S.sliders.uamp != null ? S.sliders.uamp : 0.45;
        const inf = /infinite_horizon/.test(S.opId || "");
        const n = 48;
        const z = [], lam = [];
        let x = 40, y = S.H * 0.55, ly = 0;
        S.sim.cost = 0;
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const u = uamp * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(S.t));
          const f = 22 * Math.sin(0.18 * i + S.t * 0.4);
          y += (f + u * 36) * 0.012;
          z.push({ x, y });
          const tail = inf ? Math.exp(-2.2 * t) : (1 - t);
          ly = 2 * (y - (S.H * 0.42 + 18 * Math.sin(S.t * 0.5))) * tail;
          lam.push({ x, y: S.H * 0.28 + ly * 0.35 });
          S.sim.cost += 0.5 * u * u * 0.08;
          x += (S.W - 90) / n;
        }
        S.sim.z = z; S.sim.lam = lam;
        S.sim.u = uamp;
        S.metrics.F = S.sim.cost + 0.01 * Math.abs(z[z.length - 1].y - S.H * 0.42);
        S.metrics.u = uamp;
        S.metrics.时域 = inf ? "T→∞" : "有限 T";
      },
      draw(ctx, S, T) {
        const ph = S.phase % 4;
        const stroke = (path, col, w) => {
          ctx.strokeStyle = col; ctx.lineWidth = w || 2; ctx.beginPath();
          path.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.stroke();
        };
        if (S.sim.z.length) {
          stroke(S.sim.z, T.c2, 2.2);
          if (ph >= 2) stroke(S.sim.lam, T.c6, 1.8);
          const k = Math.min(S.sim.z.length - 1, Math.floor(((S.t / 2.4) % 1) * S.sim.z.length));
          ctx.fillStyle = T.c5;
          ctx.beginPath(); ctx.arc(S.sim.z[k].x, S.sim.z[k].y, 5, 0, TWO); ctx.fill();
          if (ph >= 2) {
            ctx.fillStyle = T.c7;
            ctx.beginPath(); ctx.arc(S.sim.lam[k].x, S.sim.lam[k].y, 4, 0, TWO); ctx.fill();
          }
        }
        if (ph === 1 || ph === 3) {
          const hx = S.W - 150, hy = 70;
          ctx.strokeStyle = T.line; ctx.strokeRect(hx, hy, 130, 90);
          ctx.strokeStyle = T.c4; ctx.beginPath();
          for (let i = 0; i <= 20; i++) {
            const u = -1 + 2 * i / 20;
            const H = 0.5 * u * u + S.sim.u * 0.4 * u;
            const px = hx + 12 + i * 5.2, py = hy + 70 - (H + 0.8) * 28;
            if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
          }
          ctx.stroke();
          const uStar = -S.sim.u * 0.4;
          const iStar = clamp(Math.round((uStar + 1) * 10), 0, 20);
          ctx.fillStyle = T.c6;
          ctx.beginPath();
          ctx.arc(hx + 12 + iStar * 5.2, hy + 70 - (0.5 * uStar * uStar + S.sim.u * 0.4 * uStar + 0.8) * 28, 4, 0, TWO);
          ctx.fill();
        }
        const inf = /infinite_horizon/.test(S.opId || "");
        if (S.sim.z.length) {
          const zT = S.sim.z[S.sim.z.length - 1];
          const lT = S.sim.lam[S.sim.lam.length - 1];
          if (!inf) {
            ctx.strokeStyle = T.adj;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(zT.x, 28);
            ctx.lineTo(zT.x, S.H - 28);
            ctx.stroke();
            ctx.fillStyle = T.adj;
            ctx.font = "12px " + FONT_STACK;
            ctx.fillText("λ(T)=∇ψ", zT.x - 64, 40);
            ctx.beginPath(); ctx.arc(lT.x, lT.y, 5, 0, TWO); ctx.fill();
          } else {
            ctx.setLineDash([5, 4]);
            ctx.strokeStyle = T.base;
            ctx.beginPath();
            for (let i = 0; i < S.sim.lam.length; i++) {
              const t = i / (S.sim.lam.length - 1);
              const env = S.H * 0.28 + 36 * Math.exp(-2.4 * t);
              if (i) ctx.lineTo(S.sim.lam[i].x, env); else ctx.moveTo(S.sim.lam[i].x, env);
            }
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = T.adj;
            ctx.font = "12px " + FONT_STACK;
            ctx.fillText("渐近包络 λ(∞)→0", S.W - 168, 40);
          }
        }
        label(ctx, inf ? "无穷时域：协态沿包络衰减，终端横截变成 λ(∞)=0" : "蓝 z · 紫 λ(T)=∇ψ 终端横截 · 橙 u", 24, 22, T);
        if (S.sim.z.length) {
          markHit(S, "state", { type: "rect", x: 32, y: S.H * 0.38, w: S.W - 90, h: S.H * 0.4 });
          markHit(S, "adj", { type: "rect", x: 32, y: 24, w: S.W - 90, h: S.H * 0.28 });
          markHit(S, "ctrl", { type: "rect", x: S.W - 160, y: 60, w: 140, h: 110 });
        }
      },
    });

    add(["adjoint"], {
      init(S) { S.sim.fwd = []; S.sim.bwd = []; S.sim.k = 0; },
      tick(S, dt) {
        const w = S.sliders.uamp != null ? S.sliders.uamp : 1;
        const n = 40;
        S.sim.fwd = []; S.sim.bwd = [];
        let y = S.H * 0.58;
        for (let i = 0; i < n; i++) {
          y += 4.2 * Math.sin(0.28 * i + S.t * 2.2);
          S.sim.fwd.push({ x: 50 + i * (S.W - 100) / n, y });
        }
        const yT = S.sim.fwd[n - 1].y;
        const target = S.H * 0.45;
        let lam = w * 2 * (yT - target);
        for (let i = n - 1; i >= 0; i--) {
          S.sim.bwd[i] = { x: S.sim.fwd[i].x, y: 78 + Math.tanh(lam / 28) * 78 + 18 * Math.sin(S.t * 2.6 + i * 0.25) };
          lam *= 0.94;
        }
        S.sim.k = Math.floor(((S.t * 2.2) % 2.4) / 2.4 * n);
        S.metrics.终端误差 = yT - target;
        S.metrics.λT = w * 2 * (yT - target);
      },
      draw(ctx, S, T) {
        ctx.strokeStyle = T.c3; ctx.setLineDash([5, 4]); ctx.beginPath();
        ctx.moveTo(40, S.H * 0.45); ctx.lineTo(S.W - 40, S.H * 0.45); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = T.c2; ctx.lineWidth = 2; ctx.beginPath();
        S.sim.fwd.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        ctx.strokeStyle = T.c6; ctx.beginPath();
        S.sim.bwd.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
        ctx.stroke();
        const k = clamp(S.sim.k, 0, S.sim.fwd.length - 1);
        if (S.sim.fwd[k]) {
          ctx.fillStyle = T.c5;
          ctx.beginPath(); ctx.arc(S.sim.fwd[k].x, S.sim.fwd[k].y, 8, 0, TWO); ctx.fill();
          if (S.sim.bwd[k]) {
            ctx.fillStyle = T.c7;
            ctx.beginPath(); ctx.arc(S.sim.bwd[k].x, S.sim.bwd[k].y, 7, 0, TWO); ctx.fill();
            arrow(ctx, S.sim.fwd[k].x, S.sim.fwd[k].y, 0, S.sim.bwd[k].y - S.sim.fwd[k].y, T.c4);
          }
          ctx.fillStyle = "rgba(251,191,36,.2)";
          ctx.fillRect(S.sim.fwd[k].x - 6, 24, 12, S.H - 48);
        }
        label(ctx, "正向状态 → 终端误差生成 λ(T) → 反向伴随", 24, 22, T);
      },
    });

    add(["mask"], {
      init(S) {
        S.sim.miss = -1;
        S.sim.M = [];
        S.sim.imp = 0;
      },
      tick(S, dt) {
        const miss = S.sliders.miss != null ? S.sliders.miss : 0.35;
        if (Math.abs(miss - S.sim.miss) > 0.02 || !S.sim.M.length) {
          S.sim.miss = miss;
          S.sim.M = Array.from({ length: 6 }, () => Array.from({ length: 8 }, () => Math.random() > miss));
        }
        S.sim.imp = 0.5 + 0.5 * Math.sin(S.t * 1.4);
      },
      draw(ctx, S, T) {
        const cw = 36, ch = 32, x0 = 40, y0 = 50;
        for (let i = 0; i < 6; i++) for (let j = 0; j < 8; j++) {
          const obs = S.sim.M[i][j];
          ctx.fillStyle = obs ? T.c2 : `rgba(45,212,191,${0.15 + 0.7 * S.sim.imp})`;
          ctx.fillRect(x0 + j * cw, y0 + i * ch, cw - 4, ch - 4);
          if (!obs) {
            ctx.strokeStyle = T.c6; ctx.strokeRect(x0 + j * cw, y0 + i * ch, cw - 4, ch - 4);
          }
        }
        label(ctx, S.opId === "knewimp_imputation_update"
          ? "KnewImp：只推缺失格，观测钉死，核化场把洞填实"
          : "M=1 钉死观测；空洞被 X_imp 填回", 36, 28, T);
      },
    });

    add(["score", "stein"], {
      init(S) {
        S.sim.p = Array.from({ length: 36 }, () => ({ x: randn() * 1.4, y: randn() * 1.1 }));
        S.sim.clean = Array.from({ length: 10 }, () => ({ x: randn() * 0.35, y: randn() * 0.28 }));
      },
      tick(S, dt) {
        const sig = S.sliders.sig != null ? S.sliders.sig : 0.45;
        const dsm = /denoising|dsm/i.test(S.opId || "") || S.opId === "denoising_score_matching";
        const stein = S.demo === "stein" || S.opId === "stein_lemma";
        S.sim.p.forEach((p) => {
          p.x += (-p.x) * dt * (stein ? 0.6 : 1.25);
          p.y += (-p.y) * dt * (stein ? 0.6 : 1.25);
          p.x += randn() * (0.28 + sig) * (dsm ? 1.15 : 0.85);
          p.y += randn() * (0.28 + sig) * (dsm ? 1.15 : 0.85);
          if (hypot(p.x, p.y) < 0.12) { p.x = randn() * 1.3; p.y = randn() * 1.0; }
        });
        S.metrics.score范 = S.sim.p.reduce((s, p) => s + hypot(p.x, p.y), 0) / S.sim.p.length;
        S.metrics.σ = sig;
      },
      draw(ctx, S, T) {
        const cx = S.W / 2, cy = S.H / 2, sc = 70;
        const pulse = 10 + 5 * Math.sin(S.t * 2.2);
        const ph = S.phase % 4;
        if (ph !== 0) {
          for (let i = -2; i <= 2; i += 0.7) for (let j = -1.4; j <= 1.4; j += 0.7) {
            arrow(ctx, cx + i * sc, cy + j * sc, -i * pulse, -j * pulse, "rgba(91,140,255,.45)");
          }
        }
        if (S.opId === "denoising_score_matching") {
          S.sim.clean.forEach((p) => {
            ctx.strokeStyle = T.c3;
            ctx.beginPath(); ctx.arc(cx + p.x * sc, cy + p.y * sc, 7 + 6 * (S.sliders.sig || 0.4), 0, TWO); ctx.stroke();
            ctx.fillStyle = T.c3;
            ctx.beginPath(); ctx.arc(cx + p.x * sc, cy + p.y * sc, 3, 0, TWO); ctx.fill();
          });
        }
        S.sim.p.forEach((p) => {
          ctx.fillStyle = T.c5;
          ctx.beginPath(); ctx.arc(cx + p.x * sc, cy + p.y * sc, 3.5, 0, TWO); ctx.fill();
        });
        const msg = S.opId === "stein_lemma"
          ? "Stein：E[f(z)(z−μ)] = E[∇f] Σ   高斯积分变雅可比"
          : S.opId === "denoising_score_matching"
            ? "DSM：网络箭头应对准 −(x̂−x)/σ²（指向干净点）"
            : "s(x)=∇log p   指向更可能的方向（配分函数消失）";
        label(ctx, msg, 28, 22, T);
      },
    });

    add(["kernel", "align"], {
      init(S) {
        S.sim.pts = Array.from({ length: 8 }, () => ({ x: 120 + Math.random() * 360, y: 80 + Math.random() * 180, vx: randn() * 12, vy: randn() * 12 }));
        S.sim.src = Array.from({ length: 10 }, () => ({ x: 90 + Math.random() * 140, y: 90 + Math.random() * 160 }));
        S.sim.tgt = Array.from({ length: 6 }, () => ({ x: 360 + Math.random() * 160, y: 90 + Math.random() * 160 }));
      },
      tick(S, dt) {
        const v = S.sliders.v != null ? S.sliders.v : 0.8;
        S.metrics.带宽 = v;
        S.sim.pts.forEach((p) => {
          p.x += p.vx * dt; p.y += p.vy * dt;
          if (p.x < 40 || p.x > S.W - 40) p.vx *= -1;
          if (p.y < 50 || p.y > S.H - 40) p.vy *= -1;
        });
        if (S.demo === "align") {
          S.sim.src.forEach((p, i) => {
            const q = S.sim.tgt[i % S.sim.tgt.length];
            p.x += (q.x - 80 - p.x) * dt * 0.35;
            p.y += (q.y - p.y) * dt * 0.35;
          });
        }
      },
      draw(ctx, S, T) {
        const v = (S.sliders.v != null ? S.sliders.v : 0.8) * (70 + 20 * Math.sin(S.t));
        if (S.demo === "align") {
          cloud(ctx, S.sim.src, T.c2, 4);
          cloud(ctx, S.sim.tgt, T.c6, 5);
          S.sim.src.forEach((p, i) => {
            const q = S.sim.tgt[i % S.sim.tgt.length];
            ctx.strokeStyle = "rgba(251,191,36,.35)";
            ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          });
          label(ctx, "Stein 路径：源域云被拉向目标域（冷启动对齐）", 28, 22, T);
          return;
        }
        S.sim.pts.forEach((p) => {
          const g = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, Math.max(8, v));
          g.addColorStop(0, "rgba(163,230,53,.55)");
          g.addColorStop(1, "rgba(163,230,53,0)");
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(8, v), 0, TWO); ctx.fill();
        });
        cloud(ctx, S.sim.pts, T.c4, 4);
        label(ctx, "RBF 核包叠加 = RKHS 中的函数", 36, 22, T);
      },
    });

    add(["svgd", "pfg"], {
      init(S) {
        S.sim.p = Array.from({ length: 28 }, () => ({ x: randn() * 0.5, y: randn() * 0.5, vx: 0, vy: 0 }));
      },
      tick(S, dt) {
        const vbw = S.sliders.v != null ? S.sliders.v : 0.7;
        const pre = S.demo === "pfg" ? 2.4 : 1;
        const p = S.sim.p;
        const acc = p.map(() => ({ x: 0, y: 0 }));
        for (let i = 0; i < p.length; i++) {
          /* target: two modes */
          const s1x = -(p[i].x + 1.1) / 0.3, s1y = -p[i].y / 0.35;
          const s2x = -(p[i].x - 1.15) / 0.3, s2y = -p[i].y / 0.35;
          const w1 = Math.exp(-0.5 * ((p[i].x + 1.1) ** 2 / 0.3 + p[i].y ** 2 / 0.35));
          const w2 = Math.exp(-0.5 * ((p[i].x - 1.15) ** 2 / 0.3 + p[i].y ** 2 / 0.35));
          const scx = (w1 * s1x + w2 * s2x) / (w1 + w2 + 1e-9);
          const scy = (w1 * s1y + w2 * s2y) / (w1 + w2 + 1e-9);
          acc[i].x += scx; acc[i].y += scy;
          for (let j = 0; j < p.length; j++) {
            const dx = p[i].x - p[j].x, dy = p[i].y - p[j].y;
            const k = Math.exp(-(dx * dx + dy * dy) / (vbw + 0.2));
            acc[i].x += k * scx / p.length;
            acc[i].y += k * scy / p.length;
            acc[i].x += (2 * dx / (vbw + 0.2)) * k / p.length;
            acc[i].y += (2 * dy / (vbw + 0.2)) * k / p.length;
          }
        }
        p.forEach((q, i) => {
          q.x += acc[i].x * dt * 0.35 * pre;
          q.y += acc[i].y * dt * 0.35;
          q.x = clamp(q.x, -2.4, 2.4);
          q.y = clamp(q.y, -1.6, 1.6);
        });
      },
      draw(ctx, S, T) {
        const cx = S.W / 2, cy = S.H / 2, scx = 110, scy = 90;
        ctx.fillStyle = "rgba(251,113,133,.12)";
        ctx.beginPath(); ctx.ellipse(cx - 1.1 * scx, cy, 42, 32, 0, 0, TWO); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 1.15 * scx, cy, 42, 32, 0, 0, TWO); ctx.fill();
        S.sim.p.forEach((p) => {
          ctx.fillStyle = T.c2;
          ctx.beginPath(); ctx.arc(cx + p.x * scx, cy + p.y * scy, 4, 0, TWO); ctx.fill();
        });
        label(ctx, S.demo === "pfg" ? "预条件让扁分布走得更匀"
          : (S.opId === "info_particle_update" ? "InfO：核化最优控制场驱动粒子逼近后验"
            : "核化粒子交互：推向后验、彼此排斥"), 28, 22, T);
      },
    });

    add(["dirac"], {
      init(S) { S.sim.bw = 1.2; S.sim.pos = [-1.3, -0.35, 0.85, 1.45]; },
      tick(S, dt) {
        const sp = S.sliders.spread != null ? S.sliders.spread : 0.5;
        S.sim.bw = 0.05 + 0.12 * sp + 1.15 * (0.5 + 0.5 * Math.cos(S.t * 2.05));
        S.sim.pos = S.sim.pos.map((m, i) => m + 0.018 * Math.sin(S.t * 2.4 + i * 1.3));
      },
      draw(ctx, S, T) {
        const fn = (x) => S.sim.pos.reduce((s, m) => s + gauss(x, m, S.sim.bw), 0) / S.sim.pos.length;
        const mapped = plot1d(ctx, S.W, S.H, fn, T.c5);
        S.sim.pos.forEach((m) => {
          const px = mapped.mapX(m);
          ctx.strokeStyle = T.c6;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, mapped.y1);
          ctx.lineTo(px, mapped.y0 + 8);
          ctx.stroke();
          ctx.fillStyle = T.c2;
          ctx.beginPath(); ctx.arc(px, mapped.y1, 4.5, 0, TWO); ctx.fill();
        });
        const qtz = S.opId === "particle_quantization";
        label(ctx, qtz ? "量子化：连续密度 → M 个点质量（针越细越像 δ）" : "带宽→0：经验测度变成狄拉克针；粒子 = 点质量", 24, 22, T);
        S.metrics.带宽 = S.sim.bw;
      },
    });

    add(["sde", "filter"], {
      init(S) {
        S.sim.paths = Array.from({ length: 8 }, () => [{ x: 30, y: S.H / 2 + randn() * 20 }]);
        S.sim.step = 0;
      },
      tick(S, dt) {
        const sig = S.sliders.sig != null ? S.sliders.sig : 0.3;
        S.sim.step = Math.floor(S.t / 1.6) % 4;
        S.sim.paths.forEach((path) => {
          const last = path[path.length - 1];
          if (last.x > S.W - 24) { path.length = 1; path[0] = { x: 30, y: S.H / 2 + randn() * 20 }; return; }
          const drift = 12 * Math.sin(0.02 * last.x) + (S.demo === "filter" ? -0.15 * (last.y - S.H / 2) : 0);
          path.push({ x: last.x + 70 * dt, y: last.y + drift * dt + randn() * sig * 18 });
          if (path.length > 140) path.shift();
        });
        S.metrics.噪声 = sig;
        if (S.demo === "filter") S.metrics.节拍 = ["先验ODE", "发射预测", "控制ν", "Schur校正"][S.sim.step];
      },
      draw(ctx, S, T) {
        S.sim.paths.forEach((path) => {
          ctx.strokeStyle = "rgba(91,140,255,.55)";
          ctx.beginPath();
          path.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
          ctx.stroke();
        });
        const mean = S.sim.paths.map((p) => p[p.length - 1]);
        const mx = mean.reduce((s, p) => s + p.x, 0) / mean.length;
        const my = mean.reduce((s, p) => s + p.y, 0) / mean.length;
        ctx.fillStyle = T.c5;
        ctx.beginPath(); ctx.arc(mx, my, 5, 0, TWO); ctx.fill();
        label(ctx, S.demo === "filter" ? "四拍滤波：预测–解码–控制–校正" : "dx=b dt + L dW   漂移+布朗", 28, 22, T);
        if (S.demo === "filter") {
          for (let i = 0; i < 4; i++) {
            ctx.fillStyle = i === S.sim.step ? T.c5 : T.line;
            ctx.fillRect(S.W - 160 + i * 34, 14, 28, 10);
          }
        }
      },
    });

    add(["mpnn"], {
      init(S) {
        S.sim.nodes = [
          { x: 120, y: 80, f: 0.2 }, { x: 280, y: 70, f: 0.4 }, { x: 430, y: 100, f: 0.1 },
          { x: 160, y: 220, f: 0.7 }, { x: 320, y: 240, f: 0.3 }, { x: 470, y: 210, f: 0.5 },
        ];
        S.sim.edges = [[0, 1], [1, 2], [0, 3], [1, 4], [2, 5], [3, 4], [4, 5], [1, 3]];
      },
      tick(S, dt) {
        const n = S.sim.nodes;
        const msg = n.map(() => 0);
        S.sim.edges.forEach(([i, j]) => {
          msg[i] += n[j].f; msg[j] += n[i].f;
        });
        const rate = S.sliders.rate != null ? S.sliders.rate : 1;
        n.forEach((node, i) => { node.f += (0.4 * node.f + 0.6 * Math.tanh(msg[i]) - node.f) * dt * 2 * rate; node.pulse = msg[i]; });
      },
      draw(ctx, S, T) {
        S.sim.edges.forEach(([i, j]) => {
          const a = S.sim.nodes[i], b = S.sim.nodes[j];
          ctx.strokeStyle = T.line; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          const t = (S.t * 0.4 + i * 0.1) % 1;
          ctx.fillStyle = T.c5;
          ctx.beginPath(); ctx.arc(lerp(a.x, b.x, t), lerp(a.y, b.y, t), 3, 0, TWO); ctx.fill();
        });
        S.sim.nodes.forEach((n, i) => {
          ctx.fillStyle = T.c2;
          ctx.beginPath(); ctx.arc(n.x, n.y, 14 + 8 * n.f, 0, TWO); ctx.fill();
          ctx.fillStyle = "#061018"; ctx.font = "11px sans-serif"; ctx.fillText("v" + i, n.x - 8, n.y + 4);
        });
        label(ctx, "邻居消息聚合 → 更新节点特征", 28, 22, T);
      },
    });

    add(["nam"], {
      init(S) {
        S.sim.Ahat = [
          [0, 1, 1, 0, 0],
          [1, 0, 1, 1, 1],
          [1, 1, 0, 0, 1],
          [0, 1, 0, 0, 1],
          [0, 1, 1, 1, 0],
        ];
        S.sim.blend = 0;
        const A = S.sim.Ahat;
        S.sim.deg = A.map((row) => row.reduce((s, v) => s + v, 0));
        S.sim.Anorm = A.map((row, i) => row.map((v, j) => (S.sim.deg[i] && S.sim.deg[j] ? v / Math.sqrt(S.sim.deg[i] * S.sim.deg[j]) : 0)));
      },
      tick(S, dt) {
        const rate = S.sliders.rate != null ? S.sliders.rate : 1;
        const sl = S.sliders.selfloop != null ? S.sliders.selfloop : 1;
        const A = S.sim.Ahat.map((row, i) => row.map((v, j) => (i === j ? sl : v)));
        const n = A.length;
        S.sim.blend = 0.5 + 0.5 * Math.sin(S.t * 2.05 * rate);
        S.sim.hi = Math.floor((S.t * 3.2) % n);
        const deg = A.map((row) => row.reduce((s, v) => s + v, 0));
        S.sim.AhatLive = A;
        S.sim.deg = deg;
        S.sim.Anorm = A.map((row, i) => row.map((v, j) => (deg[i] && deg[j] ? v / Math.sqrt(deg[i] * deg[j]) : 0)));
        S.metrics.最大度 = Math.max(...deg);
        S.metrics.行和 = S.sim.Anorm[1].reduce((s, v) => s + v, 0);
      },
      draw(ctx, S, T) {
        const A = S.sim.AhatLive || S.sim.Ahat, N = S.sim.Anorm, n = A.length;
        const cell = 28, y0 = 58;
        const drawMat = (M, x0, title, col) => {
          ctx.fillStyle = T.mu; ctx.font = "12px sans-serif"; ctx.fillText(title, x0, 44);
          for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
            const v = M[i][j];
            const a = typeof v === "number" ? v : 0;
            ctx.fillStyle = a > 0 ? `rgba(91,140,255,${0.18 + 0.82 * Math.min(1, a * (title[0] === "Â" ? 1 : 1.6))})` : (T.dark ? "#121a2b" : "#e8edf7");
            ctx.fillRect(x0 + j * cell, y0 + i * cell, cell - 3, cell - 3);
            if (a > 0.02) {
              ctx.fillStyle = T.tx; ctx.font = "9px sans-serif";
              ctx.fillText(a === 1 ? "1" : a.toFixed(2), x0 + j * cell + 3, y0 + i * cell + 16);
            }
          }
        };
        drawMat(A, 28, "Â 二值邻接", T.c2);
        const mixed = A.map((row, i) => row.map((v, j) => lerp(v, N[i][j], S.sim.blend)));
        drawMat(mixed, 28 + n * cell + 36, "A = D^{-1/2} Â D^{-1/2}", T.c3);
        const hi = ((S.sim.hi % n) + n) % n;
        ctx.strokeStyle = T.c5; ctx.lineWidth = 2;
        ctx.strokeRect(28, y0 + hi * cell - 1, n * cell - 3, cell - 1);
        ctx.strokeRect(28 + n * cell + 36, y0 + hi * cell - 1, n * cell - 3, cell - 1);
        S.sim.deg.forEach((d, i) => {
          ctx.fillStyle = T.c5;
          const h = Math.min(22, d * 6) * (0.7 + 0.3 * Math.sin(S.t * 4 + i));
          ctx.fillRect(28 + n * cell + 8, y0 + i * cell + 4, 8, h);
        });
        label(ctx, "度矩阵缩放：大度节点权重被压平，行落入单纯形附近", 24, 22, T);
      },
    });

    add(["mc"], {
      init(S) {
        S.sim.pts = [];
        S.sim.hits = 0;
      },
      tick(S) {
        const cap = S.sliders.n != null ? S.sliders.n : 120;
        if (S.sim.pts.length > cap) {
          S.sim.pts = [];
          S.sim.hits = 0;
        }
        for (let k = 0; k < 6; k++) {
          const x = Math.random() * 2 - 1, y = Math.random() * 2 - 1;
          const hit = x * x + y * y <= 1;
          S.sim.pts.push({ x, y, hit });
          if (hit) S.sim.hits++;
        }
        S.metrics.M = S.sim.pts.length;
        S.metrics.π估 = S.sim.pts.length ? 4 * S.sim.hits / S.sim.pts.length : 0;
      },
      draw(ctx, S, T) {
        const side = Math.min(S.W - 180, S.H - 70);
        const x0 = 36, y0 = 40;
        ctx.strokeStyle = T.line; ctx.strokeRect(x0, y0, side, side);
        ctx.strokeStyle = T.c5; ctx.beginPath();
        ctx.arc(x0 + side / 2, y0 + side / 2, side / 2, 0, TWO); ctx.stroke();
        S.sim.pts.forEach((p, i) => {
          const recent = i >= S.sim.pts.length - 8;
          ctx.fillStyle = p.hit ? T.c3 : T.c6;
          ctx.beginPath();
          ctx.arc(x0 + (p.x + 1) / 2 * side, y0 + (1 - p.y) / 2 * side, recent ? 5.5 : 2.4, 0, TWO);
          ctx.fill();
        });
        const est = S.metrics.π估 || 0;
        ctx.fillStyle = T.c5;
        ctx.fillRect(x0 + side + 24, 150, 16, Math.min(140, est * 36));
        ctx.fillStyle = T.c2;
        ctx.fillRect(x0 + side + 48, 150, 16, Math.min(140, Math.PI * 36));
        ctx.fillStyle = T.tx; ctx.font = "14px sans-serif";
        ctx.fillText("π ≈ " + est.toFixed(4), x0 + side + 18, 80);
        ctx.fillStyle = T.mu; ctx.font = "12px sans-serif";
        ctx.fillText("真值 3.1416", x0 + side + 18, 104);
        ctx.fillText("M = " + S.sim.pts.length, x0 + side + 18, 126);
        label(ctx, "蒙特卡洛：方里撒点，圆内比例 ×4 ≈ π；M↑ 方差↓", 24, 22, T);
      },
    });

    add(["weights"], {
      init(S) {
        S.sim.p = Array.from({ length: 22 }, () => ({
          x: randn() * 1.2, y: randn() * 0.85, w: 1 / 22, vx: 0, vy: 0,
        }));
      },
      tick(S, dt) {
        const rate = S.sliders.rate != null ? S.sliders.rate : 1;
        const p = S.sim.p;
        p.forEach((q) => {
          const t1 = Math.exp(-0.5 * ((q.x + 1.05) ** 2 / 0.28 + q.y ** 2 / 0.32));
          const t2 = Math.exp(-0.5 * ((q.x - 1.1) ** 2 / 0.28 + q.y ** 2 / 0.32));
          const dens = t1 + t2 + 1e-6;
          q.w *= Math.exp(dt * 1.6 * rate * Math.log(dens + 1e-6));
          q.x += ((t1 * (-(q.x + 1.05)) + t2 * (-(q.x - 1.1))) / dens) * dt * 0.55 * rate;
          q.y += (-q.y) * dt * 0.7 * rate;
          q.x += randn() * 0.035; q.y += randn() * 0.03;
          q.x = clamp(q.x, -2.3, 2.3); q.y = clamp(q.y, -1.5, 1.5);
        });
        const z = p.reduce((s, q) => s + q.w, 0) || 1;
        p.forEach((q) => { q.w /= z; });
        S.metrics.有效样本 = 1 / p.reduce((s, q) => s + q.w * q.w, 0);
      },
      draw(ctx, S, T) {
        const cx = S.W / 2, cy = S.H / 2, scx = 110, scy = 90;
        ctx.fillStyle = "rgba(251,113,133,.12)";
        ctx.beginPath(); ctx.ellipse(cx - 1.05 * scx, cy, 40, 30, 0, 0, TWO); ctx.fill();
        ctx.beginPath(); ctx.ellipse(cx + 1.1 * scx, cy, 40, 30, 0, 0, TWO); ctx.fill();
        S.sim.p.forEach((q, i) => {
          const pulse = 1 + 0.28 * Math.sin(S.t * 5 + i);
          const r = (2.8 + 24 * Math.sqrt(q.w)) * pulse;
          ctx.fillStyle = `rgba(91,140,255,${0.25 + 0.75 * Math.min(1, q.w * 18)})`;
          ctx.beginPath(); ctx.arc(cx + q.x * scx, cy + q.y * scy, r, 0, TWO); ctx.fill();
        });
        S.sim.p.forEach((q, i) => {
          ctx.fillStyle = T.c5;
          ctx.fillRect(16 + i * 12, S.H - 18 - q.w * 90, 9, q.w * 90);
        });
        label(ctx, "动态权重：亮/大 = 质量高；底栏直方图随时间重分配", 24, 22, T);
      },
    });

    add(["embed", "residual", "relu"], {
      init(S) { S.sim.h = [0, 0, 0, 0]; },
      tick(S) {
        const x = Math.sin(S.t);
        const hid = S.sliders.hid != null ? S.sliders.hid / 12 : 1;
        S.sim.x = x;
        S.sim.emb = 0.7 * x + 0.1;
        S.sim.mess = 0.3 * Math.cos(S.t * 0.8);
        S.sim.res = S.sim.emb + S.sim.mess;
        S.sim.y = Math.max(0, S.sim.res * hid);
        S.metrics.ŷ = S.sim.y;
      },
      draw(ctx, S, T) {
        const y = S.H / 2;
        const xs = [70, 200, 340, 490];
        const vs = [S.sim.x, S.sim.emb, S.sim.res, S.sim.y];
        const labs = ["x", "embed", S.demo === "residual" ? "x+mess" : "hidden", "ReLU ŷ"];
        xs.forEach((x, i) => {
          ctx.strokeStyle = T.c2; ctx.strokeRect(x, y - 40, 86, 80);
          ctx.fillStyle = T.tx; ctx.font = "12px sans-serif"; ctx.fillText(labs[i], x + 8, y - 18);
          ctx.fillStyle = vs[i] < 0 ? T.c6 : T.c3;
          ctx.fillRect(x + 10, y + 10, 66 * clamp(Math.abs(vs[i]), 0, 1), 12);
          if (i < 3) arrow(ctx, x + 88, y, 22, 0, T.mu);
        });
        label(ctx, "嵌入 / 残差相加 / ReLU 砍负半轴", 36, 24, T);
      },
    });

    add(["girsanov"], {
      init(S) {
        S.sim.P = Array.from({ length: 6 }, () => [{ x: 20, y: S.H / 2 + randn() * 10 }]);
        S.sim.Q = Array.from({ length: 6 }, () => [{ x: 20, y: S.H / 2 + randn() * 10 }]);
      },
      tick(S, dt) {
        const gap = S.sliders.gap != null ? S.sliders.gap : 0.7;
        S.sim.P.forEach((path, k) => {
          const last = path[path.length - 1];
          if (last.x > S.W - 20) { path.length = 1; path[0] = { x: 20, y: S.H / 2 + randn() * 10 }; return; }
          path.push({ x: last.x + 60 * dt, y: last.y + randn() * 6 });
        });
        S.sim.Q.forEach((path, k) => {
          const last = path[path.length - 1];
          if (last.x > S.W - 20) { path.length = 1; path[0] = { x: 20, y: S.H / 2 + randn() * 10 }; return; }
          path.push({ x: last.x + 60 * dt, y: last.y - 22 * gap * dt + randn() * 6 });
        });
        S.metrics.漂移差能量 = 0.5 * gap * gap;
      },
      draw(ctx, S, T) {
        const stroke = (paths, col) => {
          ctx.strokeStyle = col; ctx.lineWidth = 1.3;
          paths.forEach((path) => {
            ctx.beginPath();
            path.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
            ctx.stroke();
          });
        };
        stroke(S.sim.P, "rgba(91,140,255,.7)");
        stroke(S.sim.Q, "rgba(251,113,133,.7)");
        label(ctx, "Girsanov：两漂移过程的路径密度比 ~ exp(−½∫‖ν‖²)", 20, 22, T);
      },
    });

    add(["admm"], {
      init(S) { S.sim.w = 1.4; S.sim.v = -0.8; S.sim.lam = 0.2; S.sim.k = 0; S.sim.acc = 0; },
      tick(S, dt) {
        const rho = S.sliders.rho != null ? S.sliders.rho : 0.8;
        S.sim.acc += dt;
        if (S.sim.acc > 0.18) {
          S.sim.acc = 0;
          S.sim.k = (S.sim.k + 1) % 3;
          if (S.sim.k === 0) S.sim.w += -0.28 * rho * (S.sim.w + S.sim.lam);
          if (S.sim.k === 1) S.sim.v += -0.28 * rho * (S.sim.v + S.sim.lam);
          if (S.sim.k === 2) S.sim.lam += 0.35 * rho * (S.sim.w + S.sim.v);
          S.sim.w = clamp(S.sim.w, -2.2, 2.2);
          S.sim.v = clamp(S.sim.v, -2.2, 2.2);
          S.sim.lam = clamp(S.sim.lam, -2.2, 2.2);
        }
        S.metrics.残差 = S.sim.w + S.sim.v;
        S.metrics.块 = ["w", "v", "λ"][S.sim.k];
      },
      draw(ctx, S, T) {
        const items = [
          { lab: "w 生成θ", val: S.sim.w, c: T.c2 },
          { lab: "v 控制φ", val: S.sim.v, c: T.c5 },
          { lab: "λ 乘子", val: S.sim.lam, c: T.c7 },
        ];
        items.forEach((it, i) => {
          const x = 70 + i * 180;
          ctx.strokeStyle = S.sim.k === i ? T.c4 : T.line;
          ctx.lineWidth = S.sim.k === i ? 3 : 1;
          ctx.strokeRect(x, 80, 140, 160);
          ctx.fillStyle = T.tx; ctx.font = "14px sans-serif"; ctx.fillText(it.lab, x + 16, 110);
          ctx.fillStyle = it.c;
          ctx.fillRect(x + 30, 200 - it.val * 40, 80, 12);
        });
        label(ctx, "ADMM 三拍：交替子问题 + 对偶上升", 36, 28, T);
      },
    });

    add(["schur"], {
      init(S) {},
      tick(S) {
        const obs = S.sliders.obs != null ? S.sliders.obs : 1;
        S.sim.a = (70 + 20 * Math.sin(S.t)) / Math.sqrt(obs);
        S.sim.b = (50 + 10 * Math.cos(S.t * 0.7)) / Math.sqrt(obs);
        S.metrics.观测精度 = obs;
      },
      draw(ctx, S, T) {
        ellipse(ctx, 180, 180, 90, 50, 0.3, T.c2);
        ellipse(ctx, 340, 190, 55, 70, -0.2, T.c6);
        ellipse(ctx, 250, 185, S.sim.a * 0.5, S.sim.b * 0.45, 0.1, T.c4);
        ctx.fillStyle = T.c2; ctx.font = "12px sans-serif";
        ctx.fillText("先验 N(μP,ΣP)", 130, 110);
        ctx.fillStyle = T.c6; ctx.fillText("控制 N(μν,Σν)", 330, 110);
        ctx.fillStyle = T.c4; ctx.fillText("后验（Schur/高斯乘积）", 200, 320);
        label(ctx, "两高斯融合：精度相加，椭圆变瘦", 36, 24, T);
      },
    });

    add(["planar"], {
      init(S) {
        S.sim.grid = [];
        for (let i = -4; i <= 4; i++) for (let j = -3; j <= 3; j++) S.sim.grid.push({ x: i, y: j });
      },
      tick(S) {
        S.metrics.相位 = S.phase;
      },
      draw(ctx, S, T) {
        const base = S.sliders.uamp != null ? S.sliders.uamp : 0.6;
        const uamp = base * (0.55 + 0.45 * Math.sin(S.t * 1.2));
        const cx = S.W / 2, cy = S.H / 2, sc = 36;
        const f = (p) => {
          const t = Math.tanh(p.x * 0.6);
          return { x: p.x + uamp * t, y: p.y + 0.35 * uamp * Math.tanh(p.y * 0.5) };
        };
        ctx.strokeStyle = T.line;
        S.sim.grid.forEach((p) => {
          const q = f(p);
          ctx.fillStyle = T.c7;
          ctx.beginPath(); ctx.arc(cx + q.x * sc, cy + q.y * sc, 3, 0, TWO); ctx.fill();
        });
        label(ctx, "平面流 f=z+u tanh(zW+b)  网格被轻轻拧弯", 28, 22, T);
        S.metrics.u = uamp;
      },
    });

    add(["hamiltonian", "momentum", "hamflow"], {
      init(S) {
        S.sim.q = 1.6; S.sim.p = 0; S.sim.tr = [];
        S.sim.q0 = 1.6; S.sim.tr0 = [];
      },
      tick(S, dt) {
        const damp = S.sliders.damp != null ? S.sliders.damp : (S.sliders.mu != null ? (0.92 + 0.08 * S.sliders.mu) : 0.995);
        const Vq = S.sim.q;
        S.sim.p += -Vq * dt * 6;
        S.sim.q += S.sim.p * dt * 6;
        S.sim.p *= damp;
        S.sim.tr.push({ q: S.sim.q, p: S.sim.p });
        if (S.sim.tr.length > 200) S.sim.tr.shift();
        S.sim.q0 += -S.sim.q0 * dt * 1.8;
        S.sim.tr0.push(S.sim.q0);
        if (S.sim.tr0.length > 200) S.sim.tr0.shift();
        S.metrics.H = 0.5 * S.sim.p ** 2 + 0.5 * S.sim.q ** 2;
      },
      draw(ctx, S, T) {
        const cx = S.W * 0.35, cy = S.H / 2, sc = 55;
        ctx.strokeStyle = T.line; ctx.beginPath(); ctx.arc(cx, cy, 90, 0, TWO); ctx.stroke();
        ctx.strokeStyle = T.c7; ctx.beginPath();
        S.sim.tr.forEach((pt, i) => {
          const x = cx + pt.q * sc, y = cy - pt.p * sc;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
        ctx.fillStyle = T.c5;
        ctx.beginPath(); ctx.arc(cx + S.sim.q * sc, cy - S.sim.p * sc, 6, 0, TWO); ctx.fill();
        label(ctx, "相空间 (q,p) 哈密顿流  vs  右侧无动量 GD", 24, 22, T);
        ctx.strokeStyle = T.c2; ctx.beginPath();
        S.sim.tr0.forEach((q, i) => {
          const x = S.W * 0.7 + i * 0.4, y = S.H / 2 - q * 40;
          if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
        });
        ctx.stroke();
      },
    });

    add(["teleport", "fisher"], {
      init(S) {
        S.sim.left = 1; S.sim.right = 0.05;
        S.sim.pack = 0;
      },
      tick(S, dt) {
        const rate = S.sliders.rate != null ? S.sliders.rate : 1;
        const mode = Math.floor(S.t / 3) % 2;
        if (mode === 0) {
          S.sim.pack += dt * 0.35 * rate;
          if (S.sim.pack > 1) { S.sim.pack = 0; }
          S.sim.left = 1 - S.sim.pack; S.sim.right = 0.05 + S.sim.pack;
          S.metrics.模式 = "传输";
        } else {
          S.sim.left += (0.05 - S.sim.left) * dt * 1.5 * rate;
          S.sim.right += (1 - S.sim.right) * dt * 1.5 * rate;
          S.sim.pack = 0;
          S.metrics.模式 = "传送";
        }
      },
      draw(ctx, S, T) {
        ctx.fillStyle = T.c2;
        ctx.beginPath(); ctx.ellipse(160, 180, 30 + 50 * S.sim.left, 28 + 40 * S.sim.left, 0, 0, TWO); ctx.fill();
        ctx.fillStyle = T.c6;
        ctx.beginPath(); ctx.ellipse(460, 180, 30 + 50 * S.sim.right, 28 + 40 * S.sim.right, 0, 0, TWO); ctx.fill();
        if (S.metrics.模式 === "传输") {
          arrow(ctx, 220, 180, 160, 0, T.c5);
        } else {
          ctx.fillStyle = T.c4; ctx.font = "28px sans-serif"; ctx.fillText("↝", 300, 190);
        }
        label(ctx, "W₂ 传输要搬土；Fisher–Rao 传送可就地生灭", 28, 24, T);
      },
    });

    /* fallback already aliased via svgd */
    return R;
  }

  global.AnimEngine = { mount, createPlayer: mount };
})(window);
