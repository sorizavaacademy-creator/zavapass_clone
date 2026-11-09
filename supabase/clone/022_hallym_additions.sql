-- 022 (클론 전용 · ZAVAPASS-clone yiuraowvnadqdrnysdce) 2026-11-09
-- 한림대 맞춤 추가 질문: 한림대_모의면접_추가데이터.xlsx(추가분 78개 중 검토 통과분) + 강원 지역 기관 질문(scripts/hallym_additions_authored.json)
--
-- 1) qb_additions: 추가 질문 원본 보관. 엑셀 질문은행 열 + 추가 6열(원래 유형·질문 의도·평가 포인트·예상 꼬리질문·근거·원본 ID)
--    - 질문 의도·평가 포인트: AI 피드백 참고용 (점수는 A~E 기준 그대로)
--    - 예상 꼬리질문: AI 꼬리질문의 첫 후보
--    - 원래 유형·근거·원본 ID: 관리용. 학생 화면에 보이지 않음
-- 2) qb_addition_companies: 엑셀 질문은행에 없던 곳(한림대학교의료원·국민건강보험공단·원주/춘천 기관) → 질문은행 기업키 HL01~
-- 3) qb_apply_additions(판): 사용 중인 판의 qb_questions에 추가 질문을 넣음. 엑셀을 다시 넣어 새 판을 쓰게 될 때도 자동으로 다시 넣음
-- 4) qb_additions_import: 관리자(또는 임시 열쇠)만. 추가분 전체를 바꿔 넣고 바로 사용 중인 판에 반영 (scripts/import_hallym_additions.py)
-- 5) 기관 목록(company_talent)에 '한림대학교의료원' 추가 (구분 '의료기관'). 인재상 공식 문구는 확인하지 못해 비워 두고 '확인 필요'로 표시

create table if not exists public.qb_additions (
  id text primary key,
  company_key text not null, company text, grp text, priority integer,
  job text, job_detail text, rank text, year integer, recency text, weight numeric,
  difficulty text, result text, stage text, qtype text not null,
  question text not null, rep text, has_followup boolean not null default false,
  orig_type text, intent text, eval_points text, followups text, basis text, orig_id text, src text,
  active boolean not null default true, updated_at timestamptz not null default now()
);
create table if not exists public.qb_addition_companies (
  key text primary key, name text not null, grp text, priority integer, talent_id text, note text
);
alter table public.qb_additions enable row level security;
alter table public.qb_addition_companies enable row level security;
drop policy if exists "관리자 읽기" on public.qb_additions;           create policy "관리자 읽기" on public.qb_additions for select to authenticated using (public.is_admin());
drop policy if exists "관리자 읽기" on public.qb_addition_companies;  create policy "관리자 읽기" on public.qb_addition_companies for select to authenticated using (public.is_admin());

