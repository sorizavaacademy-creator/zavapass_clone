-- 025 (클론 전용 · ZAVAPASS-clone yiuraowvnadqdrnysdce) 2026-11-09
-- 한림대 권역 18개 기관 면접 DB(잡플래닛 후기 4,759건 + 웹 공개 면접질문 + 공식 채용정보) 넣기
--  1) 후기 질문은 'HLR-' 번호로 qb_additions에 넣음. 원문이 아니라 AI가 뜻만 살려 다시 쓴 질문만 (scripts/import_hallym_reviews.py)
--     qb_reviews_import: HLR 질문만 바꿔 넣음 / qb_additions_import(ADD·HLQ)는 HLR을 지우지 않게 바꿈
--  2) 기관 목록(company_talent)에 강원권 병원 8곳 추가 (H1-02~09, 구분 '의료기관')
--  3) 공식 채용정보 중 도 공식 게시판 공고로 확인된 것만 company_interview_process에 (원주의료원·삼척의료원, 한림대의료원은 2차 출처 표시)
--  4) company_review_stats: 기관별 후기 요약(숫자만 — 면접 형태·난이도·발표 시기·합격 후기 비율·자주 나온 질문) → get_company_pack의 'reviews'
--  5) qb_pick_candidates: HLR 질문도 병원 세부 직무(간호·방사선 …)로 거름

