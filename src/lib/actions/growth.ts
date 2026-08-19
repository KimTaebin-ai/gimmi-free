"use server";

import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { hasClaudeKey } from "@/lib/claude";
import { collectGrowthInput } from "@/lib/growth";
import { runGrowthJob, sweepStaleJobs } from "@/lib/growth-job";
import type {
  GrowthSummaryContent,
  GrowthSummaryResult,
  GrowthUnavailable,
  MonthlyCapabilities,
} from "@/lib/growth-types";
import { buildMonthlyTimeline } from "@/lib/growth-timeline";
import { evidenceStrength, isWeakEvidence, type SourceRef } from "@/lib/growth-evidence";

export type GrowthResponse =
  | { ok: true; data: GrowthSummaryResult }
  | { ok: false; error: GrowthUnavailable };

function toResult(row: {
  content: unknown;
  periodStart: Date;
  periodEnd: Date;
  sourceCount: number;
  createdAt: Date;
}, cached: boolean): GrowthSummaryResult {
  return {
    content: row.content as GrowthSummaryContent,
    periodStart: row.periodStart.toISOString(),
    periodEnd: row.periodEnd.toISOString(),
    sourceCount: row.sourceCount,
    createdAt: row.createdAt.toISOString(),
    cached,
  };
}

/**
 * 저장된 요약을 읽는다. 없으면 만들지 않고 상태만 알려준다
 * (첫 화면 로딩에서 임의로 API 비용이 발생하지 않도록).
 */
export async function loadGrowthSummary(): Promise<GrowthResponse> {
  const userId = await requireUserId();

  const latest = await prisma.growthSummary.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
  if (latest) return { ok: true, data: toResult(latest, true) };

  if (!hasClaudeKey()) {
    return {
      ok: false,
      error: {
        reason: "no_api_key",
        message:
          "ANTHROPIC_API_KEY가 설정되어 있지 않습니다. 환경변수를 추가하면 기록을 바탕으로 요약을 만들 수 있어요.",
      },
    };
  }

  const input = await collectGrowthInput(userId);
  if (input.sources.length === 0) {
    return {
      ok: false,
      error: {
        reason: "no_data",
        message:
          "아직 요약할 기록이 없어요. 태스크를 완료하거나, 태스크·일정에 메모·스크립트·느낀 점을 남기거나, 블로그 글을 불러와 보세요.",
      },
    };
  }
  return {
    ok: false,
    error: {
      reason: "no_data",
      message: `${input.sources.length}건의 기록이 준비됐어요. "요약 만들기"를 눌러 정리해 보세요.`,
    },
  };
}

// ---------- 백그라운드 정리 ----------

export type GrowthJobState =
  | { status: "idle" }
  | { status: "running"; startedAt: string }
  | { status: "failed"; message: string; finishedAt: string }
  | { status: "done"; finishedAt: string };

function toJobState(job: {
  status: string;
  error: string | null;
  startedAt: Date;
  finishedAt: Date | null;
} | null): GrowthJobState {
  if (!job) return { status: "idle" };
  if (job.status === "running") return { status: "running", startedAt: job.startedAt.toISOString() };
  if (job.status === "failed") {
    return {
      status: "failed",
      message: job.error ?? "정리에 실패했어요.",
      finishedAt: (job.finishedAt ?? job.startedAt).toISOString(),
    };
  }
  return { status: "done", finishedAt: (job.finishedAt ?? job.startedAt).toISOString() };
}

/**
 * 지금 정리가 돌고 있는지 — 화면이 주기적으로 물어본다.
 *
 * 진행 상태를 DB에서 읽기 때문에 새로고침하거나 다른 페이지를 갔다 와도
 * "정리하는 중"이 그대로 이어진다.
 */
export async function getGrowthJobState(): Promise<GrowthJobState> {
  const userId = await requireUserId();
  await sweepStaleJobs(userId);

  const job = await prisma.growthJob.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { status: true, error: true, startedAt: true, finishedAt: true },
  });
  return toJobState(job);
}

export type StartGrowthResponse =
  | { ok: true; state: GrowthJobState }
  | { ok: false; error: GrowthUnavailable };

/**
 * 정리를 시작만 하고 곧바로 응답한다.
 *
 * 실제 생성은 `after()`가 응답 뒤에 이어서 돌린다 — 사용자가 화면을 옮기거나 새로고침해도
 * 계속된다. 이미 돌고 있으면 새로 만들지 않는다(두 번 눌러도, 탭이 두 개여도 한 번만 과금).
 */
