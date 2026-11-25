"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/base-path";
import { api } from "./api";
import { timeAgo } from "./format";
import { useLoader } from "./useLoader";
import { KIND_LABEL } from "@/lib/status";

type Item = { key: string; type: "new" | "reply"; id: string; title: string; kind: string; by: string; at: string; unread: boolean; project: { slug: string; name: string } };
type Feed = { unread: number; items: Item[] };

const LS_DESKTOP = "hub-desktop-notify";
const urlB64 = (b: string) => {
  const raw = atob((b + "=".repeat((4 - (b.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const pushSupported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator && typeof PushManager !== "undefined" && typeof Notification !== "undefined";
const safeGet = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const safeSet = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } };

/** Chuông thông báo: số chưa đọc, danh sách góp ý mới / trả lời, và thông báo trên màn hình (tuỳ chọn, do trình duyệt cho phép). */
export function NotificationBell() {
  const path = usePathname();
  const { data, reload } = useLoader<Feed>("/api/admin/notifications", 20000);
  const [open, setOpen] = useState(false);
  // Chỉ dùng bên trong khung đã mở (không có trong HTML ban đầu) nên khác nhau giữa máy chủ/trình duyệt không gây lệch hydration.
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">(() => (typeof Notification === "undefined" ? "unsupported" : Notification.permission));
  const [desktopOn, setDesktopOn] = useState(() => safeGet(LS_DESKTOP) === "1");
  // Thông báo đẩy (Web Push): tới cả khi đã đóng mọi tab. Máy chủ chỉ bật khi có khoá VAPID.
  const push = useLoader<{ enabled: boolean; publicKey?: string }>("/api/admin/push");
  const [pushOn, setPushOn] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushErr, setPushErr] = useState<string | null>(null);
  const prev = useRef<Set<string> | null>(null);
  const wasOpen = useRef(false);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!pushSupported() || !push.data?.enabled) return;
    let alive = true;
    void (async () => {
      const reg = await navigator.serviceWorker.getRegistration(withBase("/"));
      const sub = await reg?.pushManager.getSubscription();
      if (alive) setPushOn(Boolean(sub) && Notification.permission === "granted");
    })().catch(() => {});
    return () => { alive = false; };
  }, [push.data?.enabled]);

  // Tiêu đề tab "(3) …" để thấy ngay cả khi đang ở tab khác. Mỗi lần chuyển trang Next đặt lại tiêu đề nên áp lại.
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\)\s/, "");
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
  }, [unread, path]);

  // Thông báo trên màn hình khi có mục chưa đọc MỚI xuất hiện (không báo lại các mục đã thấy).
  useEffect(() => {
    if (!data) return;
    const ids = new Set(data.items.map((i) => i.key));
    if (prev.current && desktopOn && perm === "granted" && !pushOn) {
      for (const it of data.items.filter((i) => i.unread && !prev.current!.has(i.key)).slice(0, 3)) {
        try {
          const label = it.type === "reply" ? "Trả lời mới" : it.kind === "bug" ? "Báo lỗi mới" : "Góp ý mới";
          new Notification(`${label} · ${it.project.name}`, { body: it.title.slice(0, 140), tag: it.key });
        } catch { /* một số trình duyệt chỉ cho Notification qua service worker */ }
      }
    }
    prev.current = ids;
  }, [data, desktopOn, perm, pushOn]);

  // Đóng khung thì coi như đã đọc.
  useEffect(() => {
    if (wasOpen.current && !open && unread > 0) void api("/api/admin/notifications/seen", { method: "POST", body: {} }).then(() => reload());
    wasOpen.current = open;
  }, [open, unread, reload]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function enableDesktop() {
    if (typeof Notification === "undefined") return;
    const r = await Notification.requestPermission();
    setPerm(r);
    const on = r === "granted";
    setDesktopOn(on);
    safeSet(LS_DESKTOP, on ? "1" : "0");
  }
  async function enablePush() {
    if (!push.data?.publicKey) return;
    setPushBusy(true);
    setPushErr(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Trình duyệt chưa cho phép thông báo.");
      setPerm("granted");
      const reg = await navigator.serviceWorker.register(withBase("/sw.js"), { scope: withBase("/") });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(push.data.publicKey) }));
      const r = await api("/api/admin/push", { method: "POST", body: sub.toJSON() });
      if (!r.ok) throw new Error(r.error);
      setPushOn(true);
    } catch (e) {
      setPushErr(e instanceof Error ? e.message : "Không bật được thông báo đẩy.");
    }
    setPushBusy(false);
  }
  async function disablePush() {
    setPushBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration(withBase("/"));
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await api("/api/admin/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setPushOn(false);
    } catch { /* bỏ qua */ }
    setPushBusy(false);
  }
  function disableDesktop() {
    setDesktopOn(false);
    safeSet(LS_DESKTOP, "0");
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : "Thông báo"}
        aria-expanded={open}
        className="relative rounded-md p-1.5 text-muted transition hover:bg-surface-2 hover:text-fg"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 min-w-[1.1rem] rounded-full bg-danger px-1 text-center text-[11px] font-semibold leading-[1.1rem] text-white">{unread > 99 ? "99+" : unread}</span> : null}
      </button>
      {open ? (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div role="dialog" aria-label="Thông báo" className="fixed left-3 top-14 z-50 flex max-h-[75dvh] w-[min(23rem,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-xl border border-line bg-surface shadow-2xl md:left-60 md:top-3">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Thông báo</h2>
              <Link href="/board" onClick={() => setOpen(false)} className="text-[13px] font-medium text-brand hover:underline">Mở bảng góp ý</Link>
            </div>
            <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto">
              {!data ? <li className="px-4 py-6 text-center text-sm text-muted">Đang tải…</li> : null}
              {data && data.items.length === 0 ? <li className="px-4 py-6 text-center text-sm text-muted">Chưa có góp ý nào trong 30 ngày qua.</li> : null}
              {data?.items.map((it) => (
                <li key={it.key}>
                  <Link href={`/board?project=${encodeURIComponent(it.project.slug)}&id=${it.id}`} onClick={() => setOpen(false)} className={`block px-4 py-2.5 hover:bg-surface-2 ${it.unread ? "bg-brand/8" : ""}`}>
                    <div className="flex items-center gap-2 text-[12px] text-muted">
                      {it.unread ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="chưa đọc" /> : null}
                      <span className="font-medium text-fg/80">{it.type === "reply" ? "Trả lời mới" : it.kind === "bug" ? "Báo lỗi mới" : "Góp ý mới"}</span>
                      <span>· {KIND_LABEL[it.kind as keyof typeof KIND_LABEL] ?? it.kind}</span>
                      <span className="ml-auto" suppressHydrationWarning>{timeAgo(it.at)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 break-words text-sm leading-snug">{it.title}</div>
                    <div className="mt-0.5 text-[12px] text-muted">{it.project.name} · {it.by}</div>
                  </Link>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-4 py-2.5 text-[13px]">
              {push.data?.enabled && pushSupported() ? (
                <div className="mb-2 border-b border-line pb-2">
                  {pushOn ? (
                    <button type="button" disabled={pushBusy} onClick={() => void disablePush()} className="text-muted hover:text-fg hover:underline">Đang nhận thông báo đẩy trên thiết bị này · Tắt</button>
                  ) : (
                    <button type="button" disabled={pushBusy} onClick={() => void enablePush()} className="font-medium text-brand hover:underline">{pushBusy ? "Đang bật…" : "Bật thông báo đẩy (nhận cả khi đóng tab)"}</button>
                  )}
                  {pushErr ? <p className="mt-1 text-[12px] text-danger">{pushErr}</p> : null}
                </div>
              ) : null}
              {perm === "unsupported" ? (
                <span className="text-muted">Trình duyệt này không hỗ trợ thông báo trên màn hình.</span>
              ) : perm === "denied" ? (
                <span className="text-muted">Thông báo trên màn hình đang bị chặn trong cài đặt trình duyệt.</span>
              ) : desktopOn && perm === "granted" ? (
                <button type="button" onClick={disableDesktop} className="text-muted hover:text-fg hover:underline">Đang bật thông báo trên màn hình · Tắt</button>
              ) : (
                <button type="button" onClick={() => void enableDesktop()} className="font-medium text-brand hover:underline">Bật thông báo trên màn hình</button>
              )}
              <p className="mt-1 text-[12px] text-muted">Thông báo trên màn hình chỉ hiện khi hub đang mở trong một tab. Để nhận cả khi đóng, bật thông báo đẩy ở trên, hoặc email/webhook ở cài đặt dự án → tab “Thông báo”.</p>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
