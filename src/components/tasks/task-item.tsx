"use client";

import { Repeat } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { describeRrule, formatDue, isOverdue } from "@/lib/format-date";
import type { TaskWithRelations } from "@/lib/task-types";

export const PRIORITY_CHECKBOX: Record<number, string> = {
  3: "border-red-500 data-[state=checked]:bg-red-500 data-[state=checked]:border-red-500",
  2: "border-amber-500 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500",
  1: "border-blue-500 data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500",
  0: "",
};

export function TaskItem({
  task,
  selected,
  onSelect,
  onToggle,
}: {
  task: TaskWithRelations;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
}) {
  const done = task.status === "done";
  const subDone = task.subtasks.filter((s) => s.status === "done").length;

  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent/50",
        selected && "bg-accent",
      )}
      onClick={() => onSelect(task.id)}
    >
      <Checkbox
        checked={done}
        onCheckedChange={(v) => onToggle(task.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        className={cn("mt-0.5 rounded-full", PRIORITY_CHECKBOX[task.priority])}
      />
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
          {task.title}
        </div>
        {(task.dueAt || task.tags.length > 0 || task.subtasks.length > 0 || task.rrule) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {task.dueAt && (
              <span
                className={cn(
                  !done && isOverdue(task.dueAt, task.allDay) && "text-red-500",
                )}
              >
                {formatDue(task.dueAt, task.allDay)}
              </span>
            )}
            {task.rrule && (
              <span className="flex items-center gap-0.5">
                <Repeat className="size-3" />
                {describeRrule(task.rrule)}
              </span>
            )}
            {task.subtasks.length > 0 && (
              <span>
                {subDone}/{task.subtasks.length}
              </span>
            )}
            {task.tags.map(({ tag }) => (
              <Badge key={tag.id} variant="secondary" className="px-1.5 py-0 text-[10px]">
                #{tag.name}
              </Badge>
            ))}
          </div>
        )}
      </div>
      {task.project && (
        <span className="mt-1 shrink-0 text-[10px] text-muted-foreground">
          {task.project.name}
        </span>
      )}
    </div>
  );
}
