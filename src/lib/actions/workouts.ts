"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { fromDateOnly, toDateOnly } from "@/lib/date-only";
import {
  workoutInclude,
  type SaveWorkoutInput,
  type WorkoutWithSets,
} from "@/lib/fitness-types";

export async function listWorkouts(
  fromDate: string,
  toDate: string,
): Promise<WorkoutWithSets[]> {
  const userId = await requireUserId();
  return prisma.workout.findMany({
    where: { userId, date: { gte: toDateOnly(fromDate), lte: toDateOnly(toDate) } },
    include: workoutInclude,
    orderBy: { date: "desc" },
  });
}

export async function getWorkoutByDate(
  date: string,
): Promise<WorkoutWithSets | null> {
  const userId = await requireUserId();
  return prisma.workout.findFirst({
    where: { userId, date: toDateOnly(date) },
    include: workoutInclude,
  });
}

/**
 * 해당 종목의 직전 세션 세트들 (progressive overload 비교용).
 * beforeDate 이전에서 가장 최근 기록을 찾는다.
 */
export async function getPreviousSets(
  exerciseName: string,
  beforeDate: string,
): Promise<{ date: string; sets: { reps: number; weightKg: number }[] } | null> {
  const userId = await requireUserId();
  const prev = await prisma.workout.findFirst({
    where: {
      userId,
      date: { lt: toDateOnly(beforeDate) },
      sets: { some: { exerciseName } },
    },
    orderBy: { date: "desc" },
    include: { sets: { where: { exerciseName }, orderBy: { setNo: "asc" } } },
  });
  if (!prev) return null;
  return {
    date: fromDateOnly(prev.date),
    sets: prev.sets.map((s) => ({ reps: s.reps, weightKg: s.weightKg })),
  };
}

/**
 * 세션 저장. 세트는 통째로 교체한다(부분 수정보다 단순하고 순서가 꼬이지 않음).
 * 같은 날짜에 이미 세션이 있으면 그 세션을 갱신한다.
 */
export async function saveWorkout(
  input: SaveWorkoutInput,
): Promise<WorkoutWithSets> {
  const userId = await requireUserId();
  const date = toDateOnly(input.date);

  const setRows = input.blocks.flatMap((block, exerciseOrder) =>
    block.sets
      .filter((s) => s.reps > 0 || s.weightKg > 0)
      .map((s, i) => ({
        exerciseName: block.exerciseName.trim(),
        exerciseOrder,
        setNo: i + 1,
        reps: s.reps,
        weightKg: s.weightKg,
      })),
  ).filter((s) => s.exerciseName.length > 0);

  const existing =
    input.id != null
      ? await prisma.workout.findFirst({ where: { id: input.id, userId } })
      : await prisma.workout.findFirst({ where: { userId, date } });

  const workout = existing
    ? await prisma.workout.update({
        where: { id: existing.id },
        data: {
          date,
          routineId: input.routineId ?? null,
          note: input.note ?? null,
          sets: { deleteMany: {}, create: setRows },
        },
        include: workoutInclude,
      })
    : await prisma.workout.create({
        data: {
          userId,
          date,
          routineId: input.routineId ?? null,
          note: input.note ?? null,
          sets: { create: setRows },
        },
        include: workoutInclude,
      });

  // 새로 등장한 종목은 사전에 등록해 둔다(부위는 나중에 지정)
  const names = [...new Set(setRows.map((s) => s.exerciseName))];
  if (names.length > 0) {
    await prisma.exercise.createMany({
      data: names.map((name) => ({ userId, name })),
      skipDuplicates: true,
    });
  }

  return workout;
}

export async function deleteWorkout(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.workout.deleteMany({ where: { id, userId } });
}
