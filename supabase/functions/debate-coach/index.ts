// 2026-11-09 클론(ZAVAPASS-clone) 전용: 토론·PT 면접 연습 AI
//  kind 'debate'(찬반 토론) · 'pt'(발표) · 'group'(토의: AI가 다른 지원자 3명 역할, 함께 해결책 정하기) — 2026-11-09f 토의 추가
//  action 'open'     : (토의) 다른 지원자 3명의 첫 의견
//  action 'rebut'    : 1차 발언을 듣고 토론이면 반론, 발표면 면접관 질문 하나, 토의면 다른 지원자 2명의 이어지는 발언
//  action 'feedback' : 발언 전체를 보고 항목별(1~5점) 점수와 총점·잘한 점·고칠 점·예시 시작 문장
//                      토론: 주장·근거·반론 대응·경청·태도 / 발표: 주장·근거·질문 대응·태도 / 토의: 의견 제시·근거·경청·의견 조율·태도
// 로그인·승인·AI 사용 한도(하루 debate-날짜)를 다른 함수와 같은 방식으로 확인. 금지 주제·개인 신상은 묻지 않음
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { askJson, cleanText, corsHeaders, json, NOT_APPROVED_MSG, requireApproved, requireUser, SUPABASE_ANON_KEY, SUPABASE_URL } from "../_shared/ai_common.ts";
import { blockReason } from "../_shared/qbank.ts";

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

const SAFETY = `- 나이·결혼·연애·출산·가족·재산·출신지·거주지·종교·정치 성향·외모·건강·장애·병역·성별·음주·흡연 같은 개인 신상은 절대 묻거나 언급하지 않는다.
- 통계·수치·법 조항·기관 사업을 지어내지 않는다. 확실하지 않은 사실은 쓰지 않는다.
- 지원자를 깎아내리거나 비꼬지 않는다. 존댓말을 쓴다.`;

const REBUT = (kind: string) => kind === "pt"
  ? `너는 공공기관 채용 발표(PT) 면접의 면접관이다. 지원자가 [주제]로 발표한 내용을 듣고, 발표의 가장 약한 부분(실현 가능성·비용·대상·근거·부작용 중 하나)을 짚는 질문을 하나 한다.
- 발표에서 실제로 말한 내용을 짧게 인용하거나 가리키며 묻는다. 2문장 이내, 90자 안팎.
${SAFETY}
JSON으로만 답한다: {"rebut":"질문","point":"짚은 약점을 10자 안팎으로"}`
  : `너는 공공기관 채용 토론 면접에서 지원자와 반대 입장에 선 토론자다. 지원자가 [주제]에 대해 말한 주장을 듣고, 그 주장의 가장 약한 고리를 겨냥한 반론을 하나 한다.
- 지원자의 주장을 한 번 짧게 요약해 받은 뒤, 반대 근거 하나를 들고 "이에 대해 어떻게 생각하시나요?"처럼 답을 요구한다. 2~3문장, 120자 안팎.
- 감정적·공격적 표현 없이 차분하게. 지원자가 거의 말하지 않았으면 입장부터 밝혀 달라고 부드럽게 묻는다.
${SAFETY}
JSON으로만 답한다: {"rebut":"반론","point":"짚은 약점을 10자 안팎으로"}`;

const OPEN = `너는 공공기관 채용 집단 토의 면접에 함께 들어온 다른 지원자 3명(지원자 A·B·C)을 연기한다. 이 토의는 찬반을 겨루는 것이 아니라, 모두 함께 [주제]에 대한 해결 방안을 정하는 자리다.
- 세 사람은 서로 다른 관점(예: 국민·이용자 입장, 현장 실무·인력, 예산·운영 효율, 형평성·취약계층 중 셋)에서 첫 의견을 낸다.
- 각자 1~2문장, 80자 안팎. 서로 조금씩 부딪히는 지점이 있게 하되, 공격적이지 않게 존댓말로.
- 주제와 상관없는 이야기, 지어낸 통계·법 조항·기관 사업은 쓰지 않는다.
${SAFETY}
JSON으로만 답한다: {"members":[{"who":"지원자 A","view":"관점을 6자 안팎으로","text":"발언"},{"who":"지원자 B","view":"","text":""},{"who":"지원자 C","view":"","text":""}]}`;

