"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CalendarDays,
  CheckSquare,
  Dumbbell,
  LayoutList,
  MoreHorizontal,
  Newspaper,
  Salad,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

// '오늘'은 태스크 페이지에서 스마트 리스트로 언제든 볼 수 있어 내비게이션에서 뺐다.
// (/today 라우트는 남아 있고 '더보기'에서 진입 가능)
const items = [
  { href: "/", label: "성장", icon: Sparkles },
  { href: "/tasks", label: "태스크", icon: CheckSquare },
  { href: "/calendar", label: "캘린더", icon: CalendarDays },
  { href: "/fitness", label: "피트니스", icon: Dumbbell },
  { href: "/diet", label: "식단", icon: Salad },
  { href: "/blog", label: "블로그", icon: Newspaper },
  { href: "/more", label: "더보기", icon: MoreHorizontal },
];

// 모바일 하단 탭바는 5개: 성장/태스크/캘린더/피트니스/더보기 (식단은 더보기에서)
const MOBILE_HREFS = ["/", "/tasks", "/calendar", "/fitness", "/more"];
const mobileItems = MOBILE_HREFS.map((h) => items.find((i) => i.href === h)!);

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 border-r bg-sidebar md:flex md:flex-col">
      <div className="flex items-center gap-2 px-4 py-4 font-semibold">
        <LayoutList className="size-5" />
        Life Hub
      </div>
      <nav className="flex flex-col gap-1 px-2">
        {items.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
              isActive(pathname, href) && "bg-accent text-accent-foreground",
            )}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}

export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur md:hidden">
      <div className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {mobileItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex flex-col items-center gap-1 py-2 text-[11px] text-muted-foreground",
              isActive(pathname, href) && "text-foreground",
            )}
          >
            <Icon className="size-5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
