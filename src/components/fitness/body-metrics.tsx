"use client";

import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { ArrowDown, ArrowUp, Minus, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { shiftDateString, todayDateString } from "@/lib/date-only";
import { movingAverage } from "@/lib/fitness-stats";
import {
  useAppSettings,
  useBodyMetrics,
  useDeleteBodyMetric,
  useSaveBodyMetric,
  useUpdateSettings,
} from "@/hooks/use-fitness";
import type { BodyMetricRow } from "@/lib/fitness-types";

const RANGES = [
  { days: 30, label: "1개월" },
  { days: 90, label: "3개월" },
  { days: 365, label: "1년" },
];

interface Point {
  date: string;
  label: string;
  weightKg: number | null;
  skeletalMuscleKg: number | null;
  bodyFatPct: number | null;
  weightAvg: number | null;
}

/** 최근값 + 직전 대비 변화 */
function StatTile({
  label,
  value,
  unit,
  delta,
  /** 값이 줄어드는 게 좋은 지표인지 (체지방) */
  lowerIsBetter = false,
  colorVar,
}: {
  label: string;
  value: number | null;
  unit: string;
  delta: number | null;
  lowerIsBetter?: boolean;
  colorVar: string;
}) {
  const good = delta == null || delta === 0 ? null : lowerIsBetter ? delta < 0 : delta > 0;
  const Icon = delta == null || delta === 0 ? Minus : delta > 0 ? ArrowUp : ArrowDown;

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-1.5">
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: `var(${colorVar})` }}
          aria-hidden
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="mt-1 text-xl font-semibold">
        {value != null ? value.toFixed(1) : "—"}
        {value != null && <span className="ml-0.5 text-sm font-normal text-muted-foreground">{unit}</span>}
      </div>
      {delta != null && delta !== 0 && (
        <div
          className={cn(
            "mt-0.5 flex items-center gap-0.5 text-xs",
            good === true && "text-emerald-600 dark:text-emerald-400",
            good === false && "text-red-500",
          )}
        >
          <Icon className="size-3" />
          {Math.abs(delta).toFixed(1)}
          {unit}
        </div>
      )}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  label,
  unit,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unit: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-1.5 tabular-nums">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: p.color }}
            aria-hidden
          />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="font-medium">
            {p.value?.toFixed(1)}
            {unit}
          </span>
        </p>
      ))}
    </div>
  );
}

