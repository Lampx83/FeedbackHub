"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/**
 * Tải dữ liệu từ một route quản trị, tuỳ chọn làm mới định kỳ (chỉ khi tab đang hiện).
 * `reload()` ép tải lại ngay, vd. sau khi ghi.
 */
export function useLoader<T>(path: string, intervalMs = 0) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({ data: null, error: null });
  const run = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let alive = true;
    async function fetchNow() {
      const r = await api<T>(path);
      if (!alive) return;
      setState((s) => (r.ok ? { data: r.data, error: null } : { data: s.data, error: r.error }));
    }
    run.current = fetchNow;
    void fetchNow();
    const visible = () => document.visibilityState === "visible";
    const timer = intervalMs ? setInterval(() => visible() && void fetchNow(), intervalMs) : null;
    const onVis = () => intervalMs && visible() && void fetchNow();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [path, intervalMs]);

  const reload = useCallback(() => run.current(), []);
  return { data: state.data, error: state.error, reload };
}
