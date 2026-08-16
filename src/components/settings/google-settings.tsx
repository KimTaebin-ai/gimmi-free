"use client";

import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useCalendarSyncInfo, useSyncCalendar } from "@/hooks/use-calendar";
import { loadSettings, updateSettings } from "@/lib/actions/settings";

export function GoogleSettings() {
  const { data: info } = useCalendarSyncInfo();
  const sync = useSyncCalendar();
  const qc = useQueryClient();

  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => loadSettings(),
  });
  const save = useMutation({
    mutationFn: (patch: Parameters<typeof updateSettings>[0]) => updateSettings(patch),
    onSuccess: (next) => qc.setQueryData(["settings"], next),
  });

  return (
    <section className="rounded-lg border">
      <div className="p-4">
        <h2 className="font-medium">Google 캘린더</h2>
        <div className="mt-2 flex items-center gap-2 text-sm">
          {info?.connected ? (
            <>
              <CheckCircle2 className="size-4 text-emerald-500" />
              <span>연결됨</span>
            </>
          ) : (
            <>
              <XCircle className="size-4 text-amber-500" />
              <span className="text-muted-foreground">
                캘린더 권한 없음 — 로그아웃 후 다시 로그인해 동의해 주세요
              </span>
            </>
          )}
        </div>
        {info?.lastSyncedAt && (
          <p className="mt-1 text-xs text-muted-foreground">
            마지막 동기화{" "}
            {formatDistanceToNow(new Date(info.lastSyncedAt), {
              addSuffix: true,
              locale: ko,
            })}
          </p>
        )}
        {info?.lastError && (
          <p className="mt-1 text-xs text-red-500">오류: {info.lastError}</p>
        )}
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={sync.isPending || !info?.connected}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} />
          지금 동기화
        </Button>
      </div>

      <Separator />

      <div className="flex items-center justify-between gap-4 p-4">
        <div>
          <Label htmlFor="sync-tasks" className="text-sm font-medium">
            태스크를 캘린더에 표시
          </Label>
          <p className="mt-0.5 text-xs text-muted-foreground">
            시간이 지정된 태스크를 Google 캘린더 일정으로 만듭니다. 종일 태스크는 제외됩니다.
          </p>
        </div>
        <Switch
          id="sync-tasks"
          checked={settings?.syncTasksToCalendar ?? true}
          onCheckedChange={(v) => save.mutate({ syncTasksToCalendar: v })}
        />
      </div>
    </section>
  );
}