export async function startGrowthSummary(): Promise<StartGrowthResponse> {
  const userId = await requireUserId();

  if (!hasClaudeKey()) {
    return {
      ok: false,
      error: {
        reason: "no_api_key",
        message: "ANTHROPIC_API_KEY가 설정되어 있지 않습니다.",
      },
    };
  }

  await sweepStaleJobs(userId);
  const running = await prisma.growthJob.findFirst({
    where: { userId, status: "running" },
    orderBy: { startedAt: "desc" },
    select: { status: true, error: true, startedAt: true, finishedAt: true },
  });
  if (running) return { ok: true, state: toJobState(running) };

  // 근거가 없으면 작업을 만들지 않는다 — 실패할 걸 알면서 API를 부를 이유가 없다
  const input = await collectGrowthInput(userId);
  if (input.sources.length === 0) {
    return {
      ok: false,
      error: {
        reason: "no_data",
        message:
          "요약할 기록이 없어요. 태스크를 완료하거나, 기록을 남기거나, 블로그 글을 불러와 보세요.",
      },
    };
  }

  const job = await prisma.growthJob.create({
    data: { userId },
    select: { id: true, status: true, error: true, startedAt: true, finishedAt: true },
  });

  after(() => runGrowthJob(job.id, userId));

  return { ok: true, state: toJobState(job) };
}


// ---------- 월별 타임라인 ----------

/**
 * 지금까지 만든 모든 요약에서 "새로 할 수 있게 된 것"을 모아 월별로 돌려준다.
 *
 * 요약을 다시 만들어도 예전 결과가 사라지지 않는다 — 요약은 지울 이유가 없는 기록이고,
 * 달마다 무엇이 늘었는지는 여러 번의 요약을 겹쳐 봐야 보이기 때문이다.
 */
export async function listCapabilityTimeline(): Promise<MonthlyCapabilities[]> {
  const userId = await requireUserId();
  const rows = await prisma.growthSummary.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { content: true, periodEnd: true, createdAt: true },
  });

  return buildMonthlyTimeline(
    rows.map((r) => ({
      content: r.content as { gained?: never[] } | null,
      periodEnd: r.periodEnd,
      createdAt: r.createdAt,
    })),
  );
}

export interface GrowthSummaryListItem {
  id: string;
  periodStart: string;
  periodEnd: string;
  sourceCount: number;
  createdAt: string;
  headline: string;
  gainedCount: number;
}

/** 지난 요약 목록 — 새로 만들기 전에도 예전 정리를 계속 볼 수 있게 */
export async function listGrowthSummaries(limit = 24): Promise<GrowthSummaryListItem[]> {
  const userId = await requireUserId();
  const rows = await prisma.growthSummary.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return rows.map((r) => {
    const content = r.content as GrowthSummaryContent | null;
    return {
      id: r.id,
      periodStart: r.periodStart.toISOString(),
      periodEnd: r.periodEnd.toISOString(),
      sourceCount: r.sourceCount,
      createdAt: r.createdAt.toISOString(),
      headline: content?.headline ?? "(내용 없음)",
      gainedCount: content?.gained?.length ?? 0,
    };
  });
}

/** 저장된 요약 하나를 그대로 읽는다 */
export async function getGrowthSummary(id: string): Promise<GrowthSummaryResult | null> {
  const userId = await requireUserId();
  const row = await prisma.growthSummary.findFirst({ where: { id, userId } });
  return row ? toResult(row, true) : null;
}

// ---------- 요약에 쓸 수 있는 기록 ----------

export interface EvidenceRow {
  origin: "task" | "event" | "blog";
  title: string;
  at: string | null;
  /** 근거의 세기 (growth-evidence.ts의 점수) */
  strength: number;
  /** 제목만 있고 남긴 내용이 없는 항목 */
  weak: boolean;
  /** 붙어 있는 기록 수 */
  entryCount: number;
  /** 요약 한 줄(메모·설명·글 요약) */
  note: string | null;
  ref: SourceRef | null;
}

export interface EvidenceOverview {
  periodStart: string;
  periodEnd: string;
  rows: EvidenceRow[];
  /** 근거가 약해 보강하면 좋을 항목 수 */
  weakCount: number;
}

/**
 * 지금 요약에 쓰이는 기록을 그대로 보여 준다.
 *
 * 개수만 알려 주면 "왜 이런 요약이 나왔지"에 답할 수 없다. 무엇이 근거로 들어가고
 * 무엇이 제목만 있어 약한지를 화면에서 보고, 약한 것부터 채울 수 있어야 한다.
 */
export async function listGrowthEvidence(): Promise<EvidenceOverview> {
  const userId = await requireUserId();
  const input = await collectGrowthInput(userId);

  const rows: EvidenceRow[] = input.sources.map((s) => ({
    origin: s.origin,
    title: s.title,
    at: s.at?.toISOString() ?? null,
    strength: evidenceStrength(s),
    weak: isWeakEvidence(s),
    entryCount: s.entries.length,
    note: s.note,
    ref: s.ref,
  }));

  return {
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    rows,
    weakCount: rows.filter((r) => r.weak).length,
  };
}
