"use client";

import { Check, MoreHorizontal, Repeat, RotateCcw, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { describeRrule, formatSchedule, isOverdue } from "@/lib/format-date";
import { taskColorVar } from "@/lib/task-colors";
import { PriorityFlag } from "@/components/priority-flag";
import type { TaskWithRelations } from "@/lib/task-types";

export function TaskItem({
  task,
  index,
  selected,
  onSelect,
  onToggle,
  onDelete,
}: {
  task: TaskWithRelations;
  /** 목록에서의 위치 — 식별 색을 정한다(우선순위와 무관) */
  index: number;
  selected: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string, done: boolean) => void;
  onDelete?: (id: string) => void;
}) {
  const done = task.status === "done";
  const subDone = task.subtasks.filter((s) => s.status === "done").length;
  const color = taskColorVar(index);

  return (
    <div
      className={cn(
        "group/task relative flex cursor-pointer items-start gap-2.5 rounded-md py-2.5 pl-2 pr-3 transition-colors hover:bg-accent/50",
        selected && "bg-accent",
      )}
      onClick={() => onSelect(task.id)}
    >
      {/* 식별 색 막대 — 어떤 태스크인지 구분하는 용도 */}
      <span
        aria-hidden
        className={cn(
          "mt-0.5 w-1 shrink-0 self-stretch rounded-full transition-opacity",
          done && "opacity-30",
        )}
        style={{ backgroundColor: color }}
      />

      <Checkbox
        checked={done}
        onCheckedChange={(v) => onToggle(task.id, v === true)}
        onClick={(e) => e.stopPropagation()}
        className="mt-0.5 rounded-full"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <PriorityFlag priority={task.priority} className="size-3" />
          <span
            className={cn(
              "truncate text-sm",
              done && "text-muted-foreground line-through",
            )}
          >
            {task.title}
          </span>
        </div>

        {(task.dueAt || task.startAt || task.tags.length > 0 || task.subtasks.length > 0 || task.rrule) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            {(task.dueAt || task.startAt) && (
              <span
                className={cn(
                  !done &&
                    task.dueAt &&
                    isOverdue(task.dueAt, task.allDay) &&
                    "text-red-500",
                )}
              >
                {formatSchedule(task.startAt, task.dueAt, task.allDay)}
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

      {onDelete && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="태스크 메뉴"
              onClick={(e) => e.stopPropagation()}
              // 모바일에선 항상 보이고, PC에선 hover/선택 시에만
              className="mt-0.5 shrink-0 rounded p-0.5 text-muted-foreground opacity-100 transition-opacity hover:bg-muted md:opacity-0 md:group-hover/task:opacity-100 md:data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            <DropdownMenuItem onClick={() => onToggle(task.id, !done)}>
              {done ? (
                <>
                  <RotateCcw className="size-3.5" />
                  완료 취소
                </>
              ) : (
                <>
                  <Check className="size-3.5" />
                  완료로 표시
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => onDelete(task.id)}>
              <Trash2 className="size-3.5" />
              삭제
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
