"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MonthView } from "@/components/calendar/month-view";
import { TimeGridView } from "@/components/calendar/time-grid-view";
import { AgendaView } from "@/components/calendar/agenda-view";
import { CalendarItemDetail } from "@/components/calendar/item-detail";
import { VIEW_LABELS, type CalendarViewMode } from "@/components/calendar/shared";
import { useMediaQuery } from "@/hooks/use-media-query";
import {
  useCalendarItems,
  useCalendarSyncInfo,
  useSyncCalendar,
} from "@/hooks/use-calendar";
import type { CalendarItem } from "@/lib/calendar-types";

/** 뷰별 표시 구간 (월 뷰는 앞뒤 주까지 포함) */
function rangeFor(mode: CalendarViewMode, anchor: Date) {
  switch (mode) {
    case "month":
      return {
        from: startOfWeek(startOfMonth(anchor)),
        to: endOfWeek(endOfMonth(anchor)),
      };
    case "week":
      return { from: startOfWeek(anchor), to: endOfWeek(anchor) };
    case "day":
      return { from: startOfDay(anchor), to: endOfDay(anchor) };
    case "agenda":
      return { from: startOfDay(anchor), to: endOfDay(addDays(anchor, 29)) };
  }
}

function shift(mode: CalendarViewMode, anchor: Date, dir: 1 | -1): Date {
  switch (mode) {
    case "month":
      return addMonths(anchor, dir);
    case "week":
      return addWeeks(anchor, dir);
    case "day":
      return addDays(anchor, dir);
    case "agenda":
      return addDays(anchor, dir * 30);
  }
}

function headingFor(mode: CalendarViewMode, anchor: Date): string {
  if (mode === "day") return format(anchor, "yyyy년 M월 d일 (EEE)", { locale: ko });
  if (mode === "week") {
    const s = startOfWeek(anchor);
    const e = endOfWeek(anchor);
    return `${format(s, "M월 d일", { locale: ko })} – ${format(e, "M월 d일", { locale: ko })}`;
  }
  if (mode === "agenda") return `${format(anchor, "M월 d일", { locale: ko })}부터 30일`;
  return format(anchor, "yyyy년 M월", { locale: ko });
}

export function CalendarView() {
  const isDesktop = useMediaQuery("(min-width: 768px)");
  const [anchor, setAnchor] = useState(() => new Date());
  const [selected, setSelected] = useState<CalendarItem | null>(null);

  // 사용자가 직접 고르기 전에는 화면 크기로 결정 (모바일은 목록, PC는 월)
  const [modeOverride, setModeOverride] = useState<CalendarViewMode | null>(null);
  const mode = modeOverride ?? (isDesktop ? "month" : "agenda");

  const { from, to } = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);
  const { data: items, isLoading } = useCalendarItems(from, to);
  const { data: syncInfo } = useCalendarSyncInfo();
  const sync = useSyncCalendar();

  // 진입 시 1회 자동 동기화(캐시가 오래됐을 때만)
  useEffect(() => {
    if (!syncInfo?.connected) return;
    const stale =
      !syncInfo.lastSyncedAt ||
      Date.now() - new Date(syncInfo.lastSyncedAt).getTime() > 5 * 60 * 1000;
    if (stale && !sync.isPending) sync.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncInfo?.connected]);

  const list = items ?? [];
  const days =
    mode === "week"
      ? eachDayOfInterval({ start: startOfWeek(anchor), end: endOfWeek(anchor) })
      : [anchor];

  const setModeExplicit = (m: CalendarViewMode) => setModeOverride(m);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* 헤더 */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setAnchor((a) => shift(mode, a, -1))}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => setAnchor(new Date())}
          >
            오늘
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={() => setAnchor((a) => shift(mode, a, 1))}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        <h1 className="flex-1 truncate text-base font-semibold">
          {headingFor(mode, anchor)}
        </h1>
        <div className="flex items-center gap-1">
          <div className="flex rounded-md border p-0.5">
            {VIEW_LABELS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => setModeExplicit(value)}
                className={cn(
                  "rounded px-2 py-1 text-xs transition-colors",
                  mode === value
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            title="Google 캘린더 동기화"
            disabled={sync.isPending || !syncInfo?.connected}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={cn("size-4", sync.isPending && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* 연동 안내 / 에러 */}
      {syncInfo && !syncInfo.connected && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1">Google 캘린더 권한이 아직 없습니다.</span>
          <Link
            href="/settings"
            className="shrink-0 font-medium underline underline-offset-2"
          >
            설정에서 다시 연결
          </Link>
        </div>
      )}
      {syncInfo?.connected && syncInfo.lastError && (
        <div className="flex shrink-0 items-center gap-2 border-b bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0" />
          <span className="flex-1 truncate">동기화 오류: {syncInfo.lastError}</span>
        </div>
      )}

      {/* 본문 */}
      <div className="min-h-0 flex-1">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : mode === "month" ? (
          <MonthView
            anchor={anchor}
            items={list}
            onSelectItem={setSelected}
            onSelectDay={(d) => {
              setAnchor(d);
              setModeExplicit("day");
            }}
          />
        ) : mode === "agenda" ? (
          <AgendaView items={list} onSelectItem={setSelected} />
        ) : (
          <TimeGridView days={days} items={list} onSelectItem={setSelected} />
        )}
      </div>

      <CalendarItemDetail item={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
