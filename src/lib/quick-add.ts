import * as chrono from "chrono-node";
import { addDays, nextDay, set, startOfDay, type Day } from "date-fns";

export interface ParsedQuickAdd {
  title: string;
  dueAt: Date | null;
  allDay: boolean;
  priority: number; // 0 없음, 1 낮음, 2 중간, 3 높음
  tagNames: string[];
  rrule: string | null;
}

const PRIORITY_MAP: Record<string, number> = {
  높음: 3,
  중간: 2,
  낮음: 1,
  없음: 0,
  high: 3,
  medium: 2,
  low: 1,
  "3": 3,
  "2": 2,
  "1": 1,
};

const WEEKDAYS: Record<string, Day> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

const RRULE_BYDAY = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"] as const;

function cleanup(title: string): string {
  return title.replace(/\s{2,}/g, " ").trim();
}

/**
 * TickTick 스타일 퀵애드 입력을 파싱한다.
 * 예: "내일 오후 3시 병원 #건강 !높음", "매주 월요일 주간회의", "5/20 보고서 제출"
 */
export function parseQuickAdd(text: string, now = new Date()): ParsedQuickAdd {
  let rest = text;

  // --- 태그 (#태그) ---
  const tagNames: string[] = [];
  rest = rest.replace(/#([^\s#!]+)/g, (_, name: string) => {
    tagNames.push(name);
    return " ";
  });

  // --- 우선순위 (!높음 / !3) ---
  let priority = 0;
  rest = rest.replace(/!(높음|중간|낮음|없음|high|medium|low|[123])/gi, (_, p: string) => {
    priority = PRIORITY_MAP[p.toLowerCase()] ?? 0;
    return " ";
  });

  // --- 반복 규칙 ---
  let rrule: string | null = null;
  const recurRules: Array<[RegExp, (m: RegExpMatchArray) => string]> = [
    [/(?:^|\s)매일(?=\s|$)/, () => "FREQ=DAILY"],
    [/(?:^|\s)평일(?:마다)?(?=\s|$)/, () => "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"],
    [
      /(?:^|\s)매주\s*([일월화수목금토])요일(?=\s|$)/,
      (m) => `FREQ=WEEKLY;BYDAY=${RRULE_BYDAY[WEEKDAYS[m[1]]]}`,
    ],
    [/(?:^|\s)매주(?=\s|$)/, () => "FREQ=WEEKLY"],
    [
      /(?:^|\s)매월\s*(\d{1,2})일(?=\s|$)/,
      (m) => `FREQ=MONTHLY;BYMONTHDAY=${m[1]}`,
    ],
    [/(?:^|\s)매월(?=\s|$)/, () => "FREQ=MONTHLY"],
    [/(?:^|\s)매년(?=\s|$)/, () => "FREQ=YEARLY"],
  ];
  for (const [re, build] of recurRules) {
    const m = rest.match(re);
    if (m) {
      rrule = build(m);
      rest = rest.replace(re, " ");
      break;
    }
  }

  // --- 날짜 ---
  let datePart: Date | null = null;

  const relDays: Record<string, number> = { 오늘: 0, 내일: 1, 모레: 2, 글피: 3 };
  const relMatch = rest.match(/(?:^|\s)(오늘|내일|모레|글피)(?=\s|$)/);
  if (relMatch) {
    datePart = startOfDay(addDays(now, relDays[relMatch[1]]));
    rest = rest.replace(relMatch[0], " ");
  }

  if (!datePart) {
    // N일 후/뒤
    const m = rest.match(/(?:^|\s)(\d{1,3})일\s?(?:후|뒤)(?=\s|$)/);
    if (m) {
      datePart = startOfDay(addDays(now, parseInt(m[1], 10)));
      rest = rest.replace(m[0], " ");
    }
  }

  if (!datePart) {
    // (다음주|이번주)? X요일
    const m = rest.match(/(?:^|\s)(다음\s?주|담주|이번\s?주)?\s*([일월화수목금토])요일(?=\s|$)/);
    if (m) {
      const day = WEEKDAYS[m[2]];
      let d: Date;
      if (m[1] && /다음|담/.test(m[1])) {
        // "다음주 X요일" = 다음 주(월요일 시작)의 해당 요일
        const dow = now.getDay();
        const daysToNextMonday = (8 - dow) % 7 || 7;
        const nextMonday = startOfDay(addDays(now, daysToNextMonday));
        d = addDays(nextMonday, (day - 1 + 7) % 7);
      } else {
        // "X요일" = 오늘 이후 가장 가까운 해당 요일
        d = nextDay(startOfDay(now), day);
      }
      datePart = d;
      rest = rest.replace(m[0], " ");
    }
  }

  if (!datePart) {
    // M월 D일
    const m = rest.match(/(?:^|\s)(\d{1,2})월\s?(\d{1,2})일(?=\s|$)/);
    if (m) {
      const d = new Date(now.getFullYear(), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      datePart = d < startOfDay(now) ? new Date(now.getFullYear() + 1, parseInt(m[1], 10) - 1, parseInt(m[2], 10)) : d;
      rest = rest.replace(m[0], " ");
    }
  }

  if (!datePart) {
    // M/D
    const m = rest.match(/(?:^|\s)(\d{1,2})\/(\d{1,2})(?=\s|$)/);
    if (m) {
      const d = new Date(now.getFullYear(), parseInt(m[1], 10) - 1, parseInt(m[2], 10));
      datePart = d < startOfDay(now) ? new Date(now.getFullYear() + 1, parseInt(m[1], 10) - 1, parseInt(m[2], 10)) : d;
      rest = rest.replace(m[0], " ");
    }
  }

  // --- 시간 ---
  let hasTime = false;
  let hour = 0;
  let minute = 0;

  {
    // (오전|오후|저녁|밤|아침|새벽)? H시 (M분|반)?  /  HH:MM
    const m = rest.match(
      /(?:^|\s)(오전|오후|아침|점심|저녁|밤|새벽)?\s?(\d{1,2})시\s?(반|\d{1,2}분)?(?=\s|$)/,
    );
    const colonM = !m ? rest.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/) : null;
    if (m) {
      hour = parseInt(m[2], 10) % 24;
      const meridiem = m[1];
      if (meridiem && /오후|저녁|밤/.test(meridiem) && hour < 12) hour += 12;
      if (meridiem === "점심" && hour < 11) hour += 12;
      if (m[3] === "반") minute = 30;
      else if (m[3]) minute = parseInt(m[3], 10);
      hasTime = true;
      rest = rest.replace(m[0], " ");
    } else if (colonM) {
      hour = parseInt(colonM[1], 10) % 24;
      minute = parseInt(colonM[2], 10) % 60;
      hasTime = true;
      rest = rest.replace(colonM[0], " ");
    }
  }

  // --- 한국어 패턴이 없으면 chrono(영어)로 폴백 ---
  if (!datePart && !hasTime) {
    const results = chrono.parse(rest, now, { forwardDate: true });
    if (results.length > 0) {
      const r = results[0];
      datePart = startOfDay(r.start.date());
      if (r.start.isCertain("hour")) {
        hasTime = true;
        hour = r.start.get("hour") ?? 0;
        minute = r.start.get("minute") ?? 0;
      }
      rest = rest.replace(r.text, " ");
    }
  }

  // --- 조합 ---
  let dueAt: Date | null = null;
  if (datePart && hasTime) {
    dueAt = set(datePart, { hours: hour, minutes: minute });
  } else if (datePart) {
    dueAt = datePart;
  } else if (hasTime) {
    // 시간만 있으면 오늘(이미 지났으면 내일)
    let d = set(startOfDay(now), { hours: hour, minutes: minute });
    if (d < now) d = addDays(d, 1);
    dueAt = d;
  } else if (rrule) {
    // 반복만 있으면 오늘부터 시작
    dueAt = startOfDay(now);
  }

  return {
    title: cleanup(rest),
    dueAt,
    allDay: !hasTime,
    priority,
    tagNames,
    rrule,
  };
}
