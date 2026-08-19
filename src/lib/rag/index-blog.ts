import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { chunkDocument } from "@/lib/rag/chunk";
import { EMBED_MODEL, embedDocuments, toVectorLiteral } from "@/lib/rag/voyage";

/**
 * 블로그 글 하나를 RAG 색인에 넣는다.
 *
 * `DocChunk.embedding`은 pgvector 타입이라 Prisma 클라이언트가 다루지 못한다.
 * 그래서 이 파일만 raw SQL을 쓴다 — id도 DB 기본값(cuid)이 안 먹으므로 직접 만든다.
 *
 * 같은 글을 다시 색인하면 기존 청크를 지우고 새로 넣는다(부분 갱신은 청크 경계가
 * 밀리면서 유령 청크를 남긴다).
 */
export async function indexBlogPost(input: {
  userId: string;
  postId: string;
  title: string;
  url: string;
  text: string;
  occurredAt: Date;
}): Promise<number> {
  const chunks = chunkDocument(input.title, input.text);

  await prisma.docChunk.deleteMany({
    where: { userId: input.userId, source: "blog", sourceId: input.postId },
  });
  if (chunks.length === 0) return 0;

  const vectors = await embedDocuments(chunks.map((c) => c.text));

  for (const [i, chunk] of chunks.entries()) {
    await prisma.$executeRaw`
      INSERT INTO "DocChunk"
        ("id", "userId", "source", "sourceId", "chunkIndex",
         "text", "title", "url", "occurredAt", "embedding", "embedModel")
      VALUES
        (${randomUUID()}, ${input.userId}, 'blog'::"DocSource", ${input.postId}, ${chunk.index},
         ${chunk.text}, ${input.title}, ${input.url}, ${input.occurredAt},
         ${toVectorLiteral(vectors[i])}::vector, ${EMBED_MODEL})
    `;
  }

  return chunks.length;
}

export interface ReindexResult {
  posts: number;
  chunks: number;
}

/**
 * 아직 색인되지 않았거나 다른 모델로 색인된 글을 다시 색인한다.
 *
 * 본문은 있는데 색인이 없는 경우(예: Voyage 키를 나중에 넣었을 때)를 메우는 용도다.
 */
export async function reindexBlogPosts(userId: string): Promise<ReindexResult> {
  const posts = await prisma.blogPost.findMany({
    where: { userId, content: { not: null } },
    select: { id: true, title: true, url: true, content: true, publishedAt: true },
    orderBy: { publishedAt: "desc" },
  });

  // 이미 현재 모델로 색인된 글은 건너뛴다 (모델을 바꾸면 전부 다시 돈다)
  const indexed = new Set(
    (
      await prisma.docChunk.groupBy({
        by: ["sourceId"],
        where: { userId, source: "blog", embedModel: EMBED_MODEL },
      })
    ).map((r) => r.sourceId),
  );

  let chunks = 0;
  let done = 0;
  for (const post of posts) {
    if (indexed.has(post.id)) continue;
    chunks += await indexBlogPost({
      userId,
      postId: post.id,
      title: post.title,
      url: post.url,
      text: post.content!,
      occurredAt: post.publishedAt,
    });
    done++;
  }

  return { posts: done, chunks };
}

/** 색인 현황 — 화면에 "몇 개 글이 검색 가능한지" 보여주기 위한 것 */
export async function indexStatus(userId: string): Promise<{
  indexedPosts: number;
  totalChunks: number;
  pendingPosts: number;
}> {
  const [rows, totalChunks, pendingPosts] = await Promise.all([
    prisma.docChunk.groupBy({
      by: ["sourceId"],
      where: { userId, source: "blog", embedModel: EMBED_MODEL },
    }),
    prisma.docChunk.count({ where: { userId, source: "blog", embedModel: EMBED_MODEL } }),
    prisma.blogPost.count({ where: { userId, content: null } }),
  ]);
  return { indexedPosts: rows.length, totalChunks, pendingPosts };
}
