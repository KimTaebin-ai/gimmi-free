"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import type { TagWithCount } from "@/lib/task-types";

export async function listTags(): Promise<TagWithCount[]> {
  const userId = await requireUserId();
  return prisma.tag.findMany({
    where: { userId },
    include: { _count: { select: { tasks: true } } },
    orderBy: { name: "asc" },
  });
}

export async function deleteTag(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.tag.delete({ where: { id, userId } });
}
