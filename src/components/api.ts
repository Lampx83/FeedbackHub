/** Gọi các route quản trị cùng origin. Hết phiên (401) thì đưa về trang đăng nhập. */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, {
      method: opts.method ?? (opts.body === undefined ? "GET" : "POST"),
      headers: opts.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
    });
    const data = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (res.status === 401 && !path.endsWith("/login") && typeof window !== "undefined") {
      window.location.href = "/login";
    }
    if (!res.ok) return { ok: false, error: data.error ?? `Lỗi ${res.status}`, status: res.status };
    return { ok: true, data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, error: "Đã huỷ", status: 0 };
    return { ok: false, error: "Không kết nối được máy chủ", status: 0 };
  }
}
