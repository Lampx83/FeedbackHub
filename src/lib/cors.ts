import { prisma } from "./prisma";

/**
 * CORS cho API của người dùng cuối. Xác thực bằng token trong header (không cookie) nên mở
 * CORS theo danh sách tên miền của từng dự án là đủ an toàn.
 */
let cache: { at: number; origins: Set<string> } | null = null;

async function allOrigins(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < 30_000) return cache.origins;
  const rows = await prisma.project.findMany({ select: { allowedOrigins: true } });
  cache = { at: Date.now(), origins: new Set(rows.flatMap((r) => r.allowedOrigins)) };
  return cache.origins;
}

const HEADERS = {
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, X-Hub-Project",
  "Access-Control-Max-Age": "600",
  Vary: "Origin",
};

export function originAllowed(origin: string | null, allowed: string[]): boolean {
  return !!origin && (allowed.includes(origin) || allowed.includes("*"));
}

/** Thêm header CORS vào phản hồi nếu Origin nằm trong danh sách của dự án. */
export function withCors<T extends Response>(req: Request, allowed: string[], res: T): T {
  const origin = req.headers.get("origin");
  res.headers.set("Vary", "Origin");
  if (originAllowed(origin, allowed)) {
    res.headers.set("Access-Control-Allow-Origin", origin!);
  }
  return res;
}

/** Trả lời OPTIONS: preflight không mang token nên chỉ biết Origin, kiểm trên mọi dự án. */
export async function preflight(req: Request): Promise<Response> {
  const origin = req.headers.get("origin");
  const ok = !!origin && (await allOrigins()).has(origin);
  const res = new Response(null, { status: 204, headers: HEADERS });
  if (ok) res.headers.set("Access-Control-Allow-Origin", origin!);
  return res;
}
