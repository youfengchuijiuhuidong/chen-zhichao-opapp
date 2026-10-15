# CHANGELOG · 算子谱系交互讲义

## 第 7 轮（理论深度重构：沃瑟斯坦流形双视窗 / 数据截断修复 / 拓扑补全 / 全谱符号联动）

基于最新 UX 版本（commit 3157f1b），针对全量 127 算子深度学术审计成果进行全维落地升级：

### 一、动画与几何教学重构 (P0，Top 10 核心难点算子全量落地)
- **沃瑟斯坦空间 P2 (`wasserstein_space_p2`)**：重构为「微观状态空间粒子云 Q ↔ 宏观奥托无穷维黎曼流形 P2 质点滑动」双重视角，增加二阶矩入场券能级预警与切空间平面 $T_Q \mathcal{P}_2$。
- **Bregman 散度 (`bregman_divergence`)**：重构为严格凸势函数上的非对称双切平面测距标尺，实时量测并对比 $B(q\|p) \ne B(p\|q)$。
- **负熵泛函 (`entropy_functional`)**：重构为双势阱中“观测重构外力收拢” vs “负熵梯度场排斥扩散”的双力动态平衡。
- **粒子经验量化 (`particle_quantization`)**：重构为连续多峰光滑密度向 Dirac $\delta$ 离散脉冲逼近的极限收敛过程，实时展示 $\mathcal{O}(1/\sqrt{N})$ 蒙特卡洛方差衰减。
- **无穷时域哈密顿系统 (`hamiltonian_infinite_horizon`)**：重构为相空间 $(z, \lambda)$ 鞍点双曲流动轨迹，直观展示横截条件 $\lim_{t \to \infty} \lambda(t) = 0$ 协态渐近衰减。
- **KEMS 镜像单纯形更新 (`kems_simplex_update`)**：绘制概率单纯形 $\Delta^3$ 三角形，展示对偶空间无约束步经 Softmax 镜像映射回投影，永不逃出单纯形边界。
- **Girsanov 测度变换 (`girsanov_density_ratio`)**：同屏对比无漂移布朗参考路径与漂移受控路径，通过光晕粗细动态可视化 Radon-Nikodym 导数权重。
- **路径边际 KL 不等式 (`path_marginal_kl_inequality`)**：绘制时空演化管状带，通过时间切片扫描仪动态印证 $D_{KL}[Q_t \| P_t] \le D_{KL}^{\text{path}}[Q \| P]$ 处处成立。
- **Fisher-Rao 流形演化 (`fisher_rao_manifold_evolution`)**：对比上轨 Wasserstein 物理搬迁与下轨 Fisher-Rao 本地就地消解与远端重组（Teleportation），展现突变工况跳跃。
- **Stein 路径对齐 (`stein_path_alignment`)**：呈现工业软测量冷启动工况下的源域向目标域迁移，绘制核互斥力与得分牵引力向量场。

### 二、公式符号与画布联动全面铺开 (P0)
- `js/hover-map.js` 扩展新增 $\mathcal{P}_2$、$\mathbb{E}_Q$、哈密顿量 $H$、Bregman势 $\Psi$、单纯形 $\Delta$、SDE漂移项 $f$、ADMM罚参数 $\rho$、再生核 $K$ 等核心数学符号。
- `byOp` 覆盖扩充至全书 30+ 个核心重难点算子，悬停公式变量即刻触发画布几何实体高亮。

### 三、数据工程与学术严谨性修复 (P1)
- **全量修复 21 处论文摘录截断**：补齐 `wasserstein_space_p2`、`normalization_constraint`、`elbo`、`linearized_proximal_step` 等末尾生硬截断字段，恢复完整原著表述。
- **修复 OCR 乱码与符号冲突**：`kl_divergence` 中误录为 `k` 的双竖线 $\Vert$ 修正为标准分隔符；理顺 $\tau$ 步长与迭代轮次。
- **打通 15 条全局 DAG 拓扑连线**：为变分推断、摊销EM、镜像下降三步法、PMP极大值原理等早熟死胡同节点补全跨章节后置边，总拓扑边数扩充至 228 条。
- 确保 `data/operators.json` 与 `data/operators.js` 100% 严格一致。

## 第 6 轮（第二轮 UX：公式 / 联动 / 导航）

纯静态约束不变：无构建步骤、`file://` 可离线、不改 OP_DATA 数学内容、不破坏视口 sessionStorage / Spotlight / dt 钳制 / 脏标记 / 键盘 ←→。

