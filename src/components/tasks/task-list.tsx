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
import { useToggleTask } from "@/hooks/use-tasks";
import type { TaskWithRelations } from "@/lib/task-types";

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
}

function SortableRow({
  task,
  children,
}: {
  task: TaskWithRelations;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id });
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

function groupLabel(task: TaskWithRelations, today: Date): string {
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
  if (isToday(anchor)) return "오늘";
  if (isTomorrow(anchor)) return "내일";
  return format(anchor, "M월 d일 EEEE", { locale: ko });
}

export function TaskList({
  tasks,
  isLoading,
  selectedId,
  onSelect,
  emptyMessage = "태스크가 없어요",
  onReorder,
  groupByDate = false,
}: TaskListProps) {
  const toggle = useToggleTask();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const groups = useMemo(() => {
    if (!groupByDate || !tasks) return null;
    const today = startOfDay(new Date());
    const out: { label: string; items: TaskWithRelations[] }[] = [];
    for (const task of tasks) {
      const label = groupLabel(task, today);
      const last = out[out.length - 1];
      if (last && last.label === label) last.items.push(task);
      else out.push({ label, items: [task] });
    }
    // 같은 라벨이 여러 번 나뉘지 않게 합치고, 지연됨 → 진행 중 순으로 위에 고정
    const merged: typeof out = [];
    for (const g of out) {
      const existing = merged.find((m) => m.label === g.label);
      if (existing) existing.items.push(...g.items);
      else merged.push(g);
    }
    const priorityOf = (label: string) =>
      label === "지연됨" ? 0 : label === "진행 중" ? 1 : 2;
    return merged.sort((a, b) => priorityOf(a.label) - priorityOf(b.label));
  }, [groupByDate, tasks]);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
        ))}
      </div>
    );
  }
  if (!tasks || tasks.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  const renderItem = (task: TaskWithRelations) => (
    <TaskItem
      key={task.id}
      task={task}
      selected={task.id === selectedId}
      onSelect={onSelect}
      onToggle={(id, done) => toggle.mutate({ id, done })}
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
                {g.items.length}
              </span>
            </p>
            <div className="flex flex-col gap-0.5">{g.items.map(renderItem)}</div>
          </div>
        ))}
      </div>
    );
  }

  if (onReorder) {
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
              <SortableRow key={task.id} task={task}>
                {renderItem(task)}
              </SortableRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return <div className="flex flex-col gap-0.5 p-1">{tasks.map(renderItem)}</div>;
}
