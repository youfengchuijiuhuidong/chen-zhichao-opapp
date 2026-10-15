# -*- coding: utf-8 -*-
"""
Assembler script to generate e:/PaperHub/operator_audit_reports/INTUITION_EVAL_CH56_CH7.md
"""

import sys
import os
import re

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_overview import get_overview_section
from gen_ch5 import get_ch5_section
from gen_ch6 import get_ch6_section
from gen_ch7 import get_ch7_section

def main():
    target_path = 'e:/PaperHub/operator_audit_reports/INTUITION_EVAL_CH56_CH7.md'
    print(f'Starting assembly of {target_path}...')
    
    sec_overview = get_overview_section()
    sec_ch5 = get_ch5_section()
    sec_ch6 = get_ch6_section()
    sec_ch7 = get_ch7_section()
    
    full_content = sec_overview + '\n' + sec_ch5 + '\n' + sec_ch6 + '\n' + sec_ch7
    
    # Validation
    op_headers = re.findall(r'###\s+\[(\d+)\]\s+`([^`]+)`', full_content)
    print(f'Found {len(op_headers)} operator headers in assembled content.')
    
    indices = [int(idx) for idx, name in op_headers]
    expected_indices = list(range(1, 53))
    
    if indices != expected_indices:
        print('Error: Operator indices do not match 1..52!')
        print('Indices:', indices)
        sys.exit(1)
        
    print('All 52 operator indices (01 to 52) verified successfully!')
    
    # Check dual layer structure
    for idx, name in op_headers:
        pattern = rf'###\s+\[{idx}\]\s+`{name}`.*?(?=###\s+\[\d+\]|##\s+|$)'
        match = re.search(pattern, full_content, re.DOTALL)
        if not match:
            print(f'Warning: Could not match block for [{idx}] `{name}`')
            continue
        block = match.group(0)
        
        required_parts = [
            '1. 原版通病诊断',
            '【原版文本】',
            '【病症解剖】',
            '2. 3 步公式重构推演',
            '【一句话破冰】',
            '【翻译限制条件】',
            '【降维讲作用】',
            '3. 最终重构输出',
            '🧠 白话直觉',
            '📐 数学本质',
            '🎯 它要解决的问题'
        ]
        
        for req in required_parts:
            if req not in block:
                print(f'Warning: Operator [{idx}] `{name}` is missing {req}!')
                sys.exit(1)

    print('Validation passed: All 52 operators have complete sections, 3-step formula, and dual-layer structure.')
    
    with open(target_path, 'w', encoding='utf-8') as f:
        f.write(full_content)
        
    file_size = os.path.getsize(target_path)
    print(f'Successfully wrote {target_path} ({file_size} bytes, {len(full_content)} chars).')

if __name__ == '__main__':
    main()
