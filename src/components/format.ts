const dateTime = new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" });

export const formatDateTime = (iso: string | Date | null | undefined) =>
  iso ? dateTime.format(new Date(iso)) : "—";

/** "3 phút trước", "2 giờ trước"… — quá 7 ngày thì ghi ngày giờ đầy đủ. */
export function timeAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 45) return "vừa xong";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} phút trước`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} giờ trước`;
  const d = Math.round(h / 24);
  if (d <= 7) return `${d} ngày trước`;
  return formatDateTime(iso);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Còn trong vòng `ms` mili-giây gần đây không (tách ra để không gọi Date.now() trong thân component). */
export const isRecent = (iso: string | null | undefined, ms: number) => !!iso && Date.now() - new Date(iso).getTime() < ms;
