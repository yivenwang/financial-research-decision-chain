import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beacon｜研灯 — Evidence before conclusion",
  description: "让变化被看见，让影响被理解，让决策有据可循。Beacon 将研究问题转化为可核验、可审核、可版本化的研究状态。",
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
