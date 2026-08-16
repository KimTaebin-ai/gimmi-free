/**
 * Prisma의 @db.Date 컬럼과 주고받는 날짜 처리.
 *
 * 날짜만 있는 값(운동 날짜, 체성분 측정일)은 시각이 붙으면 타임존에 따라 하루가
 * 밀리므로, 서버-클라이언트 사이에서는 항상 "yyyy-MM-dd" 문자열로 다루고
 * DB에는 UTC 자정으로 저장한다.
 */

export function toDateOnly(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

export function fromDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** 로컬 달력 기준 오늘 (브라우저에서 호출) */
export function todayDateString(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "yyyy-MM-dd" → 로컬 자정 Date (화면 표시/포맷용) */
export function parseDateOnlyLocal(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function shiftDateString(dateStr: string, days: number): string {
  const d = parseDateOnlyLocal(dateStr);
  d.setDate(d.getDate() + days);
  return todayDateString(d);
}
