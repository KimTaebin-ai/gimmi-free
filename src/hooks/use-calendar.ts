"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCalendarSyncInfo,
  listCalendarItems,
  listEventsInRange,
  syncCalendarNow,
} from "@/lib/actions/calendar";

/** 태스크 리스트에 함께 표시할 Google 일정. range가 null이면 조회하지 않는다. */
export function useEventsInRange(range: { from: Date; to: Date } | null) {
  const fromIso = range?.from.toISOString();
  const toIso = range?.to.toISOString();
  return useQuery({
    queryKey: ["calendar-events", fromIso, toIso],
    queryFn: () => listEventsInRange(fromIso!, toIso!),
    enabled: !!fromIso && !!toIso,
  });
}

export function useCalendarItems(from: Date, to: Date) {
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  return useQuery({
    queryKey: ["calendar", fromIso, toIso],
    queryFn: () => listCalendarItems(fromIso, toIso),
  });
}

export function useCalendarSyncInfo() {
  return useQuery({
    queryKey: ["calendar-sync-info"],
    queryFn: () => getCalendarSyncInfo(),
  });
}

export function useSyncCalendar() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => syncCalendarNow(),
    onSuccess: (info) => {
      qc.setQueryData(["calendar-sync-info"], info);
      qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}
