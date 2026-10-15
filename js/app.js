/* Hash-routed SPA: home graph + per-operator lecture. */
(function () {
  "use strict";

  const DATA = window.APP_DATA;
  if (!DATA) {
    document.getElementById("view").innerHTML = "<p class='card'>未找到 APP_DATA，请先运行 tools/build.py。</p>";
    return;
  }
  const OPS = DATA.operators;
  const BY = {};
  OPS.forEach((o) => { BY[o.id] = o; });
  const CH = DATA.chapters;

  const view = document.getElementById("view");
  const q = document.getElementById("q");
  const res = document.getElementById("res");
  const chips = document.getElementById("chips");
  const themeBtn = document.getElementById("theme");
  let anim = null;
  let graph = null;
  let chFilter = 0;

  function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("op-theme", t); } catch (e) {}
  }
  try {
    const saved = localStorage.getItem("op-theme");
    if (saved) setTheme(saved);
  } catch (e) {}
  themeBtn.addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    setTheme(cur);
    route();
  });

  Object.keys(CH).sort().forEach((k) => {
    const meta = CH[k];
    const b = document.createElement("button");
    b.className = "chip";
    b.style.setProperty("--c", meta.color);
    b.textContent = meta.short;
    b.dataset.ch = k;
    b.addEventListener("click", () => {
      chFilter = chFilter === +k ? 0 : +k;
      [...chips.children].forEach((c) => c.classList.toggle("on", +c.dataset.ch === chFilter));
      if (graph) graph.filterCh(chFilter || null);
      document.querySelectorAll(".op-mini").forEach((el) => {
        el.style.display = !chFilter || +el.dataset.ch === chFilter ? "" : "none";
      });
    });
    chips.appendChild(b);
  });

  function search(text) {
    const t = (text || "").trim().toLowerCase();
    if (!t) return [];
    return OPS.filter((o) =>
      (o.name + o.name_en + o.id + o.section + o.definition + o.problem + (o.intuition || "") + (o.pseudo || "") + (o.excerpt || "") + ((o.katex || []).join(" "))).toLowerCase().includes(t)
    ).slice(0, 18);
  }
  q.addEventListener("input", () => {
    const hits = search(q.value);
    if (graph && typeof graph.highlightIds === "function") {
      if (!(q.value || "").trim()) graph.clearHighlight();
      else graph.highlightIds(hits.map((h) => h.id));
    }
    if (!hits.length) { res.hidden = true; res.innerHTML = ""; return; }
    res.hidden = false;
    res.innerHTML = hits.map((o) =>
      `<div data-id="${o.id}"><b>${esc(o.name)}</b><div class="mu">${esc(o.name_en)} · ${esc(o.section)}</div></div>`
    ).join("");
  });
  res.addEventListener("click", (e) => {
    const d = e.target.closest("[data-id]");
    if (!d) return;
    location.hash = "#/op/" + d.dataset.id;
    res.hidden = true;
    q.value = "";
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const hits = search(q.value);
      if (hits[0]) location.hash = "#/op/" + hits[0].id;
    }
    if (e.key === "Escape") { res.hidden = true; }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) res.hidden = true;
  });

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function katexEl(tex, display) {
    const d = document.createElement("div");
    d.className = display ? "katex-block" : "katex-inline";
    try {
      window.katex.render(tex, d, { displayMode: !!display, throwOnError: false, output: "html" });
    } catch (e) {
      d.textContent = tex;
      d.classList.add("katex-fallback");
    }
    return d;
  }

  function destroyAnim() {
    if (anim) { anim.destroy(); anim = null; }
    if (graph && typeof graph.destroy === "function") graph.destroy();
    graph = null;
  }

  function renderHome() {
    destroyAnim();
    const m = DATA.meta;
    view.innerHTML = `
      <section class="hero">
        <div class="card">
          <h1>陈智超论文 · 算子谱系交互讲义</h1>
          <p class="muted">${esc(m.thesis || "")}</p>
          <div class="kpis">
            <div class="kpi"><b>${m.total}</b><span class="muted">算子</span></div>
            <div class="kpi"><b>${m.edges}</b><span class="muted">谱系边</span></div>
            <div class="kpi"><b>${(m.by_tag && m.by_tag["明说"]) || 106}</b><span class="muted">明说 / ${(m.by_tag && m.by_tag["自证"]) || 14} 自证 / ${(m.by_tag && m.by_tag["推断"]) || 7} 推断</span></div>
          </div>
          <div class="home-ch">
            ${[2,3,4,5,6,7].map((c) => `<span style="border-color:${CH[c].color};color:${CH[c].color}">${esc(CH[c].title)} · ${m.by_chapter[c] || m.by_chapter[String(c)]}</span>`).join("")}
          </div>
          <p class="muted" style="margin-top:10px">滚轮缩放 · 拖动平移 · 悬停看祖先/下游（黄/绿）· 点击进入讲解。搜索框会在图上高亮命中。</p>
        </div>
        <div class="card">
          <h2>章级分叉</h2>
          <div class="split-list" id="splits"></div>
        </div>
      </section>
      <div class="card graph-wrap">
        <div class="ghint">谱系导航图 · 滚轮缩放 · 拖动平移</div>
        <div class="gbar">
          <button type="button" id="gfit">适应窗口</button>
          <button type="button" id="gclr">清除高亮</button>
        </div>
        <svg id="graph" role="img" aria-label="算子谱系图"></svg>
        <div class="legend">实线=明说 · 虚线=自证 · 点线=推断 · ! = 疑似笔误 · ◆=章级分叉 · 黄=上游 · 绿=下游</div>
      </div>
      <section class="home-list card">
        <h2>全部算子</h2>
        <div class="op-grid" id="grid"></div>
      </section>`;
    const splits = document.getElementById("splits");
    (DATA.splits || []).forEach((s) => {
      const el = document.createElement("div");
      el.className = "split";
      const after = (s["切换后算子"] || []).map(linkOp).join("");
      el.innerHTML = `<b>${esc(s.title)}</b><div class="muted">${esc(s.why || "")}</div>
        <div class="muted" style="margin-top:6px">${esc(s.choice || "")}</div>
        <div class="links" style="margin-top:8px">${after}</div>`;
      splits.appendChild(el);
    });
    const grid = document.getElementById("grid");
    OPS.forEach((o) => {
      const a = document.createElement("a");
      a.className = "op-mini";
      a.href = "#/op/" + o.id;
      a.dataset.ch = o.ch;
      a.innerHTML = `<b>${esc(o.name)}</b><span>${esc(o.name_en)}</span><span>${esc(o.section)}</span>`;
      a.style.borderLeft = "3px solid " + (CH[o.ch] || {}).color;
      grid.appendChild(a);
    });
    const svg = document.getElementById("graph");
    graph = window.GraphNav.mount(svg, DATA, {
      onSelect(id) { location.hash = "#/op/" + id; },
    });
    graph.fit();
    if (chFilter) graph.filterCh(chFilter);
    document.getElementById("gfit").addEventListener("click", () => graph.fit());
    document.getElementById("gclr").addEventListener("click", () => graph.clearHighlight());
  }

  function linkOp(id) {
    const o = BY[id];
    if (!o) return `<span class="lk">${esc(id)}</span>`;
    const c = (CH[o.ch] || {}).color || "#5b8cff";
    return `<a class="lk" href="#/op/${o.id}" style="border-left-color:${c}">${esc(o.name)}</a>`;
  }

  function renderOp(id) {
    destroyAnim();
    graph = null;
    const o = BY[id];
    if (!o) {
      view.innerHTML = `<div class="card"><p>找不到算子 ${esc(id)}</p><a href="#/">返回</a></div>`;
      return;
    }
    const color = (CH[o.ch] || {}).color;
    const idx = OPS.findIndex((x) => x.id === id);
    const prev = OPS[idx - 1];
    const next = OPS[idx + 1];
    view.innerHTML = `
      <div class="crumb">
        <a href="#/">谱系</a><span>/</span>
        <span>${esc(o.chapter_title)}</span><span>/</span>
        <strong>${esc(o.name)}</strong>
      </div>
      <div class="detail">
        <div>
          <div class="card op-head">
            <div class="tags">
              <span class="tag" style="border-color:${color};color:${color}">${esc(o.chapter)}</span>
              <span class="tag">${esc(o.tag)}</span>
              <span class="tag">${esc(o.section)}</span>
              <span class="tag">层级 ${o.level}</span>
            </div>
            <h1>${esc(o.name)}</h1>
            <div class="en">${esc(o.name_en)} · <code>${esc(o.id)}</code></div>
            ${o.flag ? `<div class="warnbox"><b>${esc(o.flag)}</b><div>${esc(o.note || "")}</div></div>` : (o.note ? `<div class="warnbox">${esc(o.note)}</div>` : "")}
            <div class="sec"><h2>直观解释</h2><p>${esc(o.intuition)}</p></div>
            <div class="sec"><h2>解决什么问题</h2><p>${esc(o.problem)}</p></div>
            <div class="sec"><h2>输入 / 输出</h2><p>${esc(o.io)}</p></div>
            <div class="sec"><h2>数学定义</h2><div id="math"></div>
              <p class="muted" style="margin-top:8px">论文原文定义式：${esc(o.definition)}</p>
            </div>
            <div class="sec"><h2>伪代码</h2><pre class="pseudo">${esc(o.pseudo)}</pre></div>
            <div class="sec"><h2>典型应用（过程工业 / 风电 / 软测量）</h2><ul class="list" id="apps"></ul></div>
            <div class="sec"><h2>优点</h2><ul class="list" id="pros"></ul></div>
            <div class="sec"><h2>局限</h2><ul class="list" id="cons"></ul></div>
            <div class="sec"><h2>相关算子</h2>
              <div class="muted">上游</div><div class="links" id="up"></div>
              <div class="muted" style="margin-top:8px">下游</div><div class="links" id="dn"></div>
              ${o.also_in && o.also_in.length ? `<div class="muted" style="margin-top:8px">同 id 另见</div><div class="also" id="also"></div>` : ""}
            </div>
            <div class="sec"><h2>参考资料</h2><ul class="list refs" id="refs"></ul></div>
            <div class="sec muted">原始出处：${esc(o.source)}<br>原文摘录：「${esc(o.excerpt)}」</div>
            <div class="sec nav-ops">
              ${prev ? `<a class="lk" href="#/op/${prev.id}">← ${esc(prev.name)}</a>` : ""}
              ${next ? `<a class="lk" href="#/op/${next.id}">${esc(next.name)} →</a>` : ""}
            </div>
          </div>
        </div>
        <div>
          <div class="card demo-card">
            <div class="demo-head">
              <h2>逐步动画演示</h2>
              <p class="demo-op-name">${esc(o.name)}</p>
              <p class="demo-op-en">${esc(o.name_en)}</p>
            </div>
            <p class="muted">播放 / 暂停 / 单步，观察数据如何被变换。可调滑块；← → 切换相邻算子。</p>
            <div class="demo-canvas-wrap"><canvas id="demo" width="640" height="360"></canvas></div>
            <div class="caption" id="cap"></div>
            <ol class="step-list" id="steplist">${(o.steps || []).map((s) => `<li>${esc(s)}</li>`).join("")}</ol>
            <div class="controls">
              <button class="primary" id="play" type="button">暂停</button>
              <button id="step" type="button">单步</button>
              <button id="reset" type="button">重置</button>
            </div>
            <div class="sliders" id="sliders"></div>
            <div class="metrics" id="met"></div>
          </div>
        </div>
      </div>`;

    const math = document.getElementById("math");
    (o.katex || []).forEach((tex) => math.appendChild(katexEl(tex, true)));
    const fillList = (id, arr) => {
      document.getElementById(id).innerHTML = (arr || []).map((x) => `<li>${esc(x)}</li>`).join("");
    };
    fillList("apps", o.apps);
    fillList("pros", o.pros);
    fillList("cons", o.cons);
    document.getElementById("up").innerHTML = (o.upstream || []).map(linkOp).join("") || "<span class='muted'>（根节点）</span>";
    document.getElementById("dn").innerHTML = (o.downstream || []).map(linkOp).join("") || "<span class='muted'>（叶节点）</span>";
    if (o.also_in && o.also_in.length && document.getElementById("also")) {
      document.getElementById("also").innerHTML = o.also_in.map((a) =>
        `<div class="muted">· ${esc(a["来源章"] || "")} · ${esc(a["章节公式"] || a["章节+公式号"] || "")}<br>${esc(a["定义式"] || "")}</div>`
      ).join("");
    }
    document.getElementById("refs").innerHTML = (o.refs || []).map((r) => {
      const kind = r.kind === "book" ? "书" : r.kind === "code" ? "代码" : "论文";
      return `<li>[${kind}] <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
        — ${esc(r.authors)} (${r.year}). ${esc(r.venue)}</li>`;
    }).join("");

    const sl = document.getElementById("sliders");
    const mk = (key, label, min, max, val, step) => {
      const lab = document.createElement("label");
      lab.innerHTML = `<span>${esc(label)}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-k="${key}"><span class="sv">${val}</span>`;
      sl.appendChild(lab);
    };
    mk("speed", "播放速度", 0.25, 2.5, 1, 0.05);
    (o.sliders || []).forEach((s) => mk(s.key, s.label, s.min, s.max, s.value, ((s.max - s.min) / 80)));

    const canvas = document.getElementById("demo");
    anim = window.AnimEngine.mount(canvas, {
      operator: o,
      captionEl: document.getElementById("cap"),
      metricsEl: document.getElementById("met"),
      stepsEl: document.getElementById("steplist"),
    });
    const playBtn = document.getElementById("play");
    playBtn.addEventListener("click", () => {
      if (anim.isPlaying()) { anim.pause(); playBtn.textContent = "播放"; }
      else { anim.play(); playBtn.textContent = "暂停"; }
    });
    document.getElementById("step").addEventListener("click", () => { anim.step(); playBtn.textContent = "播放"; });
    document.getElementById("reset").addEventListener("click", () => anim.reset());
    sl.addEventListener("input", (e) => {
      const inp = e.target.closest("input");
      if (!inp) return;
      const v = parseFloat(inp.value);
      inp.parentElement.querySelector(".sv").textContent = String(Math.round(v * 1000) / 1000);
      anim.setParam(inp.dataset.k, v);
    });
  }

  function route() {
    const h = location.hash || "#/";
    const m = h.match(/^#\/op\/([^/?#]+)/);
    if (m) renderOp(decodeURIComponent(m[1]));
    else renderHome();
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && !(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"))) {
      e.preventDefault();
      q.focus();
      return;
    }
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const m = (location.hash || "").match(/^#\/op\/([^/?#]+)/);
    if (!m) return;
    const idx = OPS.findIndex((x) => x.id === decodeURIComponent(m[1]));
    if (idx < 0) return;
    if (e.key === "ArrowLeft" && OPS[idx - 1]) location.hash = "#/op/" + OPS[idx - 1].id;
    if (e.key === "ArrowRight" && OPS[idx + 1]) location.hash = "#/op/" + OPS[idx + 1].id;
    if (e.key === " " && anim) {
      e.preventDefault();
      const playBtn = document.getElementById("play");
      if (!playBtn) return;
      if (anim.isPlaying()) { anim.pause(); playBtn.textContent = "播放"; }
      else { anim.play(); playBtn.textContent = "暂停"; }
    }
  });
  route();
})();
