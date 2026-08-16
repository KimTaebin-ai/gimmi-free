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

/** scope URI에서 사람이 읽을 이름만 */
function scopeLabel(scope: string): string {
  return scope.replace("https://www.googleapis.com/auth/", "");
}

export function GoogleSettings({
  reconnectAction,
}: {
  reconnectAction: () => Promise<void>;
}) {
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
              <span className="text-muted-foreground">캘린더 권한 없음</span>
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

        {/* 부여된 권한 — 문제 생겼을 때 바로 진단되도록 */}
        {info && (
          <div className="mt-3">
            <p className="text-xs font-medium text-muted-foreground">부여된 권한</p>
            <ul className="mt-1 space-y-0.5">
              {info.grantedScopes.length === 0 && (
                <li className="text-xs text-muted-foreground">(없음)</li>
              )}
              {info.grantedScopes.map((s) => (
                <li key={s} className="font-mono text-[11px] text-muted-foreground">
                  {scopeLabel(s)}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={sync.isPending || !info?.connected}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={cn("size-3.5", sync.isPending && "animate-spin")} />
            지금 동기화
          </Button>
          <form action={reconnectAction}>
            <Button
              type="submit"
              size="sm"
              variant={info?.connected ? "ghost" : "default"}
            >
              Google 다시 연결
            </Button>
          </form>
        </div>
        {!info?.connected && (
          <p className="mt-2 text-xs text-muted-foreground">
            &quot;Google 다시 연결&quot;을 누르면 동의 화면이 다시 뜨고, 캘린더 권한이 담긴 새 토큰이 저장됩니다.
          </p>
        )}
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
