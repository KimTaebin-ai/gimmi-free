"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { TaskDetail } from "@/components/tasks/task-detail";
import { TasksSidebar } from "@/components/tasks/tasks-sidebar";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProjects, useReorderTasks, useTags, useTasks } from "@/hooks/use-tasks";
import {
  dateRangeForSelection,
  filterForSelection,
  SMART_LISTS,
  type ListSelection,
} from "@/lib/smart-lists";
import { useEventsInRange } from "@/hooks/use-calendar";
import { CalendarItemDetail } from "@/components/calendar/item-detail";
import { eventToCalendarItem } from "@/lib/calendar-types";
import type { CalendarEventLite } from "@/lib/calendar-types";

export function TasksView() {
  // 기본은 '전체' — 오늘 할 일만 보는 것보다 전체를 조망하는 쪽이 기본값으로 낫다.
  const [selection, setSelection] = useState<ListSelection>({ type: "smart", key: "all" });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLite | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const filter = useMemo(() => filterForSelection(selection), [selection]);
  const eventRange = useMemo(() => dateRangeForSelection(selection), [selection]);
  const { data: tasks, isLoading } = useTasks(filter);
  const { data: events } = useEventsInRange(eventRange);
  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const reorder = useReorderTasks(filter);

  // 날짜 기반 리스트는 날짜 그룹으로 묶어 보여준다
  const dateBased = eventRange !== null;
  // 태그별 보기는 완료된 것까지 함께 불러와 '남은 태스크 / 완료됨'으로 나눠 보여준다
  const groupByStatus = selection.type === "tag";
  // '전체'도 같은 날짜끼리 박스로 묶어 조망하기 쉽게 한다
  const groupByDate =
    dateBased || (selection.type === "smart" && selection.key === "all");
  const doneCount = tasks?.filter((t) => t.status === "done").length ?? 0;
  // 완료 목록만 빼고 어디서든 순서를 직접 정할 수 있다.
  // 날짜 리스트에서는 같은 그룹 안에서만 이동한다(날짜 변경은 상세에서).
  const reorderable = !(selection.type === "smart" && selection.key === "done");

  const selectedTask = tasks?.find((t) => t.id === selectedTaskId) ?? null;

  const heading = (() => {
    if (selection.type === "smart")
      return SMART_LISTS.find((s) => s.key === selection.key)?.label ?? "";
    if (selection.type === "project")
      return projects?.find((p) => p.id === selection.id)?.name ?? "리스트";
    return `#${tags?.find((t) => t.id === selection.id)?.name ?? "태그"}`;
  })();

  const showQuickAdd = selection.type !== "smart" || selection.key !== "done";

  return (
    <div className="flex h-full">
      {/* PC: 태스크 전용 사이드바 (3-pane의 1번째) */}
      <aside className="hidden w-52 shrink-0 border-r md:block">
        <TasksSidebar selection={selection} onSelect={(s) => { setSelection(s); setSelectedTaskId(null); }} />
      </aside>

      {/* 메인 리스트 */}
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 px-4 pb-2 pt-4">
          {/* 모바일: 리스트 선택 드롭다운 */}
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1 text-lg font-bold md:pointer-events-none">
              {heading}
              <ChevronDown className="size-4 text-muted-foreground md:hidden" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="md:hidden">
              {SMART_LISTS.map(({ key, label }) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => { setSelection({ type: "smart", key }); setSelectedTaskId(null); }}
                >
                  {label}
                </DropdownMenuItem>
              ))}
              {projects && projects.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>리스트</DropdownMenuLabel>
                  {projects.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={() => { setSelection({ type: "project", id: p.id }); setSelectedTaskId(null); }}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
              {tags && tags.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>태그</DropdownMenuLabel>
                  {tags.map((t) => (
                    <DropdownMenuItem
                      key={t.id}
                      onClick={() => { setSelection({ type: "tag", id: t.id }); setSelectedTaskId(null); }}
                    >
                      #{t.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-sm text-muted-foreground">
            {tasks === undefined
              ? ""
              : groupByStatus
                ? `${tasks.length - doneCount} · 완료 ${doneCount}`
                : tasks.length}
          </span>
        </div>
        {showQuickAdd && (
          <div className="px-4 pb-2">
            <QuickAdd projectId={selection.type === "project" ? selection.id : null} />
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <TaskList
            tasks={tasks}
            isLoading={isLoading}
            selectedId={selectedTaskId}
            onSelect={setSelectedTaskId}
            groupByDate={groupByDate}
            groupByStatus={groupByStatus}
            events={dateBased ? events : undefined}
            onSelectEvent={setSelectedEvent}
            onReorder={reorderable ? (ids) => reorder.mutate(ids) : undefined}
            emptyMessage={
              selection.type === "smart" && selection.key === "done"
                ? "완료한 태스크가 없어요"
                : "태스크가 없어요. 위에서 바로 추가해 보세요!"
            }
          />
        </div>
      </section>

      {/* PC: 상세 패널 (3번째 pane) */}
      {isDesktop && selectedTask && (
        <aside className="w-80 shrink-0 border-l">
          <TaskDetail
            key={selectedTask.id}
            task={selectedTask}
            onClose={() => setSelectedTaskId(null)}
          />
        </aside>
      )}

      {/* Google 일정 상세 (읽기 전용) */}
      <CalendarItemDetail
        item={selectedEvent ? eventToCalendarItem(selectedEvent) : null}
        onClose={() => setSelectedEvent(null)}
      />

      {/* 모바일: 상세 바텀시트 */}
      {!isDesktop && (
        <Sheet open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTaskId(null)}>
          <SheetContent side="bottom" className="h-[85dvh] p-0">
            <SheetTitle className="sr-only">태스크 상세</SheetTitle>
            {selectedTask && (
              <TaskDetail
                key={selectedTask.id}
                task={selectedTask}
                onClose={() => setSelectedTaskId(null)}
              />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
