/**
 * 날짜/시간 표현 규칙 (앱 전체 단일 기준)
 *
 * 두 종류를 분명히 구분한다.
 *
 * 1) **시각(instant)** — 시간이 지정된 태스크/일정.
 *    UTC 순간으로 저장하고 볼 때는 현재 위치의 타임존으로 렌더링한다.
 *    서울에서 만든 오후 3시 약속은 뉴욕에서 오전 2시로 보이는 게 맞다.
 *
 * 2) **떠 있는 날짜(floating date)** — 종일 태스크/일정.
 *    "8월 20일"은 어디서 보든 8월 20일이어야 하므로 시각이 아니라 달력 날짜다.
 *    Google Calendar가 `date: "2026-08-20"`을 쓰는 것과 같은 개념이며,
 *    DB에는 **UTC 자정**으로 저장한다.
 *
 * 종일 값을 로컬 자정으로 저장하면 타임존이 바뀔 때 하루씩 밀린다. 종일 값을
 * 만들거나 읽을 때는 반드시 아래 변환을 거칠 것.
 */

/** 로컬 Date의 달력 날짜 → 떠 있는 날짜(UTC 자정) */
export function toFloatingDate(local: Date): Date {
  return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
}

/** 떠 있는 날짜 → 같은 연·월·일의 로컬 Date (표시/비교/날짜 선택기용) */
export function fromFloatingDate(floating: Date): Date {
  return new Date(
    floating.getUTCFullYear(),
    floating.getUTCMonth(),
    floating.getUTCDate(),
  );
}

/** 종일이면 로컬 달력 날짜로 환산해서 돌려준다(표시·비교용 공통 진입점) */
export function forDisplay(value: Date, allDay: boolean): Date {
  return allDay ? fromFloatingDate(value) : value;
}

/** "yyyy-MM-dd" (떠 있는 날짜 기준) */
export function floatingDateKey(floating: Date): string {
  return floating.toISOString().slice(0, 10);
}

/** 브라우저가 있는 위치의 IANA 타임존 (예: "Asia/Seoul", "America/New_York") */
export function getBrowserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** 특정 타임존에서 본 달력 날짜 "yyyy-MM-dd" */
export function dateKeyInTimeZone(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/**
 * 그 지역의 지금 "시" (0–23).
 *
 * 저녁 알림처럼 **사용자가 있는 곳의 시계**를 기준으로 판단해야 하는 데 쓴다.
 * 서버는 UTC로 돌지만 18시는 서울의 18시와 시애틀의 18시가 다르다.
 */
export function hourInTimeZone(instant: Date, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  }).format(instant);
  // "24"로 오는 구현이 있어 0으로 되돌린다
  return Number(hour) % 24;
}

/** "Asia/Seoul" → "GMT+9" 같은 짧은 표기 (설정 화면 표시용) */
export function timeZoneOffsetLabel(timeZone: string, at = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(at);
    return parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}
