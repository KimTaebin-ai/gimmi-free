/**
 * 저장된 요약들 → "새로 할 수 있게 된 것"의 월별 타임라인 — 순수 함수라 테스트 대상이다.
 *
 * 요약은 90일 창을 훑기 때문에 여러 번 만들면 **기간이 겹친다.** 8월에 만든 요약과
 * 9월에 만든 요약이 같은 7월의 능력을 각각 이야기하는 식이다. 그대로 쌓으면 같은 능력이
 * 여러 번 나오므로, 달과 제목이 같으면 하나로 본다.
 *
 * 겹칠 때 **나중에 만든 요약을 남긴다.** 기록이 더 쌓인 뒤에 내린 판단이 더 정확하고,
 * 사용자가 방금 "다시 정리"를 눌렀다면 그 결과가 화면에 보여야 하기 때문이다.
 */

import type { GainedCapability, MonthlyCapabilities } from "@/lib/growth-types";

/** 타임라인을 만들 때 필요한 요약의 최소 형태 */
export interface SummaryForTimeline {
  content: { gained?: GainedCapability[] } | null;
  periodEnd: Date;
  createdAt: Date;
}

/** "2026-07" */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "2026-07" → "2026년 7월" */
export function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  return `${year}년 ${Number(month)}월`;
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** 같은 능력인지 — 띄어쓰기·대소문자·문장부호 차이는 무시한다 */
function titleKey(title: string): string {
  return title.toLowerCase().replace(/[\s.,!?·]/g, "");
}

/**
 * 요약들에서 능력을 모아 월별로 묶는다.
 *
 * `month`가 없거나 모양이 이상한 항목은 그 요약이 다룬 기간의 끝 달로 돌린다 —
 * 이 필드가 생기기 전에 만든 요약도 타임라인에 나와야 하기 때문이다.
 */
export function buildMonthlyTimeline(summaries: SummaryForTimeline[]): MonthlyCapabilities[] {
  // 나중에 만든 요약이 이기도록 오래된 것부터 넣는다(뒤에 넣는 쪽이 덮어쓴다)
  const ordered = [...summaries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byMonth = new Map<string, Map<string, GainedCapability>>();

  for (const summary of ordered) {
    const fallback = monthKey(summary.periodEnd);

    for (const capability of summary.content?.gained ?? []) {
      const month = MONTH_PATTERN.test(capability.month ?? "") ? capability.month : fallback;
      const slot = byMonth.get(month) ?? new Map<string, GainedCapability>();
      slot.set(titleKey(capability.title), { ...capability, month });
      byMonth.set(month, slot);
    }
  }

  return [...byMonth.entries()]
    .map(([month, capabilities]) => ({ month, capabilities: [...capabilities.values()] }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** 타임라인 전체에서 능력이 몇 개인지 */
export function countCapabilities(timeline: MonthlyCapabilities[]): number {
  return timeline.reduce((n, m) => n + m.capabilities.length, 0);
}