-- 추가 질문을 한 판에 넣기 (같은 번호는 새로 고침, 추가분에서 빠진 번호는 지움)
create or replace function public.qb_apply_additions(p_ver integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_q integer; n_co integer; n_ln integer;
begin
  if p_ver is null then return jsonb_build_object('판', null); end if;
  insert into public.qb_companies (ver, key, name, grp, priority, review_count, q_count, recent_count)
  select p_ver, c.key, c.name, c.grp, c.priority, 0, (select count(*) from public.qb_additions a where a.company_key = c.key and a.active), 0
    from public.qb_addition_companies c
  on conflict (ver, key) do nothing;
  get diagnostics n_co = row_count;
  insert into public.qb_company_links (talent_id, company_key, how)
  select c.talent_id, c.key, 'manual' from public.qb_addition_companies c where c.talent_id is not null
  on conflict do nothing;
  get diagnostics n_ln = row_count;
  delete from public.qb_questions q where q.ver = p_ver and (q.id like 'ADD-%' or q.id like 'HLQ-%');
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

-- 추가분 전체 바꿔 넣기 (관리자 또는 임시 열쇠). p_companies·p_rows는 scripts/import_hallym_additions.py가 만듦
create or replace function public.qb_additions_import(p_companies jsonb, p_rows jsonb, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare res jsonb;
begin
  if not public.qb_can_import(p_token) then raise exception '관리자만 할 수 있어요' using errcode = '42501'; end if;
  delete from public.qb_additions where true;
  delete from public.qb_addition_companies where true;
  insert into public.qb_addition_companies (key, name, grp, priority, talent_id, note)
  select x->>'key', x->>'name', x->>'grp', nullif(x->>'priority','')::int, nullif(x->>'talent_id',''), x->>'note'
    from jsonb_array_elements(coalesce(p_companies, '[]'::jsonb)) x;
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

-- 엑셀을 다시 넣어 새 판으로 바꿀 때도 추가 질문을 함께 넣음 (015의 함수에 한 줄 더함)
create or replace function public.qb_import_activate(p_ver integer, p_token text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cur integer := public.qb_active_ver(); n_ex integer; n_lo integer; n_add jsonb;
begin
  if not public.qb_can_import(p_token) then raise exception '관리자만 할 수 있어요' using errcode = '42501'; end if;
  if not exists (select 1 from public.qb_imports where ver = p_ver and status in ('checked', 'old', 'active')) then raise exception '검사를 통과한 판만 바꿀 수 있어요'; end if;
  n_add := public.qb_apply_additions(p_ver);
  insert into public.app_settings (key, value, updated_at) values ('qbank', jsonb_build_object('active', p_ver, 'prev', case when cur = p_ver then null else cur end, 'at', now()), now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
  update public.qb_imports set status = 'old' where status = 'active' and ver <> p_ver;
  update public.qb_imports set status = 'active', activated_at = now() where ver = p_ver;
  delete from public.qb_company_links where how in ('exact', 'loose');
  insert into public.qb_company_links (talent_id, company_key, how)
  select t.id, c.key, 'exact' from public.qb_companies c join public.company_talent t on t.name = c.name where c.ver = p_ver
  on conflict do nothing;
  get diagnostics n_ex = row_count;
  insert into public.qb_company_links (talent_id, company_key, how)
  select t.id, c.key, 'loose' from public.qb_companies c join public.company_talent t
      on replace(t.name, ' ', '') = replace(regexp_replace(c.name, '\s*\(.*\)$', ''), ' ', '')
      or replace(regexp_replace(t.name, '\s*\(.*\)$', ''), ' ', '') = replace(regexp_replace(c.name, '\s*\(.*\)$', ''), ' ', '')
   where c.ver = p_ver and not exists (select 1 from public.qb_company_links l where l.company_key = c.key)
  on conflict do nothing;
  get diagnostics n_lo = row_count;
  return jsonb_build_object('사용_중', p_ver, '바로_전', cur, '이름_같은_연결', n_ex, '비슷한_이름_연결', n_lo, '한림대_추가분', n_add,
    '연결_없는_기업', (select coalesce(jsonb_agg(c.name), '[]'::jsonb) from public.qb_companies c where c.ver = p_ver and not exists (select 1 from public.qb_company_links l where l.company_key = c.key)));
end $$;

-- 기관 목록에 한림대학교의료원 (병원·의료 분야에서 고름)
insert into public.company_talent (id, category, category_order, no, name, talent_type, keywords, keyword_meanings, summary, themes, verify_status, source_url, note,
                                   reference_only, merge_planned, needs_review, review_reason, data_date)
values ('H1-01', '의료기관', 10, 1, '한림대학교의료원', '인재상 확인 필요', '{}', '{}',
        '한림대학교성심병원·강남성심병원·한강성심병원·춘천성심병원·동탄성심병원을 함께 채용하는 한림대학교 의료원이에요. 인재상 공식 문구는 아직 확인하지 못했어요.',
        '{}', '미확인', null, '2026 신입간호사 모집공고에 5개 병원이 함께 올라온 것으로 병원 목록만 확인. 인재상·면접 전형은 공식 채용 사이트(recruit.hallym.or.kr)에서 확인 필요',
        false, false, true, '인재상 공식 문구 미확인', '2026-11-09')
on conflict (id) do nothing;
