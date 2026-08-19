import { describe, expect, it } from "vitest";
import { balanceByPeriod, buildProbes, GROWTH_PROBES, mergeHits } from "./retrieval-plan";
import type { RetrievedChunk } from "./search";

const hit = (
  text: string,
  score: number,
  url = "https://a/1",
  occurredAt = new Date("2026-08-01"),
): RetrievedChunk => ({
  text,
  title: "글",
  url,
  occurredAt,
  score,
});

const PERIOD_START = new Date("2026-06-01");
const inside = (t: string, s: number) => hit(t, s, `https://a/${t}`, new Date("2026-07-01"));
const outside = (t: string, s: number) => hit(t, s, `https://a/${t}`, new Date("2025-01-01"));

describe("buildProbes", () => {
  it("고정 탐침은 항상 들어간다", () => {
    expect(buildProbes([])).toEqual([...GROWTH_PROBES]);
  });

  it("그 기간에 한 일을 탐침으로 덧붙인다", () => {
    const probes = buildProbes(["강화학습 스터디 3주차", "위상수학 복습"]);
    expect(probes).toContain("강화학습 스터디 3주차");
    expect(probes).toContain("위상수학 복습");
    expect(probes.slice(0, GROWTH_PROBES.length)).toEqual([...GROWTH_PROBES]);
  });

  it("구체적인(긴) 제목을 먼저 쓰고 개수를 제한한다", () => {
    const titles = Array.from({ length: 20 }, (_, i) => `활동 ${"가".repeat(i + 1)}`);
    const added = buildProbes(titles).slice(GROWTH_PROBES.length);
    expect(added).toHaveLength(6);
    expect(added[0]).toBe(titles[19]);
  });

  it("중복과 너무 짧은 제목은 버린다", () => {
    const added = buildProbes(["메모", "정리", "강화학습", "강화학습", "  강화학습  "]).slice(
      GROWTH_PROBES.length,
    );
    expect(added).toEqual(["강화학습"]);
  });
});

describe("mergeHits", () => {
  it("같은 청크는 가장 높은 점수만 남긴다", () => {
    const merged = mergeHits([[hit("같은 대목", 0.4)], [hit("같은 대목", 0.9)]], 10);
    expect(merged).toEqual([hit("같은 대목", 0.9)]);
  });

  it("글이 달라도 본문이 같으면 별개로 센다", () => {
    const merged = mergeHits(
      [[hit("본문", 0.5, "https://a/1"), hit("본문", 0.5, "https://a/2")]],
      10,
    );
    expect(merged).toHaveLength(2);
  });

  it("점수순으로 자른다", () => {
    const merged = mergeHits([[hit("a", 0.1), hit("b", 0.9), hit("c", 0.5)]], 2);
    expect(merged.map((h) => h.text)).toEqual(["b", "c"]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(mergeHits([[], []], 5)).toEqual([]);
  });
});

describe("balanceByPeriod", () => {
  it("기간 밖 대목이 발췌를 뒤덮지 않는다", () => {
    const hits = [
      ...Array.from({ length: 19 }, (_, i) => outside(`old${i}`, 0.9 - i * 0.01)),
      ...Array.from({ length: 5 }, (_, i) => inside(`new${i}`, 0.5 - i * 0.01)),
    ];
    const kept = balanceByPeriod(hits, PERIOD_START, { total: 24, maxOutside: 8 });

    expect(kept.filter((h) => h.occurredAt >= PERIOD_START)).toHaveLength(5);
    expect(kept.filter((h) => h.occurredAt < PERIOD_START)).toHaveLength(8);
  });

  it("기간 안 대목은 점수가 낮아도 밀리지 않는다", () => {
    const kept = balanceByPeriod([outside("old", 0.9), inside("new", 0.2)], PERIOD_START, {
      total: 24,
      maxOutside: 8,
    });
    expect(kept.map((h) => h.text)).toContain("new");
  });

  it("남은 자리가 없으면 기간 밖은 하나도 안 넣는다", () => {
    const hits = Array.from({ length: 10 }, (_, i) => inside(`new${i}`, 0.5));
    const kept = balanceByPeriod([...hits, outside("old", 0.99)], PERIOD_START, {
      total: 10,
      maxOutside: 8,
    });
    expect(kept).toHaveLength(10);
    expect(kept.every((h) => h.occurredAt >= PERIOD_START)).toBe(true);
  });

  it("최종 순서는 점수순", () => {
    const kept = balanceByPeriod(
      [inside("a", 0.3), outside("b", 0.8), inside("c", 0.5)],
      PERIOD_START,
      { total: 24, maxOutside: 8 },
    );
    expect(kept.map((h) => h.score)).toEqual([0.8, 0.5, 0.3]);
  });

  it("결과가 없으면 빈 배열", () => {
    expect(balanceByPeriod([], PERIOD_START, { total: 24, maxOutside: 8 })).toEqual([]);
  });
});
