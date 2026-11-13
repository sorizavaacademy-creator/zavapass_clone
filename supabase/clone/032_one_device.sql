-- 2026-11-13 클론(ZAVAPASS-clone) 전용: 한 계정은 한 기기에서만 (운영 DB의 active_sessions와 같은 칸)
--  · 로그인하면 session_claim: 이 기기(로그인 세션)를 '지금 쓰는 기기'로 등록 → 예전 기기는 다음 확인 때 "다른 기기에서 로그인해서 종료" 안내
--  · 화면에서 20초마다·앱으로 돌아올 때·면접 시작할 때 session_check: 내 세션이 지금 쓰는 기기인지 확인
--  · 같은 브라우저의 다른 탭은 같은 로그인 세션이라 서로 끊지 않음. 관리자는 앱에서 확인하지 않음
create table if not exists public.active_sessions (
  user_id uuid primary key references auth.users(id) on delete cascade,
  session_id text not null,
  device text,
  started_at timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  takeovers integer not null default 0
);
alter table public.active_sessions enable row level security;
drop policy if exists "active_sessions: 본인·관리자 읽기" on public.active_sessions;
create policy "active_sessions: 본인·관리자 읽기" on public.active_sessions for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- 이 기기를 지금 쓰는 기기로 등록
create or replace function public.session_claim(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_sid text := coalesce(auth.jwt()->>'session_id', ''); v_prev public.active_sessions%rowtype; v_replaced boolean := false;
begin
  if v_uid is null then raise exception '로그인이 필요해요'; end if;
  select * into v_prev from public.active_sessions where user_id = v_uid;
  v_replaced := found and v_prev.session_id <> v_sid;
  insert into public.active_sessions(user_id, session_id, device, started_at, last_seen, takeovers)
  values (v_uid, v_sid, left(p_device, 80), now(), now(), 0)
  on conflict (user_id) do update set session_id = excluded.session_id, device = excluded.device, last_seen = now(),
    started_at = case when public.active_sessions.session_id <> excluded.session_id then now() else public.active_sessions.started_at end,
    takeovers = public.active_sessions.takeovers + case when public.active_sessions.session_id <> excluded.session_id then 1 else 0 end;
  return jsonb_build_object('ok', true, 'replaced', v_replaced, 'prev_device', case when v_replaced then v_prev.device end);
end $$;
revoke all on function public.session_claim(text) from public, anon;
grant execute on function public.session_claim(text) to authenticated;

-- 내 세션이 지금 쓰는 기기인지 확인 (화면은 바꾸지 않음)
create or replace function public.session_check(p_device text default null)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_sid text := coalesce(auth.jwt()->>'session_id', ''); r public.active_sessions%rowtype;
begin
  if v_uid is null then return jsonb_build_object('ok', true); end if;
  select * into r from public.active_sessions where user_id = v_uid;
  if not found then return jsonb_build_object('ok', true); end if;
  if r.session_id = v_sid then
    update public.active_sessions set last_seen = now() where user_id = v_uid and last_seen < now() - interval '15 seconds';
    return jsonb_build_object('ok', true);
  end if;
  return jsonb_build_object('ok', false, 'reason', 'replaced', 'device', r.device, 'since', r.started_at);
end $$;
revoke all on function public.session_check(text) from public, anon;
grant execute on function public.session_check(text) to authenticated;
