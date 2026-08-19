import { describe, expect, it } from "vitest";
import {
  buildMonthlyTimeline,
  countCapabilities,
  formatMonth,
  monthKey,
  type SummaryForTimeline,
} from "./growth-timeline";
import type { GainedCapability } from "./growth-types";

const cap = (title: string, month: string, extra: Partial<GainedCapability> = {}) =>
  ({
    title,
    month,
    evidence: "근거",
    level: "newly_able",
    area: "연구",
    ...extra,
  }) as GainedCapability;

const summary = (
  gained: GainedCapability[],
  opts: { periodEnd?: string; createdAt?: string } = {},
): SummaryForTimeline => ({
  content: { gained },
  periodEnd: new Date(opts.periodEnd ?? "2026-08-19T00:00:00Z"),
  createdAt: new Date(opts.createdAt ?? "2026-08-19T00:00:00Z"),
});

describe("monthKey / formatMonth", () => {
  it("UTC 기준 연-월을 쓴다", () => {
    expect(monthKey(new Date("2026-07-31T23:00:00Z"))).toBe("2026-07");
    expect(monthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });

  it("사람이 읽는 형태로 바꾼다", () => {
    expect(formatMonth("2026-07")).toBe("2026년 7월");
    expect(formatMonth("2026-11")).toBe("2026년 11월");
  });
});

describe("buildMonthlyTimeline", () => {
  it("달별로 묶고 최신 달을 앞에 둔다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("증명을 쓸 수 있게 됨", "2026-06"), cap("RAG를 붙일 수 있게 됨", "2026-08")]),
    ]);

    expect(timeline.map((m) => m.month)).toEqual(["2026-08", "2026-06"]);
    expect(timeline[0].capabilities[0].title).toBe("RAG를 붙일 수 있게 됨");
  });

  it("요약 기간이 겹쳐 같은 능력이 두 번 나와도 하나로 센다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("증명을 쓸 수 있게 됨", "2026-06")], { createdAt: "2026-07-01T00:00:00Z" }),
      summary([cap("증명을 쓸 수 있게 됨", "2026-06")], { createdAt: "2026-08-01T00:00:00Z" }),
    ]);

    expect(countCapabilities(timeline)).toBe(1);
  });

  it("겹치면 나중에 만든 요약의 판단이 남는다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("증명을 쓸 수 있게 됨", "2026-06", { evidence: "옛 근거" })], {
        createdAt: "2026-07-01T00:00:00Z",
      }),
      summary([cap("증명을 쓸 수 있게 됨", "2026-06", { evidence: "새 근거" })], {
        createdAt: "2026-08-01T00:00:00Z",
      }),
    ]);

    expect(timeline[0].capabilities[0].evidence).toBe("새 근거");
  });

  it("띄어쓰기·문장부호만 다른 제목은 같은 것으로 본다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("증명을 쓸 수 있게 됨", "2026-06")], { createdAt: "2026-07-01T00:00:00Z" }),
      summary([cap("증명을  쓸 수 있게 됨.", "2026-06")], { createdAt: "2026-08-01T00:00:00Z" }),
    ]);

    expect(countCapabilities(timeline)).toBe(1);
  });

  it("같은 능력이라도 달이 다르면 따로 센다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("발표를 할 수 있게 됨", "2026-06"), cap("발표를 할 수 있게 됨", "2026-08")]),
    ]);

    expect(timeline).toHaveLength(2);
    expect(countCapabilities(timeline)).toBe(2);
  });

  it("month가 없던 예전 요약은 그 요약 기간의 끝 달로 돌린다", () => {
    const legacy = {
      content: { gained: [{ title: "옛 능력", evidence: "e", level: "improved", area: "개발" }] },
      periodEnd: new Date("2026-05-19T00:00:00Z"),
      createdAt: new Date("2026-05-19T00:00:00Z"),
    } as unknown as SummaryForTimeline;

    expect(buildMonthlyTimeline([legacy])[0].month).toBe("2026-05");
  });

  it("month 모양이 이상해도 기간의 끝 달로 돌린다", () => {
    const timeline = buildMonthlyTimeline([
      summary([cap("이상한 달", "2026-13"), cap("빈 달", "")], {
        periodEnd: "2026-04-30T00:00:00Z",
      }),
    ]);

    expect(timeline).toHaveLength(1);
    expect(timeline[0].month).toBe("2026-04");
  });

  it("요약이 없거나 gained가 비어도 안전하다", () => {
    expect(buildMonthlyTimeline([])).toEqual([]);
    expect(buildMonthlyTimeline([summary([])])).toEqual([]);
    expect(
      buildMonthlyTimeline([{ content: null, periodEnd: new Date(), createdAt: new Date() }]),
    ).toEqual([]);
  });
});
