import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";
import { CLAUDE_MODEL, getClaude } from "@/lib/claude";
import { GrowthSummarySchema, type GrowthSummaryContent } from "@/lib/growth-types";

/** 요약이 다루는 기간 */
const LOOKBACK_DAYS = 90;
/** 프롬프트에 넣을 최대 태스크 수 (토큰 폭주 방지) */
const MAX_TASKS = 120;
/** 기록 하나당 넣을 최대 길이 — 긴 강의 스크립트는 앞부분만 */
const MAX_ENTRY_CHARS = 2000;

const SYSTEM_PROMPT = `당신은 사용자의 기록을 읽고 성장을 정리하는 조력자입니다.

사용자가 정의한 "노력"은 이렇습니다:
> 단순히 무언가를 해내거나 시간을 쏟는 게 아니라, **이전에 할 수 없던 걸 할 수 있게 되는 것**.

이 정의를 기준으로 판단하세요.

- 완료한 일의 목록을 나열하지 마세요. 완료 자체는 성장이 아닙니다.
- "무엇을 했는가"가 아니라 "무엇을 할 수 있게 되었는가"를 쓰세요.
- 근거 없이 추측하지 마세요. 기록에서 드러나지 않으면 gained에 넣지 않습니다.
- 반복 업무나 유지 활동은 솔직하게 notGrowth에 넣으세요. 억지로 성장으로 포장하지 마세요.
- 사용자가 남긴 메모·스크립트·느낀 점이 가장 중요한 근거입니다. 제목만 있는 태스크는 근거가 약합니다.
- 한국어로, 담백하게 씁니다. 칭찬이나 격려보다 정확한 관찰이 필요합니다.
- 기록이 빈약하면 gained를 비우고 그 사실을 headline에 적으세요.`;

interface TaskForPrompt {
  title: string;
  completedAt: Date | null;
  project: string | null;
  tags: string[];
  note: string | null;
  entries: { kind: string; title: string | null; content: string }[];
}

function renderTasks(tasks: TaskForPrompt[]): string {
  return tasks
    .map((t, i) => {
      const parts = [`## ${i + 1}. ${t.title}`];
      if (t.completedAt) parts.push(`완료일: ${t.completedAt.toISOString().slice(0, 10)}`);
      if (t.project) parts.push(`리스트: ${t.project}`);
      if (t.tags.length) parts.push(`태그: ${t.tags.join(", ")}`);
      if (t.note) parts.push(`메모: ${t.note.slice(0, MAX_ENTRY_CHARS)}`);
      for (const e of t.entries) {
        const label =
          { note: "메모", script: "스크립트/강의 내용", reflection: "느낀 점", link: "참고 자료" }[
            e.kind
          ] ?? e.kind;
        parts.push(
          `[${label}]${e.title ? ` ${e.title}` : ""}\n${e.content.slice(0, MAX_ENTRY_CHARS)}`,
        );
      }
      return parts.join("\n");
    })
    .join("\n\n");
}

export interface GrowthInput {
  tasks: TaskForPrompt[];
  periodStart: Date;
  periodEnd: Date;
}

/** 요약 대상 데이터를 모은다 (LLM 호출 없음 — 테스트/캐시 판단에 재사용) */
export async function collectGrowthInput(userId: string): Promise<GrowthInput> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - LOOKBACK_DAYS);

  const rows = await prisma.task.findMany({
    where: {
      userId,
      OR: [
        { status: "done", completedAt: { gte: periodStart } },
        // 완료하지 않았어도 기록을 남긴 태스크는 근거가 된다
        { entries: { some: { createdAt: { gte: periodStart } } } },
      ],
    },
    include: {
      project: { select: { name: true } },
      tags: { include: { tag: { select: { name: true } } } },
      entries: {
        orderBy: { createdAt: "asc" },
        select: { kind: true, title: true, content: true },
      },
    },
    orderBy: { completedAt: "desc" },
    take: MAX_TASKS,
  });

  return {
    periodStart,
    periodEnd,
    tasks: rows.map((t) => ({
      title: t.title,
      completedAt: t.completedAt,
      project: t.project?.name ?? null,
      tags: t.tags.map((x) => x.tag.name),
      note: t.note,
      entries: t.entries,
    })),
  };
}

/**
 * Claude로 성장 요약을 만든다. 구조화 출력(structured outputs)으로 스키마를 강제한다.
 * 반환값이 null이면 호출부에서 사유를 안내한다.
 */
export async function generateGrowthSummary(
  input: GrowthInput,
): Promise<GrowthSummaryContent | null> {
  const client = getClaude();
  if (!client || input.tasks.length === 0) return null;

  const period = `${input.periodStart.toISOString().slice(0, 10)} ~ ${input.periodEnd
    .toISOString()
    .slice(0, 10)}`;

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(GrowthSummarySchema) },
    messages: [
      {
        role: "user",
        content: `기간: ${period}\n아래는 이 기간의 태스크와 기록입니다. 이 사람이 무엇을 할 수 있게 되었는지 정리해 주세요.\n\n${renderTasks(input.tasks)}`,
      },
    ],
  });

  // 안전 분류기가 거절하면 content가 비어 있을 수 있다 — 먼저 확인
  if (response.stop_reason === "refusal") {
    throw new Error("요약 생성이 거절되었습니다. 기록 내용을 확인해 주세요.");
  }
  return response.parsed_output ?? null;
}
