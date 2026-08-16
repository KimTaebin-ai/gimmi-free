import "server-only";
import { prisma } from "@/lib/prisma";

export interface AppSettings {
  /** 태스크를 Google Calendar 이벤트로 밀어올릴지 (마스터 스위치) */
  syncTasksToCalendar: boolean;
  /** 종일 태스크도 올릴지. 끄면 시간이 지정된 태스크만 올라간다. */
  syncAllDayTasks: boolean;

  /** 체성분 목표선 (차트에 점선으로 표시). null이면 표시 안 함 */
  goalWeightKg: number | null;
  goalMuscleKg: number | null;
  goalBodyFatPct: number | null;
}

export const DEFAULT_SETTINGS: AppSettings = {
  syncTasksToCalendar: true,
  syncAllDayTasks: true,
  goalWeightKg: null,
  goalMuscleKg: null,
  goalBodyFatPct: null,
};

export async function getSettings(userId: string): Promise<AppSettings> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { settings: true },
  });
  const stored = (user?.settings ?? {}) as Partial<AppSettings>;
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(
  userId: string,
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  const next = { ...(await getSettings(userId)), ...patch };
  await prisma.user.update({
    where: { id: userId },
    data: { settings: next },
  });
  return next;
}
