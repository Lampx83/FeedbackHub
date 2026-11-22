import { compare, hashSync } from "bcryptjs";
import { z } from "zod";
import { setSessionCookie } from "@/lib/admin-session";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

// Băm hợp lệ (cost 12, giống thật) để thời gian so sánh không phân biệt được email có tồn tại hay không.
const DUMMY_HASH = hashSync("khong-ai-dung-mat-khau-nay", 12);

export async function POST(req: Request) {
  // Chặn dò mật khẩu: 8 lần/10 phút mỗi địa chỉ. (DGXL chưa có giới hạn này — đừng bỏ.)
  if (!rateLimit(`login:${clientIp(req)}`, 8, 10 * 60_000)) return fail(429, "Thử đăng nhập quá nhiều lần, vui lòng đợi ít phút");
  const body = await readBody(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  if (!body.ok) return body.response;
  const email = body.value.email.toLowerCase();
  // Giới hạn thêm theo tài khoản: dò một tài khoản từ nhiều địa chỉ vẫn bị chặn.
  if (!rateLimit(`login-email:${email}`, 15, 10 * 60_000)) return fail(429, "Thử đăng nhập quá nhiều lần, vui lòng đợi ít phút");
  const admin = await prisma.adminUser.findUnique({ where: { email } });
  // So băm cả khi không có người dùng để thời gian phản hồi không lộ email nào tồn tại.
  const ok = await compare(body.value.password, admin?.passwordHash ?? DUMMY_HASH);
  if (!admin || !ok) return fail(401, "Email hoặc mật khẩu không đúng");
  if (admin.disabled) return fail(403, "Tài khoản đã bị khoá. Liên hệ quản trị hub.");
  await setSessionCookie(admin.id);
  return json({ ok: true });
}
