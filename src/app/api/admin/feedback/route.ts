import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Bảng góp ý của mọi dự án. Lọc: project, status (cách nhau dấu phẩy), kind, q. */
export async function GET(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const u = new URL(req.url).searchParams;
  const scope = projectFilter(await projectScope(a.admin));
  // Luôn ràng theo dự án được phép; ?project=… chỉ thu hẹp thêm.
  const projectWhere = { ...scope, ...(u.get("project") ? { slug: u.get("project")! } : {}) };
  const where = {
    project: projectWhere,
    ...(u.get("status") ? { status: { in: u.get("status")!.split(",") } } : {}),
    ...(u.get("kind") ? { kind: { in: u.get("kind")!.split(",") } } : {}),
    ...(u.get("approval") === "approved" ? { approvedAt: { not: null } } : u.get("approval") === "pending" ? { approvedAt: null } : {}),
    ...(u.get("q") ? { OR: [{ title: { contains: u.get("q")!, mode: "insensitive" as const } }, { body: { contains: u.get("q")!, mode: "insensitive" as const } }] } : {}),
  };
  const [items, grouped] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 300,
      include: { project: { select: { slug: true, name: true } }, _count: { select: { messages: true, attachments: true } } },
    }),
    prisma.feedback.groupBy({ by: ["status"], where: { project: projectWhere }, _count: { _all: true } }),
  ]);
  return json({ items, stats: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) });
}
