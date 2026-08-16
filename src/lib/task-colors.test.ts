import { describe, expect, it } from "vitest";
import { applyScopedReorder, taskColorVar, TASK_COLOR_COUNT } from "./task-colors";

describe("taskColorVar — 목록에서 항목 구분용 색", () => {
  it("연속한 순서는 항상 다른 색", () => {
    for (let i = 0; i < 20; i++) {
      expect(taskColorVar(i)).not.toBe(taskColorVar(i + 1));
    }
  });

  it("팔레트 개수만큼 지나면 순환한다", () => {
    expect(taskColorVar(0)).toBe(taskColorVar(TASK_COLOR_COUNT));
    expect(taskColorVar(3)).toBe(taskColorVar(TASK_COLOR_COUNT + 3));
  });

  it("CSS 변수를 돌려준다", () => {
    expect(taskColorVar(0)).toBe("var(--task-1)");
    expect(taskColorVar(7)).toBe("var(--task-8)");
  });
});

describe("applyScopedReorder — 그룹 안에서만 순서 변경", () => {
  // 화면: [오늘] a b c  [내일] d e
  const all = ["a", "b", "c", "d", "e"];
  const todayScope = ["a", "b", "c"];
  const tomorrowScope = ["d", "e"];

  it("그룹 안에서 앞으로 옮긴다", () => {
    // c를 맨 앞으로 (index 2 → 0)
    expect(applyScopedReorder(all, todayScope, 2, 0)).toEqual(["c", "a", "b", "d", "e"]);
  });

  it("그룹 안에서 뒤로 옮긴다", () => {
    expect(applyScopedReorder(all, todayScope, 0, 2)).toEqual(["b", "c", "a", "d", "e"]);
  });

  it("다른 그룹의 태스크는 자리를 유지한다", () => {
    const r = applyScopedReorder(all, todayScope, 2, 0);
    expect(r.slice(3)).toEqual(["d", "e"]);
  });

  it("두 번째 그룹을 옮겨도 첫 그룹은 그대로", () => {
    const r = applyScopedReorder(all, tomorrowScope, 1, 0);
    expect(r).toEqual(["a", "b", "c", "e", "d"]);
  });

  it("그룹이 목록에서 떨어져 있어도 그 자리들만 채운다", () => {
    // 화면 순서상 그룹이 섞여 있는 경우 (a, d, b, e, c)
    const interleaved = ["a", "d", "b", "e", "c"];
    const scope = ["a", "b", "c"];
    const r = applyScopedReorder(interleaved, scope, 2, 0); // c를 앞으로
    // 그룹 자리(0,2,4)만 c,a,b로 채워지고 d,e는 그대로
    expect(r).toEqual(["c", "d", "a", "e", "b"]);
  });

  it("범위를 벗어난 인덱스는 원본을 그대로 돌려준다", () => {
    expect(applyScopedReorder(all, todayScope, -1, 0)).toEqual(all);
    expect(applyScopedReorder(all, todayScope, 0, 9)).toEqual(all);
  });

  it("항목이 하나뿐인 그룹은 변화 없음", () => {
    expect(applyScopedReorder(all, ["a"], 0, 0)).toEqual(all);
  });

  it("전체 개수와 구성은 항상 보존된다", () => {
    const r = applyScopedReorder(all, todayScope, 1, 2);
    expect([...r].sort()).toEqual([...all].sort());
  });
});
