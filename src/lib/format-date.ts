import { format, isPast, isThisYear, isToday, isTomorrow, isYesterday } from "date-fns";
import { ko } from "date-fns/locale";

export function formatDue(dueAt: Date, allDay: boolean): string {
  let day: string;
  if (isToday(dueAt)) day = "오늘";
  else if (isTomorrow(dueAt)) day = "내일";
  else if (isYesterday(dueAt)) day = "어제";
  else if (isThisYear(dueAt)) day = format(dueAt, "M월 d일 (EEE)", { locale: ko });
  else day = format(dueAt, "yyyy년 M월 d일", { locale: ko });

  if (allDay) return day;
  return `${day} ${format(dueAt, "a h:mm", { locale: ko })}`;
}

export function isOverdue(dueAt: Date, allDay: boolean): boolean {
  if (allDay) return isPast(dueAt) && !isToday(dueAt);
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
