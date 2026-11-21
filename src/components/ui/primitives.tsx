"use client";

import { useEffect, useId, useRef, useState } from "react";
import { KIND_LABEL, STATUS_LABEL, type Kind, type Status } from "@/lib/status";

const inputBase =
  "rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted/70 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/30 disabled:cursor-not-allowed disabled:opacity-60";
export const inputCls = `w-full ${inputBase}`;
/** Mặc định rộng hết cỡ; lớp `w-…` do nơi dùng truyền vào thì thắng. */
const fieldCls = (extra: string) => `${/(^|\s)w-/.test(extra) ? "" : "w-full "}${inputBase} ${extra}`;

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md";
};

const VARIANTS = {
  primary: "bg-brand text-brand-fg hover:opacity-90",
  secondary: "border border-line bg-surface text-fg hover:bg-surface-2",
  danger: "bg-red-600 text-white hover:bg-red-700 dark:bg-red-500 dark:text-red-950 dark:hover:bg-red-400",
  ghost: "text-fg hover:bg-surface-2",
} as const;

export function Button({ variant = "primary", size = "md", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
        size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-2 text-sm"
      } ${VARIANTS[variant]} ${className}`}
      {...rest}
    />
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: React.ReactNode; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <label className="block">
        <span className="mb-1 block font-medium">{label}</span>
        {children}
      </label>
      {hint ? <p className="mt-1 text-[13px] leading-snug text-muted">{hint}</p> : null}
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

export const Input = ({ className = "", ...rest }: React.InputHTMLAttributes<HTMLInputElement>) => <input className={fieldCls(className)} {...rest} />;
export const Textarea = ({ className = "", ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea className={fieldCls(className)} {...rest} />;
export const Select = ({ className = "", ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) => <select className={fieldCls(className)} {...rest} />;

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative min-w-0 flex-1 sm:max-w-sm">
      <svg className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
        <circle cx="11" cy="11" r="7" />
        <path d="M20 20l-3.5-3.5" />
      </svg>
      <input type="search" aria-label={placeholder} className={`${inputCls} pl-9`} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}

/** Tiêu đề trang + đoạn mô tả chiếm hết bề ngang (không giới hạn max-w). */
export function PageHeader({ title, description, children }: { title: string; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {children}
      </div>
      {description ? <p className="mt-1.5 text-sm leading-relaxed text-muted">{description}</p> : null}
    </header>
  );
}

/** Hàng công cụ: bên trái (tìm kiếm/lọc) — bên phải (nút Thêm). */
export function Toolbar({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">{left}</div>
      {right ? <div className="ml-auto flex shrink-0 items-center gap-2">{right}</div> : null}
    </div>
  );
}

export function Card({ className = "", ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-xl border border-line bg-surface ${className}`} {...rest} />;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-line px-4 py-10 text-center">
      <p className="font-medium">{title}</p>
      {children ? <p className="mt-1 text-sm text-muted">{children}</p> : null}
    </div>
  );
}

const TONES = {
  info: "border-sky-500/40 bg-sky-500/10 text-sky-900 dark:text-sky-200",
  warn: "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200",
  error: "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200",
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-900 dark:text-emerald-200",
} as const;

export function Alert({ tone = "info", children, className = "" }: { tone?: keyof typeof TONES; children: React.ReactNode; className?: string }) {
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-3 py-2 text-sm leading-snug ${TONES[tone]} ${className}`}>
      {children}
    </div>
  );
}

export function Badge({ className = "", ...rest }: React.HTMLAttributes<HTMLSpanElement>) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${className}`} {...rest} />;
}

const STATUS_CLS: Record<Status, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-400/15 dark:text-amber-300",
  reviewing: "bg-sky-100 text-sky-900 dark:bg-sky-400/15 dark:text-sky-300",
  deploying: "bg-violet-100 text-violet-900 dark:bg-violet-400/15 dark:text-violet-300",
  awaiting_user: "bg-orange-100 text-orange-900 dark:bg-orange-400/15 dark:text-orange-300",
  done: "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/15 dark:text-emerald-300",
  rejected: "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300",
};

