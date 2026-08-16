/** 운동 통계 계산 — 순수 함수 (서버/클라이언트 공용, 테스트 대상) */

export interface SetLike {
  exerciseName: string;
  reps: number;
  weightKg: number;
}

/**
 * Epley 공식으로 1RM 추정: 1RM = w × (1 + reps/30)
 * 1회 수행이면 그 중량이 곧 1RM. 고반복일수록 오차가 커지므로 12회 초과는 신뢰도가 낮다.
 */
export function estimate1RM(weightKg: number, reps: number): number {
  if (reps <= 0 || weightKg <= 0) return 0;
  if (reps === 1) return weightKg;
  return weightKg * (1 + reps / 30);
}

/** 세트 볼륨 = 중량 × 횟수 */
export function setVolume(set: SetLike): number {
  return set.weightKg * set.reps;
}

export function totalVolume(sets: SetLike[]): number {
  return sets.reduce((sum, s) => sum + setVolume(s), 0);
}

/** 세션에서 해당 종목의 최고 추정 1RM */
export function bestEstimated1RM(sets: SetLike[]): number {
  return sets.reduce((max, s) => Math.max(max, estimate1RM(s.weightKg, s.reps)), 0);
}

/** 종목별로 묶기 (입력 순서 유지) */
export function groupByExercise(sets: SetLike[]): Map<string, SetLike[]> {
  const map = new Map<string, SetLike[]>();
  for (const s of sets) {
    const list = map.get(s.exerciseName);
    if (list) list.push(s);
    else map.set(s.exerciseName, [s]);
  }
  return map;
}

export type VolumeByGroup = Record<string, number>;

/** 부위별 볼륨 합계. 사전에 없는 종목은 "other"로 집계한다. */
export function volumeByMuscleGroup(
  sets: SetLike[],
  groupOf: (exerciseName: string) => string | undefined,
): VolumeByGroup {
  const out: VolumeByGroup = {};
  for (const s of sets) {
    const g = groupOf(s.exerciseName) ?? "other";
    out[g] = (out[g] ?? 0) + setVolume(s);
  }
  return out;
}

export interface SetComparison {
  /** 직전 세션의 같은 순번 세트 */
  prev: SetLike | null;
  volumeDelta: number;
  /** 중량 또는 횟수가 늘었는지 */
  improved: boolean;
}

/**
 * 직전 세션과 세트 단위로 비교한다(progressive overload 확인용).
 * 세트 수가 다르면 없는 쪽은 null.
 */
export function compareToPrevious(
  current: SetLike[],
  previous: SetLike[],
): SetComparison[] {
  return current.map((cur, i) => {
    const prev = previous[i] ?? null;
    if (!prev) return { prev: null, volumeDelta: setVolume(cur), improved: true };
    const volumeDelta = setVolume(cur) - setVolume(prev);
    return {
      prev,
      volumeDelta,
      improved:
        cur.weightKg > prev.weightKg ||
        (cur.weightKg === prev.weightKg && cur.reps > prev.reps),
    };
  });
}

/** 이동평균 — 체성분 그래프의 노이즈를 줄인다 */
export function movingAverage(
  values: (number | null)[],
  window: number,
): (number | null)[] {
  return values.map((_, i) => {
    const slice = values
      .slice(Math.max(0, i - window + 1), i + 1)
      .filter((v): v is number => v !== null && Number.isFinite(v));
    if (slice.length === 0) return null;
    return slice.reduce((a, b) => a + b, 0) / slice.length;
  });
}

export const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: "가슴",
  back: "등",
  shoulders: "어깨",
  legs: "하체",
  arms: "팔",
  core: "코어",
  cardio: "유산소",
  other: "기타",
};
