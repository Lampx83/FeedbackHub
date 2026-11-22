/**
 * Giới hạn tần suất trong bộ nhớ (một tiến trình). Đủ cho một máy chủ hub; nếu chạy nhiều bản
 * song song phải chuyển sang Redis hoặc bảng DB.
 */
const buckets = new Map<string, { n: number; reset: number }>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { n: 1, reset: now + windowMs });
    if (buckets.size > 5000) {
      for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
      // Chặn phình bộ nhớ khi bị tràn khoá giả: vượt trần cứng thì bỏ bớt các khoá cũ nhất.
      if (buckets.size > 50000) for (const k of [...buckets.keys()].slice(0, 25000)) buckets.delete(k);
    }
    return true;
  }
  b.n += 1;
  return b.n <= max;
}

/**
 * Địa chỉ máy khách. `X-Forwarded-For` do máy khách tự đặt được, nên KHÔNG lấy phần tử đầu (giả mạo được để
 * né giới hạn tần suất). Mỗi proxy tin cậy nối thêm địa chỉ ở CUỐI, vậy lấy phần tử thứ `hops` tính từ cuối.
 * Mặc định 1 proxy (nginx/Caddy trước hub); chỉnh bằng HUB_TRUSTED_PROXY_HOPS (0 = không có proxy, bỏ qua header).
 */
export function clientIp(req: Request): string {
  const hops = Math.max(0, Number(process.env.HUB_TRUSTED_PROXY_HOPS ?? 1) || 0);
  if (hops === 0) return "direct";
  const list = (req.headers.get("x-forwarded-for") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (list.length) return list[Math.max(0, list.length - hops)];
  return req.headers.get("x-real-ip") || "unknown";
}
