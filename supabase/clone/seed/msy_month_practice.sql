-- 문서영(학번 20269021) 한 달 연습 데이터 — 클론(ZAVAPASS-clone) 전용, 시연용 예시. 2026-10-20 ~ 2026-11-17, 면접 15회
-- 병원·의료(한림대학교의료원·강원대학교병원·원주세브란스기독병원)와 공공기관(건강보험심사평가원) 관심, 총점 47 → 74점으로 오르는 흐름
-- 한 번만 넣는 파일: 이미 들어 있으면 멈춤. 문서영의 다른 기록(직접 한 면접 등)은 건드리지 않음
do $$ begin if exists(select 1 from interview_records where user_id='7e570000-0000-4000-8000-000000000021' and created_at in ('2026-10-20 10:40:49+00','2026-10-22 11:15:58+00','2026-10-24 12:05:45+00','2026-10-27 10:20:54+00','2026-10-29 11:30:37+00','2026-11-01 05:10:19+00','2026-11-03 10:50:51+00','2026-11-05 11:40:50+00','2026-11-07 12:10:18+00','2026-11-10 10:30:30+00','2026-11-12 11:20:13+00','2026-11-13 10:45:45+00','2026-11-15 06:30:55+00','2026-11-16 11:10:29+00','2026-11-17 10:25:08+00')) then raise exception '이미 넣은 데이터예요. 다시 넣으려면 이 15개 기록을 먼저 지우세요.'; end if; end $$;
with src(i,at,fid,fname,cid,cname,purpose,n,secs,a,b,c,d,e,t1,t2,face,front,away,down,mv,low,cen,smile) as (values
(0,'2026-10-20 10:40:49+00','medical','병원·의료',null,null,'major',7,412,1.91,1.77,1.22,1.91,2.74,'직무·전공지식','지원동기',82,70,24,15,20,16,72,0.08),
(1,'2026-10-22 11:15:58+00','medical','병원·의료','H1-01','한림대학교의료원','job',10,655,2.07,1.95,1.3,1.91,2.68,'기업·산업','지원동기',83,72,23,14,19,15,73,0.1),
(2,'2026-10-24 12:05:45+00','medical','병원·의료',null,null,'major',7,438,2.19,1.99,1.6,2.14,2.81,'경험·역량','직무·전공지식',84,73,21,13,18,14,75,0.12),
(3,'2026-10-27 10:20:54+00','pubcorp','공공기관·공기업','G4-34','건강보험심사평가원','job',10,702,2.09,1.97,1.44,2.15,2.82,'직무·전공지식','기업·산업',85,75,20,13,17,13,76,0.14),
(4,'2026-10-29 11:30:37+00','medical','병원·의료','H1-01','한림대학교의료원','job',11,731,2.29,2.13,1.59,2.21,3.03,'상황대처','경험·역량',86,76,19,12,16,12,78,0.16),
(5,'2026-11-01 05:10:19+00','pubcorp','공공기관·공기업',null,null,'major',7,465,2.38,2.22,1.73,2.34,3.07,'직무·전공지식','지원동기',87,78,18,11,15,11,79,0.18),
(6,'2026-11-03 10:50:51+00','medical','병원·의료','G5-044','강원대학교병원','job',10,688,2.49,2.33,1.79,2.25,3.01,'기업·산업','지원동기',88,80,16,10,14,10,80,0.2),
(7,'2026-11-05 11:40:50+00','pubcorp','공공기관·공기업','G4-34','건강보험심사평가원','job',11,749,2.58,2.41,1.83,2.45,3.15,'경험·역량','직무·전공지식',89,81,15,9,13,9,82,0.22),
(8,'2026-11-07 12:10:18+00','medical','병원·의료','H1-01','한림대학교의료원','job',10,671,2.62,2.44,1.95,2.63,3.26,'직무·전공지식','기업·산업',90,83,14,9,12,8,83,0.24),
(9,'2026-11-10 10:30:30+00','pubcorp','공공기관·공기업','G4-34','건강보험심사평가원','job',11,762,2.69,2.37,2.03,2.62,3.16,'상황대처','경험·역량',91,84,12,8,11,7,85,0.26),
(10,'2026-11-12 11:20:13+00','medical','병원·의료','H1-02','원주세브란스기독병원','job',10,694,2.83,2.59,2.17,2.61,3.41,'직무·전공지식','지원동기',92,86,11,7,10,6,86,0.28),
(11,'2026-11-13 10:45:45+00','pubcorp','공공기관·공기업','G4-34','건강보험심사평가원','job',11,738,2.97,2.82,2.2,2.79,3.4,'기업·산업','지원동기',93,88,10,6,9,5,87,0.3),
(12,'2026-11-15 06:30:55+00','medical','병원·의료',null,null,'major',7,481,2.82,2.57,2.22,2.75,3.44,'경험·역량','직무·전공지식',94,89,8,5,8,4,89,0.32),
(13,'2026-11-16 11:10:29+00','medical','병원·의료','H1-01','한림대학교의료원','job',10,676,2.93,2.81,2.41,2.95,3.64,'직무·전공지식','기업·산업',95,91,7,5,7,3,90,0.34),
(14,'2026-11-17 10:25:08+00','pubcorp','공공기관·공기업','G4-34','건강보험심사평가원','job',11,744,3.06,2.94,2.5,2.9,3.63,'상황대처','경험·역량',96,92,6,4,6,2,92,0.36)
), x as (select *, round(((a*.25+b*.25+c*.20+d*.20+e*.10)/4*100)::numeric,2) total from src)
insert into interview_records (user_id,field_id,field_name,score,question_count,duration_label,created_at,mode,company_id,company_name,purpose,ae_report,nonverbal)
select '7e570000-0000-4000-8000-000000000021',fid,fname,round(total)::int,n,lpad((secs/60)::text,2,'0')||':'||lpad((secs%60)::text,2,'0'),at::timestamptz,'dialog',cid,cname,purpose,
  jsonb_build_object('n',n,'avg',jsonb_build_object('A',a,'B',b,'C',c,'D',d,'E',e),'grade',case when total>=85 then '우수' when total>=70 then '양호' when total>=55 then '보완 필요' else '재연습' end,'total',total,'types',jsonb_build_array(t1,t2),'weakest','C'),
  jsonb_build_object('v',1,'frames',(secs/3.2)::int,'answers',n,'facePct',face,'frontPct',front,'awayPct',away,'downPct',down,'movePct',mv,'lowPct',low,'handPct',null,'multiPct',0,'farPct',2,'nearPct',3,'centeredPct',cen,'smile',smile,
    'items',(select jsonb_agg(jsonb_build_object('i',g,'facePct',least(100,face+(g*7+i)%9-4),'frontPct',least(100,greatest(0,front+(g*5+i)%13-6)),'awayPct',greatest(0,away+(g*3+i)%9-4),'downPct',greatest(0,down+(g*4+i)%7-3),'movePct',greatest(0,mv+(g*6+i)%9-4),'lowPct',greatest(0,low+(g*2+i)%7-3),'handPct',null,'multiPct',0) order by g) from generate_series(0,n-1) g))
