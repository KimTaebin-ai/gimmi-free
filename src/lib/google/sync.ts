import "server-only";
import { addDays } from "date-fns";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken, GoogleAuthError } from "@/lib/google/tokens";
import {
  listEvents,
  SyncTokenExpiredError,
  type GoogleEvent,
  type GoogleEventDateTime,
} from "@/lib/google/calendar";
import { parseAllDayDate } from "@/lib/calendar-utils";

/** 전체 동기화 창: 과거 60일 ~ 미래 400일 */
const WINDOW_PAST_DAYS = 60;
const WINDOW_FUTURE_DAYS = 400;

export interface SyncResult {
  upserted: number;
  deleted: number;
  incremental: boolean;
}

function parseBoundary(dt: GoogleEventDateTime | undefined): {
  at: Date;
  allDay: boolean;
} | null {
  if (!dt) return null;
  if (dt.date) return { at: parseAllDayDate(dt.date), allDay: true };
  if (dt.dateTime) return { at: new Date(dt.dateTime), allDay: false };
  return null;
}

/**
 * Google Calendar → 로컬 CalendarEvent 캐시로 pull.
 * syncToken이 있으면 증분, 없거나 만료(410)면 전체 동기화.
 */
export async function syncGoogleCalendar(userId: string): Promise<SyncResult> {
  const accessToken = await getGoogleAccessToken(userId);
  const state = await prisma.calendarSyncState.findUnique({ where: { userId } });
  const calendarId = state?.calendarId ?? "primary";

  const fullWindow = {
    calendarId,
    timeMin: addDays(new Date(), -WINDOW_PAST_DAYS),
    timeMax: addDays(new Date(), WINDOW_FUTURE_DAYS),
  };

  let events: GoogleEvent[];
  let nextSyncToken: string | undefined;
  let incremental = !!state?.syncToken;

  try {
    ({ events, nextSyncToken } = await listEvents(accessToken, {
      calendarId,
      syncToken: state?.syncToken ?? null,
      ...(state?.syncToken ? {} : fullWindow),
    }));
  } catch (err) {
    if (!(err instanceof SyncTokenExpiredError)) throw err;
    // 토큰 만료 → 전체 동기화로 폴백
    incremental = false;
    ({ events, nextSyncToken } = await listEvents(accessToken, fullWindow));
  }

  // 앱이 Google로 밀어올린 태스크 이벤트는 캐시에 중복 저장하지 않는다
  const taskEventIds = new Set(
    (
      await prisma.task.findMany({
        where: { userId, googleEventId: { not: null } },
        select: { googleEventId: true },
      })
    ).map((t) => t.googleEventId!),
  );

  let upserted = 0;
  const toDelete: string[] = [];

  for (const ev of events) {
    if (!ev.id) continue;
    if (taskEventIds.has(ev.id)) continue;

    const start = parseBoundary(ev.start);
    const end = parseBoundary(ev.end);
    if (ev.status === "cancelled" || !start || !end) {
      toDelete.push(ev.id);
      continue;
    }

    await prisma.calendarEvent.upsert({
      where: { userId_googleEventId: { userId, googleEventId: ev.id } },
      create: {
        userId,
        googleEventId: ev.id,
        calendarId,
        title: ev.summary ?? "(제목 없음)",
        description: ev.description ?? null,
        startAt: start.at,
        endAt: end.at,
        allDay: start.allDay,
        location: ev.location ?? null,
        htmlLink: ev.htmlLink ?? null,
        source: "google",
      },
      update: {
        title: ev.summary ?? "(제목 없음)",
        description: ev.description ?? null,
        startAt: start.at,
        endAt: end.at,
        allDay: start.allDay,
        location: ev.location ?? null,
        htmlLink: ev.htmlLink ?? null,
        lastSyncedAt: new Date(),
      },
    });
    upserted++;
  }

  let deleted = 0;
  if (toDelete.length > 0) {
    const res = await prisma.calendarEvent.deleteMany({
      where: { userId, googleEventId: { in: toDelete } },
    });
    deleted = res.count;
  }

  // 전체 동기화였다면 창 안에서 Google에 없는 캐시는 정리
  if (!incremental) {
    const seen = events.map((e) => e.id).filter(Boolean);
    const stale = await prisma.calendarEvent.deleteMany({
      where: {
        userId,
        source: "google",
        startAt: { gte: fullWindow.timeMin, lte: fullWindow.timeMax },
        googleEventId: { notIn: seen.length > 0 ? seen : ["__none__"] },
      },
    });
    deleted += stale.count;
  }

  await prisma.calendarSyncState.upsert({
    where: { userId },
    create: {
      userId,
      calendarId,
      syncToken: nextSyncToken ?? null,
      lastSyncedAt: new Date(),
      lastError: null,
    },
    update: {
      syncToken: nextSyncToken ?? null,
      lastSyncedAt: new Date(),
      lastError: null,
    },
  });

  return { upserted, deleted, incremental };
}

/** 동기화 실패를 상태에 기록 (Cron/수동 동기화 공통) */
export async function recordSyncError(userId: string, err: unknown): Promise<void> {
  const message =
    err instanceof GoogleAuthError
      ? err.message
      : err instanceof Error
        ? err.message.slice(0, 300)
        : "알 수 없는 오류";
  await prisma.calendarSyncState.upsert({
    where: { userId },
    create: { userId, lastError: message },
    update: { lastError: message },
  });
}
