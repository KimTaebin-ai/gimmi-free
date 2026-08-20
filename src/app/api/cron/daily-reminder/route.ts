import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runDailyReminder } from "@/lib/notify/daily-reminder";
import { hasDiscordWebhook } from "@/lib/notify/discord";

/**
 * 저녁 알림 — **매시간** 불려야 한다.
 *
 * Vercel Hobby 크론은 하루 한 번만 돌 수 있어서(더 잦은 식은 배포 자체가 거부된다)
 * 이 경로는 Vercel 크론이 아니라 GitHub Actions가 매시간 호출한다
 * (`.github/workflows/daily-reminder.yml`). 매시간 깨어나 "지금 이 사람 동네가
 * 알림 시각인가"를 따지는 구조라야 위치가 바뀌어도 그 지역 18시에 울린다.
 *
 * CRON_SECRET이 설정돼 있으면 Bearer 검증을 요구한다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!hasDiscordWebhook()) {
    return NextResponse.json({ skipped: "DISCORD_WEBHOOK_URL 미설정" });
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  const results: Record<string, unknown> = {};

  for (const { id } of users) {
    try {
      results[id] = await runDailyReminder(id);
    } catch (err) {
      // 한 사람이 실패해도 나머지는 계속 — 그리고 실패는 보낸 기록을 남기지 않으므로
      // 다음 시간에 다시 시도된다.
      console.error(`[reminder] ${id} 실패:`, err);
      results[id] = { sent: false, error: err instanceof Error ? err.message : "unknown" };
    }
  }

  return NextResponse.json({ checkedAt: new Date().toISOString(), results });
}
