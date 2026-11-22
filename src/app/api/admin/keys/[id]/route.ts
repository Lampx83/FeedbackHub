import { requireProjectIdApi } from "@/lib/admin-access";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Thu hồi khoá (không xoá dòng, để còn lịch sử). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = (await params).id;
  const key = await prisma.apiKey.findUnique({ where: { id }, select: { projectId: true } });
  if (!key) return fail(404, "Không tìm thấy khoá hoặc đã thu hồi");
  // Khoá của dự án: quản trị dự án đó; khoá operator (không thuộc dự án nào): chỉ quản trị toàn hub.
  const a = await requireProjectIdApi(key.projectId, "manage", "Không tìm thấy khoá hoặc đã thu hồi");
  if (!a.ok) return a.response;
  const r = await prisma.apiKey.updateMany({ where: { id, revokedAt: null }, data: { revokedAt: new Date() } });
  return r.count ? json({ ok: true }) : fail(404, "Không tìm thấy khoá hoặc đã thu hồi");
}
