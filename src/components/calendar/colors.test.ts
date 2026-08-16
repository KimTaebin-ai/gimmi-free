import { describe, expect, it } from "vitest";
import { buildColorIndex, itemAppearance, itemDotStyle, itemKey } from "./shared";
import { taskColorVar } from "@/lib/task-colors";
import type { CalendarItem } from "@/lib/calendar-types";

function task(id: string, day: number, priority = 0, hour = 10): CalendarItem {
  return {
    kind: "task",
    id,
    title: id,
    startAt: new Date(2026, 7, day, hour, 0),
    endAt: new Date(2026, 7, day, hour + 1, 0),
    allDay: false,
    priority,
    status: "todo",
    task: {} as never,
  };
}

function event(id: string, day: number, hour = 9): CalendarItem {
  return {
    kind: "event",
    id,
    googleEventId: `g-${id}`,
    title: id,
    startAt: new Date(2026, 7, day, hour, 0),
    endAt: new Date(2026, 7, day, hour + 1, 0),
    allDay: false,
    location: null,
    description: null,
    htmlLink: null,
  };
}

describe("buildColorIndex — 태스크와 Google 일정 모두 색을 받는다", () => {
  it("Google 일정도 식별 색을 받는다 (예전에는 무채색이었음)", () => {
    const e = event("e1", 18);
    const idx = buildColorIndex([e]);
    expect(itemAppearance(e, idx).color).toBeDefined();
  });

  it("태스크와 일정이 같은 순번 줄에 서므로 서로 색이 겹치지 않는다", () => {
    const items = [event("e1", 18, 9), task("t1", 18, 0, 10), event("e2", 18, 11)];
    const idx = buildColorIndex(items);
    const colors = items.map((i) => itemAppearance(i, idx).color);
    expect(new Set(colors).size).toBe(3);
  });

  it("시작 시각 순으로 번호를 매겨 이웃한 항목은 다른 색", () => {
    const items = [task("late", 20), event("early", 18), task("mid", 19)];
    const idx = buildColorIndex(items);
    expect(idx.get(itemKey(items[1]))).toBe(0); // early
    expect(idx.get(itemKey(items[2]))).toBe(1); // mid
    expect(idx.get(itemKey(items[0]))).toBe(2); // late
  });

  it("태스크와 일정의 id가 같아도 서로 다른 항목으로 센다", () => {
    const items = [task("same", 18, 0, 10), event("same", 18, 9)];
    const idx = buildColorIndex(items);
    expect(idx.size).toBe(2);
    expect(itemAppearance(items[0], idx).color).not.toBe(
      itemAppearance(items[1], idx).color,
    );
  });

  it("같은 시각이면 키로 순서를 고정해 렌더마다 색이 바뀌지 않는다", () => {
    const items = [task("z", 18), task("y", 18)];
    const a = buildColorIndex(items);
    const b = buildColorIndex([...items].reverse());
    expect(a.get(itemKey(items[0]))).toBe(b.get(itemKey(items[0])));
    expect(a.get(itemKey(items[1]))).toBe(b.get(itemKey(items[1])));
  });
});

describe("itemAppearance", () => {
  it("우선순위가 같은 태스크도 서로 다른 색", () => {
    const items = [task("p1", 18, 2), task("p2", 19, 2)];
    const idx = buildColorIndex(items);
    expect(itemAppearance(items[0], idx).color).not.toBe(
      itemAppearance(items[1], idx).color,
    );
  });

  it("완료된 태스크만 색 없이 흐리게 + 취소선", () => {
    const done = { ...task("d", 18), status: "done" } as CalendarItem;
    const look = itemAppearance(done, buildColorIndex([done]));
    expect(look.color).toBeUndefined();
    expect(look.className).toContain("line-through");
  });
});

describe("itemDotStyle — 목록 뷰", () => {
  it("태스크와 일정 모두 색을 쓴다", () => {
    const items = [task("t", 18, 0, 10), event("e", 18, 9)];
    const idx = buildColorIndex(items);
    expect(itemDotStyle(items[0], idx).color).toBeDefined();
    expect(itemDotStyle(items[1], idx).color).toBeDefined();
    expect(itemDotStyle(items[0], idx).color).not.toBe(
      itemDotStyle(items[1], idx).color,
    );
  });

  it("팔레트를 넘어가면 순환한다", () => {
    const many = Array.from({ length: 9 }, (_, i) => task(`t${i}`, 18, 0, i + 1));
    const idx = buildColorIndex(many);
    expect(itemAppearance(many[0], idx).color).toBe(taskColorVar(0));
    expect(itemAppearance(many[8], idx).color).toBe(taskColorVar(8)); // = slot 1
  });
});
