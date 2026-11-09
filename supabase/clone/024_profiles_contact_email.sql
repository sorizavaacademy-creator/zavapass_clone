-- 2026-11-09b 학번 로그인: 로그인 아이디는 학번이고, 이메일은 나중에 '비밀번호 찾기'에 쓰려고 따로 받아 둠
-- (로그인 계정 주소는 학번@student.hallym.example.com — 실제 메일이 가지 않는 주소라서 비밀번호 찾기에 못 씀)
alter table public.profiles add column if not exists contact_email text;
alter table public.profiles drop constraint if exists profiles_contact_email_chk;
alter table public.profiles add constraint profiles_contact_email_chk
  check (contact_email is null or (length(contact_email) <= 120 and contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'));
comment on column public.profiles.contact_email is '비밀번호 찾기용 이메일 (로그인 아이디 아님)';
