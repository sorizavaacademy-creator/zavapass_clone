// 2026-11-02 클론(ZAVAPASS-clone) 전용: 기업 맞춤 면접의 AI 면접관 프롬프트 조각
// followup-question·grade-answer Edge Function이 함께 씀. 운영 프로젝트에는 배포하지 않음
//
// 브라우저에서는 company_id와 질문 번호(seq)만 받고, 회사 자료는 서버가 DB(get_company_pack)에서 직접 읽음
//  → 브라우저가 보낸 글을 그대로 프롬프트에 넣지 않아서, 화면을 조작해 회사 자료를 바꿔 넣을 수 없음
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export type CompanyPack = {
  talent: {
    id: string; name: string; category: string; talent_type: string | null;
    keywords: string[]; keyword_meanings: string[]; summary: string | null; themes: string[];
    verify_status: '확인' | '부분확인' | '미확인'; reference_only: boolean; merge_planned: boolean; needs_review: boolean;
  };
  process: {
    sheet_name: string; provide_level: '제공' | '일부 제공' | '미제공'; stages: string | null; interview_types: string[];
    detail: string | null; base_posting: string | null; posted_month: string | null;
    group_common: boolean; secondary_source: boolean;
  } | null;
  questions: { seq: number; question: string; linked_talent: string | null; eval_point: string | null; basis: string }[];
  // 2026-11-09 한림대 권역 18개 기관 면접 DB: 실제 지원자 후기를 숫자로 모은 요약 (원문 없음)
  reviews?: { reviews: number; recent: number; questions: number; year_from: number | null; year_to: number | null;
    formats: [string, number][]; difficulty: [string, number][]; result: Record<string, number>; announce_days: number | null;
    qtypes: [string, number][]; often: string[]; data_date?: string } | null;
};

const ID_RE = /^(G\d{1,2}-\d{2,3}|H\d-\d{2})$/;   // 2026-11-09 의료기관(H1-01 한림대학교의료원 등)도 읽음

/** 로그인한 사용자의 권한(JWT)으로 읽음. 없는 ID·형식이 틀린 ID는 null → 일반 면접으로 진행 */
export async function loadCompanyPack(sb: SupabaseClient, companyId: unknown): Promise<CompanyPack | null> {
  if (typeof companyId !== 'string' || !ID_RE.test(companyId)) return null;
  const { data, error } = await sb.rpc('get_company_pack', { p_id: companyId });
  if (error || !data || !data.talent) return null;
  return data as CompanyPack;
}

// 엑셀 칸 안의 줄바꿈은 한 줄로 펴고, 너무 긴 글은 자름
const flat = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const cut = (s: string | null | undefined, n: number) => { const t = flat(s); return t.length > n ? t.slice(0, n) + '…' : t; };
// '키워드별 뜻'이 "Passion 열정: 미래를…"처럼 키워드로 시작하면 그 부분은 빼고 뜻만 남김
const meaning = (k: string, m: string | undefined) => { const t = flat(m); return t.startsWith(k) ? t.slice(k.length).replace(/^\s*[:：\-–]\s*/, '') : t; };

/**
 * 시스템 프롬프트 앞에 붙일 '기업 맞춤' 단락.
 * mode: 'followup'(꼬리질문) | 'grade'(채점·피드백), seq: 지금 질문이 이 회사 예상 질문 몇 번인지(아니면 생략)
 */
