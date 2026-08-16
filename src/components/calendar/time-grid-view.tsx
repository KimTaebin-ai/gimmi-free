"use client";

import { useEffect, useRef } from "react";
import { differenceInMinutes, format, isToday, startOfDay } from "date-fns";
import { cn } from "@/lib/utils";
import { groupItemsByDay, itemColor, itemsForDay } from "@/components/calendar/shared";
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
  const timed = items.filter((i) => !i.allDay);

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
  const scrollRef = useRef<HTMLDivElement>(null);

  // 처음 열 때 오전 7시가 보이도록
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
  }, []);

  const allDayRows = days.map((day) =>
    itemsForDay(grouped, day).filter((i) => i.allDay),
  );
  const hasAllDay = allDayRows.some((r) => r.length > 0);

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

      {/* 종일 영역 */}
      {hasAllDay && (
        <div className="flex shrink-0 border-b pr-2">
          <div className="w-12 shrink-0 py-1 pr-1 text-right text-[10px] text-muted-foreground">
            종일
          </div>
          {allDayRows.map((row, i) => (
            <div key={i} className="flex flex-1 flex-col gap-0.5 border-l p-0.5">
              {row.map((item) => (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => onSelectItem(item)}
                  className={cn(
                    "truncate rounded px-1 py-px text-left text-[10px]",
                    itemColor(item),
                  )}
                >
                  {item.title}
                </button>
              ))}
            </div>
          ))}
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
                {positioned.map((p) => (
                  <button
                    key={`${p.item.kind}-${p.item.id}`}
                    onClick={() => onSelectItem(p.item)}
                    style={{
                      top: p.top,
                      height: Math.max(p.height, 16),
                      left: `${(p.column / p.columns) * 100}%`,
                      width: `${(1 / p.columns) * 100}%`,
                    }}
                    className={cn(
                      "absolute overflow-hidden rounded border-l-2 border-current px-1 py-px text-left text-[10px] leading-tight",
                      itemColor(p.item),
                    )}
                  >
                    <span className="block truncate font-medium">{p.item.title}</span>
                    {p.height > 28 && (
                      <span className="block truncate opacity-70">
                        {format(p.item.startAt, "H:mm")}–{format(p.item.endAt, "H:mm")}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
