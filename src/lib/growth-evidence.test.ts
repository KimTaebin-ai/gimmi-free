import { describe, expect, it } from "vitest";
import {
  evidenceStrength,
  isWeakEvidence,
  ORIGIN_LABEL,
  sortByEvidence,
  type SourceForPrompt,
} from "./growth-evidence";

function src(
  origin: SourceForPrompt["origin"],
  title: string,
  opts: { note?: string | null; entries?: number } = {},
): SourceForPrompt {
  const { note = null, entries = 0 } = opts;
  return {
    origin,
    title,
    at: new Date(2026, 7, 18),
    project: null,
    tags: [],
    note,
    entries: Array.from({ length: entries }, (_, i) => ({
      kind: "reflection",
      title: null,
      content: `기록 ${i}`,
    })),
  };
}

describe("근거 종류", () => {
  it("태스크·일정·블로그 세 종류를 구분해 라벨을 붙인다", () => {
    expect(ORIGIN_LABEL.task).toBe("[태스크]");
    expect(ORIGIN_LABEL.event).toBe("[일정]");
    expect(ORIGIN_LABEL.blog).toBe("[블로그 글]");
  });
});

describe("isWeakEvidence", () => {
  it("제목만 있으면 근거가 약하다", () => {
    expect(isWeakEvidence(src("task", "제목뿐"))).toBe(true);
    expect(isWeakEvidence(src("event", "세미나"))).toBe(true);
  });

  it("요약이나 메모가 있으면 약하지 않다", () => {
    expect(isWeakEvidence(src("blog", "글", { note: "요약" }))).toBe(false);
  });

  it("기록이 붙어 있으면 약하지 않다", () => {
    expect(isWeakEvidence(src("event", "세미나", { entries: 1 }))).toBe(false);
  });

  it("블로그 글은 요약이 있으므로 보통 근거로 인정된다", () => {
    expect(isWeakEvidence(src("blog", "확산 모델 정리", { note: "노이즈 스케줄…" }))).toBe(false);
  });
});

describe("evidenceStrength / sortByEvidence", () => {
  it("기록 > 요약만 > 제목만 순으로 세다", () => {
    const withEntries = src("task", "a", { entries: 2, note: "메모" });
    const withNote = src("blog", "b", { note: "요약" });
    const bare = src("event", "c");
    expect(evidenceStrength(withEntries)).toBeGreaterThan(evidenceStrength(withNote));
    expect(evidenceStrength(withNote)).toBeGreaterThan(evidenceStrength(bare));
  });

  it("강한 근거가 앞으로 정렬된다", () => {
    const sorted = sortByEvidence([
      src("event", "제목뿐인 일정"),
      src("blog", "요약 있는 글", { note: "요약" }),
      src("task", "느낀 점 남긴 태스크", { entries: 3 }),
    ]);
    expect(sorted.map((s) => s.title)).toEqual([
      "느낀 점 남긴 태스크",
      "요약 있는 글",
      "제목뿐인 일정",
    ]);
  });

  it("원본 배열을 바꾸지 않는다", () => {
    const list = [src("event", "a"), src("task", "b", { entries: 1 })];
    const before = list.map((s) => s.title);
    sortByEvidence(list);
    expect(list.map((s) => s.title)).toEqual(before);
  });

  it("빈 목록도 안전", () => {
    expect(sortByEvidence([])).toEqual([]);
  });
});
