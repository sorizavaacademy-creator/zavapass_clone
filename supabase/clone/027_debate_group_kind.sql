-- 2026-11-09f 클론(ZAVAPASS-clone) 전용: 토론 연습에 '토의(여럿이)' 방식 추가 — 기록 kind에 'group' 허용
alter table public.debate_practice drop constraint if exists debate_practice_kind_check;
alter table public.debate_practice add constraint debate_practice_kind_check check (kind in ('debate', 'pt', 'group'));
