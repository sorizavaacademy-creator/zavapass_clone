-- 2026-11-13 클론(ZAVAPASS-clone) 전용: '질문 준비' 화면 이용 기록 (관리자 > 운영 기록 > 접속·면접 세션의 '질문 준비 화면 이용')
--  · 면접자 본인 것만 쓰기(만들기·고치기), 관리자는 모두 읽기. 앱은 on_conflict=id 로 같은 줄을 30초마다 고쳐 씀
create table if not exists public.practice_visits (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  field_id text,
  field_name text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active_secs integer not null default 0,
  viewed_count integer not null default 0,
  viewed_q jsonb not null default '[]'::jsonb,
  total_q integer not null default 0,
  next_step text
);
create index if not exists practice_visits_started_idx on public.practice_visits(started_at desc);
alter table public.practice_visits enable row level security;
drop policy if exists "practice_visits: 본인·관리자 읽기" on public.practice_visits;
create policy "practice_visits: 본인·관리자 읽기" on public.practice_visits for select to authenticated using (user_id = auth.uid() or public.is_admin());
drop policy if exists "practice_visits: 본인 쓰기" on public.practice_visits;
create policy "practice_visits: 본인 쓰기" on public.practice_visits for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "practice_visits: 본인 고치기" on public.practice_visits;
create policy "practice_visits: 본인 고치기" on public.practice_visits for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
