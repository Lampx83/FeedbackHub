import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Đánh dấu đã đọc mọi thông báo đến lúc này. */
export async function POST() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  await prisma.adminUser.update({ where: { id: a.admin.id }, data: { notifSeenAt: new Date() } });
  return json({ ok: true });
}
