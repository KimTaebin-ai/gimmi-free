import type { TaskWithRelations } from "@/lib/task-types";

/** 캘린더 화면에 그리는 통합 아이템 — Google 이벤트 + 시간 있는 태스크 */
export type CalendarItem =
  | {
      kind: "event";
      id: string;
      title: string;
      startAt: Date;
      endAt: Date;
      allDay: boolean;
      location: string | null;
      description: string | null;
      htmlLink: string | null;
    }
  | {
      kind: "task";
      id: string;
      title: string;
      startAt: Date;
      endAt: Date;
      allDay: boolean;
      priority: number;
      status: string;
      task: TaskWithRelations;
    };

export interface CalendarSyncInfo {
  connected: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  /** 실제로 부여된 Google scope — 권한 문제 진단용 */
  grantedScopes: string[];
}
