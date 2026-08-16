"use client";

import { useState } from "react";
import {
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  Hash,
  Inbox,
  ListTodo,
  MoreHorizontal,
  Plus,
  Sun,
  Sunrise,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { SMART_LISTS, type ListSelection, type SmartListKey } from "@/lib/smart-lists";
import { useProjects, useTags } from "@/hooks/use-tasks";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProject, deleteProject, updateProject } from "@/lib/actions/projects";
import { deleteTag } from "@/lib/actions/tags";

const SMART_ICONS: Record<SmartListKey, React.ElementType> = {
  today: Sun,
  tomorrow: Sunrise,
  next7: CalendarDays,
  unscheduled: CalendarX2,
  all: Inbox,
  done: CheckCircle2,
};

export function TasksSidebar({
  selection,
  onSelect,
}: {
  selection: ListSelection;
  onSelect: (sel: ListSelection) => void;
}) {
  const { data: projects } = useProjects();
  const { data: tags } = useTags();
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["projects"] });
    qc.invalidateQueries({ queryKey: ["tags"] });
    qc.invalidateQueries({ queryKey: ["tasks"] });
  };

  const [newName, setNewName] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);

  const addProject = useMutation({
    mutationFn: (name: string) => createProject({ name }),
    onSettled: invalidate,
  });
  const renameProject = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => updateProject(id, { name }),
    onSettled: invalidate,
  });
  const removeProject = useMutation({
    mutationFn: (id: string) => deleteProject(id),
    onSettled: invalidate,
  });
  const removeTag = useMutation({
    mutationFn: (id: string) => deleteTag(id),
    onSettled: invalidate,
  });

  const itemCls = (active: boolean) =>
    cn(
      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
      active && "bg-accent font-medium text-accent-foreground",
    );

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto p-2">
      <nav className="flex flex-col gap-0.5">
        {SMART_LISTS.map(({ key, label }) => {
          const Icon = SMART_ICONS[key];
          const active = selection.type === "smart" && selection.key === key;
          return (
            <button key={key} className={itemCls(active)} onClick={() => onSelect({ type: "smart", key })}>
              <Icon className="size-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <div>
        <div className="mb-1 flex items-center justify-between px-2.5">
          <span className="text-xs font-medium text-muted-foreground">리스트</span>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <button className="text-muted-foreground hover:text-foreground">
                <Plus className="size-3.5" />
              </button>
            </DialogTrigger>
            <DialogContent className="max-w-xs">
              <DialogHeader>
                <DialogTitle>새 리스트</DialogTitle>
              </DialogHeader>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="리스트 이름"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newName.trim()) {
                    addProject.mutate(newName.trim());
                    setNewName("");
                    setDialogOpen(false);
                  }
                }}
              />
              <DialogFooter>
                <Button
                  size="sm"
                  disabled={!newName.trim()}
                  onClick={() => {
                    addProject.mutate(newName.trim());
                    setNewName("");
                    setDialogOpen(false);
                  }}
                >
                  추가
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <nav className="flex flex-col gap-0.5">
          {projects?.map((p) => {
            const active = selection.type === "project" && selection.id === p.id;
            return (
              <div key={p.id} className="group relative">
                <button
                  className={cn(itemCls(active), "pr-8")}
                  onClick={() => onSelect({ type: "project", id: p.id })}
                >
                  <ListTodo className="size-4" />
                  <span className="flex-1 truncate text-left">{p.name}</span>
                  {p._count.tasks > 0 && (
                    <span className="text-xs tabular-nums">{p._count.tasks}</span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted group-hover:block">
                      <MoreHorizontal className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onClick={() => setRenameTarget({ id: p.id, name: p.name })}>
                      이름 변경
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => {
                        removeProject.mutate(p.id);
                        if (active) onSelect({ type: "smart", key: "all" });
                      }}
                    >
                      삭제
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
          {projects?.length === 0 && (
            <p className="px-2.5 py-1 text-xs text-muted-foreground/60">리스트 없음</p>
          )}
        </nav>
      </div>

      {tags && tags.length > 0 && (
        <div>
          <span className="mb-1 block px-2.5 text-xs font-medium text-muted-foreground">태그</span>
          <nav className="flex flex-col gap-0.5">
            {tags.map((t) => {
              const active = selection.type === "tag" && selection.id === t.id;
              return (
                <div key={t.id} className="group relative">
                  <button
                    className={cn(itemCls(active), "pr-8")}
                    onClick={() => onSelect({ type: "tag", id: t.id })}
                  >
                    <Hash className="size-4" />
                    <span className="flex-1 truncate text-left">{t.name}</span>
                    {t._count.tasks > 0 && (
                      <span className="text-xs tabular-nums">{t._count.tasks}</span>
                    )}
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted group-hover:block">
                        <MoreHorizontal className="size-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          removeTag.mutate(t.id);
                          if (active) onSelect({ type: "smart", key: "all" });
                        }}
                      >
                        태그 삭제
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              );
            })}
          </nav>
        </div>
      )}

      <Dialog open={!!renameTarget} onOpenChange={(o) => !o && setRenameTarget(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>리스트 이름 변경</DialogTitle>
          </DialogHeader>
          {renameTarget && (
            <Input
              value={renameTarget.name}
              onChange={(e) => setRenameTarget({ ...renameTarget, name: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter" && renameTarget.name.trim()) {
                  renameProject.mutate({ id: renameTarget.id, name: renameTarget.name.trim() });
                  setRenameTarget(null);
                }
              }}
            />
          )}
          <DialogFooter>
            <Button
              size="sm"
              disabled={!renameTarget?.name.trim()}
              onClick={() => {
                if (renameTarget) {
                  renameProject.mutate({ id: renameTarget.id, name: renameTarget.name.trim() });
                  setRenameTarget(null);
                }
              }}
            >
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
