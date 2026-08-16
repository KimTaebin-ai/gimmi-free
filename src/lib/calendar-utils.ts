import { addDays, format, startOfDay } from "date-fns";

/**
 * 이벤트 구간은 [startAt, endAt) 반열린 구간으로 통일한다(Google Calendar와 동일).
 * 종일 이벤트는 UTC 자정 기준으로 저장하므로 날짜 계산도 UTC로 읽어야 한다.
 */

export type DayKey = string; // "yyyy-MM-dd"

export function dayKey(date: Date): DayKey {
  return format(date, "yyyy-MM-dd");
}

export function utcDayKey(date: Date): DayKey {
  return date.toISOString().slice(0, 10);
}

/** "2026-08-16" → UTC 자정 Date */
export function parseAllDayDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** UTC 자정 Date → "2026-08-16" */
export function toAllDayDateString(date: Date): string {
  return utcDayKey(date);
}

/**
 * 특정 타임존에서 본 달력 날짜를 "YYYY-MM-DD"로.
 *
 * 태스크의 종일 시각은 클라이언트 로컬 자정으로 저장되므로(예: KST 8/20 00:00 =
 * 2026-08-19T15:00Z) UTC로 읽으면 하루가 밀린다. Google 종일 이벤트로 내보낼 때는
 * 반드시 사용자 타임존 기준으로 날짜를 뽑아야 한다.
 */
export function zonedDateString(date: Date, timeZone: string): string {
  // en-CA 로케일이 YYYY-MM-DD 형식을 준다
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** 이벤트가 걸쳐 있는 날짜 키 목록 (종일은 UTC, 시간 지정은 로컬 기준) */
export function eventDayKeys(ev: {
  startAt: Date;
  endAt: Date;
  allDay: boolean;
}): DayKey[] {
  const keys: DayKey[] = [];
  if (ev.allDay) {
    // endAt은 배타적(exclusive)
    let cur = new Date(ev.startAt);
    const end = ev.endAt > ev.startAt ? ev.endAt : addDays(ev.startAt, 1);
    let guard = 0;
    while (cur < end && guard++ < 400) {
      keys.push(utcDayKey(cur));
      cur = new Date(cur.getTime() + 86400000);
    }
  } else {
    let cur = startOfDay(ev.startAt);
    const end = ev.endAt > ev.startAt ? ev.endAt : ev.startAt;
    let guard = 0;
    while (cur <= startOfDay(end) && guard++ < 400) {
      // 정확히 자정에 끝나는 일정은 그 날을 차지하지 않음
      if (cur.getTime() === startOfDay(end).getTime() && end.getTime() === startOfDay(end).getTime() && keys.length > 0) {
        break;
      }
      keys.push(dayKey(cur));
      cur = addDays(cur, 1);
    }
  }
  return keys;
}

/** 종일 이벤트 표시는 UTC 기준으로 포맷해야 날짜가 밀리지 않는다 */
export function formatAllDay(date: Date, pattern = "M월 d일"): string {
  const shifted = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
  return format(shifted, pattern);
}
