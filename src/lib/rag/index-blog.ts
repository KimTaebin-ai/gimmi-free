import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { chunkDocument } from "@/lib/rag/chunk";
import { EMBED_MODEL, embedDocuments, toVectorLiteral } from "@/lib/rag/voyage";

/**
 * 블로그 본문을 RAG 색인에 넣는다.
 *
 * `DocChunk.embedding`은 pgvector 타입이라 Prisma 클라이언트가 다루지 못한다.
 * 그래서 이 파일만 raw SQL을 쓴다 — id도 DB 기본값(cuid)이 안 먹으므로 직접 만든다.
 */

/**
 * 한 번에 색인할 최대 청크 수.
 *
 * 임베딩 요청 수가 아니라 **청크 수**로 끊는 이유는, 여러 글의 청크를 한 요청에 몰아
 * 보내기 때문이다(글 하나당 한 번씩 부르면 요청이 글 수만큼 나가 속도 제한에 바로 걸린다).
 * 남은 글은 다음 동기화가 이어서 한다 — 크론이 한 시간마다 도니 저절로 따라잡힌다.
 */
const MAX_CHUNKS_PER_RUN = 128;

/**
 * 한 번의 색인이 쓸 수 있는 시간.
 *
 * 속도 제한에 걸린 계정은 임베딩이 기다렸다 쪼개졌다 하며 몇 분씩 끌 수 있는데,
 * 이건 서버리스 요청 한도를 넘긴다. 시간이 다 되면 남은 글은 다음 동기화로 넘긴다 —
 * 크론이 한 시간마다 도니 결국 다 채워진다.
 */
const TIME_BUDGET_MS = 40_000;

/** 임베딩 한 요청에 함께 실을 청크 수의 목표치(글 경계는 넘지 않는다) */
const EMBED_GROUP_CHUNKS = 32;

interface PendingDoc {
  postId: string;
  title: string;
  url: string;
  occurredAt: Date;
  text: string;
}

export interface ReindexResult {
  posts: number;
  chunks: number;
  /** 이번에 못 하고 남긴 글 — 다음 동기화가 가져간다 */
  remaining: number;
}

/**
 * 글 여러 편을 한꺼번에 색인한다.
 *
 * 청크를 전부 모아 한 번에 임베딩한 뒤 글 단위로 저장한다. 같은 글을 다시 색인하면
 * 기존 청크를 지우고 새로 넣는다(부분 갱신은 청크 경계가 밀리면서 유령 청크를 남긴다).
 */
async function indexDocuments(userId: string, docs: PendingDoc[]): Promise<ReindexResult> {
  // 글을 청크로 쪼개 둔다. 한 글의 청크가 반만 들어가면 검색이 반쪽이 되므로,
  // 묶고 끊는 단위는 언제나 글 하나다.
  const prepared = docs
    .map((doc) => ({ doc, texts: chunkDocument(doc.title, doc.text).map((c) => c.text) }))
    .filter((p) => p.texts.length > 0);

  const deadline = Date.now() + TIME_BUDGET_MS;
  let posts = 0;
  let chunks = 0;
  let cursor = 0;

  while (cursor < prepared.length) {
    // 이번 요청에 함께 보낼 글들을 고른다(요청 수를 줄이려고 여러 글을 한 번에 보낸다)
    const group: typeof prepared = [];
    let size = 0;
    while (cursor < prepared.length && chunks + size < MAX_CHUNKS_PER_RUN) {
      const next = prepared[cursor];
      if (group.length > 0 && size + next.texts.length > EMBED_GROUP_CHUNKS) break;
      group.push(next);
      size += next.texts.length;
      cursor++;
    }
    if (group.length === 0) break;

    let vectors: number[][];
    try {
      vectors = await embedDocuments(
        group.flatMap((g) => g.texts),
        deadline,
      );
    } catch (err) {
      // 앞선 그룹까지는 이미 저장돼 있다. 그것까지 잃을 이유는 없으니 여기서 멈추고
      // 남은 글을 다음 회차로 넘긴다. 다만 한 건도 못 했으면 진짜 문제(잘못된 키 등)일
      // 수 있으니 그대로 올려 보내 호출부가 사용자에게 알리게 한다.
      if (posts === 0) throw err;
      console.error("[rag] 색인을 중간에 멈춥니다 — 남은 글은 다음 동기화에서:", err);
      cursor -= group.length;
      break;
    }

    let offset = 0;
    for (const { doc, texts } of group) {
      const mine = vectors.slice(offset, offset + texts.length);
      offset += texts.length;

      await prisma.docChunk.deleteMany({
        where: { userId, source: "blog", sourceId: doc.postId },
      });

      for (const [i, text] of texts.entries()) {
        await prisma.$executeRaw`
          INSERT INTO "DocChunk"
            ("id", "userId", "source", "sourceId", "chunkIndex",
             "text", "title", "url", "occurredAt", "embedding", "embedModel")
          VALUES
            (${randomUUID()}, ${userId}, 'blog'::"DocSource", ${doc.postId}, ${i},
             ${text}, ${doc.title}, ${doc.url}, ${doc.occurredAt},
             ${toVectorLiteral(mine[i])}::vector, ${EMBED_MODEL})
        `;
      }
    }

    posts += group.length;
    chunks += size;

    // 예산을 넘겼으면 여기서 멈춘다. 이미 넣은 건 그대로 남고, 남은 글은 다음 동기화 몫.
    if (chunks >= MAX_CHUNKS_PER_RUN || Date.now() >= deadline) break;
  }

  return { posts, chunks, remaining: prepared.length - cursor };
}

/** 글 하나만 색인한다(다시 읽어 온 글을 즉시 반영할 때). */
export async function indexBlogPost(doc: PendingDoc & { userId: string }): Promise<number> {
  const { userId, ...rest } = doc;
  return (await indexDocuments(userId, [rest])).chunks;
}

/**
 * 아직 색인되지 않았거나 다른 모델로 색인된 글을 색인한다.
 *
 * 본문은 있는데 색인이 없는 경우(예: Voyage 키를 나중에 넣었을 때)를 메우는 용도라,
 * 이걸 매 동기화 끝에 부르면 저절로 따라잡힌다.
 */
export async function reindexBlogPosts(userId: string): Promise<ReindexResult> {
  const [posts, indexedRows] = await Promise.all([
    prisma.blogPost.findMany({
      where: { userId, content: { not: null } },
      select: { id: true, title: true, url: true, content: true, publishedAt: true },
      orderBy: { publishedAt: "desc" },
    }),
    // 이미 현재 모델로 색인된 글은 건너뛴다 (모델을 바꾸면 전부 다시 돈다)
    prisma.docChunk.groupBy({
      by: ["sourceId"],
      where: { userId, source: "blog", embedModel: EMBED_MODEL },
    }),
  ]);

  const indexed = new Set(indexedRows.map((r) => r.sourceId));
  const pending: PendingDoc[] = posts
    .filter((p) => !indexed.has(p.id))
    .map((p) => ({
      postId: p.id,
      title: p.title,
      url: p.url,
      occurredAt: p.publishedAt,
      text: p.content!,
    }));

  return indexDocuments(userId, pending);
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
