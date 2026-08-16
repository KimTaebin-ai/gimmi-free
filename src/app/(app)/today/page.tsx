import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { auth } from "@/auth";
import { TodayTasks } from "@/components/tasks/today-tasks";

export default async function TodayPage() {
  const session = await auth();
  const name = session?.user?.name?.split(" ")[0] ?? "";

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <div>
        <h1 className="text-2xl font-bold">오늘</h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "M월 d일 EEEE", { locale: ko })}
          {name && ` · ${name}님, 오늘도 화이팅!`}
        </p>
      </div>
      <TodayTasks />
    </div>
  );
}
