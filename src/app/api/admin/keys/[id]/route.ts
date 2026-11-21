import { requireAdminApi } from "@/lib/admin-session";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Thu hồi khoá (không xoá dòng, để còn lịch sử). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const r = await prisma.apiKey.updateMany({ where: { id: (await params).id, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count ? json({ ok: true }) : fail(404, "Không tìm thấy khoá hoặc đã thu hồi");
}
