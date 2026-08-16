import "server-only";
import { GoogleAuthError } from "@/lib/google/tokens";

const API_BASE = "https://www.googleapis.com/calendar/v3";

/** syncToken이 만료됨(410) — 전체 동기화로 폴백해야 한다 */
export class SyncTokenExpiredError extends Error {
  constructor() {
    super("syncToken expired");
    this.name = "SyncTokenExpiredError";
  }
}

export interface GoogleEventDateTime {
  date?: string; // 종일: "2026-08-16"
  dateTime?: string; // 시간 지정: RFC3339
  timeZone?: string;
}

export interface GoogleEvent {
  id: string;
  status?: "confirmed" | "tentative" | "cancelled";
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  start?: GoogleEventDateTime;
  end?: GoogleEventDateTime;
  recurringEventId?: string;
}

interface EventsListResponse {
  items?: GoogleEvent[];
  nextPageToken?: string;
  nextSyncToken?: string;
}

async function callApi<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
    cache: "no-store",
  });

  if (res.status === 410) throw new SyncTokenExpiredError();
  if (res.status === 401 || res.status === 403) {
    throw new GoogleAuthError(
      `Google Calendar 권한이 없습니다 (${res.status}). 재로그인해서 캘린더 권한에 동의해 주세요.`,
    );
  }
  if (!res.ok) {
    throw new Error(`Google Calendar API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * 이벤트 목록을 페이지네이션 끝까지 가져온다.
 * syncToken이 있으면 증분 동기화(변경분만), 없으면 기간 전체.
 */
export async function listEvents(
  accessToken: string,
  opts: {
    calendarId?: string;
    timeMin?: Date;
    timeMax?: Date;
    syncToken?: string | null;
  },
): Promise<{ events: GoogleEvent[]; nextSyncToken?: string }> {
  const calendarId = encodeURIComponent(opts.calendarId ?? "primary");
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;

  do {
    const params = new URLSearchParams({
      singleEvents: "true", // 반복 일정을 개별 인스턴스로 펼침
      maxResults: "2500",
    });
    if (opts.syncToken) {
      params.set("syncToken", opts.syncToken);
    } else {
      // syncToken과 timeMin/timeMax는 함께 쓸 수 없다
      if (opts.timeMin) params.set("timeMin", opts.timeMin.toISOString());
      if (opts.timeMax) params.set("timeMax", opts.timeMax.toISOString());
      params.set("orderBy", "startTime");
    }
    if (pageToken) params.set("pageToken", pageToken);

    const data = await callApi<EventsListResponse>(
      accessToken,
      `/calendars/${calendarId}/events?${params}`,
    );
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken;
    nextSyncToken = data.nextSyncToken ?? nextSyncToken;
  } while (pageToken);

  return { events, nextSyncToken };
}

export interface EventWritePayload {
  summary: string;
  description?: string | null;
  start: GoogleEventDateTime;
  end: GoogleEventDateTime;
}

export function insertEvent(
  accessToken: string,
  payload: EventWritePayload,
  calendarId = "primary",
): Promise<GoogleEvent> {
  return callApi<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { method: "POST", body: JSON.stringify(payload) },
  );
}

export function patchEvent(
  accessToken: string,
  eventId: string,
  payload: Partial<EventWritePayload>,
  calendarId = "primary",
): Promise<GoogleEvent> {
  return callApi<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "PATCH", body: JSON.stringify(payload) },
  );
}

export async function deleteEvent(
  accessToken: string,
  eventId: string,
  calendarId = "primary",
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "DELETE",
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    },
  );
  // 404/410 = 이미 지워짐. 성공으로 취급.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar delete ${res.status}`);
  }
}