from x;
-- 활동 기록(로그인·준비·시작·끝·결과 보기)과 AI 횟수: 위에서 넣은 기록마다
insert into activity_log (user_id,event,detail,created_at)
select r.user_id, e.ev, case e.ev when 'prep_open' then jsonb_build_object('kind',case when r.purpose='major' then 'major' else 'job' end,'field',r.field_id,'company',r.company_name) when 'interview_start' then jsonb_build_object('mode','dialog','field',r.field_name) when 'interview_end' then jsonb_build_object('mode','dialog','count',r.question_count,'field',r.field_name,'score',r.score,'duration',r.duration_label) when 'record_view_new' then jsonb_build_object('id',r.id) else null end,
       r.created_at + make_interval(secs => e.off - case when e.pre then (split_part(r.duration_label,':',1)::int*60+split_part(r.duration_label,':',2)::int) else 0 end)
  from interview_records r cross join (values ('login',-420,true),('prep_open',-260,true),('interview_start',-20,true),('interview_end',0,false),('record_view_new',95,false)) e(ev,off,pre)
 where r.user_id='7e570000-0000-4000-8000-000000000021' and r.created_at in ('2026-10-20 10:40:49+00','2026-10-22 11:15:58+00','2026-10-24 12:05:45+00','2026-10-27 10:20:54+00','2026-10-29 11:30:37+00','2026-11-01 05:10:19+00','2026-11-03 10:50:51+00','2026-11-05 11:40:50+00','2026-11-07 12:10:18+00','2026-11-10 10:30:30+00','2026-11-12 11:20:13+00','2026-11-13 10:45:45+00','2026-11-15 06:30:55+00','2026-11-16 11:10:29+00','2026-11-17 10:25:08+00');
