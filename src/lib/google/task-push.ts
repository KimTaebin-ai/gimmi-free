import "server-only";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/google/tokens";
import {
  deleteEvent,
  insertEvent,
  patchEvent,
  type EventWritePayload,
} from "@/lib/google/calendar";
import { getSettings } from "@/lib/settings";
import { zonedDateString } from "@/lib/calendar-utils";

const DEFAULT_DURATION_MS = 60 * 60 * 1000; // 종료 시각이 없을 때 1시간

interface PushableTask {
  id: string;
  title: string;
  note: string | null;
  startAt: Date | null;
  dueAt: Date | null;
  allDay: boolean;
  status: string;
  googleEventId: string | null;
}

/**
 * Google 이벤트로 내보낼 대상인지.
 * 날짜가 있는 미완료 태스크. 종일 태스크 포함 여부는 설정으로 결정한다.
 */
function isEligible(task: PushableTask, allowAllDay: boolean): boolean {
  if (task.status !== "todo") return false;
  if (!(task.startAt ?? task.dueAt)) return false;
  return allowAllDay || !task.allDay;
}

function buildPayload(task: PushableTask, timeZone: string): EventWritePayload {
  const start = task.startAt ?? task.dueAt!;
  const rawEnd = task.dueAt ?? task.startAt!;

  if (task.allDay) {
    // 종일 이벤트는 date(YYYY-MM-DD). 종료일은 배타적이라 +1일.
    // 저장된 값이 로컬 자정이므로 사용자 타임존으로 날짜를 뽑아야 하루가 밀리지 않는다.
    const endExclusive = new Date(
      Math.max(rawEnd.getTime(), start.getTime()) + 86400000,
    );
    return {
      summary: task.title,
      description: task.note ?? undefined,
      start: { date: zonedDateString(start, timeZone) },
      end: { date: zonedDateString(endExclusive, timeZone) },
    };
  }

  let end = rawEnd;
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  }
  return {
    summary: task.title,
    description: task.note ?? undefined,
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
  };
}

/**
 * 태스크 변경을 Google Calendar에 반영한다(best-effort).
 * Google 호출이 실패해도 태스크 저장 자체는 성공한 뒤이므로 예외를 삼키고 로그만 남긴다.
 */
const TASK_SELECT = {
  id: true,
  title: true,
  note: true,
  startAt: true,
  dueAt: true,
  allDay: true,
  status: true,
  googleEventId: true,
} as const;

/** 실제 전송 로직 (예외를 던진다 — 호출부에서 처리) */
async function pushOne(
  userId: string,
  task: PushableTask,
  accessToken: string,
  timeZone: string,
  allowAllDay: boolean,
): Promise<void> {
  if (!isEligible(task, allowAllDay)) {
    // 조건에서 벗어났으면(완료/날짜 제거/설정 변경) 캘린더에서 내린다
    if (task.googleEventId) {
      await deleteEvent(accessToken, task.googleEventId);
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: null },
      });
    }
    return;
  }

  const payload = buildPayload(task, timeZone);
  if (task.googleEventId) {
    await patchEvent(accessToken, task.googleEventId, payload);
  } else {
    const created = await insertEvent(accessToken, payload);
    await prisma.task.update({
      where: { id: task.id },
      data: { googleEventId: created.id },
    });
  }
}

export async function pushTaskToGoogle(userId: string, taskId: string): Promise<void> {
  try {
    const [settings, user, task] = await Promise.all([
      getSettings(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
      prisma.task.findUnique({ where: { id: taskId, userId }, select: TASK_SELECT }),
    ]);
    if (!settings.syncTasksToCalendar || !task) return;

    const accessToken = await getGoogleAccessToken(userId);
    await pushOne(
      userId,
      task,
      accessToken,
      user?.timezone ?? "Asia/Seoul",
      settings.syncAllDayTasks,
    );
  } catch (err) {
    console.error(`[calendar] 태스크 ${taskId} push 실패:`, err);
  }
}

/**
 * 아직 Google에 올라가지 않은 태스크를 일괄 전송한다.
 * 권한이 없던 시절에 만든 태스크나 push가 실패했던 건은 재시도 없이 영영 누락되므로,
 * 동기화할 때마다 백필한다.
 */
export async function backfillTaskEvents(
  userId: string,
): Promise<{ pushed: number; failed: number }> {
  const settings = await getSettings(userId);
  if (!settings.syncTasksToCalendar) return { pushed: 0, failed: 0 };

  const [user, tasks] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    prisma.task.findMany({
      where: {
        userId,
        status: "todo",
        googleEventId: null,
        parentId: null,
        ...(settings.syncAllDayTasks ? {} : { allDay: false }),
        OR: [{ startAt: { not: null } }, { dueAt: { not: null } }],
      },
      select: TASK_SELECT,
      take: 200,
    }),
  ]);
  if (tasks.length === 0) return { pushed: 0, failed: 0 };

  const accessToken = await getGoogleAccessToken(userId);
  const timeZone = user?.timezone ?? "Asia/Seoul";
  let pushed = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      await pushOne(userId, task, accessToken, timeZone, settings.syncAllDayTasks);
      pushed++;
    } catch (err) {
      failed++;
      console.error(`[calendar] 백필 실패 (${task.id}):`, err);
    }
  }
  return { pushed, failed };
}

/** 태스크 삭제 시 대응 이벤트도 제거 (삭제 전에 호출) */
export async function removeTaskFromGoogle(
  userId: string,
  googleEventId: string | null,
): Promise<void> {
  if (!googleEventId) return;
  try {
    const settings = await getSettings(userId);
    if (!settings.syncTasksToCalendar) return;
    const accessToken = await getGoogleAccessToken(userId);
    await deleteEvent(accessToken, googleEventId);
  } catch (err) {
    console.error(`[calendar] 이벤트 ${googleEventId} 삭제 실패:`, err);
  }
}
