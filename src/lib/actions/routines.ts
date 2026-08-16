"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import {
  routineInclude,
  type ExerciseRow,
  type RoutineWithExercises,
} from "@/lib/fitness-types";
import type { MuscleGroup } from "@/generated/prisma/enums";

export interface RoutineInput {
  name: string;
  note?: string | null;
  exercises: { exerciseName: string; targetSets: number; targetReps: number }[];
}

export async function listRoutines(): Promise<RoutineWithExercises[]> {
  const userId = await requireUserId();
  return prisma.workoutRoutine.findMany({
    where: { userId },
    include: routineInclude,
    orderBy: { name: "asc" },
  });
}

export async function saveRoutine(
  id: string | null,
  input: RoutineInput,
): Promise<RoutineWithExercises> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("루틴 이름이 비어 있습니다");

  const exercises = input.exercises
    .map((e, order) => ({
      exerciseName: e.exerciseName.trim(),
      targetSets: Math.max(1, e.targetSets),
      targetReps: Math.max(1, e.targetReps),
      order,
    }))
    .filter((e) => e.exerciseName.length > 0);

  const routine = id
    ? await prisma.workoutRoutine.update({
        where: { id, userId },
        data: {
          name,
          note: input.note ?? null,
          exercises: { deleteMany: {}, create: exercises },
        },
        include: routineInclude,
      })
    : await prisma.workoutRoutine.create({
        data: { userId, name, note: input.note ?? null, exercises: { create: exercises } },
        include: routineInclude,
      });

  const names = [...new Set(exercises.map((e) => e.exerciseName))];
  if (names.length > 0) {
    await prisma.exercise.createMany({
      data: names.map((n) => ({ userId, name: n })),
      skipDuplicates: true,
    });
  }
  return routine;
}

export async function deleteRoutine(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.workoutRoutine.deleteMany({ where: { id, userId } });
}

// ---------- 종목 사전 ----------

export async function listExercises(): Promise<ExerciseRow[]> {
  const userId = await requireUserId();
  return prisma.exercise.findMany({
    where: { userId },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
}

export async function upsertExercise(input: {
  name: string;
  muscleGroup?: MuscleGroup;
  isFavorite?: boolean;
}): Promise<ExerciseRow> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("종목 이름이 비어 있습니다");
  return prisma.exercise.upsert({
    where: { userId_name: { userId, name } },
    create: {
      userId,
      name,
      muscleGroup: input.muscleGroup ?? "other",
      isFavorite: input.isFavorite ?? false,
    },
    update: {
      ...(input.muscleGroup ? { muscleGroup: input.muscleGroup } : {}),
      ...(input.isFavorite !== undefined ? { isFavorite: input.isFavorite } : {}),
    },
  });
}

export async function deleteExercise(id: string): Promise<void> {
  const userId = await requireUserId();
  // 기록(WorkoutSet)은 이름으로 남으므로 사전에서만 지운다
  await prisma.exercise.deleteMany({ where: { id, userId } });
}
