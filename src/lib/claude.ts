import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude API 클라이언트.
 * 키가 없으면 null을 돌려주고, 호출부는 기능을 끄되 앱은 계속 동작하게 한다.
 */
export const CLAUDE_MODEL = "claude-opus-5";

let cached: Anthropic | null | undefined;

export function getClaude(): Anthropic | null {
  if (cached !== undefined) return cached;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  cached = apiKey ? new Anthropic({ apiKey }) : null;
  return cached;
}

export function hasClaudeKey(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
