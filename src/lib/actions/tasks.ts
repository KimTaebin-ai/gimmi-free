"use server";

import { RRule } from "rrule";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { pushTaskToGoogle, removeTaskFromGoogle } from "@/lib/google/task-push";
import {
  taskInclude,
  type CreateTaskInput,
  type TaskFilter,
  type TaskWithRelations,
  type UpdateTaskInput,
} from "@/lib/task-types";
import type { Prisma } from "@/generated/prisma/client";

/**
 * 태스크 구간이 [from, to]와 겹치는 조건.
 * 시작~마감이 여러 날에 걸친 태스크도 그 사이 날짜의 리스트에 잡히도록
 * "구간을 완전히 덮는" 경우까지 포함한다(캘린더 표시와 일치시키기 위함).
 */
function overlapsRange(from: Date, to: Date): Prisma.TaskWhereInput[] {
  return [
    { dueAt: { gte: from, lte: to } }, // 마감이 구간 안
    { startAt: { gte: from, lte: to } }, // 시작이 구간 안
    { startAt: { lte: from }, dueAt: { gte: to } }, // 구간을 통째로 덮음(진행 중)
  ];
}

function filterToWhere(userId: string, filter: TaskFilter): Prisma.TaskWhereInput {
  const base: Prisma.TaskWhereInput = { userId, parentId: null };
  switch (filter.kind) {
    case "today": {
      const from = new Date(filter.start);
      const to = new Date(filter.end);
      return {
        ...base,
        status: "todo",
        OR: [
          { dueAt: { lt: from } }, // 지연됨
          { dueAt: null, startAt: { lte: to } }, // 마감 없이 시작만 지정
          ...overlapsRange(from, to),
        ],
      };
    }
    case "range": {
      const from = new Date(filter.from);
      const to = new Date(filter.to);
      return {
        ...base,
        status: "todo",
        OR: [
          { dueAt: null, startAt: { gte: from, lte: to } },
          ...overlapsRange(from, to),
        ],
      };
    }
    case "unscheduled":
      return { ...base, status: "todo", dueAt: null, startAt: null };
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
  // 날짜 기반 스마트 리스트는 날짜순, 나머지는 수동 정렬(sortOrder, 드래그앤드롭)
  const dateOrdered = filter.kind === "today" || filter.kind === "range";
  return prisma.task.findMany({
    where: filterToWhere(userId, filter),
    include: taskInclude,
    orderBy:
      filter.kind === "done"
        ? [{ completedAt: "desc" }]
        : dateOrdered
          ? [
              { dueAt: { sort: "asc", nulls: "last" } },
              { priority: "desc" },
              { sortOrder: "asc" },
              { createdAt: "asc" },
            ]
          : [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: filter.kind === "done" ? 200 : undefined,
  });
}

/** 드래그앤드롭 재정렬 — 화면에 보이는 순서(ids)대로 sortOrder를 다시 부여 */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  const userId = await requireUserId();
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.task.updateMany({
        where: { id, userId },
        data: { sortOrder: index },
      }),
    ),
  );
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

  // 수동 정렬 리스트에서 맨 아래에 추가되도록
  const last = await prisma.task.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });

  const task = await prisma.task.create({
    data: {
      userId,
      title,
      note: input.note ?? null,
      projectId: input.projectId ?? null,
      parentId: input.parentId ?? null,
      priority: input.priority ?? 0,
      startAt: input.startAt ?? null,
      dueAt: input.dueAt ?? null,
      allDay: input.allDay ?? true,
      rrule: input.rrule ?? null,
      sortOrder: (last?.sortOrder ?? 0) + 1,
      tags: input.tagNames?.length ? tagConnectOrCreate(userId, input.tagNames) : undefined,
    },
    include: taskInclude,
  });

  // Google 반영은 응답을 막지 않도록 after()로 미룬다
  after(() => pushTaskToGoogle(userId, task.id));
  return task;
}

export async function updateTask(
  id: string,
  input: UpdateTaskInput,
): Promise<TaskWithRelations> {
  const userId = await requireUserId();
  const { tagNames, ...fields } = input;

  const task = await prisma.task.update({
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

  after(() => pushTaskToGoogle(userId, task.id));
  return task;
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
    const base = existing.dueAt ?? existing.startAt ?? new Date();
    const options = RRule.parseString(existing.rrule);
    options.dtstart = base;
    const next = new RRule(options).after(base, false);
    if (next) {
      // 시작 시각이 있으면 마감과의 간격을 유지한 채 함께 이동
      const shift = next.getTime() - base.getTime();
      nextInstance = await prisma.task.create({
        data: {
          userId,
          title: existing.title,
          note: existing.note,
          projectId: existing.projectId,
          priority: existing.priority,
          startAt: existing.startAt ? new Date(existing.startAt.getTime() + shift) : null,
          dueAt: existing.dueAt ? next : null,
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

  // 완료되면 캘린더에서 내리고, 되돌리면 다시 올린다. 새 인스턴스도 반영.
  after(async () => {
    await pushTaskToGoogle(userId, task.id);
    if (nextInstance) await pushTaskToGoogle(userId, nextInstance.id);
  });

  return { task, nextInstance };
}

export async function deleteTask(id: string): Promise<void> {
  const userId = await requireUserId();
  // 삭제 전에 googleEventId를 읽어둬야 캘린더 이벤트도 정리할 수 있다
  const existing = await prisma.task.findUnique({
    where: { id, userId },
    select: { googleEventId: true, subtasks: { select: { googleEventId: true } } },
  });
  await prisma.task.delete({ where: { id, userId } });

  const eventIds = [
    existing?.googleEventId,
    ...(existing?.subtasks ?? []).map((s) => s.googleEventId),
  ].filter((v): v is string => !!v);
  if (eventIds.length > 0) {
    after(async () => {
      for (const eventId of eventIds) await removeTaskFromGoogle(userId, eventId);
    });
  }
}
