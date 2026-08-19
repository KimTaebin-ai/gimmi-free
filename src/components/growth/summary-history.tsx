"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { listGrowthSummaries } from "@/lib/actions/growth";

/**
 * 지난 정리 목록.
 *
 * 요약은 만들 때마다 DB에 남는다(지우지 않는다). 새로 정리하기 전의 결과를 계속 볼 수
 * 있어야 "그때는 이렇게 봤는데 지금은 다르네"가 가능해지기 때문이다.
 * 하나를 고르면 위쪽 본문이 그 요약으로 바뀐다.
 */
export function SummaryHistory({
  selectedId,
  onSelect,
}: {
  /** null이면 가장 최근 요약을 보고 있다는 뜻 */
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: rows } = useQuery({
    queryKey: ["growth-history"],
    queryFn: () => listGrowthSummaries(),
  });

  // 한 번밖에 안 만들었으면 목록이 의미 없다
  if (!rows || rows.length < 2) return null;

  return (
    <section>
      <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <History className="size-4 text-muted-foreground" />
        지난 정리
        <span className="font-normal text-muted-foreground">{rows.length}개</span>
      </h2>

      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const isCurrent = selectedId === r.id || (selectedId === null && i === 0);
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => onSelect(i === 0 ? null : r.id)}
                className={cn(
                  "w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent/40",
                  isCurrent && "border-primary/50 bg-accent/30",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(r.createdAt), "yyyy.M.d HH:mm", { locale: ko })} 정리
                    {i === 0 && " · 최신"}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {format(new Date(r.periodStart), "M.d", { locale: ko })}–
                    {format(new Date(r.periodEnd), "M.d", { locale: ko })} · 기록{" "}
                    {r.sourceCount}건 · 능력 {r.gainedCount}개
                  </span>
                </div>
                <p className="mt-0.5 line-clamp-2 text-sm">{r.headline}</p>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
