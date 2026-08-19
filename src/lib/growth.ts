import "server-only";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { prisma } from "@/lib/prisma";
import { CLAUDE_MODEL, getClaude } from "@/lib/claude";
import { GrowthSummarySchema, type GrowthSummaryContent } from "@/lib/growth-types";
import {
  isWeakEvidence,
  ORIGIN_LABEL,
  sortByEvidence,
  type EntryForPrompt,
  type SourceForPrompt,
} from "@/lib/growth-evidence";
import { buildProbes, mergeHits } from "@/lib/rag/retrieval-plan";
import { searchChunks, type RetrievedChunk } from "@/lib/rag/search";
import { hasVoyageKey } from "@/lib/rag/voyage";

/** 요약이 다루는 기간 */
const LOOKBACK_DAYS = 90;
/** 프롬프트에 넣을 최대 태스크 수 (토큰 폭주 방지) */
const MAX_TASKS = 120;
/** 기록 하나당 넣을 최대 길이 — 긴 강의 스크립트는 앞부분만 */
const MAX_ENTRY_CHARS = 2000;
/** 탐침 하나가 가져올 블로그 본문 대목 수 */
const HITS_PER_PROBE = 5;
/** 탐침 결과를 합친 뒤 프롬프트에 실을 최대 대목 수 */
const MAX_EXCERPTS = 24;
/** 이보다 안 닮은 대목은 넣지 않는다 — 아무 대목이나 실리면 모델이 엉뚱한 결론을 낸다 */
const MIN_EXCERPT_SCORE = 0.35;

const SYSTEM_PROMPT = `당신은 사용자의 기록을 읽고 성장을 정리하는 조력자입니다.

사용자가 정의한 "노력"은 이렇습니다:
> 단순히 무언가를 해내거나 시간을 쏟는 게 아니라, **이전에 할 수 없던 걸 할 수 있게 되는 것**.

이 정의를 기준으로 판단하세요.

- 완료한 일의 목록을 나열하지 마세요. 완료 자체는 성장이 아닙니다.
- "무엇을 했는가"가 아니라 "무엇을 할 수 있게 되었는가"를 쓰세요.
- 근거 없이 추측하지 마세요. 기록에서 드러나지 않으면 gained에 넣지 않습니다.
- 반복 업무나 유지 활동은 솔직하게 notGrowth에 넣으세요. 억지로 성장으로 포장하지 마세요.
- 사용자가 남긴 메모·스크립트·느낀 점이 가장 중요한 근거입니다.
  제목만 있고 기록이 없는 항목("남긴 기록 없음"으로 표시됨)은 근거가 약하니 단정하지 마세요.
- 자료에는 세 종류가 섞여 있습니다. 모두 동등한 근거로 취급하세요.
  - [태스크]: 직접 만든 할 일과 거기 남긴 기록
  - [일정]: Google 캘린더에서 온 수업·세미나·미팅
  - [블로그 글]: 실제로 발행한 글. **글로 정리해 남에게 설명할 수 있게 되었다는 신호**라
    근거로서 무게가 큽니다.
- 자료 뒤에 "블로그 본문에서 찾은 대목"이 붙을 수 있습니다. 이건 글 전문이 아니라
  검색으로 뽑아 온 **일부**입니다. 거기 적힌 내용은 본인이 직접 쓴 말이니 강한 근거로
  쓰되, 대목에 없는 내용을 글 전체에 있었다고 넘겨짚지 마세요. 앞뒤가 잘려 있을 수 있습니다.
- 한국어로, 담백하게 씁니다. 칭찬이나 격려보다 정확한 관찰이 필요합니다.
- 기록이 빈약하면 gained를 비우고 그 사실을 headline에 적으세요.`;

