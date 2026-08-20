/**
 * 저녁 알림의 판단과 문구 — 순수 함수라 테스트 대상이다(네트워크는 discord.ts).
 *
 * 기준은 **사용자가 있는 곳의 시계**다. 서버는 UTC로 돌지만 "18시"는 서울과 시애틀이
 * 다르므로, 매시간 깨어나 "지금 이 사람 동네가 18시인가"를 따져 보는 구조다.
 */

import { dateKeyInTimeZone, floatingDateKey } from "@/lib/timezone";

/** 알림에 필요한 태스크의 최소 형태 */
export interface ReminderTask {
  title: string;
  /** 시간이 지정된 값은 instant, 종일은 떠 있는 날짜(UTC 자정) */
  dueAt: Date | null;
  startAt: Date | null;
  allDay: boolean;
  priority: number;
}

export interface Bucketed {
  /** 오늘보다 이전에 끝냈어야 하는 것 */
  overdue: ReminderTask[];
  /** 오늘까지인 것 */
  today: ReminderTask[];
  /** 날짜가 아직 남았거나 날짜가 없는 것 */
  later: ReminderTask[];
}

/**
 * 태스크의 마감 날짜를 **그 사람 달력의 "YYYY-MM-DD"** 로.
 *
 * 종일과 시간지정을 각자의 기준으로 읽는다(`AGENTS.md`의 날짜 규칙).
 * 한 기준으로 묶으면 UTC 오프셋이 음수인 지역에서 하루가 어긋난다.
 */
export function dueDateKey(task: ReminderTask, timeZone: string): string | null {
  const due = task.dueAt ?? task.startAt;
  if (!due) return null;
  return task.allDay ? floatingDateKey(due) : dateKeyInTimeZone(due, timeZone);
}

/** 우선순위가 높고(3→0) 마감이 이른 순 */
function byUrgency(a: ReminderTask, b: ReminderTask): number {
  if (a.priority !== b.priority) return b.priority - a.priority;
  const at = (a.dueAt ?? a.startAt)?.getTime() ?? Infinity;
  const bt = (b.dueAt ?? b.startAt)?.getTime() ?? Infinity;
  return at - bt;
}

/** 미완료 태스크를 지연 / 오늘 / 나중으로 가른다 */
export function bucketTasks(
  tasks: ReminderTask[],
  timeZone: string,
  todayKey: string,
): Bucketed {
  const out: Bucketed = { overdue: [], today: [], later: [] };

  for (const task of tasks) {
    const key = dueDateKey(task, timeZone);
    if (key === null) out.later.push(task);
    else if (key < todayKey) out.overdue.push(task);
    else if (key === todayKey) out.today.push(task);
    else out.later.push(task);
  }

  out.overdue.sort(byUrgency);
  out.today.sort(byUrgency);
  out.later.sort(byUrgency);
  return out;
}

/**
 * 지금 알림을 보내야 하는지.
 *
 * 매시간 불리므로 두 가지를 본다 — 그 동네가 정한 시각인가, 그리고 **오늘 이미 보냈는가**.
 * 보낸 날을 사용자 현지 날짜로 기록해 두면 시간대를 옮겨 다녀도 하루에 한 번만 간다.
 */
export function shouldRemind(input: {
  localHour: number;
  reminderHour: number;
  todayKey: string;
  lastSentOn: string | null;
  openTaskCount: number;
}): boolean {
  if (input.openTaskCount === 0) return false;
  if (input.localHour !== input.reminderHour) return false;
  return input.lastSentOn !== input.todayKey;
}

/** 목록에 넣을 최대 개수 — 알림이 스크롤되면 아무도 안 읽는다 */
const MAX_LISTED = 8;

const PRIORITY_MARK = ["", "🔵", "🟡", "🔴"] as const;

function line(task: ReminderTask, timeZone: string): string {
  const mark = PRIORITY_MARK[task.priority] ?? "";
  const due = task.dueAt ?? task.startAt;
  const when =
    due && !task.allDay
      ? ` — ${new Intl.DateTimeFormat("ko-KR", {
          timeZone,
          hour: "numeric",
          minute: "2-digit",
        }).format(due)}`
      : "";
  return `• ${mark}${mark ? " " : ""}${task.title}${when}`;
}

/**
 * 디스코드에 보낼 본문.
 *
 * 지연 → 오늘 순으로 싣는다. 날짜가 남은 것은 개수만 알린다 —
 * 저녁 알림이 할 일은 "오늘 뭐가 남았나"에 답하는 것이지 전체 목록을 읊는 게 아니다.
 */
export function buildReminderMessage(buckets: Bucketed, timeZone: string): string {
  const parts: string[] = [];
  const urgent = buckets.overdue.length + buckets.today.length;

  parts.push(
    urgent > 0
      ? `**오늘 안에 볼 일이 ${urgent}건 남았어요.**`
      : `**오늘 마감인 일은 없어요.** 남은 할 일 ${buckets.later.length}건.`,
  );

  if (buckets.overdue.length > 0) {
    parts.push(
      "",
      `__지연 ${buckets.overdue.length}건__`,
      ...buckets.overdue.slice(0, MAX_LISTED).map((t) => line(t, timeZone)),
    );
    if (buckets.overdue.length > MAX_LISTED) {
      parts.push(`…외 ${buckets.overdue.length - MAX_LISTED}건`);
    }
  }

  if (buckets.today.length > 0) {
    const room = Math.max(2, MAX_LISTED - Math.min(buckets.overdue.length, MAX_LISTED));
    parts.push(
      "",
      `__오늘 마감 ${buckets.today.length}건__`,
      ...buckets.today.slice(0, room).map((t) => line(t, timeZone)),
    );
    if (buckets.today.length > room) parts.push(`…외 ${buckets.today.length - room}건`);
  }

  if (urgent > 0 && buckets.later.length > 0) {
    parts.push("", `날짜가 남은 일 ${buckets.later.length}건`);
  }

  return parts.join("\n");
}