insert into ai_usage (user_id,interview_id,used_on,used_at)
select r.user_id, (extract(epoch from r.created_at)*1000)::bigint::text, (r.created_at at time zone 'Asia/Seoul')::date, r.created_at - interval '5 minutes' from interview_records r where r.user_id='7e570000-0000-4000-8000-000000000021' and r.created_at in ('2026-10-20 10:40:49+00','2026-10-22 11:15:58+00','2026-10-24 12:05:45+00','2026-10-27 10:20:54+00','2026-10-29 11:30:37+00','2026-11-01 05:10:19+00','2026-11-03 10:50:51+00','2026-11-05 11:40:50+00','2026-11-07 12:10:18+00','2026-11-10 10:30:30+00','2026-11-12 11:20:13+00','2026-11-13 10:45:45+00','2026-11-15 06:30:55+00','2026-11-16 11:10:29+00','2026-11-17 10:25:08+00');
insert into answer_retries (id,user_id,record_id,question,prev_answer,prev_score,answer,score,feedback,axes,graded_by,created_at) select gen_random_uuid(),'7e570000-0000-4000-8000-000000000021',(select id from interview_records where user_id='7e570000-0000-4000-8000-000000000021' and created_at='2026-10-29 11:30:37+00'),'한림대학교의료원에 지원한 이유를 말씀해 주세요.','병원에서 일하고 싶어서 지원했습니다. 실습을 해 보니 저와 잘 맞는다고 느꼈습니다.',48,'춘천성심병원 원무팀 실습에서 접수 안내문이 어려워 다시 묻는 환자가 많다는 것을 보았습니다. 안내문 정리 방식을 바꾸자고 제안해 채택됐고, 이 경험을 살려 환자가 한 번에 이해하는 안내를 만드는 원무 담당자가 되고 싶어 지원했습니다.',78,'총점 78.75점 · 양호 (A 4 · B 3 · C 3 · D 3 · E 4)

잘한 점(A 질문 적합성): "안내문 정리 방식을 바꾸자고 제안해 채택됐고" — 지원 이유를 직접 겪은 실습 경험으로 설명한 점이 분명해요.

고칠 점
1. 왜 여러 병원 가운데 이 의료원인지가 빠졌어요. (C 직무·기관 이해) 의료원의 특징 한 가지를 본인 경험과 이어 주세요.

바꿔 말하기: "실습에서 안내문을 고쳐 다시 묻는 환자를 줄인 경험이 있습니다. 지역 환자가 많이 찾는 한림대학교의료원에서 그 경험을 살리고 싶습니다."

다음 꼬리질문: 제안이 채택된 뒤 달라진 점을 어떻게 확인하셨나요?','{"구조": 75, "내용": 81, "분량": 72, "구체성": 78, "태도·언어": 88}'::jsonb,'ai','2026-10-29 11:45:59+00';
insert into activity_log (user_id,event,detail,created_at) values ('7e570000-0000-4000-8000-000000000021','answer_fix',null,'2026-10-29 11:45:59+00');
insert into answer_retries (id,user_id,record_id,question,prev_answer,prev_score,answer,score,feedback,axes,graded_by,created_at) select gen_random_uuid(),'7e570000-0000-4000-8000-000000000021',(select id from interview_records where user_id='7e570000-0000-4000-8000-000000000021' and created_at='2026-11-05 11:40:50+00'),'건강보험심사평가원이 하는 일을 아는 대로 말씀해 주세요.','병원이 청구한 진료비를 심사하는 곳으로 알고 있습니다.',52,'건강보험심사평가원은 병원이 청구한 진료비가 기준에 맞는지 심사하고, 의료의 질을 평가해 결과를 국민에게 공개하는 기관입니다. 홍보단 활동을 하며 병원 평가 정보를 카드뉴스로 만든 경험이 있어, 국민이 이해하기 쉬운 안내가 중요하다는 것을 배웠습니다.',81,'총점 81.25점 · 양호 (A 4 · B 3 · C 3 · D 3 · E 4)

잘한 점(C 직무·기관 이해): "심사하고, 의료의 질을 평가해 결과를 국민에게 공개하는" — 기관의 두 가지 핵심 업무를 정확히 짚었어요.