function renderSources(sources: SourceForPrompt[]): string {
  return sources
    .map((t, i) => {
      const parts = [`## ${i + 1}. ${ORIGIN_LABEL[t.origin]} ${t.title}`];
      if (t.at) parts.push(`날짜: ${t.at.toISOString().slice(0, 10)}`);
      if (isWeakEvidence(t)) parts.push("(남긴 내용 없음 — 근거가 약함)");
      if (t.project) parts.push(`${t.origin === "blog" ? "카테고리" : "리스트"}: ${t.project}`);
      if (t.tags.length) parts.push(`태그: ${t.tags.join(", ")}`);
      if (t.note)
        parts.push(
          `${t.origin === "blog" ? "글 요약" : "메모"}: ${t.note.slice(0, MAX_ENTRY_CHARS)}`,
        );
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

/** 검색으로 뽑아 온 블로그 본문 대목들 */
function renderExcerpts(hits: RetrievedChunk[]): string {
  if (hits.length === 0) return "";

  const body = hits
    .map((h, i) => {
      const date = h.occurredAt.toISOString().slice(0, 10);
      return `### 대목 ${i + 1} — ${h.title} (${date})\n${h.text}`;
    })
    .join("\n\n");

  return `\n\n# 블로그 본문에서 찾은 대목\n\n아래는 위 글들의 본문 중 이 기간의 활동과 관련 있어 보이는 부분만 뽑아 온 것입니다.\n글 전문이 아니라 발췌이며, 앞뒤가 잘려 있을 수 있습니다.\n\n${body}`;
}

export interface GrowthInput {
  userId: string;
  sources: SourceForPrompt[];
  periodStart: Date;
  periodEnd: Date;
}

/**
 * 블로그 본문에서 이 기간과 관련된 대목을 검색해 온다.
 *
 * 이 단계만 임베딩 API를 쓴다. 그래서 화면을 여는 것만으로는 돌지 않고,
 * 사용자가 "정리해 줘"를 눌렀을 때(= 어차피 Claude를 부를 때)만 불린다.
 *
 * Voyage 키가 없거나 검색이 실패하면 조용히 빈 배열을 준다 — 발췌는 있으면 좋은 것이지,
 * 없다고 요약을 못 만들 이유는 아니다.
 */
async function retrieveExcerpts(input: GrowthInput): Promise<RetrievedChunk[]> {
  if (!hasVoyageKey()) return [];

  // 태스크·일정 제목이 "이 기간에 뭘 했는지"를 말해 준다. 블로그 글 제목은 빼는데,
  // 그걸로 검색하면 그 글 자기 자신만 다시 올라와 새로운 근거가 되지 않는다.
  const activityTitles = input.sources
    .filter((s) => s.origin !== "blog")
    .map((s) => s.title);

  try {
    const results = await Promise.all(
      buildProbes(activityTitles).map((probe) =>
        searchChunks(input.userId, probe, {
          limit: HITS_PER_PROBE,
          since: input.periodStart,
          minScore: MIN_EXCERPT_SCORE,
        }),
      ),
    );
    return mergeHits(results, MAX_EXCERPTS);
  } catch (err) {
    console.error("[growth] 블로그 본문 검색 실패 — 발췌 없이 진행합니다:", err);
    return [];
  }
}

/** 요약 대상 데이터를 모은다 (LLM 호출 없음 — 테스트/캐시 판단에 재사용) */
export async function collectGrowthInput(userId: string): Promise<GrowthInput> {
  const periodEnd = new Date();
  const periodStart = new Date(periodEnd);
  periodStart.setDate(periodStart.getDate() - LOOKBACK_DAYS);

  const [taskRows, eventRows, blogRows] = await Promise.all([
    prisma.task.findMany({
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
    }),
    // Google 일정도 근거다 — 수업·세미나·미팅은 대개 일정으로 들어온다
    prisma.calendarEvent.findMany({
      where: { userId, startAt: { gte: periodStart, lte: periodEnd } },
      orderBy: { startAt: "desc" },
      take: MAX_TASKS,
      select: {
        googleEventId: true,
        title: true,
        description: true,
        startAt: true,
      },
    }),
    // 블로그 글도 근거다 — 글로 정리했다는 건 그 주제를 설명할 수 있게 됐다는 뜻
    prisma.blogPost.findMany({
      where: { userId, publishedAt: { gte: periodStart, lte: periodEnd } },
      orderBy: { publishedAt: "desc" },
      take: MAX_TASKS,
      select: {
        title: true,
        summary: true,
        category: true,
        tags: true,
        publishedAt: true,
      },
    }),
  ]);

  // 일정에 붙은 기록을 한 번에 가져와 이벤트별로 묶는다
  const eventEntries = await prisma.taskEntry.findMany({
    where: {
      userId,
      googleEventId: { in: eventRows.map((e) => e.googleEventId) },
    },
    orderBy: { createdAt: "asc" },
    select: { googleEventId: true, kind: true, title: true, content: true },
  });
  const byEvent = new Map<string, EntryForPrompt[]>();
  for (const e of eventEntries) {
    if (!e.googleEventId) continue;
    const list = byEvent.get(e.googleEventId);
    if (list) list.push(e);
    else byEvent.set(e.googleEventId, [e]);
  }

  const taskSources: SourceForPrompt[] = taskRows.map((t) => ({
    origin: "task",
    title: t.title,
    at: t.completedAt,
    project: t.project?.name ?? null,
    tags: t.tags.map((x) => x.tag.name),
    note: t.note,
    entries: t.entries,
  }));

  const eventSources: SourceForPrompt[] = eventRows.map((e) => ({
    origin: "event",
    title: e.title,
    at: e.startAt,
    project: null,
    tags: [],
    note: e.description,
    entries: byEvent.get(e.googleEventId) ?? [],
  }));

  const blogSources: SourceForPrompt[] = blogRows.map((b) => ({
    origin: "blog",
    title: b.title,
    at: b.publishedAt,
    project: b.category,
    tags: b.tags,
    note: b.summary,
    entries: [],
  }));

  // 근거가 강한 것부터 — 프롬프트 앞쪽에 오도록
  const sources = sortByEvidence([
    ...taskSources,
    ...eventSources,
    ...blogSources,
  ]).slice(0, MAX_TASKS);

  return { userId, periodStart, periodEnd, sources };
}

/**
 * Claude로 성장 요약을 만든다. 구조화 출력(structured outputs)으로 스키마를 강제한다.
 * 반환값이 null이면 호출부에서 사유를 안내한다.
 */
export async function generateGrowthSummary(
  input: GrowthInput,
): Promise<GrowthSummaryContent | null> {
  const client = getClaude();
  if (!client || input.sources.length === 0) return null;

  const period = `${input.periodStart.toISOString().slice(0, 10)} ~ ${input.periodEnd
    .toISOString()
    .slice(0, 10)}`;
  const excerpts = await retrieveExcerpts(input);

  const response = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    output_config: { format: zodOutputFormat(GrowthSummarySchema) },
    messages: [
      {
        role: "user",
        content: `기간: ${period}\n아래는 이 기간의 태스크, Google 캘린더 일정, 발행한 블로그 글, 그리고 거기 남긴 기록입니다.\n이 사람이 무엇을 할 수 있게 되었는지 정리해 주세요.\n\n${renderSources(input.sources)}${renderExcerpts(excerpts)}`,
      },
    ],
  });

  // 안전 분류기가 거절하면 content가 비어 있을 수 있다 — 먼저 확인
  if (response.stop_reason === "refusal") {
    throw new Error("요약 생성이 거절되었습니다. 기록 내용을 확인해 주세요.");
  }
  return response.parsed_output ?? null;
}
