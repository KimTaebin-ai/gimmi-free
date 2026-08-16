import { XMLParser } from "fast-xml-parser";

/**
 * 네이버 블로그 RSS 파서.
 *
 * 네이버는 "내 글 목록"을 주는 공식 read API가 없어서 RSS가 사실상 유일한 정식 경로다.
 * 대신 RSS는 **최근 글만** 담기고, 블로그 설정에 따라 아예 비어 올 수도 있다.
 * 그래서 파서는 필드가 없거나 모양이 달라도 죽지 않도록 방어적으로 쓴다.
 */

export interface NaverRssItem {
  logNo: string;
  title: string;
  url: string;
  summary: string | null;
  thumbnailUrl: string | null;
  category: string | null;
  tags: string[];
  publishedAt: Date;
}

export interface NaverRssFeed {
  /** 채널 제목(블로그 이름). 비어 있을 수 있다. */
  blogTitle: string | null;
  items: NaverRssItem[];
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
  // CDATA를 그대로 값으로 받는다
  cdataPropName: undefined,
});

/** 값이 문자열/객체/배열 어떤 모양으로 와도 문자열 하나로 */
function text(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return text(value[0]);
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    return text(v["#text"] ?? v["__cdata"]);
  }
  return null;
}

function toArray<T>(value: T | T[] | undefined): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** 추적 파라미터(fromRss, trackingCode)를 떼고 정규화 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return raw.split("?")[0];
  }
}

/**
 * 글 번호(logNo) 추출. 네이버 글 URL은 `blog.naver.com/{blogId}/{logNo}` 형태이고
 * `?logNo=` 쿼리로 오는 변형도 있어 둘 다 본다.
 */
export function extractLogNo(rawUrl: string): string | null {
  const q = rawUrl.match(/[?&]logNo=(\d+)/);
  if (q) return q[1];
  const path = normalizeUrl(rawUrl).match(/\/(\d{6,})$/);
  return path ? path[1] : null;
}

/** description(HTML)에서 첫 이미지 주소 */
export function extractThumbnail(html: string): string | null {
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

/** HTML 태그/엔티티를 걷어내 미리보기 텍스트로 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const SUMMARY_MAX = 200;

export function parseNaverRss(xml: string): NaverRssFeed {
  let doc: unknown;
  try {
    doc = parser.parse(xml);
  } catch {
    return { blogTitle: null, items: [] };
  }

  const channel = (doc as Record<string, Record<string, unknown>> | undefined)?.rss
    ?.channel as Record<string, unknown> | undefined;
  if (!channel) return { blogTitle: null, items: [] };

  const items = toArray(channel.item as Record<string, unknown> | Record<string, unknown>[])
    .map((raw): NaverRssItem | null => {
      // guid가 추적 파라미터 없는 깨끗한 URL이라 우선 사용한다
      const link = text(raw.guid) ?? text(raw.link);
      if (!link) return null;

      const url = normalizeUrl(link);
      const logNo = extractLogNo(link);
      if (!logNo) return null;

      const title = text(raw.title) ?? "(제목 없음)";
      const descHtml = text(raw.description) ?? "";
      const pub = text(raw.pubDate);
      const published = pub ? new Date(pub) : new Date(NaN);

      return {
        logNo,
        title,
        url,
        summary: descHtml ? stripHtml(descHtml).slice(0, SUMMARY_MAX) || null : null,
        thumbnailUrl: descHtml ? extractThumbnail(descHtml) : null,
        category: text(raw.category),
        tags: (text(raw.tag) ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        publishedAt: Number.isNaN(published.getTime()) ? new Date() : published,
      };
    })
    .filter((i): i is NaverRssItem => i !== null);

  return { blogTitle: text(channel.title), items };
}

export function rssUrlFor(blogId: string): string {
  return `https://rss.blog.naver.com/${encodeURIComponent(blogId)}.xml`;
}
