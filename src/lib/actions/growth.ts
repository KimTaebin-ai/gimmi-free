"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { hasClaudeKey, CLAUDE_MODEL } from "@/lib/claude";
import { collectGrowthInput, generateGrowthSummary } from "@/lib/growth";
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

/** 사용자가 명시적으로 요청했을 때만 LLM을 호출한다 */
export async function refreshGrowthSummary(): Promise<GrowthResponse> {
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

  const input = await collectGrowthInput(userId);
  if (input.sources.length === 0) {
    return {
      ok: false,
      error: {
        reason: "no_data",
        message: "요약할 기록이 없어요. 태스크를 완료하거나, 기록을 남기거나, 블로그 글을 불러와 보세요.",
      },
    };
  }

  try {
    const content = await generateGrowthSummary(input);
    if (!content) {
      return {
        ok: false,
        error: { reason: "error", message: "요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요." },
      };
    }
    const saved = await prisma.growthSummary.create({
      data: {
        userId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        content,
        sourceCount: input.sources.length,
        model: CLAUDE_MODEL,
      },
    });
    return { ok: true, data: toResult(saved, false) };
  } catch (err) {
    console.error("[growth] 요약 생성 실패:", err);
    return { ok: false, error: { reason: "error", message: explainApiError(err) } };
  }
}

/** Anthropic API 오류를 사용자가 무엇을 해야 할지 알 수 있는 문장으로 */
function explainApiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/credit balance is too low/i.test(raw)) {
    return "Anthropic 계정에 크레딧이 없습니다. console.anthropic.com 의 Plans & Billing에서 크레딧을 충전한 뒤 다시 시도해 주세요.";
  }
  if (/authentication|invalid x-api-key/i.test(raw)) {
    return "ANTHROPIC_API_KEY가 올바르지 않습니다. 키를 다시 확인해 주세요.";
  }
  if (/rate limit/i.test(raw)) {
    return "요청이 잠시 몰렸습니다. 조금 뒤에 다시 시도해 주세요.";
  }
  if (/overloaded/i.test(raw)) {
    return "Anthropic 서비스가 혼잡합니다. 잠시 후 다시 시도해 주세요.";
  }
  return raw.slice(0, 300);
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
