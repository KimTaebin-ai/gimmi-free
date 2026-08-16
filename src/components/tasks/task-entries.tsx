"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { FileText, Lightbulb, Link2, Plus, StickyNote, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  createEntry,
  deleteEntry,
  listEntries,
  updateEntry,
  type EntryTarget,
} from "@/lib/actions/entries";
import type { EntryKind } from "@/generated/prisma/enums";

const KINDS: {
  value: EntryKind;
  label: string;
  icon: typeof StickyNote;
  placeholder: string;
}[] = [
  {
    value: "note",
    label: "메모",
    icon: StickyNote,
    placeholder: "떠오른 생각, 할 일 세부사항…",
  },
  {
    value: "script",
    label: "스크립트",
    icon: FileText,
    placeholder: "수업·토크·세미나에서 들은 내용을 그대로 붙여넣으세요. 길어도 괜찮아요.",
  },
  {
    value: "reflection",
    label: "느낀 점",
    icon: Lightbulb,
    placeholder: "무엇을 새로 알게 됐는지, 전에는 못 하던 무엇을 할 수 있게 됐는지…",
  },
  { value: "link", label: "자료", icon: Link2, placeholder: "참고한 링크나 출처" },
];

/** 태스크와 Google 일정 양쪽에서 쓰는 기록 섹션 */
export function TaskEntries({ target }: { target: EntryTarget }) {
  const qc = useQueryClient();
  const key =
    target.type === "task" ? ["entries", "task", target.taskId] : ["entries", "event", target.googleEventId];

  const { data: entries, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => listEntries(target),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    // 요약 근거가 바뀌므로 함께 갱신
    qc.invalidateQueries({ queryKey: ["growth-source-count"] });
  };

  const add = useMutation({
    mutationFn: (input: Parameters<typeof createEntry>[0]) => createEntry(input),
    onSuccess: invalidate,
  });
  const edit = useMutation({
    mutationFn: ({ id, ...input }: { id: string; content?: string; title?: string | null }) =>
      updateEntry(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteEntry(id),
    onSuccess: invalidate,
  });

  const [composerKind, setComposerKind] = useState<EntryKind | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");

  const active = KINDS.find((k) => k.value === composerKind);

  function submit() {
    if (!composerKind || !draftContent.trim()) return;
    add.mutate(
      { target, kind: composerKind, title: draftTitle || null, content: draftContent },
      {
        onSuccess: () => {
          setDraftTitle("");
          setDraftContent("");
          setComposerKind(null);
        },
      },
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">기록</p>

      {isLoading ? (
        <div className="h-12 animate-pulse rounded-md bg-muted" />
      ) : (
        entries?.map((entry) => {
          const kind = KINDS.find((k) => k.value === entry.kind) ?? KINDS[0];
          const Icon = kind.icon;
          return (
            <div key={entry.id} className="group/entry rounded-md border p-2.5">
              <div className="flex items-center gap-1.5">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground">
                  {kind.label}
                </span>
                {entry.title && (
                  <span className="truncate text-xs font-medium">{entry.title}</span>
                )}
                <span className="ml-auto text-[10px] text-muted-foreground/70">
                  {format(entry.createdAt, "M월 d일", { locale: ko })}
                </span>
                <button
                  className="text-muted-foreground opacity-0 transition-opacity hover:text-red-500 group-hover/entry:opacity-100"
                  onClick={() => remove.mutate(entry.id)}
                  aria-label="기록 삭제"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
              <Textarea
                defaultValue={entry.content}
                onBlur={(e) =>
                  e.target.value.trim() !== entry.content &&
                  edit.mutate({ id: entry.id, content: e.target.value })
                }
                className={cn(
                  "mt-1.5 min-h-16 resize-y border-none bg-transparent p-0 text-sm shadow-none focus-visible:ring-0",
                  entry.kind === "script" && "font-mono text-xs",
                )}
              />
            </div>
          );
        })
      )}

      {/* 작성기 */}
      {active ? (
        <div className="rounded-md border p-2.5">
          <div className="flex items-center gap-1.5">
            <active.icon className="size-3.5 text-muted-foreground" />
            <span className="text-[11px] font-medium text-muted-foreground">
              {active.label}
            </span>
            <button
              className="ml-auto text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setComposerKind(null)}
            >
              취소
            </button>
          </div>
          <Input
            value={draftTitle}
            onChange={(e) => setDraftTitle(e.target.value)}
            placeholder="제목 (선택)"
            className="mt-1.5 h-7 border-none px-0 text-xs shadow-none focus-visible:ring-0"
          />
          <Textarea
            autoFocus
            value={draftContent}
            onChange={(e) => setDraftContent(e.target.value)}
            placeholder={active.placeholder}
            className={cn(
              "mt-1 resize-y text-sm",
              composerKind === "script" ? "min-h-40 font-mono text-xs" : "min-h-20",
            )}
          />
          <Button
            size="sm"
            className="mt-2 h-7 text-xs"
            disabled={!draftContent.trim() || add.isPending}
            onClick={submit}
          >
            저장
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1">
          {KINDS.map((k) => (
            <Button
              key={k.value}
              variant="outline"
              size="sm"
              className="h-7 gap-1 px-2 text-xs font-normal text-muted-foreground"
              onClick={() => setComposerKind(k.value)}
            >
              <Plus className="size-3" />
              <k.icon className="size-3" />
              {k.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}
