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
 * 결정사항: "시간이 지정된"(allDay=false) 미완료 태스크만 캘린더에 올린다.
 * 종일 태스크까지 올리면 캘린더가 할 일로 뒤덮이므로 제외.
 */
function isEligible(task: PushableTask): boolean {
  return (
    !task.allDay && task.status === "todo" && !!(task.startAt ?? task.dueAt)
  );
}

function buildPayload(task: PushableTask): EventWritePayload {
  const start = task.startAt ?? task.dueAt!;
  let end = task.dueAt ?? task.startAt!;
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
export async function pushTaskToGoogle(userId: string, taskId: string): Promise<void> {
  try {
    const settings = await getSettings(userId);
    if (!settings.syncTasksToCalendar) return;

    const task = await prisma.task.findUnique({
      where: { id: taskId, userId },
      select: {
        id: true,
        title: true,
        note: true,
        startAt: true,
        dueAt: true,
        allDay: true,
        status: true,
        googleEventId: true,
      },
    });
    if (!task) return;

    const accessToken = await getGoogleAccessToken(userId);

    if (!isEligible(task)) {
      // 조건에서 벗어났으면(시간 제거/완료 등) 캘린더에서 내린다
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
  } catch (err) {
    console.error(`[calendar] 태스크 ${taskId} push 실패:`, err);
  }
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
