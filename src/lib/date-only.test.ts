import { describe, expect, it } from "vitest";
import {
  fromDateOnly,
  parseDateOnlyLocal,
  shiftDateString,
  toDateOnly,
  todayDateString,
} from "./date-only";

describe("date-only 왕복", () => {
  it("문자열 → Date → 문자열이 그대로 돌아온다", () => {
    expect(fromDateOnly(toDateOnly("2026-08-16"))).toBe("2026-08-16");
  });

  it("UTC 자정으로 저장한다 (타임존 무관)", () => {
    expect(toDateOnly("2026-08-16").toISOString()).toBe("2026-08-16T00:00:00.000Z");
  });

  it("연·월 경계에서도 밀리지 않는다", () => {
    for (const d of ["2026-01-01", "2026-12-31", "2026-02-28", "2028-02-29"]) {
      expect(fromDateOnly(toDateOnly(d))).toBe(d);
    }
  });
});

describe("todayDateString — 로컬 달력 기준", () => {
  it("로컬 날짜를 쓴다 (UTC로 읽으면 밀릴 시각에서도)", () => {
    // KST 기준 2026-08-16 08:00 == 2026-08-15T23:00Z
    // 로컬(KST)에서는 8/16이어야 한다
    const d = new Date(2026, 7, 16, 8, 0);
    expect(todayDateString(d)).toBe("2026-08-16");
  });

  it("자정 직후에도 그 날짜", () => {
    expect(todayDateString(new Date(2026, 7, 16, 0, 1))).toBe("2026-08-16");
  });

  it("자정 직전에도 그 날짜", () => {
    expect(todayDateString(new Date(2026, 7, 16, 23, 59))).toBe("2026-08-16");
  });
});

describe("shiftDateString", () => {
  it("앞뒤로 이동", () => {
    expect(shiftDateString("2026-08-16", 1)).toBe("2026-08-17");
    expect(shiftDateString("2026-08-16", -1)).toBe("2026-08-15");
  });

  it("월/연 경계를 넘는다", () => {
    expect(shiftDateString("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDateString("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDateString("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("기간 조회용 -90일", () => {
    expect(shiftDateString("2026-08-16", -90)).toBe("2026-05-18");
  });
});

describe("parseDateOnlyLocal", () => {
  it("로컬 자정으로 만든다 (표시용)", () => {
    const d = parseDateOnlyLocal("2026-08-16");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(0);
  });
});
