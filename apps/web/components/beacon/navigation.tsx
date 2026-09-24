"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleDot, FileSearch, GitCompareArrows, History, House } from "lucide-react";

const nav = [
  { href: "/", label: "首页", icon: House },
  { href: "/questions", label: "提问", icon: CircleDot },
  { href: "/changes", label: "变更", icon: GitCompareArrows },
  { href: "/evidence", label: "证据", icon: FileSearch },
  { href: "/versions", label: "版本", icon: History },
];

export function BeaconNavigation() {
  const pathname = usePathname();
  return (
    <nav aria-label="产品导航" className="flex items-center gap-1 overflow-x-auto whitespace-nowrap py-2 lg:py-0">
      {nav.map(({ href, label, icon: Icon }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6feb] ${active ? "bg-[#eaf2ff] text-[#175eb8]" : "text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#111827]"}`}
          >
            <Icon aria-hidden="true" className="size-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
