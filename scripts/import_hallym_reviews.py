"""한림대 권역 18개 기관 면접 후기(잡플래닛) → 클론 질문은행 'HLR-' 질문

    QB_IMPORT_TOKEN=<임시 열쇠> python3 -I scripts/import_hallym_reviews.py classify <엑셀> <작업폴더>
    QB_IMPORT_TOKEN=<임시 열쇠> python3 -I scripts/import_hallym_reviews.py classify_web <엑셀> <작업폴더>   # 웹 공개 면접질문 20개
    python3 -I scripts/import_hallym_reviews.py build <엑셀> <작업폴더>        # 미리보기(엑셀)·넣을 자료 만들기
    QB_IMPORT_TOKEN=<임시 열쇠> python3 -I scripts/import_hallym_reviews.py push <작업폴더>

- 후기 원문은 잡플래닛 저작물이라 레포·DB에 그대로 두지 않음. classify가 서버 함수 qb-classify(AI)로
  '실제 질문만 골라 뜻만 살려 다시 쓴 질문'을 받아 작업폴더(레포 밖)에 저장하고, DB에는 다시 쓴 질문만 넣음
- 빼는 것: 질문이 아닌 메모, 금지 질문(나이·가족·거주지 등), 경력직 전제, 온라인 진행 불가, 연봉, 개인 서류 전제
  → 남은 질문도 DB의 금지 질문 검사(qb_block_reason)를 한 번 더 거침
- 국립과학수사연구원은 공무원(연구직) 채용이라 넣지 않음. 춘천성심병원은 한림대학교의료원(HL01)에 합침
- 최근 후기일수록 자주 나오게 가중치: 2024년 이후 1.0 · 2021~23 0.7 · 2018~20 0.4 · 그 전 0.2
- 주소·공개 키는 config.js에서 읽음. 운영 프로젝트(aqkukxcjcbfxqfesmuva)면 멈춤
"""
import json, os, re, sys, time, urllib.request, urllib.error, concurrent.futures as cf
from collections import Counter, defaultdict

PROD_REF = 'aqkukxcjcbfxqfesmuva'
HERE = os.path.dirname(os.path.abspath(__file__))
SKIP_SHEETS = {'읽어주세요', '목록', '전수점검 결과', '출처 안내', '공식 채용정보', '공식정보 대조 결과', '웹 공개 면접질문'}
EXCLUDE_ORGS = {'국립과학수사연구원': '공무원(연구직) 채용이라 질문은행(공무원 분야는 안 씀)에 넣지 않음'}
# 시트 이름 → (질문은행 기업키, 이름, 구분, 기관 목록 ID)
ORG = {
    '강원대학교병원': ('HL08', '강원대학교병원', '병원', 'G5-044'),
    '춘천성심병원': ('HL01', '한림대학교의료원', '병원', 'H1-01'),
    '원주세브란스기독병원': ('HL10', '원주세브란스기독병원', '병원', 'H1-02'),
    '강릉아산병원': ('HL11', '강릉아산병원', '병원', 'H1-03'),
    '원주의료원': ('HL12', '원주의료원', '병원', 'H1-04'),
    '강릉의료원': ('HL13', '강릉의료원', '병원', 'H1-05'),
    '삼척의료원': ('HL14', '삼척의료원', '병원', 'H1-06'),
    '영월의료원': ('HL15', '영월의료원', '병원', 'H1-07'),
    '속초의료원': ('HL16', '속초의료원', '병원', 'H1-08'),
    '국민건강보험공단 일산병원': ('HL17', '국민건강보험공단 일산병원', '병원', 'H1-09'),
    '국민건강보험공단': ('HL02', '국민건강보험공단', '공기업', 'G4-35'),
    '건강보험심사평가원': ('HL03', '건강보험심사평가원', '공기업', 'G4-34'),
    '한국보훈복지의료공단': ('HL04', '한국보훈복지의료공단', '공기업', 'G4-22'),
    '한국관광공사': ('HL05', '한국관광공사', '공기업', 'G4-23'),
    '국립공원공단': ('HL06', '국립공원공단', '공기업', 'G4-37'),
    '도로교통공단': ('HL07', '한국도로교통공단', '공기업', 'G4-56'),
    '대한적십자사': ('HL09', '대한적십자사', '공기업', 'G5-130'),
}
# 잡플래닛 직무 → 앱 직종
JOB = {'의약': '의약', '기획/경영': '기획/경영', '인사/총무': '기획/경영', '서비스/고객지원': '서비스/고객지원', '특수계층/공공': '기획/경영',
       '개발': '개발', '연구개발': '연구/R&D', '엔지니어링': '생산/제조', '마케팅/시장조사': '마케팅/광고', '금융/재무': '금융/재무',
       '영업/제휴': '영업/제휴', '디자인': '디자인', '미디어/홍보': '미디어/홍보', '전문직': '기타', '교육': '교육', '법률/법무': '법률/법무'}
