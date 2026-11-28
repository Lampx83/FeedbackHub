import type { Metadata, Viewport } from "next";
import { hubName } from "@/lib/env";
import "./globals.css";

// Đọc tên lúc chạy (HUB_NAME), không đóng băng lúc dựng.
export const dynamic = "force-dynamic";
export function generateMetadata(): Metadata {
  const n = hubName();
  return { title: { default: `${n} — Bảng điều khiển`, template: `%s — ${n}` } };
}
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
