-- 2026-11-10 클론(ZAVAPASS-clone) 전용: 나만의 답변 노트 — 질문 유형별로 학생이 정한 답 하나씩
create table if not exists public.answer_notes (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  cat text not null check (cat in ('intro', 'motive', 'pers', 'exp', 'sit', 'plan', 'job')),
  question text not null default '',
  answer text not null,
  source text,            -- interview · retry · rewrite · mine · finish10
  score integer,
  updated_at timestamptz not null default now(),
  primary key (user_id, cat)
);
alter table public.answer_notes enable row level security;
drop policy if exists "answer_notes: 본인" on public.answer_notes;
create policy "answer_notes: 본인" on public.answer_notes for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "answer_notes: 교직원 읽기" on public.answer_notes;
create policy "answer_notes: 교직원 읽기" on public.answer_notes for select to authenticated using (public.can_see_user(user_id));
