"use client";

import { useState } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  GripVertical,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  parseDateOnlyLocal,
  shiftDateString,
  todayDateString,
} from "@/lib/date-only";
import { estimate1RM, totalVolume } from "@/lib/fitness-stats";
import {
  useDeleteWorkout,
  usePreviousSets,
  useRoutines,
  useSaveWorkout,
  useWorkoutByDate,
} from "@/hooks/use-fitness";
import type { ExerciseBlockInput } from "@/lib/fitness-types";

interface SetDraft {
  reps: string;
  weightKg: string;
}
interface BlockDraft {
  exerciseName: string;
  sets: SetDraft[];
}

const emptySet = (): SetDraft => ({ reps: "", weightKg: "" });

function toBlocks(drafts: BlockDraft[]): ExerciseBlockInput[] {
  return drafts.map((b) => ({
    exerciseName: b.exerciseName,
    sets: b.sets.map((s) => ({
      reps: Number(s.reps) || 0,
      weightKg: Number(s.weightKg) || 0,
    })),
  }));
}

/** 직전 세션 기록을 세트 줄 옆에 회색으로 보여준다 */
function PreviousHint({
  exerciseName,
  date,
  setIndex,
  reps,
  weightKg,
}: {
  exerciseName: string;
  date: string;
  setIndex: number;
  reps: number;
  weightKg: number;
}) {
  const { data } = usePreviousSets(exerciseName, date);
  const prev = data?.sets[setIndex];
  if (!prev) return <span className="w-20 shrink-0" />;

  const improved =
    weightKg > 0 &&
    (weightKg > prev.weightKg ||
      (weightKg === prev.weightKg && reps > prev.reps));
  const worse =
    weightKg > 0 &&
    (weightKg < prev.weightKg ||
      (weightKg === prev.weightKg && reps > 0 && reps < prev.reps));

  return (
    <span
      className={cn(
        "flex w-20 shrink-0 items-center gap-0.5 text-[11px] tabular-nums text-muted-foreground",
        improved && "text-emerald-600 dark:text-emerald-400",
        worse && "text-red-500",
      )}
      title={`직전 기록 (${data.date})`}
    >
      {improved && <TrendingUp className="size-3" />}
      {worse && <TrendingDown className="size-3" />}
      {prev.weightKg}×{prev.reps}
    </span>
  );
}

