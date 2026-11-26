// 2026-11-17 클론(ZAVAPASS-clone) 전용: 인바디(역량 진단) 리포트 읽기 · 2026-11-24 한림대 커리어 인바디(포트폴리오) 양식 칸으로 읽음
//  학생이 올린 리포트 PDF에서 화면이 뽑은 글자(학번·이름은 화면에서 먼저 가림)를 받아
//  ① 인바디 칸에 넣을 값(fields) ② 리포트에 적힌 그 밖의 항목(items) ③ 그 항목을 근거로 한 면접 질문(questions)을 돌려줌
//  양식이 정해져 있지 않아도 읽도록 AI가 항목을 찾음. 적혀 있지 않은 값은 비워 둠(지어내지 않음).
//  외부 AI로 보내기 전에 여기서도 한 번 더 가림(학번·전화·이메일·주민번호·'성명: ○○○' 꼴).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { askJson, cleanText, corsHeaders, json, NOT_APPROVED_MSG, requireApproved, requireUser, SUPABASE_ANON_KEY, SUPABASE_URL } from "../_shared/ai_common.ts";
/** 묻지 않는 주제(가족·건강·종교·출신·병역 등)가 섞인 항목·질문은 뺌 (다른 함수들이 쓰는 qbank.ts 규칙의 줄인 판) */
const BLOCK = /(결혼|출산|연애|애인|부모님|아버지|어머니|가족\s?(관계|구성|사항)|집안|재산|몸무게|체중|외모|종교|정당|정치\s?성향|고향|거주지|출신\s?지역|몇\s?살|나이가|건강\s?상태|질병|지병|병력|장애|정신과|주량|음주|흡연|담배|군대|병역|군\s?복무|군필|미필|(여자|여성|남자|남성)(인데|라서|이라서))/;
function blockReason(text: string): boolean { return BLOCK.test(String(text || "")); }

