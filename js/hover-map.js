/* 符号 id → 画布高亮目标。可按算子覆盖，未覆盖则回退到 demo 类型。
   扩展：在 CATALOG 登记符号，再把 id 写入 byOp[operatorId] 或 byDemo[demoKind]。 */
(function (global) {
  "use strict";

  const CATALOG = {
    /* 核心状态与测度 */
    Q:        { id: "Q",        glyphs: ["Q"],                     label: "密度 / 变分分布 Q",   targets: ["state"] },
    z:        { id: "z",        glyphs: ["z"],                     label: "状态 z",             targets: ["state"] },
    x:        { id: "x",        glyphs: ["x"],                     label: "观测 x",             targets: ["state"] },
    P:        { id: "P",        glyphs: ["P"],                     label: "目标 / 后验 P",      targets: ["state"] },
    P2:       { id: "P2",       glyphs: ["P₂", "P2", "P", "\\mathcal{P}"], label: "沃瑟斯坦流形 𝒫₂", targets: ["state"] },
    simplex:  { id: "simplex",  glyphs: ["Δ", "α", "simplex"],     label: "单纯形 Δ / 权重 α",  targets: ["state"] },
    sigma:    { id: "sigma",    glyphs: ["Σ", "σ"],                label: "协方差 / 噪声 Σ",    targets: ["state"] },

    /* 控制、速度场与变换 */
    phi:      { id: "phi",      glyphs: ["ϕ", "φ", "φ"],           label: "速度场 φ",           targets: ["ctrl"] },
    u:        { id: "u",        glyphs: ["u"],                     label: "控制输入 u",         targets: ["ctrl"] },
    T:        { id: "T",        glyphs: ["T"],                     label: "传输映射 T",         targets: ["state", "ctrl"] },
    eps:      { id: "eps",      glyphs: ["ε", "ϵ"],                label: "步长 / 微扰 ε",      targets: ["ctrl"] },
    grad_W2:  { id: "grad_W2",  glyphs: ["∇_W2", "∇_W", "∇", "grad"], label: "Wasserstein 梯度 ∇_W₂", targets: ["ctrl"] },
    K:        { id: "K",        glyphs: ["K", "k"],                label: "核函数 K",           targets: ["ctrl"] },
    drift:    { id: "drift",    glyphs: ["f", "g", "b", "ν", "nu"], label: "漂移项 f / g / ν",  targets: ["ctrl"] },
    score:    { id: "score",    glyphs: ["s(x)", "s"],             label: "得分函数 ∇log p",    targets: ["ctrl"] },
    W:        { id: "W",        glyphs: ["W", "A"],                label: "邻接 / 权重矩阵 W / A", targets: ["ctrl", "state"] },

    /* 协态与伴随 */
    lambda:   { id: "lambda",   glyphs: ["λ"],                     label: "协态 / 伴随变量 λ",   targets: ["adj"] },

    /* 能量、泛函、信息度量与参数 */
    ELBO:     { id: "ELBO",     glyphs: ["ELBO"],                  label: "证据下界 ELBO",      targets: ["energy"] },
    KL:       { id: "KL",       glyphs: ["KL"],                    label: "KL 散度 / 间隙",      targets: ["energy"] },
    theta:    { id: "theta",    glyphs: ["θ"],                     label: "模型参数 θ",         targets: ["energy"] },
    E_Q:      { id: "E_Q",      glyphs: ["𝔼", "E", "E_Q"],         label: "数学期望 𝔼_Q",       targets: ["energy"] },
    entropy:  { id: "entropy",  glyphs: ["H", "S", "ent", "NER"],  label: "熵泛函 H / 负熵",    targets: ["energy"] },
    H:        { id: "H",        glyphs: ["H", "ℋ"],                label: "哈密顿量 H",         targets: ["energy", "ctrl"] },
    psi:      { id: "psi",      glyphs: ["Ψ", "ψ", "Psi", "psi"],   label: "势函数 Ψ / ψ",       targets: ["energy", "state"] },
    rho:      { id: "rho",      glyphs: ["ρ", "rho"],              label: "罚参数 / 密度 ρ",    targets: ["energy"] },
  };

  /* 低频高价值算子：显式列出符号，覆盖全书 60+ 核心算子 */
  const byOp = {
    /* 第2章 预备知识：变分、几何与控制基础 */
    latent_max_likelihood: ["theta", "P", "x", "z"],
    elbo: ["ELBO", "Q", "KL", "theta", "x"],
    kl_divergence: ["Q", "P", "KL", "z"],
    variational_inference: ["Q", "P", "KL", "theta"],
    optimal_variational_distribution: ["Q", "P", "theta"],
    vae_objective: ["ELBO", "Q", "KL", "theta", "z"],
    bregman_divergence: ["psi", "z", "lambda"],
    mirror_descent: ["psi", "z", "eps", "grad_W2"],
    mirror_descent_three_steps: ["psi", "z", "eps", "lambda"],
    wasserstein_space_p2: ["Q", "P2", "z", "T"],
    normalization_constraint: ["Q", "z", "E_Q"],
    transport_map: ["T", "phi", "eps", "z"],
    change_of_variables_density: ["T", "Q", "eps", "z"],
    log_density_first_order_expansion: ["Q", "phi", "T", "z"],
    continuity_equation: ["Q", "phi", "z"],
    pushforward_measure: ["Q", "T", "z"],
    w2_distance: ["P2", "T", "Q", "grad_W2"],
    w2_perturbative_form: ["Q", "phi", "eps", "grad_W2"],
    state_ode: ["z", "u", "phi"],
    performance_functional: ["H", "z", "u", "lambda"],
    hamiltonian_pmp: ["H", "z", "u", "lambda"],
    adjoint_state_pmp: ["lambda", "z", "H"],
    pmp_stationarity: ["H", "u", "lambda"],
    pmp_state_equation: ["z", "u", "phi"],
    pmp_adjoint_equation: ["lambda", "H", "z"],
    pmp_boundary_condition: ["lambda", "z"],
    pontryagin_maximum_principle: ["lambda", "z", "u", "H"],

    /* 第3章 缺失数据补全与变分推断 */
    em_e_step_kl: ["KL", "Q", "P", "x"],
    em_m_step_joint_likelihood: ["theta", "Q", "E_Q", "x"],
    entropy_functional: ["Q", "entropy", "z"],
    imputation_likelihood: ["Q", "theta", "x"],
    kl_entropy_decomposition: ["KL", "entropy", "Q", "P"],
    negative_entropy_regularization: ["entropy", "Q", "theta", "P"],
    minimizing_movement_scheme: ["P2", "T", "Q", "eps"],
    optimal_perturbation_direction: ["phi", "Q", "z"],
    ner_score_transport: ["T", "Q", "eps", "z"],
    score_function: ["score", "P", "x"],
    rkhs: ["K", "phi", "z"],
    rkhs_transport_map: ["K", "T", "eps", "theta"],
    rbf_kernel: ["K", "z", "x"],
    joint_ner_functional: ["entropy", "Q", "theta"],
    joint_rkhs_perturbation: ["K", "phi", "theta"],
    knewimp_imputation_update: ["phi", "K", "eps", "x"],

    /* 第4章 粒子变分与最优控制协同 */
    particle_quantization: ["z", "Q", "E_Q"],
    dirac_delta: ["z", "Q"],
    particle_ode: ["z", "phi", "u"],
    monte_carlo_expectation: ["E_Q", "z", "Q"],
    control_affine_perturbation: ["phi", "P", "u", "z"],
    finite_horizon_oc_cost: ["KL", "Q", "P", "u"],
    infinite_horizon_oc_cost: ["u", "KL", "z"],
    hamiltonian_infinite_horizon: ["H", "z", "lambda", "u"],
    adjoint_state: ["lambda", "H", "Q"],
    optimal_control_law: ["u", "Q", "phi"],
    info_perturbation_field: ["phi", "P", "Q", "z"],
    rkhs_ansatz_control: ["K", "psi", "P", "E_Q"],
    forward_euler_discretization: ["z", "eps", "K", "P"],
    info_particle_update: ["z", "phi", "eps"],

    /* 第5章 图结构学习与单纯形变分 */
    mpnn_message: ["W", "z", "x"],
    nam_normalize: ["W", "simplex"],
    simplex_factorization: ["simplex", "P", "x"],
    dirichlet_entropy: ["entropy", "theta", "simplex"],
    entropy_regularized_functional: ["entropy", "Q", "E_Q", "theta"],
    functional_perturbation: ["phi", "eps", "theta", "E_Q"],
    rkhs_perturbation_direction: ["phi", "K", "theta", "E_Q"],
    entropy_bregman_potential: ["psi", "simplex", "entropy"],
    entropy_bregman_divergence: ["psi", "simplex", "lambda"],
    mirror_map_log: ["psi", "simplex", "eps", "phi"],
    kems_simplex_update: ["simplex", "W", "psi"],
    forward_euler_ode: ["psi", "z", "eps"],

    /* 第6章 连续时间随机系统与最优控制 */
    ito_sde: ["drift", "z", "W"],
    girsanov_density_ratio: ["drift", "z", "P"],
    admm_three_steps: ["rho", "z", "u", "lambda"],
    path_marginal_kl_inequality: ["KL", "Q", "P"],
    path_kl_via_drift_gap: ["KL", "drift", "E_Q", "Q"],
    finite_horizon_oc_cost_ch6: ["drift", "theta", "Q", "E_Q"],
    hamiltonian_finite_horizon: ["H", "drift", "lambda", "z"],
    optimal_control_policy: ["drift", "lambda", "u"],
    costate_adjoint_ode: ["lambda", "drift", "theta", "z"],
    amortized_control_net: ["u", "drift", "theta", "x"],
    girsanov_measure_change: ["drift", "P", "Q", "z"],
    mean_covariance_ode: ["drift", "z", "sigma"],
    stein_lemma: ["E_Q", "z", "sigma"],

    /* 第7章 前沿与展望：泛函梯度流与空间传输 */
    rkhs_norm_regularization: ["K", "phi", "u"],
    preconditioned_functional_gradient_flow: ["grad_W2", "z", "Q"],
    hamiltonian_flow: ["H", "z", "lambda"],
    momentum_space_iteration: ["z", "eps", "phi"],
    accelerated_dynamic_weight_particle_vi: ["z", "Q", "P", "phi"],
    accelerated_information_gradient_flow: ["P2", "grad_W2", "H"],
    accelerated_flow_probability_distributions: ["P2", "rho", "H", "phi"],
    wasserstein_transport: ["P2", "Q", "phi", "psi", "grad_W2"],
    fisher_rao_manifold_evolution: ["Q", "P2", "T"],
    probability_teleportation: ["KL", "eps", "P2", "Q"],
    dynamic_weight_particle_vi: ["z", "phi", "P", "Q"],
    stein_path_alignment: ["K", "phi", "z"],
  };

  /* 未在 byOp 的算子按 demo 种类套用 */
  const byDemo = {
    elbo: ["ELBO", "Q", "KL", "theta"],
    transport: ["T", "phi", "Q", "eps", "z"],
    continuity: ["Q", "phi", "z"],
    pmp: ["H", "lambda", "z", "u"],
    adjoint: ["lambda", "z", "H"],
    ode: ["z", "u", "phi"],
    kl: ["Q", "P", "KL", "z"],
    w2: ["P2", "Q", "T", "grad_W2"],
    entropy: ["entropy", "Q", "z", "E_Q"],
    bregman: ["psi", "z", "lambda"],
    mirror: ["psi", "z", "eps", "grad_W2"],
    kems: ["simplex", "W", "psi"],
    simplex: ["simplex", "W", "entropy"],
    kernel: ["K", "phi", "z"],
    svgd: ["K", "phi", "z", "P"],
    score: ["phi", "P", "z"],
    dirac: ["z", "Q", "E_Q"],
    mc: ["E_Q", "z", "Q"],
    sde: ["drift", "z", "W"],
    girsanov: ["drift", "z", "P", "Q"],
    admm: ["rho", "z", "u", "lambda"],
    fisher: ["Q", "P2", "T"],
    teleport: ["KL", "eps", "P2", "Q"],
    weights: ["z", "phi", "P", "Q"],
    align: ["K", "phi", "z"],
    hamiltonian: ["H", "z", "lambda"],
    mask: ["x", "theta", "z"],
    emloop: ["Q", "theta", "KL", "x"],
    encoder: ["theta", "z", "x"],
    vae: ["ELBO", "Q", "KL", "theta", "z"],
    varfit: ["Q", "P", "KL", "theta"],
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
})(typeof window !== "undefined" ? window : globalThis);
