/** Google OAuth scope 문자열 처리 — 순수 함수라 서버/클라이언트 어디서든 안전 */

export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";

/** Google이 내려준 scope 문자열(공백 구분)을 집합으로 */
export function parseScopes(scope: string | null | undefined): Set<string> {
  return new Set((scope ?? "").split(/\s+/).filter(Boolean));
}

/**
 * 정확히 일치하는 scope가 있는지.
 * 부분 문자열 비교는 calendar.readonly 등도 통과시키므로 쓰지 않는다.
 */
export function hasScope(scope: string | null | undefined, required: string): boolean {
  return parseScopes(scope).has(required);
}
