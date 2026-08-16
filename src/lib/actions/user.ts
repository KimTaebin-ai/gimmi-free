"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";

/** IANA 타임존인지 확인 (임의 문자열이 저장되는 걸 막는다) */
function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function getUserTimeZone(): Promise<string> {
  const userId = await requireUserId();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return user?.timezone ?? "Asia/Seoul";
}

/**
 * 브라우저가 있는 위치의 타임존을 저장한다.
 * 서버에서 "오늘"을 계산하거나 Cron이 도는 경우를 위해 필요하다.
 * 실제 화면 렌더링은 브라우저 타임존을 그대로 쓰므로 해외에서도 즉시 맞는다.
 */
export async function syncUserTimeZone(timeZone: string): Promise<string> {
  const userId = await requireUserId();
  if (!isValidTimeZone(timeZone)) return getUserTimeZone();

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  if (user?.timezone === timeZone) return timeZone;

  await prisma.user.update({ where: { id: userId }, data: { timezone: timeZone } });
  return timeZone;
}
