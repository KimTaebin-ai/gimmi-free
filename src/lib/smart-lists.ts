import { addDays, endOfDay, startOfDay } from "date-fns";
import type { TaskFilter } from "@/lib/task-types";

export type SmartListKey =
  | "today"
  | "tomorrow"
  | "next7"
  | "unscheduled"
  | "all"
  | "done";

export type ListSelection =
  | { type: "smart"; key: SmartListKey }
  | { type: "project"; id: string }
  | { type: "tag"; id: string };

export const SMART_LISTS: { key: SmartListKey; label: string }[] = [
  { key: "today", label: "오늘" },
  { key: "tomorrow", label: "내일" },
  { key: "next7", label: "다음 7일" },
  { key: "unscheduled", label: "예정 없음" },
  { key: "all", label: "전체" },
  { key: "done", label: "완료됨" },
];

/**
 * 날짜 기반 리스트의 조회 구간. Google 일정을 같이 보여줄 때 쓴다.
 * 날짜와 무관한 리스트(전체/리스트별/태그별 등)는 null.
 */
export function dateRangeForSelection(
  sel: ListSelection,
  now = new Date(),
): { from: Date; to: Date } | null {
  if (sel.type !== "smart") return null;
  switch (sel.key) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "tomorrow":
      return { from: startOfDay(addDays(now, 1)), to: endOfDay(addDays(now, 1)) };
    case "next7":
      return { from: startOfDay(now), to: endOfDay(addDays(now, 6)) };
    default:
      return null;
  }
}

export function filterForSelection(sel: ListSelection, now = new Date()): TaskFilter {
  if (sel.type === "project") return { kind: "project", projectId: sel.id };
  if (sel.type === "tag") return { kind: "tag", tagId: sel.id };
  switch (sel.key) {
    case "today":
      return {
        kind: "today",
        start: startOfDay(now).toISOString(),
        end: endOfDay(now).toISOString(),
      };
    case "tomorrow":
      return {
        kind: "range",
        from: startOfDay(addDays(now, 1)).toISOString(),
        to: endOfDay(addDays(now, 1)).toISOString(),
      };
    case "next7":
      return {
        kind: "range",
        from: startOfDay(now).toISOString(),
        to: endOfDay(addDays(now, 6)).toISOString(),
      };
    case "unscheduled":
      return { kind: "unscheduled" };
    case "all":
      return { kind: "all" };
    case "done":
      return { kind: "done" };
  }
}
