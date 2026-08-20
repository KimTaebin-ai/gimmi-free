"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { loadSettings, updateSettings } from "@/lib/actions/settings";
import { getUserTimeZone } from "@/lib/actions/user";
import { timeZoneOffsetLabel } from "@/lib/timezone";

const HOURS = Array.from({ length: 24 }, (_, i) => i);

/**
 * 저녁 알림 설정.
 *
 * 시각은 **있는 곳의 시계** 기준이라 지금 타임존을 같이 보여 준다 — "18시"만 적혀 있으면
 * 비행기를 타고 온 뒤 어느 18시인지 알 수 없다.
 */
export function ReminderCard() {
  const qc = useQueryClient();
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => loadSettings(),
  });
  const { data: timeZone } = useQuery({
    queryKey: ["timezone"],
    queryFn: () => getUserTimeZone(),
  });

  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch),
    onSuccess: (next) => qc.setQueryData(["settings"], next),
  });

  const enabled = settings?.discordReminder ?? true;
  const hour = settings?.reminderHour ?? 18;

  return (
    <section className="rounded-lg border">
      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <Label htmlFor="discord-reminder" className="flex items-center gap-1.5 text-sm font-medium">
            <Bell className="size-3.5" />
            남은 태스크 저녁 알림
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            끝내지 못한 태스크가 있으면 디스코드로 알려 줍니다. 지연·오늘 마감을 먼저 보여
            주고, 하루에 한 번만 갑니다.
          </p>
        </div>
        <Switch
          id="discord-reminder"
          checked={enabled}
          onCheckedChange={(v) => save.mutate({ discordReminder: v })}
        />
      </div>

      <div className="flex items-center justify-between gap-4 border-t p-4">
        <div className="min-w-0">
          <Label htmlFor="reminder-hour" className="text-sm font-medium">
            알림 시각
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            지금 있는 곳{timeZone ? ` (${timeZone} ${timeZoneOffsetLabel(timeZone)})` : ""}의
            시계 기준입니다. 다른 지역으로 이동하면 그곳의 시각에 맞춰 울립니다.
          </p>
        </div>
        <select
          id="reminder-hour"
          disabled={!enabled}
          value={hour}
          onChange={(e) => save.mutate({ reminderHour: Number(e.target.value) })}
          className="h-9 shrink-0 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
        >
          {HOURS.map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
