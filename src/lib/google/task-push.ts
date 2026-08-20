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
import { floatingDateKey } from "@/lib/timezone";

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
 *
 * 날짜가 있으면 대상이다. **완료 여부는 보지 않는다** — 완료했다고 캘린더에서 지우면
 * 그날 무엇을 했는지가 사라진다. 캘린더는 계획표이면서 동시에 기록이고,
 * 지난 날짜를 되짚을 때 필요한 건 "하기로 했던 것"이 아니라 "한 것"이다.
 * 대신 제목에 표시를 붙여 완료된 일임을 알 수 있게 한다(`buildPayload`).
 */
function isEligible(task: PushableTask, allowAllDay: boolean): boolean {
  if (!(task.startAt ?? task.dueAt)) return false;
  return allowAllDay || !task.allDay;
}

/** 완료 표시. Google 캘린더에는 완료 개념이 없어서 제목으로 나타내는 수밖에 없다. */
const DONE_PREFIX = "✓ ";

function titleFor(task: PushableTask): string {
  // 이미 붙어 있으면 또 붙이지 않는다(다시 push될 때 ✓✓ 가 되지 않도록)
  const bare = task.title.startsWith(DONE_PREFIX) ? task.title.slice(DONE_PREFIX.length) : task.title;
  return task.status === "done" ? `${DONE_PREFIX}${bare}` : bare;
}

function buildPayload(task: PushableTask): EventWritePayload {
  const start = task.startAt ?? task.dueAt!;
  const rawEnd = task.dueAt ?? task.startAt!;

  if (task.allDay) {
    // 종일 값은 떠 있는 날짜(UTC 자정)로 저장되므로 UTC 날짜를 그대로 쓴다.
    // Google의 종료일은 배타적이라 +1일.
    const endExclusive = new Date(
      Math.max(rawEnd.getTime(), start.getTime()) + 86400000,
    );
    return {
      summary: titleFor(task),
      description: task.note ?? undefined,
      start: { date: floatingDateKey(start) },
      end: { date: floatingDateKey(endExclusive) },
    };
  }

  let end = rawEnd;
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + DEFAULT_DURATION_MS);
  }
  return {
    summary: titleFor(task),
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
  task: PushableTask,
  accessToken: string,
  allowAllDay: boolean,
): Promise<void> {
  if (!isEligible(task, allowAllDay)) {
    // 조건에서 벗어났으면(날짜 제거/설정 변경) 캘린더에서 내린다
    if (task.googleEventId) {
      await deleteEvent(accessToken, task.googleEventId);
      await prisma.task.update({
        where: { id: task.id },
        data: { googleEventId: null },
      });
    }
    return;
  }

  const payload = buildPayload(task);
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
    const [settings, task] = await Promise.all([
      getSettings(userId),
      prisma.task.findUnique({ where: { id: taskId, userId }, select: TASK_SELECT }),
    ]);
    if (!settings.syncTasksToCalendar || !task) return;

    const accessToken = await getGoogleAccessToken(userId);
    await pushOne(task, accessToken, settings.syncAllDayTasks);
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

  // 백필은 **미완료만** 한다. 완료 태스크까지 소급해 만들면 예전에 끝낸 일이
  // 어느 날 갑자기 캘린더에 우르르 생긴다. 완료해도 남는 건 이미 올라간 이벤트다.
  const tasks = await prisma.task.findMany({
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
  });
  if (tasks.length === 0) return { pushed: 0, failed: 0 };

  const accessToken = await getGoogleAccessToken(userId);
  let pushed = 0;
  let failed = 0;

  for (const task of tasks) {
    try {
      await pushOne(task, accessToken, settings.syncAllDayTasks);
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