고칠 점
1. 지원 직무에서 본인이 맡을 일과의 연결이 약해요. (D 논리 구조) 행정직으로서 어떤 업무에 기여할지 한 문장을 덧붙여 주세요.

바꿔 말하기: "진료비 심사와 의료 질 평가를 하는 기관으로 알고 있습니다. 홍보단에서 평가 정보를 쉽게 풀어 쓴 경험을 살려, 국민이 이해하기 쉬운 안내를 만드는 데 기여하겠습니다."

다음 꼬리질문: 평가 정보를 카드뉴스로 만들 때 가장 어려웠던 점은 무엇이었나요?','{"구조": 78, "내용": 84, "분량": 75, "구체성": 80, "태도·언어": 88}'::jsonb,'ai','2026-11-05 11:59:21+00';
insert into activity_log (user_id,event,detail,created_at) values ('7e570000-0000-4000-8000-000000000021','answer_fix',null,'2026-11-05 11:59:21+00');
insert into answer_retries (id,user_id,record_id,question,prev_answer,prev_score,answer,score,feedback,axes,graded_by,created_at) select gen_random_uuid(),'7e570000-0000-4000-8000-000000000021',(select id from interview_records where user_id='7e570000-0000-4000-8000-000000000021' and created_at='2026-11-12 11:20:13+00'),'본인의 단점은 무엇이고, 어떻게 보완하고 있나요?','꼼꼼한 편이라 일이 느릴 때가 있습니다. 더 빨리 하려고 노력하고 있습니다.',55,'확인을 여러 번 하느라 일이 늦어질 때가 있습니다. 실습 때 안내문 수정이 하루 늦어진 뒤로는 확인할 항목을 표로 만들어 한 번에 점검하고, 마감 하루 전에 중간 결과를 먼저 공유하고 있습니다. 그 뒤 팀 과제 세 번은 모두 기한 안에 냈습니다.',83,'총점 83.75점 · 양호 (A 4 · B 4 · C 3 · D 3 · E 4)

잘한 점(B 구체성·정확성): "팀 과제 세 번은 모두 기한 안에 냈습니다" — 보완한 결과를 횟수로 보여 준 점이 좋아요.

고칠 점
1. 단점이 업무에 주는 영향을 한 문장으로 먼저 말하면 더 분명해요. (D 논리 구조)

바꿔 말하기: "확인을 여러 번 하느라 마감이 늦어진 적이 있습니다. 지금은 점검표로 한 번에 확인하고 중간 결과를 먼저 공유해, 최근 과제 세 번을 모두 기한 안에 냈습니다."

다음 꼬리질문: 점검표에는 어떤 항목을 넣으셨나요?','{"구조": 81, "내용": 84, "분량": 78, "구체성": 84, "태도·언어": 88}'::jsonb,'ai','2026-11-12 11:31:16+00';
insert into activity_log (user_id,event,detail,created_at) values ('7e570000-0000-4000-8000-000000000021','answer_fix',null,'2026-11-12 11:31:16+00');
insert into answer_retries (id,user_id,record_id,question,prev_answer,prev_score,answer,score,feedback,axes,graded_by,created_at) select gen_random_uuid(),'7e570000-0000-4000-8000-000000000021',(select id from interview_records where user_id='7e570000-0000-4000-8000-000000000021' and created_at='2026-11-16 11:10:29+00'),'AI 챗봇을 민원 응대에 도입한다면 장점과 주의할 점은 무엇인가요?','편리해질 것 같지만 틀린 답을 할 수도 있다고 생각합니다.',50,'기다리는 시간이 줄고 밤에도 안내를 받을 수 있다는 장점이 있습니다. 다만 틀린 안내가 나갈 수 있고 어르신처럼 챗봇이 어려운 분도 있으니, 복잡한 민원은 담당자에게 바로 연결하고 안내 문구를 쉬운 말로 점검해야 합니다. 병원 안내문을 쉬운 말로 바꿨던 경험을 여기에 살릴 수 있습니다.',80,'총점 80점 · 양호 (A 4 · B 3 · C 3 · D 3 · E 4)

잘한 점(A 질문 적합성): 장점과 주의할 점을 나누어 답하고 보완 방법까지 제시했어요.

고칠 점
1. 틀린 안내가 나갔을 때 누가 어떻게 바로잡는지가 빠졌어요. (B 구체성·정확성)

바꿔 말하기: "대기 시간이 줄고 밤에도 안내가 됩니다. 다만 틀린 안내에 대비해 복잡한 민원은 담당자에게 바로 연결하고, 안내 문구는 쉬운 말로 정기 점검해야 합니다."

