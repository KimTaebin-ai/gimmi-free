import { auth } from "@/auth";

/**
 * 성장 요약은 임베딩 + Claude 호출이라 오래 걸린다. 이 화면의 서버 액션이 `after()`로
 * 이어 돌리는 작업까지 살아 있어야 하므로 함수 수명을 넉넉히 잡는다.
 * (그래도 못 끝내면 growth-job.ts의 오래된 작업 정리가 실패로 표시한다.)
 */
export const maxDuration = 300;

import { GrowthView } from "@/components/growth/growth-view";

export default async function HomePage() {
  const session = await auth();
  return <GrowthView userName={session?.user?.name?.split(" ")[0] ?? ""} />;
}
