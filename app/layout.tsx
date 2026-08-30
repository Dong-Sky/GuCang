import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "./pwa-register";

export const metadata: Metadata = {
  title: "谷仓｜我们的收藏空间",
  description: "和家人一起整理、浏览和找回每一件谷子。",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/brand/icon-192.png",
    apple: "/brand/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
