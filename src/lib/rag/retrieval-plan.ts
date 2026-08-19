/**
 * 성장 요약이 무엇을 검색할지 정하는 규칙 — 순수 함수라 테스트 대상이다.
 *
 * 성장 요약에는 사용자가 입력하는 "질문"이 없다. 화면은 그냥 "정리해 줘" 버튼 하나다.
 * 그래서 검색어를 우리가 만들어야 한다. 두 갈래를 섞는다.
 *
 *  1. **고정 탐침** — "새로 할 수 있게 된 것" 같은, 성장이라는 주제 자체를 겨냥한 문장.
 *  2. **그 기간에 실제로 한 일** — 태스크 제목·태그. 이게 없으면 검색이 늘 같은 자리만
 *     퍼올린다. 이번 분기에 강화학습을 했다면 강화학습 이야기가 실린 대목이 나와야 한다.
 *
 * 탐침마다 따로 검색하고 결과를 합치는 이유는, 한 문장으로 뭉뚱그리면 벡터가 평균으로
 * 뭉개져서 어느 주제와도 어중간하게 가까운 청크만 올라오기 때문이다.
 */

import type { RetrievedChunk } from "@/lib/rag/search";

/** 주제와 무관하게 늘 던지는 탐침 */
export const GROWTH_PROBES = [
  "이전에는 할 수 없었는데 새로 할 수 있게 된 것",
  "어려웠던 문제를 붙잡고 해결해 낸 과정",
  "공부해서 이해하게 된 개념과 그 이유",
  "직접 만들거나 완성해서 결과를 낸 것",
] as const;

/** 기간 안에 한 일에서 뽑아 쓸 탐침의 최대 개수 */
const MAX_ACTIVITY_PROBES = 6;
/** 이보다 짧은 제목은 탐침으로 쓸모가 없다("메모", "정리" 같은 것) */
const MIN_PROBE_CHARS = 4;

/**
 * 검색에 쓸 탐침 목록.
 *
 * 활동 제목은 중복을 지우고 긴 것부터 쓴다 — 긴 제목일수록 구체적이고,
 * 구체적인 문장이 임베딩 검색에서 더 또렷하게 걸린다.
 */
export function buildProbes(activityTitles: string[]): string[] {
  const seen = new Set<string>();
  const activities: string[] = [];

  for (const title of [...activityTitles].sort((a, b) => b.length - a.length)) {
    const t = title.trim();
    const key = t.toLowerCase();
    if (t.length < MIN_PROBE_CHARS || seen.has(key)) continue;
    seen.add(key);
    activities.push(t);
    if (activities.length >= MAX_ACTIVITY_PROBES) break;
  }

  return [...GROWTH_PROBES, ...activities];
}

/**
 * 탐침별 검색 결과를 하나로 합친다.
 *
 * 같은 청크가 여러 탐침에 걸리는 건 흔한 일이고, 그건 오히려 그 대목이 중요하다는 뜻이다.
 * 그래서 버리지 않고 **가장 높은 점수**를 남긴 뒤 점수순으로 자른다.
 */
export function mergeHits(results: RetrievedChunk[][], cap: number): RetrievedChunk[] {
  const best = new Map<string, RetrievedChunk>();

  for (const hit of results.flat()) {
    const key = `${hit.url} ${hit.text}`;
    const prev = best.get(key);
    if (!prev || hit.score > prev.score) best.set(key, hit);
  }

  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, cap);
}

/**
 * 기간 밖 글이 발췌를 뒤덮지 않게 조절한다.
 *
 * 검색을 기간으로 자르지 않는 대신(두 달에 한 편 쓰면 기간 안에 한 편밖에 없다),
 * 예전 글이 점수만 높으면 발췌를 통째로 차지할 수 있다. 실제로 24건 중 19건이
 * 기간 밖 글에서 나왔다.
 *
 * 기간 안 대목을 먼저 채우고, 남은 자리에만 기간 밖 대목을 넣되 그마저 상한을 둔다.
 * 기간 밖 글은 "이건 예전부터 하던 것"을 가려내는 조연이지 주연이 아니기 때문이다.
 * 각 그룹 안에서는 점수 순서를 그대로 지킨다.
 */
export function balanceByPeriod(
  hits: RetrievedChunk[],
  periodStart: Date,
  opts: { total: number; maxOutside: number },
): RetrievedChunk[] {
  const inside = hits.filter((h) => h.occurredAt >= periodStart);
  const outside = hits.filter((h) => h.occurredAt < periodStart);

  const kept = inside.slice(0, opts.total);
  const room = Math.min(opts.total - kept.length, opts.maxOutside);

  // 최종 순서도 점수순으로 — 프롬프트 앞쪽에 강한 근거가 오도록
  return [...kept, ...outside.slice(0, Math.max(0, room))].sort((a, b) => b.score - a.score);
}
