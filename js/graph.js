/* Layered DAG navigation, pan/zoom, ancestor/descendant highlight. */
(function (global) {
  "use strict";

  const CH = {
    2: "#5b8cff",
    3: "#2dd4bf",
    4: "#a3e635",
    5: "#fbbf24",
    6: "#fb7185",
    7: "#c084fc",
  };

  function layout(ops, edges) {
    const M = {};
    ops.forEach((o) => { M[o.id] = o; o.up = []; o.dn = []; });
    edges.forEach((e) => {
      if (M[e.from] && M[e.to]) {
        M[e.to].up.push(e.from);
        M[e.from].dn.push(e.to);
      }
    });
    const memo = {};
    function dep(o) {
      if (memo[o.id] != null) return memo[o.id];
      let m = -1;
      o.up.forEach((u) => { m = Math.max(m, dep(M[u])); });
      return (memo[o.id] = m + 1);
    }
    ops.forEach((o) => { o.L = dep(o); });
    const NW = 168, NH = 42, GX = 292, GY = 52;
    const maxL = Math.max(...ops.map((o) => o.L));
    const cols = [];
    for (let i = 0; i <= maxL; i++) cols.push([]);
    ops.forEach((o) => cols[o.L].push(o));
    cols.forEach((c) => c.sort((a, b) => a.ch - b.ch || (a.id < b.id ? -1 : 1)));
    for (let it = 0; it < 6; it++) {
      for (let i = 1; i <= maxL; i++) {
        cols[i].forEach((o) => {
          const ys = o.up.map((u) => M[u].y).filter((y) => y != null);
          o.bc = ys.length ? ys.reduce((a, b) => a + b) / ys.length : o.y || 0;
        });
        cols[i].sort((a, b) => a.ch - b.ch || a.bc - b.bc);
        cols[i].forEach((o, k) => { o.y = k; });
      }
      if (it === 0) cols[0].forEach((o, k) => { o.y = k; });
      for (let i = maxL - 1; i >= 0; i--) {
        cols[i].forEach((o) => {
          const ys = o.dn.map((u) => M[u].y).filter((y) => y != null);
          o.bc = ys.length ? 0.6 * o.y + 0.4 * (ys.reduce((a, b) => a + b) / ys.length) : o.y;
        });
        cols[i].sort((a, b) => a.ch - b.ch || a.bc - b.bc);
        cols[i].forEach((o, k) => { o.y = k; });
      }
    }
    const H = Math.max(...cols.map((c) => c.length)) * GY;
    cols.forEach((c, i) => c.forEach((o, k) => {
      const off = (H - c.length * GY) / 2;
      o.y = k * GY + off + 64;
      o.x = i * GX + 36;
    }));
    return { ops, M, cols, NW, NH, maxL, width: (maxL + 1) * GX + 80, height: H + 140 };
  }

  function ancestors(M, id) {
    const s = new Set();
    const st = [...(M[id].up || [])];
    while (st.length) {
      const u = st.pop();
      if (s.has(u) || !M[u]) continue;
      s.add(u);
      (M[u].up || []).forEach((x) => st.push(x));
    }
    return s;
  }
  function descendants(M, id) {
    const s = new Set();
    const st = [...(M[id].dn || [])];
    while (st.length) {
      const u = st.pop();
      if (s.has(u) || !M[u]) continue;
      s.add(u);
      (M[u].dn || []).forEach((x) => st.push(x));
    }
    return s;
  }

  function palette() {
    const dark = document.documentElement.getAttribute("data-theme") !== "light";
    return {
      dark,
      nodeFill: dark ? "#152038" : "#ffffff",
      tx: dark ? "#e8eef9" : "#152038",
      mu: dark ? "#8b98b5" : "#5b6880",
      edge: dark ? "#4a5878" : "#9aa6bf",
      lane: dark ? "#6b7a99" : "#7a869c",
    };
  }

  function mount(svg, data, opts) {
    const NS = "http://www.w3.org/2000/svg";
    const $ = (t, a, p) => {
      const e = document.createElementNS(NS, t);
      for (const k in a) e.setAttribute(k, a[k]);
      if (p) p.appendChild(e);
      return e;
    };
    const pal = palette();
    svg.innerHTML = "";
    svg.style.fontFamily = '"Noto Sans SC","Noto Sans CJK SC","WenQuanYi Micro Hei","Droid Sans Fallback","PingFang SC","Microsoft YaHei",system-ui,sans-serif';
    const defs = $("defs", {}, svg);
    const mk = (id, fill) => {
      const m = $("marker", { id, viewBox: "0 0 8 8", refX: "7", refY: "4", markerWidth: "6", markerHeight: "6", orient: "auto" }, defs);
      $("path", { d: "M0,0L8,4L0,8z", fill }, m);
    };
    mk("ar", pal.edge);
    mk("aru", "#ffd166");
    mk("ard", "#6ee7b7");
    const L = layout(data.operators.map((o) => Object.assign({}, o)), data.edges);
    const vp = $("g", { id: "gvp" }, svg);
    const gE = $("g", {}, vp), gN = $("g", {}, vp);
    const trunc = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "…" : s || "");

    L.cols.forEach((c, i) => {
      const t = $("text", { class: "lane-lab", x: i * 292 + 36 + 84, y: 28, "text-anchor": "middle", fill: pal.lane, "font-size": "11" }, gE);
      t.textContent = "LAYER " + i;
    });

    const ed = [];
    data.edges.forEach((e) => {
      const a = L.M[e.from], b = L.M[e.to];
      if (!a || !b) return;
      const x1 = a.x + L.NW, y1 = a.y + L.NH / 2, x2 = b.x, y2 = b.y + L.NH / 2;
      const dx = Math.max(40, (x2 - x1) * 0.45);
      const p = $("path", {
        class: "edge",
        d: `M${x1},${y1}C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`,
        fill: "none", stroke: pal.edge, "stroke-width": "1.1", opacity: "0.45",
        "marker-end": "url(#ar)",
      }, gE);
      ed.push({ a, b, p });
    });

    L.ops.forEach((o) => {
      const c = CH[o.ch] || "#8b98b5";
      const g = $("g", { class: "node", transform: `translate(${o.x},${o.y})`, style: "cursor:pointer" }, gN);
      const dash = o.tag === "自证" ? "7 3.5" : o.tag === "推断" ? "2.2 3.2" : "none";
      $("rect", { class: "b", width: L.NW, height: L.NH, rx: "9", fill: pal.nodeFill, stroke: c, "stroke-width": "2", "stroke-dasharray": dash }, g);
      $("rect", { width: "5", height: L.NH, fill: c, rx: "2" }, g);
      $("text", { x: "14", y: "18", fill: pal.tx, "font-size": "12.5", "font-weight": "650", "font-family": "inherit" }, g).textContent = trunc(o.name, 12);
      $("text", { x: "14", y: "34", fill: pal.mu, "font-size": "9.5", "font-family": "inherit" }, g).textContent = trunc(o.name_en, 28);
      const tip = $("title", {}, g);
      tip.textContent = (o.name || "") + " · " + (o.id || "") + " · " + (o.section || "");
      if (o.flag) {
        $("circle", { cx: L.NW - 2, cy: -2, r: "8", fill: "#fbbf24" }, g);
        $("text", { x: L.NW - 2, y: "2", fill: "#1a1000", "font-size": "11", "font-weight": "900", "text-anchor": "middle" }, g).textContent = "!";
      }
      g.addEventListener("pointerenter", () => highlight(o.id));
      g.addEventListener("pointerleave", () => {
        if (!pinned) clearHighlight();
      });
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (opts && opts.onSelect) opts.onSelect(o.id);
      });
      o.g = g;
    });

    const gF = $("g", { id: "forks" }, vp);
    (data.splits || []).forEach((s) => {
      const ids = s["切换后算子"] || [];
      const pts = ids.map((id) => L.M[id]).filter(Boolean);
      if (!pts.length) return;
      const x = Math.min(...pts.map((o) => o.x)) - 28;
      const y = pts.reduce((a, o) => a + o.y, 0) / pts.length + L.NH / 2;
      const g = $("g", { class: "fork", transform: `translate(${x},${y})`, style: "cursor:pointer" }, gF);
      $("polygon", { points: "0,-12 12,0 0,12 -12,0", fill: "#ff4d6d", stroke: "#fff", "stroke-width": "1.4" }, g);
      $("text", { x: "0", y: "4", fill: "#fff", "font-size": "10", "font-weight": "800", "text-anchor": "middle" }, g).textContent = "◆";
      const t = $("title", {}, g);
      t.textContent = s.title || "章级分叉";
      g.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (ids[0] && opts && opts.onSelect) opts.onSelect(ids[0]);
      });
    });

    let pinned = null;
    function highlight(id) {
      if (!L.M[id]) return;
      const up = ancestors(L.M, id);
      const dn = descendants(L.M, id);
      L.ops.forEach((o) => {
        const on = o.id === id || up.has(o.id) || dn.has(o.id);
        o.g.classList.toggle("dim", !on);
        o.g.style.opacity = on ? "1" : "0.14";
      });
      ed.forEach(({ a, b, p }) => {
        const isUp = b.id === id && up.has(a.id);
        const isDn = a.id === id && dn.has(b.id);
        p.setAttribute("stroke", isUp ? "#ffd166" : isDn ? "#6ee7b7" : pal.edge);
        p.setAttribute("stroke-width", isUp || isDn ? "2.2" : "1.1");
        p.setAttribute("opacity", isUp || isDn ? "1" : "0.12");
        p.setAttribute("marker-end", isUp ? "url(#aru)" : isDn ? "url(#ard)" : "url(#ar)");
      });
    }
    function highlightIds(ids) {
      const set = new Set(ids || []);
      L.ops.forEach((o) => {
        o.g.style.opacity = set.has(o.id) ? "1" : "0.12";
      });
      ed.forEach(({ a, b, p }) => {
        const on = set.has(a.id) && set.has(b.id);
        p.setAttribute("opacity", on ? "0.55" : "0.06");
        p.setAttribute("stroke", pal.edge);
        p.setAttribute("marker-end", "url(#ar)");
      });
    }
    function clearHighlight() {
      pinned = null;
      L.ops.forEach((o) => { o.g.style.opacity = "1"; o.g.classList.remove("dim"); });
      ed.forEach(({ p }) => {
        p.setAttribute("stroke", pal.edge);
        p.setAttribute("stroke-width", "1.1");
        p.setAttribute("opacity", "0.45");
        p.setAttribute("marker-end", "url(#ar)");
      });
    }

    let vx = 20, vy = 0, sc = 0.72;
    function apply() { vp.setAttribute("transform", `translate(${vx},${vy}) scale(${sc})`); }
    apply();

    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      if (e.target.closest && e.target.closest(".node")) return;
      drag = { x: e.clientX, y: e.clientY, vx, vy };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      vx = drag.vx + (e.clientX - drag.x);
      vy = drag.vy + (e.clientY - drag.y);
      apply();
    });
    svg.addEventListener("pointerup", () => { drag = null; });
    svg.addEventListener("wheel", (e) => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.08 : 0.92;
      const nsc = clamp(sc * k, 0.22, 2.4);
      const r = svg.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      vx = px - (px - vx) * (nsc / sc);
      vy = py - (py - vy) * (nsc / sc);
      sc = nsc;
      apply();
    }, { passive: false });

    function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

    function filterCh(ch) {
      L.ops.forEach((o) => {
        const on = !ch || o.ch === ch;
        o.g.style.display = on ? "block" : "none";
      });
      ed.forEach(({ a, b, p }) => {
        const on = !ch || (a.ch === ch && b.ch === ch);
        p.style.display = on ? "block" : "none";
      });
      const forks = vp.querySelector("#forks");
      if (forks) forks.style.display = ch ? "none" : "block";
    }

    function fit() {
      const r = svg.getBoundingClientRect();
      const w = r.width, h = r.height;
      if (w < 8 || h < 8) return false;
      sc = Math.min(w / L.width, h / L.height) * 0.92;
      vx = 10; vy = 8;
      apply();
      return true;
    }

    const onResize = () => { if (!pinned) fit(); };
    window.addEventListener("resize", onResize);
    let roFit = null;
    if (typeof ResizeObserver !== "undefined") {
      roFit = new ResizeObserver(() => { if (!pinned) fit(); });
      roFit.observe(svg);
    }
    requestAnimationFrame(() => {
      if (!fit()) requestAnimationFrame(fit);
    });

    const orig = { select: highlight, highlight, highlightIds, filterCh, fit, clearHighlight, layout: L };
    orig.destroy = () => {
      window.removeEventListener("resize", onResize);
      if (roFit) roFit.disconnect();
    };
    return orig;
  }

  global.GraphNav = { mount };
})(window);
