import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "谷仓｜我们的收藏空间",
  description: "和家人一起整理、浏览和找回每一件谷子。",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
