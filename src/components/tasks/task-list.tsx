"use client";

import { TaskItem } from "@/components/tasks/task-item";
import { useToggleTask } from "@/hooks/use-tasks";
import type { TaskWithRelations } from "@/lib/task-types";

export function TaskList({
  tasks,
  isLoading,
  selectedId,
  onSelect,
  emptyMessage = "태스크가 없어요",
}: {
  tasks: TaskWithRelations[] | undefined;
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  emptyMessage?: string;
}) {
  const toggle = useToggleTask();

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
  return (
    <div className="flex flex-col gap-0.5 p-1">
      {tasks.map((task) => (
        <TaskItem
          key={task.id}
          task={task}
          selected={task.id === selectedId}
          onSelect={(id) => onSelect(id)}
          onToggle={(id, done) => toggle.mutate({ id, done })}
        />
      ))}
    </div>
  );
}