export function StatusBadge({ status }: { status: string }) {
  const known = status in STATUS_LABEL;
  return <Badge className={known ? STATUS_CLS[status as Status] : "bg-zinc-200 text-zinc-800 dark:bg-zinc-500/20 dark:text-zinc-300"}>{known ? STATUS_LABEL[status as Status] : status}</Badge>;
}

export function KindBadge({ kind }: { kind: string }) {
  return <Badge className="bg-surface-2 text-muted ring-1 ring-inset ring-line">{kind in KIND_LABEL ? KIND_LABEL[kind as Kind] : kind}</Badge>;
}

export function Switch({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 text-sm">
        <label htmlFor={id} className="font-medium">
          {label}
        </label>
        {description ? <p className="mt-0.5 text-[13px] leading-snug text-muted">{description}</p> : null}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition disabled:opacity-50 ${checked ? "bg-brand" : "bg-zinc-400/60 dark:bg-zinc-600"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** Ô nhập danh sách chuỗi (Enter hoặc dấu phẩy để thêm). `validate` trả thông báo lỗi nếu giá trị sai. */
export function TagsInput({ value, onChange, placeholder, validate }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string; validate?: (v: string) => string | null }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  function commit(raw: string) {
    const parts = raw.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...value];
    for (const part of parts) {
      const err = validate?.(part) ?? null;
      if (err) {
        setError(err);
        setDraft(part);
        onChange(next);
        return;
      }
      if (!next.includes(part)) next.push(part);
    }
    setError(null);
    setDraft("");
    onChange(next);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 rounded-lg border border-line bg-surface p-1.5 focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/30">
        {value.map((t) => (
          <span key={t} className="inline-flex max-w-full items-center gap-1 rounded-md bg-surface-2 py-0.5 pl-2 pr-1 text-[13px]">
            <span className="truncate">{t}</span>
            <button type="button" aria-label={`Bỏ ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="rounded p-0.5 text-muted hover:bg-line hover:text-fg">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && !draft && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => draft.trim() && commit(draft)}
          placeholder={value.length ? "" : placeholder}
          className="min-w-32 flex-1 bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted/70"
        />
      </div>
      {error ? <p className="mt-1 text-[13px] text-danger">{error}</p> : null}
    </div>
  );
}

/** Sao chép vào bộ nhớ tạm; nếu trình duyệt chặn thì chọn sẵn văn bản để người dùng tự chép. */
export function CopyButton({ text, label = "Sao chép", size = "sm" }: { text: string; label?: string; size?: "sm" | "md" }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setState("ok");
    } catch {
      setState("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }
  return (
    <Button variant="secondary" size={size} onClick={copy}>
      {state === "ok" ? "Đã chép" : state === "fail" ? "Không chép được" : label}
    </Button>
  );
}

/** Khối mã có nút sao chép. */
export function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface-2">
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-1.5">
        <span className="text-xs text-muted">{label ?? "Mã"}</span>
        <CopyButton text={code} />
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[12.5px] leading-relaxed">{code}</pre>
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const bar = useRef<HTMLDivElement>(null);
  // Trên điện thoại thanh tab cuộn ngang: đưa tab đang chọn vào giữa tầm nhìn (chỉ cuộn trong thanh, không cuộn trang).
  useEffect(() => {
    const el = bar.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    const box = bar.current;
    if (el && box) box.scrollTo({ left: el.offsetLeft - (box.clientWidth - el.offsetWidth) / 2 });
  }, [value]);
  return (
    <div ref={bar} role="tablist" className="no-scrollbar relative -mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-line px-1">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          type="button"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${
            value === t.id ? "border-brand text-fg" : "border-transparent text-muted hover:text-fg"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
