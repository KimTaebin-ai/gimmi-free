import { describe, expect, it } from "vitest";
import { buildTaskColorIndex, itemAppearance, itemDotStyle } from "./shared";
import { taskColorVar } from "@/lib/task-colors";
import type { CalendarItem } from "@/lib/calendar-types";

function task(id: string, month: number, day: number, priority = 0): CalendarItem {
  return {
    kind: "task",
    id,
    title: id,
    startAt: new Date(2026, month - 1, day, 10, 0),
    endAt: new Date(2026, month - 1, day, 11, 0),
    allDay: false,
    priority,
    status: "todo",
    // 렌더링에 쓰이지 않는 필드는 테스트에서 생략
    task: {} as never,
  };
}

function event(id: string, day: number): CalendarItem {
  return {
    kind: "event",
    id,
    title: id,
    startAt: new Date(2026, 7, day, 9, 0),
    endAt: new Date(2026, 7, day, 10, 0),
    allDay: false,
    location: null,
    description: null,
    htmlLink: null,
  };
}

describe("buildTaskColorIndex", () => {
  it("시작 시각 순으로 번호를 매겨 이웃 태스크가 다른 색이 된다", () => {
    const items = [task("c", 8, 20), task("a", 8, 18), task("b", 8, 19)];
    const idx = buildTaskColorIndex(items);
    expect(idx.get("a")).toBe(0);
    expect(idx.get("b")).toBe(1);
    expect(idx.get("c")).toBe(2);
    expect(taskColorVar(idx.get("a")!)).not.toBe(taskColorVar(idx.get("b")!));
  });

  it("Google 일정은 팔레트 번호를 받지 않는다", () => {
    const idx = buildTaskColorIndex([task("t", 8, 18), event("e", 18)]);
    expect(idx.has("e")).toBe(false);
    expect(idx.size).toBe(1);
  });

  it("같은 시각이면 id로 순서를 고정해 렌더마다 색이 바뀌지 않는다", () => {
    const items = [task("z", 8, 18), task("y", 8, 18)];
    const a = buildTaskColorIndex(items);
    const b = buildTaskColorIndex([...items].reverse());
    expect(a.get("y")).toBe(b.get("y"));
    expect(a.get("z")).toBe(b.get("z"));
  });
});

describe("itemAppearance — 태스크 vs 외부 일정", () => {
  const items = [task("t1", 8, 18), task("t2", 8, 19), event("e1", 18)];
  const idx = buildTaskColorIndex(items);

  it("태스크는 식별 색을 받는다", () => {
    expect(itemAppearance(items[0], idx).color).toBe(taskColorVar(0));
    expect(itemAppearance(items[1], idx).color).toBe(taskColorVar(1));
  });

  it("Google 일정은 팔레트 색을 쓰지 않고 스타일로 구분된다", () => {
    const look = itemAppearance(items[2], idx);
    expect(look.color).toBeUndefined();
    expect(look.className).toContain("border-l-2");
  });

  it("완료된 태스크는 색 대신 흐리게 + 취소선", () => {
    const done = { ...task("d", 8, 18), status: "done" } as CalendarItem;
    const look = itemAppearance(done, idx);
    expect(look.color).toBeUndefined();
    expect(look.className).toContain("line-through");
  });

  it("우선순위가 같아도 서로 다른 색이 된다 (예전에는 같은 색이었음)", () => {
    const same = [task("p1", 8, 18, 2), task("p2", 8, 19, 2)];
    const i = buildTaskColorIndex(same);
    expect(itemAppearance(same[0], i).color).not.toBe(
      itemAppearance(same[1], i).color,
    );
  });
});

describe("itemDotStyle — 목록 뷰", () => {
  it("태스크는 색, 일정은 무채색 클래스", () => {
    const items = [task("t", 8, 18), event("e", 18)];
    const idx = buildTaskColorIndex(items);
    expect(itemDotStyle(items[0], idx).color).toBe(taskColorVar(0));
    expect(itemDotStyle(items[1], idx).color).toBeUndefined();
  });
});
