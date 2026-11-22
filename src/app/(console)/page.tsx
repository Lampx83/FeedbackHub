import { prisma } from "@/lib/prisma";
import { OPEN_STATUSES } from "@/lib/status";
import { ProjectGrid } from "@/components/ProjectGrid";
import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminPage } from "./auth";

export const metadata = { title: "Tổng quan — Feedback Hub" };

export default async function OverviewPage() {
  const admin = await requireAdminPage();
  const scope = projectFilter(await projectScope(admin));
  const [projects, open, total] = await Promise.all([
    prisma.project.findMany({
      where: scope,
      orderBy: { createdAt: "asc" },
      select: { id: true, slug: true, name: true, mode: true, deliver: true, workerSeenAt: true },
    }),
    prisma.feedback.groupBy({
      by: ["projectId"],
      // Cùng cách đếm với API /api/admin/projects: câu hỏi thuần không tính là việc đang mở.
      where: { project: scope, status: { in: [...OPEN_STATUSES] }, kind: { not: "question" } },
      _count: { _all: true },
    }),
    prisma.feedback.count({ where: { project: scope } }),
  ]);
  const openById = new Map(open.map((o) => [o.projectId, o._count._all]));
  return (
    <ProjectGrid
      total={total}
      canCreate={admin.superAdmin}
      projects={projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        mode: p.mode,
        deliver: p.deliver,
        workerSeenAt: p.workerSeenAt?.toISOString() ?? null,
        openCount: openById.get(p.id) ?? 0,
      }))}
    />
  );
}
