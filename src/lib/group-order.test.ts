import { describe, expect, it } from "vitest";
import { SMART_LISTS } from "./smart-lists";

/**
 * 그룹 헤더 정렬 규칙 — task-list.tsx의 rank와 동일하게 유지한다.
 * 지연됨 → 진행 중 → 날짜순 → 날짜 없음(맨 뒤)
 */
function rank(label: string): number {
  return label === "지연됨" ? 0 : label === "진행 중" ? 1 : label === "날짜 없음" ? 3 : 2;
}

function orderGroups(groups: { label: string; at: number }[]) {
  return [...groups]
    .sort((a, b) => rank(a.label) - rank(b.label) || a.at - b.at)
    .map((g) => g.label);
}

describe("스마트 리스트 순서", () => {
  it("'전체'가 맨 위 (기본 진입 화면)", () => {
    expect(SMART_LISTS[0].key).toBe("all");
    expect(SMART_LISTS[0].label).toBe("전체");
  });

  it("'완료됨'은 맨 아래", () => {
    expect(SMART_LISTS[SMART_LISTS.length - 1].key).toBe("done");
  });

  it("키가 중복되지 않는다", () => {
    const keys = SMART_LISTS.map((s) => s.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("날짜 그룹 정렬", () => {
  it("지연됨 → 진행 중 → 날짜순 → 날짜 없음", () => {
    const groups = [
      { label: "날짜 없음", at: 0 },
      { label: "8월 25일 화요일", at: 300 },
      { label: "지연됨", at: 100 },
      { label: "오늘", at: 200 },
      { label: "진행 중", at: 150 },
    ];
    expect(orderGroups(groups)).toEqual([
      "지연됨",
      "진행 중",
      "오늘",
      "8월 25일 화요일",
      "날짜 없음",
    ]);
  });

  it("날짜 없음은 시각이 0이어도 맨 앞으로 오지 않는다 (예전 버그)", () => {
    const groups = [
      { label: "날짜 없음", at: 0 },
      { label: "오늘", at: 999 },
    ];
    expect(orderGroups(groups)).toEqual(["오늘", "날짜 없음"]);
  });

  it("같은 순위끼리는 날짜순", () => {
    const groups = [
      { label: "9월 1일 화요일", at: 900 },
      { label: "8월 20일 목요일", at: 800 },
    ];
    expect(orderGroups(groups)).toEqual(["8월 20일 목요일", "9월 1일 화요일"]);
  });
});
