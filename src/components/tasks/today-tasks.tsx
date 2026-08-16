"use client";

import { useMemo, useState } from "react";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { QuickAdd } from "@/components/tasks/quick-add";
import { TaskList } from "@/components/tasks/task-list";
import { TaskDetail } from "@/components/tasks/task-detail";
import { CalendarItemDetail } from "@/components/calendar/item-detail";
import { useReorderTasks, useTasks } from "@/hooks/use-tasks";
import { useEventsInRange } from "@/hooks/use-calendar";
import { dateRangeForSelection, filterForSelection } from "@/lib/smart-lists";
import { eventToCalendarItem } from "@/lib/calendar-types";
import type { CalendarEventLite } from "@/lib/calendar-types";

const TODAY = { type: "smart", key: "today" } as const;

export function TodayTasks() {
  const filter = useMemo(() => filterForSelection(TODAY), []);
  const range = useMemo(() => dateRangeForSelection(TODAY), []);
  const { data: tasks, isLoading } = useTasks(filter);
  const { data: events } = useEventsInRange(range);
  const reorder = useReorderTasks(filter);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventLite | null>(null);
  const selectedTask = tasks?.find((t) => t.id === selectedTaskId) ?? null;

  return (
    <div>
      <QuickAdd />
      <div className="mt-2">
        <TaskList
          tasks={tasks}
          isLoading={isLoading}
          selectedId={selectedTaskId}
          onSelect={setSelectedTaskId}
          groupByDate
          events={events}
          onSelectEvent={setSelectedEvent}
          onReorder={(ids) => reorder.mutate(ids)}
          emptyMessage="오늘 할 일이 없어요 🎉"
        />
      </div>

      <Sheet open={!!selectedTask} onOpenChange={(o) => !o && setSelectedTaskId(null)}>
        <SheetContent side="bottom" className="h-[85dvh] p-0 lg:inset-y-0 lg:right-0 lg:h-full lg:w-96">
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

      <CalendarItemDetail
        item={selectedEvent ? eventToCalendarItem(selectedEvent) : null}
        onClose={() => setSelectedEvent(null)}
      />
    </div>
  );
}
