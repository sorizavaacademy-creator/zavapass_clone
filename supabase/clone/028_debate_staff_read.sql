-- 2026-11-10 클론(ZAVAPASS-clone) 전용: 교직원·학과 담당이 맡은 학생의 토론·토의·발표 연습 기록을 볼 수 있게 (보고서에 넣기)
-- can_see_user()는 007에서 만든 것과 같은 범위 규칙 (관리자 전체, 교직원 전체, 학과 담당은 맡은 학과)
drop policy if exists "debate_practice: 교직원 읽기" on public.debate_practice;
create policy "debate_practice: 교직원 읽기" on public.debate_practice for select to authenticated using (public.can_see_user(user_id));
