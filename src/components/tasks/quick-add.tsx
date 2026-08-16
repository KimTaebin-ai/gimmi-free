"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Flag, Hash, Plus, Repeat } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { parseQuickAdd } from "@/lib/quick-add";
import { describeRrule, formatDue } from "@/lib/format-date";
import { useCreateTask } from "@/hooks/use-tasks";

const PRIORITY_LABEL: Record<number, string> = { 3: "높음", 2: "중간", 1: "낮음" };

export function QuickAdd({ projectId }: { projectId?: string | null }) {
  const [text, setText] = useState("");
  const create = useCreateTask();
  const parsed = useMemo(() => (text.trim() ? parseQuickAdd(text) : null), [text]);

  function submit() {
    if (!parsed || !parsed.title) return;
    create.mutate({
      title: parsed.title,
      dueAt: parsed.dueAt,
      allDay: parsed.allDay,
      priority: parsed.priority,
      tagNames: parsed.tagNames,
      rrule: parsed.rrule,
      projectId: projectId ?? null,
    });
    setText("");
  }

  return (
    <div>
      <div className="relative">
        <Plus className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) submit();
          }}
          placeholder='할 일 추가 — 예: "내일 오후 3시 병원 #건강 !높음"'
          className="pl-9"
        />
      </div>
      {parsed && (parsed.dueAt || parsed.priority > 0 || parsed.tagNames.length > 0 || parsed.rrule) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1 text-xs">
          {parsed.dueAt && (
            <Badge variant="outline" className="gap-1 font-normal">
              <CalendarDays className="size-3" />
              {formatDue(parsed.dueAt, parsed.allDay)}
            </Badge>
          )}
          {parsed.rrule && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Repeat className="size-3" />
              {describeRrule(parsed.rrule)}
            </Badge>
          )}
          {parsed.priority > 0 && (
            <Badge variant="outline" className="gap-1 font-normal">
              <Flag className="size-3" />
              {PRIORITY_LABEL[parsed.priority]}
            </Badge>
          )}
          {parsed.tagNames.map((t) => (
            <Badge key={t} variant="outline" className="gap-1 font-normal">
              <Hash className="size-3" />
              {t}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
