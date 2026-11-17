-- 038 지시문 차단 규칙과 감지 기록 (클론 ZAVAPASS-clone 전용 · 운영 DB에는 실행하지 않음)
--   학생 답변·올린 자료에서 'AI에게 내리는 지시'가 보이거나, AI 응답에 내부 지시문이 섞이면 서버 함수가 한 건씩 남김
--   · 읽기: 관리자만. 쓰기: 서버 함수(서비스 키)만. 관리자가 넣는 차단 문구는 ai_guard_rules (학생은 읽을 수 없음)
--   · 보관 기간·면접 기록 삭제 때 함께 지움은 ai_logs 와 같음

create table if not exists public.ai_guard_events (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id    uuid references auth.users(id) on delete cascade,
  fn         text not null,            -- 서버 함수 이름
  step       text,
  kind       text not null,            -- input 지시문 시도 · output_leak 내부 지시문 노출 막음 · output_block 금지 질문 바꿈
  level      text not null default 'high',   -- high 뚜렷함 · low 그럴 수도 있음
  rules      text[] not null default '{}',   -- 걸린 규칙 이름
  section    text,                     -- 어느 묶음에서 (면접자 답변, 리포트 …)
  snippet    text,                     -- 걸린 문장 (이름·학번은 가린 상태)
  action     text                      -- 어떻게 처리했는지
);
create index if not exists ai_guard_events_created_idx on public.ai_guard_events (created_at desc);
create index if not exists ai_guard_events_user_idx on public.ai_guard_events (user_id, created_at desc);
alter table public.ai_guard_events enable row level security;
revoke all on public.ai_guard_events from anon, authenticated;
grant select on public.ai_guard_events to authenticated;
drop policy if exists "ai_guard_events: 관리자 읽기" on public.ai_guard_events;
create policy "ai_guard_events: 관리자 읽기" on public.ai_guard_events for select to authenticated using (public.is_admin());

create table if not exists public.ai_guard_rules (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  phrase     text not null check (char_length(btrim(phrase)) between 2 and 80),
  enabled    boolean not null default true,
  created_by uuid default auth.uid()
);
create unique index if not exists ai_guard_rules_phrase_uidx on public.ai_guard_rules (lower(btrim(phrase)));
alter table public.ai_guard_rules enable row level security;
revoke all on public.ai_guard_rules from anon, authenticated;
grant select, insert, update, delete on public.ai_guard_rules to authenticated;
drop policy if exists "ai_guard_rules: 관리자만" on public.ai_guard_rules;
create policy "ai_guard_rules: 관리자만" on public.ai_guard_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.app_settings (key, value) values ('ai_guard', '{"enabled": true}'::jsonb) on conflict (key) do nothing;

-- 보관 기간이 지난 기록 지우기: 감지 기록도 함께
create or replace function public.ai_logs_purge() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare d integer; n integer;
begin
  select nullif(value->>'keep_days', '')::integer into d from public.app_settings where key = 'ai_log';
  d := greatest(coalesce(d, 180), 1);
  delete from public.ai_guard_events where created_at < now() - make_interval(days => d);
  delete from public.ai_logs where created_at < now() - make_interval(days => d);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ai_logs_purge() from public, anon, authenticated;

-- 면접 기록을 지우면 그 면접 때의 감지 기록도 함께
create or replace function public.ai_logs_on_record_delete() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare t0 timestamptz;
begin
  select max(created_at) into t0 from public.interview_records where user_id = old.user_id and created_at < old.created_at;
  t0 := greatest(coalesce(t0, old.created_at - interval '2 hours'), old.created_at - interval '2 hours');
  delete from public.ai_logs where user_id = old.user_id and created_at > t0 and created_at <= old.created_at + interval '2 minutes';
  delete from public.ai_guard_events where user_id = old.user_id and created_at > t0 and created_at <= old.created_at + interval '2 minutes';
  return old;
end $$;
