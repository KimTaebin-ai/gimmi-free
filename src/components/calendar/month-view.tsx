"use client";

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
import { groupItemsByDay, itemColor, itemsForDay } from "@/components/calendar/shared";
import type { CalendarItem } from "@/lib/calendar-types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const MAX_CHIPS = 3;

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
  const grouped = groupItemsByDay(items);
  const days = eachDayOfInterval({
    start: startOfWeek(startOfMonth(anchor)),
    end: endOfWeek(endOfMonth(anchor)),
  });

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
        className="grid min-h-0 flex-1 grid-cols-7"
        style={{ gridTemplateRows: `repeat(${days.length / 7}, minmax(0, 1fr))` }}
      >
        {days.map((day) => {
          const dayItems = itemsForDay(grouped, day);
          const outside = !isSameMonth(day, anchor);
          const today = isToday(day);
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelectDay(day)}
              className={cn(
                "flex min-h-0 flex-col gap-0.5 overflow-hidden border-b border-r p-1 text-left transition-colors hover:bg-accent/40",
                outside && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "mb-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-xs",
                  outside && "text-muted-foreground/50",
                  today && "bg-primary font-semibold text-primary-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              {dayItems.slice(0, MAX_CHIPS).map((item) => (
                <span
                  key={`${item.kind}-${item.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectItem(item);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      onSelectItem(item);
                    }
                  }}
                  className={cn(
                    "truncate rounded px-1 py-px text-[10px] leading-4",
                    itemColor(item),
                  )}
                >
                  {!item.allDay && (
                    <span className="mr-1 opacity-70">{format(item.startAt, "H:mm")}</span>
                  )}
                  {item.title}
                </span>
              ))}
              {dayItems.length > MAX_CHIPS && (
                <span className="px-1 text-[10px] text-muted-foreground">
                  +{dayItems.length - MAX_CHIPS}개
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
