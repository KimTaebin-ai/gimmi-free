import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Sidebar, BottomTabBar } from "@/components/app-nav";
import { Providers } from "@/components/providers";
import { Button } from "@/components/ui/button";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // proxy가 1차로 걸러주지만, 데이터에 가까운 곳에서 한 번 더 검증한다.
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Providers>
      <div className="flex h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-end gap-2 border-b px-4 py-2">
            <span className="text-sm text-muted-foreground">
              {session.user.email}
            </span>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <Button variant="ghost" size="sm" type="submit">
                로그아웃
              </Button>
            </form>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">
            {children}
          </main>
        </div>
        <BottomTabBar />
      </div>
    </Providers>
  );
}