-- ── 1) 추가 질문 넣기 함수 ──
create or replace function public.qb_apply_additions(p_ver integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_q integer; n_co integer; n_ln integer;
begin
  if p_ver is null then return jsonb_build_object('판', null); end if;
  insert into public.qb_companies (ver, key, name, grp, priority, review_count, q_count, recent_count)
  select p_ver, c.key, c.name, c.grp, c.priority, 0, (select count(*) from public.qb_additions a where a.company_key = c.key and a.active), 0
    from public.qb_addition_companies c
  on conflict (ver, key) do update set q_count = excluded.q_count;
  get diagnostics n_co = row_count;
  insert into public.qb_company_links (talent_id, company_key, how)
  select c.talent_id, c.key, 'manual' from public.qb_addition_companies c where c.talent_id is not null
  on conflict do nothing;
  get diagnostics n_ln = row_count;
  delete from public.qb_questions q where q.ver = p_ver and (q.id like 'ADD-%' or q.id like 'HLQ-%' or q.id like 'HLR-%');
  insert into public.qb_questions (ver, id, company_key, company, grp, priority, job, rank, year, recency, weight, difficulty, result, stage, qtype,
                                   question, rep, has_followup, freq_company, freq_total, rep_key, blocked)
  select p_ver, a.id, a.company_key, a.company, a.grp, a.priority, a.job, a.rank, a.year, a.recency, a.weight, a.difficulty, a.result, a.stage, a.qtype,
         a.question, coalesce(a.rep, a.question), a.has_followup, 1, 1, public.qb_rep_key(coalesce(a.rep, a.question)),
         public.qb_block_reason(a.question || ' / ' || coalesce(a.rep, ''))
    from public.qb_additions a where a.active;
  get diagnostics n_q = row_count;
  return jsonb_build_object('판', p_ver, '넣은_질문', n_q, '새_기업', n_co, '새_연결', n_ln);
end $$;
revoke all on function public.qb_apply_additions(integer) from public, anon, authenticated;

create or replace function public.qb_additions_import(p_companies jsonb, p_rows jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.qb_can_import(p_token) then raise exception '관리자만 할 수 있어요' using errcode = '42501'; end if;
  delete from public.qb_additions where id !~ '^HLR-';   -- 후기 질문(HLR)은 qb_reviews_import가 따로 관리
  insert into public.qb_addition_companies (key, name, grp, priority, talent_id, note)
  select x->>'key', x->>'name', x->>'grp', nullif(x->>'priority','')::int, nullif(x->>'talent_id',''), x->>'note'
    from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) x
  on conflict (key) do update set name = excluded.name, grp = excluded.grp, priority = excluded.priority, talent_id = coalesce(excluded.talent_id, qb_addition_companies.talent_id), note = excluded.note;
  insert into public.qb_additions (id, company_key, company, grp, priority, job, job_detail, rank, year, recency, weight, difficulty, result, stage, qtype,
                                   question, rep, has_followup, orig_type, intent, eval_points, followups, basis, orig_id, src)
  select x->>'id', x->>'company_key', x->>'company', x->>'grp', nullif(x->>'priority','')::int, x->>'job', x->>'job_detail', x->>'rank',
         nullif(x->>'year','')::int, nullif(x->>'recency',''), nullif(x->>'weight','')::numeric, nullif(x->>'difficulty',''), nullif(x->>'result',''),
         x->>'stage', x->>'qtype', x->>'question', nullif(x->>'rep',''), coalesce((x->>'has_followup')::boolean, false),
         x->>'orig_type', x->>'intent', x->>'eval_points', x->>'followups', x->>'basis', x->>'orig_id', x->>'src'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x;
  res := public.qb_apply_additions(public.qb_active_ver());
  return res || jsonb_build_object('추가분_질문', (select count(*) from public.qb_additions), '추가분_기업', (select count(*) from public.qb_addition_companies));
end $$;
revoke all on function public.qb_additions_import(jsonb, jsonb, text) from public, anon;
grant execute on function public.qb_additions_import(jsonb, jsonb, text) to authenticated, anon;

-- 후기 질문(HLR)만 바꿔 넣기 + 기관별 후기 요약 (관리자 또는 임시 열쇠)
create table if not exists public.company_review_stats (
  company_id text primary key, stats jsonb not null, source text, data_date date not null default current_date, updated_at timestamptz not null default now()
);
alter table public.company_review_stats enable row level security;
drop policy if exists "관리자 읽기" on public.company_review_stats;
create policy "관리자 읽기" on public.company_review_stats for select to authenticated using (public.is_admin());

create or replace function public.qb_reviews_import(p_companies jsonb, p_rows jsonb, p_stats jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.qb_can_import(p_token) then raise exception '관리자만 할 수 있어요' using errcode = '42501'; end if;
  delete from public.qb_additions where id ~ '^HLR-';
  insert into public.qb_addition_companies (key, name, grp, priority, talent_id, note)
  select x->>'key', x->>'name', x->>'grp', nullif(x->>'priority','')::int, nullif(x->>'talent_id',''), x->>'note'
    from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) x
  on conflict (key) do update set name = excluded.name, grp = excluded.grp, talent_id = coalesce(excluded.talent_id, qb_addition_companies.talent_id);
  insert into public.qb_additions (id, company_key, company, grp, priority, job, job_detail, rank, year, recency, weight, difficulty, result, stage, qtype,
                                   question, rep, has_followup, orig_type, intent, eval_points, followups, basis, orig_id, src)
  select x->>'id', x->>'company_key', x->>'company', x->>'grp', nullif(x->>'priority','')::int, x->>'job', x->>'job_detail', x->>'rank',
         nullif(x->>'year','')::int, null, nullif(x->>'weight','')::numeric, nullif(x->>'difficulty',''), nullif(x->>'result',''),
         null, x->>'qtype', x->>'question', nullif(x->>'rep',''), false, null, null, null, null, x->>'basis', x->>'orig_id', x->>'src'
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) x
   where x->>'id' ~ '^HLR-\d{5}$';
  delete from public.company_review_stats where true;
  insert into public.company_review_stats (company_id, stats, source)
  select k, v, '한림대 권역 18개 기관 면접 DB (잡플래닛 후기 요약, 2026-11-09 수집)' from jsonb_each(coalesce(p_stats, '{}'::jsonb)) as e(k, v)
   where exists (select 1 from public.company_talent t where t.id = k);
  res := public.qb_apply_additions(public.qb_active_ver());
  return res || jsonb_build_object('후기_질문', (select count(*) from public.qb_additions where id ~ '^HLR-'), '후기_요약_기관', (select count(*) from public.company_review_stats));