const GROUP_REPLY = `너는 공공기관 채용 집단 토의 면접에 함께 들어온 다른 지원자 A·B·C를 연기한다. 토의 목표는 함께 [주제]의 해결 방안을 정하는 것이다. [기록]의 마지막은 연습하는 학생인 지원자 D의 발언이다.
- 다른 지원자 두 명이 차례로 이어서 말한다. 한 명은 D의 의견 중 일부를 받아 덧붙이거나 우려를 말한다. 다른 한 명은 지금까지 나온 의견들 사이의 차이를 짚고 D에게 "어떻게 정리하면 좋을까요?"처럼 의견을 모아 달라고 요청한다.
- 의견을 모아 달라는 요청은 반드시 D에게 한다 (A·B·C끼리 묻지 않는다). D를 부를 때는 'D님'이라고 한다. 각자 1~2문장, 90자 안팎. 앞선 발언을 실제로 가리키며 말한다. D가 거의 말하지 않았으면 의견을 부드럽게 다시 청한다.
${SAFETY}
JSON으로만 답한다: {"remarks":[{"who":"지원자 B","text":""},{"who":"지원자 C","text":""}]}`;

const AXES: Record<string, [string, string][]> = {
  debate: [
    ["claim", "주장: 자기 입장이 처음부터 분명하고 끝까지 일관된가"],
    ["evidence", "근거: 주장을 받치는 이유·사례·경험이 구체적인가 (숫자·사례가 있으면 높게, 막연하면 낮게)"],
    ["response", "반론 대응: 반론의 핵심에 근거를 들어 다시 답했는가"],
    ["listening", "경청·인정: 상대 반론을 정확히 받아 요약하거나, 인정할 부분은 인정했는가 (무시하고 자기 말만 반복하면 낮게)"],
    ["attitude", "태도: 상대를 존중하는 말투, 격식 있는 존댓말, 공공기관 직원다운 균형감"],
  ],
  pt: [
    ["claim", "주장: 발표의 결론·제안이 처음부터 분명한가, 문제-원인-해결-효과 구성이 있는가"],
    ["evidence", "근거: 제안을 받치는 이유·사례·경험이 구체적인가 (숫자·사례가 있으면 높게, 막연하면 낮게)"],
    ["response", "질문 대응: 면접관 질문의 핵심에 바로 답하고 보완책을 냈는가"],
    ["attitude", "태도: 격식 있는 존댓말, 공공기관 직원다운 균형감"],
  ],
  group: [
    ["claim", "의견 제시: 자기 의견과 해결 방안을 분명하게 냈는가"],
    ["evidence", "근거: 의견을 받치는 이유·사례가 구체적인가"],
    ["listening", "경청: 다른 지원자의 말을 이름이나 내용으로 짚어 받았는가, 좋은 점을 인정했는가"],
    ["coordination", "의견 조율: 서로 다른 의견을 정리하고, 모두 받아들일 수 있는 합의안·절충안을 제안했는가"],
    ["attitude", "태도: 끼어들거나 깎아내리지 않는 협력적 말투, 격식 있는 존댓말"],
  ],
};
const KIND_NAME: Record<string, string> = { debate: "찬반 토론 면접", pt: "발표(PT) 면접", group: "집단 토의 면접(다른 지원자 3명과 함께 해결 방안 정하기)" };

