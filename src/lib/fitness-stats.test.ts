import { describe, expect, it } from "vitest";
import {
  bestEstimated1RM,
  compareToPrevious,
  estimate1RM,
  movingAverage,
  setVolume,
  totalVolume,
  volumeByMuscleGroup,
} from "./fitness-stats";

const s = (exerciseName: string, weightKg: number, reps: number) => ({
  exerciseName,
  weightKg,
  reps,
});

describe("estimate1RM (Epley)", () => {
  it("1회는 그 중량이 곧 1RM", () => {
    expect(estimate1RM(100, 1)).toBe(100);
  });

  it("100kg 10회 → 약 133.3kg", () => {
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
  });

  it("반복이 늘면 추정치도 커진다", () => {
    expect(estimate1RM(80, 8)).toBeGreaterThan(estimate1RM(80, 5));
  });

  it("잘못된 입력은 0", () => {
    expect(estimate1RM(0, 5)).toBe(0);
    expect(estimate1RM(100, 0)).toBe(0);
    expect(estimate1RM(-10, 5)).toBe(0);
  });
});

describe("볼륨", () => {
  it("세트 볼륨 = 중량 × 횟수", () => {
    expect(setVolume(s("벤치프레스", 60, 10))).toBe(600);
  });

  it("총 볼륨은 합계", () => {
    expect(totalVolume([s("a", 60, 10), s("a", 70, 8)])).toBe(600 + 560);
  });

  it("세션 최고 추정 1RM", () => {
    // 100x5 = 116.7, 90x10 = 120 → 후자가 더 높다
    expect(bestEstimated1RM([s("a", 100, 5), s("a", 90, 10)])).toBeCloseTo(120, 1);
  });
});

describe("volumeByMuscleGroup", () => {
  const groupOf = (name: string) =>
    ({ 벤치프레스: "chest", 데드리프트: "back" })[name];

  it("부위별로 합산한다", () => {
    const v = volumeByMuscleGroup(
      [s("벤치프레스", 60, 10), s("벤치프레스", 60, 10), s("데드리프트", 100, 5)],
      groupOf,
    );
    expect(v).toEqual({ chest: 1200, back: 500 });
  });

  it("사전에 없는 종목은 other로", () => {
    const v = volumeByMuscleGroup([s("새로운운동", 50, 10)], groupOf);
    expect(v).toEqual({ other: 500 });
  });
});

describe("compareToPrevious — progressive overload", () => {
  it("중량이 오르면 improved", () => {
    const r = compareToPrevious([s("a", 70, 10)], [s("a", 60, 10)]);
    expect(r[0]).toMatchObject({ improved: true, volumeDelta: 100 });
  });

  it("같은 중량에 횟수가 늘어도 improved", () => {
    const r = compareToPrevious([s("a", 60, 12)], [s("a", 60, 10)]);
    expect(r[0].improved).toBe(true);
  });

  it("줄었으면 improved=false, 델타는 음수", () => {
    const r = compareToPrevious([s("a", 50, 10)], [s("a", 60, 10)]);
    expect(r[0].improved).toBe(false);
    expect(r[0].volumeDelta).toBe(-100);
  });

  it("직전 기록이 없는 세트는 prev=null이고 개선으로 본다", () => {
    const r = compareToPrevious([s("a", 60, 10), s("a", 60, 10)], [s("a", 60, 10)]);
    expect(r[1]).toMatchObject({ prev: null, improved: true });
  });

  it("직전 세션이 아예 없어도 동작", () => {
    expect(compareToPrevious([s("a", 60, 10)], [])).toHaveLength(1);
  });
});

describe("movingAverage", () => {
  it("창 크기만큼 평균낸다", () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1, 1.5, 2.5, 3.5]);
  });

  it("빈 값(null)은 건너뛴다", () => {
    expect(movingAverage([2, null, 4], 3)).toEqual([2, 2, 3]);
  });

  it("전부 null이면 null", () => {
    expect(movingAverage([null, null], 2)).toEqual([null, null]);
  });
});
