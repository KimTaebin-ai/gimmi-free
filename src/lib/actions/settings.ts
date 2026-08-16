"use server";

import { requireUserId } from "@/lib/actions/auth-helpers";
import { getSettings, saveSettings, type AppSettings } from "@/lib/settings";

export async function loadSettings(): Promise<AppSettings> {
  return getSettings(await requireUserId());
}

export async function updateSettings(
  patch: Partial<AppSettings>,
): Promise<AppSettings> {
  return saveSettings(await requireUserId(), patch);
}
