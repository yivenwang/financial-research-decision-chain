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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
