"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { getBlogId, syncNaverBlog, BlogSyncError } from "@/lib/naver/sync";
import type { Prisma } from "@/generated/prisma/client";

export type BlogPostRow = Prisma.BlogPostGetPayload<object>;

export interface BlogStatus {
  blogId: string | null;
  total: number;
  lastFetchedAt: string | null;
  categories: string[];
}

export async function listBlogPosts(limit = 200): Promise<BlogPostRow[]> {
  const userId = await requireUserId();
  return prisma.blogPost.findMany({
    where: { userId },
    orderBy: { publishedAt: "desc" },
    take: limit,
  });
}

export async function getBlogStatus(): Promise<BlogStatus> {
  const userId = await requireUserId();
  const [total, latest, cats] = await Promise.all([
    prisma.blogPost.count({ where: { userId } }),
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
  ]);

  return {
    blogId: getBlogId(),
    total,
    lastFetchedAt: latest?.fetchedAt.toISOString() ?? null,
    categories: cats.map((c) => c.category!).sort(),
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

    if (r.emptyFeed) {
      return {
        ok: false,
        message:
          "RSS 피드가 비어 있습니다. 네이버 블로그 [관리 > 기본 설정 > RSS/오픈API]에서 RSS 공개 설정을 켠 뒤 다시 시도해 주세요. (블로그에 공개 글이 있어도 RSS가 꺼져 있으면 빈 피드가 옵니다.)",
      };
    }

    return {
      ok: true,
      added: r.added,
      updated: r.updated,
      fetched: r.fetched,
      message:
        r.added > 0
          ? `새 글 ${r.added}개를 불러왔어요.`
          : `새 글은 없어요. ${r.updated}개를 최신 상태로 맞췄습니다.`,
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