### P0
- 长公式放进可横向滚动的 `.formula` 容器；详情栅格用 `minmax(0, 1fr)`，避免 KaTeX 把整页撑破。
- 直觉 / 符号对照 / 严谨定义三层加左侧 Accent bar（蓝 / 橙 / 紫）与浅色铺底，拉开视线层次。
- 公式关键符号 hover（及符号芯片点击钉住）驱动右侧 Canvas 呼吸高亮。映射在 `js/hover-map.js`，可按算子或 demo 扩展。代表性页：`elbo`、`transport_map`、`continuity_equation`、`pmp_boundary_condition`。
- 顶部「前置 → 当前 → 衍生」改为可点击迷你节点卡片，当前态描边提示。

### P1
- 顶栏 ☰ 章节树抽屉 + 详情页可折叠「本章算子」列表。
- 每条公式「复制 LaTeX」；「复制本页链接」生成 `#/op/<id>`，钉住高亮时带 `?hl=<symbol>`。
- 切换算子时复用详情壳、KaTeX 节点缓存，避免整页 `innerHTML` 造成公式闪白。
- ≤1024px 左右栏改为上下堆叠，画布保留 `min-height`，不再 `sticky` 挤没文案。

## 第 5 轮（Gemini 优化清单落地）

约束仍是：纯静态、可 `file://` 双击、无后端、无构建工具。以 zip 成品为基线，不另套目录。

### 一、信息架构与导航

- 谱系视口 `{ panX, panY, scale, lastOpId }` 写入 `sessionStorage`（键 `op-graph-vp`）。点节点、拖完、滚轮、销毁时保存；回首页恢复，不对已有视口强行 `fit()`。
- 返回时对 `lastOpId` 画约 2 秒呼吸高亮环（矩形描边脉动）。
- 详情页顶部增加「前置依赖 → 当前 → 衍生算子」局部谱系条，边关系来自 `upstream` / `downstream` 与 `edges`。
- **← / → 改为同章**（不再按全书 127 个顺序）。底栏邻接链接同步为同章。
- 搜索与章节芯片改为拓扑 Spotlight：非匹配透明度 0.12，**不再 `display:none`**，跨章连线骨架保留；匹配集合自动居中包络框。

### 二、动画教学质量

| 模块 | 改法 |
| --- | --- |
| entropy / ner | `init` 固定 `z0`，`tick` 用 `x = σ z₀`。改了通用 `entropy` 以及第 3 章 `entropy_functional`、`imputation_likelihood`。 |
| transport | 变形网格 + `1/\|det ∇T\|` 热力，压缩处加深。通用 `transport` 与第 2 章 `transport_map`。 |
| continuity | 周期边界 + 守恒迎风通量，指标实时 `∑Q`，**去掉把质量除回去的假守恒**。通用 2D 格与第 2 章 1D 连续性方程。 |
| lookahead | 虚线=偷看未来的全局最优，实线=分段局部重规划。通用 `lookahead` 与第 6 章 `one_step_lookahead`（树 + 底栏折线）。 |
| pmp | 有限时域标 `λ(T)=∇ψ`；无穷时域画渐近包络 `λ→0`。通用 `pmp`、第 2 章边值/伴随、第 4 章 `infinite_horizon_oc_cost`。 |

### 三、视觉与动效

- 播放器：`S.phaseSec = 2.4`，`S.cycleFrames = n × 72`（按 30fps 一阶段）。HTML Timeline 周期进度 + 阶段点选；按钮为暂停 / 单步 / **+1 Step** / 重置。
- 画布右上角固定色彩语义图例（蓝状态、橙控制、紫协态、绿能量/熵/代价、灰虚线基准）。
- 中西文字体栈沿用 Noto / 微软雅黑等；图谱节点与画布 `label` 按宽度收缩字号，防溢出。

### 四、性能与离线

- 新增 `data/operators.js`：`window.OP_DATA = …`。`loadOperatorsData()` 优先 `OP_DATA`，再回退 `APP_DATA`。`js/data.js` 改为别名，避免再复制一份 300KB+。
- 仿真 `dt` 上限从 50ms 改为 **≤33ms**。
- `document.hidden` 时停 tick，回来用 `last=0` 避免一大步跳变。
- `graph.js`：`requestAnimationFrame` 脏标记只在变换/高亮时刷 `transform`；全图分层布局写入 `layoutCache`。

