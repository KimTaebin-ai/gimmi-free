import { describe, expect, it } from "vitest";
import {
  bucketTasks,
  buildReminderMessage,
  dueDateKey,
  shouldRemind,
  type ReminderTask,
} from "./reminder";
import { hourInTimeZone } from "@/lib/timezone";

const task = (title: string, over: Partial<ReminderTask> = {}): ReminderTask => ({
  title,
  dueAt: null,
  startAt: null,
  allDay: false,
  priority: 0,
  ...over,
});

/** 종일 값은 UTC 자정으로 저장된다 */
const allDay = (title: string, day: string, priority = 0) =>
  task(title, { dueAt: new Date(`${day}T00:00:00.000Z`), allDay: true, priority });

/** 시간 지정 값은 instant */
const timed = (title: string, iso: string, priority = 0) =>
  task(title, { dueAt: new Date(iso), allDay: false, priority });

describe("hourInTimeZone", () => {
  it("같은 순간이라도 지역마다 시가 다르다", () => {
    const instant = new Date("2026-08-19T09:00:00.000Z");
    expect(hourInTimeZone(instant, "Asia/Seoul")).toBe(18); // +9
    expect(hourInTimeZone(instant, "UTC")).toBe(9);
    expect(hourInTimeZone(instant, "America/Los_Angeles")).toBe(2); // -7
  });

  it("자정을 0으로 준다(24가 아니라)", () => {
    expect(hourInTimeZone(new Date("2026-08-19T15:00:00.000Z"), "Asia/Seoul")).toBe(0);
  });
});

describe("dueDateKey — 종일과 시간지정을 각자의 기준으로", () => {
  it("종일은 어디서 보든 그 날짜 그대로", () => {
    const t = allDay("종일", "2026-08-20");
    expect(dueDateKey(t, "Asia/Seoul")).toBe("2026-08-20");
    expect(dueDateKey(t, "America/Los_Angeles")).toBe("2026-08-20");
  });

  it("시간 지정은 보는 곳의 달력을 따른다", () => {
    // UTC 8/20 16:00 = 서울 8/21 01:00 = LA 8/20 09:00
    const t = timed("시간지정", "2026-08-20T16:00:00.000Z");
    expect(dueDateKey(t, "Asia/Seoul")).toBe("2026-08-21");
    expect(dueDateKey(t, "America/Los_Angeles")).toBe("2026-08-20");
  });

  it("날짜가 없으면 null", () => {
    expect(dueDateKey(task("날짜 없음"), "Asia/Seoul")).toBeNull();
  });
});

describe("bucketTasks", () => {
  const TODAY = "2026-08-19";

  it("지연 / 오늘 / 나중으로 가른다", () => {
    const b = bucketTasks(
      [
        allDay("어제 마감", "2026-08-18"),
        allDay("오늘 마감", "2026-08-19"),
        allDay("내일 마감", "2026-08-20"),
        task("날짜 없음"),
      ],
      "Asia/Seoul",
      TODAY,
    );

    expect(b.overdue.map((t) => t.title)).toEqual(["어제 마감"]);
    expect(b.today.map((t) => t.title)).toEqual(["오늘 마감"]);
    expect(b.later.map((t) => t.title).sort()).toEqual(["날짜 없음", "내일 마감"]);
  });

  it("우선순위가 높은 것이 먼저 온다", () => {
    const b = bucketTasks(
      [allDay("낮음", "2026-08-19", 0), allDay("높음", "2026-08-19", 3), allDay("중간", "2026-08-19", 2)],
      "Asia/Seoul",
      TODAY,
    );
    expect(b.today.map((t) => t.title)).toEqual(["높음", "중간", "낮음"]);
  });

  it("같은 순간이라도 보는 지역에 따라 오늘이 되기도 내일이 되기도 한다", () => {
    const t = timed("경계", "2026-08-19T16:00:00.000Z"); // 서울 8/20 01:00, LA 8/19 09:00
    expect(bucketTasks([t], "Asia/Seoul", TODAY).later).toHaveLength(1);
    expect(bucketTasks([t], "America/Los_Angeles", TODAY).today).toHaveLength(1);
  });
});

describe("shouldRemind", () => {
  const base = {
    localHour: 18,
    reminderHour: 18,
    todayKey: "2026-08-19",
    lastSentOn: null as string | null,
    openTaskCount: 3,
  };

  it("정한 시각이고 아직 안 보냈으면 보낸다", () => {
    expect(shouldRemind(base)).toBe(true);
  });

  it("다른 시각에는 안 보낸다", () => {
    expect(shouldRemind({ ...base, localHour: 17 })).toBe(false);
    expect(shouldRemind({ ...base, localHour: 19 })).toBe(false);
  });

  it("오늘 이미 보냈으면 또 안 보낸다", () => {
    expect(shouldRemind({ ...base, lastSentOn: "2026-08-19" })).toBe(false);
  });

  it("어제 보낸 건 오늘 보내는 걸 막지 않는다", () => {
    expect(shouldRemind({ ...base, lastSentOn: "2026-08-18" })).toBe(true);
  });

  it("할 일이 없으면 조용히 있는다", () => {
    expect(shouldRemind({ ...base, openTaskCount: 0 })).toBe(false);
  });
});

describe("buildReminderMessage", () => {
  const TODAY = "2026-08-19";
  const build = (tasks: ReminderTask[], tz = "Asia/Seoul") =>
    buildReminderMessage(bucketTasks(tasks, tz, TODAY), tz);

  it("지연과 오늘 마감을 나눠 싣는다", () => {
    const msg = build([allDay("어제 것", "2026-08-18"), allDay("오늘 것", "2026-08-19")]);
    expect(msg).toContain("오늘 안에 볼 일이 2건");
    expect(msg).toContain("지연 1건");
    expect(msg).toContain("오늘 마감 1건");
    expect(msg).toContain("어제 것");
    expect(msg).toContain("오늘 것");
  });

  it("시간 지정 태스크는 현지 시각을 붙인다", () => {
    const msg = build([timed("회의", "2026-08-19T09:00:00.000Z")]);
    expect(msg).toContain("회의");
    expect(msg).toMatch(/6:00|오후/);
  });

  it("목록이 길면 잘라내고 남은 개수를 알려준다", () => {
    const many = Array.from({ length: 20 }, (_, i) => allDay(`일 ${i}`, "2026-08-18"));
    const msg = build(many);
    expect(msg).toContain("지연 20건");
    expect(msg).toContain("…외 12건");
    expect(msg.split("\n").length).toBeLessThan(16);
  });

  it("오늘 마감이 없으면 남은 일 개수만 알린다", () => {
    const msg = build([allDay("다음 주", "2026-08-30"), task("날짜 없음")]);
    expect(msg).toContain("오늘 마감인 일은 없어요");
    expect(msg).toContain("2건");
  });

  it("급한 게 있으면 날짜 남은 일은 개수만 덧붙인다", () => {
    const msg = build([allDay("오늘", "2026-08-19"), allDay("나중", "2026-08-30")]);
    expect(msg).toContain("날짜가 남은 일 1건");
    expect(msg).not.toContain("• 나중");
  });
});
