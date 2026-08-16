"use client";

import { useMemo, useRef, useState } from "react";
import { set, startOfDay } from "date-fns";
import { CalendarDays, Flag, Hash, ListTodo, Plus, Repeat, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { parseQuickAdd } from "@/lib/quick-add";
import { describeRrule, formatSchedule } from "@/lib/format-date";
import { useCreateTask, useProjects } from "@/hooks/use-tasks";

const PRIORITY_LABEL: Record<number, string> = { 3: "높음", 2: "중간", 1: "낮음" };
const PRIORITY_COLOR: Record<number, string> = {
  3: "text-red-500",
  2: "text-amber-500",
  1: "text-blue-500",
};

interface Schedule {
  date: Date | null;
  startTime: string; // "HH:mm" 또는 ""
  dueTime: string;
}

function combine(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return set(date, { hours: h, minutes: m, seconds: 0, milliseconds: 0 });
}

export function QuickAdd({ projectId }: { projectId?: string | null }) {
  const [text, setText] = useState("");
  const [schedule, setSchedule] = useState<Schedule | null>(null); // null = 파서 결과 사용
  const [priorityOverride, setPriorityOverride] = useState<number | null>(null);
  const [projectOverride, setProjectOverride] = useState<string | null | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);
  const create = useCreateTask();
  const { data: projects } = useProjects();

  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  // 파서 결과 + 명시적 선택을 합친 최종 draft
  const draft = useMemo(() => {
    let startAt: Date | null = null;
    let dueAt: Date | null = null;
    let allDay = true;
    if (schedule) {
      if (schedule.date) {
        if (schedule.startTime) {
          startAt = combine(schedule.date, schedule.startTime);
          allDay = false;
        }
        if (schedule.dueTime) {
          dueAt = combine(schedule.date, schedule.dueTime);
          allDay = false;
        } else if (!schedule.startTime) {
          dueAt = startOfDay(schedule.date);
        }
      }
    } else if (parsed) {
      dueAt = parsed.dueAt;
      allDay = parsed.allDay;
    }
    return {
      startAt,
      dueAt,
      allDay,
      priority: priorityOverride ?? parsed?.priority ?? 0,
      tagNames: parsed?.tagNames ?? [],
      rrule: parsed?.rrule ?? null,
      projectId: projectOverride !== undefined ? projectOverride : (projectId ?? null),
    };
  }, [schedule, parsed, priorityOverride, projectOverride, projectId]);

  const scheduleLabel = formatSchedule(draft.startAt, draft.dueAt, draft.allDay);
  const projectName =
    draft.projectId != null ? projects?.find((p) => p.id === draft.projectId)?.name : null;

  function openSchedule() {
    // 파서가 이미 잡은 날짜/시간을 초기값으로
    if (!schedule) {
      const base = parsed?.dueAt ?? null;
      setSchedule({
        date: base ? startOfDay(base) : startOfDay(new Date()),
        startTime: "",
        dueTime: base && !parsed?.allDay ? `${String(base.getHours()).padStart(2, "0")}:${String(base.getMinutes()).padStart(2, "0")}` : "",
      });
    }
  }

  function reset() {
    setText("");
    setSchedule(null);
    setPriorityOverride(null);
    setProjectOverride(undefined);
    inputRef.current?.focus();
  }

  function submit() {
    const title = parsed?.title;
    if (!title) return;
    create.mutate({
      title,
      startAt: draft.startAt,
      dueAt: draft.dueAt,
      allDay: draft.allDay,
      priority: draft.priority,
      tagNames: draft.tagNames,
      rrule: draft.rrule,
      projectId: draft.projectId,
    });
    reset();
  }

  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="relative">
        <Plus className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder='할 일 추가 — "내일 오후 3시 병원 #건강 !높음" 또는 아래 버튼으로'
          className="border-none pl-9 shadow-none focus-visible:ring-0"
        />
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-1">
        {/* 일정 (날짜 + 시작/마감 시간) */}
        <Popover onOpenChange={(o) => o && openSchedule()}>
          <PopoverTrigger asChild>
            <Button
              variant={scheduleLabel ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground"
            >
              <CalendarDays className="size-3.5" />
              {scheduleLabel ?? "일정"}
              {scheduleLabel && (
                <X
                  className="size-3 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSchedule({ date: null, startTime: "", dueTime: "" });
                  }}
                />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-2" align="start">
            <Calendar
              mode="single"
              selected={schedule?.date ?? undefined}
              onSelect={(d) =>
                setSchedule((s) => ({ ...(s ?? { startTime: "", dueTime: "" }), date: d ?? null }))
              }
            />
            <div className="mt-2 grid grid-cols-2 gap-2 px-1">
              <div>
                <Label className="mb-1 text-xs text-muted-foreground">시작 시간</Label>
                <Input
                  type="time"
                  value={schedule?.startTime ?? ""}
                  onChange={(e) =>
                    setSchedule((s) => ({
                      ...(s ?? { date: startOfDay(new Date()), dueTime: "" }),
                      date: s?.date ?? startOfDay(new Date()),
                      startTime: e.target.value,
                    }))
                  }
                  className="h-8"
                />
              </div>
              <div>
                <Label className="mb-1 text-xs text-muted-foreground">마감 시간</Label>
                <Input
                  type="time"
                  value={schedule?.dueTime ?? ""}
                  onChange={(e) =>
                    setSchedule((s) => ({
                      ...(s ?? { date: startOfDay(new Date()), startTime: "" }),
                      date: s?.date ?? startOfDay(new Date()),
                      dueTime: e.target.value,
                    }))
                  }
                  className="h-8"
                />
              </div>
            </div>
          </PopoverContent>
        </Popover>

        {/* 우선순위 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={draft.priority > 0 ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 gap-1 px-2 text-xs font-normal text-muted-foreground",
                draft.priority > 0 && PRIORITY_COLOR[draft.priority],
              )}
            >
              <Flag className="size-3.5" />
              {draft.priority > 0 ? PRIORITY_LABEL[draft.priority] : "우선순위"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {[3, 2, 1].map((p) => (
              <DropdownMenuItem key={p} onClick={() => setPriorityOverride(p)}>
                <Flag className={cn("size-3.5", PRIORITY_COLOR[p])} />
                {PRIORITY_LABEL[p]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => setPriorityOverride(0)}>없음</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 리스트 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={projectName ? "secondary" : "ghost"}
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground"
            >
              <ListTodo className="size-3.5" />
              {projectName ?? "리스트"}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onClick={() => setProjectOverride(null)}>
              리스트 없음
            </DropdownMenuItem>
            {projects?.map((p) => (
              <DropdownMenuItem key={p.id} onClick={() => setProjectOverride(p.id)}>
                {p.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* 파서가 잡은 반복/태그 표시 */}
        {draft.rrule && (
          <Badge variant="outline" className="h-7 gap-1 font-normal text-muted-foreground">
            <Repeat className="size-3" />
            {describeRrule(draft.rrule)}
          </Badge>
        )}
        {draft.tagNames.map((t) => (
          <Badge key={t} variant="outline" className="h-7 gap-1 font-normal text-muted-foreground">
            <Hash className="size-3" />
            {t}
          </Badge>
        ))}

        <div className="flex-1" />
        <Button
          size="sm"
          className="h-7 px-3 text-xs"
          disabled={!parsed?.title || create.isPending}
          onClick={submit}
        >
          추가
        </Button>
      </div>
    </div>
  );
}
