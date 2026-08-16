"use client";

import { useMemo } from "react";
import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { cn } from "@/lib/utils";
import {
  buildTaskColorIndex,
  itemAppearance,
  layoutSpans,
  weekSegments,
  type ItemSpan,
  type TaskColorIndex,
} from "@/components/calendar/shared";
import type { CalendarItem } from "@/lib/calendar-types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_LANES = 3; // 이보다 아래 레인은 "+N개"로 접는다
const LANE_HEIGHT = 17; // px

export function MonthView({
  anchor,
  items,
  onSelectItem,
  onSelectDay,
}: {
  anchor: Date;
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
  onSelectDay: (date: Date) => void;
}) {
  const days = useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(startOfMonth(anchor)),
        end: endOfWeek(endOfMonth(anchor)),
      }),
    [anchor],
  );

  const spans = useMemo(() => layoutSpans(items, days), [items, days]);
  const colorIndex = useMemo(() => buildTaskColorIndex(items), [items]);
  const weekCount = days.length / 7;

  // 레인이 넘쳐 숨겨진 아이템 수를 날짜별로 집계
  const hiddenPerDay = useMemo(() => {
    const counts = new Array(days.length).fill(0);
    for (const s of spans) {
      if (s.lane < MAX_LANES) continue;
      for (let i = s.startIdx; i <= s.endIdx; i++) counts[i]++;
    }
    return counts;
  }, [spans, days.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid shrink-0 grid-cols-7 border-b">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={cn(
              "py-1.5 text-center text-xs font-medium text-muted-foreground",
              i === 0 && "text-red-500",
              i === 6 && "text-blue-500",
            )}
          >
            {d}
          </div>
        ))}
      </div>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateRows: `repeat(${weekCount}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: weekCount }, (_, w) => (
          <WeekRow
            key={w}
            weekIndex={w}
            days={days.slice(w * 7, w * 7 + 7)}
            spans={spans}
            colorIndex={colorIndex}
            hidden={hiddenPerDay.slice(w * 7, w * 7 + 7)}
            anchor={anchor}
            onSelectItem={onSelectItem}
            onSelectDay={onSelectDay}
          />
        ))}
      </div>
    </div>
  );
}

function WeekRow({
  weekIndex,
  days,
  spans,
  colorIndex,
  hidden,
  anchor,
  onSelectItem,
  onSelectDay,
}: {
  weekIndex: number;
  days: Date[];
  spans: ItemSpan[];
  colorIndex: TaskColorIndex;
  hidden: number[];
  anchor: Date;
  onSelectItem: (item: CalendarItem) => void;
  onSelectDay: (date: Date) => void;
}) {
  const segments = weekSegments(spans, weekIndex).filter((s) => s.lane < MAX_LANES);

  return (
    <div className="relative grid min-h-0 grid-cols-7">
      {/* 날짜 셀 (배경 + 클릭 영역) */}
      {days.map((day, i) => {
        const outside = !isSameMonth(day, anchor);
        return (
          <button
            key={day.toISOString()}
            onClick={() => onSelectDay(day)}
            className={cn(
              "flex min-w-0 flex-col items-start border-b border-r p-1 text-left transition-colors hover:bg-accent/40",
              outside && "bg-muted/30",
            )}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                outside && "text-muted-foreground/50",
                isToday(day) && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </span>
            {hidden[i] > 0 && (
              <span className="mt-auto text-[10px] text-muted-foreground">
                +{hidden[i]}개
              </span>
            )}
          </button>
        );
      })}

      {/* 일정 바 레이어 — 날짜 숫자 아래에 겹쳐 그린다 */}
      <div
        className="pointer-events-none absolute inset-x-0 top-6 grid grid-cols-7 gap-y-px"
        style={{ gridAutoRows: `${LANE_HEIGHT}px` }}
      >
        {segments.map((seg) => {
          // 요청사항: 시작일/종료일이 포함된 조각에만 제목을 쓰고,
          // 중간 주(시작도 끝도 아닌 구간)는 색 띠만 남긴다.
          const showTitle = seg.isStart || seg.isEnd;
          const alignEnd = seg.isEnd && !seg.isStart;
          const timed = !seg.item.allDay && seg.isStart && seg.colSpan === 1;
          const look = itemAppearance(seg.item, colorIndex);
          return (
            <button
              key={`${seg.item.kind}-${seg.item.id}-${seg.colStart}`}
              onClick={(e) => {
                e.stopPropagation();
                onSelectItem(seg.item);
              }}
              style={{
                gridColumn: `${seg.colStart + 1} / span ${seg.colSpan}`,
                gridRow: seg.lane + 1,
                // 태스크는 식별 색을 옅은 배경 + 진한 왼쪽 막대로
                ...(look.color
                  ? {
                      backgroundColor: `color-mix(in oklab, ${look.color} 18%, transparent)`,
                      boxShadow: `inset 2px 0 0 0 ${look.color}`,
                    }
                  : {}),
              }}
              className={cn(
                "pointer-events-auto mx-0.5 flex min-w-0 items-center overflow-hidden px-1 text-[10px] leading-4",
                look.className,
                // 잘린 쪽은 각지게 둬서 이어지는 느낌을 준다
                seg.isStart ? "rounded-l" : "rounded-l-none",
                seg.isEnd ? "rounded-r" : "rounded-r-none",
                alignEnd && "justify-end",
              )}
              title={seg.item.title}
            >
              {showTitle ? (
                <span className="truncate">
                  {timed && (
                    <span className="mr-1 opacity-70">
                      {format(seg.item.startAt, "H:mm")}
                    </span>
                  )}
                  {seg.item.title}
                </span>
              ) : (
                <span className="sr-only">{seg.item.title}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
