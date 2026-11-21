import { authenticateMachine } from "@/lib/auth-machine";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Danh sách dự án kèm số góp ý đang mở. Operator thấy mọi dự án; worker chỉ thấy dự án của mình. */
export async function GET(req: Request) {
  const auth = await authenticateMachine(req);
  if (!auth.ok) return auth.response;
  const projects = await prisma.project.findMany({
    where: auth.scope === "worker" ? { id: auth.project!.id } : {},
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true, mode: true, deliver: true, workerSeenAt: true },
  });
  const open = await prisma.feedback.groupBy({
    by: ["projectId", "status"],
    where: { projectId: { in: projects.map((p) => p.id) } },
    _count: { _all: true },
  });
  return json({
    projects: projects.map(({ id, ...p }) => ({
      ...p,
      counts: Object.fromEntries(open.filter((o) => o.projectId === id).map((o) => [o.status, o._count._all])),
    })),
  });
}
