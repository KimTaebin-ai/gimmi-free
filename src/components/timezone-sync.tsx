"use client";

import { useEffect, useRef } from "react";
import { getBrowserTimeZone } from "@/lib/timezone";
import { syncUserTimeZone } from "@/lib/actions/user";

/**
 * 브라우저(=현재 위치)의 타임존을 서버에 반영한다.
 * 해외로 이동하면 다음 접속 때 자동으로 갱신된다.
 * 화면 표시는 브라우저 타임존을 직접 쓰므로 이 동기화와 무관하게 즉시 맞는다.
 */
export function TimeZoneSync() {
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const tz = getBrowserTimeZone();
    if (sent.current === tz) return;
    sent.current = tz;
    syncUserTimeZone(tz).catch(() => {
      // 실패해도 화면 동작에는 영향이 없다
      sent.current = null;
    });
  }, []);

  return null;
}
