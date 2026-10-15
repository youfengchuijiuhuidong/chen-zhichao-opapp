#!/usr/bin/env python3
"""Parse mindmap.html, merge pedagogical extras + bibliography, emit JSON + JS."""
from __future__ import annotations

import json
import re
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APP = ROOT / "app"
TOOLS = Path(__file__).resolve().parent
sys.path.insert(0, str(TOOLS))

from bib import BIB  # noqa: E402
from extras_ch2 import CH2  # noqa: E402
from extras_ch34 import CH34  # noqa: E402
from extras_ch56 import CH56  # noqa: E402
from extras_ch7 import CH7  # noqa: E402

EXTRAS = {**CH2, **CH34, **CH56, **CH7}

CH_META = {
    2: {"id": "ch2", "title": "第2章 预备知识", "short": "预备", "color": "#5b8cff"},
    3: {"id": "ch3", "title": "第3章 补全·负熵", "short": "补全", "color": "#2dd4bf"},
    4: {"id": "ch4", "title": "第4章 稳态·InfO", "short": "InfO", "color": "#a3e635"},
    5: {"id": "ch5", "title": "第5章 镜像下降", "short": "镜像", "color": "#fbbf24"},
    6: {"id": "ch6", "title": "第6章 有限时域", "short": "时域", "color": "#fb7185"},
    7: {"id": "ch7", "title": "第7章 展望", "short": "展望", "color": "#c084fc"},
}

# Demo-type defaults so every lecture page has at least one content slider.
DEFAULT_SLIDERS = {
    "mixture": [("mix", "混合权重", 0.15, 0.85, 0.55)],
    "elbo": [("beta", "变分贴合", 0.1, 1.0, 0.55)],
    "jensen": [("tpos", "凸组合 t", 0.05, 0.95, 0.45)],
    "kl": [("sep", "分布间距", 0.2, 2.4, 1.0)],
    "varfit": [("rate", "拟合速度", 0.2, 2.2, 0.8)],
    "emloop": [("rate", "提升速度", 0.2, 2.0, 1.0)],
    "encoder": [("beta", "KL 权重", 0.1, 4.0, 1.0)],
    "vae": [("beta", "KL 权重", 0.1, 4.0, 1.0)],
    "gd": [("eps", "步长 ε", 0.05, 0.85, 0.25)],
    "bregman": [("z0", "参考点", -1.4, 1.6, 0.6)],
    "mirror": [("eta", "步长", 0.05, 0.85, 0.25)],
    "kems": [("eps", "步长 ε", 0.05, 0.85, 0.25)],
    "simplex": [("rate", "收缩速度", 0.2, 2.2, 1.0)],
    "w2": [("sep", "搬迁距离", 0.25, 1.8, 1.0)],
    "entropy": [("spread", "散布", 0.18, 1.7, 0.7)],
    "transport": [("eps", "微扰 ε", 0.05, 0.9, 0.25)],
    "continuity": [("vx", "流速", 0.15, 1.6, 0.6)],
    "ode": [("uamp", "控制强度", 0.0, 1.3, 0.4)],
    "lookahead": [("uamp", "控制强度", 0.0, 1.3, 0.4)],
    "pmp": [("uamp", "控制强度", 0.0, 1.3, 0.45)],
    "adjoint": [("uamp", "终端权重", 0.2, 2.0, 1.0)],
    "mask": [("miss", "缺失率", 0.08, 0.72, 0.35)],
    "score": [("sig", "噪声", 0.04, 0.95, 0.35)],
    "stein": [("sig", "噪声", 0.04, 0.95, 0.35)],
    "kernel": [("v", "核带宽", 0.25, 2.1, 0.8)],
    "align": [("v", "核带宽", 0.25, 2.1, 0.8)],
    "svgd": [("v", "核带宽", 0.25, 1.9, 0.7)],
    "pfg": [("v", "核带宽", 0.25, 1.9, 0.7)],
    "dirac": [("spread", "核宽", 0.1, 1.4, 0.5)],
    "sde": [("sig", "扩散强度", 0.05, 0.95, 0.3)],
    "filter": [("sig", "扩散强度", 0.05, 0.95, 0.3)],
    "mpnn": [("rate", "消息强度", 0.2, 2.0, 1.0)],
    "nam": [("rate", "消息强度", 0.2, 2.0, 1.0)],
    "embed": [("hid", "隐层增益", 4, 16, 8)],
    "residual": [("hid", "隐层增益", 4, 16, 8)],
    "relu": [("hid", "隐层增益", 4, 16, 8)],
    "girsanov": [("gap", "漂移差", 0.15, 1.6, 0.7)],
    "admm": [("rho", "罚参数 ρ", 0.2, 2.2, 0.8)],
    "schur": [("obs", "观测精度", 0.3, 2.2, 1.0)],
    "planar": [("uamp", "平面流幅度", 0.1, 1.5, 0.6)],
    "hamiltonian": [("damp", "阻尼", 0.92, 1.0, 0.995)],
    "momentum": [("mu", "动量 μ", 0.0, 0.95, 0.7)],
    "hamflow": [("damp", "阻尼", 0.92, 1.0, 0.995)],
    "teleport": [("rate", "传送速率", 0.3, 2.2, 1.0)],
    "fisher": [("rate", "传送速率", 0.3, 2.2, 1.0)],
    "mc": [("n", "样本上限", 40, 280, 120)],
    "weights": [("rate", "调权速度", 0.3, 2.2, 1.0)],
    "nam": [("rate", "归一化进度", 0.2, 2.0, 1.0)],
}


