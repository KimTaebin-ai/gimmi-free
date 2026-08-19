/**
 * 네이버 블로그 글 목록 수집기.
 *
 * RSS(`rss.blog.naver.com/{id}.xml`)를 쓰다가 크롤링으로 옮겼다. 네이버 쪽 RSS 서버가
 * 채널 제목·링크까지 전부 빈 값인 껍데기 XML을 돌려주는 상태라(HTTP 200 + item 0개)
 * 블로그 설정으로도 손쓸 수 없기 때문이다.
 *
 * 대신 모바일 블로그가 목록을 그릴 때 쓰는 JSON 엔드포인트를 읽는다.
 * RSS보다 오히려 나은 점이 있다.
 *  - **전체 글**을 페이지 단위로 준다(RSS는 최근 글만).
 *  - 발행 시각이 epoch ms라 날짜만 있는 RSS `pubDate`보다 정확하다.
 *  - 카테고리 *이름*과 썸네일 주소가 그대로 들어 있다.
 *
 * 여전히 **본문은 가져오지 않는다**. 목록이 주는 요약(`briefContents`)만 쓰고
 * 본문은 원문 링크로 연결한다 — 본문은 `PostView.naver` iframe 안이라 파싱이 취약하고
 * ToS 위험이 있다.
 *
 * 이 파일은 순수 함수만 둔다(네트워크는 sync.ts). 실제 응답 픽스처로 테스트한다.
 */

export interface NaverBlogPost {
  logNo: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  tags: string[];
  publishedAt: Date;
}

export interface NaverPostListPage {
  items: NaverBlogPost[];
  /** 다음 페이지를 더 읽어야 하는지(요청한 만큼 꽉 차서 왔는지) */
  hasMore: boolean;
}

/** 목록 API가 대놓고 실패를 알려준 경우(없는 블로그, Referer 누락 등) */
export class NaverPostListError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NaverPostListError";
  }
}

/** 한 번에 받아올 글 수. 30은 되고 100은 거부당한다. */
export const ITEMS_PER_PAGE = 30;

const SUMMARY_MAX = 200;

/**
 * 목록 JSON URL.
 *
 * ⚠️ 이 엔드포인트는 **Referer가 없으면 403**이다(UA는 아무 값이나 된다).
 * 그래서 sync.ts가 브라우저인 척하는 대신 정직한 UA + 해당 블로그 Referer를 보낸다.
 */
export function postListUrl(blogId: string, page: number, itemCount = ITEMS_PER_PAGE): string {
  const id = encodeURIComponent(blogId);
  return `https://m.blog.naver.com/api/blogs/${id}/post-list?categoryNo=0&itemCount=${itemCount}&page=${page}`;
}

/** 403을 피하기 위한 Referer. 읽으려는 블로그의 모바일 주소여야 한다. */
export function refererFor(blogId: string): string {
  return `https://m.blog.naver.com/${encodeURIComponent(blogId)}`;
}

/** 글 원문 주소. 카드/링크는 모바일이 아니라 일반 주소로 건다. */
export function postUrl(blogId: string, logNo: string): string {
  return `https://blog.naver.com/${blogId}/${logNo}`;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

/** 제목·요약은 HTML 엔티티가 섞여 온다(`&#x27;`, `&quot;` …) */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const code =
        body[1] === "x" || body[1] === "X"
          ? Number.parseInt(body.slice(2), 16)
          : Number.parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 ? String.fromCodePoint(code) : whole;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** 목록 요약을 카드에 쓸 한 줄 텍스트로 */
export function toSummary(brief: string): string | null {
  const text = decodeEntities(brief).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, SUMMARY_MAX) : null;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * 응답 JSON → 글 목록.
 *
 * 필드가 빠지거나 모양이 바뀌어도 죽지 않게 방어적으로 읽는다. 다만 API가 스스로
 * `isSuccess: false`라고 말한 경우는 "글이 0개"와 구분해야 하므로 예외로 던진다
 * (안 그러면 없는 블로그 아이디가 "글이 없네요"로 보인다).
 */
export function parsePostList(payload: unknown, blogId: string): NaverPostListPage {
  const root = asRecord(payload);
  if (!root) return { items: [], hasMore: false };

  if (root.isSuccess === false) {
    const message = str(asRecord(root.error)?.message);
    throw new NaverPostListError(message ?? "네이버가 목록 요청을 거절했습니다.");
  }

  const result = asRecord(root.result);
  const rawItems = Array.isArray(result?.items) ? result.items : [];

  const items = rawItems
    .map((raw): NaverBlogPost | null => {
      const item = asRecord(raw);
      if (!item) return null;

      const logNo = str(item.logNo ?? item.logNoObject);
      if (!logNo) return null;

      // 비공개·차단 글은 목록에 섞여 올 수 있다. 내 화면에 남길 이유가 없다.
      if (item.notOpen === true || item.postBlocked === true) return null;

      const title = str(item.titleWithInspectMessage) ?? str(item.title);
      const brief = str(item.briefContents);
      const addDate = typeof item.addDate === "number" ? new Date(item.addDate) : null;

      return {
        logNo,
        title: title ? decodeEntities(title) : "(제목 없음)",
        url: postUrl(str(item.domainIdOrBlogId) ?? blogId, logNo),
        summary: brief ? toSummary(brief) : null,
        thumbnailUrl: str(item.thumbnailUrl),
        category: item.categoryOpenYn === false ? null : str(item.categoryName),
        // 목록 API는 태그를 주지 않는다. 태그까지 받으려면 글마다 본문을 열어야 해서 비운다.
        tags: [],
        publishedAt: addDate && !Number.isNaN(addDate.getTime()) ? addDate : new Date(),
      };
    })
    .filter((i): i is NaverBlogPost => i !== null);

  // 비공개 글이 걸러져 줄어들 수 있으므로 필터 전 개수로 판단한다.
  return { items, hasMore: rawItems.length > 0 };
}
