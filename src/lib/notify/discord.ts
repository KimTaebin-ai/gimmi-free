import "server-only";

/**
 * 디스코드 웹훅 전송.
 *
 * 봇이 아니라 웹훅을 쓴다 — 알림을 한 방향으로 던지기만 하면 되는데 봇은 토큰 관리와
 * 게이트웨이 연결이 따라붙는다. 웹훅 URL 하나면 끝이고, 이 앱은 사용자가 한 명이다.
 *
 * 키가 없으면 조용히 넘어간다(`getClaude()`·Voyage와 같은 규칙) — 알림이 없다고
 * 앱이 멈출 이유는 없다.
 */

export function hasDiscordWebhook(): boolean {
  return !!process.env.DISCORD_WEBHOOK_URL?.trim();
}

export class DiscordError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscordError";
  }
}

/** 디스코드 메시지 길이 상한. 넘기면 400이 온다. */
const MAX_CONTENT = 2000;

export async function sendDiscordMessage(content: string): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL?.trim();
  if (!url) throw new DiscordError("DISCORD_WEBHOOK_URL이 설정되어 있지 않습니다.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "Life Hub",
      content: content.slice(0, MAX_CONTENT),
      // 알림 문구에 사용자가 쓴 제목이 들어간다. @everyone 같은 게 섞여도
      // 실제로 멘션이 울리지 않게 막는다.
      allowed_mentions: { parse: [] },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new DiscordError(
      res.status === 401 || res.status === 404
        ? "디스코드 웹훅 URL이 올바르지 않습니다. 채널 설정에서 다시 만들어 주세요."
        : `디스코드 전송 실패 (HTTP ${res.status}). ${detail.slice(0, 200)}`,
    );
  }
}
