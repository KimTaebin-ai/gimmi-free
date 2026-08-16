"use server";

import { RRule } from "rrule";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import {
  taskInclude,
  type CreateTaskInput,
  type TaskFilter,
  type TaskWithRelations,
  type UpdateTaskInput,
} from "@/lib/task-types";
import type { Prisma } from "@/generated/prisma/client";

function filterToWhere(userId: string, filter: TaskFilter): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { userId, parentId: null };
  switch (filter.kind) {
    case "today":
      return { ...base, status: "todo", dueAt: { lte: new Date(filter.end) } };
    case "range":
      return {
        ...base,
        status: "todo",
        dueAt: { gte: new Date(filter.from), lte: new Date(filter.to) },
      };
    case "unscheduled":
      return { ...base, status: "todo", dueAt: null };
    case "all":
      return { ...base, status: "todo" };
    case "done":
      return { ...base, status: "done" };
    case "project":
      return { ...base, status: "todo", projectId: filter.projectId };
    case "tag":
      return { ...base, status: "todo", tags: { some: { tagId: filter.tagId } } };
  }
}

export async function listTasks(filter: TaskFilter): Promise<TaskWithRelations[]> {
  const userId = await requireUserId();
  return prisma.task.findMany({
    where: filterToWhere(userId, filter),
    include: taskInclude,
    orderBy:
      filter.kind === "done"
        ? [{ completedAt: "desc" }]
        : [
            { dueAt: { sort: "asc", nulls: "last" } },
            { priority: "desc" },
            { sortOrder: "asc" },
            { createdAt: "asc" },
          ],
    take: filter.kind === "done" ? 200 : undefined,
  });
}

function tagConnectOrCreate(userId: string, tagNames: string[]) {
  return {
    create: tagNames.map((name) => ({
      tag: {
        connectOrCreate: {
          where: { userId_name: { userId, name } },
          create: { userId, name },
        },
      },
    })),
  };
}

export async function createTask(input: CreateTaskInput): Promise<TaskWithRelations> {
  const userId = await requireUserId();
  const title = input.title.trim();
  if (!title) throw new Error("제목이 비어 있습니다");

  return prisma.task.create({
    data: {
      userId,
      title,
      note: input.note ?? null,
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
      priority: input.priority ?? 0,
      dueAt: input.dueAt ?? null,
      allDay: input.allDay ?? true,
      rrule: input.rrule ?? null,
      tags: input.tagNames?.length ? tagConnectOrCreate(userId, input.tagNames) : undefined,
    },
    include: taskInclude,
  });
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<TaskWithRelations> {
  const userId = await requireUserId();
  const { tagNames, ...fields } = input;

  return prisma.task.update({
    // userId 조건으로 소유권 검증 (다른 유저의 태스크면 P2025)
    where: { id, userId },
    data: {
      ...fields,
      ...(tagNames !== undefined
        ? { tags: { deleteMany: {}, ...tagConnectOrCreate(userId, tagNames) } }
        : {}),
    },
    include: taskInclude,
  });
}

/**
 * 완료 토글. 반복(rrule) 태스크를 완료하면 다음 인스턴스를 자동 생성해서 반환한다.
 */
export async function toggleTaskDone(
  id: string,
  done: boolean,
): Promise<{ task: TaskWithRelations; nextInstance: TaskWithRelations | null }> {
  const userId = await requireUserId();
  const existing = await prisma.task.findUniqueOrThrow({
    where: { id, userId },
    include: taskInclude,
  });

  const task = await prisma.task.update({
    where: { id, userId },
    data: done
      ? { status: "done", completedAt: new Date() }
      : { status: "todo", completedAt: null },
    include: taskInclude,
  });

  let nextInstance: TaskWithRelations | null = null;
  if (done && existing.status === "todo" && existing.rrule) {
    const base = existing.dueAt ?? new Date();
    const options = RRule.parseString(existing.rrule);
    options.dtstart = base;
    const next = new RRule(options).after(base, false);
    if (next) {
      nextInstance = await prisma.task.create({
        data: {
          userId,
          title: existing.title,
          note: existing.note,
          projectId: existing.projectId,
          priority: existing.priority,
          dueAt: next,
          allDay: existing.allDay,
          rrule: existing.rrule,
          tags: existing.tags.length
            ? { create: existing.tags.map((t) => ({ tagId: t.tagId })) }
            : undefined,
        },
        include: taskInclude,
      });
    }
  }

  return { task, nextInstance };
}

export async function deleteTask(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.task.delete({ where: { id, userId } });
}
