import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { blocksToText, parsePostBody, postBodyUrl, type PostBlock } from "./post-body";

const html = readFileSync(join(__dirname, "__fixtures__", "naver-post-body.html"), "utf-8");
const parsed = parsePostBody(html);
const kinds = (blocks: PostBlock[]) => new Set(blocks.map((b) => b.type));

describe("postBodyUrl", () => {
  it("본문이 iframe 없이 들어 있는 모바일 주소를 쓴다", () => {
    expect(postBodyUrl("ansiaos", "224224922156")).toBe(
      "https://m.blog.naver.com/ansiaos/224224922156",
    );
  });
});

describe("parsePostBody — 실제 글", () => {
  it("에디터 컴포넌트를 종류별로 알아본다", () => {
    expect(kinds(parsed.blocks)).toEqual(
      new Set(["text", "heading", "image", "link", "quote", "divider"]),
    );
  });

  it("문단을 순서대로 살린다", () => {
    const first = parsed.blocks.find((b) => b.type === "text");
    expect(first).toBeDefined();
    expect(first!.type === "text" && first!.text.length).toBeGreaterThan(0);
  });

  it("이미지는 실제 주소로 뽑는다(지연 로딩 자리표시자 아님)", () => {
    const images = parsed.blocks.filter((b) => b.type === "image");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img.type === "image" && img.url).toMatch(/^https:\/\//);
    }
  });

  it("링크 카드는 주소를 갖는다", () => {
    const link = parsed.blocks.find((b) => b.type === "link");
    expect(link?.type === "link" && link.url).toMatch(/^https?:\/\//);
  });

  it("제로폭 공백으로 채운 빈 문단은 버린다", () => {
    for (const b of parsed.blocks) {
      if (b.type === "text") expect(b.text).not.toMatch(/^[\s​]*$/);
    }
  });

  it("평문에는 글자만 남는다", () => {
    expect(parsed.text.length).toBeGreaterThan(500);
    expect(parsed.text).not.toContain("<");
    expect(parsed.text).not.toContain("se-component");
  });
});

describe("parsePostBody — 망가진 입력", () => {
  it("본문 컨테이너가 없으면 빈 결과", () => {
    expect(parsePostBody("<html><body><p>없음</p></body></html>")).toEqual({
      blocks: [],
      text: "",
    });
  });

  it("구 에디터로 쓴 글은 글자만이라도 건진다", () => {
    const legacy = `<div id="postViewArea">첫 줄\n둘째 줄</div>`;
    const { blocks, text } = parsePostBody(legacy);
    expect(blocks).toEqual([
      { type: "text", text: "첫 줄" },
      { type: "text", text: "둘째 줄" },
    ]);
    expect(text).toBe("첫 줄\n\n둘째 줄");
  });

  it("HTML이 아니어도 죽지 않는다", () => {
    expect(() => parsePostBody("not html at all")).not.toThrow();
  });
});

describe("blocksToText", () => {
  it("이미지는 캡션만, 인용은 출처까지 남긴다", () => {
    expect(
      blocksToText([
        { type: "heading", text: "제목" },
        { type: "text", text: "본문" },
        { type: "image", url: "https://x/y.png" },
        { type: "image", url: "https://x/z.png", caption: "캡션" },
        { type: "quote", text: "인용문", cite: "출처" },
        { type: "link", url: "https://a.b", title: "링크 제목" },
        { type: "video" },
        { type: "divider" },
      ]),
    ).toBe("제목\n\n본문\n\n캡션\n\n인용문 — 출처\n\n링크 제목 (https://a.b)");
  });
});
