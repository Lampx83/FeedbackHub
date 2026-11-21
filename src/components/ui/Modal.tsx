"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button, Spinner, inputCls } from "./primitives";

const FOCUSABLE = 'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Các lớp phủ đang mở, lớp trên cùng ở cuối: chỉ lớp trên cùng nhận phím Esc/Tab. */
const overlayStack: symbol[] = [];

/** Khoá cuộn nền, đóng bằng Esc, giữ tiêu điểm trong lớp phủ và trả lại khi đóng. */
export function useOverlay(open: boolean, onClose: () => void, panel: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const el = panel.current;
    const me = Symbol("overlay");
    overlayStack.push(me);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Ưu tiên ô nhập đầu tiên; không có thì nút/liên kết đầu tiên; cuối cùng là chính khung.
    const first = el?.querySelector<HTMLElement>("input:not([disabled]),textarea:not([disabled]),select:not([disabled])") ?? el?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el)?.focus();
    function onKey(e: KeyboardEvent) {
      if (overlayStack[overlayStack.length - 1] !== me) return;
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !el) return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      if (!items.length) return;
      const a = items[0];
      const z = items[items.length - 1];
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault();
        z.focus();
      } else if (!e.shiftKey && document.activeElement === z) {
        e.preventDefault();
        a.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      overlayStack.splice(overlayStack.indexOf(me), 1);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open, panel]);
}

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg";
  /** Không đóng khi bấm nền — dùng cho hộp thoại chứa dữ liệu chỉ hiện một lần. */
  persistent?: boolean;
};

const SIZES = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl" } as const;

/** Hộp thoại dùng chung cho thêm/sửa — trang danh sách là chủ đạo, không đặt form thường trực. */
export function Modal({ open, onClose, title, description, children, footer, size = "md", persistent }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useOverlay(open, onClose, ref);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (!persistent && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`flex max-h-[92dvh] w-full ${SIZES[size]} flex-col rounded-t-2xl border border-line bg-surface shadow-2xl outline-none sm:rounded-2xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-semibold">
              {title}
            </h2>
            {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="-mr-1 rounded-md p-1 text-muted hover:bg-surface-2 hover:text-fg">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Nút "Thêm …" đặt sát mép phải thanh công cụ; bấm để mở hộp thoại. */
export function AddButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <Button onClick={onClick}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M12 5v14M5 12h14" />
      </svg>
      {children}
    </Button>
  );
}

type ConfirmProps = {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  /** Người dùng phải gõ đúng chuỗi này mới bấm xác nhận được (việc xoá không hoàn tác). */
  requireText?: string;
  /** Có ô nhập (vd. lý do); giá trị được truyền vào onConfirm. */
  inputLabel?: string;
  inputRequired?: boolean;
  inputInitial?: string;
  /** Trả về chuỗi = thông báo lỗi (hộp thoại giữ nguyên); không trả gì = thành công, bên gọi tự đóng. */
  onConfirm: (input: string) => Promise<string | void> | string | void;
  onCancel: () => void;
};

/** Thay cho confirm()/prompt() của trình duyệt. */
export function ConfirmDialog(p: ConfirmProps) {
  // Gắn key theo trạng thái mở để ô nhập/lỗi được đặt lại mỗi lần mở.
  return p.open ? <ConfirmInner {...p} /> : null;
}

function ConfirmInner({ title, message, confirmLabel = "Xác nhận", cancelLabel = "Huỷ", danger, requireText, inputLabel, inputRequired, inputInitial = "", onConfirm, onCancel }: ConfirmProps) {
  const [typed, setTyped] = useState("");
  const [input, setInput] = useState(inputInitial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const typedOk = !requireText || typed.trim() === requireText;
  const inputOk = !inputRequired || input.trim().length > 0;

  async function run() {
    if (!typedOk || !inputOk || busy) return;
    setBusy(true);
    setError(null);
    const r = await onConfirm(input.trim());
    setBusy(false);
    if (typeof r === "string") setError(r);
  }

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={run} disabled={!typedOk || !inputOk || busy}>
            {busy ? <Spinner /> : null}
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        {message ? <div className="text-sm leading-relaxed">{message}</div> : null}
        {inputLabel ? (
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{inputLabel}</span>
            <textarea className={`${inputCls} min-h-24`} value={input} onChange={(e) => setInput(e.target.value)} />
          </label>
        ) : null}
        {requireText ? (
          <label className="block text-sm">
            <span className="mb-1 block">
              Gõ lại <code className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] font-semibold">{requireText}</code> để xác nhận
            </span>
            <input className={inputCls} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="rounded-md bg-red-500/10 px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}
