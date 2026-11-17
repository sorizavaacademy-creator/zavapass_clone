// 2026-11-17 클론(ZAVAPASS-clone) 전용: 인바디(역량 진단) 리포트 읽기
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

const SYSTEM = `너는 대학 취업지원센터의 면접 준비 도우미다. 학생이 받은 [리포트](커리어 인바디·역량 진단·학업 이력 요약 같은 문서에서 뽑은 글)를 읽고 세 가지를 만든다.
리포트 양식은 학교마다 다르다. 표가 글자로 풀려 줄이 섞여 있을 수 있으니 항목 이름과 값을 짝지어 읽는다.
리포트에는 보통 여섯 가지가 들어 있다: ①수강 과목·성적·전공 이수 흐름 ②프로젝트·비교과 활동·포트폴리오 ③상담 이력 ④성향 검사 결과(STRONG 등) ⑤자격·수상·어학 ⑥역량 데이터(학교 역량 체계, 예: 한림대 하이파이브). 있는 것은 빠짐없이 읽는다.

1) fields: 아래 칸에 해당하는 값이 리포트에 분명히 적혀 있을 때만 채운다. 없으면 null (지어내지 않는다).
   grade: "1"|"2"|"3"|"4"|"졸업" / gpa: 전체 평점(숫자) / gpa_max: 4.5|4.3|4.0 (만점, 안 적혀 있으면 4.5) / major_gpa: 전공 평점
   toeic: 10~990 정수 / toeic_speaking: "Lv1"~"Lv8" (Lv 표기일 때만) / opic: NL|NM|NH|IL|IM1|IM2|IM3|IH|AL
   other_lang: 그 밖의 어학(예: "JLPT N2", "토익스피킹 IH"), 60자 이내 / certs: 자격증 이름 배열(최대 15)
   intern_months: 인턴·현장실습 개월 수 합 / projects: 프로젝트 수 / activities: 대외활동·동아리·비교과 프로그램 수 / awards: 수상 횟수 / volunteer_hours: 봉사 시간
   target_role: 희망 직무(40자 이내)
2) items: 리포트에 적힌 항목을 "분류(group) · 항목 이름(label) · 값(value)"으로 옮긴다. 최대 30개.
   group은 이 가운데 하나: "수강·성적", "프로젝트·비교과·포트폴리오", "상담 이력", "성향 검사", "자격·수상·어학", "역량", "진로·기타".
   - 수강·성적: 과목을 전부 옮기지 않는다. 이수 학점·전공 이수 현황, 학기별 평점 흐름, 성적이 높은 과목 2~3개, 낮은 과목 1~2개를 과목 이름과 성적 그대로 넣는다.
   - 역량: 역량 이름과 점수를 리포트에 적힌 그대로(이름을 바꾸거나 합치지 않는다). 평균·수준이 함께 적혀 있으면 같이 넣는다.
   - 성향 검사: 검사 이름과 결과 유형·코드, 높게 나온 영역을 넣는다.
   - 상담 이력: 횟수와 주제(진로·취업·학업)만 넣는다. 심리·가정·건강·경제 사정 같은 개인 사정 상담 내용은 넣지 않는다.
   값은 리포트에 적힌 그대로(단위·평균 포함) 50자 이내.
3) questions: 면접관이 이 리포트를 보고 물을 만한 질문 6개. 각 질문은 리포트의 특정 항목 하나를 근거로 한다.
   분류가 겹치지 않게 고른다(수강·성적, 프로젝트·포트폴리오, 역량, 성향 검사, 자격·어학, 상담·진로 가운데 리포트에 있는 것).
   q: 존댓말 한 문장(80자 이내, 물음표로 끝). 항목 값을 문장에 자연스럽게 넣는다. 강점 항목 4개, 낮거나 비어 있는 항목 2개 정도로 섞는다.
      성향 검사는 사람을 유형으로 단정하지 않고 "검사에서 ○○ 유형이 높게 나왔는데, 실제 경험에서 그 모습이 드러난 사례"처럼 묻는다.
   basis: 근거가 된 항목과 값(예: "의사소통 역량 58점 · 학과 평균 71점"), 40자 이내. items나 fields에 있는 것만. 분류 이름은 붙이지 않는다.
   why: 이 질문으로 무엇을 확인하려는지 한 문장(60자 이내).
4) summary: 리포트에서 눈에 띄는 점 한 문장(강점 하나와 보완점 하나).
5) is_report: 글이 이런 리포트로 보이면 true, 전혀 다른 문서(자기소개서·영수증 등)면 false.

지킬 것:
- [학번], [이름], [번호] 같은 가린 표시는 그대로 두고 값으로 쓰지 않는다. 이름·학번·주소·연락처·주민번호·가족·건강·종교·출신지역·병역·성별·나이는 items와 questions 어디에도 넣지 않는다.
- 리포트에 없는 사실을 지어내지 않는다. 숫자는 적힌 그대로 쓴다.
- 질문은 학생을 깎아내리지 않는다. 낮은 항목은 "어떻게 보완하고 있는지"를 묻는다.
JSON으로만 답한다:
{"is_report":true,"fields":{"grade":null,"gpa":null,"gpa_max":null,"major_gpa":null,"toeic":null,"toeic_speaking":null,"opic":null,"other_lang":null,"certs":[],"intern_months":null,"projects":null,"activities":null,"awards":null,"volunteer_hours":null,"target_role":null},"items":[{"group":"","label":"","value":""}],"questions":[{"q":"","basis":"","why":""}],"summary":""}`;

