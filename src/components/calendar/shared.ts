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

/** 태스크 우선순위/종류에 따른 색상 */
export function itemColor(item: CalendarItem): string {
  if (item.kind === "event") return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
  if (item.status === "done")
    return "bg-muted text-muted-foreground line-through";
  return (
    {
      3: "bg-red-500/15 text-red-700 dark:text-red-300",
      2: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      1: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    }[item.priority] ?? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
  );
}

export function itemDotColor(item: CalendarItem): string {
  if (item.kind === "event") return "bg-sky-500";
  if (item.status === "done") return "bg-muted-foreground/40";
  return (
    { 3: "bg-red-500", 2: "bg-amber-500", 1: "bg-blue-500" }[item.priority] ??
    "bg-emerald-500"
  );
}
