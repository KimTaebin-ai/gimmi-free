import "server-only";
import { prisma } from "@/lib/prisma";
import { embedQuery, EMBED_MODEL, toVectorLiteral } from "@/lib/rag/voyage";

export interface RetrievedChunk {
  text: string;
  title: string;
  url: string;
  occurredAt: Date;
  /** 코사인 유사도(1에 가까울수록 비슷) */
  score: number;
}

/**
 * 질문과 가까운 청크를 찾는다.
 *
 * pgvector의 `<=>`는 **코사인 거리**(0이 가장 가까움)라 정렬은 오름차순이고,
 * 화면·프롬프트에 쓰는 점수는 `1 - 거리`로 뒤집어 준다.
 *
 * `since`를 주면 그 뒤에 쓴 글로만 좁힌다 — 성장 요약은 "최근 90일"처럼
 * 기간이 정해져 있어서 오래된 글이 끼어들면 안 된다.
 */
export async function searchChunks(
  userId: string,
  query: string,
  opts: SearchOptions = {},
): Promise<RetrievedChunk[]> {
  return searchByVector(userId, await embedQuery(query), opts);
}

export interface SearchOptions {
  limit?: number;
  since?: Date;
  minScore?: number;
}

/**
 * 이미 벡터로 바꾼 질문으로 찾는다.
 *
 * `searchChunks`에서 임베딩 호출만 떼어낸 것 — 이쪽은 Voyage 없이도 부를 수 있어서
 * SQL 자체를 테스트할 수 있다.
 */
export async function searchByVector(
  userId: string,
  queryVector: number[],
  opts: SearchOptions = {},
): Promise<RetrievedChunk[]> {
  const { limit = 12, since, minScore = 0 } = opts;
  const vector = toVectorLiteral(queryVector);

  const rows = await prisma.$queryRaw<
    { text: string; title: string; url: string; occurredAt: Date; distance: number }[]
  >`
    SELECT "text", "title", "url", "occurredAt", ("embedding" <=> ${vector}::vector) AS distance
    FROM "DocChunk"
    WHERE "userId" = ${userId}
      AND "embedModel" = ${EMBED_MODEL}
      AND "embedding" IS NOT NULL
      AND (${since ?? null}::timestamp IS NULL OR "occurredAt" >= ${since ?? null}::timestamp)
    ORDER BY distance ASC
    LIMIT ${limit}
  `;

  return rows
    .map((r) => ({
      text: r.text,
      title: r.title,
      url: r.url,
      occurredAt: r.occurredAt,
      score: 1 - Number(r.distance),
    }))
    .filter((r) => r.score >= minScore);
}
