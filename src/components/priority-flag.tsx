import { cn } from "@/lib/utils";
import { PRIORITY_STYLES } from "@/lib/task-colors";

/**
 * 우선순위 표시. 색은 "어떤 태스크인지"(식별)에 쓰이므로,
 * 우선순위는 목록·캘린더 어디서나 같은 깃발 아이콘으로만 나타낸다.
 * 우선순위 없음(0)이면 아무것도 그리지 않는다.
 */
export function PriorityFlag({
  priority,
  className,
}: {
  priority: number;
  className?: string;
}) {
  const style = PRIORITY_STYLES[priority] ?? PRIORITY_STYLES[0];
  const Icon = style.icon;
  if (!Icon) return null;
  return (
    <Icon
      className={cn("shrink-0", style.className, className)}
      aria-label={`우선순위 ${style.label}`}
    />
  );
}
