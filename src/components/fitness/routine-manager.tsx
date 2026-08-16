"use client";

import { useState } from "react";
import { Dumbbell, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MUSCLE_GROUP_LABELS } from "@/lib/fitness-stats";
import {
  useDeleteRoutine,
  useExercises,
  useRoutines,
  useSaveRoutine,
  useUpsertExercise,
} from "@/hooks/use-fitness";
import type { MuscleGroup } from "@/generated/prisma/enums";
import type { RoutineWithExercises } from "@/lib/fitness-types";

interface Draft {
  exerciseName: string;
  targetSets: string;
  targetReps: string;
}

export function RoutineManager() {
  const { data: routines, isLoading } = useRoutines();
  const { data: exercises } = useExercises();
  const save = useSaveRoutine();
  const del = useDeleteRoutine();
  const upsertExercise = useUpsertExercise();

  const [editing, setEditing] = useState<RoutineWithExercises | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([]);

  function openNew() {
    setEditing(null);
    setName("");
    setDrafts([{ exerciseName: "", targetSets: "3", targetReps: "10" }]);
    setOpen(true);
  }

  function openEdit(r: RoutineWithExercises) {
    setEditing(r);
    setName(r.name);
    setDrafts(
      r.exercises.map((e) => ({
        exerciseName: e.exerciseName,
        targetSets: String(e.targetSets),
        targetReps: String(e.targetReps),
      })),
    );
    setOpen(true);
  }

  function submit() {
    save.mutate(
      {
        id: editing?.id ?? null,
        input: {
          name,
          exercises: drafts.map((d) => ({
            exerciseName: d.exerciseName,
            targetSets: Number(d.targetSets) || 3,
            targetReps: Number(d.targetReps) || 10,
          })),
        },
      },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">루틴 템플릿</h2>
        <Button size="sm" onClick={openNew}>
          <Plus className="size-4" />
          새 루틴
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : routines && routines.length > 0 ? (
        <div className="space-y-2">
          {routines.map((r) => (
            <div key={r.id} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <Dumbbell className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{r.name}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.exercises
                      .map((e) => `${e.exerciseName} ${e.targetSets}×${e.targetReps}`)
                      .join(" · ") || "종목 없음"}
                  </p>
                  {r._count.workouts > 0 && (
                    <p className="mt-0.5 text-[11px] text-muted-foreground/70">
                      {r._count.workouts}회 수행
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(r)}>
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-red-500"
                  onClick={() => del.mutate(r.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          루틴이 없어요. &quot;Push A&quot; 같은 템플릿을 만들면 기록할 때 한 번에 불러올 수 있어요.
        </p>
      )}

      {/* 종목 사전 — 부위를 지정해야 통계에서 부위별 볼륨이 잡힌다 */}
      {exercises && exercises.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-medium text-muted-foreground">
            종목 부위 설정
          </h2>
          <div className="divide-y rounded-lg border">
            {exercises.map((ex) => (
              <div key={ex.id} className="flex items-center gap-2 px-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm">{ex.name}</span>
                <Select
                  value={ex.muscleGroup}
                  onValueChange={(v) =>
                    upsertExercise.mutate({ name: ex.name, muscleGroup: v as MuscleGroup })
                  }
                >
                  <SelectTrigger size="sm" className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MUSCLE_GROUP_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "루틴 수정" : "새 루틴"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="mb-1 text-xs">루틴 이름</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: Push A"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex-1">종목</span>
                <span className="w-14 text-center">세트</span>
                <span className="w-14 text-center">횟수</span>
                <span className="w-6" />
              </div>
              {drafts.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    value={d.exerciseName}
                    onChange={(e) =>
                      setDrafts((p) =>
                        p.map((x, idx) =>
                          idx === i ? { ...x, exerciseName: e.target.value } : x,
                        ),
                      )
                    }
                    placeholder="벤치프레스"
                    className="h-8 flex-1"
                    list="exercise-names"
                  />
                  <Input
                    type="number"
                    value={d.targetSets}
                    onChange={(e) =>
                      setDrafts((p) =>
                        p.map((x, idx) =>
                          idx === i ? { ...x, targetSets: e.target.value } : x,
                        ),
                      )
                    }
                    className="h-8 w-14"
                  />
                  <Input
                    type="number"
                    value={d.targetReps}
                    onChange={(e) =>
                      setDrafts((p) =>
                        p.map((x, idx) =>
                          idx === i ? { ...x, targetReps: e.target.value } : x,
                        ),
                      )
                    }
                    className="h-8 w-14"
                  />
                  <button
                    className="w-6 text-muted-foreground hover:text-red-500"
                    onClick={() => setDrafts((p) => p.filter((_, idx) => idx !== i))}
                    aria-label="종목 삭제"
                  >
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <datalist id="exercise-names">
                {exercises?.map((e) => (
                  <option key={e.id} value={e.name} />
                ))}
              </datalist>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() =>
                  setDrafts((p) => [
                    ...p,
                    { exerciseName: "", targetSets: "3", targetReps: "10" },
                  ])
                }
              >
                <Plus className="size-3" />
                종목 추가
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button disabled={!name.trim() || save.isPending} onClick={submit}>
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
