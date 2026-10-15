/* 符号 id → 画布高亮目标。可按算子覆盖，未覆盖则回退到 demo 类型。
   扩展：在 CATALOG 登记符号，再把 id 写入 byOp[operatorId] 或 byDemo[demoKind]。 */
(function (global) {
  "use strict";

  const CATALOG = {
    Q:      { id: "Q",      glyphs: ["Q"],           label: "密度 / 变分分布 Q", targets: ["state"] },
    z:      { id: "z",      glyphs: ["z"],           label: "状态 z",           targets: ["state"] },
    x:      { id: "x",      glyphs: ["x"],           label: "观测 x",           targets: ["state"] },
    phi:    { id: "phi",    glyphs: ["ϕ", "φ", "φ"], label: "速度场 φ",         targets: ["ctrl"] },
    lambda: { id: "lambda", glyphs: ["λ"],           label: "协态 λ",           targets: ["adj"] },
    u:      { id: "u",      glyphs: ["u"],           label: "控制 u",           targets: ["ctrl"] },
    T:      { id: "T",      glyphs: ["T"],           label: "传输映射 T",       targets: ["state", "ctrl"] },
    eps:    { id: "eps",    glyphs: ["ε"],           label: "步长 ε",           targets: ["ctrl"] },
    ELBO:   { id: "ELBO",   glyphs: ["ELBO"],        label: "证据下界 ELBO",    targets: ["energy"] },
    KL:     { id: "KL",     glyphs: ["KL"],          label: "KL 间隙",          targets: ["energy"] },
    theta:  { id: "theta",  glyphs: ["θ"],           label: "参数 θ",           targets: ["energy"] },
    P:      { id: "P",      glyphs: ["P"],           label: "目标 / 后验 P",    targets: ["state"] },
  };

  /* 低频高价值算子：显式列出符号，便于教学页精控 */
  const byOp = {
    elbo: ["ELBO", "Q", "KL", "theta", "x"],
    vae_objective: ["ELBO", "Q", "KL"],
    kl_divergence: ["Q", "P", "KL"],
    transport_map: ["T", "phi", "eps", "z"],
    change_of_variables_density: ["T", "Q", "eps"],
    continuity_equation: ["Q", "phi", "z"],
    pushforward_measure: ["Q", "T"],
    pmp_boundary_condition: ["lambda", "z"],
    pmp_adjoint_equation: ["lambda", "z"],
    pontryagin_maximum_principle: ["lambda", "z", "u"],
    particle_ode: ["z", "phi", "u"],
    finite_horizon_oc_cost: ["z", "u", "lambda"],
    infinite_horizon_oc_cost: ["z", "u", "lambda"],
  };

  /* 未在 byOp 的算子按 demo 种类套用 */
  const byDemo = {
    elbo: ["ELBO", "Q", "KL"],
    transport: ["T", "phi", "Q", "eps"],
    continuity: ["Q", "phi"],
    pmp: ["lambda", "z", "u"],
    adjoint: ["lambda", "z"],
    ode: ["z", "u"],
    kl: ["Q", "P", "KL"],
    w2: ["Q", "T"],
  };

  function lookup(name) {
    const c = CATALOG[name];
    if (!c) return null;
    return {
      id: c.id,
      glyphs: c.glyphs.slice(),
      label: c.label,
      targets: c.targets.slice(),
    };
  }

  function resolve(op) {
    if (!op) return { symbols: [], source: "none" };
    let names = byOp[op.id];
    let source = "op";
    if (!names || !names.length) {
      names = byDemo[op.demo] || [];
      source = names.length ? "demo" : "none";
    }
    const symbols = [];
    const seen = {};
    names.forEach((n) => {
      if (seen[n]) return;
      const s = lookup(n);
      if (!s) return;
      seen[n] = 1;
      symbols.push(s);
    });
    return { symbols, source };
  }

  global.OPHover = { CATALOG, byOp, byDemo, resolve, lookup };
})(window);