export function buildCompanyBlock(pack: CompanyPack, mode: 'followup' | 'grade', seq?: number): string {
  const t = pack.talent, p = pack.process;
  const L: string[] = [];

  L.push(`너는 ${t.name}의 채용 면접관이다.`);

  // ① 인재상 — 확인 상태에 따라 얼마나 단정할지 정함
  if (t.verify_status === '미확인' || !t.keywords.length) {
    L.push(`이 회사의 공식 인재상은 확인되지 않았다. 회사 고유의 인재상·가치를 지어내거나 단정하지 말고, 직무 이해·협업·문제 해결·책임감·성장·지원 동기 같은 일반 역량으로 판단해라.`);
  } else {
    const kw = t.keywords.map((k, i) => { const m = meaning(k, t.keyword_meanings[i]); return m ? `${flat(k)}(${cut(m, 60)})` : flat(k); }).join(', ');
    L.push(`이 회사의 인재상(${flat(t.talent_type) || '인재상'})은 ${kw}이다.${t.summary ? ' 요약: ' + cut(t.summary, 120) : ''}`);
    if (t.verify_status === '부분확인') L.push(`이 인재상은 그룹 공통이거나 2차 출처일 수 있으니, 지원자에게 "${t.name}의 고유 기준"이라고 단정해서 말하지 마라.`);
  }

  // ② 평가 포인트 — 지금 질문이 이 회사 예상 질문이면 그 문항의 연결 인재상·평가포인트를 씀
  const q = seq ? pack.questions.find((x) => x.seq === seq) : undefined;
  if (q) {
    L.push(`이 질문의 핵심 평가 포인트는 "${cut(q.eval_point, 120)}"이고, 근거가 된 인재상은 "${cut(q.linked_talent, 60)}"이다.`);
  } else if (t.verify_status !== '미확인' && t.keywords.length) {
    L.push(`핵심 평가 포인트는 위 인재상 키워드가 지원자의 실제 행동·경험으로 드러나는지다.`);
  }

  // ③ 공식 면접 전형 — 제공 수준에 따라 스타일만 반영. 미제공이면 지어내지 않음
  if (p && p.provide_level !== '미제공' && p.stages) {
    const types = p.interview_types.length ? ` 면접 유형: ${p.interview_types.join(', ')}.` : '';
    L.push(`공식 면접 전형은 "${cut(p.stages, 140)}"이다.${types}${p.detail ? ' 세부: ' + cut(p.detail, 180) : ''}`);
    if (p.provide_level === '일부 제공' || p.group_common || p.secondary_source) L.push(`이 전형 정보는 일부만 공개됐거나 그룹 공통·2차 출처라, 실제와 다를 수 있다. 전형 이름을 지원자에게 사실처럼 단정하지 마라.`);
  } else {
    L.push(`이 회사의 공식 면접 방식은 확인되지 않았다. 일반적인 인성·직무 면접 방식으로 진행해라.`);
  }

  // ④ 2026-11-09 실제 지원자 후기 요약 — 면접 분위기·자주 묻는 흐름만 참고 (후기는 기억에 기반해 사실과 다를 수 있음)
  const r = pack.reviews;
  if (r && r.reviews >= 5) {
    const fm = (r.formats || []).filter(([k]) => !/서류|필기|인\/적성|인적성|기타/.test(k)).slice(0, 3).map(([k]) => k).join(', ');
    const df = (r.difficulty || [])[0]?.[0];
    L.push(`이 기관 면접 후기 ${r.reviews}건(${r.year_from ?? '?'}~${r.year_to ?? '?'}년)을 보면${fm ? ` 면접은 주로 ${fm} 형태였고` : ''}${df ? ` 난이도는 '${df}'가 가장 많았다` : ''}. 지원자 기억에 기반한 요약이니 사실처럼 단정해서 말하지 말고, 질문 방식과 분위기를 맞추는 데만 참고해라.`);
    if (mode === 'followup' && (r.often || []).length) L.push(`후기에서 여러 번 나온 질문 흐름(참고만, 그대로 읽지 말 것): ${r.often.slice(0, 4).map((x) => cut(x, 50)).join(' / ')}`);
  }

  // 공통 안전 규칙
  L.push(`예상 질문은 면접 연습용으로 자체 작성한 것이고 실제 기출이 아니다. "이 회사가 실제로 묻는 질문", "기출"이라고 말하지 마라.`);
  L.push(`지원자 답변에 없는 경험·수치·회사 정보를 지어내지 말고, 다른 회사·계열사 정보로 바꿔 말하지 마라.`);

  if (mode === 'followup') {
    L.push(`지원자의 답변을 위 인재상과 평가 기준에 비추어 분석하고, 면접 전형 스타일에 맞는 꼬리 질문을 하나만 해라. 인재상 키워드를 그대로 읽어 주지 말고, 그 키워드가 드러날 행동·판단·결과를 묻는 질문으로 바꿔라.`);
  } else {
    L.push(`피드백에서 인재상과 맞닿은 강점·부족한 점을 각각 구체적으로 짚되, 점수는 답변 내용(구체성·논리·직무 연결)으로 매기고 회사 이름이나 키워드를 말했다는 이유만으로 점수를 올리지 마라.`);
  }
  return L.join('\n');
}
