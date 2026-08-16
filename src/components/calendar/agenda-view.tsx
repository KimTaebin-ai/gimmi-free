"use client";

import { format, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckSquare, Clock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildTaskColorIndex,
  groupItemsByDay,
  itemDotStyle,
} from "@/components/calendar/shared";
import { PriorityFlag } from "@/components/priority-flag";
import type { CalendarItem } from "@/lib/calendar-types";

export function AgendaView({
  items,
  onSelectItem,
}: {
  items: CalendarItem[];
  onSelectItem: (item: CalendarItem) => void;
}) {
  const grouped = groupItemsByDay(items);
  const colorIndex = buildTaskColorIndex(items);
  const days = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b));

  if (days.length === 0) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">
        이 기간에 일정이 없어요
      </p>
    );
  }

  return (
    <div className="divide-y overflow-y-auto">
      {days.map(([key, dayItems]) => {
        const date = new Date(`${key}T00:00:00`);
        return (
          <div key={key} className="flex gap-3 p-3">
            <div className="w-12 shrink-0 text-center">
              <div className="text-[11px] text-muted-foreground">
                {format(date, "EEE", { locale: ko })}
              </div>
              <div
                className={cn(
                  "mx-auto flex size-7 items-center justify-center rounded-full text-sm font-medium",
                  isToday(date) && "bg-primary text-primary-foreground",
                )}
              >
                {format(date, "d")}
              </div>
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              {dayItems.map((item) => {
                const dot = itemDotStyle(item, colorIndex);
                return (
                <button
                  key={`${item.kind}-${item.id}`}
                  onClick={() => onSelectItem(item)}
                  className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50"
                >
                  <span
                    className={cn("mt-1.5 size-2 shrink-0 rounded-full", dot.className)}
                    style={dot.color ? { backgroundColor: dot.color } : undefined}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      className={cn(
                        "flex min-w-0 items-center gap-1 text-sm",
                        item.kind === "task" &&
                          item.status === "done" &&
                          "text-muted-foreground line-through",
                      )}
                    >
                      {item.kind === "task" && (
                        <PriorityFlag priority={item.priority} className="size-3" />
                      )}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {item.allDay
                          ? "종일"
                          : `${format(item.startAt, "a h:mm", { locale: ko })}–${format(item.endAt, "a h:mm", { locale: ko })}`}
                      </span>
                      {item.kind === "event" && item.location && (
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="size-3" />
                          {item.location}
                        </span>
                      )}
                      {item.kind === "task" && (
                        <span className="flex items-center gap-1">
                          <CheckSquare className="size-3" />
                          태스크
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
