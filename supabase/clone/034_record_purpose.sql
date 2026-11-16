-- 2026-11-17 클론(ZAVAPASS-clone) 전용: 면접 기록에 '면접 종류' 저장
--   major 전공·경험 / job 기관·직무 / review 복습 (예전 기록은 비어 있음 → 화면은 예전처럼 분야 이름)
--   예전에는 전공·경험 면접도 계정에 열린 첫 분야 이름(예: 대기업·중견기업)이 결과 제목에 나왔음
alter table public.interview_records add column if not exists purpose text;
