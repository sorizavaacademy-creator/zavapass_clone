-- 2026-11-17 클론(ZAVAPASS-clone) 전용: 학생이 자기 면접 기록(세션)을 직접 지울 수 있게
--   답변(interview_answers)은 기록을 지우면 함께 지워짐(ON DELETE CASCADE). 다시 답하기 기록은 화면에서 먼저 지움.
drop policy if exists "interview_records: 본인 지우기" on public.interview_records;
create policy "interview_records: 본인 지우기" on public.interview_records for delete using (user_id = auth.uid());
