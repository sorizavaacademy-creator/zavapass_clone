// 2026-11-09 클론(ZAVAPASS-clone) 전용: 면접 후기 메모 → 실제 면접 질문만 골라 다시 쓰고 유형·세부 직무를 붙임
// scripts/import_hallym_reviews.py가 씀. 관리자 임시 열쇠(qb_import_tokens)가 있어야만 동작 (학생 화면에서는 쓰지 않음)
// 원문을 그대로 옮기지 않고 뜻만 살려 새로 쓴 질문만 돌려줌 (후기 원문은 각 사이트 저작물이라 앱에 그대로 쓰지 않음)
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") ?? "";
const OPENAI_MODEL = Deno.env.get("OPENAI_MODEL") ?? "gpt-5.6-luna";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

const TYPES = ["자기소개", "지원동기", "경험·역량", "인성·가치관", "직무·전공지식", "기업·산업", "상황대처", "PT·토론", "시사·이슈", "입사후포부", "마무리", "영어"];
const SYSTEM = `너는 면접 후기 메모에서 '실제 면접 질문'만 골라 정리하는 편집자다. 각 항목은 한 지원자가 면접을 본 뒤 기억해서 적은 메모이고, 질문 여러 개와 감상이 섞여 있다.

[할 일]
- 메모 안의 실제 면접 질문을 하나씩 나눈다. 같은 메모 안에서 뜻이 같은 질문은 하나로 합친다.
- 각 질문을 누구에게나 물을 수 있는 한 문장 질문으로 다시 쓴다. 원문 문장을 그대로 베끼지 말고 뜻만 살려 새로 쓴다. 60자 이내, "~은 무엇인가요?" "~말해 주세요."처럼 쓴다.
- 기관 이름이 필요하면 [기관]의 이름을 쓴다. 다른 회사·병원 이름, 면접관·지원자 이름은 넣지 않는다.
- 원문에 없는 조건·숫자·사실을 지어내지 않는다. 말줄임·오타는 바로잡는다.
- 토론·PT·발표 주제는 유형 "PT·토론"으로 "토론 주제: …" 또는 "발표 주제: …"로 쓴다.
- 기관 역사·상식(예: 기념일, 관련 법·제도)을 묻는 질문은 "기업·산업"으로 둔다.

[버리는 것 — drop에 짧은 요약(15자 이내, 원문 베끼지 않기)과 이유를 적는다]
- 메모: 질문이 아닌 것 (분위기·소감·전형 설명·"인성 위주였음"·"기억 안 남"·"자소서 기반 질문" 같은 뭉뚱그린 말)
- 금지: 나이, 결혼·연애·출산·자녀, 가족·부모 직업·재산·집안, 고향·거주지·통근 거리·사는 곳, 종교·정치 성향, 외모·키·몸무게, 건강·병력·장애, 병역·군대, 성별, 음주·주량·흡연
- 경력: 이직 사유, 전 직장·현 직장, 퇴사 이유, 경력 공백을 탓하는 질문 등 직장 경력을 전제로 한 질문
- 진행불가: 눈앞의 자료·사진·그림·물건을 보고 답하기, 화이트보드·종이에 쓰기, 손코딩·코딩 문제 풀기, 물건 팔기
- 연봉: 희망 연봉·연봉 협상·월급이 적은데 괜찮은지
- 개인: 그 지원자만의 자소서·서류 특정 내용, 특정 학교·출신을 전제로 한 질문
- 기타: 면접관의 혼잣말·잡담, 비하·압박용 말, 뜻을 알 수 없는 것

[유형] ${TYPES.join(" / ")} 중 하나.
[세부 직무 r] 그 직무에만 맞는 질문이면 간호 / 방사선 / 임상병리 / 물리치료 / 작업치료 / 언어재활 / 청능 / 약제 / 영양 / 원무·행정 / 전산 / 시설·기술 / 연구 중 하나, 어느 직무에나 맞으면 "".

반드시 JSON으로만 답한다.
{"items":[{"i":번호,"qs":[{"q":"다시 쓴 질문","t":"유형","r":""}],"drop":[{"x":"짧은 요약","why":"메모|금지|경력|진행불가|연봉|개인|기타"}]}]}`;

async function canImport(token: string): Promise<boolean> {
  if (!token || !SUPABASE_URL || !SERVICE) return false;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/qb_can_import`, { method: "POST", headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" }, body: JSON.stringify({ p_token: token }) });
  return r.ok && (await r.json()) === true;
}

async function ask(user: string): Promise<unknown> {
  const newGen = /^(gpt-5|o\d|gpt-6)/i.test(OPENAI_MODEL);
  const body: Record<string, unknown> = { model: OPENAI_MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: user }], response_format: { type: "json_object" } };
  if (newGen) { body.max_completion_tokens = 12000; } else { body.temperature = 0.2; body.max_tokens = 12000; }
  for (let t = 0; t < 3; t++) {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 140000);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", { method: "POST", signal: ctl.signal, headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 1500 * (t + 1))); continue; }
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const out = await res.json(); const c = out?.choices?.[0]?.message?.content ?? "";
      return JSON.parse(c);
    } finally { clearTimeout(timer); }
  }
  throw new Error("OpenAI 응답 없음");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST만" }, 405);
  let p: { token?: string; org?: string; items?: { i: number; job?: string; text: string }[] } = {};
  try { p = await req.json(); } catch { return json({ error: "JSON 아님" }, 400); }
  if (!(await canImport(String(p.token ?? "")))) return json({ error: "권한 없음 (임시 열쇠 필요)" }, 403);
  if (!OPENAI_API_KEY) return json({ error: "OPENAI_API_KEY 없음" }, 500);
  const items = (Array.isArray(p.items) ? p.items : []).slice(0, 60).map((x) => ({ i: Number(x.i), job: String(x.job ?? "").slice(0, 20), text: String(x.text ?? "").replace(/\s+/g, " ").slice(0, 900) }));
  if (!items.length) return json({ items: [] });
  const user = `[기관] ${String(p.org ?? "").slice(0, 40)}\n\n[메모]\n` + items.map((x) => `${x.i}. (직무 분류: ${x.job || "-"}) ${x.text}`).join("\n");
  try {
    const data = await ask(user) as { items?: unknown[] };
    const out = (Array.isArray(data.items) ? data.items : []).map((it: any) => ({
      i: Number(it?.i),
      qs: (Array.isArray(it?.qs) ? it.qs : []).map((q: any) => ({ q: String(q?.q ?? "").trim().slice(0, 120), t: TYPES.includes(q?.t) ? q.t : "", r: String(q?.r ?? "").trim().slice(0, 12) })).filter((q: any) => q.q && q.t),
      drop: (Array.isArray(it?.drop) ? it.drop : []).map((d: any) => ({ x: String(d?.x ?? "").slice(0, 30), why: String(d?.why ?? "기타").slice(0, 8) })),
    }));
    return json({ items: out, model: OPENAI_MODEL });
  } catch (e) { return json({ error: (e as Error).message }, 502); }
});
