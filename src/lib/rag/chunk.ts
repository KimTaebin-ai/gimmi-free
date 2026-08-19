/**
 * RAG 색인용 청킹.
 *
 * 임베딩은 "한 덩어리 = 한 의미"일 때 가장 잘 검색된다. 글 하나를 통째로 넣으면
 * 벡터가 평균으로 뭉개지고, 문장 단위로 쪼개면 맥락이 사라진다. 그 사이를 노린다.
 *
 * 두 가지를 지킨다.
 *  - **문단 경계에서 자른다.** 글자 수로 무자비하게 자르면 문장이 반토막 난다.
 *  - **각 청크에 글 제목을 얹는다.** 검색 결과는 청크 하나만 프롬프트에 실리는데,
 *    "5~6월 근황"이라는 맥락이 없으면 모델이 언제 이야기인지 알 수 없다.
 *
 * 순수 함수 — 테스트 대상.
 */

/** 청크 하나의 목표 길이(글자). 한국어는 대략 1글자 ≈ 1토큰 안팎이다. */
export const CHUNK_CHARS = 900;
/** 앞 청크 끝을 얼마나 겹쳐 넣을지. 경계에 걸친 문장이 어느 쪽에서도 안 잡히는 걸 막는다. */
export const CHUNK_OVERLAP_CHARS = 150;
/** 이보다 짧은 꼬리는 앞 청크에 붙인다(의미 없는 조각을 따로 임베딩하지 않도록). */
const MIN_TAIL_CHARS = 100;

export interface Chunk {
  index: number;
  /** 임베딩·프롬프트에 그대로 쓰이는 텍스트(제목 머리말 포함) */
  text: string;
}

/** 문단 → 청크. 문단 하나가 목표보다 길면 그 문단만 문장 단위로 더 쪼갠다. */
function packParagraphs(paragraphs: string[]): string[] {
  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };

  for (const para of paragraphs) {
    for (const piece of para.length > CHUNK_CHARS ? splitLongParagraph(para) : [para]) {
      if (current && current.length + piece.length + 2 > CHUNK_CHARS) {
        const tail = current.slice(-CHUNK_OVERLAP_CHARS);
        flush();
        // 겹치는 꼬리를 다음 청크 머리에 심는다
        current = tail.trim();
      }
      current = current ? `${current}\n\n${piece}` : piece;
    }
  }
  flush();

  // 마지막 청크가 너무 짧으면 앞에 합친다
  if (chunks.length > 1 && chunks[chunks.length - 1].length < MIN_TAIL_CHARS) {
    const tail = chunks.pop()!;
    chunks[chunks.length - 1] += `\n\n${tail}`;
  }
  return chunks;
}

/** 문단 하나가 청크보다 길 때 — 문장부호에서 자른다 */
function splitLongParagraph(para: string): string[] {
  const sentences = para.split(/(?<=[.!?。？！])\s+/);
  const out: string[] = [];
  let buf = "";

  for (const s of sentences) {
    if (buf && buf.length + s.length + 1 > CHUNK_CHARS) {
      out.push(buf);
      buf = "";
    }
    // 문장 하나가 청크보다도 길면(줄바꿈 없는 긴 글) 어쩔 수 없이 글자로 자른다
    if (s.length > CHUNK_CHARS) {
      for (let i = 0; i < s.length; i += CHUNK_CHARS) out.push(s.slice(i, i + CHUNK_CHARS));
      continue;
    }
    buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) out.push(buf);
  return out;
}

/**
 * 글 하나를 청크로.
 *
 * `title`은 각 청크 머리에 붙는다 — 검색으로 뽑힌 청크 하나만 봐도 어느 글인지 알도록.
 */
export function chunkDocument(title: string, body: string): Chunk[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [];

  const heading = title.trim();
  return packParagraphs(paragraphs).map((text, index) => ({
    index,
    text: heading ? `# ${heading}\n\n${text}` : text,
  }));
}
