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

export function filterForSelection(sel: ListSelection, now = new Date()): TaskFilter {
  if (sel.type === "project") return { kind: "project", projectId: sel.id };
  if (sel.type === "tag") return { kind: "tag", tagId: sel.id };
  switch (sel.key) {
    case "today":
      return { kind: "today", end: endOfDay(now).toISOString() };
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
