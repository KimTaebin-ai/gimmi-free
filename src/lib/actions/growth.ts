"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { hasClaudeKey, CLAUDE_MODEL } from "@/lib/claude";
import { collectGrowthInput, generateGrowthSummary } from "@/lib/growth";
import type {
  GrowthSummaryContent,
  GrowthSummaryResult,
  GrowthUnavailable,
} from "@/lib/growth-types";

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
  if (input.tasks.length === 0) {
    return {
      ok: false,
      error: {
        reason: "no_data",
        message:
          "아직 요약할 기록이 없어요. 태스크를 완료하거나, 태스크에 메모·스크립트·느낀 점을 남겨 보세요.",
      },
    };
  }
  return {
    ok: false,
    error: {
      reason: "no_data",
      message: `${input.tasks.length}건의 기록이 준비됐어요. "요약 만들기"를 눌러 정리해 보세요.`,
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
  if (input.tasks.length === 0) {
    return {
      ok: false,
      error: {
        reason: "no_data",
        message: "요약할 기록이 없어요. 태스크를 완료하거나 기록을 남겨 보세요.",
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
        sourceCount: input.tasks.length,
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

/** 요약 근거가 될 기록이 얼마나 쌓였는지 (버튼 안내용) */
export async function getGrowthSourceCount(): Promise<number> {
  const userId = await requireUserId();
  const { tasks } = await collectGrowthInput(userId);
  return tasks.length;
}
