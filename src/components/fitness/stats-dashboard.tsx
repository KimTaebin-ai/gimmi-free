"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, startOfWeek } from "date-fns";
import { ko } from "date-fns/locale";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { shiftDateString, todayDateString } from "@/lib/date-only";
import {
  bestEstimated1RM,
  MUSCLE_GROUP_LABELS,
  totalVolume,
  volumeByMuscleGroup,
} from "@/lib/fitness-stats";
import { useExercises, useWorkouts } from "@/hooks/use-fitness";

const RANGES = [
  { days: 30, label: "1개월" },
  { days: 90, label: "3개월" },
  { days: 365, label: "1년" },
];

function SimpleTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="font-medium">{label}</p>
      <p className="tabular-nums text-muted-foreground">
        {payload[0].value?.toLocaleString()}
        {unit}
      </p>
    </div>
  );
}

export function StatsDashboard() {
  const [rangeDays, setRangeDays] = useState(90);
  const today = todayDateString();
  const fromDate = shiftDateString(today, -rangeDays);

  const { data: workouts, isLoading } = useWorkouts(fromDate, today);
  const { data: exercises } = useExercises();
  const [focusExercise, setFocusExercise] = useState<string>("");

  const groupOf = useMemo(() => {
    const map = new Map(exercises?.map((e) => [e.name, e.muscleGroup]) ?? []);
    return (name: string) => map.get(name);
  }, [exercises]);

  const allSets = useMemo(
    () => (workouts ?? []).flatMap((w) => w.sets),
    [workouts],
  );

  const volumeData = useMemo(() => {
    const byGroup = volumeByMuscleGroup(allSets, groupOf);
    return Object.entries(byGroup)
      .map(([g, v]) => ({ group: MUSCLE_GROUP_LABELS[g] ?? g, volume: Math.round(v) }))
      .sort((a, b) => b.volume - a.volume);
  }, [allSets, groupOf]);

  const weeklyData = useMemo(() => {
    const counts = new Map<string, number>();
    for (const w of workouts ?? []) {
      const key = format(startOfWeek(w.date, { weekStartsOn: 1 }), "M/d");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([week, count]) => ({ week, count }))
      .reverse();
  }, [workouts]);

  // 종목 선택지: 기간 내 실제로 기록된 종목
  const loggedNames = useMemo(
    () => [...new Set(allSets.map((s) => s.exerciseName))].sort(),
    [allSets],
  );
  const selected = focusExercise || loggedNames[0] || "";

  const oneRmData = useMemo(() => {
    if (!selected) return [];
    return (workouts ?? [])
      .map((w) => {
        const sets = w.sets.filter((s) => s.exerciseName === selected);
        if (sets.length === 0) return null;
        return {
          label: format(w.date, "M/d", { locale: ko }),
          date: w.date.getTime(),
          oneRm: Number(bestEstimated1RM(sets).toFixed(1)),
        };
      })
      .filter((d): d is { label: string; date: number; oneRm: number } => d !== null)
      .sort((a, b) => a.date - b.date);
  }, [workouts, selected]);

  const sessionCount = workouts?.length ?? 0;
  const grandVolume = Math.round(totalVolume(allSets));

  if (isLoading) {
    return <div className="h-64 animate-pulse rounded-lg bg-muted" />;
  }

  if (sessionCount === 0) {
    return (
      <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        이 기간에 운동 기록이 없어요.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-md border p-0.5 w-fit">
        {RANGES.map((r) => (
          <button
            key={r.days}
            onClick={() => setRangeDays(r.days)}
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              rangeDays === r.days
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">세션 수</p>
          <p className="mt-1 text-xl font-semibold">
            {sessionCount}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">회</span>
          </p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">총 볼륨</p>
          <p className="mt-1 text-xl font-semibold">
            {grandVolume.toLocaleString()}
            <span className="ml-0.5 text-sm font-normal text-muted-foreground">kg</span>
          </p>
        </div>
      </div>

      {/* 부위별 볼륨 */}
      <figure className="rounded-lg border p-3">
        <figcaption className="mb-2 text-sm font-medium">
          부위별 볼륨 <span className="text-muted-foreground">(kg)</span>
        </figcaption>
        {volumeData.every((d) => d.group === "기타") && (
          <p className="mb-2 text-[11px] text-muted-foreground">
            루틴 탭의 &quot;종목 부위 설정&quot;에서 부위를 지정하면 나눠서 볼 수 있어요.
          </p>
        )}
        <ResponsiveContainer width="100%" height={Math.max(140, volumeData.length * 32)}>
          <BarChart
            data={volumeData}
            layout="vertical"
            margin={{ top: 0, right: 12, bottom: 0, left: 8 }}
          >
            <CartesianGrid stroke="var(--chart-grid)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              stroke="var(--chart-axis)"
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="group"
              tick={{ fontSize: 12, fill: "var(--chart-muted)" }}
              stroke="var(--chart-axis)"
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip content={<SimpleTooltip unit="kg" />} cursor={{ fill: "var(--chart-grid)" }} />
            <Bar
              dataKey="volume"
              fill="var(--chart-series-1)"
              radius={[0, 4, 4, 0]}
              barSize={16}
            />
          </BarChart>
        </ResponsiveContainer>
      </figure>

      {/* 주간 빈도 */}
      <figure className="rounded-lg border p-3">
        <figcaption className="mb-2 text-sm font-medium">
          주간 운동 횟수 <span className="text-muted-foreground">(회)</span>
        </figcaption>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={weeklyData} margin={{ top: 0, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              stroke="var(--chart-axis)"
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
              stroke="var(--chart-axis)"
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip content={<SimpleTooltip unit="회" />} cursor={{ fill: "var(--chart-grid)" }} />
            <Bar dataKey="count" fill="var(--chart-series-2)" radius={[4, 4, 0, 0]} barSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </figure>

      {/* 종목별 추정 1RM 추이 */}
      {loggedNames.length > 0 && (
        <figure className="rounded-lg border p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <figcaption className="text-sm font-medium">
              추정 1RM 추이 <span className="text-muted-foreground">(kg)</span>
            </figcaption>
            <Select value={selected} onValueChange={setFocusExercise}>
              <SelectTrigger size="sm" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {loggedNames.map((n) => (
                  <SelectItem key={n} value={n}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {oneRmData.length < 2 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              추이를 그리려면 이 종목의 기록이 2회 이상 필요해요.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={oneRmData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                  stroke="var(--chart-axis)"
                  tickLine={false}
                />
                <YAxis
                  domain={["dataMin - 5", "dataMax + 5"]}
                  tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                  stroke="var(--chart-axis)"
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <Tooltip content={<SimpleTooltip unit="kg" />} />
                <Line
                  dataKey="oneRm"
                  stroke="var(--chart-series-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Epley 공식(중량 × (1 + 횟수/30)) 기준 추정치. 고반복일수록 오차가 커집니다.
          </p>
        </figure>
      )}
    </div>
  );
}
