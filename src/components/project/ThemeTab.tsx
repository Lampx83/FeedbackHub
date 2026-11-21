"use client";

import { useState } from "react";
import { Alert, Card, Field, Input, Select } from "../ui/primitives";
import { SaveBar, useSaveBar } from "./SaveBar";
import { FONTS, ICONS, POSITIONS, parseTheme, type Theme } from "@/lib/theme";
import type { ProjectData, Save } from "./types";

type ColorKey = "primary" | "primaryText" | "bg" | "fg" | "border";

// Giá trị dùng CHỈ cho khung xem trước khi chưa đặt; nút nổi thật có mặc định riêng.
const LIGHT = { primary: "#2a55e0", primaryText: "#ffffff", bg: "#ffffff", fg: "#14171c", border: "#dde1e8" } as const;
const DARK = { primary: "#2a55e0", primaryText: "#ffffff", bg: "#171a20", fg: "#e9ecf1", border: "#2d333d" } as const;

const COLOR_FIELDS: { key: ColorKey; label: string; hint: string }[] = [
  { key: "primary", label: "Màu chính", hint: "Nền nút nổi và nút Gửi." },
  { key: "primaryText", label: "Chữ trên nút", hint: "Chữ và biểu tượng nằm trên màu chính." },
  { key: "bg", label: "Màu nền", hint: "Nền của ngăn kéo góp ý." },
  { key: "fg", label: "Màu chữ", hint: "Chữ trong ngăn kéo." },
  { key: "border", label: "Màu viền", hint: "Viền ngăn kéo và các ô nhập." },
];

const FONT_LABEL: Record<string, string> = { inherit: "Theo trang của ứng dụng", system: "Phông hệ thống", serif: "Có chân (serif)", mono: "Đơn cách (mono)" };
const FONT_CSS: Record<string, string> = { inherit: "inherit", system: "system-ui, sans-serif", serif: "Georgia, 'Times New Roman', serif", mono: "ui-monospace, Menlo, Consolas, monospace" };
const POSITION_LABEL: Record<string, string> = { "bottom-right": "Dưới bên phải", "bottom-left": "Dưới bên trái", "top-right": "Trên bên phải", "top-left": "Trên bên trái" };
const ICON_LABEL: Record<string, string> = { lightbulb: "Bóng đèn", chat: "Hội thoại", pencil: "Bút", flag: "Cờ", plus: "Dấu cộng" };
const ICON_PATH: Record<string, string> = {
  lightbulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z",
  chat: "M4 5h16v11H8l-4 4V5z",
  pencil: "M4 20h4L19 9l-4-4L4 16v4z",
  flag: "M5 21V4M5 4h11l-2 4 2 4H5",
  plus: "M12 5v14M5 12h14",
};

