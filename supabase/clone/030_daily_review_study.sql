-- 2026-11-10 클론(ZAVAPASS-clone) 전용: 학생 기능 4가지
--  ① 오늘의 질문(daily_q) ② 실제 면접 복기(real_reviews) ③ 친구와 함께 연습(study_sessions·study_feedback + 로그인 없는 친구용 함수) ④ 기관 한 장 요약(표 없음)

-- ① 오늘의 질문: 하루 한 줄 (연속 기록 계산용)
create table if not exists public.daily_q (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day date not null,
  question text not null,
  score integer,
  created_at timestamptz not null default now(),
  primary key (user_id, day)
);
alter table public.daily_q enable row level security;
drop policy if exists "daily_q: 본인" on public.daily_q;
create policy "daily_q: 본인" on public.daily_q for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "daily_q: 교직원 읽기" on public.daily_q;
create policy "daily_q: 교직원 읽기" on public.daily_q for select to authenticated using (public.can_see_user(user_id));

-- ② 실제 면접 복기
create table if not exists public.real_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  org text not null default '',
  round text,
  interview_date date,
  items jsonb not null default '[]'::jsonb,     -- [{q, a}]
  regret text,
  ai jsonb,                                      -- {summary, next[], followups[{q,why}], good[]}
  share boolean not null default false,          -- 후배를 위해 이름 없이 질문만 남기기
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists real_reviews_user_idx on public.real_reviews (user_id, created_at desc);
alter table public.real_reviews enable row level security;
drop policy if exists "real_reviews: 본인" on public.real_reviews;
create policy "real_reviews: 본인" on public.real_reviews for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "real_reviews: 교직원 읽기" on public.real_reviews;
create policy "real_reviews: 교직원 읽기" on public.real_reviews for select to authenticated using (public.can_see_user(user_id));

-- ③ 친구와 함께 연습: 학생이 질문 세트로 링크를 만들고, 친구는 로그인 없이 그 링크로 면접관이 되어 점수·의견을 남김
create table if not exists public.study_sessions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_name text not null default '',
  questions jsonb not null default '[]'::jsonb,  -- ["질문", ...] 최대 8개
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '3 days')
);
alter table public.study_sessions enable row level security;
drop policy if exists "study_sessions: 본인" on public.study_sessions;
create policy "study_sessions: 본인" on public.study_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.study_feedback (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.study_sessions(id) on delete cascade,
  rater text not null default '친구',
  ratings jsonb not null default '[]'::jsonb,    -- [{content, delivery, attitude, note}] 질문 순서대로
  comment text,
  created_at timestamptz not null default now()
);
alter table public.study_feedback enable row level security;
drop policy if exists "study_feedback: 세션 주인 읽기" on public.study_feedback;
create policy "study_feedback: 세션 주인 읽기" on public.study_feedback for select to authenticated
  using (exists (select 1 from public.study_sessions s where s.id = session_id and (s.user_id = auth.uid() or public.can_see_user(s.user_id))));
drop policy if exists "study_feedback: 세션 주인 지우기" on public.study_feedback;
create policy "study_feedback: 세션 주인 지우기" on public.study_feedback for delete to authenticated
  using (exists (select 1 from public.study_sessions s where s.id = session_id and s.user_id = auth.uid()));

-- 친구용(로그인 없음): 토큰으로 질문만 읽기 — 학생 이름은 성을 뺀 이름만, 기한이 지나면 안 줌
create or replace function public.study_get(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', case when char_length(s.owner_name) >= 3 then substr(s.owner_name, 2) else s.owner_name end,
                            'questions', s.questions, 'expires_at', s.expires_at,
                            'count', (select count(*) from public.study_feedback f where f.session_id = s.id))
    from public.study_sessions s where s.token = p_token and s.expires_at > now();
$$;
-- 친구용: 점수·의견 남기기 (한 링크에 최대 10번, 글자 수 제한)
create or replace function public.study_submit(p_token text, p_rater text, p_ratings jsonb, p_comment text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.study_sessions; n int;
begin
  select * into s from public.study_sessions where token = p_token and expires_at > now();
  if not found then return jsonb_build_object('ok', false, 'error', 'expired'); end if;
  select count(*) into n from public.study_feedback where session_id = s.id;
  if n >= 10 then return jsonb_build_object('ok', false, 'error', 'full'); end if;
  if jsonb_typeof(p_ratings) <> 'array' or jsonb_array_length(p_ratings) > 8 then return jsonb_build_object('ok', false, 'error', 'bad'); end if;
  insert into public.study_feedback (session_id, rater, ratings, comment)
    values (s.id, left(coalesce(nullif(trim(p_rater), ''), '친구'), 20), p_ratings, left(coalesce(p_comment, ''), 600));
  return jsonb_build_object('ok', true);
end $$;
revoke all on function public.study_get(text) from public;
revoke all on function public.study_submit(text, text, jsonb, text) from public;
grant execute on function public.study_get(text) to anon, authenticated;
grant execute on function public.study_submit(text, text, jsonb, text) to anon, authenticated;
