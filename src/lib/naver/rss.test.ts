import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractLogNo,
  extractThumbnail,
  normalizeUrl,
  parseNaverRss,
  rssUrlFor,
  stripHtml,
} from "./rss";

const fixture = (name: string) =>
  readFileSync(join(__dirname, "__fixtures__", name), "utf-8");

describe("normalizeUrl", () => {
  it("RSS 추적 파라미터를 떼어낸다", () => {
    expect(
      normalizeUrl("https://blog.naver.com/blogpeople/224377254690?fromRss=true&trackingCode=rss"),
    ).toBe("https://blog.naver.com/blogpeople/224377254690");
  });

  it("망가진 URL도 죽지 않는다", () => {
    expect(normalizeUrl("not a url?x=1")).toBe("not a url");
  });
});

describe("extractLogNo", () => {
  it("경로 마지막 숫자를 글 번호로 쓴다", () => {
    expect(extractLogNo("https://blog.naver.com/ansiaos/223947411456")).toBe("223947411456");
  });

  it("추적 파라미터가 붙어도 추출한다", () => {
    expect(extractLogNo("https://blog.naver.com/x/224377254690?fromRss=true")).toBe("224377254690");
  });

  it("logNo 쿼리 형태도 지원한다", () => {
    expect(extractLogNo("https://blog.naver.com/PostView.naver?blogId=x&logNo=223836392505")).toBe(
      "223836392505",
    );
  });

  it("글 번호가 없으면 null", () => {
    expect(extractLogNo("https://blog.naver.com/ansiaos")).toBeNull();
  });
});

describe("stripHtml / extractThumbnail", () => {
  it("태그와 엔티티를 걷어낸다", () => {
    expect(stripHtml("<p>안녕&nbsp;하세요 <b>블로그</b></p>")).toBe("안녕 하세요 블로그");
  });

  it("첫 이미지를 썸네일로 뽑는다", () => {
    expect(extractThumbnail('본문 <img src="https://x.net/a.png?type=s3" /> 뒤')).toBe(
      "https://x.net/a.png?type=s3",
    );
  });

  it("이미지가 없으면 null", () => {
    expect(extractThumbnail("이미지 없는 본문")).toBeNull();
  });
});

describe("parseNaverRss — 실제 네이버 피드", () => {
  const feed = parseNaverRss(fixture("naver-rss.xml"));

  it("채널 제목과 글을 읽는다", () => {
    expect(feed.blogTitle).toBe("네이버 블로그팀 공식블로그");
    expect(feed.items.length).toBeGreaterThan(10);
  });

  it("첫 글의 필드가 모두 채워진다", () => {
    const first = feed.items[0];
    expect(first.logNo).toMatch(/^\d+$/);
    expect(first.url).toMatch(/^https:\/\/blog\.naver\.com\//);
    expect(first.url).not.toContain("fromRss"); // 추적 파라미터 제거됨
    expect(first.title.length).toBeGreaterThan(0);
    expect(first.publishedAt.getTime()).not.toBeNaN();
  });

  it("요약은 HTML 없이 200자 이내", () => {
    for (const item of feed.items) {
      if (!item.summary) continue;
      expect(item.summary).not.toMatch(/<[a-z]/i);
      expect(item.summary.length).toBeLessThanOrEqual(200);
    }
  });

  it("썸네일과 카테고리를 뽑아낸다", () => {
    expect(feed.items.some((i) => i.thumbnailUrl?.startsWith("http"))).toBe(true);
    expect(feed.items.some((i) => i.category)).toBe(true);
  });

  it("태그를 쉼표로 나눈다", () => {
    const tagged = feed.items.find((i) => i.tags.length > 0);
    expect(tagged).toBeDefined();
    expect(tagged!.tags.every((t) => t.length > 0 && !t.includes(","))).toBe(true);
  });

  it("logNo가 중복되지 않는다 (upsert 키로 쓸 수 있음)", () => {
    const ids = feed.items.map((i) => i.logNo);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("parseNaverRss — 비어 있는 피드 (RSS 미설정 블로그)", () => {
  it("빈 채널이어도 죽지 않고 0건을 돌려준다", () => {
    const feed = parseNaverRss(fixture("naver-rss-empty.xml"));
    expect(feed.items).toEqual([]);
    expect(feed.blogTitle).toBeNull();
  });

  it("XML이 아니어도 죽지 않는다", () => {
    expect(parseNaverRss("<html>not rss</html>").items).toEqual([]);
    expect(parseNaverRss("").items).toEqual([]);
  });
});

describe("rssUrlFor", () => {
  it("블로그 아이디로 피드 주소를 만든다", () => {
    expect(rssUrlFor("ansiaos")).toBe("https://rss.blog.naver.com/ansiaos.xml");
  });
});
