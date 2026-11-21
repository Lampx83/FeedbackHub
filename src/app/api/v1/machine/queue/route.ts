import { json } from "@/lib/http";
import { machineProject } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { projectFeatures } from "@/lib/project-config";

export const runtime = "nodejs";

/**
 * Hàng đợi của worker. Rỗng thì worker thoát ngay, không tốn token. Kèm chế độ hiện hành của dự án
 * (đổi được bất cứ lúc nào trên hub): ở `collect` hàng đợi LUÔN rỗng cho worker — việc do người nhờ
 * Claude lấy ra làm tay qua /machine/feedback. `?kind=question` trả hàng đợi Hỏi đáp (độc lập với chế độ).
 */
export async function GET(req: Request) {
  const g = await machineProject(req);
  if (!g.ok) return g.response;
  const { auth, project } = g;
  const url = new URL(req.url);
  const questions = url.searchParams.get("kind") === "question";
  if (auth.scope === "worker" && !questions) {
    void prisma.project.update({ where: { id: project.id }, data: { workerSeenAt: new Date() } }).catch(() => {});
  }
  const head = {
    slug: project.slug,
    name: project.name,
    mode: project.mode,
    deliver: project.deliver,
    models: projectFeatures(project).models.map((m) => m.id),
  };
  const idle = !questions && auth.scope === "worker" && project.mode !== "execute";

  const where = questions
    ? { projectId: project.id, kind: "question", status: "pending" }
    : { projectId: project.id, kind: { not: "question" }, status: { in: ["pending", "reviewing"] } };
  const items = idle
    ? []
    : await prisma.feedback.findMany({
        where,
        orderBy: { createdAt: "asc" },
        take: 50,
        include: { attachments: { select: { id: true, fileName: true, mimeType: true } } },
      });
  const stopRequested = idle
    ? []
    : (
        await prisma.feedback.findMany({
          where: { projectId: project.id, stopRequestedAt: { not: null }, status: { in: ["pending", "reviewing"] } },
          select: { id: true },
        })
      ).map((r) => r.id);
  return json({ project: head, items, stopRequested });
}