end $$;
revoke all on function public.qb_reviews_import(jsonb, jsonb, jsonb, text) from public, anon;
grant execute on function public.qb_reviews_import(jsonb, jsonb, jsonb, text) to authenticated, anon;

-- ── 2) 기관 목록에 강원권 병원 8곳 ──
insert into public.company_talent (id, category, category_order, no, name, talent_type, keywords, keyword_meanings, summary, themes, verify_status, source_url, note, reference_only, merge_planned, needs_review, review_reason, data_date)
values
 ('H1-02','의료기관',0,2,'원주세브란스기독병원','인재상 확인 필요','{}','{}','원주에 있는 대학병원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.','{}','미확인',null,'한림대 권역 18개 기관 면접 DB(2026-11-09)로 추가. 채용 공고 본문 확인 못 함',false,false,true,'인재상 공식 문구 미확인',current_date),
 ('H1-03','의료기관',0,3,'강릉아산병원','인재상 확인 필요','{}','{}','강릉에 있는 종합병원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.','{}','미확인',null,'한림대 권역 18개 기관 면접 DB(2026-11-09)로 추가. 공고 상세가 이미지라 확인 못 함',false,false,true,'인재상 공식 문구 미확인',current_date),
 ('H1-04','의료기관',0,4,'원주의료원','인재상','{}','{}','영서 지역을 책임지는 강원도 지역거점공공병원이에요. 별도 인재상은 두지 않아요.','{}','부분확인','https://state.gwd.go.kr/portal/bulletin/recruitment','공고 제2026-113호(도정마당)에서 확인: 별도 인재상 없음',false,false,false,null,current_date),
 ('H1-05','의료기관',0,5,'강릉의료원','인재상 확인 필요','{}','{}','강릉에 있는 강원도 지방의료원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.','{}','미확인',null,'한림대 권역 18개 기관 면접 DB(2026-11-09)로 추가',false,false,true,'인재상 공식 문구 미확인',current_date),
 ('H1-06','의료기관',0,6,'삼척의료원','인재상',array['투철한 소명의식과 전문성을 갖춘 직원'],array['투철한 소명의식과 전문성을 갖춘 직원: 공공병원 직원으로서의 사명감과 맡은 일의 전문성을 함께 갖춘 사람'],'영동 남부 권역의 강원도 지역거점공공병원이에요.','{"책임·실행","전문성"}','부분확인','https://state.gwd.go.kr/portal/bulletin/recruitment','공고 제2026-59호(도정마당)에서 확인',false,false,false,null,current_date),
 ('H1-07','의료기관',0,7,'영월의료원','인재상 확인 필요','{}','{}','영월에 있는 강원도 지방의료원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.','{}','미확인',null,'한림대 권역 18개 기관 면접 DB(2026-11-09)로 추가',false,false,true,'인재상 공식 문구 미확인',current_date),
 ('H1-08','의료기관',0,8,'속초의료원','인재상 확인 필요','{}','{}','속초에 있는 강원도 지방의료원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.','{}','미확인',null,'한림대 권역 18개 기관 면접 DB(2026-11-09)로 추가. 2023년 공고만 확인됨',false,false,true,'인재상 공식 문구 미확인',current_date),
 ('H1-09','의료기관',0,9,'국민건강보험공단 일산병원','인재상',array['배려人','전문人','동행人'],array['배려人: 환자와 동료를 먼저 생각하는 사람','전문人: 맡은 분야의 전문성을 갖춘 사람','동행人: 함께 일하며 같이 성장하는 사람'],'국민건강보험공단이 직접 운영하는 경기 고양의 공공병원이에요.','{"협력·소통","전문성"}','부분확인','https://www.haijob.co.kr/blog/2026-nhis-ilsan-hospital-nurse-recruitment-cover-letter-guide/','인재상 키워드는 2차 출처(채용 안내 글)에서 확인, 뜻풀이는 키워드에 맞춘 쉬운 설명',false,false,false,null,current_date)