def merge_sliders(ex):
    have = list(ex.get("sliders") or [])
    keys = {s[0] for s in have}
    for s in DEFAULT_SLIDERS.get(ex.get("demo") or "", []):
        if s[0] not in keys:
            have.append(s)
    return have


def load_mindmap() -> dict:
    html = (ROOT / "mindmap.html").read_text(encoding="utf-8")
    m = re.search(
        r'<script id="data" type="application/json">(.*?)</script>', html, re.S
    )
    if not m:
        raise SystemExit("mindmap.html: JSON payload not found")
    return json.loads(m.group(1))


def resolve_refs(keys):
    out = []
    missing = []
    for k in keys or []:
        if k not in BIB:
            missing.append(k)
            continue
        item = dict(BIB[k])
        item["key"] = k
        out.append(item)
    if missing:
        raise SystemExit(f"missing bibliography keys: {missing}")
    return out


def topo_levels(ids, upstream):
    memo = {}

    def dep(i):
        if i in memo:
            return memo[i]
        ups = upstream.get(i, [])
        memo[i] = (max((dep(u) for u in ups), default=-1) + 1) if True else 0
        return memo[i]

    return {i: dep(i) for i in ids}


def main():
    D = load_mindmap()
    raw_ops = D["operators"]
    edges = D["edges"]
    splits = D.get("splits") or []

    ids = [o["id"] for o in raw_ops]
    if len(ids) != len(set(ids)):
        raise SystemExit("duplicate operator ids")
    missing_ex = [i for i in ids if i not in EXTRAS]
    extra_unk = [i for i in EXTRAS if i not in set(ids)]
    if missing_ex:
        raise SystemExit(f"extras missing for {len(missing_ex)} ops: {missing_ex}")
    if extra_unk:
        raise SystemExit(f"extras for unknown ids: {extra_unk}")

    up = defaultdict(list)
    dn = defaultdict(list)
    clean_edges = []
    idset = set(ids)
    for e in edges:
        a, b = e["from"], e["to"]
        if a in idset and b in idset:
            up[b].append(a)
            dn[a].append(b)
            clean_edges.append({"from": a, "to": b})

    levels = topo_levels(ids, up)

    operators = []
    for o in raw_ops:
        ex = EXTRAS[o["id"]]
        ch = int(o["ch"])
        item = {
            "id": o["id"],
            "name": o.get("中文名"),
            "name_en": o.get("英文名"),
            "ch": ch,
            "chapter": o.get("来源章"),
            "chapter_title": CH_META[ch]["title"],
            "section": o.get("章节+公式号"),
            "tag": o.get("标签"),
            "definition": o.get("定义式"),
            "io": o.get("输入/输出"),
            "problem": o.get("解决什么问题"),
            "source": o.get("原始出处"),
            "excerpt": o.get("原文摘录"),
            "upstream": list(o.get("上游算子") or up[o["id"]]),
            "downstream": dn[o["id"]],
            "level": levels[o["id"]],
            "demo": ex["demo"],
            "katex": ex["katex"],
            "intuition": ex["intuition"],
            "steps": ex["steps"],
            "pseudo": ex["pseudo"],
            "apps": ex["apps"],
            "pros": ex["pros"],
            "cons": ex["cons"],
            "refs": resolve_refs(ex["refs"]),
            "sliders": [
                {"key": s[0], "label": s[1], "min": s[2], "max": s[3], "value": s[4]}
                for s in merge_sliders(ex)
            ],
            "note": ex.get("note") or o.get("def_expr_note"),
            "flag": o.get("flag"),
            "also_in": o.get("同id另见"),
        }
        # keep mindmap upstream if present, else graph upstream
        if not item["upstream"]:
            item["upstream"] = up[o["id"]]
        operators.append(item)

    by_ch = {str(c): sum(1 for o in operators if o["ch"] == c) for c in range(2, 8)}
    by_tag = defaultdict(int)
    for o in operators:
        by_tag[o["tag"] or "未标"] += 1

    payload = {
        "meta": {
            "title": "算子谱系交互讲义",
            "thesis": D.get("meta", {}).get("thesis"),
            "total": len(operators),
            "edges": len(clean_edges),
            "by_chapter": by_ch,
            "by_tag": dict(by_tag),
            "mindmap_meta": D.get("meta", {}).get("counts"),
        },
        "chapters": CH_META,
        "operators": operators,
        "edges": clean_edges,
        "splits": splits,
    }

    out_json = APP / "data" / "operators.json"
    out_opjs = APP / "data" / "operators.js"
    out_js = APP / "js" / "data.js"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_js.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    out_json.write_text(text + "\n", encoding="utf-8")
    out_opjs.write_text(
        "/* generated by tools/build.py — file:// 可离线加载 */\n"
        "window.OP_DATA = "
        + json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        + ";\n",
        encoding="utf-8",
    )
    out_js.write_text(
        "/* APP_DATA 别名，指向 OP_DATA */\nwindow.APP_DATA = window.OP_DATA;\n",
        encoding="utf-8",
    )
    print(f"wrote {len(operators)} operators, {len(clean_edges)} edges")
    print(f"  {out_json}")
    print(f"  {out_opjs}")
    print(f"  {out_js}")
    print("by_chapter", by_ch)
    print("by_tag", dict(by_tag))
    demos = defaultdict(int)
    for o in operators:
        demos[o["demo"]] += 1
    print("demos", dict(sorted(demos.items(), key=lambda kv: -kv[1])))


if __name__ == "__main__":
    main()
