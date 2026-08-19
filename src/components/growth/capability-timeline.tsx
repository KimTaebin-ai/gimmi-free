"use client";

import { useQuery } from "@tanstack/react-query";
import { CalendarRange } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { LevelBadge } from "@/components/growth/level-badge";
import { listCapabilityTimeline } from "@/lib/actions/growth";
import { countCapabilities, formatMonth } from "@/lib/growth-timeline";

/**
 * "새로 할 수 있게 된 것"의 월별 누적.
 *
 * 최신 요약 하나만 보면 90일 창에 갇혀 그전 것이 사라진다. 여기서는 지금까지 만든
 * 모든 요약을 겹쳐 달별로 쌓아 보여 준다 — 성장은 한 번의 정리가 아니라
 * 달을 지나며 쌓이는 것이라서.
 */
export function CapabilityTimeline() {
  const { data: timeline, isLoading } = useQuery({
    queryKey: ["growth-timeline"],
    queryFn: () => listCapabilityTimeline(),
  });

  if (isLoading) return <div className="h-24 animate-pulse rounded-lg bg-muted" />;
  if (!timeline || timeline.length === 0) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <CalendarRange className="size-4 text-muted-foreground" />
        월별로 쌓인 것
        <span className="font-normal text-muted-foreground">
          {countCapabilities(timeline)}개 · {timeline.length}개월
        </span>
      </h2>

      <ol className="space-y-3">
        {timeline.map((month) => (
          <li key={month.month} className="relative border-l pl-4">
            {/* 타임라인 점 */}
            <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full bg-border" />
            <div className="flex flex-wrap items-baseline gap-1.5">
              <h3 className="text-sm font-medium">{formatMonth(month.month)}</h3>
              <span className="text-xs text-muted-foreground">
                {month.capabilities.length}개
              </span>
            </div>
            <ul className="mt-1.5 space-y-1.5">
              {month.capabilities.map((c, i) => (
                <li key={`${c.title}-${i}`} className="rounded-md border px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm">{c.title}</span>
                    <LevelBadge level={c.level} />
                    <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-normal">
                      {c.area}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {c.evidence}
                  </p>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </section>
  );
}
