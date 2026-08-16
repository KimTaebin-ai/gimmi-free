import { Flag } from "lucide-react";

/**
 * 목록에서 각 태스크를 눈으로 구분하기 위한 색.
 *
 * 색은 "어떤 태스크인지"(identity)만 나타내며 우선순위/중요도와 무관하다.
 * 우선순위는 깃발 아이콘이 따로 표시한다 — 색에 두 가지 의미를 겹치면
 * 같은 우선순위끼리 전부 같은 색이 되어 오히려 구분이 안 된다.
 *
 * 화면에 보이는 순서대로 팔레트를 돌려 쓰므로 **위아래 행은 항상 다른 색**이 된다.
 * (해시로 배정하면 인접한 두 항목이 같은 색이 될 수 있어 구분 목적에 어긋난다.)
 */
export const TASK_COLOR_COUNT = 8;

export function taskColorVar(index: number): string {
  return `var(--task-${(index % TASK_COLOR_COUNT) + 1})`;
}

/**
 * 그룹 안에서 순서를 바꾼 결과를 전체 목록 순서에 반영한다.
 * 그룹에 속한 자리(슬롯)는 그대로 두고 그 자리들만 새 순서로 채운다 —
 * 다른 날짜 그룹의 태스크 위치는 건드리지 않는다.
 */
export function applyScopedReorder(
  allIds: string[],
  scopeIds: string[],
  from: number,
  to: number,
): string[] {
  if (from < 0 || to < 0 || from >= scopeIds.length || to >= scopeIds.length) {
    return allIds;
  }
  const moved = [...scopeIds];
  moved.splice(to, 0, ...moved.splice(from, 1));

  const scope = new Set(scopeIds);
  const next = [...allIds];
  let i = 0;
  for (let slot = 0; slot < next.length; slot++) {
    if (scope.has(next[slot])) next[slot] = moved[i++];
  }
  return next;
}

export interface PriorityStyle {
  label: string;
  /** 0(없음)이면 아이콘을 그리지 않는다 */
  icon: typeof Flag | null;
  className: string;
}

export const PRIORITY_STYLES: Record<number, PriorityStyle> = {
  3: { label: "높음", icon: Flag, className: "text-red-500 fill-red-500" },
  2: { label: "중간", icon: Flag, className: "text-amber-500 fill-amber-500" },
  1: { label: "낮음", icon: Flag, className: "text-blue-500 fill-blue-500" },
  0: { label: "없음", icon: null, className: "" },
};
