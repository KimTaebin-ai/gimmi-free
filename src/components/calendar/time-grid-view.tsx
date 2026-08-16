"use client";

import { useEffect, useRef } from "react";
import { differenceInMinutes, format, isToday, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import {
  buildColorIndex,
  groupItemsByDay,
  isMultiDay,
  itemAppearance,
  itemsForDay,
  layoutSpans,
  weekSegments,
} from "@/components/calendar/shared";
import { CalendarClock } from "lucide-react";
import { PriorityFlag } from "@/components/priority-flag";
import type { CalendarItem } from "@/lib/calendar-types";

const HOUR_HEIGHT = 48; // px
const DAY_MINUTES = 24 * 60;

interface Positioned {
  item: CalendarItem;
  top: number;
  height: number;
  column: number;
  columns: number;
}

/** 겹치는 일정을 나란히 배치하기 위한 열 계산 */
function layout(items: CalendarItem[], day: Date): Positioned[] {
  const dayStart = startOfDay(day);
  // 여러 날에 걸친 일정은 위쪽 종일 영역에서 연속 바로 그리므로 여기선 제외
  const timed = items.filter((i) => !i.allDay && !isMultiDay(i));

  const boxes = timed.map((item) => {
    const startMin = Math.max(0, differenceInMinutes(item.startAt, dayStart));
    const endMin = Math.min(
      DAY_MINUTES,
      Math.max(startMin + 20, differenceInMinutes(item.endAt, dayStart)),
    );
    return { item, startMin, endMin };
  });

  // 겹치는 그룹끼리 묶어서 열 분배
  const result: Positioned[] = [];
  let group: typeof boxes = [];
  let groupEnd = -1;

  const flush = () => {
    if (group.length === 0) return;
    const columns: number[] = []; // 각 열의 마지막 종료 시각
    const assigned = group.map((b) => {
      let col = columns.findIndex((end) => end <= b.startMin);
      if (col === -1) {
        col = columns.length;
        columns.push(b.endMin);
      } else {
        columns[col] = b.endMin;
      }
      return { ...b, column: col };
    });
    for (const b of assigned) {
      result.push({
        item: b.item,
        top: (b.startMin / 60) * HOUR_HEIGHT,
        height: ((b.endMin - b.startMin) / 60) * HOUR_HEIGHT,
        column: b.column,
        columns: columns.length,
      });
    }
    group = [];
    groupEnd = -1;
  };

  for (const b of boxes.sort((a, b) => a.startMin - b.startMin)) {
    if (group.length > 0 && b.startMin >= groupEnd) flush();
    group.push(b);
    groupEnd = Math.max(groupEnd, b.endMin);
  }
  flush();
  return result;
}

export function TimeGridView({
  days,
  items,
  onSelectItem,
}: {
  days: Date[];
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
}) {
  const grouped = groupItemsByDay(items);
  const colorIndex = buildColorIndex(items);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 처음 열 때 오전 7시가 보이도록
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  // 종일/다기간 아이템은 날짜별로 쪼개지 않고 하나의 연속 바로 그린다
  const spanItems = items.filter((i) => i.allDay || isMultiDay(i));
  const spans = layoutSpans(spanItems, days);
  const segments = weekSegments(spans, 0);
  const laneCount = segments.reduce((max, s) => Math.max(max, s.lane + 1), 0);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 날짜 헤더 */}
      <div className="flex shrink-0 border-b pr-2">
        <div className="w-12 shrink-0" />
        {days.map((day) => (
          <div key={day.toISOString()} className="flex-1 py-1.5 text-center">
            <div className="text-[11px] text-muted-foreground">
              {format(day, "EEE")}
            </div>
            <div
              className={cn(
                "mx-auto flex size-6 items-center justify-center rounded-full text-sm",
                isToday(day) && "bg-primary font-semibold text-primary-foreground",
              )}
            >
              {format(day, "d")}
            </div>
          </div>
        ))}
      </div>

      {/* 종일 / 여러 날에 걸친 일정 */}
      {laneCount > 0 && (
        <div className="flex shrink-0 border-b pr-2">
          <div className="w-12 shrink-0 py-1 pr-1 text-right text-[10px] text-muted-foreground">
            종일
          </div>
          <div className="relative flex-1">
            <div className="absolute inset-0 flex">
              {days.map((d) => (
                <div key={d.toISOString()} className="flex-1 border-l" />
              ))}
            </div>
            <div
              className="relative grid gap-y-px py-0.5"
              style={{
                gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                gridAutoRows: "17px",
              }}
            >
              {segments.map((seg) => {
                const look = itemAppearance(seg.item, colorIndex);
                return (
                <button
                  key={`${seg.item.kind}-${seg.item.id}-${seg.colStart}`}
                  onClick={() => onSelectItem(seg.item)}
                  style={{
                    gridColumn: `${seg.colStart + 1} / span ${seg.colSpan}`,
                    gridRow: seg.lane + 1,
                    ...(look.color
                      ? {
                          backgroundColor: `color-mix(in oklab, ${look.color} 18%, transparent)`,
                          boxShadow: `inset 2px 0 0 0 ${look.color}`,
                        }
                      : {}),
                  }}
                  className={cn(
                    "mx-0.5 flex min-w-0 items-center overflow-hidden px-1 text-[10px] leading-4",
                    look.className,
                    seg.isStart ? "rounded-l" : "rounded-l-none",
                    seg.isEnd ? "rounded-r" : "rounded-r-none",
                    seg.isEnd && !seg.isStart && "justify-end",
                  )}
                  title={seg.item.title}
                >
                  {seg.isStart || seg.isEnd ? (
                    <>
                      {seg.item.kind === "task" ? (
                        <PriorityFlag priority={seg.item.priority} className="mr-0.5 size-2.5" />
                      ) : (
                        <CalendarClock className="mr-0.5 size-2.5 shrink-0 opacity-60" />
                      )}
                      <span className="truncate">{seg.item.title}</span>
                    </>
                  ) : (
                    <span className="sr-only">{seg.item.title}</span>
                  )}
                </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 시간 그리드 */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex pr-2">
          {/* 시간 눈금 */}
          <div className="w-12 shrink-0">
            {Array.from({ length: 24 }, (_, h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="relative text-right"
              >
                <span className="absolute -top-1.5 right-1 text-[10px] text-muted-foreground">
                  {h > 0 && `${h}시`}
                </span>
              </div>
            ))}
          </div>

          {days.map((day) => {
            const positioned = layout(itemsForDay(grouped, day), day);
            const now = new Date();
            const showNow = isToday(day);
            return (
              <div key={day.toISOString()} className="relative flex-1 border-l">
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b" />
                ))}
                {showNow && (
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-red-500"
                    style={{
                      top: (differenceInMinutes(now, startOfDay(now)) / 60) * HOUR_HEIGHT,
                    }}
                  >
                    <span className="absolute -left-1 -top-1 size-2 rounded-full bg-red-500" />
                  </div>
                )}
                {positioned.map((p) => {
                  const look = itemAppearance(p.item, colorIndex);
                  return (
                  <button
                    key={`${p.item.kind}-${p.item.id}`}
                    onClick={() => onSelectItem(p.item)}
                    style={{
                      top: p.top,
                      height: Math.max(p.height, 16),
                      left: `${(p.column / p.columns) * 100}%`,
                      width: `${(1 / p.columns) * 100}%`,
                      ...(look.color
                        ? {
                            backgroundColor: `color-mix(in oklab, ${look.color} 18%, transparent)`,
                            boxShadow: `inset 2px 0 0 0 ${look.color}`,
                          }
                        : {}),
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded px-1 py-px text-left text-[10px] leading-tight",
                      look.className,
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-0.5 font-medium">
                      {p.item.kind === "task" ? (
                        <PriorityFlag priority={p.item.priority} className="size-2.5" />
                      ) : (
                        <CalendarClock className="size-2.5 shrink-0 opacity-60" />
                      )}
                      <span className="truncate">{p.item.title}</span>
                    </span>
                    {p.height > 28 && (
                      <span className="block truncate opacity-70">
                        {format(p.item.startAt, "H:mm")}–{format(p.item.endAt, "H:mm")}
                      </span>
                    )}
                  </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
