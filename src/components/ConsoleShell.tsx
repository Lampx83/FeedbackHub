"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "./api";

const NAV: readonly { href: string; label: string; icon: string; superOnly?: boolean }[] = [
  { href: "/", label: "Tổng quan", icon: "M3 11l9-8 9 8v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1V11z" },
  { href: "/board", label: "Góp ý", icon: "M4 5h16v11H8l-4 4V5z" },
  { href: "/keys", label: "Khoá operator", icon: "M15 7a4 4 0 1 1-3.9 4.9L4 19v2h3v-2h2v-2h2l1.9-1.9A4 4 0 0 1 15 7z", superOnly: true },
  { href: "/users", label: "Tài khoản", icon: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0zM4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1", superOnly: true },
];

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" || path.startsWith("/projects") : path.startsWith(href);
}

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
}

export function ConsoleShell({ adminName, adminEmail, superAdmin, children }: { adminName: string; adminEmail: string; superAdmin: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await api("/api/admin/logout", { method: "POST", body: {} });
    router.replace("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Điều hướng chính">
      {NAV.filter((n) => superAdmin || !n.superOnly).map((n) => {
        const active = isActive(path, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition ${
              active ? "bg-brand/12 text-brand" : "text-muted hover:bg-surface-2 hover:text-fg"
            }`}
          >
            <Icon d={n.icon} />
            {n.label}
          </Link>
        );
      })}
      <div className="mt-auto border-t border-line pt-3">
        <Link href="/account" onClick={() => setOpen(false)} aria-current={path.startsWith("/account") ? "page" : undefined} className={`mb-1 block rounded-lg px-3 py-2 text-xs leading-snug transition hover:bg-surface-2 ${path.startsWith("/account") ? "bg-brand/12" : ""}`} title="Tài khoản của tôi: đổi mật khẩu, xem dự án được gán">
          <div className="truncate text-sm font-medium">{adminName}</div>
          <div className="truncate text-muted">{adminEmail}</div>
          <div className="mt-0.5 text-muted">{superAdmin ? "Quản trị toàn hub" : "Quản trị theo dự án"}</div>
        </Link>
        <button type="button" onClick={logout} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-fg">
          <Icon d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4M16 17l5-5-5-5M21 12H9" />
          Đăng xuất
        </button>
      </div>
    </nav>
  );

  return (
    <div className="min-h-dvh md:flex">
      {/* Thanh đầu trang trên điện thoại */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2.5 md:hidden">
        <span className="font-semibold">Feedback Hub</span>
        <button type="button" aria-label="Mở menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="rounded-md p-1.5 hover:bg-surface-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d={open ? "M6 6l12 12M18 6L6 18" : "M4 7h16M4 12h16M4 17h16"} />
          </svg>
        </button>
      </div>
      {open ? <div className="border-b border-line bg-surface md:hidden">{nav}</div> : null}

      {/* Thanh bên trên máy tính */}
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-5 py-4 text-base font-semibold tracking-tight">Feedback Hub</div>
        {nav}
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