/** 고친 항목으로 질문만 다시 만들 때 쓰는 지시문 (위 SYSTEM의 3)·4)·지킬 것과 같은 기준) */
const SYSTEM_Q = `너는 대학 취업지원센터의 면접 준비 도우미다. 학생의 역량 진단 리포트에서 읽은 [리포트 항목](분류 · 항목 이름: 값)을 보고 면접 질문을 만든다. 값은 학생이 직접 확인해 고친 것이므로 적힌 그대로 믿는다.
1) questions: 면접관이 이 항목을 보고 물을 만한 질문 6개. 각 질문은 항목 하나를 근거로 한다.
   분류가 겹치지 않게 고른다(수강·성적, 프로젝트·포트폴리오, 역량, 성향 검사, 자격·어학, 상담·진로 가운데 있는 것).
   q: 존댓말 한 문장(80자 이내, 물음표로 끝). 항목 값을 문장에 자연스럽게 넣는다. 강점 항목 4개, 낮거나 비어 있는 항목 2개 정도로 섞는다.
      성향 검사는 사람을 유형으로 단정하지 않고 "검사에서 ○○ 유형이 높게 나왔는데, 실제 경험에서 그 모습이 드러난 사례"처럼 묻는다.
   basis: 근거가 된 항목과 값(예: "의사소통 역량 58점 · 학과 평균 71점"), 40자 이내. 주어진 항목에 있는 것만. 분류 이름은 붙이지 않는다.
   why: 이 질문으로 무엇을 확인하려는지 한 문장(60자 이내).
2) summary: 항목에서 눈에 띄는 점 한 문장(강점 하나와 보완점 하나).
지킬 것:
- [학번], [이름], [번호] 같은 가린 표시는 값으로 쓰지 않는다. 이름·학번·주소·연락처·가족·건강·종교·출신지역·병역·성별·나이는 묻지 않는다.
- 항목에 없는 사실을 지어내지 않는다. 숫자는 적힌 그대로 쓴다.
- 질문은 학생을 깎아내리지 않는다. 낮은 항목은 "어떻게 보완하고 있는지"를 묻는다.
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
    const { data, model } = await askJson(SYSTEM, `${hint ? `[학생이 고른 정보] ${hint}\n\n` : ""}[리포트]\n${masked.text}`, { maxTokens: 4000, timeoutMs: 55000, temperature: 0.2, reasoning: Deno.env.get("INBODY_REASONING") || "low", log: { fn: "inbody-read", step: "리포트 읽기", userId: user.id }, guard: true });
    const f = (data.fields ?? {}) as Record<string, unknown>;
    const gmaxRaw = num(f.gpa_max, 4, 4.5); const gpa_max = gmaxRaw === 4 || gmaxRaw === 4.3 || gmaxRaw === 4.5 ? gmaxRaw : 4.5;
    const ts = /^Lv[1-8]$/.test(String(f.toeic_speaking ?? "")) ? String(f.toeic_speaking) : null;
    const opic = OPIC.includes(String(f.opic ?? "").toUpperCase()) ? String(f.opic).toUpperCase() : null;
    const grade = ["1", "2", "3", "4", "졸업"].includes(String(f.grade ?? "")) ? String(f.grade) : null;
    const fields = {
      grade, gpa: num(f.gpa, 0, gpa_max), gpa_max, major_gpa: num(f.major_gpa, 0, gpa_max), toeic: num(f.toeic, 10, 990, true), toeic_speaking: ts, opic,
      other_lang: cleanText(f.other_lang, 60) || null,
      certs: (Array.isArray(f.certs) ? f.certs : []).map((c) => cleanText(typeof c === "string" ? c : (c as any)?.name, 40)).filter((c) => c && !PII.test(c)).slice(0, 15),
      intern_months: num(f.intern_months, 0, 60, true), projects: num(f.projects, 0, 50, true), activities: num(f.activities, 0, 50, true), awards: num(f.awards, 0, 50, true), volunteer_hours: num(f.volunteer_hours, 0, 5000, true),
      target_role: cleanText(f.target_role, 40) || null,
    };
    const items = (Array.isArray(data.items) ? data.items : []).map((x: any) => ({ group: cleanText(x?.group, 20), label: cleanText(x?.label, 40), value: cleanText(x?.value, 60) }))
      .filter((x) => x.label && x.value && !PII.test(x.label) && !PII.test(x.value) && !blockReason(x.label + " " + x.value)).slice(0, 30);
    const questions = (Array.isArray(data.questions) ? data.questions : []).map((x: any) => ({ q: cleanText(x?.q, 140), basis: cleanText(x?.basis, 60), why: cleanText(x?.why, 100) }))
      .filter((x) => x.q.length >= 12 && x.basis && !blockReason(x.q) && !PII.test(x.q) && !PII.test(x.basis)).slice(0, 6);
    return json({ is_report: data.is_report !== false, fields, items, questions, summary: blockReason(String(data.summary ?? "")) ? "" : cleanText(data.summary, 160), masked: masked.n, model, ms: Date.now() - t0 });
  } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
});
