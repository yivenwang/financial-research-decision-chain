import Link from "next/link";
import { BrandMark } from "./brand-mark";
import { BeaconNavigation } from "./navigation";
import { ResearchContext } from "./research-context";

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
        <div className="mx-auto flex max-w-[1480px] flex-col gap-1 px-4 py-2 sm:px-6 lg:min-h-16 lg:flex-row lg:items-center lg:justify-between lg:gap-6 lg:py-0">
          <Link href="/" aria-label="Beacon 研灯首页" className="flex w-fit items-center gap-3 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1f6feb]">
            <BrandMark className="size-9" />
            <div>
              <p className="text-sm font-semibold tracking-tight">Beacon｜研灯</p>
              <p className="text-[11px] text-[#6b7280]">Research state & decision change control</p>
            </div>
          </Link>
          <BeaconNavigation />
        </div>
      </header>

      <div className="mx-auto max-w-[1480px] px-4 py-7 sm:px-6 lg:py-9">
        <section className="mb-7 border-b border-[#e5e7eb] pb-6">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#1f6feb]">{eyebrow}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[#111827] sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#6b7280]">{description}</p>
        </section>
        <ResearchContext />
        {children}
      </div>
    </main>
  );
}