### 五、文案

- 详情三层：直觉速览 → 符号与画面对照（含画布图例说明与节拍）→ `<details>` 严谨定义（公式原文、伪代码、应用、文献）。
- 滑块在短标签下增加中文因果句（`eps` / `vx` / `uamp` / `spread` 等按 key 映射）。

### 假设（未静默跳过）

- 未改 CSS 章节色 `--c4/--c6`，以免第 4/6 章识别色被 Brief 的「紫/绿」语义带跑。教学色走独立 token，图例按 Brief 含义绘制。
- 滑块长提示在运行时映射，不改 `operators.json` 源字段。
- Spotlight 不按章重排坐标（否则跨章边会断）。缓存的是全图分层。
- `tools/build.py` 仍假设旧的 `mindmap.html` + `app/` 路径；打开本站点不需要跑它。

## 第 1 轮（基线核对 + 查缺补漏）

- 自 `mindmap.html` 解析 **127** 个算子（第2章 38、第3章 20、第4章 17、第5章 19、第6章 21、第7章 12；边 221），与思维导图 `meta.counts` 完全一致，无遗漏 id。
- 复用既有 `index.html` / CSS / Canvas 引擎 / KaTeX vendor / extras，未推倒重来。
- 为全部算子注入演示参数滑块（原先 109 个页面只有播放速度）。
- 新增 **PMP**、**伴随** 两类逐步动画，把庞特里亚金四件套、有限/无穷时域哈密顿量、协态边值从通用 ODE 演示中拆开。
- 画布增加分步进度条；W₂ 粒子沿传输路径移动；浅色主题下谱系图节点/边颜色随主题重绘。
- 首页分叉点可跳到「切换后」算子；谱系图增加「适应窗口 / 清除高亮」；详情页 ← → 与空格控制播放。
- 核实并修正 VBEM 引用：Beal & Ghahramani (2003) 指向 Buffalo 预印本 PDF，而非不存在的 MLR 链接。PFG / GAD-PVI / Deep MMS 条目与 arXiv、GitHub、期刊页核对一致。
- Playwright 头检：首页 127 节点、搜索 ELBO 命中、公式均 KaTeX 渲染、画布非空、无 JS 异常。
- 本轮问题：检查脚本 `getImageData` 触发 Chrome 警告（已从应用错误中剥离）；`score_function` / `admm` / InfO-EM 训练三页像素变化偏弱。

## 第 2 轮（动画动起来 + 检查噪声）

- 得分场粒子在原点附近重生并加大噪声，箭头场随时间脉动。
- ADMM / EM 循环节拍加快，避免 600ms 采样窗口内看起来静止。
- 检查脚本忽略 `willReadFrequently` 警告，并用该标志读取像素。

## 第 3 轮（弱动画放大 + 第7章公式 + 全量头检）

- 加强原先像素变化偏弱的演示：变分拟合（粒子+KL 柱）、W₂/MMS（邻近球与微扰短箭头）、伴随扫掠条、NAM 行高亮、狄拉克带宽振荡、MC 新点放大、动态权重直方图、画布播放头竖带。
- 第7章若干原先纯 `\text{…}` 的公式改为可渲染的数学式（GAD-PVI、AIG、概率空间 Hamilton、FR 生灭、不平衡 OT、DPVI、Stein 路径对齐）。
- 再次核对 GAD-PVI（AAAI 2024 / `zituitui/ParVI`）与 PFG（ICLR 2023 / `hendrydong/PFG`）条目真实可查。
- `check.py` 采样加密（每 8 字节）、第二帧等待加到 480ms。
- 全量 Playwright：127/127 首页节点，公式无 KaTeX 错误/回退，画布全非空，`static_anim=0`，控制台与 JS 异常均为空。最低像素差约 1855（熵类），远高于阈值 80。
- 本轮剩余：熵类曲线描边面积仍偏小（下一轮填色）。

## 第 4 轮（熵填充 + 浅色/移动端/控件）

- 熵/NER 演示改为曲线下填色 + 样本点 + 右侧熵柱，插值加快。
- 抽检 18 个先前偏弱或关键页：播放/暂停/单步/滑块均可操作；浅色主题首页仍 127 节点；搜索「镜像」命中 12；390×844 移动端 ELBO 公式与画布正常。
- 无 JS 异常、无空白画布、无 KaTeX 错误。
