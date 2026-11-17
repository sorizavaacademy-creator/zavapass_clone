-- 2026-11-17 클론(ZAVAPASS-clone) 전용: 인바디 리포트 PDF에서 읽은 내용 보관
--   report = { file, at, items:[{group,label,value}], questions:[{q,basis,why}], summary, masked }
--   학번·이름은 넣지 않음 (화면에서 가린 뒤 읽음). 본인만 쓰고, 교직원은 기존 정책대로 읽기만.
alter table public.career_inbody add column if not exists report jsonb;
