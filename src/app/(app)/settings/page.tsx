import { auth, signIn } from "@/auth";
import { GoogleSettings } from "@/components/settings/google-settings";
import { TimezoneCard } from "@/components/settings/timezone-card";

export default async function SettingsPage() {
  const session = await auth();

  // 재동의: 로그아웃 없이 OAuth 흐름만 다시 태운다.
  // prompt=consent가 걸려 있어 동의 화면이 다시 뜨고, events.signIn이 새 토큰을 저장한다.
  async function reconnectGoogle() {
    "use server";
    await signIn("google", { redirectTo: "/settings" });
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">계정</h2>
        <p className="mt-2 text-sm text-muted-foreground">{session?.user?.email}</p>
      </section>

      <TimezoneCard />
      <GoogleSettings reconnectAction={reconnectGoogle} />
    </div>
  );
}
