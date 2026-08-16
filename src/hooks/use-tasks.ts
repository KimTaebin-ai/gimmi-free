"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  listTasks,
  toggleTaskDone,
  updateTask,
} from "@/lib/actions/tasks";
import { listProjects } from "@/lib/actions/projects";
import { listTags } from "@/lib/actions/tags";
import type {
  CreateTaskInput,
  TaskFilter,
  TaskWithRelations,
  UpdateTaskInput,
} from "@/lib/task-types";

export function useTasks(filter: TaskFilter) {
  return useQuery({
    queryKey: ["tasks", filter],
    queryFn: () => listTasks(filter),
  });
}

export function useProjects() {
  return useQuery({ queryKey: ["projects"], queryFn: () => listProjects() });
}

export function useTags() {
  return useQuery({ queryKey: ["tags"], queryFn: () => listTags() });
}

type TasksSnapshot = Array<[QueryKey, TaskWithRelations[] | undefined]>;

function useTasksCache() {
  const qc = useQueryClient();
  return {
    qc,
    async snapshot(): Promise<TasksSnapshot> {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      return qc.getQueriesData<TaskWithRelations[]>({ queryKey: ["tasks"] });
    },
    restore(snap: TasksSnapshot) {
      for (const [key, data] of snap) qc.setQueryData(key, data);
    },
    patchAll(fn: (tasks: TaskWithRelations[]) => TaskWithRelations[]) {
      qc.setQueriesData<TaskWithRelations[]>({ queryKey: ["tasks"] }, (old) =>
        old ? fn(old) : old,
      );
    },
    invalidateAll() {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tags"] });
    },
  };
}

/** 완료 체크 — 낙관적 업데이트 (TickTick식 즉각 반응) */
export function useToggleTask() {
  const cache = useTasksCache();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      toggleTaskDone(id, done),
    onMutate: async ({ id, done }) => {
      const prev = await cache.snapshot();
      cache.patchAll((tasks) =>
        tasks.map((t) => {
          if (t.id === id)
            return {
              ...t,
              status: done ? "done" : "todo",
              completedAt: done ? new Date() : null,
            } as TaskWithRelations;
          if (t.subtasks.some((s) => s.id === id))
            return {
              ...t,
              subtasks: t.subtasks.map((s) =>
                s.id === id
                  ? { ...s, status: done ? "done" : "todo", completedAt: done ? new Date() : null }
                  : s,
              ),
            } as TaskWithRelations;
          return t;
        }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => ctx && cache.restore(ctx.prev),
    onSettled: () => cache.invalidateAll(),
  });
}

export function useCreateTask() {
  const cache = useTasksCache();
  return useMutation({
    mutationFn: (input: CreateTaskInput) => createTask(input),
    onSettled: () => cache.invalidateAll(),
  });
}

export function useUpdateTask() {
  const cache = useTasksCache();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTaskInput }) =>
      updateTask(id, input),
    onMutate: async ({ id, input }) => {
      const prev = await cache.snapshot();
      const fields = { ...input };
      delete fields.tagNames; // 태그는 관계라 낙관적 패치에서 제외
      cache.patchAll((tasks) =>
        tasks.map((t) => (t.id === id ? ({ ...t, ...fields } as TaskWithRelations) : t)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => ctx && cache.restore(ctx.prev),
    onSettled: () => cache.invalidateAll(),
  });
}

export function useDeleteTask() {
  const cache = useTasksCache();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onMutate: async (id) => {
      const prev = await cache.snapshot();
      cache.patchAll((tasks) => tasks.filter((t) => t.id !== id));
      return { prev };
    },
    onError: (_err, _vars, ctx) => ctx && cache.restore(ctx.prev),
    onSettled: () => cache.invalidateAll(),
  });
}
