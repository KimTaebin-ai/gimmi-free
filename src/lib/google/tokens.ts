import "server-only";
import { prisma } from "@/lib/prisma";
import { CALENDAR_SCOPE, parseScopes } from "@/lib/google/scopes";

export { CALENDAR_SCOPE };

/** Google 연동이 끊겼을 때(리프레시 실패 등) — UI에서 재연결을 안내한다. */
export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const EXPIRY_BUFFER_SEC = 60; // 만료 직전이면 미리 갱신

interface RefreshResponse {
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
  refresh_token?: string;
}

/**
 * 유효한 Google access token을 반환한다. 만료됐으면 refresh_token으로 갱신하고
 * 새 토큰을 Account에 저장한다.
 *
 * OAuth 동의화면이 Testing 상태면 refresh_token이 7일 뒤 만료될 수 있다.
 * 그 경우 GoogleAuthError를 던지고, 사용자는 다시 로그인해 재동의해야 한다.
 */
export async function getGoogleAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
  });
  if (!account) throw new GoogleAuthError("Google 계정이 연결되어 있지 않습니다");

  const nowSec = Math.floor(Date.now() / 1000);
  const stillValid =
    account.access_token && account.expires_at && account.expires_at - EXPIRY_BUFFER_SEC > nowSec;
  if (stillValid) return account.access_token!;

  if (!account.refresh_token) {
    throw new GoogleAuthError(
      "refresh token이 없습니다. Google 계정을 다시 연결해 주세요.",
    );
  }

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    // invalid_grant = refresh token 만료/취소 → 재동의 필요
    throw new GoogleAuthError(
      `토큰 갱신 실패 (${res.status}). Google 계정을 다시 연결해 주세요. ${body.slice(0, 200)}`,
    );
  }

  const data = (await res.json()) as RefreshResponse;
  await prisma.account.update({
    where: { id: account.id },
    data: {
      access_token: data.access_token,
      expires_at: nowSec + data.expires_in,
      scope: data.scope ?? account.scope,
      // Google은 보통 refresh_token을 다시 주지 않는다. 주면 갱신.
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    },
  });

  return data.access_token;
}

/** 현재 계정에 실제로 부여된 scope 목록 (설정 화면 진단용) */
export async function getGrantedScopes(userId: string): Promise<string[]> {
  const account = await prisma.account.findFirst({
    where: { userId, provider: "google" },
    select: { scope: true },
  });
  return [...parseScopes(account?.scope)];
}

/** 현재 계정이 Calendar 쓰기 권한을 가지고 있는지 (재동의 안내용) */
export async function hasCalendarScope(userId: string): Promise<boolean> {
  return (await getGrantedScopes(userId)).includes(CALENDAR_SCOPE);
}
