"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { recordSyncError, syncGoogleCalendar } from "@/lib/google/sync";
import { CALENDAR_SCOPE, getGrantedScopes } from "@/lib/google/tokens";
import { taskInclude } from "@/lib/task-types";
import type { CalendarItem, CalendarSyncInfo } from "@/lib/calendar-types";

const HOUR_MS = 60 * 60 * 1000;

/**
 * 기간 내 캘린더 아이템(Google 이벤트 + 시간 있는 태스크)을 로컬 DB에서 읽는다.
 * Google 호출은 하지 않는다 — 동기화는 syncCalendarNow()/Cron이 담당.
 */
export async function listCalendarItems(
  fromIso: string,
  toIso: string,
): Promise<CalendarItem[]> {
  const userId = await requireUserId();
  const from = new Date(fromIso);
  const to = new Date(toIso);

  const [events, tasks] = await Promise.all([
    prisma.calendarEvent.findMany({
      // [startAt, endAt) 구간이 조회 구간과 겹치는 것
      where: { userId, startAt: { lt: to }, endAt: { gt: from } },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        userId,
        parentId: null,
        OR: [
          { startAt: { gte: from, lt: to } },
          { dueAt: { gte: from, lt: to } },
        ],
      },
      include: taskInclude,
      orderBy: { dueAt: "asc" },
    }),
  ]);

  const eventItems: CalendarItem[] = events.map((e) => ({
    kind: "event",
    id: e.id,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    description: e.description,
    htmlLink: e.htmlLink,
  }));

  const taskItems: CalendarItem[] = tasks.map((t) => {
    const start = t.startAt ?? t.dueAt!;
    const end =
      t.dueAt && t.startAt && t.dueAt > t.startAt
        ? t.dueAt
        : new Date(start.getTime() + (t.allDay ? 0 : HOUR_MS));
    return {
      kind: "task",
      id: t.id,
      title: t.title,
      startAt: start,
      endAt: end,
      allDay: t.allDay,
      priority: t.priority,
      status: t.status,
      task: t,
    };
  });

  return [...eventItems, ...taskItems].sort(
    (a, b) => a.startAt.getTime() - b.startAt.getTime(),
  );
}

/** 사용자가 동기화 버튼을 눌렀을 때 */
export async function syncCalendarNow(): Promise<CalendarSyncInfo> {
  const userId = await requireUserId();
  try {
    await syncGoogleCalendar(userId);
  } catch (err) {
    await recordSyncError(userId, err);
  }
  return getCalendarSyncInfo();
}

export async function getCalendarSyncInfo(): Promise<CalendarSyncInfo> {
  const userId = await requireUserId();
  const [state, grantedScopes] = await Promise.all([
    prisma.calendarSyncState.findUnique({ where: { userId } }),
    getGrantedScopes(userId),
  ]);
  return {
    connected: grantedScopes.includes(CALENDAR_SCOPE),
    lastSyncedAt: state?.lastSyncedAt ?? null,
    lastError: state?.lastError ?? null,
    grantedScopes,
  };
}
