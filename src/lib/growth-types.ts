import { z } from "zod";

/**
 * "노력"의 정의: 시간을 쏟거나 무언가를 해낸 것이 아니라,
 * **이전에 할 수 없던 것을 할 수 있게 되는 것**.
 * 그래서 요약의 1급 결과물은 "새로 할 수 있게 된 것" 목록이다.
 */
export const GainedCapabilitySchema = z.object({
  title: z.string().describe("새로 할 수 있게 된 것을 한 줄로. 능력/기술 단위로 쓴다."),
  evidence: z
    .string()
    .describe("이렇게 판단한 근거. 어떤 태스크·기록에서 드러났는지 구체적으로."),
  level: z
    .enum(["newly_able", "improved", "practiced"])
    .describe(
      "newly_able=전에는 못 하던 것, improved=하던 것이 확실히 나아짐, practiced=반복해 익숙해짐",
    ),
  area: z.string().describe("분야 (예: 연구, 개발, 운동, 커뮤니케이션)"),
  month: z
    .string()
    .describe(
      "이 능력이 드러난 시점의 연-월을 'YYYY-MM'으로. 근거가 된 태스크·일정·글의 날짜를 보고 정한다. " +
        "여러 달에 걸쳐 있으면 그렇게 말할 수 있게 된 시점(가장 나중 달)을 쓴다.",
    ),
});

export const GrowthSummarySchema = z.object({
  headline: z
    .string()
    .describe("이 기간을 한 문장으로. 무엇을 할 수 있게 됐는지 중심으로."),
  gained: z
    .array(GainedCapabilitySchema)
    .describe("새로 할 수 있게 된 것들. 근거가 없으면 넣지 않는다."),
  inProgress: z
    .array(
      z.object({
        title: z.string().describe("아직 능력으로 굳지 않았지만 쌓이고 있는 것"),
        why: z.string().describe("왜 아직 진행 중이라고 보는지"),
      }),
    )
    .describe("진행 중이라 아직 '할 수 있게 됐다'고 말하기 이른 것"),
  notGrowth: z
    .array(z.string())
    .describe(
      "완료했지만 새로운 능력으로 이어지지 않은 일들(반복 업무 등). 솔직하게 적는다.",
    ),
  nextStep: z
    .string()
    .describe("지금 기록을 볼 때, 다음에 할 수 있게 되면 좋을 것 한 가지"),
});

export type GainedCapability = z.infer<typeof GainedCapabilitySchema>;
export type GrowthSummaryContent = z.infer<typeof GrowthSummarySchema>;

export const LEVEL_LABELS: Record<GainedCapability["level"], string> = {
  newly_able: "새로 가능해짐",
  improved: "나아짐",
  practiced: "익숙해짐",
};

/** 월별 타임라인의 한 칸 */
export interface MonthlyCapabilities {
  /** "2026-07" */
  month: string;
  capabilities: GainedCapability[];
}

export interface GrowthSummaryResult {
  content: GrowthSummaryContent;
  periodStart: string;
  periodEnd: string;
  sourceCount: number;
  createdAt: string;
  /** 캐시된 결과인지 */
  cached: boolean;
}

/** LLM을 쓸 수 없을 때(키 미설정 등) 화면에 이유를 그대로 보여준다 */
export interface GrowthUnavailable {
  reason: "no_api_key" | "no_data" | "error";
  message: string;
}