다음 꼬리질문: 챗봇 안내가 틀려 민원인이 화가 났다면 어떻게 응대하시겠습니까?','{"구조": 78, "내용": 81, "분량": 78, "구체성": 75, "태도·언어": 88}'::jsonb,'ai','2026-11-16 11:33:47+00';
insert into activity_log (user_id,event,detail,created_at) values ('7e570000-0000-4000-8000-000000000021','answer_fix',null,'2026-11-16 11:33:47+00');
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-10-21','최근에 새로 배운 것 한 가지와 배운 방법을 말씀해 주세요.',52,'2026-10-20 23:16:40+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-10-23','팀에서 의견이 갈렸을 때 어떻게 조율했나요?',55,'2026-10-22 23:13:16+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-10-26','병원 행정 업무에서 가장 중요한 것은 무엇이라고 생각하나요?',54,'2026-10-25 23:45:58+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-10-28','공공기관 직원에게 필요한 자세는 무엇인가요?',58,'2026-10-27 23:28:23+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-10-30','스트레스를 받을 때 어떻게 푸나요?',61,'2026-10-29 23:30:07+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-02','환자나 민원인이 화를 낼 때 어떻게 응대하시겠습니까?',60,'2026-11-01 23:40:30+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-04','본인의 강점이 드러난 경험을 말씀해 주세요.',64,'2026-11-03 23:38:28+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-06','건강보험 제도가 필요한 이유를 설명해 보세요.',63,'2026-11-05 23:19:19+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-09','실수를 했을 때 어떻게 대처했나요?',67,'2026-11-08 23:43:27+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-11','전공이 지원 직무에 어떻게 도움이 되나요?',70,'2026-11-10 23:28:32+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-14','AI 도구를 써서 결과물을 더 좋게 만든 사례가 있나요?',69,'2026-11-13 23:39:00+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-16','5년 뒤 어떤 일을 하고 있을 것 같나요?',72,'2026-11-15 23:46:53+00') on conflict (user_id,day) do nothing;
insert into daily_q (user_id,day,question,score,created_at) values ('7e570000-0000-4000-8000-000000000021','2026-11-17','마지막으로 하고 싶은 말이 있나요?',74,'2026-11-16 23:41:11+00') on conflict (user_id,day) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','한림대학교의료원에 지원한 이유를 말씀해 주세요.',null,'medical','H1-01','한림대학교의료원','record','실습 경험 + 의료원 특징 한 가지로 답하기','2026-10-29 12:50:12+00') on conflict (user_id,question) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','건강보험심사평가원이 하는 일을 아는 대로 말씀해 주세요.',null,'pubcorp','G4-34','건강보험심사평가원','record','심사 + 평가 + 공개, 세 가지로','2026-11-05 12:36:27+00') on conflict (user_id,question) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','본인의 단점은 무엇이고, 어떻게 보완하고 있나요?',null,'medical',null,null,'record','점검표 이야기','2026-11-07 12:46:39+00') on conflict (user_id,question) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','환자나 보호자가 접수 창구에서 화를 낸다면 어떻게 응대하시겠습니까?',null,'medical','H1-01','한림대학교의료원','record',null,'2026-11-12 12:39:47+00') on conflict (user_id,question) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','AI 챗봇을 민원 응대에 도입한다면 장점과 주의할 점은 무엇인가요?',null,'pubcorp','G4-34','건강보험심사평가원','record','쉬운 말 안내 경험과 연결','2026-11-13 12:27:11+00') on conflict (user_id,question) do nothing;
insert into question_bookmarks (id,user_id,question,ref,field_id,company_id,company_name,source,note,created_at) values (gen_random_uuid(),'7e570000-0000-4000-8000-000000000021','공공기관이 AI를 쓸 때 민간 기업보다 더 신경 써야 할 점은 무엇이라고 생각하시나요?',null,'pubcorp',null,null,'record',null,'2026-11-17 12:29:24+00') on conflict (user_id,question) do nothing;
insert into interview_plans (user_id,target_date,company_id,company_name,field_id,job,format,checklist,updated_at) values ('7e570000-0000-4000-8000-000000000021','2026-12-04','G4-34','건강보험심사평가원','pubcorp','행정직','대면','{"talent": true}'::jsonb,'2026-11-10 10:10:45+00') on conflict (user_id) do update set target_date=excluded.target_date, company_id=excluded.company_id, company_name=excluded.company_name, field_id=excluded.field_id, job=excluded.job, format=excluded.format, checklist=excluded.checklist, updated_at=excluded.updated_at;
update prep_state set experiences='[{"id": "e1", "text": "춘천 지역 병원 환자 안내문을 쉬운 말로 바꾼 캡스톤 프로젝트 (안내문 12종, 환자 이해도 61%→84%)", "type": "프로젝트"}, {"id": "e2", "text": "한림대학교춘천성심병원 원무팀 현장실습 4주 — 안내문 정리 방식 개선 제안이 채택됨", "type": "활동"}, {"id": "e3", "text": "건강보험심사평가원 대학생 국민참여 홍보단 6개월 — 콘텐츠 14건 제작, 우수 활동팀", "type": "활동"}]'::jsonb, profile='{"dept": "국어국문학과", "grade": "4"}'::jsonb, updated_at=now() where user_id='7e570000-0000-4000-8000-000000000021';
update user_resumes set resume_text='자기소개서
1. 지원 동기
병원 외래 안내 봉사를 하면서, 안내문이 어려워 같은 것을 다시 묻는 환자가 많다는 것을 알았습니다. 글을 쉽게 쓰는 전공을 환자와 국민을 위한 안내에 쓰고 싶어 보건의료 행정 분야에 지원했습니다.
2. 직무 역량과 경험
캡스톤 프로젝트에서 춘천 지역 병원의 환자 안내문 12종을 쉬운 말로 고쳤습니다. 저는 자료 조사와 문안 작성을 맡았고, 환자 설문에서 이해도가 61%에서 84%로 올랐습니다.
3. 협업 경험
춘천성심병원 원무팀 실습에서 안내문이 창구마다 달라 혼란이 있다는 것을 보고, 정리 방식을 하나로 맞추자고 제안해 채택됐습니다. 선임 선생님들의 의견을 먼저 듣고 초안을 세 번 고쳤습니다.
4. 입사 후 포부
입사 후 첫 1년은 원무와 민원 업무의 기본을 정확히 익히고, 맡은 안내문과 문서를 누구나 한 번에 이해할 수 있게 다듬어 팀이 믿고 맡길 수 있는 사람이 되겠습니다.', cv_text='이력서
2024.03 ~ 2025.02 국어국문학과 학생회 기획부원
2024.03 ~ 2025.02 춘천 지역 병원 외래 안내 봉사 (30시간)
2025.01 한림 보건의료 행정 실무 과정 수료 (40시간)
2025.04 ~ 2025.09 건강보험심사평가원 대학생 국민참여 홍보단 7기
2025.07 한림대학교춘천성심병원 원무팀 현장실습 (4주)
2025.08 병원행정사 취득 · 컴퓨터활용능력 2급', updated_at='2026-10-19 11:05:25+00', cv_updated_at='2026-10-19 11:08:59+00' where user_id='7e570000-0000-4000-8000-000000000021';
update answer_notes set answer='국어국문학과 4학년 문서영입니다. 병원 환자 안내문 12종을 쉬운 말로 고쳐 이해도를 61%에서 84%로 올린 경험이 있습니다. 글을 쉽게 쓰는 강점을 환자와 국민을 위한 안내에 쓰고 싶습니다.', score=78, updated_at='2026-11-16 11:40:56+00' where user_id='7e570000-0000-4000-8000-000000000021' and cat='intro';
update career_inbody set target_field='medical', target_role='병원 행정(원무·홍보) · 공공기관 행정직', updated_at='2026-10-19 11:12:33+00' where user_id='7e570000-0000-4000-8000-000000000021';
update staff_notes set body='병원 행정·건강보험심사평가원 행정직 희망. 어학 점수가 없어 TOEIC 준비 계획을 같이 세움 (12월 시험 목표).' where student_id='7e570000-0000-4000-8000-000000000021' and id=10;
insert into staff_notes (student_id,author_id,body,created_at) values ('7e570000-0000-4000-8000-000000000021','7e570000-0000-4000-8000-000000000092','한 달 동안 모의면접 15회. 총점이 40점대 후반에서 70점대 초반으로 오름. 기관 이해(C 항목)가 가장 약해 심평원 사업 내용을 정리해 오기로 함. 12/4 심평원 면접 예정.','2026-11-17 07:30:26+00');
