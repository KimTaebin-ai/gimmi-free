import { addDays, endOfDay, format, startOfDay } from "date-fns";
import type { DateWindow, TaskFilter } from "@/lib/task-types";

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

// '전체'가 기본 진입 화면이라 맨 위에 둔다(전체 조망 → 좁혀 보기 순서)
export const SMART_LISTS: { key: SmartListKey; label: string }[] = [
  { key: "all", label: "전체" },
  { key: "today", label: "오늘" },
  { key: "tomorrow", label: "내일" },
  { key: "next7", label: "다음 7일" },
  { key: "unscheduled", label: "예정 없음" },
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

/** 로컬 날짜 구간 → 시각/달력날짜 두 기준을 함께 담은 창 */
function windowFor(from: Date, to: Date): DateWindow {
  return {
    start: startOfDay(from).toISOString(),
    end: endOfDay(to).toISOString(),
    dateFrom: format(from, "yyyy-MM-dd"),
    dateTo: format(to, "yyyy-MM-dd"),
  };
}

export function filterForSelection(sel: ListSelection, now = new Date()): TaskFilter {
  if (sel.type === "project") return { kind: "project", projectId: sel.id };
  if (sel.type === "tag") return { kind: "tag", tagId: sel.id };
  switch (sel.key) {
    case "today":
      return { kind: "today", ...windowFor(now, now) };
    case "tomorrow":
      return { kind: "range", ...windowFor(addDays(now, 1), addDays(now, 1)) };
    case "next7":
      return { kind: "range", ...windowFor(now, addDays(now, 6)) };
    case "unscheduled":
      return { kind: "unscheduled" };
    case "all":
      return { kind: "all" };
    case "done":
      return { kind: "done" };
  }
}
