"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe } from "lucide-react";
import { getBrowserTimeZone, timeZoneOffsetLabel } from "@/lib/timezone";
import { getUserTimeZone } from "@/lib/actions/user";

export function TimezoneCard() {
  const { data: saved } = useQuery({
    queryKey: ["user-timezone"],
    queryFn: () => getUserTimeZone(),
  });
  const browser = getBrowserTimeZone();

  return (
    <section className="rounded-lg border p-4">
      <h2 className="font-medium">시간대</h2>
      <div className="mt-2 flex items-center gap-2 text-sm">
        <Globe className="size-4 text-muted-foreground" />
        <span>
          {browser}{" "}
          <span className="text-muted-foreground">({timeZoneOffsetLabel(browser)})</span>
        </span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        기기 위치에서 자동으로 감지합니다. 해외로 이동하면 접속할 때 바뀌고,
        시간이 지정된 일정은 현지 시각으로 다시 계산돼 표시됩니다.
        종일 일정은 어디서 보든 같은 날짜로 유지됩니다.
      </p>
      {saved && saved !== browser && (
        <p className="mt-1 text-xs text-muted-foreground">
          서버에 저장된 시간대: {saved} → {browser}로 갱신 중
        </p>
      )}
    </section>
  );
}
