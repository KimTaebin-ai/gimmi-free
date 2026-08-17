/**
 * 성장 요약에 넣을 "근거"의 형태와 세기 판정 — 순수 함수라 서버 밖에서도 쓴다.
 *
 * 태스크·Google 일정·블로그 글을 하나의 모양으로 다룬다. 셋 다 성장의 근거가 되고,
 * 블로그 글은 "그 주제를 설명할 수 있게 됐다"는 뜻이라 특히 무게가 있다.
 */

export interface EntryForPrompt {
  kind: string;
  title: string | null;
  content: string;
}

export interface SourceForPrompt {
  origin: "task" | "event" | "blog";
  title: string;
  at: Date | null;
  /** 태스크의 리스트 / 블로그 카테고리 */
  project: string | null;
  tags: string[];
  /** 태스크 한 줄 메모 / 일정 설명 / 블로그 글 요약 */
  note: string | null;
  entries: EntryForPrompt[];
}

export const ORIGIN_LABEL: Record<SourceForPrompt["origin"], string> = {
  task: "[태스크]",
  event: "[일정]",
  blog: "[블로그 글]",
};

/** 제목만 있고 아무 내용도 없는 항목 — 모델이 단정하지 않도록 표시해 준다 */
export function isWeakEvidence(s: SourceForPrompt): boolean {
  return s.entries.length === 0 && !s.note;
}

/**
 * 근거의 세기. 기록(메모/스크립트/느낀 점)이 붙은 항목이 가장 강하고,
 * 요약이라도 있는 항목이 그다음, 제목만 있는 항목이 가장 약하다.
 */
export function evidenceStrength(s: SourceForPrompt): number {
  return s.entries.length * 10 + (s.note ? 1 : 0);
}

/** 강한 근거가 프롬프트 앞쪽에 오도록 정렬 */
export function sortByEvidence(sources: SourceForPrompt[]): SourceForPrompt[] {
  return [...sources].sort((a, b) => evidenceStrength(b) - evidenceStrength(a));
}
