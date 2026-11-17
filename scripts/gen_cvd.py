#!/usr/bin/env python3
# 2026-11-17 색약용 화면 CSS 만들기
#   index.html의 <style> 안에서 초록 계열 색을 쓰는 규칙을 찾아, 같은 규칙을 'html.cvd' 아래에 파랑 계열로 다시 적는다.
#   (빨강·초록을 구분하기 어려운 사람도 '좋음=파랑 / 나쁨=빨강'은 구분할 수 있음. 빨강·주황은 그대로 두고 기호를 덧붙임)
#   CSS를 고친 뒤에는 이 스크립트를 다시 돌린다:  python3 scripts/gen_cvd.py
import re, colorsys, sys, os
P = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'index.html')
START, END = '/* cvd:auto-start */', '/* cvd:auto-end */'
s = open(P, encoding='utf-8').read()

def is_green(r, g, b):
    h, l, sat = colorsys.rgb_to_hls(r, g, b); deg = h * 360
    return sat >= 0.22 and 80 <= deg <= 178
def to_blue(r, g, b):
    h, l, sat = colorsys.rgb_to_hls(r, g, b)
    r2, g2, b2 = colorsys.hls_to_rgb(212 / 360, l, min(1, sat * 1.05 + 0.04)); return r2, g2, b2
def fix_hex(m):
    h = m.group(1); full = h if len(h) in (6, 8) else ''.join(c * 2 for c in h[:3]) + (h[3] * 2 if len(h) == 4 else '')
    r, g, b = [int(full[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    if not is_green(r, g, b): return m.group(0)
    r2, g2, b2 = to_blue(r, g, b); return '#%02x%02x%02x' % (round(r2 * 255), round(g2 * 255), round(b2 * 255)) + (full[6:8] if len(full) == 8 else '')
def fix_rgb(m):
    r, g, b = [int(x) / 255 for x in m.group(2, 3, 4)]
    if not is_green(r, g, b): return m.group(0)
    r2, g2, b2 = to_blue(r, g, b); return '%s(%d,%d,%d%s' % (m.group(1), round(r2 * 255), round(g2 * 255), round(b2 * 255), m.group(5))
HEX = re.compile(r'#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b')
RGB = re.compile(r'(rgba?)\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*([,)])')
def remap(v): return RGB.sub(fix_rgb, HEX.sub(fix_hex, v))

def prefix(sel):
    out = []
    for part in sel.split(','):
        t = part.strip()
        if not t: continue
        if t.startswith(':root'): t = 'html.cvd' + t[5:]
        elif re.match(r'html\b', t): t = 'html.cvd' + t[4:]
        else: t = 'html.cvd ' + t
        out.append(t)
    return ','.join(out)

def walk(css):
    """규칙을 훑어 초록 색이 든 선언만 모아 다시 적는다. @media 같은 묶음은 그대로 감싼다."""
    out, i, n = [], 0, len(css)
    while i < n:
        j = css.find('{', i)
        if j < 0: break
        head = css[i:j].strip(); head = re.sub(r'/\*.*?\*/', '', head, flags=re.S).strip()
        depth, k = 1, j + 1
        while k < n and depth:
            c = css[k]
            if c == '{': depth += 1
            elif c == '}': depth -= 1
            k += 1
        body = css[j + 1:k - 1]
        if head.startswith('@'):
            if re.match(r'@(media|supports|container|layer)\b', head):
                inner = walk(body)
                if inner: out.append('%s{%s}' % (head, inner))
        elif '{' not in body:
            decls = []
            for d in re.sub(r'/\*.*?\*/', '', body, flags=re.S).split(';'):
                if ':' not in d: continue
                name, val = d.split(':', 1); nv = remap(val)
                if nv != val: decls.append('%s:%s' % (name.strip(), nv.strip()))
            if decls and head: out.append('%s{%s}' % (prefix(head), ';'.join(decls)))
        i = k
    return ''.join(out)

blocks = [m.group(1) for m in re.finditer(r'<style(?![^>]*id="cvd-css")[^>]*>(.*?)</style>', s, re.S)]
gen = '\n'.join(x for x in (walk(b) for b in blocks) if x)
a, b = s.find(START), s.find(END)
if a < 0 or b < 0: sys.exit('index.html에 cvd 자리 표시가 없어요')
s2 = s[:a + len(START)] + '\n' + gen + '\n' + s[b:]
open(P, 'w', encoding='utf-8').write(s2)
print('규칙', gen.count('{'), '개 ·', len(gen), '바이트')
