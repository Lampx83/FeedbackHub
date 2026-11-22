import { projectScope } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { feedFor } from "@/lib/notify";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Chuông thông báo: góp ý mới + trả lời của người gửi trong phạm vi dự án của tài khoản, kèm số chưa đọc. */
export async function GET() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const scope = await projectScope(a.admin);
  // Lần đầu dùng: đặt mốc "đã đọc" là bây giờ để không dội cả tháng góp ý cũ thành "chưa đọc".
  let seen = a.admin.notifSeenAt;
  if (!seen) {
    seen = new Date();
    await prisma.adminUser.update({ where: { id: a.admin.id }, data: { notifSeenAt: seen } });
  }
  const items = await feedFor(scope.all ? "all" : [...scope.roles.keys()], 20);
  return json({
    unread: items.filter((i) => i.at > seen!).length,
    items: items.map((i) => ({ ...i, at: i.at.toISOString(), unread: i.at > seen! })),
  });
}
