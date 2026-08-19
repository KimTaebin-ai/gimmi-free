"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { getBlogId, syncNaverBlog, BlogSyncError } from "@/lib/naver/sync";
import { indexStatus } from "@/lib/rag/index-blog";
import { hasVoyageKey } from "@/lib/rag/voyage";
import type { Prisma } from "@/generated/prisma/client";
import type { PostBlock } from "@/lib/naver/post-body";

export type BlogPostRow = Prisma.BlogPostGetPayload<object>;

/** 목록 카드에 필요한 것만 — 본문은 무거우니 상세에서만 읽는다 */
const LIST_FIELDS = {
  id: true,
  logNo: true,
  title: true,
  url: true,
  summary: true,
  thumbnailUrl: true,
  category: true,
  tags: true,
  publishedAt: true,
  bodyFetchedAt: true,
} as const;

export type BlogPostCard = Prisma.BlogPostGetPayload<{ select: typeof LIST_FIELDS }>;

export interface BlogStatus {
  blogId: string | null;
  total: number;
  lastFetchedAt: string | null;
  categories: string[];
  /** 본문까지 받아 온 글 수 — 앱 안에서 읽을 수 있는 글 */
  withBody: number;
  /** 성장 요약이 본문을 검색할 수 있는지(= Voyage 키가 있는지)와 색인된 글 수 */
  search: { enabled: boolean; indexedPosts: number };
}

export async function listBlogPosts(limit = 200): Promise<BlogPostCard[]> {
  const userId = await requireUserId();
  return prisma.blogPost.findMany({
    where: { userId },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: LIST_FIELDS,
  });
}

export interface BlogPostDetail {
  logNo: string;
  title: string;
  url: string;
  category: string | null;
  tags: string[];
  publishedAt: string;
  /** 본문 블록. 아직 못 받아왔으면 null */
  blocks: PostBlock[] | null;
  /** 앞뒤 글 — 리더에서 이어 읽을 수 있게 */
  prev: { logNo: string; title: string } | null;
  next: { logNo: string; title: string } | null;
}

/**
 * 앱 안에서 읽을 글 하나.
 *
 * 본문은 `contentBlocks`(우리가 아는 블록 배열)로 저장돼 있다 — 네이버 HTML을 그대로
 * 심지 않는 이유는 `naver/post-body.ts` 참고.
 */
export async function getBlogPost(logNo: string): Promise<BlogPostDetail | null> {
  const userId = await requireUserId();

  const post = await prisma.blogPost.findUnique({
    where: { userId_logNo: { userId, logNo } },
    select: {
      logNo: true,
      title: true,
      url: true,
      category: true,
      tags: true,
      publishedAt: true,
      contentBlocks: true,
    },
  });
  if (!post) return null;

  const [newer, older] = await Promise.all([
    prisma.blogPost.findFirst({
      where: { userId, publishedAt: { gt: post.publishedAt } },
      orderBy: { publishedAt: "asc" },
      select: { logNo: true, title: true },
    }),
    prisma.blogPost.findFirst({
      where: { userId, publishedAt: { lt: post.publishedAt } },
      orderBy: { publishedAt: "desc" },
      select: { logNo: true, title: true },
    }),
  ]);

  return {
    logNo: post.logNo,
    title: post.title,
    url: post.url,
    category: post.category,
    tags: post.tags,
    publishedAt: post.publishedAt.toISOString(),
    blocks: (post.contentBlocks as PostBlock[] | null) ?? null,
    // 목록이 최신순이라 "이전 글"은 더 오래된 글이다
    prev: older,
    next: newer,
  };
}

export async function getBlogStatus(): Promise<BlogStatus> {
  const userId = await requireUserId();
  const [total, withBody, latest, cats, index] = await Promise.all([
    prisma.blogPost.count({ where: { userId } }),
    prisma.blogPost.count({ where: { userId, bodyFetchedAt: { not: null } } }),
    prisma.blogPost.findFirst({
      where: { userId },
      orderBy: { fetchedAt: "desc" },
      select: { fetchedAt: true },
    }),
    prisma.blogPost.findMany({
      where: { userId, category: { not: null } },
      distinct: ["category"],
      select: { category: true },
    }),
    indexStatus(userId),
  ]);

  return {
    blogId: getBlogId(),
    total,
    withBody,
    lastFetchedAt: latest?.fetchedAt.toISOString() ?? null,
    categories: cats.map((c) => c.category!).sort(),
    search: { enabled: hasVoyageKey(), indexedPosts: index.indexedPosts },
  };
}

export type BlogSyncResponse =
  | { ok: true; added: number; updated: number; fetched: number; message: string }
  | { ok: false; message: string };

/** 사용자가 "새로고침"을 눌렀을 때 */
export async function refreshBlogPosts(): Promise<BlogSyncResponse> {
  const userId = await requireUserId();
  try {
    const r = await syncNaverBlog(userId);

    if (r.empty) {
      return {
        ok: false,
        message:
          "네이버에서 공개 글을 하나도 찾지 못했습니다. 블로그 아이디(NAVER_BLOG_ID)가 맞는지, 글이 전체공개인지 확인해 주세요.",
      };
    }

    // 본문·색인은 곁들이라 있을 때만 말한다
    const extra = [
      r.bodiesFetched > 0 ? `본문 ${r.bodiesFetched}개` : null,
      r.indexed > 0 ? `검색 색인 ${r.indexed}개` : null,
    ].filter(Boolean);

    return {
      ok: true,
      added: r.added,
      updated: r.updated,
      fetched: r.fetched,
      message: [
        r.added > 0
          ? `새 글 ${r.added}개를 불러왔어요.`
          : `새 글은 없어요. ${r.updated}개를 최신 상태로 맞췄습니다.`,
        extra.length ? `${extra.join(", ")}도 함께 받았습니다.` : null,
      ]
        .filter(Boolean)
        .join(" "),
    };
  } catch (err) {
    console.error("[blog] 동기화 실패:", err);
    return {
      ok: false,
      message:
        err instanceof BlogSyncError
          ? err.message
          : "블로그 글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
}
