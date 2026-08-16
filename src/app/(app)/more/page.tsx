import Link from "next/link";
import { ChevronRight, Mail, Salad, Settings, Sun } from "lucide-react";

const links = [
  { href: "/today", label: "오늘", icon: Sun, desc: "오늘 할 일과 일정만 모아 보기" },
  { href: "/diet", label: "식단", icon: Salad, desc: "Phase 4에서 구현" },
  { href: "/mail", label: "메일", icon: Mail, desc: "Phase 5에서 구현" },
  { href: "/settings", label: "설정", icon: Settings, desc: "시간대, Google 연동" },
];

export default function MorePage() {
  return (
    <div className="mx-auto max-w-3xl p-4">
      <h1 className="mb-4 text-2xl font-bold">더보기</h1>
      <div className="divide-y rounded-lg border">
        {links.map(({ href, label, icon: Icon, desc }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
          >
            <Icon className="size-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
