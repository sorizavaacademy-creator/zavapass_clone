"""한림대 맞춤 추가 질문 → 클론 DB (qb_additions_import 한 번)

    python3 -I scripts/import_hallym_additions.py <한림대_모의면접_추가데이터.xlsx> [--dry]
    QB_IMPORT_TOKEN=<임시 열쇠> python3 -I scripts/import_hallym_additions.py <엑셀>

- 엑셀 '질문은행_추가분' 시트와 scripts/hallym_additions_authored.json(강원 지역 기관 질문)을 합쳐 넣음
  (json 질문 한 줄 = [기업키, 유형, 질문, 의도, 평가 포인트(|로 나눔), 예상 꼬리질문, 근거, 직종, 세부 직무] — 뒤 세 칸은 생략 가능.
   HLQ 번호는 줄 순서로 매기므로 새 질문은 맨 뒤에 붙임)
- 넣지 않는 질문(EXCLUDE)과 회사 맞추기(CO_MAP)·직종 맞추기(JOB_MAP)는 아래 표에서 고침
- 엑셀을 고친 뒤 이 스크립트를 다시 돌리면 추가분 전체가 바뀌고, 사용 중인 질문은행 판에 바로 반영됨
  (엑셀 질문은행을 새 판으로 다시 넣어도 qb_import_activate가 추가분을 함께 넣음 — supabase/clone/022)
- 주소와 공개 키는 config.js에서 읽음. 운영 프로젝트(aqkukxcjcbfxqfesmuva)이면 바로 멈춤
- 관리자 로그인 없이 넣으려면 임시 열쇠: 클론 DB qb_import_tokens에 sha256 해시를 짧은 기한으로 넣고, 다 넣은 뒤 지움
"""
import json, os, re, sys, urllib.request

PROD_REF = 'aqkukxcjcbfxqfesmuva'
HERE = os.path.dirname(os.path.abspath(__file__))

# 엑셀 기업 → 질문은행 기업키 (기존 키가 있으면 그 키)
CO_MAP = {
    '한림대학교의료원': ('HL01', '한림대학교의료원', '병원'),
    '국민건강보험공단': ('HL02', '국민건강보험공단', '공기업'),
    '강원랜드': ('PB17', '강원랜드', '공기업'),
    'NH농협은행(강원 지역 채용)': ('FN05', 'NH농협(농협은행·농협중앙회)', '대기업'),
    '삼성 계열(삼성메디슨 포함)': ('SS01', '삼성전자', '대기업'),
    '카카오 계열': ('IT02', '카카오', '대기업'),
}
# 질문은행에 새로 만드는 기업 (기관 목록 ID와 연결)
NEW_COMPANIES = [
    {'key': 'HL01', 'name': '한림대학교의료원', 'grp': '병원', 'priority': 1, 'talent_id': 'H1-01', 'note': '한림대 추가 데이터'},
    {'key': 'HL02', 'name': '국민건강보험공단', 'grp': '공기업', 'priority': 1, 'talent_id': 'G4-35', 'note': '한림대 추가 데이터'},
]
# 넣지 않는 질문과 이유 (2026-11-09 검토)
EXCLUDE = {
    **{f'ADD-{n:04d}': '공무원 분야는 질문은행을 쓰지 않음 → 화면의 공무원 질문 목록에 따로 넣음' for n in range(24, 33)},
    'ADD-0050': '삼성 지원서(에세이) 내용을 전제로 함',
    'ADD-0052': '삼성메디슨 제품 전용 (삼성메디슨이 기관 목록에 없음)',
    'ADD-0053': '삼성메디슨 제품 전용 (삼성메디슨이 기관 목록에 없음)',
    'ADD-0056': '제시 자료가 있어야 함 (온라인 면접에서 할 수 없음)',
    'ADD-0059': '이미 본 코딩테스트를 전제로 함',
    **{f'ADD-{n:04d}': '지역 방송사가 기관 목록·분야에 없음 (보류)' for n in range(64, 70)},
    'ADD-0076': '면접관이 고객 역할을 해야 함 (AI 면접에서 할 수 없음)',
}
# 엑셀 직종 → 앱 직종 22개 중 하나 (원래 직종은 job_detail에 보관)
JOB_MAP = [
    (r'간호|방사선|임상병리|물리치료|보건의료기사', '의약'),
    (r'병원 행정|행정직|사무행정|카지노', '기획/경영'),
    (r'해외영업|영업', '영업/제휴'),
    (r'개발|서비스·비즈니스', '개발'),
    (r'초급|금융', '금융/재무'),
    (r'기자|PD', '미디어/홍보'),
]


def job_of(s):
    for pat, j in JOB_MAP:
        if re.search(pat, s or ''):
            return j
    return '기타'


def env():
    s = open(os.path.join(HERE, '..', 'config.js'), encoding='utf-8').read()
    url = re.search(r"VITE_SUPABASE_URL:\s*'([^']+)'", s).group(1).rstrip('/')
    key = re.search(r"VITE_SUPABASE_ANON_KEY:\s*['\"]([^'\"]+)['\"]", s).group(1)
    if PROD_REF in url or PROD_REF in key:
        sys.exit('운영 프로젝트 주소라서 멈춤')
    return url, key


