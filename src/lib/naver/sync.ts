import "server-only";
import { prisma } from "@/lib/prisma";
import { parseNaverRss, rssUrlFor, type NaverRssItem } from "@/lib/naver/rss";

export interface BlogSyncResult {
  /** 새로 저장된 글 */
  added: number;
  /** 이미 있어 갱신된 글 */
  updated: number;
  /** 피드가 준 글 수 */
  fetched: number;
  blogTitle: string | null;
  /** 피드는 정상인데 글이 0건 — 대개 블로그 RSS 설정이 꺼져 있다 */
  emptyFeed: boolean;
}

export class BlogSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlogSyncError";
  }
}

export function getBlogId(): string | null {
  return process.env.NAVER_BLOG_ID?.trim() || null;
}

async function fetchRss(blogId: string): Promise<string> {
  const res = await fetch(rssUrlFor(blogId), {
    cache: "no-store",
    headers: { "User-Agent": "PersonalLifeHub/1.0 (+RSS reader)" },
  });
  if (!res.ok) {
    throw new BlogSyncError(
      `네이버 RSS를 불러오지 못했습니다 (HTTP ${res.status}). 블로그 아이디를 확인해 주세요.`,
    );
  }
  return res.text();
}

async function upsertItems(
  userId: string,
  blogId: string,
  items: NaverRssItem[],
): Promise<{ added: number; updated: number }> {
  if (items.length === 0) return { added: 0, updated: 0 };

  const existing = new Set(
    (
      await prisma.blogPost.findMany({
        where: { userId, logNo: { in: items.map((i) => i.logNo) } },
        select: { logNo: true },
      })
    ).map((r) => r.logNo),
  );

  // logNo가 중복 판별 키. 제목·요약이 수정될 수 있으므로 기존 글도 갱신한다.
  for (const item of items) {
    await prisma.blogPost.upsert({
      where: { userId_logNo: { userId, logNo: item.logNo } },
      create: {
        userId,
        blogId,
        logNo: item.logNo,
        title: item.title,
        url: item.url,
        summary: item.summary,
        thumbnailUrl: item.thumbnailUrl,
        category: item.category,
        tags: item.tags,
        publishedAt: item.publishedAt,
        source: "rss",
      },
      update: {
        title: item.title,
        url: item.url,
        summary: item.summary,
        thumbnailUrl: item.thumbnailUrl,
        category: item.category,
        tags: item.tags,
        publishedAt: item.publishedAt,
        fetchedAt: new Date(),
      },
    });
  }

  const added = items.filter((i) => !existing.has(i.logNo)).length;
  return { added, updated: items.length - added };
}

/**
 * RSS를 읽어 로컬에 반영한다.
 *
 * 증분: RSS는 최근 글만 주므로 전체를 받아 logNo로 upsert하는 편이 단순하고 안전하다.
 * (마지막 발행일로 잘라내면 과거 글이 수정됐을 때 반영되지 않는다.)
 */
export async function syncNaverBlog(userId: string): Promise<BlogSyncResult> {
  const blogId = getBlogId();
  if (!blogId) {
    throw new BlogSyncError(
      "NAVER_BLOG_ID가 설정되어 있지 않습니다. .env에 블로그 아이디를 넣어 주세요.",
    );
  }

  const xml = await fetchRss(blogId);
  const feed = parseNaverRss(xml);
  const { added, updated } = await upsertItems(userId, blogId, feed.items);

  return {
    added,
    updated,
    fetched: feed.items.length,
    blogTitle: feed.blogTitle,
    emptyFeed: feed.items.length === 0,
  };
}
