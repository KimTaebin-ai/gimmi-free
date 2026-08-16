import { auth } from "@/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function TodayPage() {
  const session = await auth();

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">
        안녕하세요, {session?.user?.name ?? "사용자"}님 👋
      </h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>오늘 할 일</CardTitle>
            <CardDescription>Phase 1에서 태스크 관리가 추가됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            아직 태스크가 없어요.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>오늘 일정</CardTitle>
            <CardDescription>Phase 2에서 Google Calendar가 연동됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            연동된 일정이 없어요.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>운동</CardTitle>
            <CardDescription>Phase 3에서 루틴/체성분 기록이 추가됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            기록이 없어요.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>식단</CardTitle>
            <CardDescription>Phase 4에서 끼니/매크로 기록이 추가됩니다.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            기록이 없어요.
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
