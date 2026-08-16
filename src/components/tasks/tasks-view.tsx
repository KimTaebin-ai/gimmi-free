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
import { useProjects, useTags, useTasks } from "@/hooks/use-tasks";
import {
  filterForSelection,
  SMART_LISTS,
  type ListSelection,
} from "@/lib/smart-lists";

export function TasksView() {
  const [selection, setSelection] = useState<ListSelection>({ type: "smart", key: "today" });
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const filter = useMemo(() => filterForSelection(selection), [selection]);
  const { data: tasks, isLoading } = useTasks(filter);
  const { data: projects } = useProjects();
  const { data: tags } = useTags();

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
          <span className="text-sm text-muted-foreground">{tasks?.length ?? ""}</span>
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
