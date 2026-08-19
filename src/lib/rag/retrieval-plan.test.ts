import { describe, expect, it } from "vitest";
import { buildProbes, GROWTH_PROBES, mergeHits } from "./retrieval-plan";
import type { RetrievedChunk } from "./search";

const hit = (text: string, score: number, url = "https://a/1"): RetrievedChunk => ({
  text,
  title: "글",
  url,
  occurredAt: new Date("2026-08-01"),
  score,
});

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
