import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { projectFeatures } from "@/lib/project-config";

export const runtime = "nodejs";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Việc đang giữ quá lâu mà chưa xong: nhiều khả năng worker treo, cần người xem. */
const STUCK_HOURS = 2;
/** Chờ nhận quá lâu mà đã được phép làm: cần người quyết (giục worker, tự làm hay từ chối). */
const STALE_DAYS = 3;
const CAP = 50;

export type InboxReason = "approval" | "check" | "stuck" | "stale";

/**
 * "Cần bạn quyết định": gom những góp ý đang chờ MỘT NGƯỜI ra tay, theo dự án mà tài khoản được thấy.
 *  • approval — chưa duyệt, dự án bật cổng duyệt (AI chưa được thấy);
 *  • check    — AI làm xong nhưng kiểm chứng trượt / sửa ngoài phạm vi / đã phải hoàn tác (trong 14 ngày);
 *  • stuck    — đang làm quá lâu (worker có thể treo);
 *  • stale    — chờ nhận quá lâu dù đã được phép.
 * Mỗi mục kèm `manage` (tài khoản có được xử lý không) để giao diện ẩn nút. Câu hỏi thuần (kind=question) không vào đây.
 */
export async function GET(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const slug = new URL(req.url).searchParams.get("project");
  const scope = await projectScope(a.admin);
  const projects = await prisma.project.findMany({
    where: { ...projectFilter(scope), ...(slug ? { slug } : {}) },
    select: { id: true, slug: true, name: true, features: true },
  });
  const empty = { counts: { approval: 0, check: 0, stuck: 0, stale: 0, total: 0 }, items: [] as unknown[] };
  if (!projects.length) return json(empty);
  const byId = new Map(projects.map((p) => [p.id, p]));
  const ids = projects.map((p) => p.id);
  const gated = projects.filter((p) => projectFeatures(p).requireApproval).map((p) => p.id);
  const now = Date.now();
  const notQ = { kind: { not: "question" } } as const;
  const select = {
    id: true, title: true, kind: true, status: true, reporterName: true, createdAt: true, updatedAt: true, approvedAt: true,
    verifyResult: true, scopeViolation: true, guardrailKind: true, guardrailDetail: true, rolledBack: true, claimedAt: true, projectId: true,
  } as const;

  const [approval, check, stuck, stale] = await Promise.all([
    gated.length
      ? prisma.feedback.findMany({ where: { projectId: { in: gated }, ...notQ, approvedAt: null, status: { in: ["pending", "reviewing"] } }, orderBy: { createdAt: "asc" }, take: CAP, select })
      : [],
    prisma.feedback.findMany({
      where: {
        projectId: { in: ids }, ...notQ, status: { not: "rejected" }, updatedAt: { gte: new Date(now - 14 * DAY) },
        OR: [{ verifyResult: "fail" }, { scopeViolation: { not: null } }, { guardrailKind: { not: null } }, { rolledBack: true }],
      },
      orderBy: { updatedAt: "desc" }, take: CAP, select,
    }),
    prisma.feedback.findMany({ where: { projectId: { in: ids }, ...notQ, status: "reviewing", claimedAt: { lt: new Date(now - STUCK_HOURS * HOUR) } }, orderBy: { claimedAt: "asc" }, take: CAP, select }),
    prisma.feedback.findMany({
      where: {
        projectId: { in: ids }, ...notQ, status: "pending", createdAt: { lt: new Date(now - STALE_DAYS * DAY) },
        // Dự án có cổng duyệt: chỉ tính việc đã duyệt (chưa duyệt đã nằm ở "approval").
        OR: [{ approvedAt: { not: null } }, ...(gated.length ? [{ projectId: { notIn: gated } }] : [{}])],
      },
      orderBy: { createdAt: "asc" }, take: CAP, select,
    }),
  ]);

  const total = { approval: 0, check: 0, stuck: 0, stale: 0 };
  const seen = new Set<string>();
  const items: unknown[] = [];
  const push = (reason: InboxReason, rows: typeof approval) => {
    for (const f of rows) {
      const p = byId.get(f.projectId)!;
      const role = scope.all ? "manager" : scope.roles.get(f.projectId);
      // Một góp ý chỉ hiện một lần, ở lý do khẩn nhất (thứ tự gọi push).
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      total[reason] += 1;
      items.push({
        id: f.id, reason, title: f.title, kind: f.kind, status: f.status, reporterName: f.reporterName, createdAt: f.createdAt, updatedAt: f.updatedAt,
        project: { slug: p.slug, name: p.name },
        manage: role === "manager",
        detail: reason === "check" ? { verifyResult: f.verifyResult, scopeViolation: f.scopeViolation, guardrailKind: f.guardrailKind, guardrailDetail: f.guardrailDetail, rolledBack: f.rolledBack } : reason === "stuck" ? { claimedAt: f.claimedAt } : undefined,
      });
    }
  };
  push("approval", approval);
  push("check", check);
  push("stuck", stuck);
  push("stale", stale);
  return json({ counts: { ...total, total: items.length }, items });
}
