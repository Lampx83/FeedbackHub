import { z } from "zod";

/**
 * Giao diện nút nổi. CHỈ nhận giá trị trong danh sách cho phép: không CSS tự do, không HTML —
 * để một cấu hình sai hay bị chiếm không chèn được mã vào trang của ứng dụng chủ.
 */
const color = z
  .string()
  .max(40)
  .regex(/^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\))$/, "Màu phải ở dạng hex, rgb() hoặc hsl()");
const length = z.string().max(16).regex(/^\d+(\.\d+)?(px|rem|em|%)$/, "Độ dài phải có đơn vị px, rem, em hoặc %");

export const FONTS = ["inherit", "system", "serif", "mono"] as const;
export const POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"] as const;
export const ICONS = ["lightbulb", "chat", "pencil", "flag", "plus"] as const;

export const themeSchema = z
  .object({
    primary: color,
    primaryText: color,
    bg: color,
    fg: color,
    border: color,
    radius: length,
    fontSize: length,
    font: z.enum(FONTS),
    colorScheme: z.enum(["auto", "light", "dark"]),
    position: z.enum(POSITIONS),
    offsetX: z.number().int().min(0).max(200),
    offsetY: z.number().int().min(0).max(200),
    label: z.string().max(24),
    icon: z.enum(ICONS),
    locale: z.enum(["vi", "en"]),
    /** Ghi đè chữ trên giao diện: khoá → chuỗi (≤ 200 ký tự). */
    strings: z.record(z.string().max(40), z.string().max(200)),
  })
  .partial()
  .strict();

export type Theme = z.infer<typeof themeSchema>;

/** Trả về theme sạch hoặc danh sách lỗi dễ đọc. */
export function parseTheme(input: unknown): { ok: true; value: Theme } | { ok: false; error: string } {
  const r = themeSchema.safeParse(input ?? {});
  if (r.success) return { ok: true, value: r.data };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "theme"}: ${i.message}`).join("; ") };
}

/** Độ sáng tương đối (WCAG) của màu hex 3/6 ký tự; null nếu không đọc được. */
function luminance(hex: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? m[1].split("").map((c) => c + c).join("") : m[1];
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Cảnh báo (không chặn) khi cặp màu không đủ tương phản 4,5:1 (WCAG AA). */
export function contrastWarnings(t: Theme): string[] {
  const out: string[] = [];
  const pairs: [string, string | undefined, string | undefined][] = [
    ["chữ trên nút (primaryText) và màu nút (primary)", t.primaryText, t.primary],
    ["chữ (fg) và nền (bg)", t.fg, t.bg],
  ];
  for (const [name, a, b] of pairs) {
    if (!a || !b) continue;
    const la = luminance(a);
    const lb = luminance(b);
    if (la == null || lb == null) continue;
    const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    if (ratio < 4.5) out.push(`Độ tương phản giữa ${name} chỉ ${ratio.toFixed(1)}:1, dưới ngưỡng 4,5:1.`);
  }
  return out;
}
