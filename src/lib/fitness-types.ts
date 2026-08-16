import type { Prisma } from "@/generated/prisma/client";

export const workoutInclude = {
  routine: { select: { id: true, name: true } },
  sets: { orderBy: [{ exerciseOrder: "asc" }, { setNo: "asc" }] },
} satisfies Prisma.WorkoutInclude;

export type WorkoutWithSets = Prisma.WorkoutGetPayload<{
  include: typeof workoutInclude;
}>;

export const routineInclude = {
  exercises: { orderBy: { order: "asc" } },
  _count: { select: { workouts: true } },
} satisfies Prisma.WorkoutRoutineInclude;

export type RoutineWithExercises = Prisma.WorkoutRoutineGetPayload<{
  include: typeof routineInclude;
}>;

export type ExerciseRow = Prisma.ExerciseGetPayload<object>;
export type BodyMetricRow = Prisma.BodyMetricGetPayload<object>;

/** 세션 로깅 화면에서 종목 단위로 다루기 위한 형태 */
export interface ExerciseBlockInput {
  exerciseName: string;
  sets: { reps: number; weightKg: number }[];
}

export interface SaveWorkoutInput {
  id?: string;
  /** "yyyy-MM-dd" — 타임존 밀림을 피하려고 날짜 문자열로 주고받는다 */
  date: string;
  routineId?: string | null;
  note?: string | null;
  blocks: ExerciseBlockInput[];
}

export interface BodyMetricInput {
  date: string; // "yyyy-MM-dd"
  weightKg?: number | null;
  skeletalMuscleKg?: number | null;
  bodyFatPct?: number | null;
  note?: string | null;
}
