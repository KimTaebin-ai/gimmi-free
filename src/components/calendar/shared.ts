import { startOfDay } from "date-fns";
import { dayKey, eventDayKeys } from "@/lib/calendar-utils";
import { taskColorVar } from "@/lib/task-colors";
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
 * 캘린더에 보이는 모든 아이템에 식별 색을 배정한다 — 내 태스크든 Google 일정이든.
 * Google 일정도 중요한 정보이므로 색을 죽이지 않는다.
 *
 * 시작 시각 순으로 팔레트를 돌려 쓰므로 시간상 이웃한 항목은 항상 다른 색이 된다.
 * 태스크와 일정을 한 줄에 세워 번호를 매기기 때문에 둘 사이에서도 색이 겹치지 않는다.
 * 종류 구분은 색이 아니라 아이콘이 맡는다(태스크=우선순위 깃발, 일정=캘린더 아이콘).
 */
export type ColorIndex = Map<string, number>;

/** 같은 아이템을 두 뷰에서 같은 색으로 그리기 위한 키 */
export function itemKey(item: CalendarItem): string {
  return `${item.kind}:${item.id}`;
}

export function buildColorIndex(items: CalendarItem[]): ColorIndex {
  const sorted = [...items].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime() || itemKey(a).localeCompare(itemKey(b)),
  );
  return new Map(sorted.map((it, i) => [itemKey(it), i]));
}

export interface ItemAppearance {
  className: string;
  /** 식별 색 (CSS 변수). 완료된 태스크만 색 없이 흐리게 처리한다. */
  color?: string;
}

export function itemAppearance(
  item: CalendarItem,
  colorIndex?: ColorIndex,
): ItemAppearance {
  if (item.kind === "task" && item.status === "done") {
    return { className: "bg-muted text-muted-foreground line-through opacity-70" };
  }
  return {
    className: "text-foreground",
    color: taskColorVar(colorIndex?.get(itemKey(item)) ?? 0),
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

/** 목록(아젠다) 뷰의 점 — 태스크·일정 모두 식별 색을 쓴다 */
export function itemDotStyle(
  item: CalendarItem,
  colorIndex?: ColorIndex,
): { className: string; color?: string } {
  if (item.kind === "task" && item.status === "done")
    return { className: "bg-muted-foreground/30" };
  return { className: "", color: taskColorVar(colorIndex?.get(itemKey(item)) ?? 0) };
}

/** 여러 날에 걸친 아이템인지 */
export function isMultiDay(item: CalendarItem): boolean {
  return eventDayKeys(item).length > 1;
}
