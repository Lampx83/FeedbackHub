import { json } from "@/lib/http";
import { machineProject } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { projectFeatures, workerSettings } from "@/lib/project-config";
import { requiresApproval } from "@/lib/approval";

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
    worker: workerSettings(project),
    models: projectFeatures(project).models.map((m) => m.id),
  };
  const idle = !questions && auth.scope === "worker" && project.mode !== "execute";

  // Cổng duyệt: khoá không phải operator chỉ thấy góp ý đã duyệt (câu hỏi Hỏi đáp không qua cổng này).
  const gate = !questions && auth.scope !== "operator" && requiresApproval(project) ? { approvedAt: { not: null } } : {};
  const where = questions
    ? { projectId: project.id, kind: "question", status: "pending" }
    : { projectId: project.id, kind: { not: "question" }, status: { in: ["pending", "reviewing"] }, ...gate };
  // Khẩn trước, rồi Cao, Bình thường (kể cả chưa đặt), Thấp; trong cùng mức thì cũ trước. Lấy 200 rồi xếp lại để việc khẩn
  // nằm sau 50 việc cũ vẫn không bị bỏ sót.
  const RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  const rank = (v: string | null) => RANK[v ?? "normal"] ?? 2;
  const items = idle
    ? []
    : (
        await prisma.feedback.findMany({
          where,
          orderBy: { createdAt: "asc" },
          take: 200,
          include: { attachments: { select: { id: true, fileName: true, mimeType: true } } },
        })
      )
        .sort((a, b) => rank(a.priority) - rank(b.priority) || a.createdAt.getTime() - b.createdAt.getTime())
        .slice(0, 50);
  const stopRequested = idle
    ? []
    : (
        await prisma.feedback.findMany({
          where: { projectId: project.id, stopRequestedAt: { not: null }, status: { in: ["pending", "reviewing"] }, ...gate },
          select: { id: true },
        })
      ).map((r) => r.id);
  return json({ project: head, items, stopRequested });
}
