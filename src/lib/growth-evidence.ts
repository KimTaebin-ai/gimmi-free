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
  /**
   * 본인이 직접 쓴 긴 글(지금은 블로그 본문).
   *
   * 요약(`note`)과 나누는 이유는 세기가 다르기 때문이다. 200자 요약은 "이런 걸 썼구나"까지지만,
   * 본문은 무엇을 어떻게 이해했는지가 문장으로 남아 있어 성장 판정의 근거가 된다.
   */
  body: string | null;
  entries: EntryForPrompt[];
  /**
   * 이 근거가 가리키는 실제 항목.
   *
   * 프롬프트에는 안 쓰이지만 화면에는 필요하다 — "근거가 약한 항목"을 보여 주고
   * 거기에 바로 메모를 붙이려면 무엇에 붙일지 알아야 하기 때문.
   */
  ref: SourceRef | null;
}

export type SourceRef =
  | { type: "task"; id: string }
  | { type: "event"; googleEventId: string }
  | { type: "blog"; logNo: string };

export const ORIGIN_LABEL: Record<SourceForPrompt["origin"], string> = {
  task: "[태스크]",
  event: "[일정]",
  blog: "[블로그 글]",
};

/** 제목만 있고 아무 내용도 없는 항목 — 모델이 단정하지 않도록 표시해 준다 */
export function isWeakEvidence(s: SourceForPrompt): boolean {
  return s.entries.length === 0 && !s.note && !s.body;
}

/**
 * 근거의 세기. 본인이 남긴 글이 많을수록 세다.
 *
 * 점수 배분의 근거:
 *  - **기록(10점)** — 태스크·일정에 직접 남긴 메모/스크립트/느낀 점. 가장 직접적인 증거다.
 *  - **본문(6점)** — 발행한 블로그 글 전문. 남에게 설명할 수 있을 만큼 정리했다는 신호라
 *    무게가 크다. 다만 기록만큼 그 활동에 밀착돼 있지는 않아 한 단계 아래에 둔다.
 *  - **요약(1점)** — 한 줄 메모나 일정 설명. 있다는 것 정도의 의미.
 *
 * 본문을 따로 세는 게 중요하다. 예전에는 블로그 글도 요약만 있어 1점이었는데, 그러면
 * 두 달치를 정리한 회고 글이 "Flight to 서울" 같은 일정과 같은 순위가 되어 프롬프트
 * 뒤쪽으로 밀렸다. 실제로 그렇게 밀리고 있었다.
 */
export function evidenceStrength(s: SourceForPrompt): number {
  return s.entries.length * 10 + (s.body ? 6 : 0) + (s.note ? 1 : 0);
}

/** 강한 근거가 프롬프트 앞쪽에 오도록 정렬 */
export function sortByEvidence(sources: SourceForPrompt[]): SourceForPrompt[] {
  return [...sources].sort((a, b) => evidenceStrength(b) - evidenceStrength(a));
}
