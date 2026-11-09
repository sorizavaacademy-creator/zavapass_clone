-- 026 (클론 전용 · ZAVAPASS-clone yiuraowvnadqdrnysdce) 2026-11-09
-- ① 토론·PT 면접 연습: 후기에서 다시 쓴 토론·발표 주제(qtype 'PT·토론')를 학생이 읽고, 연습 기록을 저장
-- ② 기관별 후기 질문 골라 연습: 기관의 HLR(후기를 다시 쓴 질문)·HLQ(작성 질문) 목록을 학생이 읽음
--    질문은행 원문(엑셀 질문·ADD)은 보여 주지 않음. 금지 질문 검사(blocked)에 걸린 것은 빼고 줌

-- 기관 목록: 후기 질문·토론 주제가 있는 기관과 개수
create or replace function public.list_review_orgs() returns table (talent_id text, name text, grp text, questions integer, topics integer)
language sql stable security definer set search_path = public as $$
  select c.talent_id, c.name, c.grp,
         count(*) filter (where a.qtype <> 'PT·토론')::int, count(*) filter (where a.qtype = 'PT·토론')::int
    from public.qb_addition_companies c
    join public.qb_additions a on a.company_key = c.key and a.active and a.id ~ '^(HLR|HLQ)-'
    join public.qb_questions q on q.id = a.id and q.ver = public.qb_active_ver() and q.blocked is null
   where c.talent_id is not null and auth.uid() is not null
   group by c.talent_id, c.name, c.grp
   order by 4 desc;
$$;
revoke all on function public.list_review_orgs() from public, anon;
grant execute on function public.list_review_orgs() to authenticated;

-- 한 기관의 질문 (p_debate=true면 토론·발표 주제만, null이면 모든 기관의 토론·발표 주제)
create or replace function public.list_review_questions(p_talent_id text, p_debate boolean default false)
returns table (id text, talent_id text, company text, qtype text, question text, job_detail text, year integer)
language sql stable security definer set search_path = public as $$
  select a.id, c.talent_id, c.name, a.qtype, a.question, a.job_detail, a.year
    from public.qb_additions a
    join public.qb_addition_companies c on c.key = a.company_key
    join public.qb_questions q on q.id = a.id and q.ver = public.qb_active_ver() and q.blocked is null
   where auth.uid() is not null and a.active and a.id ~ '^(HLR|HLQ)-'
     and (p_talent_id is null or c.talent_id = p_talent_id)
     and (case when p_debate then a.qtype = 'PT·토론' else a.qtype <> 'PT·토론' end)
     -- 학생 사정을 단정하는 질문(예: 학점이 낮은 이유)은 목록에서 뺌 — 출제할 때는 AI가 중립 질문으로 바꿔 쓰지만 목록은 그대로 보이므로
     and a.question !~ '(낮은|없는|부족한|짧은|긴|많은|적은|늦은)\s?(이유|까닭)|공백기|해당\s?프로젝트|자소서에|자기소개서에'
   order by a.weight desc nulls last, a.year desc nulls last, a.id
   limit 600;
$$;
revoke all on function public.list_review_questions(text, boolean) from public, anon;
grant execute on function public.list_review_questions(text, boolean) to authenticated;

-- 토론·PT 연습 기록 (본인 것만 쓰고 읽음, 관리자는 읽기)
create table if not exists public.debate_practice (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  talent_id text, org text, kind text not null check (kind in ('debate', 'pt')),
  topic text not null, rounds jsonb not null default '[]'::jsonb, feedback jsonb, score integer,
  created_at timestamptz not null default now()
);
create index if not exists debate_practice_user_idx on public.debate_practice (user_id, created_at desc);
alter table public.debate_practice enable row level security;
drop policy if exists "본인 쓰기" on public.debate_practice;
create policy "본인 쓰기" on public.debate_practice for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "본인·관리자 읽기" on public.debate_practice;
create policy "본인·관리자 읽기" on public.debate_practice for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "본인 지우기" on public.debate_practice;
create policy "본인 지우기" on public.debate_practice for delete to authenticated using (user_id = auth.uid());