export function BodyMetrics() {
  const [rangeDays, setRangeDays] = useState(90);
  const [showTable, setShowTable] = useState(false);
  const today = todayDateString();
  const fromDate = shiftDateString(today, -rangeDays);

  const { data: rows, isLoading } = useBodyMetrics(fromDate, today);
  const { data: settings } = useAppSettings();
  const save = useSaveBodyMetric();
  const del = useDeleteBodyMetric();
  const updateSettings = useUpdateSettings();

  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [muscle, setMuscle] = useState("");
  const [fat, setFat] = useState("");

  const points: Point[] = useMemo(() => {
    const list = rows ?? [];
    const weights = list.map((r) => r.weightKg);
    const avg = movingAverage(weights, 7);
    return list.map((r, i) => ({
      date: r.date.toISOString().slice(0, 10),
      label: format(r.date, "M/d", { locale: ko }),
      weightKg: r.weightKg,
      skeletalMuscleKg: r.skeletalMuscleKg,
      bodyFatPct: r.bodyFatPct,
      weightAvg: avg[i],
    }));
  }, [rows]);

  const latest = rows && rows.length > 0 ? rows[rows.length - 1] : null;
  const prev = rows && rows.length > 1 ? rows[rows.length - 2] : null;
  const delta = (
    key: "weightKg" | "skeletalMuscleKg" | "bodyFatPct",
  ): number | null => {
    if (!latest || !prev) return null;
    const a = latest[key];
    const b = prev[key];
    return a != null && b != null ? a - b : null;
  };

  function submit() {
    const num = (v: string) => (v.trim() === "" ? null : Number(v));
    save.mutate(
      {
        date,
        weightKg: num(weight),
        skeletalMuscleKg: num(muscle),
        bodyFatPct: num(fat),
      },
      {
        onSuccess: () => {
          setWeight("");
          setMuscle("");
          setFat("");
        },
      },
    );
  }

  const hasKgData = points.some((p) => p.weightKg != null || p.skeletalMuscleKg != null);
  const hasFatData = points.some((p) => p.bodyFatPct != null);

  return (
    <div className="space-y-4">
      {/* 최근값 */}
      <div className="grid grid-cols-3 gap-2">
        <StatTile
          label="체중"
          value={latest?.weightKg ?? null}
          unit="kg"
          delta={delta("weightKg")}
          colorVar="--chart-series-1"
        />
        <StatTile
          label="골격근량"
          value={latest?.skeletalMuscleKg ?? null}
          unit="kg"
          delta={delta("skeletalMuscleKg")}
          colorVar="--chart-series-2"
        />
        <StatTile
          label="체지방률"
          value={latest?.bodyFatPct ?? null}
          unit="%"
          delta={delta("bodyFatPct")}
          lowerIsBetter
          colorVar="--chart-series-3"
        />
      </div>

      {/* 입력 */}
      <div className="rounded-lg border p-3">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">측정일</Label>
            <Input
              type="date"
              value={date}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">체중 (kg)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">골격근량 (kg)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={muscle}
              onChange={(e) => setMuscle(e.target.value)}
              className="h-8"
            />
          </div>
          <div>
            <Label className="mb-1 text-xs text-muted-foreground">체지방률 (%)</Label>
            <Input
              type="number"
              inputMode="decimal"
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
        <Button
          size="sm"
          className="mt-2 w-full sm:w-auto"
          disabled={save.isPending || (!weight && !muscle && !fat)}
          onClick={submit}
        >
          기록 저장
        </Button>
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          같은 날짜에 다시 저장하면 덮어씁니다. 비워둔 항목은 기록되지 않아요.
        </p>
      </div>

      {/* 기간 선택 + 표 보기 */}
      <div className="flex items-center gap-1">
        <div className="flex rounded-md border p-0.5">
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
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-8 text-xs"
          onClick={() => setShowTable((v) => !v)}
        >
          <Table2 className="size-3.5" />
          {showTable ? "차트 보기" : "표 보기"}
        </Button>
      </div>

      {isLoading ? (
        <div className="h-64 animate-pulse rounded-lg bg-muted" />
      ) : points.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          아직 기록이 없어요. 위에서 첫 측정값을 입력해 보세요.
        </p>
      ) : showTable ? (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead className="text-right">체중</TableHead>
                <TableHead className="text-right">골격근량</TableHead>
                <TableHead className="text-right">체지방률</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...(rows ?? [])].reverse().map((r: BodyMetricRow) => (
                <TableRow key={r.id}>
                  <TableCell className="text-xs">
                    {format(r.date, "yyyy.M.d", { locale: ko })}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.weightKg?.toFixed(1) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.skeletalMuscleKg?.toFixed(1) ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.bodyFatPct?.toFixed(1) ?? "—"}
                  </TableCell>
                  <TableCell>
                    <button
                      className="text-muted-foreground hover:text-red-500"
                      onClick={() => del.mutate(r.id)}
                      aria-label="기록 삭제"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className="space-y-4">
          {/* 체중·골격근량 — 같은 단위(kg)라 한 축에 둔다 */}
          {hasKgData && (
            <figure className="rounded-lg border p-3">
              <figcaption className="mb-2 text-sm font-medium">
                체중 · 골격근량 <span className="text-muted-foreground">(kg)</span>
              </figcaption>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                    stroke="var(--chart-axis)"
                    tickLine={false}
                  />
                  <YAxis
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                    stroke="var(--chart-axis)"
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip unit="kg" />} />
                  <Legend
                    wrapperStyle={{ fontSize: 12 }}
                    formatter={(v) => <span className="text-muted-foreground">{v}</span>}
                  />
                  {settings?.goalWeightKg != null && (
                    <ReferenceLine
                      y={settings.goalWeightKg}
                      stroke="var(--chart-goal)"
                      strokeDasharray="4 4"
                      label={{ value: "목표 체중", fontSize: 10, fill: "var(--chart-muted)", position: "insideTopRight" }}
                    />
                  )}
                  {settings?.goalMuscleKg != null && (
                    <ReferenceLine
                      y={settings.goalMuscleKg}
                      stroke="var(--chart-goal)"
                      strokeDasharray="4 4"
                      label={{ value: "목표 골격근량", fontSize: 10, fill: "var(--chart-muted)", position: "insideBottomRight" }}
                    />
                  )}
                  <Line
                    name="체중"
                    dataKey="weightKg"
                    stroke="var(--chart-series-1)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                  />
                  <Line
                    name="골격근량"
                    dataKey="skeletalMuscleKg"
                    stroke="var(--chart-series-2)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                  />
                  <Line
                    name="체중 7일 평균"
                    dataKey="weightAvg"
                    stroke="var(--chart-series-1)"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          )}

          {/* 체지방률 — 단위가 달라 별도 차트 (이중 축을 쓰지 않는다) */}
          {hasFatData && (
            <figure className="rounded-lg border p-3">
              <figcaption className="mb-2 text-sm font-medium">
                체지방률 <span className="text-muted-foreground">(%)</span>
              </figcaption>
              <ResponsiveContainer width="100%" height={180}>
                <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                    stroke="var(--chart-axis)"
                    tickLine={false}
                  />
                  <YAxis
                    domain={["dataMin - 1", "dataMax + 1"]}
                    tick={{ fontSize: 11, fill: "var(--chart-muted)" }}
                    stroke="var(--chart-axis)"
                    tickLine={false}
                    axisLine={false}
                    width={44}
                  />
                  <Tooltip content={<ChartTooltip unit="%" />} />
                  {settings?.goalBodyFatPct != null && (
                    <ReferenceLine
                      y={settings.goalBodyFatPct}
                      stroke="var(--chart-goal)"
                      strokeDasharray="4 4"
                      label={{ value: "목표", fontSize: 10, fill: "var(--chart-muted)", position: "insideTopRight" }}
                    />
                  )}
                  <Line
                    name="체지방률"
                    dataKey="bodyFatPct"
                    stroke="var(--chart-series-3)"
                    strokeWidth={2}
                    dot={{ r: 2.5 }}
                    activeDot={{ r: 4.5 }}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </figure>
          )}
        </div>
      )}

      {/* 목표 설정 */}
      <details className="rounded-lg border p-3">
        <summary className="cursor-pointer text-sm font-medium">목표 설정</summary>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {(
            [
              { key: "goalWeightKg", label: "목표 체중 (kg)" },
              { key: "goalMuscleKg", label: "목표 골격근량 (kg)" },
              { key: "goalBodyFatPct", label: "목표 체지방률 (%)" },
            ] as const
          ).map(({ key, label }) => (
            <div key={key}>
              <Label className="mb-1 text-xs text-muted-foreground">{label}</Label>
              <Input
                type="number"
                inputMode="decimal"
                step="0.1"
                defaultValue={settings?.[key] ?? ""}
                onBlur={(e) =>
                  updateSettings.mutate({
                    [key]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="h-8"
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}
