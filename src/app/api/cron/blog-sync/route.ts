import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getBlogId, syncNaverBlog } from "@/lib/naver/sync";

/**
 * 네이버 블로그 RSS 주기 동기화 (vercel.json에서 1시간마다 호출).
 * CRON_SECRET이 설정돼 있으면 Bearer 검증을 요구한다.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  if (!getBlogId()) {
    return NextResponse.json({ skipped: "NAVER_BLOG_ID 미설정" });
  }

  // 단일 사용자 앱이지만, 소유자 계정을 명시적으로 찾아 돌린다
  const users = await prisma.user.findMany({ select: { id: true } });
  const results: Record<string, string> = {};

  for (const { id } of users) {
    try {
      const r = await syncNaverBlog(id);
      results[id] = r.emptyFeed
        ? "empty feed (RSS 설정 확인 필요)"
        : `ok (+${r.added} new / ${r.updated} updated)`;
    } catch (err) {
      results[id] = `error: ${err instanceof Error ? err.message : "unknown"}`;
    }
  }

  return NextResponse.json({ syncedAt: new Date().toISOString(), results });
}