on conflict (id) do nothing;

-- ── 3) 공식 채용정보 (도 공식 게시판 공고로 확인된 것만) ──
insert into public.company_interview_process (company_id, sheet_name, provide_level, provide_reason, checked_url, stages, interview_types, detail, base_posting, posted_month, source_type, source_url, note, group_common, secondary_source, data_date)
values
 ('H1-04','원주의료원','일부 제공','공고문에 전형·평가 기준 공개','https://state.gwd.go.kr/portal/bulletin/recruitment','서류전형(채용 인원에 따라 4~10배수) → 면접 → 최종합격 (필기시험 없음)','{"인성"}','면접은 심사기준에 따른 평가요소 5개로 점수를 매기고, 평균 점수에 못 미치면 합격자가 없을 수 있다. 일부 공고는 온라인 인·적성검사(웹캠)가 있었다.','원주의료원 공고 제2026-113호','2026-09','공고 원문','https://state.gwd.go.kr/egf/bp/common/front/264124/download','간호직·보건직 공고 기준',false,false,current_date),
 ('H1-06','삼척의료원','일부 제공','공고문에 전형·평가 기준 공개','https://state.gwd.go.kr/portal/bulletin/recruitment','서류전형(자격 적격 심사) → 면접 → 합격자 발표 (필기시험 없음)','{"인성"}','블라인드 면접으로 평정요소 4개를 점수로 매기고, 60점 이상인 사람 중 높은 점수 순으로 뽑는다.','삼척의료원 공고 제2026-59호','2026-09','공고 원문','https://state.gwd.go.kr/egf/bp/common/front/264241/download','간호사 공고 기준',false,false,current_date),
 ('H1-01','한림대학교의료원','일부 제공','간호직 채용 공고 재게시본 기준','https://recruit.hallym.or.kr','서류전형 → AI 면접(필수) + 대면면접 → 신체검사·인성검사 (필기시험 없음)','{"AI역량검사","인성"}','2026년 신규간호사 공고 기준으로 AI 면접을 먼저 보고 대면면접을 본다. 세부 방식은 병원 홈페이지 공지를 따른다.','2026년 한림대학교의료원 신규간호사 채용','2025-10','재게시 공고','https://nurse-link.co.kr/jobs/3765','간호직 기준, 다른 직종은 다를 수 있음',true,true,current_date)
on conflict (company_id) do nothing;

-- ── 4) get_company_pack에 기관별 후기 요약 (019의 needs_review·collection은 그대로 둠) ──
create or replace function public.get_company_pack(p_id text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'talent', jsonb_build_object('id', t.id, 'name', t.name, 'category', t.category, 'talent_type', t.talent_type,
               'keywords', t.keywords, 'keyword_meanings', t.keyword_meanings, 'summary', t.summary, 'themes', t.themes,
               'verify_status', t.verify_status, 'reference_only', t.reference_only, 'merge_planned', t.merge_planned,
               'needs_review', t.needs_review),
    'process', (select jsonb_build_object('provide_level', p.provide_level, 'stages', p.stages, 'interview_types', p.interview_types,
               'detail', p.detail, 'base_posting', p.base_posting, 'posted_month', p.posted_month,
               'group_common', p.group_common, 'secondary_source', p.secondary_source)
               from public.company_interview_process p where p.company_id = t.id),
    'questions', coalesce((select jsonb_agg(jsonb_build_object('seq', q.seq, 'question', q.question, 'linked_talent', q.linked_talent,
                                                              'eval_point', q.eval_point, 'basis', q.basis) order by q.seq)
                           from public.company_interview_question q where q.company_id = t.id), '[]'::jsonb),
    'collection', (select public.ic_target_json(l.target_key) from public.interview_target_talent l where l.talent_id = t.id),   -- 019 면접 자료 수집 그대로
    'reviews', (select r.stats || jsonb_build_object('data_date', r.data_date) from public.company_review_stats r where r.company_id = t.id))
  from public.company_talent t
  where t.id = p_id and auth.uid() is not null;
