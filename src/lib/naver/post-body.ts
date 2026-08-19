import { parse, type HTMLElement } from "node-html-parser";

/**
 * 네이버 블로그 글 본문 파서.
 *
 * PC 글 페이지는 본문이 `PostView.naver` iframe 안이라 파싱이 취약하지만,
 * **모바일 글 페이지는 본문을 그대로 담고 있다**(`m.blog.naver.com/{blogId}/{logNo}`).
 * 그래서 iframe을 헤집는 대신 모바일 쪽을 읽는다.
 *
 * 결과는 HTML이 아니라 **블록 배열**이다. 네이버 마크업을 그대로 심으면
 * XSS 위험이 있고 앱 테마와도 따로 놀기 때문에, 우리가 아는 형태로 환원한 뒤
 * 우리 컴포넌트로 그린다.
 *
 * 순수 함수만 둔다(네트워크는 sync.ts). 실제 글 픽스처로 테스트한다.
 */

export type PostBlock =
  | { type: "text"; text: string }
  | { type: "heading"; text: string }
  | { type: "quote"; text: string; cite?: string }
  | { type: "image"; url: string; caption?: string }
  | { type: "link"; url: string; title?: string }
  | { type: "video"; caption?: string }
  | { type: "divider" };

export interface ParsedPostBody {
  blocks: PostBlock[];
  /** 검색·RAG용 평문. 이미지는 빠지고 글자만 남는다. */
  text: string;
}

/** 모바일 글 주소 — 본문이 iframe 없이 들어 있는 쪽 */
export function postBodyUrl(blogId: string, logNo: string): string {
  return `https://m.blog.naver.com/${encodeURIComponent(blogId)}/${encodeURIComponent(logNo)}`;
}

/** 네이버가 문단 사이를 채우는 제로폭 공백(U+200B)까지 걷어낸다 */
function clean(raw: string): string {
  return raw
    .replace(/​/g, "")
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

function imageUrl(el: HTMLElement): string | null {
  const img = el.querySelector("img");
  if (!img) return null;
  // 지연 로딩이라 실제 주소는 data-lazy-src에 있고 src는 자리표시자일 수 있다
  const src = img.getAttribute("data-lazy-src") || img.getAttribute("src") || "";
  return src.startsWith("http") ? src : null;
}

function captionOf(el: HTMLElement): string | undefined {
  const caption = clean(el.querySelector(".se-caption")?.textContent ?? "");
  return caption || undefined;
}

/** `se-component` 하나를 블록들로 */
function componentToBlocks(el: HTMLElement): PostBlock[] {
  const kind = el.classList.value.find((c) => c.startsWith("se-") && c !== "se-component") ?? "";

  switch (kind) {
    case "se-text": {
      // 문단 단위로 자른다. 빈 문단(네이버가 줄 간격용으로 넣는 것)은 버린다.
      return el
        .querySelectorAll(".se-text-paragraph")
        .map((p) => clean(p.textContent))
        .filter(Boolean)
        .map((text): PostBlock => ({ type: "text", text }));
    }

    case "se-sectionTitle":
    case "se-documentTitle": {
      const text = clean(el.textContent);
      return text ? [{ type: "heading", text }] : [];
    }

    case "se-quotation": {
      const cite = clean(el.querySelector(".se-cite")?.textContent ?? "");
      // 인용부호 안의 본문만 — cite는 따로 뽑았으니 빼고 읽는다
      const body = clean(
        (el.querySelector(".se-quote") ?? el).textContent.replace(cite, ""),
      );
      return body ? [{ type: "quote", text: body, ...(cite ? { cite } : {}) }] : [];
    }

    case "se-image": {
      const url = imageUrl(el);
      return url ? [{ type: "image", url, ...(captionOf(el) ? { caption: captionOf(el) } : {}) }] : [];
    }

    case "se-imageStrip": {
      // 여러 장을 나란히 붙인 컴포넌트 — 낱장으로 편다
      return el
        .querySelectorAll(".se-module-image")
        .map(imageUrl)
        .filter((u): u is string => u !== null)
        .map((url): PostBlock => ({ type: "image", url }));
    }

    case "se-oglink": {
      const a = el.querySelector("a");
      const url = a?.getAttribute("href");
      const title = clean(el.querySelector(".se-oglink-title")?.textContent ?? "");
      return url ? [{ type: "link", url, ...(title ? { title } : {}) }] : [];
    }

    case "se-video":
      return [{ type: "video", ...(captionOf(el) ? { caption: captionOf(el) } : {}) }];

    case "se-horizontalLine":
      return [{ type: "divider" }];

    default: {
      // 모르는 컴포넌트(표·코드·지도 …)라도 글자는 살린다
      const text = clean(el.textContent);
      return text ? [{ type: "text", text }] : [];
    }
  }
}

/** 블록에서 검색·RAG용 평문을 뽑는다 */
export function blocksToText(blocks: PostBlock[]): string {
  return blocks
    .map((b) => {
      switch (b.type) {
        case "text":
        case "heading":
          return b.text;
        case "quote":
          return b.cite ? `${b.text} — ${b.cite}` : b.text;
        case "link":
          return b.title ? `${b.title} (${b.url})` : b.url;
        case "image":
          return b.caption ?? "";
        default:
          return "";
      }
    })
    .filter(Boolean)
    .join("\n\n");
}

/**
 * 모바일 글 페이지 HTML → 블록.
 *
 * `se-main-container`(SmartEditor ONE)를 먼저 찾고, 없으면 구 에디터로 쓴 글이므로
 * 알려진 본문 컨테이너에서 글자만이라도 건진다. 어느 쪽도 못 찾으면 빈 결과 —
 * 호출부가 "본문을 못 가져왔다"로 다루면 된다.
 */
export function parsePostBody(html: string): ParsedPostBody {
  const root = parse(html);
  const main = root.querySelector(".se-main-container");

  if (main) {
    const components = main.querySelectorAll(".se-component");
    // 중첩된 se-component(예: 인용 안의 이미지)는 바깥 것이 이미 처리한다
    const blocks = components
      .filter((c) => !c.parentNode?.closest?.(".se-component"))
      .flatMap(componentToBlocks);
    return { blocks, text: blocksToText(blocks) };
  }

  // 구 에디터(SmartEditor 2/3) 대비 — 문단 구조 없이 글자만
  const legacy =
    root.querySelector("#postViewArea") ??
    root.querySelector(".post-view") ??
    root.querySelector("#viewTypeSelector");
  if (!legacy) return { blocks: [], text: "" };

  const blocks = clean(legacy.textContent)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((text): PostBlock => ({ type: "text", text }));
  return { blocks, text: blocksToText(blocks) };
}
