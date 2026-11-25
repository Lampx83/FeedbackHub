import { z } from "zod";
import { ADMIN_TOKEN_PREFIX, requireAdminApi } from "@/lib/admin-session";
import { randomToken, sha256 } from "@/lib/crypto";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

/** Danh sách token cá nhân CÒN HIỆU LỰC của chính bạn (không bao giờ trả lại giá trị token). Chỉ qua phiên đăng nhập, không qua token. */
export async function GET() {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  const tokens = await prisma.adminToken.findMany({
    where: { adminId: a.admin.id, revokedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, prefix: true, expiresAt: true, revokedAt: true, lastUsedAt: true, createdAt: true },
  });
  return json({ tokens });
}

/**
 * Cấp token cá nhân: hành động đúng với quyền tài khoản của bạn, dùng cho CLI/script/Claude Code thay mật khẩu.
 * Hiện giá trị MỘT lần. Có hạn (mặc định 90 ngày, tối đa 365). Chỉ cấp qua phiên đăng nhập.
 */
export async function POST(req: Request) {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  if (!rateLimit(`mktoken:${a.admin.id}`, 10, 10 * 60_000)) return fail(429, "Cấp token quá nhiều lần, vui lòng đợi ít phút");
  const body = await readBody(req, z.object({ label: z.string().trim().min(2).max(60), days: z.number().int().min(1).max(365).default(90) }));
  if (!body.ok) return body.response;
  if ((await prisma.adminToken.count({ where: { adminId: a.admin.id, revokedAt: null, expiresAt: { gt: new Date() } } })) >= 20) {
    return fail(409, "Đã có 20 token còn hiệu lực, hãy thu hồi bớt");
  }
  const raw = `${ADMIN_TOKEN_PREFIX}${randomToken(32)}`;
  const t = await prisma.adminToken.create({
    data: { adminId: a.admin.id, label: body.value.label, prefix: raw.slice(0, 12), hash: sha256(raw), expiresAt: new Date(Date.now() + body.value.days * 86_400_000) },
    select: { id: true, expiresAt: true },
  });
  return json({ ok: true, token: raw, id: t.id, expiresAt: t.expiresAt });
}
