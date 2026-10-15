# CHANGELOG · 算子谱系交互讲义

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
