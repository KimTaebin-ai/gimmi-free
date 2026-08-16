import "server-only";
import { prisma } from "@/lib/prisma";

export interface AppSettings {
  /** 시간이 지정된 태스크를 Google Calendar 이벤트로 밀어올릴지 */
  syncTasksToCalendar: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  syncTasksToCalendar: true,
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
