"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ArrowUpRight,
  CircleDashed,
  Info,
  ListChecks,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  getGrowthJobState,
  getGrowthSummary,
  listGrowthEvidence,
  loadGrowthSummary,
  startGrowthSummary,
} from "@/lib/actions/growth";
import { CapabilityTimeline } from "@/components/growth/capability-timeline";
import { LevelBadge } from "@/components/growth/level-badge";
import { SummaryHistory } from "@/components/growth/summary-history";

export function GrowthView({ userName }: { userName: string }) {
  const qc = useQueryClient();
  const { data: result, isLoading } = useQuery({
    queryKey: ["growth"],
    queryFn: () => loadGrowthSummary(),
  });
  const { data: evidence } = useQuery({
    queryKey: ["growth-evidence"],
    queryFn: () => listGrowthEvidence(),
  });

  // null이면 최신 요약을 보고 있다는 뜻. 지난 정리를 고르면 그 id가 들어온다.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const { data: picked } = useQuery({
    queryKey: ["growth-summary", pickedId],
    queryFn: () => getGrowthSummary(pickedId!),
    enabled: pickedId !== null,
  });

  /**
   * 정리 진행 상태는 서버(DB)에 있다. 그래서 새로고침하거나 다른 페이지를 갔다 와도
   * "정리하는 중"이 이어지고, 끝나면 이 화면이 알아서 결과를 집어 온다.
   * 도는 동안만 짧게 폴링한다.
   */
  const { data: job } = useQuery({
    queryKey: ["growth-job"],
    queryFn: () => getGrowthJobState(),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 3000 : false),
    refetchOnWindowFocus: true,
  });
  const pending = job?.status === "running";

  const start = useMutation({
    mutationFn: () => startGrowthSummary(),
    onSuccess: (r) => {
      setPickedId(null);
      setStartError(r.ok ? null : r.error.message);
      qc.invalidateQueries({ queryKey: ["growth-job"] });
    },
  });
  const [startError, setStartError] = useState<string | null>(null);

  // 정리가 끝난 순간에만 결과를 다시 불러온다(폴링이 계속 무효화하지 않도록)
  const wasRunning = useRef(false);
  useEffect(() => {
    if (pending) wasRunning.current = true;
    else if (wasRunning.current) {
      wasRunning.current = false;
      qc.invalidateQueries({ queryKey: ["growth"] });
      qc.invalidateQueries({ queryKey: ["growth-history"] });
      qc.invalidateQueries({ queryKey: ["growth-timeline"] });
      qc.invalidateQueries({ queryKey: ["growth-evidence"] });
    }
  }, [pending, qc]);

  const latest = result?.ok ? result.data : null;
  const summary = pickedId !== null ? (picked ?? null) : latest;
  const sourceCount = evidence?.rows.length;
  const error = result && !result.ok ? result.error : null;

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-4">
      <header>
        <h1 className="text-2xl font-bold">
          {userName ? `${userName}님, ` : ""}무엇을 할 수 있게 되었나요?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          노력은 시간을 쏟거나 일을 끝낸 것이 아니라,{" "}
          <b className="text-foreground">이전에 할 수 없던 걸 할 수 있게 되는 것</b>입니다.
          태스크·일정·블로그 글과 거기 남긴 기록에서 근거를 찾아 그 변화만 추려서 보여줍니다.
        </p>
      </header>

      {/* 상태 + 갱신 */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          {summary ? (
            <>
              <span className="text-foreground">
                {format(new Date(summary.periodStart), "M월 d일", { locale: ko })} –{" "}
                {format(new Date(summary.periodEnd), "M월 d일", { locale: ko })}
              </span>{" "}
              · 기록 {summary.sourceCount}건 ·{" "}
              {formatDistanceToNow(new Date(summary.createdAt), {
                addSuffix: true,
                locale: ko,
              })}{" "}
              정리
            </>
          ) : (
            <>지금 요약에 쓸 수 있는 기록 {sourceCount ?? 0}건</>
          )}
          {evidence && (
            <>
              {" · "}
              <Link href="/growth/evidence" className="text-primary hover:underline">
                근거 살펴보기
                {evidence.weakCount > 0 && ` (보강 ${evidence.weakCount}건)`}
              </Link>
            </>
          )}
        </div>
        <Button
          size="sm"
          variant={summary ? "outline" : "default"}
          disabled={pending || start.isPending || (sourceCount ?? 0) === 0}
          onClick={() => start.mutate()}
        >
          <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
          {pending ? "정리하는 중…" : summary ? "다시 정리" : "요약 만들기"}
        </Button>
      </div>

      {/* 백그라운드 정리가 실패했으면 이유를 보여 준다 — 조용히 사라지면 안 된다 */}
      {(startError || job?.status === "failed") && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-200">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{startError ?? (job?.status === "failed" ? job.message : "")}</span>
        </div>
      )}

      {pending && (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <RefreshCw className="size-4 shrink-0 animate-spin" />
          <span>
            정리하는 중입니다. 이 화면을 떠나거나 새로고침해도 계속 진행되고, 끝나면 여기에
            나타납니다.
          </span>
        </div>
      )}

      {pickedId !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <Info className="size-3.5 shrink-0" />
          지난 정리를 보고 있습니다.
          <Button
            size="sm"
            variant="ghost"
            className="h-6 px-1.5 text-xs"
            onClick={() => setPickedId(null)}
          >
            최신으로
          </Button>
        </div>
      )}

      {isLoading && <div className="h-48 animate-pulse rounded-lg bg-muted" />}

      {error && !summary && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" />
          <div>
            <p>{error.message}</p>
            {error.reason === "no_api_key" && (
              <p className="mt-1 text-xs">
                `.env`에 <code className="font-mono">ANTHROPIC_API_KEY</code>를 추가한 뒤 다시
                시도해 주세요.
              </p>
            )}
          </div>
        </div>
      )}

      {summary && (
        <div className="space-y-5">
          {/* 한 문장 요약 */}
          <p className="rounded-lg border-l-2 border-primary bg-muted/40 px-4 py-3 text-[15px] leading-relaxed">
            {summary.content.headline}
          </p>

          {/* 새로 할 수 있게 된 것 — 이 화면의 본론 */}
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-emerald-500" />
              새로 할 수 있게 된 것
              <span className="font-normal text-muted-foreground">
                {summary.content.gained.length}
              </span>
            </h2>
            {summary.content.gained.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                이 기간에는 새로 할 수 있게 된 것을 근거 있게 찾지 못했어요. 태스크·일정에
                &quot;느낀 점&quot;을 남기거나 블로그 글을 불러오면 더 정확해집니다.
              </p>
            ) : (
              <ul className="space-y-2">
                {summary.content.gained.map((g, i) => (
                  <li key={i} className="rounded-lg border p-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{g.title}</span>
                      <LevelBadge level={g.level} />
                      <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                        {g.area}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {g.evidence}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 아직 쌓이는 중 */}
          {summary.content.inProgress.length > 0 && (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <CircleDashed className="size-4 text-blue-500" />
                아직 쌓이는 중
              </h2>
              <ul className="space-y-1.5">
                {summary.content.inProgress.map((p, i) => (
                  <li key={i} className="rounded-md border px-3 py-2">
                    <span className="text-sm">{p.title}</span>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.why}</p>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 성장으로 이어지지 않은 것 — 솔직하게 */}
          {summary.content.notGrowth.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-semibold text-muted-foreground">
                해냈지만 새로운 능력으로는 이어지지 않은 일
              </h2>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {summary.content.notGrowth.join(" · ")}
              </p>
            </section>
          )}

          {/* 다음 단계 */}
          <section className="rounded-lg border p-3">
            <h2 className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <ArrowUpRight className="size-4" />
              다음에 할 수 있게 되면 좋을 것
            </h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {summary.content.nextStep}
            </p>
          </section>
        </div>
      )}

      {/* 달을 지나며 쌓인 것 — 최신 요약 하나로는 보이지 않는 축적 */}
      <CapabilityTimeline />

      <SummaryHistory selectedId={pickedId} onSelect={setPickedId} />

      {/* 근거가 비면 요약도 빈다. 채우러 갈 길을 늘 열어 둔다 */}
      <Link
        href="/growth/evidence"
        className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm transition-colors hover:bg-accent/40"
      >
        <ListChecks className="size-4 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1">
          요약이 보고 있는 기록 살펴보기
          {evidence && evidence.weakCount > 0 && (
            <span className="text-muted-foreground">
              {" "}
              · 근거가 약한 항목 {evidence.weakCount}건
            </span>
          )}
        </span>
        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
      </Link>
    </div>
  );
}
