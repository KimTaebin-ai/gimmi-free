import type { TaskWithRelations } from "@/lib/task-types";

/** 캘린더 화면에 그리는 통합 아이템 — Google 이벤트 + 시간 있는 태스크 */
export type CalendarItem =
  | {
      kind: "event";
      id: string;
      /** Google 쪽 식별자 — 메모(TaskEntry)를 매다는 앵커 */
      googleEventId: string;
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

/** 태스크 리스트에 함께 보여줄 Google 일정(읽기 전용) */
export interface CalendarEventLite {
  id: string;
  googleEventId: string;
  title: string;
  startAt: Date;
  endAt: Date;
  allDay: boolean;
  location: string | null;
  description: string | null;
  htmlLink: string | null;
}

/** 리스트에서 고른 일정을 캘린더 상세 시트에 그대로 넘기기 위한 변환 */
export function eventToCalendarItem(e: CalendarEventLite): CalendarItem {
  return {
    kind: "event",
    id: e.id,
    googleEventId: e.googleEventId,
    title: e.title,
    startAt: e.startAt,
    endAt: e.endAt,
    allDay: e.allDay,
    location: e.location,
    description: e.description,
    htmlLink: e.htmlLink,
  };
}

export interface CalendarSyncInfo {
  connected: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  /** 실제로 부여된 Google scope — 권한 문제 진단용 */
  grantedScopes: string[];
}
