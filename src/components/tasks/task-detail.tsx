"use client";

import { useState } from "react";
import { format, set, startOfDay } from "date-fns";
import { CalendarDays, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { describeRrule, formatDayLabel, RRULE_PRESETS } from "@/lib/format-date";
import { forDisplay, toFloatingDate } from "@/lib/timezone";
import {
  useCreateTask,
  useDeleteTask,
  useProjects,
  useToggleTask,
  useUpdateTask,
} from "@/hooks/use-tasks";
import { PRIORITY_STYLES } from "@/lib/task-colors";
import { TaskEntries } from "@/components/tasks/task-entries";
import type { TaskWithRelations } from "@/lib/task-types";

export function TaskDetail({
  task,
  onClose,
  onLocalUpdate,
}: {
  task: TaskWithRelations;
  onClose: () => void;
  /** 수정한 필드가 화면에 즉시 반영되도록 상세 패널이 들고 있는 사본에도 같이 반영한다. */
  onLocalUpdate?: (fields: Partial<TaskWithRelations>) => void;
}) {
  const update = useUpdateTask();
  const del = useDeleteTask();
  const toggle = useToggleTask();
  const createSub = useCreateTask();
  const { data: projects } = useProjects();

  const [title, setTitle] = useState(task.title);
  const [note, setNote] = useState(task.note ?? "");
  const [tagsText, setTagsText] = useState(task.tags.map((t) => t.tag.name).join(", "));
  const [subTitle, setSubTitle] = useState("");

  const patch = (input: Parameters<typeof update.mutate>[0]["input"]) => {
    const fields = { ...input };
    delete fields.tagNames; // 태그는 관계라 로컬 패치 대상이 아니다
    onLocalUpdate?.(fields);
    update.mutate({ id: task.id, input });
  };

  // 날짜 선택기는 로컬 Date를 주고받는다. 종일 값은 떠 있는 날짜(UTC 자정)로
  // 저장해야 타임존이 바뀌어도 날짜가 밀리지 않는다. (lib/timezone.ts 참고)
  function withTime(base: Date, value: string): Date {
    const [h, m] = value.split(":").map(Number);
    return set(base, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
  }

  /** 시간 없는 상태에서 시간을 붙일 때의 기준 시각 */
  function instantBase(value: Date | null): Date {
    if (!value) return startOfDay(new Date());
    return task.allDay ? forDisplay(value, true) : value;
  }

  function setStartDate(date: Date | undefined) {
    if (!date) return patch({ startAt: null });
    if (task.allDay) return patch({ startAt: toFloatingDate(date) });
    const prev = task.startAt;
    patch({
      startAt: prev
        ? set(date, { hours: prev.getHours(), minutes: prev.getMinutes() })
        : startOfDay(date),
    });
  }

  function setStartTime(value: string) {
    const base = instantBase(task.startAt ?? task.dueAt);
    if (!value) return patch({ startAt: toFloatingDate(base) });
    patch({ startAt: withTime(base, value), allDay: false });
  }

  function setDueDate(date: Date | undefined) {
    if (!date) return patch({ dueAt: null, allDay: task.startAt ? task.allDay : true });
    if (task.allDay) return patch({ dueAt: toFloatingDate(date) });
    patch({
      dueAt: task.dueAt
        ? set(date, { hours: task.dueAt.getHours(), minutes: task.dueAt.getMinutes() })
        : startOfDay(date),
    });
  }

  function setDueTime(value: string) {
    const base = instantBase(task.dueAt ?? task.startAt);
    if (!value) return patch({ dueAt: toFloatingDate(base), allDay: true });
    patch({ dueAt: withTime(base, value), allDay: false });
  }

  function saveTags() {
    const names = tagsText
      .split(/[,，]/)
      .map((s) => s.trim().replace(/^#/, ""))
      .filter(Boolean);
    patch({ tagNames: names });
  }

  const rruleValue = task.rrule ?? "none";
  const rruleOptions = [
    { value: "none", label: "반복 안 함" },
    ...RRULE_PRESETS,
    ...(task.rrule && !RRULE_PRESETS.some((p) => p.value === task.rrule)
      ? [{ value: task.rrule, label: describeRrule(task.rrule) }]
      : []),
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={task.status === "done"}
            onCheckedChange={(v) => {
              const done = v === true;
              onLocalUpdate?.({
                status: done ? "done" : "todo",
                completedAt: done ? new Date() : null,
              });
              toggle.mutate({ id: task.id, done });
            }}
            className="rounded-full"
          />
          {(() => {
            const p = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES[0];
            if (!p.icon) return null;
            const Icon = p.icon;
            return (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Icon className={cn("size-3", p.className)} />
                {p.label}
              </span>
            );
          })()}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-red-500"
            onClick={() => {
              del.mutate(task.id);
              onClose();
            }}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>
      <Separator />
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
          className={cn(
            "border-none px-0 text-base font-medium shadow-none focus-visible:ring-0",
            task.status === "done" && "text-muted-foreground line-through",
          )}
        />

        {/* 시작/마감/반복 */}
        <div className="space-y-2">
          {(
            [
              {
                label: "시작",
                value: task.startAt,
                setDate: setStartDate,
                setTime: setStartTime,
                clear: () => patch({ startAt: null }),
              },
              {
                label: "마감",
                value: task.dueAt,
                setDate: setDueDate,
                setTime: setDueTime,
                clear: () => patch({ dueAt: null, allDay: task.startAt ? task.allDay : true, rrule: null }),
              },
            ] as const
          ).map((row) => (
            <div key={row.label} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">{row.label}</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 flex-1 justify-start font-normal">
                    <CalendarDays className="size-3.5" />
                    {row.value ? formatDayLabel(row.value, task.allDay) : "날짜 없음"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={row.value ? forDisplay(row.value, task.allDay) : undefined}
                    onSelect={row.setDate}
                  />
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                value={row.value && !task.allDay ? format(row.value, "HH:mm") : ""}
                onChange={(e) => row.setTime(e.target.value)}
                className="h-8 w-27"
              />
              {row.value && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground"
                  onClick={row.clear}
                >
                  <X className="size-3.5" />
                </Button>
              )}
            </div>
          ))}
          <Select
            value={rruleValue}
            onValueChange={(v) => patch({ rrule: v === "none" ? null : v })}
          >
            <SelectTrigger size="sm" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {rruleOptions.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 우선순위 / 리스트 */}
        <div className="flex flex-wrap gap-2">
          <Select
            value={String(task.priority)}
            onValueChange={(v) => patch({ priority: Number(v) })}
          >
            <SelectTrigger size="sm" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">우선순위 없음</SelectItem>
              <SelectItem value="1">낮음</SelectItem>
              <SelectItem value="2">중간</SelectItem>
              <SelectItem value="3">높음</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={task.projectId ?? "inbox"}
            onValueChange={(v) => patch({ projectId: v === "inbox" ? null : v })}
          >
            <SelectTrigger size="sm" className="w-fit">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="inbox">리스트 없음</SelectItem>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 태그 */}
        <Input
          value={tagsText}
          onChange={(e) => setTagsText(e.target.value)}
          onBlur={saveTags}
          placeholder="태그 (콤마로 구분)"
          className="h-8 text-sm"
        />

        {/* 한 줄 메모 (긴 기록은 아래 '기록' 섹션에) */}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (task.note ?? "") && patch({ note: note || null })}
          placeholder="한 줄 메모"
          className="min-h-16 resize-none text-sm"
        />

        {/* 메모 / 수업 스크립트 / 느낀 점 */}
        <TaskEntries target={{ type: "task", taskId: task.id }} />

        {/* 서브태스크 */}
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">
            서브태스크 {task.subtasks.length > 0 &&
              `${task.subtasks.filter((s) => s.status === "done").length}/${task.subtasks.length}`}
          </p>
          {task.subtasks.map((sub) => (
            <div key={sub.id} className="group flex items-center gap-2 py-0.5">
              <Checkbox
                checked={sub.status === "done"}
                onCheckedChange={(v) => toggle.mutate({ id: sub.id, done: v === true })}
                className="rounded-full"
              />
              <span
                className={cn(
                  "flex-1 text-sm",
                  sub.status === "done" && "text-muted-foreground line-through",
                )}
              >
                {sub.title}
              </span>
              <button
                className="hidden text-muted-foreground hover:text-red-500 group-hover:block"
                onClick={() => del.mutate(sub.id)}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Plus className="size-3.5 text-muted-foreground" />
            <Input
              value={subTitle}
              onChange={(e) => setSubTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing && subTitle.trim()) {
                  createSub.mutate({ title: subTitle.trim(), parentId: task.id });
                  setSubTitle("");
                }
              }}
              placeholder="서브태스크 추가"
              className="h-7 border-none px-0 text-sm shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
