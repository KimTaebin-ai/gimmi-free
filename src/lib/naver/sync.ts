import "server-only";
import { prisma } from "@/lib/prisma";
import {
  NaverPostListError,
  parsePostList,
  postListUrl,
  refererFor,
  type NaverBlogPost,
} from "@/lib/naver/crawl";
import { parsePostBody, postBodyUrl, type PostBlock } from "@/lib/naver/post-body";
import { reindexBlogPosts } from "@/lib/rag/index-blog";
import { hasVoyageKey } from "@/lib/rag/voyage";

export interface BlogSyncResult {
  /** 새로 저장된 글 */
  added: number;
  /** 이미 있어 갱신된 글 */
  updated: number;
  /** 네이버가 준 글 수 */
  fetched: number;
  /** 이번에 본문을 받아온 글 수 */
  bodiesFetched: number;
  /** 이번에 RAG 색인을 만든 글 수 */
  indexed: number;
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
/** 본문은 글마다 요청이 하나씩 나가므로 한 번에 이만큼만. 나머지는 다음 동기화에서. */
const MAX_BODIES_PER_SYNC = 30;

/** 네이버에 보내는 공통 헤더. 브라우저인 척하지 않는다 — 막는 건 UA가 아니라 Referer다. */
function naverHeaders(blogId: string, accept: string): HeadersInit {
  return {
    "User-Agent": "PersonalLifeHub/1.0 (personal blog archiver)",
    Referer: refererFor(blogId),
    Accept: accept,
  };
}

export function getBlogId(): string | null {
  return process.env.NAVER_BLOG_ID?.trim() || null;
}

/** 목록 한 페이지. */
async function fetchPage(blogId: string, page: number): Promise<unknown> {
  const res = await fetch(postListUrl(blogId, page), {
    cache: "no-store",
    headers: naverHeaders(blogId, "application/json"),
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
 * 글 하나의 본문.
 *
 * 목록 API에는 본문이 없어서 모바일 글 페이지를 따로 읽는다. 실패해도 예외를 던지지 않는다 —
 * 본문 하나 때문에 전체 동기화가 무너지면 안 되고, 다음 동기화에서 다시 시도하면 되기 때문.
 */
async function fetchBody(
  blogId: string,
  logNo: string,
): Promise<{ blocks: PostBlock[]; text: string } | null> {
  try {
    const res = await fetch(postBodyUrl(blogId, logNo), {
      cache: "no-store",
      headers: naverHeaders(blogId, "text/html"),
    });
    if (!res.ok) return null;

    const parsed = parsePostBody(await res.text());
    // 블록이 하나도 안 나왔으면 파싱에 실패한 것 — 빈 본문으로 덮어쓰지 않는다
    return parsed.blocks.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 본문이 없는 글의 본문을 받아 저장한다.
 *
 * 이미 본문이 있는 글은 건너뛴다. 그래서 첫 동기화만 요청이 많고
 * 그 뒤로는 새 글 수만큼만 나간다.
 */
async function fetchMissingBodies(userId: string, blogId: string): Promise<number> {
  const pending = await prisma.blogPost.findMany({
    where: { userId, bodyFetchedAt: null },
    orderBy: { publishedAt: "desc" },
    take: MAX_BODIES_PER_SYNC,
    select: { id: true, logNo: true },
  });

  let bodiesFetched = 0;
  for (const post of pending) {
    const body = await fetchBody(blogId, post.logNo);
    if (!body) continue;

    await prisma.blogPost.update({
      where: { id: post.id },
      data: {
        content: body.text,
        contentBlocks: body.blocks,
        bodyFetchedAt: new Date(),
      },
    });
    bodiesFetched++;
  }

  return bodiesFetched;
}

/**
 * 네이버 블로그를 걷어 로컬에 반영한다.
 *
 * 증분 대신 매번 목록 전량을 훑는다. 목록 API는 글 하나당 필드 몇 개뿐이라 가볍고,
 * 발행일로 잘라내면 과거 글이 수정됐을 때 반영되지 않기 때문이다.
 * 본문은 반대로 없는 것만 받는다 — 글마다 요청이 하나씩 나가서 비용이 다르다.
 *
 * `tags`는 갱신하지 않는다 — 목록 API가 태그를 주지 않아 매번 빈 배열이 오는데,
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
  const bodiesFetched = await fetchMissingBodies(userId, blogId);

  // 색인은 곁들이다. Voyage 키가 없거나 실패해도 글과 본문은 이미 저장돼 있다.
  // 아직 색인 안 된 글만 도므로, 키를 나중에 넣어도 다음 새로고침에서 저절로 따라잡힌다.
  let indexed = 0;
  if (hasVoyageKey()) {
    try {
      indexed = (await reindexBlogPosts(userId)).posts;
    } catch (err) {
      console.error("[blog] RAG 색인 실패 — 글 저장은 정상입니다:", err);
    }
  }

  return {
    added,
    updated,
    fetched: items.length,
    bodiesFetched,
    indexed,
    empty: items.length === 0,
  };
}