$$;
revoke all on function public.get_company_pack(text) from public, anon;
grant execute on function public.get_company_pack(text) to authenticated;

-- ── 5) 병원 세부 직무 거르기에 HLR(후기 질문)도 넣음 (HLR은 기존 엑셀 질문처럼 같은 분야 다른 기관에도 나옴) ──
create or replace function public.qb_pick_candidates(p_ver integer, p_qtype text, p_company text, p_grp text, p_job text, p_exclude text[], p_n integer, p_role text default null)
 returns table(id text, company_key text, company text, rep text, question text, rep_key text, tier integer)
 language plpgsql stable security definer set search_path to 'public'
as $function$
declare picked text[] := coalesce(p_exclude, '{}'); t integer; r record; got integer := 0; rg text := public.qb_role_group(p_role);
begin
  for t in 1 .. 5 loop
    exit when got >= p_n;
    continue when t <= 2 and p_company is null;
    continue when t in (1, 3) and p_job is null;
    continue when t in (3, 4) and p_grp is null;
    for r in
      select x.* from (
        select distinct on (q.rep_key) q.id, q.company_key, q.company, q.rep, q.question, q.rep_key,
               -ln(greatest(random(), 1e-9)) / greatest(coalesce(q.weight, 0.15), 0.01) as s
          from public.qb_questions q
         where q.ver = p_ver and q.qtype = p_qtype and q.blocked is null and q.rep_key is not null
           and coalesce(q.rank, '') !~ '^(대리|과장|차장|부장|이사|주임/계장)'
           and (coalesce(q.question, '') || ' ' || coalesce(q.rep, '')) !~ '(이직|전\s?직장|이전\s?직장|직전\s?(회사|직장)|퇴사|현\s?직장|현재\s?(회사|직장)|전\s?회사|경력\s?(기술|사항)|경력사항|재직\s?중)'
           and not (q.rep_key = any(picked))
           and (t <= 2 or q.id !~ '^(ADD|HLQ)-' or q.company_key = 'HL00')
           and (rg = '' or q.grp is distinct from '병원' or q.id !~ '^(ADD|HLQ|HLR)-'
                -- 자기소개·지원동기처럼 모든 직무에 맞는 유형은 질문 문장에 다른 직무 이름이 있을 때만 빼고,
                -- 나머지 유형은 추가 질문의 세부 직무(qb_additions.job_detail)로 판단
                or (case when p_qtype in ('자기소개', '지원동기', '마무리', '입사후포부', '근무조건')
                         then public.qb_role_group(q.question)
                         else coalesce((select public.qb_role_group(a.job_detail) from public.qb_additions a where a.id = q.id), '') end)
                   in ('', rg)
                or ((case when p_qtype in ('자기소개', '지원동기', '마무리', '입사후포부', '근무조건')
                          then public.qb_role_group(q.question)
                          else coalesce((select public.qb_role_group(a.job_detail) from public.qb_additions a where a.id = q.id), '') end) = '기사공통'
                    and rg in ('방사선', '임상병리', '물리치료', '작업치료')))
           and case t when 1 then q.company_key = p_company and q.job = p_job
                      when 2 then q.company_key = p_company
                      when 3 then q.grp = p_grp and q.job = p_job
                      when 4 then q.grp = p_grp
                      else true end
         order by q.rep_key, s) x
      order by x.s limit (p_n - got)
    loop
      id := r.id; company_key := r.company_key; company := r.company; rep := r.rep; question := r.question; rep_key := r.rep_key; tier := t;
      picked := picked || r.rep_key; got := got + 1;
      return next;
    end loop;
  end loop;
end $function$;
