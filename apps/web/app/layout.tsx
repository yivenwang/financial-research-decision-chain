import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Beacon｜研灯",
  description:
    "Evidence-first AI research infrastructure that connects sources, evidence, changes and decisions into a traceable workflow.",
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
