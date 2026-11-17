// 2026-11-05 클론(ZAVAPASS-clone) 전용: 면접 DB 서버 함수(pick-questions 등)가 함께 쓰는 도우미
// OpenAI 호출·로그인 확인·승인 확인·응답 모양. grade-answer에 있던 것과 같은 동작 (그 함수는 그대로 둠)
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";
import { type AiCtx, logAi } from "./ai_log.ts";
import { guardMsgs, leaked } from "./guard.ts";

export const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
export const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.6-luna";
const FALLBACK_MODEL = "gpt-4o-mini";
export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
export function cleanText(v: unknown, n: number): string {
  return typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, n) : "";
}

/** 서비스 키로 DB를 읽고 쓰는 연결 (RLS를 넘으므로 이 파일을 쓰는 함수 안에서만, 학생에게 원문을 돌려주지 않게 주의) */
export function adminClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function requireUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token || !SUPABASE_URL || token === SUPABASE_ANON_KEY) return null;
  try {
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: u.id, email: typeof u.email === "string" ? u.email : undefined } : null;
  } catch { return null; }
}

/** 승인 대기·기간 만료 계정은 AI 기능을 쓰지 못함 (관리자는 통과). 조회 실패면 멈추지 않게 통과 */
export async function requireApproved(userId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}&select=is_admin,allowed_fields,access_until`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
    if (!r.ok) return { ok: true };
    const p = (await r.json())?.[0];
    if (!p) return { ok: false, reason: "no_profile" };
    if (p.is_admin) return { ok: true };
    if (!(Array.isArray(p.allowed_fields) && p.allowed_fields.filter(Boolean).length)) return { ok: false, reason: "pending" };
    if (p.access_until) {
      const todayKst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
      if (String(p.access_until).slice(0, 10) < todayKst) return { ok: false, reason: "expired" };
    }
    return { ok: true };
  } catch { return { ok: true }; }
}
export const NOT_APPROVED_MSG: Record<string, string> = {
  pending: "담당자 승인 후 사용할 수 있어요.", expired: "이용 기간이 끝나 사용할 수 없어요.", no_profile: "등록 정보가 없는 계정이에요.",
};

/* 2026-11-17 외부 AI로 보내기 전 가리기 (서버가 DB에서 직접 읽은 글에 씀. 화면이 보내는 글은 화면에서 먼저 가림)
 *   본인 이름·학번(알면)과 전화·이메일·주민번호·'성명: ○○○' 꼴을 표시로 바꾸고, map에 되돌릴 글자를 남김 */
export function maskPII(text: string, me: { name?: string; sid?: string } = {}, map: Map<string, string> = new Map()): string {
  let out = String(text || "");
  const put = (orig: string, tag: string): string => {
    if (tag === "[이름]" || tag === "[학번]") { if (!map.has(tag)) map.set(tag, orig); return tag; }
    for (const [k, v] of map) if (v === orig && k.startsWith(tag.slice(0, -1))) return k;
    let i = 1; while (map.has(`${tag.slice(0, -1)}#${i}]`)) i++; const key = `${tag.slice(0, -1)}#${i}]`; map.set(key, orig); return key;
  };
  const nm = String(me.name || "").replace(/\s/g, "");
  if (/^[가-힣]{3,5}$/.test(nm)) out = out.replace(new RegExp(nm.split("").join("\\s?"), "g"), () => put(String(me.name), "[이름]"));
  else if (/^[가-힣]{2}$/.test(nm)) out = out.replace(new RegExp(`(?<![가-힣])${nm}(?=(입니다|이라고|라고|이에요|예요|이고|이며|입니|\\s|[.,!?]|$))`, "g"), () => put(String(me.name), "[이름]"));
  const sid = String(me.sid || "");
  if (/^[A-Za-z]?\d{6,12}$/.test(sid)) out = out.replace(new RegExp(`(?<!\\d)${sid}(?!\\d)`, "g"), () => put(sid, "[학번]"));
  out = out.replace(/\b\d{6}\s?-\s?[1-4]\d{6}\b/g, (m) => put(m, "[주민번호]"));
  out = out.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => put(m, "[이메일]"));
  out = out.replace(/\b01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}\b/g, (m) => put(m, "[전화]"));
  out = out.replace(/((?:성\s*명|학생\s*명|성함|(?<![가-힣] ?)이\s*름)\s*[:：]\s*)([가-힣](?: ?[가-힣]){1,3}(?![가-힣]))/g, (_m, a, v) => a + put(v, "[성명]"));
  out = out.replace(/((?:학\s*번|학생\s*번호|수험\s*번호)\s*[:：]?\s*)([A-Za-z]?\d[\d-]{5,14})/g, (_m, a, v) => a + put(v, "[번호]"));
  return out;
}
/** 가린 표시를 원래 글자로 (응답을 학생에게 돌려주기 전) */
export function unmaskPII<T>(v: T, map: Map<string, string>): T {
  if (!map.size) return v;
  if (typeof v === "string") { let out: string = v; if (out.indexOf("[") < 0) return v; for (const [k, orig] of map) out = out.split(k).join(orig); return out as unknown as T; }
  if (Array.isArray(v)) return v.map((x) => unmaskPII(x, map)) as unknown as T;
  if (v && typeof v === "object") { const o: Record<string, unknown> = {}; for (const k in v as Record<string, unknown>) o[k] = unmaskPII((v as Record<string, unknown>)[k], map); return o as T; }
  return v;
}
/** 본인 이름(프로필)과 학번(로그인 아이디) — 가릴 때 씀. 못 읽으면 빈 값 */
export async function whoIs(user: { id: string; email?: string }): Promise<{ name: string; sid: string }> {
  let name = "";
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=name`, { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } });
    if (r.ok) name = String((await r.json())?.[0]?.name ?? "");
  } catch { /* 이름 없이 진행 */ }
  return { name, sid: String(user.email || "").split("@")[0] };
}

function isNewGen(model: string) { return /^(gpt-5|o\d|gpt-6)/i.test(model); }
function buildBody(model: string, messages: unknown[], temperature: number, maxTokens: number) {
  const body: Record<string, unknown> = { model, messages, response_format: { type: "json_object" } };
  if (isNewGen(model)) body.max_completion_tokens = maxTokens; else { body.temperature = temperature; body.max_tokens = maxTokens; }
  return body;
}
/** OpenAI에 JSON으로 묻고 JSON으로 받음. 실패하면 이유를 담아 throw */
export async function askJson(system: string, user: string, opt: { temperature?: number; maxTokens?: number; timeoutMs?: number; reasoning?: string; log?: AiCtx; guard?: boolean } = {}): Promise<{ data: Record<string, unknown>; model: string }> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
  const messages = [{ role: "system", content: system }, { role: "user", content: user }];
  const t0 = Date.now();   // 2026-11-17 AI 요청·응답 기록 (opt.log 를 넘긴 함수만)
  const rec = (status: string, http: number, response: string, usage: unknown, error = "") => { if (opt.log) logAi({ ...opt.log, model, messages, status, http, ms: Date.now() - t0, response, usage: usage as never, error }); };
  const maxTokens = opt.maxTokens ?? 2500, temperature = opt.temperature ?? 0.3;
  const send = (body: Record<string, unknown>) => {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), opt.timeoutMs ?? 40000);
    return fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).finally(() => clearTimeout(t));
  };
  if (opt.guard && opt.log) await guardMsgs(opt.log, messages);   // 2026-11-17 지시문 차단: 학생 쪽 글에 AI에게 내리는 지시가 있으면 안내를 붙이고 기록
  let model = OPENAI_MODEL, body = buildBody(model, messages, temperature, maxTokens);
  if (opt.reasoning && isNewGen(model)) body.reasoning_effort = opt.reasoning;   // 2026-11-17 '생각 짧게'(none·low): 빨리 답해야 하는 함수만 넘김
  let res = await send(body);
  if (res.status >= 500 || res.status === 429) { await new Promise((r) => setTimeout(r, 700)); res = await send(body); }
  for (const next of ["low", null]) {   // 모델이 그 값을 거부하면 low로, 그것도 거부하면 빼고 다시
    if (res.status !== 400 || !("reasoning_effort" in body)) break;
    const t = await res.clone().text();
    if (!/reasoning/i.test(t)) break;
    if (next && body.reasoning_effort !== next) body.reasoning_effort = next; else delete body.reasoning_effort;
    res = await send(body);
  }
  if (res.status === 400) {
    const t = await res.clone().text();
    if (/temperature|max_tokens|max_completion_tokens|unsupported/i.test(t)) { delete body.temperature; delete body.max_tokens; body.max_completion_tokens = maxTokens; res = await send(body); }
  }
  if ((res.status === 404 || res.status === 400) && model !== FALLBACK_MODEL) {
    const t = await res.clone().text();
    if (/model|not found|does not exist/i.test(t)) { model = FALLBACK_MODEL; body = buildBody(model, messages, temperature, maxTokens); res = await send(body); }
  }
  if (!res.ok) { const et = (await res.text()).slice(0, 500); rec("error", res.status, "", null, et); throw new Error(`OpenAI ${res.status}: ${et.slice(0, 200)}`); }
  let out = await res.json();
  let content = out?.choices?.[0]?.message?.content ?? "";
  if (!content && isNewGen(model)) {   // 추론형 모델이 생각에 토큰을 다 써서 빈 답이면 한 번 더 넉넉하게
    body.max_completion_tokens = Math.round(maxTokens * 1.8);
    const r2 = await send(body); if (r2.ok) { out = await r2.json(); content = out?.choices?.[0]?.message?.content ?? ""; }
  }
  if (opt.guard && opt.log && leaked(opt.log, messages, String(content), "응답을 버리고 오류로 돌려줌")) { rec("error", res.status, "", out?.usage, "AI 응답에 내부 지시문이 섞여 버림"); throw new Error("AI 응답을 쓸 수 없어요. 다시 시도해 주세요."); }
  let data: Record<string, unknown>;
  try { data = JSON.parse(content); } catch { rec(content ? "error" : "empty", res.status, String(content), out?.usage, "AI 응답이 JSON이 아님"); throw new Error("AI 응답이 JSON이 아니에요: " + String(content).slice(0, 120)); }
  rec("ok", res.status, String(content), out?.usage);
  return { data, model };
}
