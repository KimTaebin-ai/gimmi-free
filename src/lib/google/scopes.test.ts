import { describe, expect, it } from "vitest";
import { CALENDAR_SCOPE, hasScope, parseScopes } from "./scopes";

describe("parseScopes", () => {
  it("공백으로 구분된 scope를 집합으로 나눈다", () => {
    const s = parseScopes(
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar",
    );
    expect(s.has(CALENDAR_SCOPE)).toBe(true);
    expect(s.has("openid")).toBe(true);
    expect(s.size).toBe(3);
  });

  it("빈 값/누락을 안전하게 처리", () => {
    expect(parseScopes(null).size).toBe(0);
    expect(parseScopes(undefined).size).toBe(0);
    expect(parseScopes("   ").size).toBe(0);
  });

  it("여러 공백/줄바꿈이 섞여도 정확히 분리", () => {
    const s = parseScopes(`openid   ${CALENDAR_SCOPE}\n`);
    expect([...s]).toEqual(["openid", CALENDAR_SCOPE]);
  });

  it("부분 권한(calendar.readonly)을 전체 권한으로 오인하지 않는다", () => {
    const readonly = parseScopes(
      "https://www.googleapis.com/auth/calendar.readonly",
    );
    expect(readonly.has(CALENDAR_SCOPE)).toBe(false);
    // 예전 substring 방식이었다면 통과했을 케이스
    expect("https://www.googleapis.com/auth/calendar.readonly".includes("auth/calendar")).toBe(true);
  });

  it("Phase 0 계정(캘린더 권한 없음)은 false", () => {
    const old = parseScopes(
      "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile openid",
    );
    expect(old.has(CALENDAR_SCOPE)).toBe(false);
  });
});

describe("hasScope", () => {
  it("재동의 후 실제로 내려오는 scope 문자열을 통과시킨다", () => {
    const granted =
      "openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/calendar";
    expect(hasScope(granted, CALENDAR_SCOPE)).toBe(true);
  });

  it("권한이 없으면 false", () => {
    expect(hasScope("openid", CALENDAR_SCOPE)).toBe(false);
    expect(hasScope(null, CALENDAR_SCOPE)).toBe(false);
  });
});
