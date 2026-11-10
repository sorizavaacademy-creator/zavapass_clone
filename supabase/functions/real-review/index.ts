// 2026-11-10 클론(ZAVAPASS-clone) 전용: 실제 면접 복기 → 다음 면접 준비
//  학생이 실제 면접에서 받은 질문·내가 한 답(짧게)·아쉬웠던 점을 보내면
//  ① 한 줄 총평 ② 잘한 점 ③ 다음 면접(2차 등)에서 보완할 점 3개 ④ 나올 만한 꼬리·추가 질문 최대 5개(이유와 함께)를 돌려줌
//  사실을 지어내지 않고, 금지 주제(개인 신상) 질문은 만들지 않음. AI 사용 한도는 하루 review-날짜로 셈
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

const SYSTEM = `너는 대학생 취업 면접 코치다. 학생이 방금 본 [실제 면접]을 복기했다. 받은 질문, 학생이 기억하는 자기 답(짧은 메모일 수 있음), 아쉬웠던 점을 보고 다음 면접을 준비시킨다.
해야 할 일:
- summary: 이번 면접을 한 문장으로 정리 (격려하되 솔직하게)
- good: 잘한 점 최대 2개 (실제로 적힌 답을 근거로)
- next: 다음 면접에서 보완할 점 3개. 각 항목은 바로 해 볼 수 있는 행동으로 (예: "지원동기 첫 문장에 기관 사업 이름을 넣기")
- followups: 이 면접관이 다음 면접(2차·최종)에서 물을 만한 꼬리·추가 질문 최대 5개. 각 {q: 질문, why: 왜 나올지 한 문장}
규칙:
- 학생이 쓴 내용만 근거로 하고, 기관 사업·통계를 지어내지 않는다.
- 나이·결혼·가족·출신지·종교·정치·외모·건강·병역·성별 같은 개인 신상 질문은 절대 만들지 않는다.
- 존댓말, 학생을 깎아내리지 않는다.
JSON으로만 답한다: {"summary":"","good":[""],"next":["","",""],"followups":[{"q":"","why":""}]}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "로그인이 필요해요" }, 401);
  const ap = await requireApproved(user.id);
  if (!ap.ok) return json({ error: "not_approved", reason: ap.reason, message: NOT_APPROVED_MSG[ap.reason ?? "pending"] ?? NOT_APPROVED_MSG.pending }, 403);
  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { return json({ error: "요청 본문이 JSON이 아니에요" }, 400); }
  const org = cleanText(p.org, 60), round = cleanText(p.round, 20), regret = cleanText(p.regret, 800);
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 12).map((x: any) => ({ q: cleanText(x?.q, 200), a: cleanText(x?.a, 800) })).filter((x) => x.q);
  if (!items.length) return json({ error: "no_items", message: "받은 질문을 하나 이상 적어 주세요." }, 400);
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const lim = await checkUsageLimit(req, `review-${day}`);
  if (!lim.ok) return json({ error: "limit", limit: lim.status }, 429);
  const user_ = `[실제 면접] ${org || "기관 미입력"}${round ? ` · ${round}` : ""}\n${items.map((x, i) => `${i + 1}. 질문: ${x.q}\n   내 답(기억나는 대로): ${x.a || "(기억 안 남)"}`).join("\n")}\n\n[아쉬웠던 점] ${regret || "(없음)"}`;
  try {
    const { data } = await askJson(SYSTEM, user_, { maxTokens: 1600, timeoutMs: 45000, temperature: 0.3 });
    const ok = (s: string) => s && !blockReason(s);
    const list = (v: unknown, n: number) => (Array.isArray(v) ? v : []).map((x) => cleanText(x, 200)).filter(ok).slice(0, n);
    const followups = (Array.isArray(data.followups) ? data.followups : []).map((f: any) => ({ q: cleanText(f?.q, 200), why: cleanText(f?.why, 200) })).filter((f) => ok(f.q)).slice(0, 5);
    return json({ summary: ok(cleanText(data.summary, 200)) ? cleanText(data.summary, 200) : "", good: list(data.good, 2), next: list(data.next, 3), followups });
  } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
});
