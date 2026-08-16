import { describe, expect, it } from "vitest";
import { effectivePriority, itemAppearance, itemDotStyle } from "./shared";
import type { CalendarItem } from "@/lib/calendar-types";

function task(
  id: string,
  priority: number,
  opts: { allDay?: boolean; days?: number; status?: string } = {},
): CalendarItem {
  const { allDay = false, days = 1, status = "todo" } = opts;
  return {
    kind: "task",
    id,
    title: id,
    startAt: new Date(2026, 7, 18, 10, 0),
    endAt: new Date(2026, 7, 18 + (days - 1), 11, 0),
    allDay,
    priority,
    status,
    task: {} as never,
  };
}

function event(id: string, opts: { allDay?: boolean; days?: number } = {}): CalendarItem {
  const { allDay = false, days = 1 } = opts;
  return {
    kind: "event",
    id,
    googleEventId: `g-${id}`,
    title: id,
    startAt: allDay
      ? new Date(Date.UTC(2026, 7, 18))
      : new Date(2026, 7, 18, 9, 0),
    endAt: allDay
      ? new Date(Date.UTC(2026, 7, 18 + days))
      : new Date(2026, 7, 18 + (days - 1), 10, 0),
    allDay,
    location: null,
    description: null,
    htmlLink: null,
  };
}

describe("effectivePriority", () => {
  it("태스크는 자기 우선순위를 그대로 쓴다", () => {
    expect(effectivePriority(task("t", 3))).toBe(3);
    expect(effectivePriority(task("t", 0))).toBe(0);
  });

  it("시간이 정해진 Google 일정은 무조건 높음", () => {
    expect(effectivePriority(event("meeting"))).toBe(3);
  });

  it("종일 Google 일정은 우선순위를 매기지 않는다 (시각 구속이 없음)", () => {
    expect(effectivePriority(event("holiday", { allDay: true }))).toBe(0);
  });
});

describe("itemAppearance — 왼쪽 띠가 우선순위를 나타낸다", () => {
  it("우선순위별로 띠 색이 다르다", () => {
    const colors = [3, 2, 1, 0].map((p) => itemAppearance(task("t", p)).barColor);
    expect(new Set(colors).size).toBe(4);
    expect(colors[0]).toContain("priority-high");
    expect(colors[3]).toContain("priority-none");
  });

  it("시간 지정 일정은 높음 색을 받는다", () => {
    expect(itemAppearance(event("meeting")).barColor).toContain("priority-high");
  });

  it("하루짜리 태스크는 배경을 깔지 않는다 (띠만)", () => {
    expect(itemAppearance(task("t", 3)).tint).toBe(false);
  });

  it("여러 날에 걸친 태스크는 배경을 깔아 구간을 보여준다", () => {
    expect(itemAppearance(task("t", 3, { days: 3 })).tint).toBe(true);
  });

  it("종일 항목도 배경을 깐다 (하루 전체를 차지하므로)", () => {
    expect(itemAppearance(event("holiday", { allDay: true })).tint).toBe(true);
  });

  it("완료된 태스크는 흐리게 + 취소선, 띠는 무채색", () => {
    const look = itemAppearance(task("t", 3, { status: "done" }));
    expect(look.className).toContain("line-through");
    expect(look.barColor).toContain("priority-none");
  });
});

describe("itemDotStyle — 목록 뷰의 점", () => {
  it("우선순위 색을 쓴다", () => {
    expect(itemDotStyle(task("t", 2)).color).toContain("priority-mid");
    expect(itemDotStyle(event("meeting")).color).toContain("priority-high");
  });
});
