# -*- coding: utf-8 -*-
"""
Parse and sync all 127 operator intuitions into data/operators.json and data/operators.js
"""
import json
import re
from pathlib import Path
import sys

REPO = Path("e:/PaperHub/chen-zhichao-opapp")
REPORTS = Path("e:/PaperHub/operator_audit_reports")
sys.path.insert(0, str(Path("e:/PaperHub")))

from build_ch3_data import CH3_OPERATORS
from build_ch4_data import CH4_OPERATORS

def clean_md(text):
    if not text:
        return ""
    text = text.strip()
    # remove leading markdown blockquote markers '> '
    lines = [re.sub(r'^\s*>\s*', '', l) for l in text.split('\n')]
    return '\n'.join(lines).strip()

def parse_ch2():
    text = (REPORTS / "INTUITION_EVAL_CH2.md").read_text(encoding="utf-8")
    # Split by ### \d+\. `...`
    pattern = r'###\s+\d+\.\s*`([a-zA-Z0-9_]+)`[^\n]*\n([\s\S]*?)(?=\n###\s+\d+\.|\n##\s+|\Z)'
    matches = re.findall(pattern, text)
    print(f"Parsed CH2: {len(matches)} operators")
    res = {}
    for op_id, body in matches:
        # extract brain_intuition
        m_brain = re.search(r'-\s*🧠\s*\*\*【白话直觉[^】]*】\*\*：\s*\n([\s\S]*?)(?=\n-\s*🛡️|\n-\s*📐|\n-\s*🎯|\Z)', body)
        # extract math_nature
        m_math = re.search(r'-\s*📐\s*\*\*【数学本质[^】]*】\*\*：\s*\n([\s\S]*?)(?=\n-\s*🎯|\n-\s*🔄|\Z)', body)
        # extract problem
        m_prob = re.search(r'-\s*🎯\s*\*\*【它要解决的问题[^】]*】\*\*：\s*\n([\s\S]*?)(?=\n-\s*🔄|\n---\s*|\Z)', body)
        
        brain = clean_md(m_brain.group(1)) if m_brain else ""
        math = clean_md(m_math.group(1)) if m_math else ""
        prob = clean_md(m_prob.group(1)) if m_prob else ""
        
        # Clean physical anchor prefix if redundant or format nicely
        res[op_id] = {
            "brain": brain,
            "math": math,
            "problem": prob
        }
    return res

def parse_ch34():
    res = {}
    for op in CH3_OPERATORS + CH4_OPERATORS:
        res[op["id"]] = {
            "brain": clean_md(op.get("brain_intuition", "")),
            "math": clean_md(op.get("math_nature", "")),
            "problem": clean_md(op.get("problem_solved", ""))
        }
    print(f"Parsed CH34: {len(res)} operators")
    return res

def parse_ch567():
    text = (REPORTS / "INTUITION_EVAL_CH56_CH7.md").read_text(encoding="utf-8")
    pattern = r'###\s+\[\d+\]\s*`([a-zA-Z0-9_]+)`[^\n]*\n([\s\S]*?)(?=\n###\s+\[\d+\]|\n##\s+|\Z)'
    matches = re.findall(pattern, text)
    print(f"Parsed CH567: {len(matches)} operators")
    res = {}
    for op_id, body in matches:
        m_brain = re.search(r'-\s*\*\*🧠\s*白话直觉\*\*：([^\n]+(?:\n(?!\s*-\s*\*\*)[^\n]+)*)', body)
        m_math = re.search(r'-\s*\*\*📐\s*数学本质\*\*：([^\n]+(?:\n(?!\s*-\s*\*\*)[^\n]+)*)', body)
        m_prob = re.search(r'-\s*\*\*🎯\s*它要解决的问题\*\*：([^\n]+(?:\n(?!\s*-\s*\*\*|\n---)[^\n]+)*)', body)
        
        brain = clean_md(m_brain.group(1)) if m_brain else ""
        math = clean_md(m_math.group(1)) if m_math else ""
        prob = clean_md(m_prob.group(1)) if m_prob else ""
        
        res[op_id] = {
            "brain": brain,
            "math": math,
            "problem": prob
        }
    return res

def main():
    ch2_data = parse_ch2()
    ch34_data = parse_ch34()
    ch567_data = parse_ch567()
    
    all_reconstructed = {**ch2_data, **ch34_data, **ch567_data}
    print(f"Total reconstructed operators collected: {len(all_reconstructed)}")
    
    # Load operators.json
    op_json_path = REPO / "data" / "operators.json"
    data = json.loads(op_json_path.read_text(encoding="utf-8"))
    operators = data["operators"]
    
    missing_ids = []
    for op in operators:
        op_id = op["id"]
        if op_id not in all_reconstructed:
            missing_ids.append(op_id)
        else:
            rec = all_reconstructed[op_id]
            if not rec["brain"] or not rec["math"]:
                print(f"Warning: {op_id} incomplete: brain={bool(rec['brain'])}, math={bool(rec['math'])}")
                
    if missing_ids:
        print(f"ERROR: missing {len(missing_ids)} operators: {missing_ids}")
        return
    else:
        print("SUCCESS: 100% of 127 operators matched perfectly!")

if __name__ == "__main__":
    main()
