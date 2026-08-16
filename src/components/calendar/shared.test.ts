import { describe, expect, it } from "vitest";
import { eachDayOfInterval } from "date-fns";
import { layoutSpans, weekSegments } from "./shared";
import type { CalendarItem } from "@/lib/calendar-types";

/** 2026-08-02(일) ~ 2026-09-12(토) = 6주 그리드 */
const GRID = eachDayOfInterval({
  start: new Date(2026, 7, 2),
  end: new Date(2026, 8, 12),
});

function ev(id: string, start: [number, number], end: [number, number]): CalendarItem {
  return {
    kind: "event",
    id,
    title: id,
    // 시간 지정 이벤트로 만들어 로컬 날짜 기준으로 계산되게 한다
    startAt: new Date(2026, start[0] - 1, start[1], 10, 0),
    endAt: new Date(2026, end[0] - 1, end[1], 11, 0),
    allDay: false,
    location: null,
    description: null,
    htmlLink: null,
  };
}

describe("layoutSpans", () => {
  it("하루짜리는 시작=종료 인덱스", () => {
    const [s] = layoutSpans([ev("a", [8, 5], [8, 5])], GRID);
    expect(s.startIdx).toBe(s.endIdx);
    expect(s.lane).toBe(0);
    expect(s.startsInGrid && s.endsInGrid).toBe(true);
  });

  it("겹치는 일정은 다른 레인, 안 겹치면 레인 재사용", () => {
    const spans = layoutSpans(
      [
        ev("a", [8, 3], [8, 6]), // 3~6일
        ev("b", [8, 5], [8, 8]), // 겹침 → 다른 레인
        ev("c", [8, 20], [8, 21]), // 안 겹침 → 레인 0 재사용
      ],
      GRID,
    );
    const lane = (id: string) => spans.find((s) => s.item.id === id)!.lane;
    expect(lane("a")).toBe(0);
    expect(lane("b")).toBe(1);
    expect(lane("c")).toBe(0);
  });

  it("긴 일정이 위쪽 레인을 차지한다", () => {
    const spans = layoutSpans(
      [ev("short", [8, 3], [8, 3]), ev("long", [8, 3], [8, 20])],
      GRID,
    );
    expect(spans.find((s) => s.item.id === "long")!.lane).toBe(0);
    expect(spans.find((s) => s.item.id === "short")!.lane).toBe(1);
  });

  it("그리드 밖에서 시작하면 startsInGrid=false (잘린 바)", () => {
    const [s] = layoutSpans([ev("a", [7, 20], [8, 5])], GRID);
    expect(s.startsInGrid).toBe(false);
    expect(s.startIdx).toBe(0); // 그리드 첫 칸부터 그림
    expect(s.endsInGrid).toBe(true);
  });

  it("그리드와 전혀 겹치지 않으면 제외", () => {
    expect(layoutSpans([ev("a", [1, 1], [1, 2])], GRID)).toHaveLength(0);
  });
});

describe("weekSegments — 주 단위로 잘린 바", () => {
  it("한 주 안에 들어가는 다일 일정은 조각 1개, 시작·끝 모두 포함", () => {
    const spans = layoutSpans([ev("a", [8, 3], [8, 6])], GRID); // 월~목
    const segs = weekSegments(spans, 0);
    expect(segs).toHaveLength(1);
    expect(segs[0]).toMatchObject({
      colStart: 1, // 일요일 시작 그리드에서 월요일 = 1
      colSpan: 4,
      isStart: true,
      isEnd: true,
    });
  });

  it("여러 주에 걸치면 주마다 조각이 나뉘고 중간 주는 제목을 숨긴다", () => {
    // 8/5(수) ~ 8/25(화): 3주에 걸침
    const spans = layoutSpans([ev("a", [8, 5], [8, 25])], GRID);
    const w0 = weekSegments(spans, 0)[0];
    const w1 = weekSegments(spans, 1)[0];
    const w2 = weekSegments(spans, 2)[0];
    const w3 = weekSegments(spans, 3)[0];

    // 첫 주: 시작 포함, 끝 아님 → 제목 표시
    expect(w0).toMatchObject({ colStart: 3, isStart: true, isEnd: false });
    // 중간 주들: 시작도 끝도 아님 → 제목 숨김(띠만)
    expect(w1).toMatchObject({ colStart: 0, colSpan: 7, isStart: false, isEnd: false });
    expect(w2).toMatchObject({ colStart: 0, colSpan: 7, isStart: false, isEnd: false });
    // 마지막 주: 끝 포함 → 제목 표시
    expect(w3).toMatchObject({ colStart: 0, colSpan: 3, isStart: false, isEnd: true });
  });

  it("6월~8월처럼 그리드를 통째로 덮으면 모든 주가 꽉 찬 띠", () => {
    const spans = layoutSpans([ev("a", [6, 1], [9, 30])], GRID);
    for (let w = 0; w < 6; w++) {
      const seg = weekSegments(spans, w)[0];
      expect(seg).toMatchObject({
        colStart: 0,
        colSpan: 7,
        isStart: false, // 실제 시작일이 그리드 밖 → 제목 없음
        isEnd: false,
      });
    }
  });

  it("해당 주에 걸치지 않는 일정은 조각이 없다", () => {
    const spans = layoutSpans([ev("a", [8, 3], [8, 6])], GRID);
    expect(weekSegments(spans, 3)).toHaveLength(0);
  });
});
