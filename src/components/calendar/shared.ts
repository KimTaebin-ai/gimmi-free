import { startOfDay } from "date-fns";
import { dayKey, eventDayKeys } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/lib/calendar-types";

export type CalendarViewMode = "month" | "week" | "day" | "agenda";

export const VIEW_LABELS: { value: CalendarViewMode; label: string }[] = [
  { value: "month", label: "월" },
  { value: "week", label: "주" },
  { value: "day", label: "일" },
  { value: "agenda", label: "목록" },
];

/** 날짜키 → 그 날에 걸친 아이템들 */
export function groupItemsByDay(items: CalendarItem[]): Map<string, CalendarItem[]> {
  const map = new Map<string, CalendarItem[]>();
  for (const item of items) {
    for (const key of eventDayKeys(item)) {
      const list = map.get(key);
      if (list) list.push(item);
      else map.set(key, [item]);
    }
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return a.startAt.getTime() - b.startAt.getTime();
    });
  }
  return map;
}

export function itemsForDay(
  grouped: Map<string, CalendarItem[]>,
  date: Date,
): CalendarItem[] {
  return grouped.get(dayKey(startOfDay(date))) ?? [];
}

/**
 * 캘린더에서 색은 **우선순위**를 뜻한다(목록 화면의 식별 색과 다른 규칙).
 * 캘린더는 "지금 무엇이 급한가"를 훑는 화면이라 색을 우선순위에 쓰는 편이 읽기 쉽다.
 *
 * Google 일정 중 **시간이 정해진 것**은 무조건 높음으로 본다 —
 * 시각이 박힌 수업·미팅은 반드시 지켜야 하는 약속이기 때문.
 * 종일 일정은 특정 시각 구속이 없으므로 우선순위를 매기지 않는다.
 */
export function effectivePriority(item: CalendarItem): number {
  if (item.kind === "task") return item.priority;
  return item.allDay ? 0 : 3;
}

const PRIORITY_COLOR_VAR: Record<number, string> = {
  3: "var(--priority-high)",
  2: "var(--priority-mid)",
  1: "var(--priority-low)",
  0: "var(--priority-none)",
};

export interface ItemAppearance {
  className: string;
  /** 왼쪽 띠 색 (우선순위) */
  barColor: string;
  /** 여러 날에 걸친 항목만 옅은 배경을 깔아 띠가 이어지는 걸 보이게 한다 */
  tint: boolean;
}

export function itemAppearance(item: CalendarItem): ItemAppearance {
  const done = item.kind === "task" && item.status === "done";
  return {
    className: done
      ? "text-muted-foreground line-through opacity-60"
      : "text-foreground",
    barColor: done
      ? "var(--priority-none)"
      : (PRIORITY_COLOR_VAR[effectivePriority(item)] ?? PRIORITY_COLOR_VAR[0]),
    // 하루짜리는 배경 없이 왼쪽 띠만 — 화면이 색으로 뒤덮이지 않도록
    tint: isMultiDay(item) || item.allDay,
  };
}

/** 그리드 안에서 아이템이 차지하는 연속 구간 + 겹침을 피한 레인 번호 */
export interface ItemSpan {
  item: CalendarItem;
  startIdx: number;
  endIdx: number;
  lane: number;
  /** 실제 시작/종료일이 그리드 밖이면 false — 바를 잘린 모양으로 그린다 */
  startsInGrid: boolean;
  endsInGrid: boolean;
}

/**
 * 날짜 그리드(days)에 아이템들을 배치한다.
 * 여러 날에 걸친 아이템이 같은 높이(lane)로 이어지도록 레인은 전역으로 한 번만 정한다.
 */
export function layoutSpans(items: CalendarItem[], days: Date[]): ItemSpan[] {
  const indexOfKey = new Map<string, number>();
  days.forEach((d, i) => indexOfKey.set(dayKey(startOfDay(d)), i));

  const raw = items
    .map((item) => {
      const keys = eventDayKeys(item);
      const indices = keys
        .map((k) => indexOfKey.get(k))
        .filter((i): i is number => i !== undefined);
      if (indices.length === 0) return null;
      return {
        item,
        startIdx: Math.min(...indices),
        endIdx: Math.max(...indices),
        startsInGrid: indexOfKey.has(keys[0]),
        endsInGrid: indexOfKey.has(keys[keys.length - 1]),
      };
    })
    .filter((s): s is Omit<ItemSpan, "lane"> => s !== null);

  // 긴 일정이 위쪽 레인을 차지하도록 정렬 (시작 빠른 순 → 긴 순 → 종일 우선)
  raw.sort((a, b) => {
    if (a.startIdx !== b.startIdx) return a.startIdx - b.startIdx;
    const lenA = a.endIdx - a.startIdx;
    const lenB = b.endIdx - b.startIdx;
    if (lenA !== lenB) return lenB - lenA;
    if (a.item.allDay !== b.item.allDay) return a.item.allDay ? -1 : 1;
    return a.item.startAt.getTime() - b.item.startAt.getTime();
  });

  const laneEnds: number[] = []; // 각 레인이 점유된 마지막 인덱스
  return raw.map((s) => {
    let lane = laneEnds.findIndex((end) => end < s.startIdx);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(s.endIdx);
    } else {
      laneEnds[lane] = s.endIdx;
    }
    return { ...s, lane };
  });
}

/** 한 주(7칸) 안에서 그릴 바 조각 */
export interface WeekSegment {
  item: CalendarItem;
  lane: number;
  colStart: number; // 0-6
  colSpan: number;
  /** 이 조각에 실제 시작일이 포함되는지 (제목/둥근 모서리 판단) */
  isStart: boolean;
  isEnd: boolean;
}

export function weekSegments(spans: ItemSpan[], weekIndex: number): WeekSegment[] {
  const first = weekIndex * 7;
  const last = first + 6;
  const out: WeekSegment[] = [];
  for (const s of spans) {
    if (s.endIdx < first || s.startIdx > last) continue;
    const from = Math.max(s.startIdx, first);
    const to = Math.min(s.endIdx, last);
    out.push({
      item: s.item,
      lane: s.lane,
      colStart: from - first,
      colSpan: to - from + 1,
      isStart: from === s.startIdx && s.startsInGrid,
      isEnd: to === s.endIdx && s.endsInGrid,
    });
  }
  return out;
}

/** 목록(아젠다) 뷰의 점 — 우선순위 색 */
export function itemDotStyle(item: CalendarItem): { color: string } {
  return { color: itemAppearance(item).barColor };
}

/** 여러 날에 걸친 아이템인지 */
export function isMultiDay(item: CalendarItem): boolean {
  return eventDayKeys(item).length > 1;
}
