import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  dateKeyInTimeZone,
  floatingDateKey,
  forDisplay,
  fromFloatingDate,
  toFloatingDate,
} from "./timezone";
import { formatDayLabel, isOverdue } from "./format-date";

/**
 * 시계를 고정한다.
 *
 * `formatDayLabel`은 오늘·내일·어제를 상대 표현으로 바꾸므로, 날짜를 박아 둔 단언은
 * 실행하는 날에 따라 결과가 달라진다(실제로 8/19에 "8월 20일"이 "내일"로 나와 깨졌다).
 * 여기 있는 검증의 관심사는 "라벨이 **UTC 달력 날짜**를 따르는가"이지 상대 표현이 아니므로,
 * 상대 표현 구간에서 멀리 떨어진 시각에 고정해 둔다. 상대 표현 자체는 아래에서 따로 본다.
 */
// 정오(UTC)로 잡는다 — 실행 머신 타임존이 UTC±11 안이면 로컬 날짜도 5/15라
// 아래 오늘/내일 단언이 타임존 때문에 흔들리지 않는다.
const FIXED_NOW = new Date("2026-05-15T12:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

describe("떠 있는 날짜 왕복", () => {
  it("로컬 달력 날짜 → UTC 자정 → 같은 달력 날짜", () => {
    const local = new Date(2026, 7, 20, 15, 30); // 8/20 15:30 로컬
    const floating = toFloatingDate(local);
    expect(floating.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(floatingDateKey(floating)).toBe("2026-08-20");

    const back = fromFloatingDate(floating);
    expect(back.getFullYear()).toBe(2026);
    expect(back.getMonth()).toBe(7);
    expect(back.getDate()).toBe(20);
  });

  it("하루의 어느 시각이든 같은 떠 있는 날짜가 된다", () => {
    for (const h of [0, 1, 9, 12, 23]) {
      expect(floatingDateKey(toFloatingDate(new Date(2026, 7, 20, h, 59)))).toBe(
        "2026-08-20",
      );
    }
  });

  it("연·월 경계에서도 밀리지 않는다", () => {
    expect(floatingDateKey(toFloatingDate(new Date(2026, 11, 31, 23, 0)))).toBe(
      "2026-12-31",
    );
    expect(floatingDateKey(toFloatingDate(new Date(2027, 0, 1, 0, 30)))).toBe(
      "2027-01-01",
    );
  });
});

describe("종일 값 표시 — 어느 타임존에서 보든 같은 날짜", () => {
  const floating = new Date("2026-08-20T00:00:00.000Z");

  it("forDisplay가 UTC 달력 날짜를 그대로 준다", () => {
    const d = forDisplay(floating, true);
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(20);
  });

  it("시간 지정 값은 손대지 않는다(현지 시각으로 렌더링되어야 함)", () => {
    const instant = new Date("2026-08-20T06:00:00.000Z");
    expect(forDisplay(instant, false)).toBe(instant);
  });

  it("라벨이 UTC 날짜를 따른다", () => {
    expect(formatDayLabel(floating, true)).toContain("8월 20일");
  });

  it("오늘·내일도 UTC 날짜로 판정한다", () => {
    // 시계는 2026-05-15T12:00Z에 고정돼 있다.
    // 종일 값은 UTC 자정으로 저장되므로 UTC 연·월·일로 읽어야 오늘/내일이 맞는다.
    expect(formatDayLabel(new Date("2026-05-15T00:00:00.000Z"), true)).toBe("오늘");
    expect(formatDayLabel(new Date("2026-05-16T00:00:00.000Z"), true)).toBe("내일");
    expect(formatDayLabel(new Date("2026-05-14T00:00:00.000Z"), true)).toBe("어제");
  });
});

describe("회귀: 앱 목록과 캘린더가 같은 날짜를 가리킨다", () => {
  // 예전 버그: 종일 태스크를 로컬 자정으로 저장하고 캘린더는 UTC로 읽어
  // 목록은 8/21, 캘린더는 8/20으로 갈렸다.
  it("종일 태스크의 목록 라벨과 캘린더 날짜 키가 일치", () => {
    const created = toFloatingDate(new Date(2026, 7, 21)); // 사용자가 8/21 선택
    expect(floatingDateKey(created)).toBe("2026-08-21"); // 캘린더가 쓰는 키
    expect(formatDayLabel(created, true)).toContain("8월 21일"); // 목록 라벨
  });

  it("예전 방식(로컬 자정 저장)이었다면 KST에서 어긋났다", () => {
    // KST 8/21 00:00 == 2026-08-20T15:00Z → UTC 키는 8/20
    const oldStyle = new Date("2026-08-20T15:00:00.000Z");
    expect(oldStyle.toISOString().slice(0, 10)).toBe("2026-08-20");
    // 새 방식은 그런 어긋남이 없다
    expect(floatingDateKey(toFloatingDate(new Date(2026, 7, 21)))).toBe("2026-08-21");
  });
});

describe("dateKeyInTimeZone — 위치별 달력 날짜", () => {
  const instant = new Date("2026-08-20T16:00:00.000Z");

  it("같은 순간이라도 지역에 따라 날짜가 다르다", () => {
    expect(dateKeyInTimeZone(instant, "Asia/Seoul")).toBe("2026-08-21"); // +9 → 익일 01:00
    expect(dateKeyInTimeZone(instant, "America/New_York")).toBe("2026-08-20"); // -4 → 12:00
    expect(dateKeyInTimeZone(instant, "UTC")).toBe("2026-08-20");
  });
});

describe("isOverdue — 종일은 그 날이 지나야 지연", () => {
  it("오늘 마감인 종일 태스크는 아직 지연이 아니다", () => {
    const todayFloating = toFloatingDate(new Date());
    expect(isOverdue(todayFloating, true)).toBe(false);
  });

  it("어제 마감인 종일 태스크는 지연", () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    expect(isOverdue(toFloatingDate(y), true)).toBe(true);
  });

  it("내일 마감은 지연 아님", () => {
    const t = new Date();
    t.setDate(t.getDate() + 1);
    expect(isOverdue(toFloatingDate(t), true)).toBe(false);
  });
});
