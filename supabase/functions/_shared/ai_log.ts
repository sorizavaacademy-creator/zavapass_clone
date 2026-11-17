// 2026-11-17 클론(ZAVAPASS-clone) 전용: AI 요청·응답 기록 (ai_logs 표)
//   AI(OpenAI)에게 보낸 글과 돌려받은 글을 그대로 남김 — 관리자 화면 'AI 요청·응답 기록'에서 봄.
//   · 보내는 글은 이미 이름·학번을 가린 상태(화면·서버에서 먼저 가림)이고, 돌려받은 글도 가린 표시 그대로 남김
//   · 응답을 돌려준 뒤 뒤에서 저장하므로 화면 대기 시간은 늘지 않음. 저장에 실패해도 면접에는 영향 없음
//   · 끄기: 관리자 설정(app_settings.ai_log.enabled=false, DB에서 걸러짐) 또는 환경 변수 AI_LOG=off
const URL_ = Deno.env.get("SUPABASE_URL") ?? "";
const KEY_ = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const OFF = (Deno.env.get("AI_LOG") ?? "").toLowerCase() === "off";
const MAX = 24000;   // 한 칸에 남기는 글자 수 (넘으면 자르고 몇 글자 잘랐는지 적음)

export type AiCtx = { fn: string; step?: string; userId?: string | null; meta?: Record<string, unknown> };
type Usage = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } | null | undefined;
type Row = AiCtx & { model?: string; messages?: unknown; response?: string; status?: string; http?: number; ms?: number; usage?: Usage; error?: string };

const cut = (s: string) => (s.length > MAX ? s.slice(0, MAX) + `…(+${s.length - MAX}자 잘림)` : s);
function msgList(m: unknown): { role: string; content: string }[] {
  if (!Array.isArray(m)) return [];
  return m.map((x) => { const o = (x ?? {}) as Record<string, unknown>; const c = o.content; return { role: String(o.role ?? ""), content: cut(typeof c === "string" ? c : JSON.stringify(c ?? "")) }; });
}
function bg(p: Promise<unknown>): void {
  try { const er = (globalThis as unknown as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime; if (er && er.waitUntil) er.waitUntil(p); } catch { /* 없으면 그냥 뒤에서 진행 */ }
}
function put(e: Row): Promise<void> {
  const u = e.usage || {};
  const row = {
    user_id: e.userId || null, fn: e.fn, step: e.step || null, model: e.model || null, status: e.status || "ok",
    http: e.http ?? null, ms: e.ms ?? null, messages: msgList(e.messages), response: cut(String(e.response ?? "")),
    tokens_in: u.prompt_tokens ?? null, tokens_out: u.completion_tokens ?? null, tokens_cached: u.prompt_tokens_details?.cached_tokens ?? null,
    error: e.error ? String(e.error).slice(0, 600) : null, meta: e.meta ?? null,
  };
  return fetch(`${URL_}/rest/v1/ai_logs`, { method: "POST", headers: { apikey: KEY_, Authorization: `Bearer ${KEY_}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify(row) })
    .then((r) => { if (!r.ok) console.warn("[AI 기록 저장 실패]", r.status); return r.text().then(() => undefined); })
    .catch((err) => { console.warn("[AI 기록 저장 실패]", String(err).slice(0, 120)); });
}
/** 한 건 남기기 (이미 응답 글자를 알고 있을 때) */
export function logAi(e: Row): void {
  if (OFF || !URL_ || !KEY_ || !e || !e.fn) return;
  try { bg(put(e)); } catch { /* 기록은 실패해도 조용히 */ }
}
/** OpenAI 응답(Response)을 받은 바로 다음 줄에서 부름 — 본문을 복사해 두었다가 뒤에서 읽어 남김 (원래 응답은 그대로 쓸 수 있음) */
export function logAiRes(ctx: AiCtx, messages: unknown, res: Response, model: string, t0: number): void {
  if (OFF || !URL_ || !KEY_ || !ctx || !ctx.fn) return;
  let c: Response; try { c = res.clone(); } catch { return; }
  const ms = Date.now() - t0, http = res.status, okHttp = res.ok;
  try {
    bg(c.text().then((t) => {
      // deno-lint-ignore no-explicit-any
      let j: any = null; try { j = JSON.parse(t); } catch { /* JSON 아님 */ }
      const content = j?.choices?.[0]?.message?.content; const has = typeof content === "string" && content.trim() !== "";
      return put({ ...ctx, model, messages, http, ms, usage: j?.usage, response: okHttp && has ? content : "",
        status: !okHttp ? "error" : has ? "ok" : "empty", error: !okHttp ? t.slice(0, 500) : has ? "" : `빈 응답 (${j?.choices?.[0]?.finish_reason ?? "이유 모름"})` });
    }).catch(() => {}));
  } catch { /* 조용히 */ }
}
