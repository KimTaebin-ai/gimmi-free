import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LEVEL_LABELS, type GainedCapability } from "@/lib/growth-types";

/**
 * 능력의 단계 배지.
 *
 * 색은 *식별*이 아니라 *단계*를 뜻한다 — "전에는 못 하던 것"이 가장 눈에 띄어야 하고
 * "익숙해짐"은 조용해야 한다. 성장 화면과 월별 타임라인이 같은 뜻으로 써야 하므로
 * 여기 한 곳에 둔다.
 */
const LEVEL_STYLES: Record<GainedCapability["level"], string> = {
  newly_able: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  improved: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  practiced: "bg-muted text-muted-foreground",
};

export function LevelBadge({ level }: { level: GainedCapability["level"] }) {
  return (
    <Badge variant="secondary" className={cn("px-1.5 py-0 text-[10px]", LEVEL_STYLES[level])}>
      {LEVEL_LABELS[level]}
    </Badge>
  );
}
