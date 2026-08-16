import { describe, expect, it } from "vitest";
import {
  eventDayKeys,
  formatAllDay,
  parseAllDayDate,
  toAllDayDateString,
} from "./calendar-utils";

describe("종일 날짜 변환", () => {
  it("UTC 자정으로 파싱하고 그대로 되돌린다", () => {
    const d = parseAllDayDate("2026-08-16");
    expect(d.toISOString()).toBe("2026-08-16T00:00:00.000Z");
    expect(toAllDayDateString(d)).toBe("2026-08-16");
  });

  it("로컬 타임존과 무관하게 같은 날짜로 표시된다", () => {
    expect(formatAllDay(parseAllDayDate("2026-08-16"), "yyyy-MM-dd")).toBe("2026-08-16");
  });
});

describe("eventDayKeys", () => {
  it("종일 하루짜리 (end는 배타적)", () => {
    expect(
      eventDayKeys({
        startAt: parseAllDayDate("2026-08-16"),
        endAt: parseAllDayDate("2026-08-17"),
        allDay: true,
      }),
    ).toEqual(["2026-08-16"]);
  });

  it("종일 3일짜리", () => {
    expect(
      eventDayKeys({
        startAt: parseAllDayDate("2026-08-16"),
        endAt: parseAllDayDate("2026-08-19"),
        allDay: true,
      }),
    ).toEqual(["2026-08-16", "2026-08-17", "2026-08-18"]);
  });

  it("시간 지정 일정은 하루만 차지", () => {
    const keys = eventDayKeys({
      startAt: new Date(2026, 7, 16, 15, 0),
      endAt: new Date(2026, 7, 16, 17, 0),
      allDay: false,
    });
    expect(keys).toEqual(["2026-08-16"]);
  });

  it("자정을 넘기는 일정은 두 날에 걸친다", () => {
    const keys = eventDayKeys({
      startAt: new Date(2026, 7, 16, 23, 0),
      endAt: new Date(2026, 7, 17, 1, 0),
      allDay: false,
    });
    expect(keys).toEqual(["2026-08-16", "2026-08-17"]);
  });

  it("정확히 자정에 끝나면 다음 날은 차지하지 않는다", () => {
    const keys = eventDayKeys({
      startAt: new Date(2026, 7, 16, 22, 0),
      endAt: new Date(2026, 7, 17, 0, 0),
      allDay: false,
    });
    expect(keys).toEqual(["2026-08-16"]);
  });

  it("종료가 시작보다 이르거나 같으면 시작일 하루로 처리", () => {
    expect(
      eventDayKeys({
        startAt: new Date(2026, 7, 16, 10, 0),
        endAt: new Date(2026, 7, 16, 10, 0),
        allDay: false,
      }),
    ).toEqual(["2026-08-16"]);
    expect(
      eventDayKeys({
        startAt: parseAllDayDate("2026-08-16"),
        endAt: parseAllDayDate("2026-08-16"),
        allDay: true,
      }),
    ).toEqual(["2026-08-16"]);
  });
});
