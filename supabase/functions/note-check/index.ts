// 2026-11-10 클론(ZAVAPASS-clone) 전용: 답변 노트 ↔ 이력서·자기소개서 맞춰 보기
//  학생이 노트에 모은 답(유형별 하나씩)과 본인이 올린 이력서·자기소개서(user_resumes, 본인 권한으로 읽음)를 비교해
//  ① 서로 어긋나는 곳(역할·기간·숫자·경험 내용) ② 서류에 있는데 답에서 빠진 강점 ③ 한 줄 총평을 돌려줌
//  사실을 지어내지 않고, 개인 신상은 다루지 않음. AI 사용 한도는 하루 note-날짜로 셈
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

const CAT: Record<string, string> = { intro: "1분 자기소개", motive: "지원동기", pers: "장단점·성격", exp: "경험(갈등·협업·실패)", sit: "상황 대처", plan: "입사 후 포부", job: "직무·가치관" };

const SYSTEM = `너는 대학생 취업 면접 코치다. 학생의 [답변 노트](면접에서 할 답)와 학생이 낸 [서류](이력서·자기소개서)를 비교한다.
해야 할 일:
1) mismatches: 답변과 서류가 서로 어긋나는 곳. 같은 경험인데 역할(리더/팀원), 기간, 숫자, 결과, 동기가 다르게 적힌 경우만. 최대 4개.
   각 항목: cat(노트 유형 키), note(답변에서 그 부분을 20~60자로 인용), doc(서류에서 그 부분을 20~60자로 인용), tip(면접에서 어떻게 맞춰 말하면 좋을지 한 문장).
2) missing: 서류에 분명히 적힌 강점·경험인데 노트 답변 어디에도 안 나온 것. 최대 3개. 각 항목: strength(10~30자), where(어느 유형 답에 넣으면 좋을지 cat 키), tip(한 문장).
3) summary: 한 문장 총평.
규칙:
- 실제로 적힌 글만 근거로 한다. 없는 내용을 지어내지 않는다. 어긋남이 없으면 빈 배열을 준다.
- 나이·가족·출신지·종교·정치·외모·건강·병역·성별 같은 개인 신상은 다루지 않는다.
- 존댓말로, 학생을 탓하지 않는다.
JSON으로만 답한다: {"mismatches":[{"cat":"exp","note":"","doc":"","tip":""}],"missing":[{"strength":"","where":"pers","tip":""}],"summary":""}`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "로그인이 필요해요" }, 401);
  const ap = await requireApproved(user.id);
  if (!ap.ok) return json({ error: "not_approved", reason: ap.reason, message: NOT_APPROVED_MSG[ap.reason ?? "pending"] ?? NOT_APPROVED_MSG.pending }, 403);
  let p: Record<string, unknown> = {};
  try { p = await req.json(); } catch { return json({ error: "요청 본문이 JSON이 아니에요" }, 400); }
  const notes = (Array.isArray(p.notes) ? p.notes : []).slice(0, 7).map((n: any) => ({ cat: CAT[n?.cat] ? String(n.cat) : "job", question: cleanText(n?.question, 200), answer: cleanText(n?.answer, 1500) })).filter((n) => n.answer.length >= 20);
  if (!notes.length) return json({ error: "no_notes", message: "노트에 답이 아직 없어요. 면접이나 10분 마무리로 답을 먼저 모아 주세요." }, 400);
  // 서류는 본인 권한으로 읽음 (RLS: 본인 전체)
  let resume = "", cv = "";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/user_resumes?user_id=eq.${encodeURIComponent(user.id)}&select=resume_text,cv_text`, { headers: { Authorization: req.headers.get("Authorization") ?? "", apikey: SUPABASE_ANON_KEY } });
    if (r.ok) { const row = (await r.json())?.[0] ?? {}; resume = cleanText(row.resume_text, 5000); cv = cleanText(row.cv_text, 6000); }
  } catch { /* 서류 없음으로 처리 */ }
  if (!resume && !cv) return json({ error: "no_docs", message: "올려 둔 이력서·자기소개서가 없어요. 마이페이지에서 먼저 올려 주세요." }, 400);
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const lim = await checkUsageLimit(req, `note-${day}`);
  if (!lim.ok) return json({ error: "limit", limit: lim.status }, 429);
  const user_ = `[답변 노트]\n${notes.map((n) => `- (${n.cat} · ${CAT[n.cat]}) 질문: ${n.question}\n  답: ${n.answer}`).join("\n")}\n\n[서류 - 이력서]\n${resume || "(없음)"}\n\n[서류 - 자기소개서]\n${cv || "(없음)"}`;
  try {
    const { data } = await askJson(SYSTEM, user_, { maxTokens: 1800, timeoutMs: 45000, temperature: 0.2 });
    const ok = (s: string) => s && !blockReason(s);
    const mismatches = (Array.isArray(data.mismatches) ? data.mismatches : []).slice(0, 4).map((m: any) => ({ cat: CAT[m?.cat] ? String(m.cat) : "job", note: cleanText(m?.note, 120), doc: cleanText(m?.doc, 120), tip: cleanText(m?.tip, 200) })).filter((m) => ok(m.tip) && (m.note || m.doc));
    const missing = (Array.isArray(data.missing) ? data.missing : []).slice(0, 3).map((m: any) => ({ strength: cleanText(m?.strength, 60), where: CAT[m?.where] ? String(m.where) : "pers", tip: cleanText(m?.tip, 200) })).filter((m) => ok(m.strength) && ok(m.tip));
    return json({ mismatches, missing, summary: blockReason(String(data.summary ?? "")) ? "" : cleanText(data.summary, 200), docs: { resume: !!resume, cv: !!cv } });
  } catch (e) { return json({ error: "ai_failed", message: (e as Error).message.slice(0, 200) }, 502); }
});
