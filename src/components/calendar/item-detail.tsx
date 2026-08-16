"use client";

import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { CalendarDays, ExternalLink, MapPin } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { TaskDetail } from "@/components/tasks/task-detail";
import { formatAllDay } from "@/lib/calendar-utils";
import type { CalendarItem } from "@/lib/calendar-types";

function EventDetail({ item }: { item: Extract<CalendarItem, { kind: "event" }> }) {
  const when = item.allDay
    ? `${formatAllDay(item.startAt, "yyyy년 M월 d일")} · 종일`
    : `${format(item.startAt, "M월 d일 (EEE) a h:mm", { locale: ko })} – ${format(item.endAt, "a h:mm", { locale: ko })}`;

  return (
    <div className="space-y-4 p-4">
      <div>
        <Badge variant="secondary" className="mb-2 gap-1">
          <CalendarDays className="size-3" />
          Google 캘린더
        </Badge>
        <h2 className="text-lg font-semibold">{item.title}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{when}</p>
      {item.location && (
        <p className="flex items-start gap-2 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          {item.location}
        </p>
      )}
      {item.description && (
        <p className="whitespace-pre-wrap text-sm text-muted-foreground">
          {item.description}
        </p>
      )}
      {item.htmlLink && (
        <a
          href={item.htmlLink}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          Google 캘린더에서 열기
          <ExternalLink className="size-3.5" />
        </a>
      )}
      <p className="text-xs text-muted-foreground">
        Google에서 만든 일정은 앱에서 읽기 전용입니다.
      </p>
    </div>
  );
}

export function CalendarItemDetail({
  item,
  onClose,
}: {
  item: CalendarItem | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={!!item} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="h-[70dvh] p-0 lg:inset-y-0 lg:right-0 lg:h-full lg:w-96"
      >
        <SheetTitle className="sr-only">일정 상세</SheetTitle>
        {item?.kind === "event" && <EventDetail item={item} />}
        {item?.kind === "task" && (
          <TaskDetail key={item.id} task={item.task} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}
