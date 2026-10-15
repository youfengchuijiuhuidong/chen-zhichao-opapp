/* Hash-routed SPA: home graph + per-operator lecture. */
(function () {
  "use strict";

  function loadOperatorsData() {
    if (window.OP_DATA) return window.OP_DATA;
    if (window.APP_DATA) return window.APP_DATA;
    return null;
  }
  window.loadOperatorsData = loadOperatorsData;

  const DATA = loadOperatorsData();
  if (!DATA) {
    document.getElementById("view").innerHTML = "<p class='card'>未找到 OP_DATA。请确认已加载 data/operators.js（file:// 双击 index.html 即可）。</p>";
    return;
  }
  window.APP_DATA = DATA;
  const OPS = DATA.operators;
  const BY = {};
  OPS.forEach((o) => { BY[o.id] = o; });
  const CH = DATA.chapters;
  const EDGES = DATA.edges || [];

  const view = document.getElementById("view");
  const q = document.getElementById("q");
  const res = document.getElementById("res");
  const chips = document.getElementById("chips");
  const themeBtn = document.getElementById("theme");
  let anim = null;
  let graph = null;
  let chFilter = 0;

  const SLIDER_HINT = {
    mix: "加大左峰权重：边缘更偏左、右峰被稀释——看直方图如何被「混合」出来",
    beta: "加大这项：变分更贴（或 KL 更重）。贴太紧会后验塌缩，重建变糊",
    tpos: "滑动凸组合 t：绿点沿曲线、黄点沿弦，竖直间隙就是 Jensen 缺口",
    sep: "拉开两坨分布：KL / W₂ 代价按间距迅速变大（交叉匹配更贵）",
    rate: "加快迭代：粒子或权重更快到达目标；过大可能过冲",
    eps: "加大步长 ε：一步跨得更远。传输里体积被压得更狠，密度应升高；过大则振荡",
    z0: "移动参考点：切线跟着走，竖直间隙 = Bregman 散度",
    eta: "加大镜像步长：对偶空间走得更远，softmax 回家后单纯形上跳得更猛",
    spread: "加大散布：分布摊平、熵升高；NER 页会被 −H 往回压尖",
    vx: "加大流速：质量团更快被吹向下游。盯住 ∑Q——周期边界下总量应守恒",
    uamp: "加大控制幅度：轨迹被拧得更弯，能量 / 代价通常上升",
    sig: "加大噪声：粒子更散、滤波更不确定，得分箭头更抖",
    v: "加大核带宽：影响范围变宽，粒子交互更「糊」",
    miss: "提高缺失率：更多格子变空洞，补全更难",
    hid: "加大隐层增益：非线性更强，ReLU 输出幅度上升",
    gap: "加大漂移差：两条路径分得更开，Girsanov 指数代价升高",
    rho: "加大罚参数 ρ：ADMM 把 w+v 残差压得更紧，但可能振荡",
    n: "提高样本上限：蒙特卡洛估计更稳，方差下降",
    selfloop: "加大自环：对角占权上升，归一化后邻接更「自我」",
    damp: "加大阻尼：哈密顿轨道能量泄漏，逐渐螺旋进中心",
    mu: "加大动量：更新带惯性，过冲后仍往前冲",
    obs: "提高观测精度：似然椭圆变瘦，后验被钉得更死",
    speed: "加快播放：同一周期里阶段切换更勤，便于扫完整条 Timeline",
  };
  const SLIDER_TITLE = {
    mix: "混合权重",
    beta: "贴合 / KL 权重",
    tpos: "凸组合位置",
    sep: "分布间距",
    rate: "迭代速度",
    eps: "步长 ε",
    z0: "参考点",
    eta: "镜像步长",
    spread: "散布",
    vx: "流速",
    uamp: "控制幅度",
    sig: "噪声强度",
    v: "核带宽",
    miss: "缺失率",
    hid: "隐层增益",
    gap: "漂移差",
    rho: "罚参数 ρ",
    n: "样本上限",
    selfloop: "自环权重",
    damp: "阻尼",
    mu: "动量",
    obs: "观测精度",
    speed: "播放速度",
  };
  const SYMBOL_MAP = {
    mixture: "蓝=边缘密度；青绿 / 粉=两个混合分量；底部圆点=按权重抽样的 x",
    elbo: "蓝=log p(x)；绿=ELBO；间隙=KL。黄点=当前变分参数",
    jensen: "蓝=凹函数；黄虚线=弦（基准）；绿点在曲线上、黄点在弦上",
    kl: "蓝 / 粉=一对密度。拉开滑块看 KL 不对称地变大",
    varfit: "灰=多峰后验；蓝=单高斯 Q；黄点=Q 样本；右柱=KL 示意",
    emloop: "绿折线=ELBO；色块在 E / M 之间切换",
    encoder: "蓝 x → 紫编码器 → 橙 z → 青重建。KL 权太大易塌缩",
    vae: "蓝 x → 紫编码器 → 橙 z → 青重建。KL 权太大易塌缩",
    gd: "蓝=势能碗；粉点=当前 z；橙箭头=−∇F",
    bregman: "蓝=凸势；橙=切线（基准）；竖直间隙=Bregman",
    mirror: "左=单纯形上的状态；右=对偶空间；橙点=当前分布",
    kems: "左=单纯形上的状态；右=对偶空间；橙点=当前分布",
    simplex: "三角形=概率单纯形；蓝点=行向量（非负且和为 1）",
    w2: "蓝云=源；粉云=目标；橙点沿最短平方路径搬迁",
    entropy: "蓝填充=密度 Q；黄点=固定高斯样本 x=σ z₀（不闪烁）；绿柱=熵",
    transport: "蓝网格=体积元；填充深浅=1/|det ∇T|；橙箭头=速度场 φ",
    continuity: "蓝格=密度 Q；橙箭头=通量；∑Q 在周期边界下应近似守恒",
    ode: "彩线=受控轨迹 ż=f+u；橙=控制把轨迹拧弯",
    lookahead: "灰虚线=偷看未来的全局最优；橙实线=只看当前 y 的局部重规划",
    pmp: "蓝=状态 z；紫=协态 λ；橙=控制 u。有限时域标 λ(T)=∇ψ，无穷时域看渐近包络",
    adjoint: "蓝=正向状态；紫=反向伴随；灰虚线=基准目标",
    mask: "蓝格=观测钉死；青绿=正在填的空洞",
    score: "蓝箭头场=得分；黄点=粒子。指向更可能的方向",
    stein: "蓝箭头场=Stein 核；黄点=粒子",
    kernel: "绿晕=RBF 核包；黄点=中心",
    align: "蓝=源域云；粉=目标域；橙线=对齐",
    svgd: "蓝粒子；粉椭圆=后验模态。核化互斥 + 得分牵引",
    pfg: "蓝粒子；预条件让扁分布走得更匀",
    dirac: "黄曲线=平滑密度；粉针=点质量。带宽→0 成 δ",
    sde: "蓝路径=漂移+布朗；黄点=均值",
    filter: "四拍：先验 → 发射 → 控制 → Schur 校正",
    mpnn: "蓝节点=特征；橙点沿边=正在传的消息",
    nam: "左=二值邻接；右=对称归一化。黄框=当前行",
    mc: "圆内青绿 / 圆外粉；右侧黄柱=π 估计、蓝柱=真值",
    weights: "圆点大小=权重；底栏直方图随时间重分配",
    embed: "方框从左到右：输入 → 嵌入 → 残差 → ReLU",
    residual: "方框从左到右：输入 → 嵌入 → 残差 → ReLU",
    relu: "方框从左到右：输入 → 嵌入 → 残差 → ReLU",
    girsanov: "蓝=参考路径；粉=变漂移路径。间距能量=½∫‖ν‖²",
    admm: "三块交替：蓝 w、橙 v、紫 λ",
    schur: "蓝=先验椭圆；粉=控制；绿=后验（精度相加）",
    planar: "紫点=被平面流拧弯的网格",
    hamiltonian: "紫轨迹=相空间 (q,p)；右蓝=无动量 GD（基准）",
    momentum: "紫轨迹=带动量；右蓝=无动量（基准）",
    hamflow: "紫轨迹=哈密顿流；右蓝=无动量（基准）",
    teleport: "蓝/粉椭圆=两端质量；橙箭头=搬运，绿闪=就地生灭",
    fisher: "蓝/粉椭圆=两端质量；橙箭头=搬运，绿闪=就地生灭",
  };

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
  buildToc();
  const tocBtn = document.getElementById("toc-toggle");
  const tocClose = document.getElementById("toc-close");
  const tocBd = document.getElementById("toc-backdrop");
  if (tocBtn) tocBtn.addEventListener("click", () => setTocOpen(!document.body.classList.contains("toc-open")));
  if (tocClose) tocClose.addEventListener("click", () => setTocOpen(false));
  if (tocBd) tocBd.addEventListener("click", () => setTocOpen(false));
  const tocPanel = document.getElementById("toc-panel");
  if (tocPanel) tocPanel.hidden = false;

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
        const on = !chFilter || +el.dataset.ch === chFilter;
        el.style.opacity = on ? "1" : "0.28";
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
  function applySearchSpotlight() {
    if (!graph || typeof graph.highlightIds !== "function") return;
    const t = (q.value || "").trim();
    if (!t) {
      graph.clearHighlight();
      if (chFilter) graph.filterCh(chFilter);
      return;
    }
    const hits = search(q.value);
    graph.highlightIds(hits.map((h) => h.id));
  }
  q.addEventListener("input", () => {
    const hits = search(q.value);
    applySearchSpotlight();
    if (!hits.length) { res.hidden = true; res.innerHTML = ""; return; }
    res.hidden = false;
    res.innerHTML = hits.map((o) =>
      `<div data-id="${o.id}"><b>${esc(o.name)}</b><div class="mu">${esc(o.name_en)} · ${esc(o.section)}</div></div>`
    ).join("");
  });
  res.addEventListener("click", (e) => {
    const d = e.target.closest("[data-id]");
    if (!d) return;
    rememberOp(d.dataset.id);
    location.hash = "#/op/" + d.dataset.id;
    res.hidden = true;
    q.value = "";
  });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const hits = search(q.value);
      if (hits[0]) {
        rememberOp(hits[0].id);
        location.hash = "#/op/" + hits[0].id;
      }
    }
    if (e.key === "Escape") { res.hidden = true; }
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) res.hidden = true;
  });

  function rememberOp(id) {
    if (graph && typeof graph.rememberOp === "function") graph.rememberOp(id);
    else {
      const prev = (window.GraphNav && GraphNav.readViewport && GraphNav.readViewport()) || {};
      if (window.GraphNav && GraphNav.writeViewport) {
        GraphNav.writeViewport({
          panX: prev.panX || 20,
          panY: prev.panY || 0,
          scale: prev.scale || 0.72,
          lastOpId: id,
        });
      }
    }
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  const katexCache = new Map();
  function katexEl(tex, display) {
    const key = (display ? "d|" : "i|") + tex;
    let proto = katexCache.get(key);
    if (proto) return proto.cloneNode(true);
    const d = document.createElement("div");
    d.className = display ? "katex-block" : "katex-inline";
    try {
      window.katex.render(tex, d, { displayMode: !!display, throwOnError: false, output: "html" });
    } catch (e) {
      d.textContent = tex;
      d.classList.add("katex-fallback");
    }
    katexCache.set(key, d.cloneNode(true));
    return d;
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.hidden = true; }, 1800);
  }
  function copyText(text) {
    const done = () => toast("已复制");
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else fallback();
    function fallback() {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); done(); } catch (e) { toast("复制失败"); }
      ta.remove();
    }
  }

  function parseRoute() {
    const h = location.hash || "#/";
    const m = h.match(/^#\/op\/([^/?#]+)(?:\?(.*))?/);
    if (!m) return { kind: "home" };
    const params = {};
    (m[2] || "").split("&").forEach((pair) => {
      if (!pair) return;
      const i = pair.indexOf("=");
      const k = decodeURIComponent(i < 0 ? pair : pair.slice(0, i));
      const v = decodeURIComponent(i < 0 ? "" : pair.slice(i + 1));
      if (k) params[k] = v;
    });
    return {
      kind: "op",
      id: decodeURIComponent(m[1]),
      hl: params.hl || params.highlight || "",
    };
  }
  function makeOpHash(id, hl) {
    return "#/op/" + encodeURIComponent(id) + (hl ? "?hl=" + encodeURIComponent(hl) : "");
  }
  function pageUrl(id, hl) {
    const hash = makeOpHash(id, hl);
    try { return location.href.replace(/#.*$/, "") + hash; } catch (e) { return hash; }
  }

  let currentOpId = null;
  let pinnedSym = null;
  let currentSymbols = [];

  function destroyAnimOnly() {
    if (anim) { anim.destroy(); anim = null; }
  }
  function destroyAnim() {
    destroyAnimOnly();
    if (graph && typeof graph.destroy === "function") graph.destroy();
    graph = null;
  }

  function setTocOpen(open) {
    document.body.classList.toggle("toc-open", !!open);
    const panel = document.getElementById("toc-panel");
    const bd = document.getElementById("toc-backdrop");
    const btn = document.getElementById("toc-toggle");
    if (panel) panel.hidden = false;
    if (bd) bd.hidden = !open;
    if (btn) btn.setAttribute("aria-expanded", open ? "true" : "false");
    try { localStorage.setItem("op-toc-open", open ? "1" : "0"); } catch (e) {}
  }
  function buildToc() {
    const body = document.getElementById("toc-body");
    if (!body || body.dataset.ready) return;
    body.dataset.ready = "1";
    Object.keys(CH).sort().forEach((k) => {
      const meta = CH[k];
      const ops = OPS.filter((o) => +o.ch === +k);
      const det = document.createElement("details");
      det.className = "toc-ch";
      det.dataset.ch = k;
      det.open = true;
      const sum = document.createElement("summary");
      sum.innerHTML = `<i class="dot" style="background:${meta.color}"></i><span>${esc(meta.title)}</span><span class="n">${ops.length}</span>`;
      det.appendChild(sum);
      const ul = document.createElement("ul");
      ops.forEach((o) => {
        const li = document.createElement("li");
        li.innerHTML = `<a href="#/op/${o.id}" data-id="${o.id}">${esc(o.name)}</a>`;
        ul.appendChild(li);
      });
      det.appendChild(ul);
      body.appendChild(det);
    });
    body.addEventListener("click", (e) => {
      const a = e.target.closest("a[data-id]");
      if (!a) return;
      rememberOp(a.dataset.id);
      if (window.matchMedia && !window.matchMedia("(min-width: 1240px)").matches) setTocOpen(false);
    });
  }
  function syncToc(id) {
    const o = BY[id];
    document.querySelectorAll("#toc-body a").forEach((a) => {
      a.classList.toggle("on", a.dataset.id === id);
    });
    document.querySelectorAll("#toc-body .toc-ch").forEach((d) => {
      if (o) d.open = +d.dataset.ch === +o.ch;
    });
    const on = document.querySelector("#toc-body a.on");
    if (on && on.scrollIntoView) on.scrollIntoView({ block: "nearest" });
  }

  function hoverSpec(symId) {
    return currentSymbols.find((s) => s.id === symId) || null;
  }
  function applyHover(symId, pin) {
    const spec = symId ? hoverSpec(symId) : null;
    if (pin) pinnedSym = spec ? spec.id : null;
    if (anim && typeof anim.setHover === "function") anim.setHover(spec);
    document.querySelectorAll(".sym-hit").forEach((el) => {
      el.classList.toggle("is-on", !!(spec && el.dataset.sym === spec.id));
    });
    document.querySelectorAll(".sym-chip").forEach((el) => {
      el.classList.toggle("on", !!(spec && el.dataset.sym === spec.id));
    });
    document.querySelectorAll(".color-legend [data-hit]").forEach((el) => {
      el.classList.toggle("pulse", !!(spec && spec.targets && spec.targets.indexOf(el.dataset.hit) >= 0));
    });
  }
  function decorateFormulas(root) {
    if (!root) return;
    root.querySelectorAll(".sym-hit").forEach((el) => {
      el.classList.remove("sym-hit", "is-on");
      delete el.dataset.sym;
      el.removeAttribute("tabindex");
      el.removeAttribute("title");
    });
    if (!currentSymbols.length) return;
    const glyphs = [];
    currentSymbols.forEach((s) => {
      (s.glyphs || []).forEach((g) => glyphs.push({ g, id: s.id, label: s.label }));
    });
    glyphs.sort((a, b) => b.g.length - a.g.length);
    root.querySelectorAll(".katex span").forEach((el) => {
      if (el.closest(".sym-hit")) return;
      if (el.querySelector("span")) return;
      const t = (el.textContent || "").replace(/\s+/g, "");
      if (!t) return;
      const hit = glyphs.find((x) => x.g === t);
      if (!hit) return;
      el.classList.add("sym-hit");
      el.dataset.sym = hit.id;
      el.setAttribute("tabindex", "0");
      el.setAttribute("title", "悬停高亮画布：" + hit.label);
    });
  }

  function chapterSiblings(o) {
    return OPS.filter((x) => x.ch === o.ch);
  }

  function renderHome() {
    destroyAnim();
    currentOpId = null;
    pinnedSym = null;
    currentSymbols = [];
    document.body.classList.remove("page-op");
    syncToc("");
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
          <p class="muted" style="margin-top:10px">滚轮缩放 · 拖动平移 · 离开后再回来会恢复视口，上次点过的节点会呼吸两秒。搜索 / 章节用 Spotlight（非匹配变淡到 0.12，不删节点）。</p>
        </div>
        <div class="card">
          <h2>章级分叉</h2>
          <div class="split-list" id="splits"></div>
        </div>
      </section>
      <div class="card graph-wrap">
        <div class="ghint">谱系导航图 · 视口写入 sessionStorage · lastOpId 呼吸高亮</div>
        <div class="gbar">
          <button type="button" id="gfit">适应窗口</button>
          <button type="button" id="gclr">清除高亮</button>
        </div>
        <svg id="graph" role="img" aria-label="算子谱系图"></svg>
        <div class="legend">实线=明说 · 虚线=自证 · 点线=推断 · ! = 疑似笔误 · ◆=章级分叉 · 黄=上游 · 绿=下游 · 淡化=Spotlight 非匹配</div>
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
      a.addEventListener("click", () => rememberOp(o.id));
      grid.appendChild(a);
    });
    const svg = document.getElementById("graph");
    graph = window.GraphNav.mount(svg, DATA, {
      onSelect(id) { rememberOp(id); location.hash = "#/op/" + id; },
    });
    if (chFilter) graph.filterCh(chFilter);
    if ((q.value || "").trim()) applySearchSpotlight();
    document.getElementById("gfit").addEventListener("click", () => graph.fit());
    document.getElementById("gclr").addEventListener("click", () => {
      q.value = "";
      res.hidden = true;
      graph.clearHighlight();
    });
  }

  function linkOp(id) {
    const o = BY[id];
    if (!o) return `<span class="lk">${esc(id)}</span>`;
    const c = (CH[o.ch] || {}).color || "#5b8cff";
    return `<a class="lk" href="#/op/${o.id}" style="border-left-color:${c}">${esc(o.name)}</a>`;
  }

  function lineageIds(o) {
    const ups = (o.upstream || []).filter((id) => BY[id]);
    const dns = (o.downstream || []).filter((id) => BY[id]);
    const extraUp = [];
    const extraDn = [];
    EDGES.forEach((e) => {
      if (e.to === o.id && ups.indexOf(e.from) < 0) extraUp.push(e.from);
      if (e.from === o.id && dns.indexOf(e.to) < 0) extraDn.push(e.to);
    });
    const pre = ups.concat(extraUp).filter((id, i, a) => a.indexOf(id) === i && BY[id]);
    const post = dns.concat(extraDn).filter((id, i, a) => a.indexOf(id) === i && BY[id]);
    return { pre, post };
  }
  function linCard(id, extraClass) {
    const x = BY[id];
    if (!x) return "";
    const c = (CH[x.ch] || {}).color || "#5b8cff";
    return `<a class="lin-card ${extraClass || ""}" href="#/op/${x.id}" style="--cc:${c}">
      <span class="lin-name">${esc(x.name)}</span>
      <span class="lin-sec">${esc(x.section)}</span>
    </a>`;
  }
  function linCards(ids, limit) {
    limit = limit || 4;
    if (!ids.length) return "<span class='muted'>（无）</span>";
    const shown = ids.slice(0, limit);
    const more = ids.length - shown.length;
    return shown.map((id) => linCard(id)).join("") + (more ? `<span class="lin-more">+${more}</span>` : "");
  }
  function lineageHtml(o) {
    const { pre, post } = lineageIds(o);
    const color = (CH[o.ch] || {}).color || "#5b8cff";
    return `<div class="lin-col">
        <span class="lin-k">前置依赖</span>
        <div class="lin-cards">${pre.length ? linCards(pre) : "<span class='muted'>（根节点）</span>"}</div>
      </div>
      <div class="lin-arrow" aria-hidden="true">→</div>
      <div class="lin-card is-current" aria-current="page" style="--cc:${color}">
        <span class="lin-k">当前</span>
        <span class="lin-name">${esc(o.name)}</span>
        <span class="lin-sec">${esc(o.section)}</span>
      </div>
      <div class="lin-arrow" aria-hidden="true">→</div>
      <div class="lin-col">
        <span class="lin-k">衍生算子</span>
        <div class="lin-cards">${post.length ? linCards(post) : "<span class='muted'>（叶节点）</span>"}</div>
      </div>`;
  }

  function opShellHtml() {
    return `<div id="op-page">
      <div class="crumb" id="crumb"></div>
      <details class="ch-toc" id="ch-toc">
        <summary>本章算子（键盘 ← → 同章切换）</summary>
        <div class="ch-toc-list" id="ch-toc-list"></div>
      </details>
      <nav class="lineage" id="lineage" aria-label="局部谱系"></nav>
      <div class="detail">
        <div class="detail-col detail-text">
          <div class="card op-head">
            <div class="op-toolbar">
              <button type="button" class="lk" id="copy-link">复制本页链接</button>
            </div>
            <div class="tags" id="tags"></div>
            <h1 id="op-title"></h1>
            <div class="en" id="op-en"></div>
            <div class="warnbox" id="warn" hidden></div>
            <section class="layer layer-1">
              <h2>直觉速览</h2>
              <p id="intuit"></p>
              <p class="muted" id="problem"></p>
            </section>
            <section class="layer layer-2">
              <h2>符号与画面对照</h2>
              <p class="symbol-map" id="symbol-map"></p>
              <div class="sym-chips" id="sym-chips"></div>
              <div id="math"></div>
              <p class="muted" id="io"></p>
              <ol class="step-preview" id="step-preview"></ol>
            </section>
            <details class="layer layer-3" id="layer-strict">
              <summary>严谨定义（展开公式、伪代码与文献）</summary>
              <div class="sec"><h2>数学定义</h2>
                <p class="muted" id="definition"></p>
              </div>
              <div class="sec"><h2>伪代码</h2><pre class="pseudo" id="pseudo"></pre></div>
              <div class="sec"><h2>典型应用（过程工业 / 风电 / 软测量）</h2><ul class="list" id="apps"></ul></div>
              <div class="sec"><h2>优点</h2><ul class="list" id="pros"></ul></div>
              <div class="sec"><h2>局限</h2><ul class="list" id="cons"></ul></div>
              <div class="sec"><h2>参考资料</h2><ul class="list refs" id="refs"></ul></div>
              <div class="sec muted" id="source"></div>
            </details>
            <div class="sec"><h2>相关算子</h2>
              <div class="muted">上游</div><div class="links" id="up"></div>
              <div class="muted" style="margin-top:8px">下游</div><div class="links" id="dn"></div>
              <div id="also-wrap" hidden><div class="muted" style="margin-top:8px">同 id 另见</div><div class="also" id="also"></div></div>
            </div>
            <div class="sec nav-ops" id="nav-ops"></div>
          </div>
        </div>
        <div class="detail-col detail-demo">
          <div class="card demo-card">
            <div class="demo-head">
              <h2>逐步动画演示</h2>
              <p class="demo-op-name" id="demo-name"></p>
              <p class="demo-op-en" id="demo-en"></p>
            </div>
            <p class="muted">周期 Timeline · 暂停 / 单步 / +1 Step · 点阶段跳转。同章 ← →；空格播放。</p>
            <div class="demo-canvas-wrap" id="demo-wrap">
              <aside class="color-legend" aria-label="色彩语义">
                <div data-hit="state"><i class="sw sw-state"></i>蓝 · 状态 / 密度</div>
                <div data-hit="ctrl"><i class="sw sw-ctrl"></i>橙 · 控制 / 速度场</div>
                <div data-hit="adj"><i class="sw sw-adj"></i>紫 · 协态</div>
                <div data-hit="energy"><i class="sw sw-energy"></i>绿 · 能量 / 熵 / 代价</div>
                <div><i class="sw sw-base"></i>灰虚线 · 基准</div>
              </aside>
              <canvas id="demo" width="640" height="360"></canvas>
            </div>
            <div class="player-bar">
              <div class="timeline" id="timeline" role="slider" aria-label="周期进度"></div>
              <div class="caption" id="cap"></div>
            </div>
            <ol class="step-list" id="steplist"></ol>
            <div class="controls">
              <button class="primary" id="play" type="button">暂停</button>
              <button id="step" type="button">单步</button>
              <button id="stepPhase" type="button">+1 Step</button>
              <button id="reset" type="button">重置</button>
            </div>
            <div class="sliders" id="sliders"></div>
            <div class="metrics" id="met"></div>
          </div>
        </div>
      </div>
    </div>`;
  }

  function fillList(id, arr) {
    const el = document.getElementById(id);
    if (el) el.innerHTML = (arr || []).map((x) => `<li>${esc(x)}</li>`).join("");
  }
  function setText(id, text) {
    const el = document.getElementById(id);
    if (el) el.textContent = text == null ? "" : String(text);
  }

  function fillMath(o) {
    const math = document.getElementById("math");
    if (!math) return;
    const texs = o.katex || [];
    const sig = texs.join("\n");
    if (math.dataset.sig === sig && math.childElementCount) {
      decorateFormulas(math);
      return;
    }
    const frag = document.createDocumentFragment();
    texs.forEach((tex) => {
      const fig = document.createElement("figure");
      fig.className = "formula";
      fig._tex = tex;
      const scroll = document.createElement("div");
      scroll.className = "formula-scroll";
      const box = katexEl(tex, true);
      box.classList.add("katex-block");
      scroll.appendChild(box);
      fig.appendChild(scroll);
      const tools = document.createElement("div");
      tools.className = "formula-tools";
      const b1 = document.createElement("button");
      b1.type = "button";
      b1.className = "fcopy";
      b1.textContent = "复制 LaTeX";
      const b2 = document.createElement("button");
      b2.type = "button";
      b2.className = "fshare";
      b2.textContent = "复制锚点";
      tools.appendChild(b1);
      tools.appendChild(b2);
      fig.appendChild(tools);
      frag.appendChild(fig);
    });
    math.replaceChildren(frag);
    math.dataset.sig = sig;
    decorateFormulas(math);
  }

  function bindOpPage() {
    const page = document.getElementById("op-page");
    if (!page || page.dataset.bound) return;
    page.dataset.bound = "1";
    const syncPlay = () => {
      const playBtn = document.getElementById("play");
      if (playBtn && anim) playBtn.textContent = anim.isPlaying() ? "暂停" : "播放";
    };
    page.addEventListener("click", (e) => {
      const t = (e.target && e.target.closest) ? e.target : (e.target && e.target.parentElement);
      if (!t || !t.closest) return;
      if (t.closest("#play")) {
        if (!anim) return;
        if (anim.isPlaying()) anim.pause(); else anim.play();
        syncPlay();
        return;
      }
      if (t.closest("#step")) { if (anim) { anim.step(); syncPlay(); } return; }
      if (t.closest("#stepPhase")) { if (anim) { anim.nextPhase(); syncPlay(); } return; }
      if (t.closest("#reset")) { if (anim) { anim.reset(); syncPlay(); } return; }
      if (t.closest("#copy-link")) {
        copyText(pageUrl(currentOpId, pinnedSym || ""));
        return;
      }
      const fcopy = t.closest(".fcopy");
      if (fcopy) {
        const fig = fcopy.closest(".formula");
        copyText((fig && fig._tex) || "");
        return;
      }
      const fshare = t.closest(".fshare");
      if (fshare) {
        copyText(pageUrl(currentOpId, pinnedSym || ""));
        return;
      }
      const chip = t.closest(".sym-chip");
      if (chip) {
        const id = chip.dataset.sym;
        if (pinnedSym === id) applyHover(null, true);
        else applyHover(id, true);
        return;
      }
    });
    page.addEventListener("pointerover", (e) => {
      const el = e.target.closest(".sym-hit");
      if (!el || !page.contains(el)) return;
      applyHover(el.dataset.sym, false);
    });
    page.addEventListener("pointerout", (e) => {
      const el = e.target.closest(".sym-hit");
      if (!el) return;
      const rel = e.relatedTarget;
      if (rel && el.contains(rel)) return;
      applyHover(pinnedSym, false);
    });
    page.addEventListener("focusin", (e) => {
      const el = e.target.closest(".sym-hit");
      if (el) applyHover(el.dataset.sym, false);
    });
    page.addEventListener("focusout", (e) => {
      if (e.target && e.target.classList && e.target.classList.contains("sym-hit")) {
        applyHover(pinnedSym, false);
      }
    });
    const timelineEl = document.getElementById("timeline");
    if (timelineEl) {
      timelineEl.addEventListener("click", (e) => {
        const b = e.target.closest("[data-phase]");
        if (!b || !anim) return;
        anim.setPhase(+b.dataset.phase);
        syncPlay();
      });
    }
    const sl = document.getElementById("sliders");
    if (sl) {
      sl.addEventListener("input", (e) => {
        const inp = e.target.closest("input");
        if (!inp || !anim) return;
        const v = parseFloat(inp.value);
        const sv = inp.parentElement.querySelector(".sv");
        if (sv) sv.textContent = String(Math.round(v * 1000) / 1000);
        anim.setParam(inp.dataset.k, v);
      });
    }
  }

  function mountDemo(o) {
    const sl = document.getElementById("sliders");
    if (sl) {
      sl.replaceChildren();
      const mk = (key, label, min, max, val, step) => {
        const title = SLIDER_TITLE[key] || label;
        const hint = SLIDER_HINT[key] || ("调节「" + title + "」：观察画面与右侧指标如何一起变");
        const lab = document.createElement("label");
        lab.className = "slider-row";
        lab.innerHTML = `<span class="sl-name">${esc(title)}</span>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-k="${key}">
          <span class="sv">${val}</span>
          <span class="sl-hint">${esc(hint)}</span>`;
        sl.appendChild(lab);
      };
      mk("speed", "播放速度", 0.25, 2.5, 1, 0.05);
      (o.sliders || []).forEach((s) => mk(s.key, s.label, s.min, s.max, s.value, ((s.max - s.min) / 80)));
    }
    const timelineEl = document.getElementById("timeline");
    if (timelineEl) {
      timelineEl.innerHTML = "";
      delete timelineEl.dataset.ready;
    }
    const wrap = document.getElementById("demo-wrap");
    if (wrap) wrap.classList.remove("is-hover");
    const canvas = document.getElementById("demo");
    anim = window.AnimEngine.mount(canvas, {
      operator: o,
      captionEl: document.getElementById("cap"),
      metricsEl: document.getElementById("met"),
      stepsEl: document.getElementById("steplist"),
      timelineEl,
    });
    const playBtn = document.getElementById("play");
    if (playBtn) playBtn.textContent = anim.isPlaying() ? "暂停" : "播放";
  }

  function patchOp(o, hl) {
    const color = (CH[o.ch] || {}).color || "#5b8cff";
    const same = chapterSiblings(o);
    const idx = same.findIndex((x) => x.id === o.id);
    const prev = same[idx - 1];
    const next = same[idx + 1];
    const symbol = SYMBOL_MAP[o.demo] || "对照画布：蓝=状态/密度，橙=控制/速度场，紫=协态，绿=能量/熵/代价，灰虚线=基准。";
    const hover = (window.OPHover && window.OPHover.resolve) ? window.OPHover.resolve(o) : { symbols: [] };
    currentSymbols = hover.symbols || [];
    pinnedSym = hl && currentSymbols.some((s) => s.id === hl) ? hl : null;

    const crumb = document.getElementById("crumb");
    if (crumb) crumb.innerHTML = `<a href="#/">谱系</a><span>/</span><span>${esc(o.chapter_title)}</span><span>/</span><strong>${esc(o.name)}</strong>`;
    const chList = document.getElementById("ch-toc-list");
    if (chList) {
      chList.innerHTML = same.map((x) =>
        `<a href="#/op/${x.id}" class="${x.id === o.id ? "on" : ""}">${esc(x.name)}</a>`
      ).join("");
    }
    const lineage = document.getElementById("lineage");
    if (lineage) lineage.innerHTML = lineageHtml(o);
    const tags = document.getElementById("tags");
    if (tags) tags.innerHTML = `
      <span class="tag" style="border-color:${color};color:${color}">${esc(o.chapter)}</span>
      <span class="tag">${esc(o.tag)}</span>
      <span class="tag">${esc(o.section)}</span>
      <span class="tag">层级 ${o.level}</span>`;
    setText("op-title", o.name);
    const en = document.getElementById("op-en");
    if (en) en.innerHTML = `${esc(o.name_en)} · <code>${esc(o.id)}</code>`;
    const warn = document.getElementById("warn");
    if (warn) {
      if (o.flag || o.note) {
        warn.hidden = false;
        warn.innerHTML = o.flag ? `<b>${esc(o.flag)}</b><div>${esc(o.note || "")}</div>` : esc(o.note);
      } else {
        warn.hidden = true;
        warn.textContent = "";
      }
    }
    const intuitEl = document.getElementById("intuit");
    if (intuitEl) {
      if (o.intuition && o.intuition.includes("📐 数学本质")) {
        const parts = o.intuition.split(/\n\s*\n/);
        intuitEl.innerHTML = parts.map((p) => {
          let html = esc(p.trim());
          html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
          return `<div class="intuit-row">${html}</div>`;
        }).join("");
      } else {
        setText("intuit", o.intuition);
      }
    }
    const problem = document.getElementById("problem");
    if (problem) problem.textContent = "它要解决的问题：" + (o.problem || "");
    setText("symbol-map", symbol);
    const chips = document.getElementById("sym-chips");
    if (chips) {
      chips.innerHTML = currentSymbols.map((s) =>
        `<button type="button" class="sym-chip" data-sym="${esc(s.id)}" title="点击钉住高亮">${esc(s.label)}</button>`
      ).join("");
    }
    fillMath(o);
    const io = document.getElementById("io");
    if (io) io.textContent = "输入 / 输出：" + (o.io || "");
    const preview = document.getElementById("step-preview");
    if (preview) preview.innerHTML = (o.steps || []).map((s, i) => `<li>节拍 ${i + 1}：${esc(s)}</li>`).join("");
    const definition = document.getElementById("definition");
    if (definition) definition.textContent = "论文原文定义式：" + (o.definition || "");
    setText("pseudo", o.pseudo);
    fillList("apps", o.apps);
    fillList("pros", o.pros);
    fillList("cons", o.cons);
    const source = document.getElementById("source");
    if (source) source.innerHTML = `原始出处：${esc(o.source)}<br>原文摘录：「${esc(o.excerpt)}」`;
    const up = document.getElementById("up");
    if (up) up.innerHTML = (o.upstream || []).map(linkOp).join("") || "<span class='muted'>（根节点）</span>";
    const dn = document.getElementById("dn");
    if (dn) dn.innerHTML = (o.downstream || []).map(linkOp).join("") || "<span class='muted'>（叶节点）</span>";
    const alsoWrap = document.getElementById("also-wrap");
    const also = document.getElementById("also");
    if (alsoWrap && also) {
      if (o.also_in && o.also_in.length) {
        alsoWrap.hidden = false;
        also.innerHTML = o.also_in.map((a) =>
          `<div class="muted">· ${esc(a["来源章"] || "")} · ${esc(a["章节公式"] || a["章节+公式号"] || "")}<br>${esc(a["定义式"] || "")}</div>`
        ).join("");
      } else {
        alsoWrap.hidden = true;
        also.textContent = "";
      }
    }
    const refsEl = document.getElementById("refs");
    if (refsEl) {
      refsEl.innerHTML = (o.refs || []).map((r) => {
        const kind = r.kind === "book" ? "书" : r.kind === "code" ? "代码" : "论文";
        return `<li>[${kind}] <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
          — ${esc(r.authors)} (${r.year}). ${esc(r.venue)}</li>`;
      }).join("");
    }
    const nav = document.getElementById("nav-ops");
    if (nav) {
      nav.innerHTML = (prev ? `<a class="lk" href="#/op/${prev.id}">← ${esc(prev.name)}</a>` : "<span class='muted'>同章已到开头</span>")
        + (next ? `<a class="lk" href="#/op/${next.id}">${esc(next.name)} →</a>` : "<span class='muted'>同章已到末尾</span>");
    }
    setText("demo-name", o.name);
    setText("demo-en", o.name_en);
    const steplist = document.getElementById("steplist");
    if (steplist) steplist.innerHTML = (o.steps || []).map((s) => `<li>${esc(s)}</li>`).join("");
  }

  function renderOp(id, hl) {
    const o = BY[id];
    if (!o) {
      destroyAnim();
      currentOpId = null;
      document.body.classList.remove("page-op");
      view.innerHTML = `<div class="card"><p>找不到算子 ${esc(id)}</p><a href="#/">返回</a></div>`;
      return;
    }
    rememberOp(id);
    document.body.classList.add("page-op");
    const keep = !!view.querySelector("#op-page");
    const strictOpen = keep && document.getElementById("layer-strict") && document.getElementById("layer-strict").open;
    if (keep) {
      destroyAnimOnly();
    } else {
      destroyAnim();
      view.innerHTML = opShellHtml();
      bindOpPage();
    }
    currentOpId = id;
    patchOp(o, hl);
    if (strictOpen) {
      const d = document.getElementById("layer-strict");
      if (d) d.open = true;
    }
    mountDemo(o);
    syncToc(id);
    applyHover(pinnedSym, false);
  }

  function route() {
    const r = parseRoute();
    if (r.kind === "op") renderOp(r.id, r.hl);
    else renderHome();
  }
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      setTocOpen(false);
      return;
    }
    if (e.key === "/" && !(e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA"))) {
      e.preventDefault();
      q.focus();
      return;
    }
    if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
    const r = parseRoute();
    if (r.kind !== "op") return;
    const cur = BY[r.id];
    if (!cur) return;
    const same = chapterSiblings(cur);
    const idx = same.findIndex((x) => x.id === cur.id);
    if (e.key === "ArrowLeft" && same[idx - 1]) {
      rememberOp(same[idx - 1].id);
      location.hash = "#/op/" + same[idx - 1].id;
    }
    if (e.key === "ArrowRight" && same[idx + 1]) {
      rememberOp(same[idx + 1].id);
      location.hash = "#/op/" + same[idx + 1].id;
    }
    if (e.key === " " && anim) {
      if (e.target && e.target.closest && e.target.closest("button, a, summary, [contenteditable]")) return;
      e.preventDefault();
      const playBtn = document.getElementById("play");
      if (!playBtn) return;
      if (anim.isPlaying()) { anim.pause(); playBtn.textContent = "播放"; }
      else { anim.play(); playBtn.textContent = "暂停"; }
    }
  });
  route();
})();
