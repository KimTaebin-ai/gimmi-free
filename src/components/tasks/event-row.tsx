"use client";

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, MapPin } from "lucide-react";
import { formatAllDay } from "@/lib/calendar-utils";
import type { CalendarEventLite } from "@/lib/calendar-types";

/** 태스크 리스트 안에 섞여 들어가는 Google 일정 행 (읽기 전용, 체크박스 없음) */
export function EventRow({
  event,
  onSelect,
}: {
  event: CalendarEventLite;
  onSelect: (event: CalendarEventLite) => void;
}) {
  const when = event.allDay
    ? "종일"
    : `${format(event.startAt, "a h:mm", { locale: ko })}–${format(event.endAt, "a h:mm", { locale: ko })}`;

  return (
    <button
      onClick={() => onSelect(event)}
      className="flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-accent/50"
    >
      {/* 체크박스 자리에 캘린더 아이콘 — 완료할 수 없는 항목임을 드러냄 */}
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        <CalendarDays className="size-3.5 text-sky-500" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm text-muted-foreground">{event.title}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground/80">
          <span>
            {event.allDay
              ? `${formatAllDay(event.startAt)} · 종일`
              : when}
          </span>
          {event.location && (
            <span className="flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" />
              <span className="truncate">{event.location}</span>
            </span>
          )}
        </div>
      </div>
      <span className="mt-1 shrink-0 text-[10px] text-sky-600/70 dark:text-sky-400/70">
        캘린더
      </span>
    </button>
  );
}
