"use server";

import { prisma } from "@/lib/prisma";
import { requireUserId } from "@/lib/actions/auth-helpers";
import { toDateOnly } from "@/lib/date-only";
import type { BodyMetricInput, BodyMetricRow } from "@/lib/fitness-types";

export async function listBodyMetrics(
  fromDate: string,
  toDate: string,
): Promise<BodyMetricRow[]> {
  const userId = await requireUserId();
  return prisma.bodyMetric.findMany({
    where: { userId, date: { gte: toDateOnly(fromDate), lte: toDateOnly(toDate) } },
    orderBy: { date: "asc" },
  });
}

export async function getLatestBodyMetric(): Promise<BodyMetricRow | null> {
  const userId = await requireUserId();
  return prisma.bodyMetric.findFirst({ where: { userId }, orderBy: { date: "desc" } });
}

/** 같은 날짜에 다시 입력하면 덮어쓴다(@@unique([userId, date])) */
export async function saveBodyMetric(
  input: BodyMetricInput,
): Promise<BodyMetricRow> {
  const userId = await requireUserId();
  const date = toDateOnly(input.date);
  const data = {
    weightKg: input.weightKg ?? null,
    skeletalMuscleKg: input.skeletalMuscleKg ?? null,
    bodyFatPct: input.bodyFatPct ?? null,
    note: input.note ?? null,
  };
  return prisma.bodyMetric.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, ...data },
    update: data,
  });
}

export async function deleteBodyMetric(id: string): Promise<void> {
  const userId = await requireUserId();
  await prisma.bodyMetric.deleteMany({ where: { id, userId } });
}
