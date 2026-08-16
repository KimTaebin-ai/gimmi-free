import { describe, expect, it } from "vitest";
import { parseQuickAdd } from "./quick-add";

// 2026-08-16은 일요일
const NOW = new Date(2026, 7, 16, 10, 0, 0);

describe("parseQuickAdd", () => {
  it("일반 텍스트는 제목만", () => {
    const r = parseQuickAdd("우유 사기", NOW);
    expect(r).toMatchObject({
      title: "우유 사기",
      dueAt: null,
      allDay: true,
      priority: 0,
      tagNames: [],
      rrule: null,
    });
  });

  it("내일 오후 3시 병원 #건강 !높음", () => {
    const r = parseQuickAdd("내일 오후 3시 병원 #건강 !높음", NOW);
    expect(r.title).toBe("병원");
    expect(r.dueAt).toEqual(new Date(2026, 7, 17, 15, 0));
    expect(r.allDay).toBe(false);
    expect(r.priority).toBe(3);
    expect(r.tagNames).toEqual(["건강"]);
  });

  it("오늘 / 모레 상대 날짜", () => {
    expect(parseQuickAdd("오늘 청소", NOW).dueAt).toEqual(new Date(2026, 7, 16));
    expect(parseQuickAdd("모레 청소", NOW).dueAt).toEqual(new Date(2026, 7, 18));
  });

  it("3일 후", () => {
    const r = parseQuickAdd("3일 후 택배 확인", NOW);
    expect(r.dueAt).toEqual(new Date(2026, 7, 19));
    expect(r.title).toBe("택배 확인");
  });

  it("요일: 수요일 (일요일 기준 → 이번 주 수요일)", () => {
    const r = parseQuickAdd("수요일 회의", NOW);
    expect(r.dueAt).toEqual(new Date(2026, 7, 19));
  });

  it("다음주 월요일", () => {
    const r = parseQuickAdd("다음주 월요일 보고", NOW);
    // 2026-08-16(일) 기준 다음 주 월요일 = 08-17
    expect(r.dueAt).toEqual(new Date(2026, 7, 17));
  });

  it("8월 20일 / 12/25", () => {
    expect(parseQuickAdd("8월 20일 생일", NOW).dueAt).toEqual(new Date(2026, 7, 20));
    expect(parseQuickAdd("12/25 크리스마스", NOW).dueAt).toEqual(new Date(2026, 11, 25));
  });

  it("지난 날짜는 내년으로", () => {
    expect(parseQuickAdd("1월 1일 새해", NOW).dueAt).toEqual(new Date(2027, 0, 1));
  });

  it("시간만 있으면 오늘, 지났으면 내일", () => {
    const later = parseQuickAdd("오후 11시 스트레칭", NOW);
    expect(later.dueAt).toEqual(new Date(2026, 7, 16, 23, 0));
    const past = parseQuickAdd("오전 9시 스트레칭", NOW); // now는 10시
    expect(past.dueAt).toEqual(new Date(2026, 7, 17, 9, 0));
  });

  it("시 분 / 시반 / HH:MM", () => {
    expect(parseQuickAdd("내일 오후 2시 30분 미팅", NOW).dueAt).toEqual(
      new Date(2026, 7, 17, 14, 30),
    );
    expect(parseQuickAdd("내일 저녁 7시반 저녁약속", NOW).dueAt).toEqual(
      new Date(2026, 7, 17, 19, 30),
    );
    expect(parseQuickAdd("내일 14:30 미팅", NOW).dueAt).toEqual(
      new Date(2026, 7, 17, 14, 30),
    );
  });

  it("반복: 매일 / 매주 월요일 / 평일 / 매월 1일", () => {
    expect(parseQuickAdd("매일 물 마시기", NOW).rrule).toBe("FREQ=DAILY");
    expect(parseQuickAdd("매주 월요일 주간회의", NOW).rrule).toBe(
      "FREQ=WEEKLY;BYDAY=MO",
    );
    expect(parseQuickAdd("평일 운동", NOW).rrule).toBe(
      "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
    );
    expect(parseQuickAdd("매월 1일 월세", NOW).rrule).toBe(
      "FREQ=MONTHLY;BYMONTHDAY=1",
    );
  });

  it("반복만 있으면 오늘부터 시작", () => {
    const r = parseQuickAdd("매일 물 마시기", NOW);
    expect(r.dueAt).toEqual(new Date(2026, 7, 16));
    expect(r.title).toBe("물 마시기");
  });

  it("우선순위 숫자 표기", () => {
    expect(parseQuickAdd("청소 !2", NOW).priority).toBe(2);
  });

  it("태그 여러 개", () => {
    const r = parseQuickAdd("장보기 #집안일 #주말", NOW);
    expect(r.tagNames).toEqual(["집안일", "주말"]);
    expect(r.title).toBe("장보기");
  });

  it("영어 폴백 (chrono)", () => {
    const r = parseQuickAdd("submit report tomorrow 5pm", NOW);
    expect(r.dueAt).toEqual(new Date(2026, 7, 17, 17, 0));
    expect(r.title).toBe("submit report");
  });
});
