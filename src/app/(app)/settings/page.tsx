import { auth } from "@/auth";
import { GoogleSettings } from "@/components/settings/google-settings";

export default async function SettingsPage() {
  const session = await auth();

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="rounded-lg border p-4">
        <h2 className="font-medium">계정</h2>
        <p className="mt-2 text-sm text-muted-foreground">{session?.user?.email}</p>
      </section>

      <GoogleSettings />
    </div>
  );
}
