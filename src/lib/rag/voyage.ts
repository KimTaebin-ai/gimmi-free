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
/** 속도 제한에 걸렸을 때 이보다 잘게 쪼개지는 않는다 */
const MIN_BATCH = 4;
/** 429를 몇 번까지 참고 다시 시도할지 */
const MAX_RETRIES = 3;
/** Retry-After 헤더가 없을 때 기다릴 시간(ms). 결제수단 없는 계정이 3 RPM이라 20초. */
const DEFAULT_RETRY_MS = 20_000;
/** 한 번에 이보다 오래 기다리지는 않는다 — 요청이 통째로 묶여 버리면 안 되니까 */
const MAX_RETRY_MS = 60_000;

export class EmbedError extends Error {
  /** 속도·토큰 제한이 원인인지. 이 경우에만 배치를 쪼개 다시 시도할 값어치가 있다. */
  readonly rateLimited: boolean;

  constructor(message: string, rateLimited = false) {
    super(message);
    this.name = "EmbedError";
    this.rateLimited = rateLimited;
  }
}

export function hasVoyageKey(): boolean {
  return !!process.env.VOYAGE_API_KEY?.trim();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 429일 때 얼마나 기다릴지. 서버가 알려주면 그 값을, 아니면 기본값을 쓴다. */
function retryDelayMs(res: Response): number {
  const header = Number(res.headers.get("retry-after"));
  const ms = Number.isFinite(header) && header > 0 ? header * 1000 : DEFAULT_RETRY_MS;
  return Math.min(ms, MAX_RETRY_MS);
}

/**
 * 임베딩 요청.
 *
 * `inputType`은 Voyage가 앞에 붙이는 안내문을 바꾼다. 색인할 때는 `document`,
 * 검색할 때는 `query`여야 서로 맞는 공간에 놓인다 — 한쪽만 쓰면 검색 품질이 눈에 띄게 떨어진다.
 */
async function embedBatch(
  texts: string[],
  inputType: "document" | "query",
  deadlineAt?: number,
): Promise<number[][]> {
  const apiKey = process.env.VOYAGE_API_KEY?.trim();
  if (!apiKey) throw new EmbedError("VOYAGE_API_KEY가 설정되어 있지 않습니다.");

  let res!: Response;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(ENDPOINT, {
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

    // 속도 제한은 실패가 아니라 "천천히 하라"는 뜻이라 기다렸다 다시 건다.
    // 결제수단을 등록하지 않은 계정은 3 RPM / 10K TPM이라 색인 중에 흔히 걸린다.
    if (res.status !== 429 || attempt >= MAX_RETRIES) break;

    // 기다릴 시간이 남아 있을 때만 기다린다. 호출부가 준 시간을 넘겨 가며
    // 붙잡고 있으면 서버리스 요청이 통째로 타임아웃된다.
    const wait = retryDelayMs(res);
    if (deadlineAt !== undefined && Date.now() + wait > deadlineAt) break;
    await sleep(wait);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new EmbedError(
      res.status === 401
        ? "Voyage API 키가 거부되었습니다. VOYAGE_API_KEY를 확인해 주세요."
        : res.status === 429
          ? "Voyage 속도 제한에 걸렸습니다. 결제수단을 등록하지 않은 계정은 분당 3회 / 1만 토큰으로 " +
            "묶입니다(무료 사용량은 그대로). dash.voyageai.com 결제 페이지에서 카드를 등록하면 풀립니다."
          : `임베딩 요청이 실패했습니다 (HTTP ${res.status}). ${detail.slice(0, 200)}`,
      res.status === 429,
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

/**
 * 속도 제한에 걸리면 배치를 절반으로 쪼개 다시 시도한다.
 *
 * 429의 원인이 분당 **요청 수**면 기다리는 걸로 풀리지만(embedBatch가 이미 한다),
 * 분당 **토큰 수**면 요청 하나가 한도보다 커서 아무리 기다려도 통과하지 못한다.
 * 그때는 요청을 작게 만드는 것 말고 방법이 없다.
 */
async function embedWithSplit(texts: string[], deadlineAt?: number): Promise<number[][]> {
  try {
    return await embedBatch(texts, "document", deadlineAt);
  } catch (err) {
    const splittable =
      err instanceof EmbedError && err.rateLimited && texts.length > MIN_BATCH;
    if (!splittable || (deadlineAt !== undefined && Date.now() >= deadlineAt)) throw err;

    const mid = Math.ceil(texts.length / 2);
    return [
      ...(await embedWithSplit(texts.slice(0, mid), deadlineAt)),
      ...(await embedWithSplit(texts.slice(mid), deadlineAt)),
    ];
  }
}

/**
 * 색인할 문서들을 임베딩한다(배치로 나눠 보낸다).
 *
 * `deadlineAt`(epoch ms)을 주면 그 시각 뒤로는 재시도·분할을 멈추고 예외를 던진다.
 * 호출부는 이미 저장한 것을 남기고 나머지를 다음 회차로 넘기면 된다.
 */
export async function embedDocuments(texts: string[], deadlineAt?: number): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH) {
    out.push(...(await embedWithSplit(texts.slice(i, i + BATCH), deadlineAt)));
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