const hex6 = (v: string) => (/^#[0-9a-f]{6}$/i.test(v) ? v : /^#[0-9a-f]{3}$/i.test(v) ? "#" + v.slice(1).split("").map((c) => c + c).join("") : "#000000");

/** Lỗi của MỘT trường, dùng chính bộ kiểm của hub để khỏi lệch luật. */
function fieldError(key: keyof Theme, value: unknown): string | null {
  if (value === undefined) return null;
  const r = parseTheme({ [key]: value });
  return r.ok ? null : r.error.replace(/^[^:]+:\s*/, "");
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function ThemeTab({ project, save, warnings }: { project: ProjectData; save: Save; warnings: string[] }) {
  const [draft, setDraft] = useState<Theme>(project.theme);
  const bar = useSaveBar(save);
  const dirty = !same(draft, project.theme);

  function set<K extends keyof Theme>(key: K, value: Theme[K] | "" | undefined) {
    setDraft((d) => {
      const next = { ...d };
      if (value === undefined || value === "" || (typeof value === "number" && Number.isNaN(value))) delete next[key];
      else next[key] = value as Theme[K];
      return next;
    });
  }

  const errors = (Object.keys(draft) as (keyof Theme)[]).filter((k) => k !== "strings").map((k) => [k, fieldError(k, draft[k])] as const).filter(([, e]) => e);
  const whole = parseTheme(draft);

  return (
    <div className="space-y-6">
      {warnings.length > 0 ? (
        <Alert tone="warn">
          <strong className="block">Cảnh báo tương phản (vẫn lưu được)</strong>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card className="p-5">
          <h2 className="text-base font-semibold">Giao diện nút nổi</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Trường để trống thì nút nổi dùng mặc định của nó. Chỉ nhận các giá trị an toàn (màu, độ dài, lựa chọn có sẵn), không nhận CSS tự do.</p>

          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Màu sắc</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {COLOR_FIELDS.map((f) => (
              <ColorField key={f.key} label={f.label} hint={f.hint} value={draft[f.key]} placeholder={LIGHT[f.key]} onChange={(v) => set(f.key, v)} error={fieldError(f.key, draft[f.key])} />
            ))}
          </div>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Hình dạng và chữ</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bo góc" error={fieldError("radius", draft.radius)} hint="Có đơn vị: px, rem, em hoặc %. Ví dụ 12px.">
              <Input value={draft.radius ?? ""} onChange={(e) => set("radius", e.target.value)} placeholder="12px" />
            </Field>
            <Field label="Cỡ chữ" error={fieldError("fontSize", draft.fontSize)} hint="Ví dụ 14px hoặc 0.9rem.">
              <Input value={draft.fontSize ?? ""} onChange={(e) => set("fontSize", e.target.value)} placeholder="14px" />
            </Field>
            <Field label="Phông chữ">
              <Select value={draft.font ?? ""} onChange={(e) => set("font", e.target.value as Theme["font"])}>
                <option value="">Mặc định</option>
                {FONTS.map((f) => (
                  <option key={f} value={f}>
                    {FONT_LABEL[f]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Chế độ sáng/tối">
              <Select value={draft.colorScheme ?? ""} onChange={(e) => set("colorScheme", e.target.value as Theme["colorScheme"])}>
                <option value="">Mặc định</option>
                <option value="auto">Theo thiết bị</option>
                <option value="light">Luôn sáng</option>
                <option value="dark">Luôn tối</option>
              </Select>
            </Field>
          </div>

          <h3 className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wide text-muted">Vị trí và nhãn</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vị trí nút nổi">
              <Select value={draft.position ?? ""} onChange={(e) => set("position", e.target.value as Theme["position"])}>
                <option value="">Mặc định</option>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>
                    {POSITION_LABEL[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Biểu tượng">
              <Select value={draft.icon ?? ""} onChange={(e) => set("icon", e.target.value as Theme["icon"])}>
                <option value="">Mặc định</option>
                {ICONS.map((i) => (
                  <option key={i} value={i}>
                    {ICON_LABEL[i]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cách mép ngang (px)" error={fieldError("offsetX", draft.offsetX)} hint="0 đến 200.">
              <Input type="number" min={0} max={200} step={1} value={draft.offsetX ?? ""} onChange={(e) => set("offsetX", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="20" />
            </Field>
            <Field label="Cách mép dọc (px)" error={fieldError("offsetY", draft.offsetY)} hint="0 đến 200.">
              <Input type="number" min={0} max={200} step={1} value={draft.offsetY ?? ""} onChange={(e) => set("offsetY", e.target.value === "" ? undefined : Number(e.target.value))} placeholder="20" />
            </Field>
            <Field label="Nhãn trên nút" error={fieldError("label", draft.label)} hint="Tối đa 24 ký tự.">
              <Input value={draft.label ?? ""} onChange={(e) => set("label", e.target.value)} maxLength={24} placeholder="Góp ý" />
            </Field>
            <Field label="Ngôn ngữ">
              <Select value={draft.locale ?? ""} onChange={(e) => set("locale", e.target.value as Theme["locale"])}>
                <option value="">Mặc định</option>
                <option value="vi">Tiếng Việt</option>
                <option value="en">Tiếng Anh</option>
              </Select>
            </Field>
          </div>

          <SaveBar
            dirty={dirty}
            busy={bar.busy}
            error={bar.error}
            saved={bar.saved}
            disabledReason={errors.length ? `Còn ${errors.length} trường chưa hợp lệ, sửa rồi mới lưu được.` : !whole.ok ? whole.error : null}
            onSave={() => void bar.run({ theme: draft })}
            onReset={() => setDraft(project.theme)}
          />
        </Card>

        <div className="min-w-0 space-y-4">
          <h2 className="text-base font-semibold">Xem trước</h2>
          <p className="-mt-2 text-[13px] leading-snug text-muted">Hình minh hoạ gần đúng bằng CSS thuần, cập nhật ngay khi sửa. Màu bạn đã đặt giữ nguyên ở cả hai chế độ; màu chưa đặt tự đổi theo chế độ.</p>
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode}>
              <div className="mb-1.5 text-sm font-medium">{mode === "light" ? "Nền sáng" : "Nền tối"}</div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Frame mode={mode} theme={draft} view="button" />
                <Frame mode={mode} theme={draft} view="drawer" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorField({ label, hint, value, placeholder, onChange, error }: { label: string; hint: string; value: string | undefined; placeholder: string; onChange: (v: string) => void; error: string | null }) {
  return (
    <Field label={label} hint={hint} error={error}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Chọn ${label.toLowerCase()}`}
          value={hex6(value ?? placeholder)}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-11 shrink-0 cursor-pointer rounded-lg border border-line bg-surface p-0.5"
        />
        <Input value={value ?? ""} onChange={(e) => onChange(e.target.value.trim())} placeholder={`${placeholder} (mặc định)`} className="font-mono" spellCheck={false} />
      </div>
    </Field>
  );
}

/** Bộ giá trị hiệu lực của một khung: giá trị hợp lệ người dùng đặt, còn lại lấy mặc định theo chế độ. */
function effective(theme: Theme, mode: "light" | "dark") {
  const scheme = theme.colorScheme === "light" ? "light" : theme.colorScheme === "dark" ? "dark" : mode;
  const base = scheme === "dark" ? DARK : LIGHT;
  const pick = (k: ColorKey) => (theme[k] && !fieldError(k, theme[k]) ? (theme[k] as string) : base[k]);
  const len = (k: "radius" | "fontSize", d: string) => (theme[k] && !fieldError(k, theme[k]) ? (theme[k] as string) : d);
  return {
    primary: pick("primary"),
    primaryText: pick("primaryText"),
    bg: pick("bg"),
    fg: pick("fg"),
    border: pick("border"),
    radius: len("radius", "12px"),
    fontSize: len("fontSize", "14px"),
    font: FONT_CSS[theme.font ?? "inherit"],
    position: theme.position ?? "bottom-right",
    offsetX: Math.min(200, Math.max(0, theme.offsetX ?? 20)),
    offsetY: Math.min(200, Math.max(0, theme.offsetY ?? 20)),
    label: theme.label ?? "Góp ý",
    icon: theme.icon ?? "lightbulb",
    en: theme.locale === "en",
  };
}

function Frame({ mode, theme, view }: { mode: "light" | "dark"; theme: Theme; view: "button" | "drawer" }) {
  const e = effective(theme, mode);
  const page = mode === "dark" ? { bg: "#0e1013", bar: "#262b34", text: "#2f3540" } : { bg: "#f4f6f9", bar: "#dfe3ea", text: "#e9ecf1" };
  const right = e.position.endsWith("right");
  const bottom = e.position.startsWith("bottom");
  const scale = 0.4;
  const btnStyle: React.CSSProperties = {
    position: "absolute",
    [right ? "right" : "left"]: Math.round(e.offsetX * scale),
    [bottom ? "bottom" : "top"]: Math.round(e.offsetY * scale),
    background: e.primary,
    color: e.primaryText,
    borderRadius: e.radius,
    fontFamily: e.font,
    fontSize: `min(${e.fontSize}, 15px)`,
    boxShadow: "0 4px 14px rgba(0,0,0,.25)",
  };
  return (
    <figure className="m-0">
      <div className="relative h-44 overflow-hidden rounded-lg border border-line" style={{ background: page.bg }} role="img" aria-label={`Xem trước ${view === "button" ? "nút nổi" : "ngăn kéo"} trên nền ${mode === "dark" ? "tối" : "sáng"}`}>
        {/* Trang của ứng dụng chủ (giả) */}
        <div className="space-y-2 p-3">
          <div className="h-2.5 w-2/5 rounded" style={{ background: page.bar }} />
          <div className="h-2 w-4/5 rounded" style={{ background: page.text }} />
          <div className="h-2 w-3/5 rounded" style={{ background: page.text }} />
          <div className="h-2 w-2/3 rounded" style={{ background: page.text }} />
        </div>
        {view === "button" ? (
          <div className="flex items-center gap-1.5 px-3 py-2 font-medium" style={btnStyle}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={ICON_PATH[e.icon]} />
            </svg>
            <span>{e.label}</span>
          </div>
        ) : (
          <div
            className="absolute inset-y-0 flex w-[62%] flex-col"
            style={{ [right ? "right" : "left"]: 0, background: e.bg, color: e.fg, borderLeft: right ? `1px solid ${e.border}` : undefined, borderRight: right ? undefined : `1px solid ${e.border}`, fontFamily: e.font, fontSize: `min(${e.fontSize}, 13px)` }}
          >
            <div className="flex items-center justify-between px-3 py-2 font-semibold" style={{ borderBottom: `1px solid ${e.border}` }}>
              <span>{e.en ? "Send feedback" : "Gửi góp ý"}</span>
              <span aria-hidden>×</span>
            </div>
            <div className="flex-1 space-y-2 p-3">
              <div className="h-6 rounded" style={{ border: `1px solid ${e.border}`, borderRadius: `min(${e.radius}, 8px)` }} />
              <div className="h-11 rounded" style={{ border: `1px solid ${e.border}`, borderRadius: `min(${e.radius}, 8px)` }} />
              <div className="inline-block px-3 py-1 font-medium" style={{ background: e.primary, color: e.primaryText, borderRadius: `min(${e.radius}, 10px)` }}>
                {e.en ? "Send" : "Gửi"}
              </div>
            </div>
          </div>
        )}
      </div>
      <figcaption className="mt-1 text-xs text-muted">{view === "button" ? "Nút nổi" : "Ngăn kéo góp ý"}</figcaption>
    </figure>
  );
}
