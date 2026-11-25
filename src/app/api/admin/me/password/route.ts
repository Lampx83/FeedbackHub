import { compare, hash } from "bcryptjs";
import { z } from "zod";
import { requireAdminApi, sessionCutoff, setSessionCookie } from "@/lib/admin-session";
import { passwordSchema } from "@/lib/accounts";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

/** Tự đổi mật khẩu. Phải nhập đúng mật khẩu hiện tại; mọi phiên khác của tài khoản bị đăng xuất, phiên này được cấp lại. */
export async function POST(req: Request) {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  if (!rateLimit(`pw:${a.admin.id}`, 5, 10 * 60_000)) return fail(429, "Thử quá nhiều lần, vui lòng đợi ít phút");
  const body = await readBody(req, z.object({ current: z.string().min(1).max(200), next: passwordSchema }));
  if (!body.ok) return body.response;
  if (!(await compare(body.value.current, a.admin.passwordHash))) return fail(400, "Mật khẩu hiện tại không đúng");
  if (body.value.current === body.value.next) return fail(400, "Mật khẩu mới phải khác mật khẩu hiện tại");
  await prisma.adminUser.update({ where: { id: a.admin.id }, data: { passwordHash: await hash(body.value.next, 12), sessionsValidAfter: sessionCutoff() } });
  // Đổi mật khẩu thường vì nghi bị lộ: thu hồi luôn mọi token cá nhân.
  await prisma.adminToken.updateMany({ where: { adminId: a.admin.id, revokedAt: null }, data: { revokedAt: new Date() } });
  await setSessionCookie(a.admin.id);
  return json({ ok: true });
}
