-- 037 AI 요청·응답 기록 (클론 ZAVAPASS-clone 전용 · 운영 DB에는 실행하지 않음)
--   AI(OpenAI)에게 보낸 글과 돌려받은 글을 서버 함수가 한 건씩 남김 → 관리자 화면 'AI 요청·응답 기록'
--   · 읽기: 관리자만 (학생·학교 담당자는 볼 수 없음). 쓰기: 서버 함수(서비스 키)만
--   · 보관 기간(app_settings.ai_log.keep_days, 기본 180일)이 지나면 매일 한 번 자동으로 지움
--   · 학생이 면접 기록을 지우면 그 면접 때의 AI 기록도 함께 지움. 계정을 지우면 그 사람의 기록 전부 지움

create table if not exists public.ai_logs (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  user_id       uuid references auth.users(id) on delete cascade,
  fn            text not null,          -- 서버 함수 이름 (followup-question, grade-answer …)
  step          text,                   -- 어떤 일 (꼬리질문, A~E 채점, 리포트 읽기 …)
  model         text,
  status        text not null default 'ok',   -- ok 정상 · empty 빈 응답 · error 오류
  http          integer,
  ms            integer,                -- AI가 답하는 데 걸린 시간
  messages      jsonb,                  -- AI에게 보낸 글 [{role, content}] (이름·학번은 가린 상태)
  response      text,                   -- AI가 돌려준 글 원문
  tokens_in     integer,
  tokens_out    integer,
  tokens_cached integer,
  error         text,
  meta          jsonb
);
create index if not exists ai_logs_created_idx on public.ai_logs (created_at desc);
create index if not exists ai_logs_user_idx on public.ai_logs (user_id, created_at desc);
create index if not exists ai_logs_fn_idx on public.ai_logs (fn, created_at desc);

alter table public.ai_logs enable row level security;
revoke all on public.ai_logs from anon, authenticated;
grant select on public.ai_logs to authenticated;
drop policy if exists "ai_logs: 관리자 읽기" on public.ai_logs;
create policy "ai_logs: 관리자 읽기" on public.ai_logs for select to authenticated using (public.is_admin());

-- 설정: 켜기·끄기, 보관 기간(일)
insert into public.app_settings (key, value) values ('ai_log', '{"enabled": true, "keep_days": 180}'::jsonb)
on conflict (key) do nothing;

-- 꺼져 있으면 저장하지 않음 (서버 함수는 그대로 두고 DB에서 걸러 냄)
create or replace function public.ai_logs_gate() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if coalesce((select (value->>'enabled')::boolean from public.app_settings where key = 'ai_log'), true) = false then
    return null;
  end if;
  return new;
end $$;
drop trigger if exists ai_logs_gate on public.ai_logs;
create trigger ai_logs_gate before insert on public.ai_logs for each row execute function public.ai_logs_gate();

-- 보관 기간이 지난 기록 지우기
create or replace function public.ai_logs_purge() returns integer
language plpgsql security definer set search_path to 'public' as $$
declare d integer; n integer;
begin
  select nullif(value->>'keep_days', '')::integer into d from public.app_settings where key = 'ai_log';
  d := greatest(coalesce(d, 180), 1);
  delete from public.ai_logs where created_at < now() - make_interval(days => d);
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.ai_logs_purge() from public, anon, authenticated;

-- 면접 기록을 지우면 그 면접 때의 AI 기록도 함께 지움
--   (바로 앞 면접 기록 뒤 ~ 이 기록이 저장된 뒤 2분. 앞 기록이 없으면 2시간 전부터)
create or replace function public.ai_logs_on_record_delete() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare t0 timestamptz;
begin
  select max(created_at) into t0 from public.interview_records where user_id = old.user_id and created_at < old.created_at;
  t0 := greatest(coalesce(t0, old.created_at - interval '2 hours'), old.created_at - interval '2 hours');
  delete from public.ai_logs where user_id = old.user_id and created_at > t0 and created_at <= old.created_at + interval '2 minutes';
  return old;
end $$;
drop trigger if exists ai_logs_on_record_delete on public.interview_records;
create trigger ai_logs_on_record_delete before delete on public.interview_records for each row execute function public.ai_logs_on_record_delete();

-- 매일 새벽 3시 17분(한국 시간)에 보관 기간이 지난 기록 지우기
create extension if not exists pg_cron;
do $$ begin
  perform cron.unschedule(jobid) from cron.job where jobname = 'ai-logs-purge';
  perform cron.schedule('ai-logs-purge', '17 18 * * *', 'select public.ai_logs_purge()');
end $$;

-- 관리자 화면 위쪽 요약: 기능별 건수·오류·응답 시간·토큰 (관리자만 결과를 받음)
create or replace function public.ai_logs_summary(p_from timestamptz default null)
returns table (fn text, n bigint, errors bigint, p50_ms integer, p95_ms integer, tokens_in bigint, tokens_out bigint)
language sql stable security definer set search_path to 'public' as $$
  select l.fn, count(*)::bigint, count(*) filter (where l.status <> 'ok')::bigint,
         (percentile_cont(0.5) within group (order by l.ms))::integer,
         (percentile_cont(0.95) within group (order by l.ms))::integer,
         coalesce(sum(l.tokens_in), 0)::bigint, coalesce(sum(l.tokens_out), 0)::bigint
  from public.ai_logs l
  where public.is_admin() and (p_from is null or l.created_at >= p_from)
  group by l.fn order by count(*) desc;
$$;
revoke all on function public.ai_logs_summary(timestamptz) from public, anon;
grant execute on function public.ai_logs_summary(timestamptz) to authenticated;