async function checkUsageLimit(req: Request, key: string): Promise<{ ok: boolean; status?: Record<string, unknown> }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ai_usage_try`, {
      method: "POST", headers: { Authorization: req.headers.get("Authorization") ?? "", apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_interview_id: key }),
    });
    if (!r.ok) return { ok: true };
    const st = await r.json();
    return st && st.allowed === false ? { ok: false, status: st } : { ok: true, status: st };
  } catch { return { ok: true }; }
}

/** 외부 AI로 보내기 전 한 번 더 가리기. 가린 곳 수도 함께 돌려줌 */
export function maskIds(text: string): { text: string; n: number } {
  let n = 0; const hit = (r: string) => () => { n++; return r; };
  let t = String(text || "");
  t = t.replace(/\b\d{6}\s?-\s?[1-4]\d{6}\b/g, hit("[주민번호]"));
  t = t.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, hit("[이메일]"));
  t = t.replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, hit("[전화]"));
  // '성명 홍길동', '이름: 홍 길동' 꼴 (자격증 이름·항목 이름처럼 다른 것의 이름은 건드리지 않음: 2~4글자 뒤에 한글이 이어지면 사람 이름이 아님)
  const names: string[] = [];   // '성명 홍길동'에서 찾은 이름은 글 안의 다른 곳에서도 가림
  t = t.replace(/((?:성\s*명|학생\s*명|성함|(?<![가-힣] ?)이\s*름|Name)\s*[:：]?\s*)([가-힣](?: ?[가-힣]){1,3}(?![가-힣])|[A-Za-z]+(?: [A-Za-z]+)?)/gi, (_m, a, v) => { n++; const k = String(v).replace(/\s/g, ""); if (/^[가-힣]{2,4}$/.test(k) && !names.includes(k)) names.push(k); return a + "[이름]"; });
  for (const k of names) t = t.replace(new RegExp(k.split("").join("\\s?"), "g"), hit("[이름]"));
  t = t.replace(/((?:학\s*번|학생\s*번호|수험\s*번호|Student\s*(?:ID|No\.?))\s*[:：]?\s*)([A-Za-z]?\d[\d-]{4,14})/gi, (_m, a) => { n++; return a + "[학번]"; });
  t = t.replace(/(?<![\d.])\d{8,10}(?![\d.])/g, hit("[번호]"));   // 남은 8~10자리 숫자(학번 꼴)
  return { text: t, n };
}

// 2026-11-24 한림대 커리어 인바디(포트폴리오) 양식으로 바꿈: 머리(전공·학년·희망 직무) · 강점/보완 · 역량 VS 직무 요구 · 보유 스킬 Top 15 · 이수 과목(직무과목 이수율, H/M/L)
//   · 경험 & 활동(비교과 프로그램 / 자기주도 활동) · AI 추천 자기소개서 · 강점/약점/개선 방향 · 추천 자격증 · 관련 채용공고
const QRULE = `   q: 면접관이 실제로 묻는 말투의 존댓말 한 문장(80자 이내, 물음표로 끝).
      · 리포트의 점수·차이(예: 75점, -10, 2/20)와 "리포트에서", "포트폴리오에 따르면" 같은 말은 질문 문장에 넣지 않는다. 숫자는 basis에만 쓴다.
      · 활동·과목·자격 이름처럼 구체적인 이름은 질문에 그대로 써도 된다.
      · 학생이 실제로 한 것(이수 과목·경험 & 활동·보유 스킬·강점 역량)만 질문의 근거로 쓴다. '개선 방향'·'추천 자격증'·'관련 채용공고'·AI 추천 자기소개서는 학교가 권하는 내용이라 학생이 아직 하지 않았을 수 있으므로 질문의 근거로 쓰지 않는다. (예: 개선 방향 "C/C++ 사이드 프로젝트"를 "C/C++ 프로젝트를 한다면 어떻게 설계하겠습니까?"로 묻는 것은 실패)
      · 해 본 적 없는 일을 "~한다면 어떻게 하겠습니까?"처럼 가정해 묻지 않는다. 학생이 이미 한 일에서 본인 역할·방법·결과·배운 점을 묻는다.
      · 이수 과목 질문은 그 수업에서 직접 한 과제·실습·프로젝트를 묻는다(예: "기계학습 수업에서 직접 해 본 과제 하나와 그때 맡은 부분은 무엇이었습니까?"처럼). 희망 직무와의 연결은 그 경험을 바탕으로 한 걸음만 묻는다.
      · 학생을 깎아내리지 않는다. 낮은 역량은 "지금까지 비슷하게 해 본 경험"이나 "지금 어떻게 보완하고 있는지"를 묻는다.
   basis: 근거가 된 항목과 값, 40자 이내(예: "협업 능력 0 · 직무 요구보다 70 낮음", "직무과목 이수율 2/20", "비교과 · 빅데이터 경진대회"). 분류 이름은 붙이지 않는다.
   why: 이 질문으로 무엇을 확인하려는지 한 문장(60자 이내).
   6개를 서로 다른 근거로 고른다: 경험 & 활동 2개, 이수 과목 1개, 강점 역량이나 보유 스킬 2개, 직무 요구보다 가장 많이 모자란 역량 1개(지금까지의 비슷한 경험이나 보완 방법을 묻기). 리포트에 없는 칸은 이 네 가지 안의 다른 칸으로 채운다(개선 방향·추천 칸으로 채우지 않는다).`;
const SYSTEM = `너는 대학 취업지원센터의 면접 준비 도우미다. 학생이 받은 [리포트](한림대학교 커리어 인바디 · 포트폴리오 PDF에서 뽑은 글)를 읽고 칸별로 옮긴 뒤 면접 질문을 만든다.
표·그래프가 글자로 풀려 줄 순서가 섞여 있을 수 있으니 이름과 값을 짝지어 읽는다. 적혀 있지 않은 칸은 비워 둔다(지어내지 않는다). 숫자·이름은 적힌 그대로 쓴다.
칸:
- profile: major(전공 · 맨 마지막 단계, 예: "데이터테크"), college_path(예: "정보과학대학 > 데이터사이언스학부 > 데이터테크"), grade(학년 숫자 "1"~"4" 또는 "졸업"), target_job(오른쪽 위 희망 직무)
- strong: '강점' 태그들 / weak: '보완' 태그들 (적힌 그대로)
- comp: '역량 수치 · 역량 VS 직무 요구'의 줄마다 {name, score(내 점수, 정수), gap(직무 요구 대비 차이, +/- 정수)}. 최대 8개. 같은 역량을 두 번 넣지 않는다(아래 강점 글의 소수점 점수는 쓰지 않는다).
- skills: '보유 스킬 Top 15'의 스킬 이름들(최대 15, 적힌 순서)
- course_rate: '직무과목 이수율' 값(예: "2/20") / courses: 이수 과목마다 {name, h, m, l}(H·M·L 숫자). 최대 20개
- extra: '비교과 프로그램' 줄마다 {name, period} / selfd: '자기주도 활동' 줄마다 {name, period}. period는 날짜·학기 그대로
- intro: 'AI 추천 자기소개서'의 {keywords(태그들), title(제목 한 줄), text(본문, 문단 사이는 \\n, 1200자 이내)}
- good / bad / fix: 아래쪽 '강점' · '약점' · '개선 방향' 칸의 문장들(각 최대 6개, 한 문장 200자 이내, 적힌 그대로)
- certs_reco: '추천 자격증'(없으면 빈 배열. "자격증 데이터 없음"은 넣지 않는다)
- jobs: '관련 채용공고' 줄마다 {company, title, date}
- questions: 면접관이 이 리포트를 보고 물을 만한 질문 6개.
${QRULE}
- summary: 강점 하나와 보완점 하나를 담은 한 문장.
- is_report: 이런 커리어 인바디·역량 리포트로 보이면 true, 전혀 다른 문서(자기소개서·영수증 등)면 false.
지킬 것: [학번], [이름], [번호] 같은 가린 표시는 값으로 쓰지 않는다. 이름·학번·주소·연락처·가족·건강·종교·출신지역·병역·성별·나이는 어디에도 넣지 않는다.
JSON으로만 답한다:
{"is_report":true,"profile":{"major":"","college_path":"","grade":"","target_job":""},"strong":[],"weak":[],"comp":[{"name":"","score":0,"gap":0}],"skills":[],"course_rate":"","courses":[{"name":"","h":0,"m":0,"l":0}],"extra":[{"name":"","period":""}],"selfd":[{"name":"","period":""}],"intro":{"keywords":[],"title":"","text":""},"good":[],"bad":[],"fix":[],"certs_reco":[],"jobs":[{"company":"","title":"","date":""}],"questions":[{"q":"","basis":"","why":""}],"summary":""}`;

/** 고친 항목으로 질문만 다시 만들 때 쓰는 지시문 (위와 같은 질문 기준) */
const SYSTEM_Q = `너는 대학 취업지원센터의 면접 준비 도우미다. 학생의 커리어 인바디(포트폴리오)에서 읽은 [리포트 항목](분류 · 항목 이름: 값)을 보고 면접 질문을 만든다. 값은 학생이 직접 확인해 고친 것이므로 적힌 그대로 믿는다.
- questions: 면접관이 이 항목을 보고 물을 만한 질문 6개.
${QRULE}
- summary: 강점 하나와 보완점 하나를 담은 한 문장.
지킬 것: 가린 표시는 값으로 쓰지 않는다. 이름·학번·주소·연락처·가족·건강·종교·출신지역·병역·성별·나이는 묻지 않는다. 항목에 없는 사실을 지어내지 않는다.
JSON으로만 답한다: {"questions":[{"q":"","basis":"","why":""}],"summary":""}`;

const OPIC = ["NL", "NM", "NH", "IL", "IM1", "IM2", "IM3", "IH", "AL"];
const num = (v: unknown, min: number, max: number, int = false): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.]/g, ""));
  if (!isFinite(x) || x < min || x > max) return null;
  return int ? Math.round(x) : Math.round(x * 100) / 100;
};
const PII = /(\[이름\]|\[학번\]|\[번호\]|\[전화\]|\[이메일\]|\[주민번호\]|성\s*명|학\s*번|주민|연락처|전화|이메일|주소|생년월일|보호자)/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "로그인이 필요해요" }, 401);
  const ap = await requireApproved(user.id);
  if (!ap.ok) return json({ error: "not_approved", reason: ap.reason, message: NOT_APPROVED_MSG[ap.reason ?? "pending"] ?? NOT_APPROVED_MSG.pending }, 403);
  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { return json({ error: "요청 본문이 JSON이 아니에요" }, 400); }
  // 2026-11-17 읽은 값을 학생이 고친 뒤(또는 그대로) 그 항목으로 질문만 다시 만듦: { items:[{group,label,value}], dept?, target? } → { items, questions, summary }
  if (Array.isArray(p.items)) {
    const its = (p.items as any[]).map((x) => ({ group: cleanText(x?.group, 20), label: cleanText(x?.label, 40), value: cleanText(x?.value, 60) }))
      .filter((x) => x.label && x.value && !PII.test(x.label) && !PII.test(x.value) && !blockReason(x.label + " " + x.value)).slice(0, 30);
    if (!its.length) return json({ error: "no_items", message: "질문을 만들 항목이 없어요." }, 400);
    const day0 = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const lim0 = await checkUsageLimit(req, `inbody-${day0}`);
    if (!lim0.ok) return json({ error: "limit", limit: lim0.status }, 429);
    const hint0 = [cleanText(p.dept, 40) ? `학과: ${cleanText(p.dept, 40)}` : "", cleanText(p.target, 60) ? `준비하는 분야·직무: ${cleanText(p.target, 60)}` : ""].filter(Boolean).join(" / ");
    const list = its.map((x) => `- [${x.group || "기타"}] ${maskIds(x.label).text}: ${maskIds(x.value).text}`).join("\n");
    const t1 = Date.now();
    try {
      const { data, model } = await askJson(SYSTEM_Q, `${hint0 ? `[학생이 고른 정보] ${hint0}\n\n` : ""}[리포트 항목]\n${list}`, { maxTokens: 1800, timeoutMs: 40000, temperature: 0.3, reasoning: Deno.env.get("INBODY_REASONING") || "low", log: { fn: "inbody-read", step: "리포트 질문 다시 만들기", userId: user.id }, guard: true });
      const questions = (Array.isArray(data.questions) ? data.questions : []).map((x: any) => ({ q: cleanText(x?.q, 140), basis: cleanText(x?.basis, 60), why: cleanText(x?.why, 100) }))
        .filter((x) => x.q.length >= 12 && x.basis && !blockReason(x.q) && !PII.test(x.q) && !PII.test(x.basis)).slice(0, 6);
      if (!questions.length) return json({ error: "no_questions", message: "질문을 만들지 못했어요. 다시 눌러 주세요." }, 502);
      return json({ mode: "items", items: its, questions, summary: blockReason(String(data.summary ?? "")) ? "" : cleanText(data.summary, 160), model, ms: Date.now() - t1 });
    } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
  }
  const raw = typeof p.text === "string" ? p.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim().slice(0, 24000) : "";
  if (raw.replace(/\s/g, "").length < 60) return json({ error: "too_short", message: "리포트에서 읽은 글자가 너무 적어요. 글자가 또렷한 PDF로 다시 올려 주세요." }, 400);
  const masked = maskIds(raw);
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const lim = await checkUsageLimit(req, `inbody-${day}`);
  if (!lim.ok) return json({ error: "limit", limit: lim.status }, 429);
  const hint = [cleanText(p.dept, 40) ? `학과: ${cleanText(p.dept, 40)}` : "", cleanText(p.target, 60) ? `준비하는 분야·직무: ${cleanText(p.target, 60)}` : ""].filter(Boolean).join(" / ");
  const t0 = Date.now();
  try {
    const { data, model } = await askJson(SYSTEM, `${hint ? `[학생이 고른 정보] ${hint}\n\n` : ""}[리포트]\n${masked.text}`, { maxTokens: 6500, timeoutMs: 80000, temperature: 0.2, reasoning: Deno.env.get("INBODY_REASONING") || "low", log: { fn: "inbody-read", step: "리포트 읽기", userId: user.id }, guard: true });
    const T = (v: unknown, n: number) => { const t = cleanText(v, n); return t && !PII.test(t) && !blockReason(t) ? t : ""; };
    const L = (v: unknown, max: number, n: number) => (Array.isArray(v) ? v : []).map((x) => T(x, n)).filter(Boolean).slice(0, max);
    const pf = (data.profile ?? {}) as Record<string, unknown>;
    const gradeRaw = String(pf.grade ?? "").replace(/[^\d졸업]/g, "");
    const grade = ["1", "2", "3", "4", "졸업"].includes(gradeRaw) ? gradeRaw : null;
    const comp = (Array.isArray(data.comp) ? data.comp : []).map((x: any) => { const sc = num(x?.score, 0, 100, true); const g = typeof x?.gap === "number" ? Math.round(x.gap) : parseInt(String(x?.gap ?? "").replace(/[^\d+-]/g, ""), 10); return { name: T(x?.name, 30), score: sc, gap: isFinite(g) && Math.abs(g) <= 100 ? g : null }; })
      .filter((x: any) => x.name && x.score != null).filter((x: any, i: number, a: any[]) => a.findIndex((y) => y.name === x.name) === i).slice(0, 8);
    const pairs = (v: unknown, max: number) => (Array.isArray(v) ? v : []).map((x: any) => ({ name: T(x?.name, 80), period: T(x?.period, 40) })).filter((x) => x.name).slice(0, max);
    const courses = (Array.isArray(data.courses) ? data.courses : []).map((x: any) => ({ name: T(x?.name, 40), h: num(x?.h, 0, 99, true) ?? 0, m: num(x?.m, 0, 99, true) ?? 0, l: num(x?.l, 0, 99, true) ?? 0 })).filter((x) => x.name).slice(0, 20);
    const intro = (data.intro ?? {}) as Record<string, unknown>;
    const hallym = {
      profile: { major: T(pf.major, 40), college_path: T(pf.college_path, 80), grade, target_job: T(pf.target_job, 40) },
      strong: L(data.strong, 8, 30), weak: L(data.weak, 8, 30), comp, skills: L(data.skills, 15, 30),
      course_rate: /^\s*\d{1,3}\s*\/\s*\d{1,3}\s*$/.test(String(data.course_rate ?? "")) ? String(data.course_rate).replace(/\s/g, "") : "",
      courses, extra: pairs(data.extra, 10), selfd: pairs(data.selfd, 10),
      intro: { keywords: L(intro.keywords, 12, 24), title: T(intro.title, 60), text: blockReason(String(intro.text ?? "")) ? "" : String(intro.text ?? "").replace(/\\n/g, "\n").split(/\n+/).map((x) => cleanText(x, 700)).filter(Boolean).join("\n").slice(0, 1400) },   // 문단은 줄바꿈으로 남김
      good: L(data.good, 6, 220), bad: L(data.bad, 6, 220), fix: L(data.fix, 6, 220),
      certs_reco: L(data.certs_reco, 8, 40).filter((c) => !/데이터\s*없음/.test(c)),
      jobs: (Array.isArray(data.jobs) ? data.jobs : []).map((x: any) => ({ company: T(x?.company, 40), title: T(x?.title, 80), date: T(x?.date, 20) })).filter((x) => x.company || x.title).slice(0, 6),
    };
    // 읽은 값 고치기·질문 다시 만들기에 쓰는 항목 (위 칸에서 만듦)
    const items: { group: string; label: string; value: string }[] = [];
    const add = (group: string, label: string, value: string) => { if (label && value && items.length < 30) items.push({ group, label: label.slice(0, 40), value: value.slice(0, 60) }); };
    if (hallym.profile.target_job) add("진로", "희망 직무", hallym.profile.target_job);
    comp.forEach((c: any) => add("역량", c.name, `${c.score}${c.gap != null ? ` · 직무 요구 대비 ${c.gap > 0 ? "+" : ""}${c.gap}` : ""}`));
    if (hallym.strong.length) add("진로", "강점", hallym.strong.join(", "));
    if (hallym.weak.length) add("진로", "보완", hallym.weak.join(", "));
    if (hallym.skills.length) add("스킬", "보유 스킬", hallym.skills.slice(0, 8).join(", "));
    if (hallym.course_rate) add("이수 과목", "직무과목 이수율", hallym.course_rate);
    courses.slice(0, 4).forEach((c) => add("이수 과목", c.name, `H${c.h} · M${c.m} · L${c.l}`));
    hallym.extra.forEach((x) => add("경험·활동", "비교과 · " + x.name, x.period || "참여"));
    hallym.selfd.forEach((x) => add("경험·활동", "자기주도 · " + x.name, x.period || "완료"));
    const certs = hallym.selfd.map((x) => x.name).filter((n) => /(취득|합격)/.test(n)).map((n) => n.replace(/\s*(취득|합격).*$/, "").trim()).filter(Boolean).slice(0, 15);
    const fields = { grade, gpa: null, gpa_max: 4.5, major_gpa: null, toeic: null, toeic_speaking: null, opic: null, other_lang: null, certs, intern_months: null, projects: null,
      activities: (hallym.extra.length + hallym.selfd.length) || null, awards: null, volunteer_hours: null, target_role: hallym.profile.target_job || null };
    const questions = (Array.isArray(data.questions) ? data.questions : []).map((x: any) => ({ q: cleanText(x?.q, 140), basis: cleanText(x?.basis, 60), why: cleanText(x?.why, 100) }))
      .filter((x) => x.q.length >= 12 && x.basis && !blockReason(x.q) && !PII.test(x.q) && !PII.test(x.basis)).slice(0, 6);
    const has = comp.length + hallym.skills.length + courses.length + hallym.extra.length + hallym.selfd.length + hallym.good.length;
    return json({ is_report: data.is_report !== false, format: "hallym", hallym: has ? hallym : null, fields, items, questions, summary: blockReason(String(data.summary ?? "")) ? "" : cleanText(data.summary, 160), masked: masked.n, model, ms: Date.now() - t0 });
  } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
});
