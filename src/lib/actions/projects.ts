"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import type { ProjectWithCount } from "@/lib/task-types";

const withCount = {
  _count: { select: { tasks: { where: { status: "todo" as const } } } },
};

export async function listProjects(): Promise<ProjectWithCount[]> {
  const userId = await requireUserId();
  return prisma.project.findMany({
    where: { userId },
    include: withCount,
    orderBy: { sortOrder: "asc" },
  });
}

export async function createProject(input: {
  name: string;
  color?: string | null;
}): Promise<ProjectWithCount> {
  const userId = await requireUserId();
  const name = input.name.trim();
  if (!name) throw new Error("이름이 비어 있습니다");
  const last = await prisma.project.findFirst({
    where: { userId },
    orderBy: { sortOrder: "desc" },
  });
  return prisma.project.create({
    data: { userId, name, color: input.color ?? null, sortOrder: (last?.sortOrder ?? 0) + 1 },
    include: withCount,
  });
}

export async function updateProject(
  id: string,
  input: { name?: string; color?: string | null },
): Promise<ProjectWithCount> {
  const userId = await requireUserId();
  return prisma.project.update({
    where: { id, userId },
    data: input,
    include: withCount,
  });
}

export async function deleteProject(id: string): Promise<void> {
  const userId = await requireUserId();
  // 태스크는 projectId가 SetNull로 풀리며 인박스(전체)에 남는다
  await prisma.project.delete({ where: { id, userId } });
}
