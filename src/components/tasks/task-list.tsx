"use client";

import { useMemo } from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { endOfDay, format, isSameDay, isToday, isTomorrow, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskItem } from "@/components/tasks/task-item";
import { EventRow } from "@/components/tasks/event-row";
import { useDeleteTask, useToggleTask } from "@/hooks/use-tasks";
import { eventDayKeys } from "@/lib/calendar-utils";
import { forDisplay } from "@/lib/timezone";
import { applyScopedReorder } from "@/lib/task-colors";
import type { TaskWithRelations } from "@/lib/task-types";
import type { CalendarEventLite } from "@/lib/calendar-types";

type Row =
  | { kind: "task"; key: string; task: TaskWithRelations; sortAt: number }
  | { kind: "event"; key: string; event: CalendarEventLite; sortAt: number };

interface TaskListProps {
  tasks: TaskWithRelations[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  emptyMessage?: string;
  /** 드래그로 순서를 바꿨을 때. 그룹 안에서도 동작한다. */
  onReorder?: (orderedIds: string[]) => void;
  /** 날짜 기반 리스트에서 지연됨/오늘/내일/날짜별 그룹 헤더 표시 */
  groupByDate?: boolean;
  /** 남은 태스크 / 완료됨 두 그룹으로 묶어 한 화면에 보여준다 (태그별 보기) */
  groupByStatus?: boolean;
  /** 함께 표시할 Google 일정 (날짜 기반 리스트에서만) */
  events?: CalendarEventLite[];
  onSelectEvent?: (event: CalendarEventLite) => void;
}

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("touch-manipulation", isDragging && "relative z-10 opacity-60")}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  );
}

/** 완료 그룹은 정렬(드래그)을 막고 헤더도 다르게 그린다 */
const DONE_LABEL = "완료됨";
const TODO_LABEL = "남은 태스크";

function labelForDate(date: Date): string {
  if (isToday(date)) return "오늘";
  if (isTomorrow(date)) return "내일";
  return format(date, "M월 d일 EEEE", { locale: ko });
}

function taskGroupLabel(task: TaskWithRelations, today: Date): string {
  const due = task.dueAt ? forDisplay(task.dueAt, task.allDay) : null;
  const start = task.startAt ? forDisplay(task.startAt, task.allDay) : null;
  const anchor = due ?? start;
  if (!anchor) return "날짜 없음";
  if (due && due < today && !isToday(due)) return "지연됨";
  // 여러 날에 걸쳐 진행 중인 태스크는 마감일 그룹에 묻히지 않게 따로 묶는다
  if (start && due && !isSameDay(start, due) && start <= endOfDay(today) && due >= today) {
    return "진행 중";
  }
  return labelForDate(anchor);
}

