"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteWorkout,
  getPreviousSets,
  getWorkoutByDate,
  listWorkouts,
  saveWorkout,
} from "@/lib/actions/workouts";
import {
  deleteExercise,
  deleteRoutine,
  listExercises,
  listRoutines,
  saveRoutine,
  upsertExercise,
} from "@/lib/actions/routines";
import {
  deleteBodyMetric,
  listBodyMetrics,
  saveBodyMetric,
} from "@/lib/actions/body-metrics";
import { loadSettings, updateSettings } from "@/lib/actions/settings";

// ---------- 세션 ----------

export function useWorkouts(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["workouts", fromDate, toDate],
    queryFn: () => listWorkouts(fromDate, toDate),
  });
}

export function useWorkoutByDate(date: string) {
  return useQuery({
    queryKey: ["workout", date],
    queryFn: () => getWorkoutByDate(date),
  });
}

export function usePreviousSets(exerciseName: string, beforeDate: string) {
  return useQuery({
    queryKey: ["previous-sets", exerciseName, beforeDate],
    queryFn: () => getPreviousSets(exerciseName, beforeDate),
    enabled: exerciseName.trim().length > 0,
  });
}

function useInvalidateFitness() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["workouts"] });
    qc.invalidateQueries({ queryKey: ["workout"] });
    qc.invalidateQueries({ queryKey: ["previous-sets"] });
    qc.invalidateQueries({ queryKey: ["exercises"] });
  };
}

export function useSaveWorkout() {
  const invalidate = useInvalidateFitness();
  return useMutation({
    mutationFn: (input: Parameters<typeof saveWorkout>[0]) => saveWorkout(input),
    onSuccess: invalidate,
  });
}

export function useDeleteWorkout() {
  const invalidate = useInvalidateFitness();
  return useMutation({
    mutationFn: (id: string) => deleteWorkout(id),
    onSuccess: invalidate,
  });
}

// ---------- 루틴 / 종목 ----------

export function useRoutines() {
  return useQuery({ queryKey: ["routines"], queryFn: () => listRoutines() });
}

export function useExercises() {
  return useQuery({ queryKey: ["exercises"], queryFn: () => listExercises() });
}

export function useSaveRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string | null;
      input: Parameters<typeof saveRoutine>[1];
    }) => saveRoutine(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["routines"] });
      qc.invalidateQueries({ queryKey: ["exercises"] });
    },
  });
}

export function useDeleteRoutine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteRoutine(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["routines"] }),
  });
}

export function useUpsertExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof upsertExercise>[0]) => upsertExercise(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

export function useDeleteExercise() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteExercise(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exercises"] }),
  });
}

// ---------- 체성분 ----------

export function useBodyMetrics(fromDate: string, toDate: string) {
  return useQuery({
    queryKey: ["body-metrics", fromDate, toDate],
    queryFn: () => listBodyMetrics(fromDate, toDate),
  });
}

export function useSaveBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: Parameters<typeof saveBodyMetric>[0]) => saveBodyMetric(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["body-metrics"] }),
  });
}

export function useDeleteBodyMetric() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteBodyMetric(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["body-metrics"] }),
  });
}

// ---------- 설정(목표선) ----------

export function useAppSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => loadSettings() });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch),
    onSuccess: (next) => qc.setQueryData(["settings"], next),
  });
}