export function WorkoutLogger() {
  const [date, setDate] = useState(() => todayDateString());
  const { data: workout, isLoading } = useWorkoutByDate(date);
  const { data: routines } = useRoutines();
  const save = useSaveWorkout();
  const del = useDeleteWorkout();

  const [blocks, setBlocks] = useState<BlockDraft[]>([]);
  const [note, setNote] = useState("");
  const [routineId, setRoutineId] = useState<string | null>(null);
  // 서버 데이터를 폼에 반영했는지 추적하는 키 (날짜/레코드가 바뀔 때만 리셋)
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const serverKey = `${date}:${workout?.id ?? "new"}`;
  if (!isLoading && loadedKey !== serverKey) {
    // 렌더 중 동기화 (effect로 setState 하지 않기 위한 패턴)
    setLoadedKey(serverKey);
    if (workout) {
      const grouped: BlockDraft[] = [];
      for (const s of workout.sets) {
        const last = grouped[grouped.length - 1];
        if (last && last.exerciseName === s.exerciseName) {
          last.sets.push({ reps: String(s.reps), weightKg: String(s.weightKg) });
        } else {
          grouped.push({
            exerciseName: s.exerciseName,
            sets: [{ reps: String(s.reps), weightKg: String(s.weightKg) }],
          });
        }
      }
      setBlocks(grouped.length > 0 ? grouped : []);
      setNote(workout.note ?? "");
      setRoutineId(workout.routineId ?? null);
    } else {
      setBlocks([]);
      setNote("");
      setRoutineId(null);
    }
  }

  function applyRoutine(id: string) {
    const routine = routines?.find((r) => r.id === id);
    if (!routine) return;
    setRoutineId(id);
    setBlocks(
      routine.exercises.map((e) => ({
        exerciseName: e.exerciseName,
        sets: Array.from({ length: e.targetSets }, () => emptySet()),
      })),
    );
  }

  const updateBlock = (i: number, fn: (b: BlockDraft) => BlockDraft) =>
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? fn(b) : b)));

  const allSets = blocks.flatMap((b) =>
    b.sets
      .filter((s) => Number(s.weightKg) > 0 && Number(s.reps) > 0)
      .map((s) => ({
        exerciseName: b.exerciseName,
        reps: Number(s.reps),
        weightKg: Number(s.weightKg),
      })),
  );
  const volume = totalVolume(allSets);

  return (
    <div className="space-y-4">
      {/* 날짜 이동 */}
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setDate(shiftDateString(date, -1))}>
          <ChevronLeft className="size-4" />
        </Button>
        <div className="flex-1 text-center">
          <div className="text-sm font-medium">
            {format(parseDateOnlyLocal(date), "M월 d일 (EEE)", { locale: ko })}
          </div>
          <Input
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="mx-auto mt-1 h-7 w-36 text-xs"
          />
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={() => setDate(shiftDateString(date, 1))}>
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* 루틴 불러오기 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={routineId ?? "none"} onValueChange={(v) => v !== "none" && applyRoutine(v)}>
          <SelectTrigger size="sm" className="w-48">
            <SelectValue placeholder="루틴 불러오기" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">루틴 없이</SelectItem>
            {routines?.map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {date !== todayDateString() && (
          <Button variant="ghost" size="sm" onClick={() => setDate(todayDateString())}>
            오늘로
          </Button>
        )}
        {volume > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">
            총 볼륨 <b className="text-foreground">{volume.toLocaleString()}</b> kg
          </span>
        )}
      </div>

      {/* 종목 블록 */}
      <div className="space-y-3">
        {blocks.map((block, bi) => {
          const best = Math.max(
            0,
            ...block.sets.map((s) =>
              estimate1RM(Number(s.weightKg) || 0, Number(s.reps) || 0),
            ),
          );
          return (
            <div key={bi} className="rounded-lg border p-3">
              <div className="flex items-center gap-2">
                <GripVertical className="size-4 shrink-0 text-muted-foreground/50" />
                <Input
                  value={block.exerciseName}
                  onChange={(e) =>
                    updateBlock(bi, (b) => ({ ...b, exerciseName: e.target.value }))
                  }
                  placeholder="종목 이름 (예: 벤치프레스)"
                  className="h-8 flex-1 font-medium"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-red-500"
                  onClick={() => setBlocks((p) => p.filter((_, i) => i !== bi))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 px-1 text-[11px] text-muted-foreground">
                  <span className="w-6">세트</span>
                  <span className="w-20">kg</span>
                  <span className="w-20">회</span>
                  <span className="w-20 shrink-0">직전</span>
                </div>
                {block.sets.map((set, si) => (
                  <div key={si} className="flex items-center gap-2">
                    <span className="w-6 text-center text-xs text-muted-foreground">
                      {si + 1}
                    </span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={set.weightKg}
                      onChange={(e) =>
                        updateBlock(bi, (b) => ({
                          ...b,
                          sets: b.sets.map((s, i) =>
                            i === si ? { ...s, weightKg: e.target.value } : s,
                          ),
                        }))
                      }
                      className="h-8 w-20"
                    />
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={set.reps}
                      onChange={(e) =>
                        updateBlock(bi, (b) => ({
                          ...b,
                          sets: b.sets.map((s, i) =>
                            i === si ? { ...s, reps: e.target.value } : s,
                          ),
                        }))
                      }
                      className="h-8 w-20"
                    />
                    <PreviousHint
                      exerciseName={block.exerciseName}
                      date={date}
                      setIndex={si}
                      reps={Number(set.reps) || 0}
                      weightKg={Number(set.weightKg) || 0}
                    />
                    <button
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() =>
                        updateBlock(bi, (b) => ({
                          ...b,
                          sets: b.sets.filter((_, i) => i !== si),
                        }))
                      }
                      aria-label="세트 삭제"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() =>
                    updateBlock(bi, (b) => ({
                      ...b,
                      sets: [...b.sets, b.sets[b.sets.length - 1] ?? emptySet()],
                    }))
                  }
                >
                  <Copy className="size-3" />
                  세트 추가
                </Button>
                {best > 0 && (
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    추정 1RM <b className="text-foreground">{best.toFixed(1)}</b> kg
                  </span>
                )}
              </div>
            </div>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() =>
            setBlocks((p) => [...p, { exerciseName: "", sets: [emptySet()] }])
          }
        >
          <Plus className="size-4" />
          종목 추가
        </Button>
      </div>

      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="세션 메모 (컨디션, 통증 등)"
        className="min-h-16 resize-none text-sm"
      />

      <div className="flex gap-2">
        <Button
          className="flex-1"
          disabled={save.isPending || blocks.length === 0}
          onClick={() =>
            save.mutate({
              id: workout?.id,
              date,
              routineId,
              note: note || null,
              blocks: toBlocks(blocks),
            })
          }
        >
          {save.isPending ? "저장 중…" : "저장"}
        </Button>
        {workout && (
          <Button
            variant="outline"
            className="text-red-500"
            onClick={() => {
              del.mutate(workout.id);
              setBlocks([]);
              setNote("");
              setRoutineId(null);
            }}
          >
            <Trash2 className="size-4" />
            세션 삭제
          </Button>
        )}
      </div>
    </div>
  );
}