export function TaskList({
  tasks,
  isLoading,
  selectedId,
  onSelect,
  emptyMessage = "태스크가 없어요",
  onReorder,
  groupByDate = false,
  groupByStatus = false,
  events,
  onSelectEvent,
}: TaskListProps) {
  const toggle = useToggleTask();
  const del = useDeleteTask();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const groups = useMemo(() => {
    if (!tasks) return null;

    // 상태 그룹: 남은 것 위, 완료된 것 아래(최근 완료 순).
    // 태그처럼 "이 주제로 뭘 했고 뭐가 남았나"를 한 화면에서 보는 리스트용.
    if (groupByStatus) {
      const todo: Row[] = [];
      const done: Row[] = [];
      for (const task of tasks) {
        const anchor = task.startAt ?? task.dueAt;
        const row: Row = {
          kind: "task",
          key: `task-${task.id}`,
          task,
          sortAt: anchor ? forDisplay(anchor, task.allDay).getTime() : 0,
        };
        (task.status === "done" ? done : todo).push(row);
      }
      done.sort(
        (a, b) =>
          (b.kind === "task" ? (b.task.completedAt?.getTime() ?? 0) : 0) -
          (a.kind === "task" ? (a.task.completedAt?.getTime() ?? 0) : 0),
      );
      return [
        ...(todo.length > 0 ? [{ label: TODO_LABEL, rows: todo }] : []),
        ...(done.length > 0 ? [{ label: DONE_LABEL, rows: done }] : []),
      ];
    }

    if (!groupByDate) return null;
    const today = startOfDay(new Date());
    const byLabel = new Map<string, Row[]>();

    const push = (label: string, row: Row) => {
      const list = byLabel.get(label);
      if (list) list.push(row);
      else byLabel.set(label, [row]);
    };

    for (const task of tasks) {
      const anchor = task.startAt ?? task.dueAt;
      push(taskGroupLabel(task, today), {
        kind: "task",
        key: `task-${task.id}`,
        task,
        sortAt: anchor ? forDisplay(anchor, task.allDay).getTime() : 0,
      });
    }

    // 일정은 걸쳐 있는 날마다 표시 (여러 날 일정은 각 날짜 그룹에)
    for (const event of events ?? []) {
      for (const key of eventDayKeys(event)) {
        const date = new Date(`${key}T00:00:00`);
        push(labelForDate(date), {
          kind: "event",
          key: `event-${event.id}-${key}`,
          event,
          sortAt: event.allDay ? 0 : event.startAt.getTime(),
        });
      }
    }

    const ordered = [...byLabel.entries()].map(([label, rows]) => ({ label, rows }));

    // 지연됨 → 진행 중 → 날짜순 → 날짜 없음(맨 뒤)
    const rank = (l: string) =>
      l === "지연됨" ? 0 : l === "진행 중" ? 1 : l === "날짜 없음" ? 3 : 2;
    const dateOf = (rows: Row[]) => Math.min(...rows.map((r) => r.sortAt || Infinity));
    return ordered.sort((a, b) => {
      const r = rank(a.label) - rank(b.label);
      return r !== 0 ? r : dateOf(a.rows) - dateOf(b.rows);
    });
  }, [groupByDate, groupByStatus, tasks, events]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }

  const hasNothing =
    (!tasks || tasks.length === 0) && (!events || events.length === 0);
  if (hasNothing) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const renderTask = (task: TaskWithRelations, index: number) => (
    <TaskItem
      key={task.id}
      task={task}
      index={index}
      selected={task.id === selectedId}
      onSelect={onSelect}
      onToggle={(id, done) => toggle.mutate({ id, done })}
      onDelete={(id) => {
        if (id === selectedId) onSelect(null);
        del.mutate(id);
      }}
    />
  );

  /**
   * 드래그로 순서를 바꾼다. 그룹 안에서만 옮기고, 서버에는 화면 전체 순서를 보낸다.
   * (그룹 밖으로 옮기는 건 날짜를 바꾸는 것이라 상세에서 처리한다.)
   */
  const handleDragEnd = (scopeIds: string[]) => (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id || !onReorder || !tasks) return;
    const from = scopeIds.indexOf(String(active.id));
    const to = scopeIds.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    onReorder(applyScopedReorder(tasks.map((t) => t.id), scopeIds, from, to));
  };

  if (groups) {
    // 그룹마다 독립적인 정렬 컨텍스트 — 같은 날짜/우선순위 안에서 순서를 직접 정할 수 있다
    let colorIndex = 0;
    return (
      <div className="flex flex-col gap-2 p-2">
        {groups.map((g) => {
          const isDone = g.label === DONE_LABEL;
          const taskIds = g.rows
            .filter((r): r is Extract<Row, { kind: "task" }> => r.kind === "task")
            .map((r) => r.task.id);
          // 완료된 것끼리 순서를 바꿔봐야 의미가 없다
          const sortable = !!onReorder && !isDone && taskIds.length > 1;
          const body = (
            <div className="flex flex-col gap-0.5 p-1">
              {g.rows.map((row) => {
                if (row.kind === "event") {
                  return (
                    <EventRow
                      key={row.key}
                      event={row.event}
                      onSelect={(e) => onSelectEvent?.(e)}
                    />
                  );
                }
                const node = renderTask(row.task, colorIndex++);
                return sortable ? (
                  <SortableRow key={row.key} id={row.task.id}>
                    {node}
                  </SortableRow>
                ) : (
                  <div key={row.key}>{node}</div>
                );
              })}
            </div>
          );

          return (
            // 같은 날짜끼리 한 박스로 묶어 경계를 분명히 한다
            <div
              key={g.label}
              className={cn("overflow-hidden rounded-lg border", isDone && "bg-muted/20")}
            >
              <p
                className={cn(
                  "flex items-center gap-1.5 border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold",
                  g.label === "지연됨" ? "text-red-500" : "text-muted-foreground",
                )}
              >
                {isDone && <CheckCircle2 className="size-3.5" />}
                {g.label}
                <span className="font-normal text-muted-foreground/60">
                  {g.rows.length}
                </span>
              </p>
              {sortable ? (
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd(taskIds)}
                >
                  <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
                    {body}
                  </SortableContext>
                </DndContext>
              ) : (
                body
              )}
            </div>
          );
        })}
      </div>
    );
  }

  if (onReorder && tasks) {
    const ids = tasks.map((t) => t.id);
    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd(ids)}
      >
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5 p-1">
            {tasks.map((task, i) => (
              <SortableRow key={task.id} id={task.id}>
                {renderTask(task, i)}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">
      {(tasks ?? []).map((task, i) => renderTask(task, i))}
    </div>
  );
}
