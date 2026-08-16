"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCalendarSyncInfo,
  listCalendarItems,
  syncCalendarNow,
} from "@/lib/actions/calendar";

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
