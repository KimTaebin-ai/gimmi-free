import { describe, expect, it } from "vitest";
import { CHUNK_CHARS, chunkDocument } from "./chunk";

const para = (n: number, ch = "가") => ch.repeat(n);

describe("chunkDocument", () => {
  it("짧은 글은 청크 하나", () => {
    const chunks = chunkDocument("제목", "한 문단입니다.\n\n두 번째 문단입니다.");
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toBe("# 제목\n\n한 문단입니다.\n\n두 번째 문단입니다.");
  });

  it("모든 청크에 제목이 붙는다 — 청크 하나만 봐도 어느 글인지 알도록", () => {
    const chunks = chunkDocument("5~6월 근황", [para(800), para(800), para(800)].join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.startsWith("# 5~6월 근황\n\n")).toBe(true);
  });

  it("인덱스가 0부터 순서대로", () => {
    const chunks = chunkDocument("t", Array.from({ length: 6 }, () => para(400)).join("\n\n"));
    expect(chunks.map((c) => c.index)).toEqual([...chunks.keys()]);
  });

  it("청크가 목표 길이 근처를 넘지 않는다", () => {
    const body = Array.from({ length: 20 }, (_, i) => `문단 ${i}. ${para(300)}`).join("\n\n");
    for (const c of chunkDocument("t", body)) {
      // 제목 머리말과 겹침 여유를 감안
      expect(c.text.length).toBeLessThan(CHUNK_CHARS * 1.5);
    }
  });

  it("경계에 걸친 내용이 사라지지 않게 앞 청크 꼬리를 겹친다", () => {
    const chunks = chunkDocument("t", [para(800, "가"), para(800, "나")].join("\n\n"));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[1].text).toContain("가");
  });

  it("문단 하나가 청크보다 길면 문장에서 자른다", () => {
    const long = Array.from({ length: 30 }, (_, i) => `${i}번째 문장입니다. ${para(40)}.`).join(" ");
    const chunks = chunkDocument("t", long);
    expect(chunks.length).toBeGreaterThan(1);
    // 문장 중간이 아니라 문장부호 뒤에서 잘렸는지
    expect(chunks[0].text.trimEnd().endsWith(".")).toBe(true);
  });

  it("줄바꿈도 문장부호도 없는 긴 글도 자른다", () => {
    const chunks = chunkDocument("t", para(5000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.text.length < CHUNK_CHARS * 1.5)).toBe(true);
  });

  it("본문이 비면 청크도 없다", () => {
    expect(chunkDocument("제목", "")).toEqual([]);
    expect(chunkDocument("제목", "   \n\n  ")).toEqual([]);
  });

  it("제목이 없어도 동작한다", () => {
    expect(chunkDocument("", "본문")).toEqual([{ index: 0, text: "본문" }]);
  });
});