BATCH, WORKERS = 30, 4


def env():
    s = open(os.path.join(HERE, '..', 'config.js'), encoding='utf-8').read()
    url = re.search(r"VITE_SUPABASE_URL:\s*'([^']+)'", s).group(1).rstrip('/')
    key = re.search(r"VITE_SUPABASE_ANON_KEY:\s*['\"]([^'\"]+)['\"]", s).group(1)
    if PROD_REF in url or PROD_REF in key:
        sys.exit('운영 프로젝트 주소라서 멈춤')
    return url, key


def post(path, body, timeout=180):
    url, key = env()
    req = urllib.request.Request(url + path, data=json.dumps(body, ensure_ascii=False, default=str).encode('utf-8'),
                                 headers={'apikey': key, 'Authorization': f'Bearer {key}', 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def read_reviews(xlsx):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    out = {}
    for ws in wb.worksheets:
        if ws.title in SKIP_SHEETS:
            continue
        rows = list(ws.iter_rows(values_only=True))
        hi = next(i for i, r in enumerate(rows) if r and r[0] == 'No' and r[1] == '작성일')
        head = [str(h) for h in rows[hi]]
        out[ws.title] = [dict(zip(head, r)) for r in rows[hi + 1:] if r and r[0] is not None]
    return out


def year_of(x):
    for k in ('면접일자', '작성일'):
        m = re.search(r'(20\d\d)', str(x.get(k) or ''))
        if m:
            return int(m.group(1))
    return None


def weight_of(y):
    return 1.0 if y and y >= 2024 else 0.7 if y and y >= 2021 else 0.4 if y and y >= 2018 else 0.2


def classify(xlsx, work):
    token = os.environ.get('QB_IMPORT_TOKEN') or sys.exit('QB_IMPORT_TOKEN이 없어요')
    os.makedirs(work, exist_ok=True)
    cache_p = os.path.join(work, 'classified.json')
    cache = json.load(open(cache_p, encoding='utf-8')) if os.path.exists(cache_p) else {}
    data = read_reviews(xlsx)
    jobs = []
    for sheet, recs in data.items():
        if sheet in EXCLUDE_ORGS:
            continue
        todo = [(int(x['No']), x) for x in recs if (x.get('면접 질문') or '').strip() and f"{sheet}#{x['No']}" not in cache]
        for i in range(0, len(todo), BATCH):
            jobs.append((sheet, todo[i:i + BATCH]))
    print(f'보낼 묶음 {len(jobs)}개 (이미 끝난 후기 {len(cache)}건)')

    def run(job):
        sheet, part = job
        body = {'token': token, 'org': ORG[sheet][1], 'items': [{'i': n, 'job': x.get('직무') or '', 'text': x['면접 질문']} for n, x in part]}
        for t in range(4):
            try:
                r = post('/functions/v1/qb-classify', body)
                return sheet, part, r
            except (urllib.error.URLError, TimeoutError) as e:
                time.sleep(3 * (t + 1)); err = e
        return sheet, part, {'error': str(err)}

    done = 0
    with cf.ThreadPoolExecutor(WORKERS) as ex:
        for sheet, part, r in ex.map(run, jobs):
            done += 1
            if 'items' not in r:
                print(f'  실패 {sheet} {part[0][0]}~: {str(r)[:160]}'); continue
            got = {int(it['i']): it for it in r['items']}
            for n, _ in part:
                if n in got:
                    cache[f'{sheet}#{n}'] = {'qs': got[n]['qs'], 'drop': got[n]['drop']}
            if done % 10 == 0 or done == len(jobs):
                json.dump(cache, open(cache_p, 'w', encoding='utf-8'), ensure_ascii=False)
                print(f'  {done}/{len(jobs)} 묶음 · 정리된 후기 {len(cache)}건')
    json.dump(cache, open(cache_p, 'w', encoding='utf-8'), ensure_ascii=False)


WEB_ORG = {'국민건강보험공단': '국민건강보험공단', '대한적십자사': '대한적십자사', '도로교통공단': '도로교통공단', '건강보험심사평가원': '건강보험심사평가원',
           '한국보훈복지의료공단': '한국보훈복지의료공단', '한국관광공사': '한국관광공사'}


def read_web(xlsx):
    import openpyxl
    wb = openpyxl.load_workbook(xlsx, read_only=True, data_only=True)
    rows = list(wb['웹 공개 면접질문'].iter_rows(values_only=True))
    hi = next(i for i, r in enumerate(rows) if r and r[0] == '질문')
    out = []
    for n, r in enumerate(rows[hi + 1:], 1):
        if not r or not r[0] or r[4] not in WEB_ORG:
            continue
        m = re.search(r'(20\d\d)', str(r[3] or '') + str(r[1] or ''))
        out.append({'n': n, 'q': str(r[0]), 'kind': str(r[3] or ''), 'org': r[4], 'year': int(m.group(1)) if m else None})
    return out


def classify_web(xlsx, work):
    """'웹 공개 면접질문' 시트(실제로 나온 것으로 확인된 질문)도 같은 방식으로 다시 써서 cache에 'WEB#번호'로 넣음"""
    token = os.environ.get('QB_IMPORT_TOKEN') or sys.exit('QB_IMPORT_TOKEN이 없어요')
    cache_p = os.path.join(work, 'classified.json')
    cache = json.load(open(cache_p, encoding='utf-8')) if os.path.exists(cache_p) else {}
    by = defaultdict(list)
    for w in read_web(xlsx):
        by[w['org']].append(w)
    for org, ws in by.items():
        r = post('/functions/v1/qb-classify', {'token': token, 'org': ORG[org][1], 'items': [{'i': w['n'], 'job': w['kind'][:20], 'text': w['q']} for w in ws]})
        got = {int(it['i']): it for it in r.get('items', [])}
        for w in ws:
            if w['n'] in got:
                cache[f"WEB#{w['n']}"] = {'qs': got[w['n']]['qs'], 'drop': got[w['n']]['drop'], 'org': org, 'year': w['year']}
        print(org, len(ws), '→', sum(len(got.get(w['n'], {}).get('qs', [])) for w in ws))
    json.dump(cache, open(cache_p, 'w', encoding='utf-8'), ensure_ascii=False)


CAREER = re.compile(r'(이직|퇴사|전\s?직장|이전\s?직장|현\s?직장|경력\s?사항|연봉|월급|급여|공백기|가족의\s?의미|가족\s?관계|회항)')   # 경력·연봉 전제, 가족 관련, 특정 회사 사건은 빼기


def norm(q):
    return re.sub(r'[^0-9A-Za-z가-힣]', '', q)


def fix_josa(text, name):
    """기관 이름 바로 뒤 조사를 받침에 맞게 (예: 대한적십자사은 → 대한적십자사는)"""
    if not name:
        return text
    last = name[-1]
    has = '가' <= last <= '힣' and (ord(last) - 0xAC00) % 28 != 0
    pairs = [('은', '는'), ('이', '가'), ('을', '를'), ('과', '와'), ('으로', '로')]
    for a, b in pairs:
        right, wrong = (a, b) if has else (b, a)
        text = re.sub(re.escape(name) + wrong + r'(?=[\s,.?!]|$)', name + right, text)
    return text


def similar(a, b):
    A = {a[i:i + 2] for i in range(len(a) - 1)}; B = {b[i:i + 2] for i in range(len(b) - 1)}
    return len(A & B) / max(1, len(A | B))


def build(xlsx, work):
    """classified.json → rows.json(넣을 질문), stats.json(기관별 후기 요약), preview.xlsx(미리보기)"""
    import openpyxl
    from openpyxl.styles import Font, PatternFill, Alignment
    cache = json.load(open(os.path.join(work, 'classified.json'), encoding='utf-8'))
    data = read_reviews(xlsx)
    rows, stats, drops, per_org = [], {}, Counter(), {}
    for sheet, recs in data.items():
        if sheet in EXCLUDE_ORGS:
            continue
        key, name, grp, tid = ORG[sheet]
        seen = per_org.setdefault(key, {})
        st = stats.setdefault(tid, {'name': name, 'reviews': 0, 'recent': 0, 'formats': Counter(), 'difficulty': Counter(), 'result': Counter(),
                                    'days': [], 'years': Counter(), 'qtypes': Counter(), 'kept': 0, 'dropped': Counter()})
        for x in recs:
            y = year_of(x)
            st['reviews'] += 1; st['recent'] += 1 if y and y >= 2023 else 0
            if y: st['years'][y] += 1
            for f in re.split(r',\s*', str(x.get('채용방식') or '')):
                if f.strip(): st['formats'][f.strip()] += 1
            if x.get('면접난이도'): st['difficulty'][x['면접난이도']] += 1
            if x.get('면접결과'): st['result'][x['면접결과']] += 1
            m = re.search(r'(\d+)\s*일', str(x.get('발표시기') or ''))
            if m: st['days'].append(int(m.group(1)))
            c = cache.get(f"{sheet}#{x['No']}")
            if not c:
                continue
            for d in c['drop']:
                drops[d['why']] += 1; st['dropped'][d['why']] += 1
            for q in c['qs']:
                text = fix_josa(q['q'].replace('[기관]', name).strip(), name)
                if CAREER.search(text):
                    drops['경력'] += 1; st['dropped']['경력'] += 1; continue
                k = norm(text)
                if len(k) < 5:
                    continue
                if k in seen:
                    seen[k]['freq_company'] += 1; continue
                row = {'company_key': key, 'company': name, 'grp': grp, 'priority': 1,
                       'job': JOB.get(x.get('직무') or '', '기타'), 'job_detail': q.get('r') or None, 'rank': x.get('직급') or None,
                       'year': y, 'recency': None, 'weight': weight_of(y), 'difficulty': x.get('면접난이도'), 'result': x.get('면접결과'),
                       'stage': None, 'qtype': q['t'], 'question': text, 'rep': text, 'has_followup': False, 'orig_type': None,
                       'intent': None, 'eval_points': None, 'followups': None, 'basis': '잡플래닛 면접 후기 (뜻만 살려 다시 씀)',
                       'orig_id': f"{sheet}#{x['No']}", 'src': '한림대권역_18개기관_면접DB.xlsx', 'freq_company': 1}
                seen[k] = row; rows.append(row); st['kept'] += 1; st['qtypes'][q['t']] += 1
    # 웹 공개 면접질문 (실제로 나온 것으로 확인됨 → 가중치 1.2배)
    for ck, c in cache.items():
        if not ck.startswith('WEB#'):
            continue
        key, name, grp, tid = ORG[c['org']]; seen = per_org.setdefault(key, {})
        for d in c['drop']:
            drops[d['why']] += 1
        for q in c['qs']:
            text = fix_josa(q['q'].replace('[기관]', name).strip(), name); k = norm(text)
            if CAREER.search(text) or len(k) < 5:
                continue
            if k in seen:
                seen[k]['freq_company'] += 1; continue
            row = {'company_key': key, 'company': name, 'grp': grp, 'priority': 1, 'job': '기획/경영', 'job_detail': q.get('r') or None, 'rank': '신입',
                   'year': c.get('year'), 'recency': None, 'weight': round(weight_of(c.get('year')) * 1.2, 2), 'difficulty': None, 'result': None,
                   'stage': None, 'qtype': q['t'], 'question': text, 'rep': text, 'has_followup': False, 'orig_type': None, 'intent': None,
                   'eval_points': None, 'followups': None, 'basis': '웹 공개 면접질문 (실제 출제 확인, 뜻만 살려 다시 씀)', 'orig_id': ck,
                   'src': '한림대권역_18개기관_면접DB.xlsx', 'freq_company': 1}
            seen[k] = row; rows.append(row); stats[tid]['kept'] += 1; stats[tid]['qtypes'][q['t']] += 1
    # 여러 번 나온 질문은 조금 더 자주 (최대 2배)
    for r in rows:
        r['weight'] = round(min(r['weight'] * (1 + 0.15 * (r['freq_company'] - 1)), 2.0), 2)
    rows.sort(key=lambda r: (r['company_key'], -r['freq_company'], -(r['year'] or 0)))
    for n, r in enumerate(rows, 1):
        r['id'] = f'HLR-{n:05d}'
    # 기관별 요약 (원문 없이 숫자만)
    out_stats = {}
    for tid, st in stats.items():
        days = sorted(st['days'])
        # 여러 번 나온 질문 중 기관 특징이 보이는 것 (자기소개·지원동기·마무리처럼 어디서나 나오는 것은 뺌)
        often = []
        for r in sorted(rows, key=lambda r: -r['freq_company']):
            if ORG_BY_TID[tid][0] != r['company_key'] or r['freq_company'] < 2 or r['qtype'] in ('자기소개', '지원동기', '마무리', '입사후포부'):
                continue
            k = norm(r['question'].replace(st['name'], ''))
            if any(similar(k, norm(o.replace(st['name'], ''))) > 0.3 for o in often):
                continue   # 뜻이 거의 같은 질문은 하나만
            often.append(r['question'])
            if len(often) >= 6:
                break
        out_stats[tid] = {'name': st['name'], 'reviews': st['reviews'], 'recent': st['recent'], 'questions': st['kept'],
                          'year_from': min(st['years']) if st['years'] else None, 'year_to': max(st['years']) if st['years'] else None,
                          'formats': st['formats'].most_common(6), 'difficulty': [d for d in st['difficulty'].most_common() if d[0] not in ('-', '')],
                          'result': dict(st['result']), 'announce_days': days[len(days) // 2] if days else None,
                          'qtypes': st['qtypes'].most_common(6), 'often': often}
    json.dump(rows, open(os.path.join(work, 'rows.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    json.dump(out_stats, open(os.path.join(work, 'stats.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    # 미리보기 엑셀
    wb = openpyxl.Workbook(); ws = wb.active; ws.title = '요약'
    H = Font(bold=True, color='FFFFFF'); F = PatternFill('solid', fgColor='C8441C')
    ws.append(['기관', '기관 목록 ID', '후기', '최근 3년 후기', '넣을 질문', '뺀 것: 메모', '금지', '경력', '진행불가', '연봉', '개인', '기타', '많이 나온 면접 형태'])
    for tid, st in sorted(stats.items(), key=lambda kv: -kv[1]['reviews']):
        d = st['dropped']
        ws.append([st['name'], tid, st['reviews'], st['recent'], st['kept'], d['메모'], d['금지'], d['경력'], d['진행불가'], d['연봉'], d['개인'], d['기타'],
                   ', '.join(f'{k} {v}' for k, v in st['formats'].most_common(4))])
    ws.append([]); ws.append(['합계', '', sum(s['reviews'] for s in stats.values()), '', len(rows)] + [drops[k] for k in ['메모', '금지', '경력', '진행불가', '연봉', '개인', '기타']])
    ws.append([]); ws.append(['빼기로 한 기관', '국립과학수사연구원 — ' + EXCLUDE_ORGS['국립과학수사연구원']])
    for c in ws[1]: c.font = H; c.fill = F
    ws2 = wb.create_sheet('넣을 질문 (기관별 샘플)')
    ws2.append(['번호', '기관', '유형', '세부 직무', '질문 (다시 쓴 문장)', '나온 횟수', '면접 연도', '가중치'])
    for c in ws2[1]: c.font = H; c.fill = F
    by = defaultdict(list)
    for r in rows: by[r['company_key']].append(r)
    for k, rs in by.items():
        for r in rs[:25]:
            ws2.append([r['id'], r['company'], r['qtype'], r['job_detail'] or '', r['question'], r['freq_company'], r['year'], r['weight']])
    ws3 = wb.create_sheet('뺀 것 (샘플)')
    ws3.append(['기관', '이유', '짧은 요약 (원문 아님)'])
    for c in ws3[1]: c.font = H; c.fill = F
    cnt = Counter()
    for key_, c in cache.items():
        sheet = key_.split('#')[0]
        for d in c['drop']:
            if cnt[(sheet, d['why'])] < 4:
                cnt[(sheet, d['why'])] += 1; ws3.append([sheet, d['why'], d['x']])
    for w, cols in ((ws, [24, 12, 8, 12, 10, 10, 8, 8, 8, 8, 8, 8, 60]), (ws2, [12, 22, 12, 10, 70, 10, 10, 8]), (ws3, [22, 10, 40])):
        for i, wd in enumerate(cols): w.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = wd
    wb.save(os.path.join(work, 'preview.xlsx'))
    print(f'넣을 질문 {len(rows)}개 · 뺀 것 {dict(drops)} · 기관 {len(stats)}곳 → {work}/preview.xlsx')



def push(work):
    """rows.json·stats.json → 클론 DB (qb_reviews_import: HLR 질문만 바꿔 넣고 사용 중인 판에 바로 반영)"""
    token = os.environ.get('QB_IMPORT_TOKEN') or sys.exit('QB_IMPORT_TOKEN이 없어요')
    rows = json.load(open(os.path.join(work, 'rows.json'), encoding='utf-8'))
    stats = json.load(open(os.path.join(work, 'stats.json'), encoding='utf-8'))
    comps, seen = [], set()
    for key, name, grp, tid in ORG.values():
        if key in seen:
            continue
        seen.add(key)
        comps.append({'key': key, 'name': name, 'grp': grp, 'priority': 1, 'talent_id': tid, 'note': '한림대 권역 18개 기관 면접 DB'})
    for r in rows:
        r.pop('freq_company', None)
    print(f'넣을 질문 {len(rows)}개 · 기관 {len(comps)}곳 · 요약 {len(stats)}곳')
    try:
        print(json.dumps(post('/rest/v1/rpc/qb_reviews_import', {'p_companies': comps, 'p_rows': rows, 'p_stats': stats, 'p_token': token}, timeout=300), ensure_ascii=False))
    except urllib.error.HTTPError as e:
        sys.exit(f'실패 {e.code}: {e.read().decode("utf-8", "replace")[:500]}')


ORG_BY_TID = {v[3]: v for v in ORG.values()}


if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]
    if not a:
        sys.exit(__doc__)
    if a[0] == 'classify':
        classify(a[1], a[2])
    elif a[0] == 'classify_web':
        classify_web(a[1], a[2])
    elif a[0] == 'build':
        build(a[1], a[2])
    elif a[0] == 'push':
        push(a[1])
    else:
        sys.exit(__doc__)