def from_excel(path):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    rows = list(wb['질문은행_추가분'].iter_rows(values_only=True))
    head = [str(h).strip() if h else '' for h in rows[0]]
    out, skipped = [], {}
    for r in rows[1:]:
        d = dict(zip(head, r))
        qid = (d.get('질문ID') or '').strip()
        if not qid:
            continue
        if qid in EXCLUDE:
            skipped[qid] = EXCLUDE[qid]
            continue
        co = CO_MAP.get(d['기업'])
        if not co:
            skipped[qid] = f"회사를 맞출 곳이 없음: {d['기업']}"
            continue
        made = (d.get('근거') or '').strip() != '후기 기반'
        out.append({
            'id': qid, 'company_key': co[0], 'company': co[1], 'grp': co[2], 'priority': d.get('우선순위'),
            'job': job_of(d.get('직종')), 'job_detail': d.get('직종'), 'rank': d.get('직급') or '신입',
            # 연도·최신성은 후기 연도가 아니라 작성 기준이라 비움. 후기 기반은 가중치 1, 만든 질문은 0.5 (실제 후기보다 덜 나오게)
            'year': None, 'recency': None, 'weight': 0.5 if made else 1.0,
            'difficulty': None, 'result': None, 'stage': d.get('면접 단계'), 'qtype': d['질문 유형'],
            'question': d['질문'].strip(), 'rep': (d.get('대표 질문') or d['질문']).strip(),
            'has_followup': str(d.get('꼬리질문 포함') or '').upper().startswith('Y'),
            'orig_type': d.get('원래 유형'), 'intent': d.get('질문 의도'), 'eval_points': d.get('평가 포인트'),
            'followups': d.get('예상 꼬리질문'), 'basis': d.get('근거'), 'orig_id': d.get('원본 ID'), 'src': '한림대_모의면접_추가데이터.xlsx',
        })
    return out, skipped


def from_authored():
    d = json.load(open(os.path.join(HERE, 'hallym_additions_authored.json'), encoding='utf-8'))
    cos = {c['key']: dict(c, job=('의약' if c['grp'] == '병원' else '기획/경영')) for c in NEW_COMPANIES}   # 엑셀 쪽 새 기업에도 질문을 더할 수 있게
    cos.update({c['key']: c for c in d['companies']})
    rows, n = [], 0
    for item in d['questions']:
        key, qtype, q, intent, ev, fu = item[:6]
        basis = (item[6] if len(item) > 6 else None) or '작성(전형 구조 기반)'
        n += 1
        c = cos[key]
        rows.append({'id': f'HLQ-{n:04d}', 'company_key': key, 'company': c['name'], 'grp': c['grp'], 'priority': 1,
                     # 9번째 칸 = 세부 직무 (간호·언어재활·청능·방사선 … 병원 행정). 병원 직무·상황 질문을 그 직무 학생에게만 (supabase/clone/023)
                     'job': (item[7] if len(item) > 7 else None) or c['job'], 'job_detail': (item[8] if len(item) > 8 else None), 'rank': '신입', 'year': None, 'recency': None,
                     # 공개 후기에서 확인한 질문은 가중치 1, 새로 만든 질문은 0.5 (실제 후기보다 덜 나오게)
                     'weight': 1.0 if basis.startswith('공개 후기') else 0.5,
                     'difficulty': None, 'result': None, 'stage': None, 'qtype': qtype, 'question': q, 'rep': q, 'has_followup': False,
                     'orig_type': None, 'intent': intent, 'eval_points': ev.replace('|', ' | '), 'followups': fu,
                     'basis': basis, 'orig_id': None, 'src': 'hallym_additions_authored.json'})
    comps = [{'key': c['key'], 'name': c['name'], 'grp': c['grp'], 'priority': 1, 'talent_id': c.get('talent'), 'note': '한림대 지역·전공 보강'}
             for c in d['companies']]
    return rows, comps


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    if not args:
        sys.exit(__doc__)
    rows, skipped = from_excel(args[0])
    arows, acomps = from_authored()
    rows += arows
    comps = NEW_COMPANIES + acomps
    types = {r['qtype'] for r in rows}
    print(f'넣을 질문 {len(rows)}개 (엑셀 {len(rows) - len(arows)} · 지역 기관 {len(arows)}) · 새 기업 {len(comps)}곳 · 유형 {sorted(types)}')
    print('넣지 않은 질문:')
    for k, v in skipped.items():
        print(f'  {k}: {v}')
    if '--dry' in sys.argv:
        json.dump({'companies': comps, 'rows': rows}, open('hallym_additions_preview.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        return
    token = os.environ.get('QB_IMPORT_TOKEN') or sys.exit('QB_IMPORT_TOKEN이 없어요')
    url, key = env()
    req = urllib.request.Request(f'{url}/rest/v1/rpc/qb_additions_import',
                                 data=json.dumps({'p_companies': comps, 'p_rows': rows, 'p_token': token}, ensure_ascii=False, default=str).encode('utf-8'),
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            print(json.dumps(json.loads(r.read()), ensure_ascii=False))
    except urllib.error.HTTPError as e:
        sys.exit(f'실패 {e.code}: {e.read().decode("utf-8", "replace")[:500]}')


if __name__ == '__main__':
    main()
