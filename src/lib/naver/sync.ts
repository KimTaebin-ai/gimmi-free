import "server-only";
import { prisma } from "@/lib/prisma";
import {
  NaverPostListError,
  parsePostList,
  postListUrl,
  refererFor,
  type NaverBlogPost,
} from "@/lib/naver/crawl";

export interface BlogSyncResult {
  /** 새로 저장된 글 */
  added: number;
  /** 이미 있어 갱신된 글 */
  updated: number;
  /** 네이버가 준 글 수 */
  fetched: number;
  /** 목록은 정상인데 공개 글이 0건 */
  empty: boolean;
}

export class BlogSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlogSyncError";
  }
}

/** 안전장치. 한 번에 이 이상은 걷지 않는다(30 × 20 = 600글). */
const MAX_PAGES = 20;

export function getBlogId(): string | null {
  return process.env.NAVER_BLOG_ID?.trim() || null;
}

/**
 * 목록 한 페이지.
 *
 * 브라우저인 척하지 않는다 — 이 엔드포인트가 막는 건 UA가 아니라 Referer 누락이라
 * UA는 우리 앱 이름 그대로 보낸다.
 */
async function fetchPage(blogId: string, page: number): Promise<unknown> {
  const res = await fetch(postListUrl(blogId, page), {
    cache: "no-store",
    headers: {
      "User-Agent": "PersonalLifeHub/1.0 (personal blog archiver)",
      Referer: refererFor(blogId),
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new BlogSyncError(
      res.status === 403 || res.status === 404
        ? `네이버가 '${blogId}' 블로그 목록을 주지 않았습니다 (HTTP ${res.status}). 블로그 아이디를 확인해 주세요.`
        : `네이버 블로그 목록을 불러오지 못했습니다 (HTTP ${res.status}). 잠시 후 다시 시도해 주세요.`,
    );
  }

  try {
    return await res.json();
  } catch {
    throw new BlogSyncError("네이버가 예상과 다른 응답을 보냈습니다. 잠시 후 다시 시도해 주세요.");
  }
}

/** 마지막 페이지까지 걸으며 글을 모은다. logNo로 중복을 지운다. */
async function crawlAllPosts(blogId: string): Promise<NaverBlogPost[]> {
  const byLogNo = new Map<string, NaverBlogPost>();

  for (let page = 1; page <= MAX_PAGES; page++) {
    let parsed;
    try {
      parsed = parsePostList(await fetchPage(blogId, page), blogId);
    } catch (err) {
      if (err instanceof NaverPostListError) {
        throw new BlogSyncError(
          `네이버가 '${blogId}' 블로그 목록을 거절했습니다: ${err.message} 블로그 아이디를 확인해 주세요.`,
        );
      }
      throw err;
    }

    for (const item of parsed.items) byLogNo.set(item.logNo, item);
    if (!parsed.hasMore) break;
  }

  return [...byLogNo.values()];
}

async function upsertItems(
  userId: string,
  blogId: string,
  items: NaverBlogPost[],
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
        source: "crawl",
      },
      update: {
        title: item.title,
        url: item.url,
        summary: item.summary,
        thumbnailUrl: item.thumbnailUrl,
        category: item.category,
        publishedAt: item.publishedAt,
        source: "crawl",
        fetchedAt: new Date(),
      },
    });
  }

  const added = items.filter((i) => !existing.has(i.logNo)).length;
  return { added, updated: items.length - added };
}

/**
 * 네이버 블로그 목록을 걷어 로컬에 반영한다.
 *
 * 증분 대신 매번 전량을 훑는다. 목록 API는 글 하나당 필드 몇 개뿐이라 가볍고,
 * 발행일로 잘라내면 과거 글이 수정됐을 때 반영되지 않기 때문이다.
 *
 * `tags`는 갱신하지 않는다 — 목록 API가 태그를 주지 않아서 매번 빈 배열이 오는데,
 * 그걸로 덮으면 예전에 RSS로 받아 둔 태그가 지워진다.
 */
export async function syncNaverBlog(userId: string): Promise<BlogSyncResult> {
  const blogId = getBlogId();
  if (!blogId) {
    throw new BlogSyncError(
      "NAVER_BLOG_ID가 설정되어 있지 않습니다. .env에 블로그 아이디를 넣어 주세요.",
    );
  }

  const items = await crawlAllPosts(blogId);
  const { added, updated } = await upsertItems(userId, blogId, items);

  return { added, updated, fetched: items.length, empty: items.length === 0 };
}
