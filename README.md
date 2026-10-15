# 陈智超算子谱系 · 交互讲义

纯静态网页：把论文里的 127 个算子做成可点的谱系图 + 逐步动画。无后端、无构建步骤，双击 `index.html`（`file://`）即可离线打开；也可丢到 GitHub Pages。

数据来自陈智超《基于泛函优化的概率隐变量建模理论及软测量应用》。本仓库在成品源码上按 Gemini 优化清单改完导航、动画、播放器、离线加载与三层文案。

## 本地打开

**方式 A · 离线双击（成功标准）**

1. 下载或克隆本仓库。
2. 用浏览器直接打开根目录的 `index.html`。
3. 不需要本地服务器。算子数据由 `data/operators.js` 注入 `window.OP_DATA`，`loadOperatorsData()` 优先读它，因此 `file://` 不会去 fetch JSON。

**方式 B · 本地静态站**

```bash
python3 -m http.server 43127 --bind 127.0.0.1
```

浏览器打开 `http://127.0.0.1:43127/`。

深浅色写在 `localStorage`（`op-theme`）；谱系视口写在 `sessionStorage`（`op-graph-vp`）。

## 怎么用

- **首页谱系**：滚轮缩放、拖动画布。点节点进讲解。离开后再回来，视口会恢复，上次点过的节点呼吸高亮约 2 秒。
- **搜索 / 章节芯片**：非匹配节点与连线透明度降到约 0.12，拓扑还在，不会删点。匹配集合会自动居中包络。
- **详情页**：顶上是「前置依赖 → 当前 → 衍生」局部谱系。键盘 **← / →** 只在**同一章**里切换。空格播放 / 暂停。
- **播放器**：底部周期 Timeline，可点阶段；按钮有暂停、单步（一小步物理）、**+1 Step**（进下一阶段）、重置。
- **三层文案**：直觉速览 → 符号与画面对照 → 可折叠的严谨定义。
- **滑块**：短标签下面有一句中文因果提示（加大 ε 会怎样、盯住 ∑Q 等）。

画布右上角图例（教学语义，与章节色板分开）：

| 颜色 | 含义 |
| --- | --- |
| 蓝 | 状态 / 密度 |
| 橙 | 控制 / 速度场 |
| 紫 | 协态 |
| 绿 | 能量 / 熵 / 代价 |
| 灰虚线 | 基准 |

## 目录

```
index.html            入口
css/style.css
data/operators.js     window.OP_DATA（file:// 主数据）
data/operators.json   同一份数据，给检查脚本用
js/data.js            window.APP_DATA = window.OP_DATA
js/app.js             路由、谱系条、三层文案、播放器 DOM
js/graph.js           视口缓存、Spotlight、脏标记重绘
js/animations.js      播放循环、通用演示、五项动画改法
js/anim/ch2.js … ch7.js  各章专属动画
vendor/katex/         本地公式
tools/                生成与头检（可选，不是打开网页的前置条件）
```

## 本地验证（不依赖后端）

1. 双击 `index.html`，控制台无报错，首页能看到谱系节点。
2. 拖动 / 缩放后点进任意算子，再点顶栏品牌回首页：视口应复原，刚点过的节点呼吸约 2 秒。
3. 搜索「ELBO」或点章节芯片：非匹配变淡，节点还在，匹配团会被居中。
4. 打开详情：能看到谱系条、三层文案、滑块因果提示、色彩图例、Timeline。
5. 同章按 ← →；换章后方向键只在新章里走。
6. 建议抽检：
   - `entropy_functional` / `negative_entropy_regularization`：样本点不再 60Hz 闪烁（`x = σ z₀`）。
   - `transport_map`：格子深浅随 `1/|det ∇T|` 变。
   - `continuity_equation`：指标里有 ∑Q，周期边界下总量不应被「偷偷归一化」掉。
   - `one_step_lookahead`：灰虚线=全局最优，橙实线=局部重规划。
   - `pmp_boundary_condition` / `infinite_horizon_oc_cost`：有限时域标 `λ(T)=∇ψ`，无穷时域有渐近包络。
7. 切到其他标签页再回来：动画应暂停后恢复（`document.hidden`）。

可选头检（需本机 Chrome + Playwright，不是发布前置）：

```bash
python3 tools/check.py
```

`tools/build.py` 会从思维导图重生成数据。本仓库已带齐 `data/operators.js`，**打开网页不必跑它**。若没有 `mindmap.html`，生成脚本会失败——这是原工具链假设，不是站点缺陷。

## 假设与未静默跳过的项

- **章节色没改。** Brief 写「c4 紫=协态、c6 绿=能量」，但本项目 `--c4/--c6` 同时是第 4/6 章识别色。画布教学语义改用独立色（蓝 `#5b8cff`、橙 `#fbbf24`、紫 `#c084fc`、绿 `#34d399`、灰虚线），图例按 Brief 的含义来，不改章节色板。
- **127 个算子几乎都有 `js/anim/ch*.js` 专属页。** 指定五项在通用 fallback（`js/animations.js`）和对应专属实现里都改了；其他演示保持原教学设计。
- **滑块因果句按 key 在 `app.js` 映射**，不改 `operators.json` 里的短标签，以免和生成脚本打架。
- **图谱「按章分层布局缓存」**缓存的是全图分层坐标。Spotlight 只改透明度、不重排，这样跨章边还在。
- **DSM / 得分场等页仍有每帧噪声**，那是随机过程本身，不在「entropy/ner 消闪烁」范围内。
- **`tools/build.py` 的 `APP` 路径仍指向旧的 `app/` 布局**（原脚本假设）。本仓库根目录即站点根；日常打开不用跑它。

用户主 GitHub 将是 `youfengchuijiuhuidong`。当前先在 Origin 仓库完成优化。
