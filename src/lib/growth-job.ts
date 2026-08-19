import "server-only";
import { prisma } from "@/lib/prisma";
import { CLAUDE_MODEL } from "@/lib/claude";
import { collectGrowthInput, generateGrowthSummary } from "@/lib/growth";

/**
 * 성장 요약을 백그라운드에서 만든다.
 *
 * 버튼을 누른 요청은 작업을 만들어 두고 바로 응답한다. 실제 생성은 `after()`가
 * 응답 뒤에 이어서 돌리므로, 사용자가 화면을 옮기거나 새로고침해도 멈추지 않는다.
 * 화면은 DB의 작업 상태를 보고 진행 중인지 판단한다 — 클라이언트 상태로 들고 있으면
 * 새로고침 한 번에 사라지기 때문이다.
 */

/**
 * 이 시간이 지나도 안 끝난 작업은 죽은 것으로 본다.
 *
 * 서버리스 함수는 시간이 다 되면 통보 없이 사라진다. 그러면 작업은 영원히 running으로
 * 남고 화면은 영원히 "정리하는 중"을 돈다. 되살릴 방법이 없으니 실패로 정리하고
 * 다시 시도할 수 있게 하는 편이 정직하다.
 */
export const STALE_AFTER_MS = 10 * 60 * 1000;

/** Anthropic API 오류를 사용자가 무엇을 해야 할지 알 수 있는 문장으로 */
export function explainApiError(err: unknown): string {
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

/**
 * 작업 하나를 끝까지 돌린다. **예외를 밖으로 내보내지 않는다** —
 * 이 함수는 응답이 끝난 뒤에 돌기 때문에 던져 봐야 받아 줄 곳이 없고,
 * 실패는 작업 행에 적어야 사용자가 볼 수 있다.
 */
export async function runGrowthJob(jobId: string, userId: string): Promise<void> {
  try {
    const input = await collectGrowthInput(userId);
    const content = await generateGrowthSummary(input);

    if (!content) {
      await failJob(jobId, "요약을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const summary = await prisma.growthSummary.create({
      data: {
        userId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        content,
        sourceCount: input.sources.length,
        model: CLAUDE_MODEL,
      },
    });

    await prisma.growthJob.update({
      where: { id: jobId },
      data: { status: "done", summaryId: summary.id, finishedAt: new Date() },
    });
  } catch (err) {
    console.error("[growth] 요약 생성 실패:", err);
    await failJob(jobId, explainApiError(err));
  }
}

async function failJob(jobId: string, message: string): Promise<void> {
  // 여기서 또 실패하면 손쓸 방법이 없다. 로그만 남기고 조용히 넘어간다
  // (그래도 오래된 작업 정리가 결국 실패로 바꿔 준다).
  await prisma.growthJob
    .update({
      where: { id: jobId },
      data: { status: "failed", error: message, finishedAt: new Date() },
    })
    .catch((e) => console.error("[growth] 작업 실패 기록도 실패:", e));
}

/**
 * 시간 안에 안 끝난 작업을 실패로 정리한다.
 *
 * 크론이 아니라 **상태를 물어볼 때마다** 돈다. Hobby 플랜 크론은 하루 한 번이라
 * 그걸 기다리면 화면이 하루 종일 "정리하는 중"으로 남는다.
 */
export async function sweepStaleJobs(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  await prisma.growthJob.updateMany({
    where: { userId, status: "running", startedAt: { lt: cutoff } },
    data: {
      status: "failed",
      error: "정리가 시간 안에 끝나지 않았어요. 다시 시도해 주세요.",
      finishedAt: new Date(),
    },
  });
}
