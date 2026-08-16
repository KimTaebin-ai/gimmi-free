import Link from "next/link";
import { CheckSquare, ChevronRight, Mail, Settings } from "lucide-react";

const links = [
  { href: "/tasks", label: "태스크", icon: CheckSquare, desc: "리스트·태그·스마트 리스트" },
  { href: "/mail", label: "메일", icon: Mail, desc: "Phase 5에서 구현" },
  { href: "/settings", label: "설정", icon: Settings, desc: "Phase 6에서 구현" },
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