const FEEDBACK = (kind: string) => `너는 대학생 취업 면접 코치다. 지원자${kind === "group" ? "(기록의 지원자 D)" : "('나')"}는 공공기관 채용의 ${KIND_NAME[kind]}을 연습했다. 아래 [기록]만 보고 이 지원자의 발언만 평가한다. 피드백 문장에서는 지원자를 '지원자 D'나 '나'라고 부르지 말고 주어 없이 쓴다. 말하지 않은 내용을 지어내지 않는다.

[평가 항목 — 각 1~5점]
${AXES[kind].map(([k, d]) => `- ${k}(${d.split(":")[0]}):${d.slice(d.indexOf(":") + 1)}`).join("\n")}

[쓰는 법]
- score: 0~100 총점 (항목을 고르게 반영)
- summary: 한 문장 총평
- strengths: 잘한 점 2개 (실제 발언을 짧게 가리키며)
- improvements: 고칠 점 2개 (바로 해 볼 수 있게 구체적으로)
- better_start: 이 주제로 다시 말한다면 이렇게 시작해 보라는 예시 2~3문장 (지원자 입장을 살려서, 지어낸 통계 없이)
${SAFETY}
JSON으로만 답한다: {"score":0,"axes":{${AXES[kind].map(([k]) => `"${k}":1`).join(",")}},"summary":"","strengths":["",""],"improvements":["",""],"better_start":""}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "로그인이 필요해요" }, 401);
  const ap = await requireApproved(user.id);
  if (!ap.ok) return json({ error: "not_approved", reason: ap.reason, message: NOT_APPROVED_MSG[ap.reason ?? "pending"] ?? NOT_APPROVED_MSG.pending }, 403);
  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { return json({ error: "요청 본문이 JSON이 아니에요" }, 400); }
  const action = p.action === "feedback" ? "feedback" : p.action === "open" ? "open" : "rebut";
  const kind = p.kind === "pt" ? "pt" : p.kind === "group" ? "group" : "debate";
  const topic = cleanText(p.topic, 200), org = cleanText(p.org, 40);
  const rounds = (Array.isArray(p.rounds) ? p.rounds : []).slice(0, 10).map((r: any) => ({ role: r?.role === "ai" ? "ai" : "me", who: cleanText(r?.who, 12), text: cleanText(r?.text, 2500) })).filter((r) => r.text);
  if (!topic || (action !== "open" && !rounds.some((r) => r.role === "me"))) return json({ error: "주제와 발언이 필요해요" }, 400);
  if (action === "open" && kind !== "group") return json({ error: "토의에서만 써요" }, 400);
  if (action === "open" || (action === "rebut" && kind !== "group")) {   // 한 번 연습에 한 번만 셈
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const lim = await checkUsageLimit(req, `debate-${day}`);
    if (!lim.ok) return json({ error: "limit", limit: lim.status }, 429);
  }
  let mi = 0;
  const log = rounds.map((r) => `${r.role === "ai" ? (kind === "pt" ? "면접관 질문" : kind === "group" ? (r.who || "다른 지원자") : "상대 반론") : kind === "group" ? `지원자 D(발언 ${++mi})` : `나(발언 ${++mi})`}: ${r.text}`).join("\n");
  const user_ = `[기관] ${org || "공공기관"}\n[주제] ${topic}\n\n[기록]\n${log || "(아직 발언 없음)"}`;
  try {
    if (action === "open") {
      for (let t = 0; t < 2; t++) {
        const { data } = await askJson(OPEN, user_, { maxTokens: 1200, timeoutMs: 30000, temperature: 0.7 });
        const members = (Array.isArray(data.members) ? data.members : []).slice(0, 3).map((m: any, i: number) => ({ who: `지원자 ${"ABC"[i]}`, view: cleanText(m?.view, 16), text: cleanText(m?.text, 240) })).filter((m) => m.text && !blockReason(m.text));
        if (members.length === 3) return json({ members });
      }
      return json({ error: "ai_failed", message: "다른 지원자 의견을 만들지 못했어요. 다시 시도해 주세요." }, 502);
    }
    if (action === "rebut" && kind === "group") {
      for (let t = 0; t < 2; t++) {
        const { data } = await askJson(GROUP_REPLY, user_, { maxTokens: 1200, timeoutMs: 30000, temperature: 0.6 });
        const remarks = (Array.isArray(data.remarks) ? data.remarks : []).slice(0, 2).map((m: any) => ({ who: /^지원자 [ABC]$/.test(String(m?.who ?? "")) ? String(m.who) : "지원자 B", text: cleanText(m?.text, 260).replace(/(^|[\s.])[ABC]님,\s*(?=[^?]*\?\s*$)/, "$1D님, ") })).filter((m) => m.text && !blockReason(m.text));   // "A님, …정리하면 좋을까요?"처럼 다른 AI에게 묻는 건 D에게로
        if (remarks.length) return json({ remarks });
      }
      return json({ remarks: [{ who: "지원자 B", text: "말씀하신 방안도 좋은데, 현장에서 바로 적용하기엔 부담이 있을 수 있을 것 같습니다." }, { who: "지원자 C", text: "지금까지 나온 의견들이 조금씩 다른데, 어떻게 정리하면 좋을지 의견 주시겠어요?" }] });
    }
    if (action === "rebut") {
      for (let t = 0; t < 2; t++) {
        const { data } = await askJson(REBUT(kind), user_, { maxTokens: 900, timeoutMs: 30000, temperature: 0.5 });
        const rebut = cleanText(data.rebut, 300);
        if (rebut && !blockReason(rebut)) return json({ rebut, point: cleanText(data.point, 40) });
      }
      return json({ rebut: kind === "pt" ? "발표하신 방안을 실제로 실행할 때 가장 어려운 점은 무엇이고, 어떻게 보완하시겠어요?" : "반대 입장에서는 그 방안이 오히려 부담을 키울 수 있다고 봅니다. 이에 대해 어떻게 생각하시나요?", point: "" });
    }
    const { data } = await askJson(FEEDBACK(kind), user_, { maxTokens: 1800, timeoutMs: 45000, temperature: 0.3 });
    const ax = (data.axes ?? {}) as Record<string, unknown>;
    const n = (v: unknown) => Math.max(1, Math.min(5, Math.round(Number(v) || 1)));
    const list = (v: unknown) => (Array.isArray(v) ? v : []).map((x) => cleanText(x, 200)).filter((x) => x && !blockReason(x)).slice(0, 3);
    return json({
      score: Math.max(0, Math.min(100, Math.round(Number(data.score) || 0))),
      axes: Object.fromEntries(AXES[kind].map(([k]) => [k, n(ax[k])])),
      summary: cleanText(data.summary, 200), strengths: list(data.strengths), improvements: list(data.improvements),
      better_start: blockReason(String(data.better_start ?? "")) ? "" : cleanText(data.better_start, 500),
    });
  } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
});
