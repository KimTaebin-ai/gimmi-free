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
import { describeRrule, formatDue, RRULE_PRESETS } from "@/lib/format-date";
import {
  useCreateTask,
  useDeleteTask,
  useProjects,
  useToggleTask,
  useUpdateTask,
} from "@/hooks/use-tasks";
import { PRIORITY_CHECKBOX } from "@/components/tasks/task-item";
import type { TaskWithRelations } from "@/lib/task-types";

export function TaskDetail({
  task,
  onClose,
}: {
  task: TaskWithRelations;
  onClose: () => void;
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

  const patch = (input: Parameters<typeof update.mutate>[0]["input"]) =>
    update.mutate({ id: task.id, input });

  function setDate(date: Date | undefined) {
    if (!date) return patch({ dueAt: null, allDay: true });
    if (task.dueAt && !task.allDay) {
      patch({ dueAt: set(date, { hours: task.dueAt.getHours(), minutes: task.dueAt.getMinutes() }) });
    } else {
      patch({ dueAt: startOfDay(date), allDay: true });
    }
  }

  function setTime(value: string) {
    const base = task.dueAt ?? startOfDay(new Date());
    if (!value) return patch({ dueAt: startOfDay(base), allDay: true });
    const [h, m] = value.split(":").map(Number);
    patch({ dueAt: set(base, { hours: h, minutes: m }), allDay: false });
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
        <Checkbox
          checked={task.status === "done"}
          onCheckedChange={(v) => toggle.mutate({ id: task.id, done: v === true })}
          className={cn("rounded-full", PRIORITY_CHECKBOX[task.priority])}
        />
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

        {/* 날짜/시간/반복 */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 justify-start font-normal">
                  <CalendarDays className="size-3.5" />
                  {task.dueAt ? formatDue(task.dueAt, task.allDay) : "날짜 없음"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={task.dueAt ?? undefined}
                  onSelect={setDate}
                />
              </PopoverContent>
            </Popover>
            {task.dueAt && (
              <>
                <Input
                  type="time"
                  value={task.allDay || !task.dueAt ? "" : format(task.dueAt, "HH:mm")}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-8 w-28"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground"
                  onClick={() => patch({ dueAt: null, allDay: true, rrule: null })}
                >
                  <X className="size-3.5" />
                </Button>
              </>
            )}
          </div>
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

        {/* 메모 */}
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (task.note ?? "") && patch({ note: note || null })}
          placeholder="메모"
          className="min-h-20 resize-none text-sm"
        />

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
