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
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { endOfDay, format, isSameDay, isToday, isTomorrow, startOfDay } from "date-fns";
import { ko } from "date-fns/locale";
import { cn } from "@/lib/utils";
import { TaskItem } from "@/components/tasks/task-item";
import { EventRow } from "@/components/tasks/event-row";
import { useDeleteTask, useToggleTask } from "@/hooks/use-tasks";
import { eventDayKeys } from "@/lib/calendar-utils";
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
  /** 수동 정렬 리스트에서 드래그앤드롭 활성화 */
  onReorder?: (orderedIds: string[]) => void;
  /** 날짜 기반 리스트에서 지연됨/오늘/내일/날짜별 그룹 헤더 표시 */
  groupByDate?: boolean;
  /** 함께 표시할 Google 일정 (날짜 기반 리스트에서만) */
  events?: CalendarEventLite[];
  onSelectEvent?: (event: CalendarEventLite) => void;
}

function SortableRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
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

function labelForDate(date: Date): string {
  if (isToday(date)) return "오늘";
  if (isTomorrow(date)) return "내일";
  return format(date, "M월 d일 EEEE", { locale: ko });
}

function taskGroupLabel(task: TaskWithRelations, today: Date): string {
  const anchor = task.dueAt ?? task.startAt;
  if (!anchor) return "날짜 없음";
  if (task.dueAt && task.dueAt < today && !isToday(task.dueAt)) return "지연됨";
  // 여러 날에 걸쳐 진행 중인 태스크는 마감일 그룹에 묻히지 않게 따로 묶는다
  if (
    task.startAt &&
    task.dueAt &&
    !isSameDay(task.startAt, task.dueAt) &&
    task.startAt <= endOfDay(today) &&
    task.dueAt >= today
  ) {
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
    if (!groupByDate || !tasks) return null;
    const today = startOfDay(new Date());
    const byLabel = new Map<string, Row[]>();

    const push = (label: string, row: Row) => {
      const list = byLabel.get(label);
      if (list) list.push(row);
      else byLabel.set(label, [row]);
    };

    for (const task of tasks) {
      push(taskGroupLabel(task, today), {
        kind: "task",
        key: `task-${task.id}`,
        task,
        sortAt: (task.startAt ?? task.dueAt)?.getTime() ?? 0,
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

    const ordered = [...byLabel.entries()].map(([label, rows]) => ({
      label,
      rows: rows.sort((a, b) => a.sortAt - b.sortAt),
    }));

    // 지연됨 → 진행 중 → 날짜순
    const rank = (l: string) => (l === "지연됨" ? 0 : l === "진행 중" ? 1 : 2);
    const dateOf = (rows: Row[]) =>
      rows[0]?.kind === "task"
        ? ((rows[0].task.dueAt ?? rows[0].task.startAt)?.getTime() ?? 0)
        : rows[0]?.kind === "event"
          ? rows[0].event.startAt.getTime()
          : 0;
    return ordered.sort((a, b) => {
      const r = rank(a.label) - rank(b.label);
      return r !== 0 ? r : dateOf(a.rows) - dateOf(b.rows);
    });
  }, [groupByDate, tasks, events]);

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

  const renderTask = (task: TaskWithRelations) => (
    <TaskItem
      key={task.id}
      task={task}
      selected={task.id === selectedId}
      onSelect={onSelect}
      onToggle={(id, done) => toggle.mutate({ id, done })}
      onDelete={(id) => {
        if (id === selectedId) onSelect(null);
        del.mutate(id);
      }}
    />
  );

  const renderRow = (row: Row) =>
    row.kind === "task" ? (
      renderTask(row.task)
    ) : (
      <EventRow
        key={row.key}
        event={row.event}
        onSelect={(e) => onSelectEvent?.(e)}
      />
    );

  if (groups) {
    return (
      <div className="flex flex-col p-1">
        {groups.map((g) => (
          <div key={g.label}>
            <p
              className={cn(
                "px-3 pb-1 pt-3 text-xs font-semibold",
                g.label === "지연됨" ? "text-red-500" : "text-muted-foreground",
              )}
            >
              {g.label}
              <span className="ml-1.5 font-normal text-muted-foreground/60">
                {g.rows.length}
              </span>
            </p>
            <div className="flex flex-col gap-0.5">{g.rows.map(renderRow)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (onReorder && tasks) {
    const ids = tasks.map((t) => t.id);
    const handleDragEnd = (e: DragEndEvent) => {
      const { active, over } = e;
      if (!over || active.id === over.id) return;
      const from = ids.indexOf(String(active.id));
      const to = ids.indexOf(String(over.id));
      if (from < 0 || to < 0) return;
      onReorder(arrayMove(ids, from, to));
    };
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-0.5 p-1">
            {tasks.map((task) => (
              <SortableRow key={task.id} id={task.id}>
                {renderTask(task)}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex flex-col gap-0.5 p-1">{(tasks ?? []).map(renderTask)}</div>
  );
}
