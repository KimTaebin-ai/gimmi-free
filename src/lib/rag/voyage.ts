import "server-only";

/**
 * Voyage AI 임베딩 클라이언트.
 *
 * Anthropic은 임베딩 API를 제공하지 않아서(2026-08 기준) 검색용 벡터는 Voyage에서 받는다.
 * 키가 없으면 null을 돌려주고, 호출부는 RAG만 끄고 앱은 계속 돌아가게 한다
 * — `getClaude()`와 같은 규칙이다.
 *
 * 공식 SDK를 쓰지 않고 fetch로 부르는 건 이 앱의 다른 외부 연동(Google Calendar)과
 * 같은 방식이고, 엔드포인트가 하나뿐이라 의존성을 늘릴 이유가 없어서다.
 */

const ENDPOINT = "https://api.voyageai.com/v1/embeddings";

/** 다국어 검색 품질 기준으로 고른 모델. 한국어 글이 대상이라 lite 대신 이걸 쓴다. */
export const EMBED_MODEL = "voyage-4";
/** 벡터 차원. DocChunk.embedding의 vector(1024)와 반드시 같아야 한다. */
export const EMBED_DIM = 1024;
/** 한 요청에 넣을 텍스트 수. API 한도(1000)보다 훨씬 보수적으로 — 토큰 한도가 먼저 걸린다. */
const BATCH = 64;

export class EmbedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmbedError";
  }
}

export function hasVoyageKey(): boolean {
  return !!process.env.VOYAGE_API_KEY?.trim();
}

/**
 * 임베딩 요청.
 *
 * `inputType`은 Voyage가 앞에 붙이는 안내문을 바꾼다. 색인할 때는 `document`,
 * 검색할 때는 `query`여야 서로 맞는 공간에 놓인다 — 한쪽만 쓰면 검색 품질이 눈에 띄게 떨어진다.
 */
async function embedBatch(texts: string[], inputType: "document" | "query"): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) throw new EmbedError("VOYAGE_API_KEY가 설정되어 있지 않습니다.");

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input: texts,
      model: EMBED_MODEL,
      input_type: inputType,
      output_dimension: EMBED_DIM,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmbedError(
      res.status === 401
        ? "Voyage API 키가 거부되었습니다. VOYAGE_API_KEY를 확인해 주세요."
        : `임베딩 요청이 실패했습니다 (HTTP ${res.status}). ${detail.slice(0, 200)}`,
    );
  }

  const json = (await res.json()) as {
    data?: { embedding?: number[]; index?: number }[];
  };
  const data = json.data ?? [];
  if (data.length !== texts.length) {
    throw new EmbedError(`임베딩 개수가 맞지 않습니다 (${data.length}/${texts.length}).`);
  }

  // 응답 순서를 믿지 않고 index로 되돌린다
  const out: number[][] = new Array(texts.length);
  data.forEach((d, i) => {
    const vec = d.embedding;
    if (!vec || vec.length !== EMBED_DIM) {
      throw new EmbedError(`임베딩 차원이 ${EMBED_DIM}이 아닙니다.`);
    }
    out[d.index ?? i] = vec;
  });
  return out;
}

/** 색인할 문서들을 임베딩한다(배치로 나눠 보낸다). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH), "document")));
  }
  return out;
}

/** 검색어 하나를 임베딩한다. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vec] = await embedBatch([text], "query");
  return vec;
}

/** pgvector 리터럴. Prisma가 vector 타입을 모르므로 문자열로 넘겨 ::vector로 캐스팅한다. */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}
