import { compare } from "bcryptjs";
import { BASE_PATH } from "@/lib/base-path";
import { cookies } from "next/headers";
import { z } from "zod";
import { createSession, SESSION_COOKIE } from "@/lib/admin-session";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

export async function POST(req: Request) {
  // Chặn dò mật khẩu: 8 lần/10 phút mỗi địa chỉ. (DGXL chưa có giới hạn này — đừng bỏ.)
  if (!rateLimit(`login:${clientIp(req)}`, 8, 10 * 60_000)) return fail(429, "Thử đăng nhập quá nhiều lần, vui lòng đợi ít phút");
  const body = await readBody(req, z.object({ email: z.string().email(), password: z.string().min(1).max(200) }));
  if (!body.ok) return body.response;
  const admin = await prisma.adminUser.findUnique({ where: { email: body.value.email.toLowerCase() } });
  // So băm cả khi không có người dùng để thời gian phản hồi không lộ email nào tồn tại.
  const ok = await compare(body.value.password, admin?.passwordHash ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi");
  if (!admin || !ok) return fail(401, "Email hoặc mật khẩu không đúng");
  (await cookies()).set(SESSION_COOKIE, await createSession(admin.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH || "/", // chỉ gửi cookie trong phạm vi hub khi chạy dưới đường dẫn con của tên miền dùng chung
    maxAge: 12 * 3600,
  });
  return json({ ok: true });
}
