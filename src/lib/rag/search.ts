import "server-only";
import { prisma } from "@/lib/prisma";
import { EMBED_MODEL, toVectorLiteral } from "@/lib/rag/voyage";

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
export interface SearchOptions {
  limit?: number;
  since?: Date;
  minScore?: number;
}

/**
 * 이미 벡터로 바꾼 질문으로 찾는다.
 *
 * 검색어를 문자열로 받지 않는 이유는, 호출부가 탐침 여러 개를 **한 번에** 임베딩한 뒤
 * (`embedQueries`) 벡터만 넘겨 쓰기 때문이다. 탐침마다 임베딩을 부르면 요청이 그만큼
 * 나가 속도 제한에 걸린다. 덤으로 이 함수는 Voyage 없이도 부를 수 있어 SQL만 따로 테스트된다.
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
