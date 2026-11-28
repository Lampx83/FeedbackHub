import { z } from "zod";
import { setSessionCookie } from "@/lib/admin-session";
import { googleClientId } from "@/lib/env";
import { verifyGoogleCredential } from "@/lib/google";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

/** Đăng nhập bằng Google: nhận ID token, khớp email với tài khoản quản trị đã có, đặt cookie phiên như đăng nhập mật khẩu. */
export async function POST(req: Request) {
  if (!googleClientId()) return fail(404, "Đăng nhập bằng Google chưa được bật");
  if (!rateLimit(`google:${clientIp(req)}`, 20, 10 * 60_000)) return fail(429, "Thử đăng nhập quá nhiều lần, vui lòng đợi ít phút");
  const body = await readBody(req, z.object({ credential: z.string().min(20).max(6000) }));
  if (!body.ok) return body.response;
  const g = await verifyGoogleCredential(body.value.credential);
  if (!g) return fail(401, "Không xác minh được tài khoản Google. Hãy thử lại.");
  const admin = await prisma.adminUser.findUnique({ where: { email: g.email } });
  if (!admin) return fail(401, "Tài khoản Google này chưa được cấp quyền vào hệ thống. Nhờ quản trị hub thêm email của bạn.");
  if (admin.disabled) return fail(403, "Tài khoản đã bị khoá. Liên hệ quản trị hub.");
  await setSessionCookie(admin.id);
  return json({ ok: true });
}
