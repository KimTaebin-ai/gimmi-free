"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import type { EntryKind } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

export type TaskEntryRow = Prisma.TaskEntryGetPayload<object>;

/**
 * 기록이 붙는 대상. 태스크이거나 Google 일정이다.
 * 일정은 로컬 캐시 행이 아니라 googleEventId로 가리켜서,
 * 동기화로 캐시가 정리돼도 메모가 남는다.
 */
export type EntryTarget =
  | { type: "task"; taskId: string }
  | { type: "event"; googleEventId: string };

function whereFor(target: EntryTarget, userId: string): Prisma.TaskEntryWhereInput {
  return target.type === "task"
    ? { taskId: target.taskId, task: { userId } }
    : { userId, googleEventId: target.googleEventId };
}

export async function listEntries(target: EntryTarget): Promise<TaskEntryRow[]> {
  const userId = await requireUserId();
  return prisma.taskEntry.findMany({
    where: whereFor(target, userId),
    orderBy: { createdAt: "asc" },
  });
}

export async function createEntry(input: {
  target: EntryTarget;
  kind: EntryKind;
  title?: string | null;
  content: string;
}): Promise<TaskEntryRow> {
  const userId = await requireUserId();
  const content = input.content.trim();
  if (!content) throw new Error("내용이 비어 있습니다");

  const base = {
    kind: input.kind,
    title: input.title?.trim() || null,
    content,
  };

  if (input.target.type === "task") {
    // 소유권 확인 (다른 사용자의 태스크에 기록을 붙이지 못하도록)
    await prisma.task.findFirstOrThrow({
      where: { id: input.target.taskId, userId },
      select: { id: true },
    });
    return prisma.taskEntry.create({
      data: { ...base, taskId: input.target.taskId },
    });
  }

  return prisma.taskEntry.create({
    data: { ...base, userId, googleEventId: input.target.googleEventId },
  });
}

export async function updateEntry(
  id: string,
  input: { title?: string | null; content?: string; kind?: EntryKind },
): Promise<TaskEntryRow> {
  const userId = await requireUserId();
  const existing = await prisma.taskEntry.findFirstOrThrow({
    where: { id, OR: [{ task: { userId } }, { userId }] },
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
  await prisma.taskEntry.deleteMany({
    where: { id, OR: [{ task: { userId } }, { userId }] },
  });
}
