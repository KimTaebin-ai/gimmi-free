"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import type { EntryKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type TaskEntryRow = Prisma.TaskEntryGetPayload<object>;

export async function listEntries(taskId: string): Promise<TaskEntryRow[]> {
  const userId = await requireUserId();
  return prisma.taskEntry.findMany({
    where: { taskId, task: { userId } },
    orderBy: { createdAt: "asc" },
  });
}

export async function createEntry(input: {
  taskId: string;
  kind: EntryKind;
  title?: string | null;
  content: string;
}): Promise<TaskEntryRow> {
  const userId = await requireUserId();
  const content = input.content.trim();
  if (!content) throw new Error("내용이 비어 있습니다");

  // 소유권 확인 (다른 사용자의 태스크에 기록을 붙이지 못하도록)
  await prisma.task.findFirstOrThrow({ where: { id: input.taskId, userId } });

  return prisma.taskEntry.create({
    data: {
      taskId: input.taskId,
      kind: input.kind,
      title: input.title?.trim() || null,
      content,
    },
  });
}

export async function updateEntry(
  id: string,
  input: { title?: string | null; content?: string; kind?: EntryKind },
): Promise<TaskEntryRow> {
  const userId = await requireUserId();
  const existing = await prisma.taskEntry.findFirstOrThrow({
    where: { id, task: { userId } },
    select: { id: true },
  });
  return prisma.taskEntry.update({
    where: { id: existing.id },
    data: {
      ...(input.kind ? { kind: input.kind } : {}),
      ...(input.title !== undefined ? { title: input.title?.trim() || null } : {}),
      ...(input.content !== undefined ? { content: input.content.trim() } : {}),
    },
  });
}

export async function deleteEntry(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.taskEntry.deleteMany({ where: { id, task: { userId } } });
}
