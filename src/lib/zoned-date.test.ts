import { describe, expect, it } from "vitest";
import { toAllDayDateString, zonedDateString } from "./calendar-utils";

describe("zonedDateString — 종일 태스크를 Google로 내보낼 때", () => {
  // 태스크의 종일 시각은 클라이언트 로컬 자정으로 저장된다.
  // KST 2026-08-20 00:00 == 2026-08-19T15:00:00Z
  const kstMidnight = new Date("2026-08-19T15:00:00.000Z");

  it("KST 자정을 8월 20일로 읽는다 (UTC로 읽으면 하루 밀림)", () => {
    expect(zonedDateString(kstMidnight, "Asia/Seoul")).toBe("2026-08-20");
    // 예전 방식이었다면 하루 밀렸을 것
    expect(toAllDayDateString(kstMidnight)).toBe("2026-08-19");
  });

  it("종료일 +1일(배타적)도 타임존 기준으로 맞는다", () => {
    const endExclusive = new Date(kstMidnight.getTime() + 86400000);
    expect(zonedDateString(endExclusive, "Asia/Seoul")).toBe("2026-08-21");
  });

  it("연말 경계에서도 밀리지 않는다", () => {
    // KST 2027-01-01 00:00 == 2026-12-31T15:00Z
    const newYear = new Date("2026-12-31T15:00:00.000Z");
    expect(zonedDateString(newYear, "Asia/Seoul")).toBe("2027-01-01");
  });

  it("다른 타임존에서도 그 지역 달력 날짜를 준다", () => {
    // 2026-08-20 00:00 EDT == 2026-08-20T04:00Z
    const nyMidnight = new Date("2026-08-20T04:00:00.000Z");
    expect(zonedDateString(nyMidnight, "America/New_York")).toBe("2026-08-20");
    expect(zonedDateString(nyMidnight, "Asia/Seoul")).toBe("2026-08-20");
  });

  it("UTC 타임존이면 UTC 날짜와 같다", () => {
    expect(zonedDateString(new Date("2026-08-20T00:00:00Z"), "UTC")).toBe("2026-08-20");
  });
});
