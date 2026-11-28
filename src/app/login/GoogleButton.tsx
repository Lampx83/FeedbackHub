"use client";

import { useEffect, useRef } from "react";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential?: string }) => void }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Không tải được Google Sign-In"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/** Nút "Đăng nhập bằng Google" của chính Google (Google Identity Services). Chỉ chạy được trên https hoặc localhost. */
export function GoogleButton({ clientId, onCredential, onError }: { clientId: string; onCredential: (credential: string) => void; onError: (message: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onCredential, onError });
  useEffect(() => {
    handlers.current = { onCredential, onError };
  });

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        const gid = window.google?.accounts?.id;
        if (cancelled || !gid || !host.current) return;
        gid.initialize({ client_id: clientId, callback: (r) => r.credential && handlers.current.onCredential(r.credential) });
        gid.renderButton(host.current, { type: "standard", theme: "outline", size: "large", text: "signin_with", shape: "rectangular", width: 320, locale: "vi" });
      })
      .catch((e: Error) => handlers.current.onError(e.message));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={host} className="flex min-h-[44px] justify-center" />;
}
