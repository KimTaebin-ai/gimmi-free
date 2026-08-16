import type { Prisma } from "@/generated/prisma/client";

export const taskInclude = {
  project: true,
  tags: { include: { tag: true } },
  subtasks: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.TaskInclude;

export type TaskWithRelations = Prisma.TaskGetPayload<{
  include: typeof taskInclude;
}>;

export type ProjectWithCount = Prisma.ProjectGetPayload<{
  include: { _count: { select: { tasks: { where: { status: "todo" } } } } };
}>;

export type TagWithCount = Prisma.TagGetPayload<{
  include: { _count: { select: { tasks: true } } };
}>;

/** 스마트 리스트/필터 — 날짜는 클라이언트 타임존 기준으로 계산해 ISO로 넘긴다 */
export type TaskFilter =
  | { kind: "today"; end: string } // 지연 포함: dueAt <= end
  | { kind: "range"; from: string; to: string } // 내일, 다음 7일
  | { kind: "unscheduled" }
  | { kind: "all" }
  | { kind: "done" }
  | { kind: "project"; projectId: string }
  | { kind: "tag"; tagId: string };

export interface CreateTaskInput {
  title: string;
  note?: string;
  projectId?: string | null;
  parentId?: string | null;
  priority?: number;
  dueAt?: Date | null;
  allDay?: boolean;
  rrule?: string | null;
  tagNames?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  note?: string | null;
  projectId?: string | null;
  priority?: number;
  dueAt?: Date | null;
  allDay?: boolean;
  rrule?: string | null;
  tagNames?: string[];
}
