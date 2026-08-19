"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  FileText,
  ListTodo,
  PenLine,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { createEntry } from "@/lib/actions/entries";
import {
  listGrowthEvidence,
  loadGrowthSummary,
  type EvidenceRow,
} from "@/lib/actions/growth";
import type { SourceRef } from "@/lib/growth-evidence";

const ORIGIN_META = {
  task: { label: "태스크", Icon: ListTodo },
  event: { label: "일정", Icon: CalendarDays },
  blog: { label: "블로그", Icon: FileText },
} as const;

/** 기록을 붙일 수 있는 대상인지 — 블로그 글은 네이버에 있으니 앱에서 메모를 달지 않는다 */
function entryTargetOf(ref: SourceRef | null) {
  if (ref?.type === "task") return { type: "task" as const, taskId: ref.id };
  if (ref?.type === "event") return { type: "event" as const, googleEventId: ref.googleEventId };
  return null;
}

function NoteForm({ row, onDone }: { row: EvidenceRow; onDone: () => void }) {
  const [content, setContent] = useState("");
  const target = entryTargetOf(row.ref);

  const save = useMutation({
    mutationFn: () =>
      createEntry({ target: target!, kind: "reflection", content: content.trim() }),
    onSuccess: () => {
      setContent("");
      onDone();
    },
  });

  if (!target) return null;

  return (
    <div className="mt-2 space-y-2">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
        placeholder="여기서 무엇을 새로 할 수 있게 됐는지, 무엇이 어려웠는지 적어 두세요. 이 내용이 다음 요약의 근거가 됩니다."
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={!content.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "저장 중…" : "느낀 점으로 저장"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          닫기
        </Button>
        {save.isError && <span className="text-xs text-destructive">저장하지 못했어요</span>}
      </div>
    </div>
  );
}

function EvidenceItem({ row, onSaved }: { row: EvidenceRow; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const { label, Icon } = ORIGIN_META[row.origin];
  const canAnnotate = entryTargetOf(row.ref) !== null;

  return (
    <li className={cn("rounded-lg border p-3", row.weak && "border-dashed")}>
      <div className="flex flex-wrap items-center gap-1.5">
        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">{row.title}</span>
        <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
          {label}
        </Badge>
        {row.at && (
          <span className="text-[11px] text-muted-foreground">
            {format(new Date(row.at), "M월 d일", { locale: ko })}
          </span>
        )}
        {row.entryCount > 0 && (
          <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
            기록 {row.entryCount}
          </Badge>
        )}
      </div>

      {row.note && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {row.note}
        </p>
      )}

      <div className="mt-1.5 flex items-center gap-2">
        {row.weak ? (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            남긴 내용이 없어 근거가 약합니다
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <CheckCircle2 className="size-3" />
            근거 있음
          </span>
        )}
        {canAnnotate && !open && (
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-[11px]"
            onClick={() => setOpen(true)}
          >
            <PenLine className="size-3" />
            메모 남기기
          </Button>
        )}
      </div>

      {open && (
        <NoteForm
          row={row}
          onDone={() => {
            setOpen(false);
            onSaved();
          }}
        />
      )}
    </li>
  );
}

/**
 * 요약에 쓸 수 있는 기록을 그대로 보여 주고, 부족한 곳을 직접 채우게 하는 화면.
 *
 * 성장 요약은 근거가 없으면 아무 말도 하지 않도록 만들어져 있다. 그래서 "왜 비어 있지"의
 * 답은 늘 기록 쪽에 있다. 무엇이 근거로 들어가는지, 무엇이 제목만 있어 약한지를 보여 주고
 * 그 자리에서 메모를 남길 수 있게 한다.
 */
export function EvidenceView() {
  const qc = useQueryClient();
  const [onlyWeak, setOnlyWeak] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["growth-evidence"],
    queryFn: () => listGrowthEvidence(),
  });
  const { data: summary } = useQuery({
    queryKey: ["growth"],
    queryFn: () => loadGrowthSummary(),
  });

  const inProgress = summary?.ok ? summary.data.content.inProgress : [];

  const rows = useMemo(
    () => (data?.rows ?? []).filter((r) => !onlyWeak || r.weak),
    [data, onlyWeak],
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["growth-evidence"] });
    qc.invalidateQueries({ queryKey: ["growth-source-count"] });
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2">
          <Link href="/">
            <ArrowLeft className="size-3.5" />
            성장
          </Link>
        </Button>
      </div>

      <header>
        <h1 className="text-2xl font-bold">요약이 보고 있는 기록</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          성장 요약은 근거가 없으면 아무 말도 하지 않습니다. 지금 무엇이 근거로 들어가는지,
          어디가 비어 있는지 보고 직접 채워 넣을 수 있어요.
        </p>
        {data && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {format(new Date(data.periodStart), "yyyy년 M월 d일", { locale: ko })} –{" "}
            {format(new Date(data.periodEnd), "M월 d일", { locale: ko })} · 기록{" "}
            {data.rows.length}건
            {data.weakCount > 0 && ` · 보강하면 좋을 항목 ${data.weakCount}건`}
          </p>
        )}
      </header>

      {/* 요약이 "아직 쌓이는 중"이라고 본 것 — 근거를 더하면 능력으로 넘어갈 후보들 */}
      {inProgress.length > 0 && (
        <section className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
          <h2 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
            <CircleDashed className="size-4 text-blue-500" />
            아직 쌓이는 중이라고 본 것
          </h2>
          <p className="mb-2 text-xs text-muted-foreground">
            여기에 근거가 더해지면 &quot;새로 할 수 있게 된 것&quot;으로 넘어갈 수 있습니다.
          </p>
          <ul className="space-y-1.5">
            {inProgress.map((p, i) => (
              <li key={i} className="rounded-md bg-background/60 px-3 py-2">
                <span className="text-sm">{p.title}</span>
                <p className="mt-0.5 text-xs text-muted-foreground">{p.why}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data && data.rows.length > 0 && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={onlyWeak ? "secondary" : "ghost"}
            className="h-8 text-xs"
            onClick={() => setOnlyWeak((v) => !v)}
          >
            근거가 약한 것만 {data.weakCount > 0 && `(${data.weakCount})`}
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {onlyWeak
            ? "근거가 약한 항목이 없어요. 기록이 잘 쌓이고 있습니다."
            : "아직 요약에 쓸 기록이 없어요. 태스크를 완료하거나 일정에 메모를 남겨 보세요."}
        </div>
      ) : (
        <ul className="space-y-2">
          {rows.map((row, i) => (
            <EvidenceItem key={`${row.origin}-${i}`} row={row} onSaved={refresh} />
          ))}
        </ul>
      )}
    </div>
  );
}
