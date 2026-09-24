import Link from "next/link";
import { CircleDot, FileSearch, GitCompareArrows, History, House } from "lucide-react";

const nav = [
  { href: "/", label: "Workspace", icon: House },
  { href: "/questions", label: "Ask", icon: CircleDot },
  { href: "/changes", label: "Changes", icon: GitCompareArrows },
  { href: "/evidence", label: "Evidence", icon: FileSearch },
  { href: "/versions", label: "Versions", icon: History },
];

export function BeaconShell({
  children,
  eyebrow,
  title,
  description,
}: {
  children: React.ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <main className="min-h-screen bg-[#f8fafc] text-[#111827]">
      <header className="sticky top-0 z-40 border-b border-[#d1d5db] bg-white/95 backdrop-blur">
        <div className="mx-auto flex min-h-16 max-w-[1480px] items-center justify-between gap-6 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-lg bg-[#1f6feb] text-sm font-bold text-white">B</div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Beacon｜研灯</p>
              <p className="text-[11px] text-[#6b7280]">Research state & decision change control</p>
            </div>
          </Link>
          <nav className="hidden items-center gap-1 lg:flex">
            {nav.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-[#374151] hover:bg-[#f3f4f6] hover:text-[#111827]">
                <Icon className="size-4" />
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:py-9">
        <section className="mb-7 border-b border-[#e5e7eb] pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f6feb]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b7280]">{description}</p>
        </section>
        {children}
      </div>
    </main>
  );
}
