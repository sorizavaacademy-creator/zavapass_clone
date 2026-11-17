// 2026-11-17 클론(ZAVAPASS-clone) 전용: 서버 음성 인식 (답변 소리 → 글자)
//  브라우저 기본 음성 인식이 없는 브라우저(Firefox 등)에서, 화면이 녹음한 답변 소리를 받아 글자로 돌려줌.
//  엔진은 갈아 끼울 수 있게 나눠 둠: STT_ENGINE = "openai"(지금, 임시) | "haiv"(자체 엔진, 연결 정보를 받으면 채움)
//  주의: 임시 엔진(openai)은 답변 소리가 외부(OpenAI)로 나감 → 클론에서 시험용으로만. 운영·제안 기준은 자체 엔진(HAIV).
//  요청 (POST, multipart/form-data): file(소리 파일, 8MB 이하), lang("ko"|"en"), final("1"이면 답변 끝 · "0"이면 말하는 도중), interview_id(선택)
//  응답 { text, ms(엔진이 걸린 시간), engine, model }
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, json, NOT_APPROVED_MSG, OPENAI_API_KEY, requireApproved, requireUser, SUPABASE_ANON_KEY, SUPABASE_URL } from "../_shared/ai_common.ts";

const ENGINE = (Deno.env.get("STT_ENGINE") ?? "openai").toLowerCase();
const MODELS = [Deno.env.get("STT_MODEL") ?? "", "gpt-4o-mini-transcribe", "whisper-1"].filter((m, i, a) => m && a.indexOf(m) === i);
const MAX_BYTES = 8 * 1024 * 1024;

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

function fileName(type: string): string {
  const t = (type || "").toLowerCase();
  if (t.includes("webm")) return "answer.webm";
  if (t.includes("ogg")) return "answer.ogg";
  if (t.includes("mp4") || t.includes("m4a") || t.includes("aac")) return "answer.mp4";
  if (t.includes("wav")) return "answer.wav";
  if (t.includes("mpeg") || t.includes("mp3")) return "answer.mp3";
  return "answer.webm";
}

/** 임시 엔진: OpenAI 음성 인식. 모델 이름을 못 쓰면 다음 모델로 */
async function openaiTranscribe(file: Blob, lang: string): Promise<{ text: string; model: string }> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY가 설정되지 않았어요");
  let lastErr = "";
  for (const model of MODELS) {
    const fd = new FormData();
    fd.append("file", file, fileName(file.type)); fd.append("model", model); fd.append("language", lang); fd.append("response_format", "json");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 40000);
    let res: Response;
    try { res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${OPENAI_API_KEY}` }, body: fd }); }
    finally { clearTimeout(t); }
    if (res.ok) { const j = await res.json(); return { text: String(j?.text ?? "").trim(), model }; }
    lastErr = `OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`;
    if (!(res.status === 404 || (res.status === 400 && /model|does not exist|not found|response_format/i.test(lastErr)))) break;
  }
  throw new Error(lastErr || "음성 인식 엔진이 답하지 않았어요");
}

/** 자체 엔진(HAIV STT) 자리. 접속 주소·형식·키를 받으면 여기를 채움 (HAIV_STT_URL, HAIV_STT_KEY) */
async function haivTranscribe(_file: Blob, _lang: string): Promise<{ text: string; model: string }> {
  throw new Error("haiv_not_configured");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "POST만 받아요" }, 405);
  const user = await requireUser(req);
  if (!user) return json({ error: "로그인이 필요해요" }, 401);
  const ap = await requireApproved(user.id);
  if (!ap.ok) return json({ error: "not_approved", reason: ap.reason, message: NOT_APPROVED_MSG[ap.reason ?? "pending"] ?? NOT_APPROVED_MSG.pending }, 403);
  let form: FormData;
  try { form = await req.formData(); } catch { return json({ error: "bad_form", message: "소리 파일을 받지 못했어요." }, 400); }
  const file = form.get("file");
  if (!(file instanceof Blob)) return json({ error: "no_file", message: "소리 파일이 없어요." }, 400);
  if (file.size < 800) return json({ text: "", ms: 0, engine: ENGINE, model: "", note: "too_short" });
  if (file.size > MAX_BYTES) return json({ error: "too_large", message: "답변이 너무 길어요. 조금 나눠서 답해 주세요." }, 413);
  const lang = String(form.get("lang") ?? "ko").toLowerCase().startsWith("en") ? "en" : "ko";
  const final = String(form.get("final") ?? "1") !== "0";
  if (final) {   // 답변 끝에만 한도 확인 (말하는 도중에 보내는 것은 같은 면접의 일부)
    const iv = String(form.get("interview_id") ?? "").slice(0, 60);
    const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
    const lim = await checkUsageLimit(req, iv || `stt-${day}`);
    if (!lim.ok) return json({ error: "limit", limit: lim.status }, 429);
  }
  const t0 = Date.now();
  try {
    const out = ENGINE === "haiv" ? await haivTranscribe(file, lang) : await openaiTranscribe(file, lang);
    return json({ text: out.text, ms: Date.now() - t0, engine: ENGINE, model: out.model, bytes: file.size });
  } catch (e) {
    const msg = (e as Error).message || "";
    if (msg === "haiv_not_configured") return json({ error: "engine_not_configured", message: "자체 음성 인식 엔진이 아직 연결되지 않았어요." }, 501);
    return json({ error: "stt_failed", message: msg.slice(0, 200) }, 502);
  }
});
