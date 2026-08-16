import { prisma } from "@/lib/prisma";
import { recordSyncError, syncGoogleCalendar } from "@/lib/google/sync";
import { backfillTaskEvents } from "@/lib/google/task-push";

// Vercel Cron이 주기적으로 호출 (vercel.json 참고).
// CRON_SECRET이 설정돼 있으면 Authorization 헤더로 검증한다.
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = request.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  // 단일 사용자 앱이지만, Google을 연결한 계정 전체를 순회한다
  const accounts = await prisma.account.findMany({
    where: { provider: "google" },
    select: { userId: true },
    distinct: ["userId"],
  });

  const results: Record<string, string> = {};
  for (const { userId } of accounts) {
    try {
      const b = await backfillTaskEvents(userId);
      const r = await syncGoogleCalendar(userId);
      results[userId] =
        `ok (+${r.upserted}/-${r.deleted}${r.incremental ? ", incremental" : ", full"}` +
        `${b.pushed || b.failed ? `, backfill +${b.pushed}/!${b.failed}` : ""})`;
    } catch (err) {
      await recordSyncError(userId, err);
      results[userId] = `error: ${err instanceof Error ? err.message.slice(0, 120) : "unknown"}`;
    }
  }

  return Response.json({ syncedAt: new Date().toISOString(), results });
}
