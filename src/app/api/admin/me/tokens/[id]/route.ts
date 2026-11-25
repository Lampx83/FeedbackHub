import { requireAdminApi } from "@/lib/admin-session";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Thu hồi một token của chính bạn (có hiệu lực ngay). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  const { id } = await params;
  const r = await prisma.adminToken.updateMany({ where: { id, adminId: a.admin.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count ? json({ ok: true }) : fail(404, "Không có token này");
}
