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
  // 오래된 것부터 넣어 나중 요약이 앞의 것을 통째로 덮어쓰게 한다
  const ordered = [...summaries].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const byMonth = new Map<string, { at: number; items: Map<string, GainedCapability> }>();

  for (const summary of ordered) {
    const fallback = monthKey(summary.periodEnd);
    const at = summary.createdAt.getTime();

    for (const capability of summary.content?.gained ?? []) {
      const month = MONTH_PATTERN.test(capability.month ?? "") ? capability.month : fallback;

      const slot = byMonth.get(month);
      // 다른(더 이른) 요약이 채워 둔 달이면 통째로 비우고 이 요약 것으로 바꾼다
      if (!slot || slot.at < at) {
        byMonth.set(month, { at, items: new Map([[titleKey(capability.title), { ...capability, month }]]) });
        continue;
      }
      // 같은 요약 안에서 모델이 같은 말을 되풀이한 경우만 합친다
      slot.items.set(titleKey(capability.title), { ...capability, month });
    }
  }

  return [...byMonth.entries()]
    .map(([month, slot]) => ({ month, capabilities: [...slot.items.values()] }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

/** 타임라인 전체에서 능력이 몇 개인지 */
export function countCapabilities(timeline: MonthlyCapabilities[]): number {
  return timeline.reduce((n, m) => n + m.capabilities.length, 0);
}

/**
 * 능력 목록을 달별로 묶는다(요약 하나짜리 버전).
 *
 * 여러 요약을 겹치는 `buildMonthlyTimeline`과 달리 이건 이미 고른 한 벌을 나누기만 한다.
 * 지난 정리를 펼쳐 볼 때처럼 "이 요약이 본 것"만 달별로 보여 줘야 하는 자리에서 쓴다.
 */
export function groupByMonth(
  capabilities: GainedCapability[],
  fallbackMonth: string,
): MonthlyCapabilities[] {
  const byMonth = new Map<string, GainedCapability[]>();

  for (const c of capabilities) {
    const month = MONTH_PATTERN.test(c.month ?? "") ? c.month : fallbackMonth;
    byMonth.set(month, [...(byMonth.get(month) ?? []), { ...c, month }]);
  }

  return [...byMonth.entries()]
    .map(([month, items]) => ({ month, capabilities: items }))
    .sort((a, b) => b.month.localeCompare(a.month));
}
