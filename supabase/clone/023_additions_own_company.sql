-- 한림대 추가 질문 중 특정 기관 전용 질문(예: 강원대학교병원 역할)은 그 기관을 고른 학생에게만 나오게 함
-- 같은 분야(병원·공기업) 다른 기관을 고른 학생에게는 섞이지 않음. 병원 공통(HL00)은 계속 모든 병원에 나옴
-- 병원 직무는 모두 '의약'이라서, 추가 질문의 세부 직무(간호·언어·청각·방사선·임상병리·물리·작업치료·행정·복지)가 학생이 고른 직무와 다르면 빼기
--   (예: 언어재활사 학생에게 인슐린·욕창 질문이 나오지 않게). 병원 질문 중 자기소개·지원동기·마무리처럼 모든 직무에 맞는 유형은 빼고 적용, 세부 직무를 모르면 그대로 둠
create or replace function public.qb_role_group(s text) returns text language sql immutable as $$
  select case when s is null then ''
              when s ~ '간호' then '간호'
              when s ~ '언어' then '언어'
              when s ~ '청능|청각' then '청각'
              when s ~ '보건의료기사|의료기사' then '기사공통'      -- 방사선·임상병리·물리·작업치료 모두에 맞는 질문
              when s ~ '방사선' then '방사선'
              when s ~ '임상병리' then '임상병리'
              when s ~ '물리치료' then '물리치료'
              when s ~ '작업치료' then '작업치료'
              when s ~ '사회복지' then '복지'
              when s ~ '원무|행정|보험심사|의무기록|홍보|전산|사무' then '행정'
              else '' end
$$;

drop function if exists public.qb_pick_candidates(integer, text, text, text, text, text[], integer);
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
           and (rg = '' or q.grp is distinct from '병원' or q.id !~ '^(ADD|HLQ)-'
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

grant execute on function public.qb_pick_candidates(integer, text, text, text, text, text[], integer, text) to service_role;
revoke all on function public.qb_pick_candidates(integer, text, text, text, text, text[], integer, text) from public, anon, authenticated;
