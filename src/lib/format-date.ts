import {
  format,
  isPast,
  isSameDay,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
} from "date-fns";
import { ko } from "date-fns/locale";
import { forDisplay } from "@/lib/timezone";

/**
 * 종일 값은 "떠 있는 날짜"(UTC 자정)로 저장되므로 표시 전에 로컬 달력 날짜로
 * 환산해야 한다. forDisplay가 그 환산을 담당한다(자세한 규칙은 lib/timezone.ts).
 */
/** 시각은 빼고 날짜만 (예: "오늘", "8월 20일 (목)") */
export function formatDayLabel(value: Date, allDay: boolean): string {
  const d = forDisplay(value, allDay);
  if (isToday(d)) return "오늘";
  if (isTomorrow(d)) return "내일";
  if (isYesterday(d)) return "어제";
  if (isThisYear(d)) return format(d, "M월 d일 (EEE)", { locale: ko });
  return format(d, "yyyy년 M월 d일", { locale: ko });
}

export function formatDue(value: Date, allDay: boolean): string {
  const day = formatDayLabel(value, allDay);
  if (allDay) return day;
  return `${day} ${format(value, "a h:mm", { locale: ko })}`;
}

/** 시작/마감을 함께 고려한 일정 요약. 예: "오늘 오후 3:00–5:00", "내일 오후 2:00 시작" */
export function formatSchedule(
  startAt: Date | null,
  dueAt: Date | null,
  allDay: boolean,
): string | null {
  if (startAt && dueAt) {
    const s = forDisplay(startAt, allDay);
    const e = forDisplay(dueAt, allDay);
    if (isSameDay(s, e)) {
      return allDay
        ? formatDue(startAt, true)
        : `${formatDue(startAt, false)}–${format(e, "a h:mm", { locale: ko })}`;
    }
    return `${formatDue(startAt, allDay)} → ${formatDue(dueAt, allDay)}`;
  }
  if (dueAt) return formatDue(dueAt, allDay);
  if (startAt) return `${formatDue(startAt, allDay)} 시작`;
  return null;
}

export function isOverdue(dueAt: Date, allDay: boolean): boolean {
  if (allDay) {
    // 종일은 그 날이 지나야 지연
    return forDisplay(dueAt, true) < startOfDay(new Date());
  }
  return isPast(dueAt);
}

/** rrule 문자열의 간단한 한국어 요약 */
export function describeRrule(rrule: string): string {
  if (rrule.includes("FREQ=DAILY")) return "매일";
  if (rrule.includes("BYDAY=MO,TU,WE,TH,FR")) return "평일";
  if (rrule.includes("FREQ=WEEKLY")) {
    const m = rrule.match(/BYDAY=([A-Z]{2})/);
    const days: Record<string, string> = {
      MO: "월", TU: "화", WE: "수", TH: "목", FR: "금", SA: "토", SU: "일",
    };
    return m ? `매주 ${days[m[1]]}요일` : "매주";
  }
  if (rrule.includes("FREQ=MONTHLY")) {
    const m = rrule.match(/BYMONTHDAY=(\d+)/);
    return m ? `매월 ${m[1]}일` : "매월";
  }
  if (rrule.includes("FREQ=YEARLY")) return "매년";
  return "반복";
}

export const RRULE_PRESETS: { value: string; label: string }[] = [
  { value: "FREQ=DAILY", label: "매일" },
  { value: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", label: "평일" },
  { value: "FREQ=WEEKLY", label: "매주" },
  { value: "FREQ=MONTHLY", label: "매월" },
  { value: "FREQ=YEARLY", label: "매년" },
];
