import "server-only";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { dateKeyInTimeZone, hourInTimeZone } from "@/lib/timezone";
import { hasDiscordWebhook, sendDiscordMessage } from "@/lib/notify/discord";
import {
  bucketTasks,
  buildReminderMessage,
  shouldRemind,
  type ReminderTask,
} from "@/lib/notify/reminder";

/**
 * 저녁 알림 한 바퀴.
 *
 * **매시간** 불려야 한다. 사용자가 있는 곳의 시계로 정해진 시각인지 그때그때 따지기
 * 때문이다. 서울에서 18시일 때와 시애틀에서 18시일 때는 UTC로 다른 순간이고,
 * 비행기를 타고 옮겨 다니면 그 순간도 바뀐다.
 */

/** 알림 문구를 만들 때 살펴볼 최대 태스크 수 */
const MAX_TASKS = 200;

export type ReminderOutcome =
  | { sent: false; reason: string }
  | { sent: true; overdue: number; today: number; later: number };

export async function runDailyReminder(userId: string): Promise<ReminderOutcome> {
  if (!hasDiscordWebhook()) return { sent: false, reason: "DISCORD_WEBHOOK_URL 미설정" };

  const [user, settings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, lastReminderOn: true },
    }),
    getSettings(userId),
  ]);
  if (!user) return { sent: false, reason: "사용자 없음" };
  if (!settings.discordReminder) return { sent: false, reason: "알림 꺼짐" };

  const now = new Date();
  const timeZone = user.timezone;
  const todayKey = dateKeyInTimeZone(now, timeZone);
  const localHour = hourInTimeZone(now, timeZone);

  // 시각이 안 맞으면 태스크를 세어 볼 것도 없다 — 매시간 도는 경로라 값싸야 한다
  if (localHour !== settings.reminderHour) {
    return { sent: false, reason: `${timeZone} ${localHour}시 (알림은 ${settings.reminderHour}시)` };
  }
  if (user.lastReminderOn === todayKey) {
    return { sent: false, reason: `${todayKey}에 이미 보냄` };
  }

  const rows = await prisma.task.findMany({
    where: { userId, status: "todo", parentId: null },
    select: { title: true, dueAt: true, startAt: true, allDay: true, priority: true },
    take: MAX_TASKS,
  });
  const tasks: ReminderTask[] = rows;

  if (
    !shouldRemind({
      localHour,
      reminderHour: settings.reminderHour,
      todayKey,
      lastSentOn: user.lastReminderOn,
      openTaskCount: tasks.length,
    })
  ) {
    return { sent: false, reason: "보낼 조건 아님(남은 태스크 없음)" };
  }

  const buckets = bucketTasks(tasks, timeZone, todayKey);
  await sendDiscordMessage(buildReminderMessage(buckets, timeZone));

  // 보낸 뒤에 기록한다. 전송이 실패하면 남기지 않아 다음 시간에 다시 시도된다
  // — 알림은 한 번 놓치면 그날은 끝이므로, 중복보다 누락이 더 아깝다.
  await prisma.user.update({ where: { id: userId }, data: { lastReminderOn: todayKey } });

  return {
    sent: true,
    overdue: buckets.overdue.length,
    today: buckets.today.length,
    later: buckets.later.length,
  };
}
