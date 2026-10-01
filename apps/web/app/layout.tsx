import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "安克创新研究决策链 MVP",
  description: "将来源、证据、论点、假设、确定性计算与研究决策串成可追溯更新闭环。",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  robots: { index: false, follow: false, nocache: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">
        {children}
        <div aria-hidden="true" className="pointer-events-none fixed bottom-3 right-3 z-[9999] rounded-md border border-amber-300/25 bg-slate-950/85 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-amber-100 shadow-lg backdrop-blur">内部审验 · 禁止转发复制</div>
      </body>
    </html>
  );
}
