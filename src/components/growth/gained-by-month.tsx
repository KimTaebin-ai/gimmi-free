"use client";

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LevelBadge } from "@/components/growth/level-badge";
import { countCapabilities, formatMonth } from "@/lib/growth-timeline";
import type { MonthlyCapabilities } from "@/lib/growth-types";

/**
 * 이 화면의 본론: **새로 할 수 있게 된 것**을 달별로 한 번에 본다.
 *
 * 예전에는 "최신 요약의 목록"과 "월별 타임라인"이 따로 있었는데, 최신 요약의 목록은
 * 사실 타임라인의 맨 앞 달과 같은 내용이었다. 같은 걸 두 번 보여 주면서 정작 축적은
 * 한참 스크롤해야 보였다. 하나로 합치고, 위에 달 요약 줄을 둬서 흐름이 먼저 눈에 들어오게 한다.
 */
export function GainedByMonth({ months }: { months: MonthlyCapabilities[] }) {
  // null이면 전체 보기. 달을 고르면 그 달만 본다.
  const [picked, setPicked] = useState<string | null>(null);
  const total = countCapabilities(months);
  const shown = picked ? months.filter((m) => m.month === picked) : months;
  // 여러 해에 걸치면 "7월"만으로는 어느 해인지 알 수 없다
  const multiYear = new Set(months.map((m) => m.month.slice(0, 4))).size > 1;

  if (months.length === 0) {
    return (
      <section>
        <SectionHeading total={0} monthCount={0} />
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          아직 근거 있게 찾은 것이 없어요. 태스크·일정에 &quot;느낀 점&quot;을 남기거나 블로그
          글을 불러오면 더 정확해집니다.
        </p>
      </section>
    );
  }

  return (
    <section>
      <SectionHeading total={total} monthCount={months.length} />

      {/* 달 요약 줄 — 어느 달에 얼마나 쌓였는지가 먼저 보이고, 눌러서 좁힐 수 있다 */}
      {months.length > 1 && (
        <div className="mb-2.5 flex flex-wrap gap-1">
          <MonthChip
            label="전체"
            count={total}
            active={picked === null}
            onClick={() => setPicked(null)}
          />
          {months.map((m) => (
            <MonthChip
              key={m.month}
              label={multiYear ? formatMonth(m.month) : formatMonth(m.month).replace(/^\d+년 /, "")}
              count={m.capabilities.length}
              active={picked === m.month}
              onClick={() => setPicked(picked === m.month ? null : m.month)}
            />
          ))}
        </div>
      )}

      <ol className="space-y-3">
        {shown.map((month) => (
          <li key={month.month} className="relative border-l pl-4">
            <span className="absolute -left-[4.5px] top-1.5 size-2 rounded-full bg-border" />
            <div className="flex flex-wrap items-baseline gap-1.5">
              <h3 className="text-sm font-medium">{formatMonth(month.month)}</h3>
              <span className="text-xs text-muted-foreground">{month.capabilities.length}개</span>
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

function SectionHeading({ total, monthCount }: { total: number; monthCount: number }) {
  return (
    <h2 className="mb-2 flex flex-wrap items-center gap-1.5 text-sm font-semibold">
      <Sparkles className="size-4 text-emerald-500" />
      새로 할 수 있게 된 것
      <span className="font-normal text-muted-foreground">
        {total}개{monthCount > 0 && ` · ${monthCount}개월`}
      </span>
    </h2>
  );
}

function MonthChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-1 text-xs transition-colors hover:bg-accent",
        active && "border-primary/50 bg-accent",
      )}
    >
      {label} <span className="font-medium">{count}</span>
    </button>
  );
}
