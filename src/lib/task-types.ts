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

/**
 * 스마트 리스트/필터.
 *
 * 시간 지정 태스크는 시각(ISO instant)으로, 종일 태스크는 달력 날짜("yyyy-MM-dd")로
 * 비교해야 한다. 둘을 한 기준으로 묶으면 UTC 오프셋이 음수인 지역에서 하루가 어긋난다.
 * 그래서 두 범위를 함께 넘긴다.
 */
export interface DateWindow {
  /** 시간 지정 태스크용 — 로컬 하루의 시작/끝을 ISO instant로 */
  start: string;
  end: string;
  /** 종일 태스크용 — 로컬 달력 날짜 */
  dateFrom: string;
  dateTo: string;
}

export type TaskFilter =
  | ({ kind: "today" } & DateWindow) // 지연 + 오늘 구간에 걸친 것
  | ({ kind: "range" } & DateWindow) // 내일, 다음 7일
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
  startAt?: Date | null;
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
  startAt?: Date | null;
  dueAt?: Date | null;
  allDay?: boolean;
  rrule?: string | null;
  tagNames?: string[];
}
