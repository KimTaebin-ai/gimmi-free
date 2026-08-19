import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  decodeEntities,
  NaverPostListError,
  parsePostList,
  postListUrl,
  postUrl,
  refererFor,
  toSummary,
} from "./crawl";

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf-8"));

describe("postListUrl / refererFor / postUrl", () => {
  it("페이지 단위로 목록 주소를 만든다", () => {
    expect(postListUrl("ansiaos", 2)).toBe(
      "https://m.blog.naver.com/api/blogs/ansiaos/post-list?categoryNo=0&itemCount=30&page=2",
    );
  });

  it("Referer는 읽으려는 블로그의 모바일 주소다 (없으면 403)", () => {
    expect(refererFor("ansiaos")).toBe("https://m.blog.naver.com/ansiaos");
  });

  it("링크는 모바일이 아니라 일반 글 주소로 건다", () => {
    expect(postUrl("ansiaos", "223947411456")).toBe(
      "https://blog.naver.com/ansiaos/223947411456",
    );
  });

  it("이상한 아이디도 주소를 깨뜨리지 못한다", () => {
    expect(postListUrl("a b/c", 1)).toContain("/blogs/a%20b%2Fc/post-list");
  });
});

describe("decodeEntities", () => {
  it("이름·10진·16진 엔티티를 모두 푼다", () => {
    expect(decodeEntities("&#x27;수학&#39;&quot;&amp;&lt;&gt;")).toBe("'수학'\"&<>");
  });

  it("엔티티가 아닌 &는 그대로 둔다", () => {
    expect(decodeEntities("R&D 100&nbsp;점")).toBe("R&D 100 점");
  });
});

describe("toSummary", () => {
  it("공백을 정리하고 200자로 자른다", () => {
    expect(toSummary("  줄바꿈\n\n  섞인   글  ")).toBe("줄바꿈 섞인 글");
    expect(toSummary("가".repeat(500))?.length).toBe(200);
  });

  it("빈 요약은 null", () => {
    expect(toSummary("   ")).toBeNull();
  });
});

describe("parsePostList", () => {
  it("실제 응답에서 글을 뽑는다", () => {
    const { items, hasMore } = parsePostList(fixture("naver-post-list.json"), "blogpeople");

    expect(items).toHaveLength(5);
    expect(hasMore).toBe(true);

    const first = items[0];
    expect(first.logNo).toBe("224381916812");
    expect(first.title).toBe("[블로그 있어요!] 메르의 시선");
    expect(first.url).toBe("https://blog.naver.com/blogpeople/224381916812");
    expect(first.category).toBe("블로그 이벤트");
    expect(first.thumbnailUrl).toMatch(/^https:\/\/mblogthumb-phinf\.pstatic\.net\//);
    expect(first.summary?.length).toBeLessThanOrEqual(200);
    // addDate는 epoch ms — RSS의 날짜뿐인 pubDate보다 정확하다
    expect(first.publishedAt.toISOString()).toBe(new Date(1787016543759).toISOString());
    // 태그는 목록 API가 주지 않는다
    expect(first.tags).toEqual([]);
  });

  it("글이 없는 페이지는 빈 결과이고 더 읽지 않는다", () => {
    expect(parsePostList(fixture("naver-post-list-empty.json"), "ansiaos")).toEqual({
      items: [],
      hasMore: false,
    });
  });

  it("네이버가 거절하면 '글 0개'가 아니라 오류로 다룬다", () => {
    expect(() => parsePostList(fixture("naver-post-list-error.json"), "blogpeople")).toThrow(
      NaverPostListError,
    );
  });

  it("비공개·차단 글은 버리지만 다음 페이지는 계속 읽는다", () => {
    const payload = {
      isSuccess: true,
      result: {
        items: [
          { logNo: 1, titleWithInspectMessage: "비공개", notOpen: true, addDate: 0 },
          { logNo: 2, titleWithInspectMessage: "차단", postBlocked: true, addDate: 0 },
        ],
      },
    };
    expect(parsePostList(payload, "x")).toEqual({ items: [], hasMore: true });
  });

  it("필드가 빠져도 죽지 않는다", () => {
    const payload = {
      isSuccess: true,
      result: { items: [{ logNo: 42 }, { titleWithInspectMessage: "번호 없음" }, null, "x"] },
    };
    const { items } = parsePostList(payload, "x");

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      logNo: "42",
      title: "(제목 없음)",
      summary: null,
      thumbnailUrl: null,
      category: null,
    });
    expect(items[0].publishedAt).toBeInstanceOf(Date);
  });

  it("모양이 아예 다른 응답도 빈 결과로 넘긴다", () => {
    expect(parsePostList("<html>", "x")).toEqual({ items: [], hasMore: false });
    expect(parsePostList({ result: {} }, "x")).toEqual({ items: [], hasMore: false });
  });
});
