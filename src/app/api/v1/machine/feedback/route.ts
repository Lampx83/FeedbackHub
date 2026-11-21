import { createFeedback } from "@/lib/feedback";
import { json, readBody } from "@/lib/http";
import { machineProject } from "@/lib/machine-guard";
import { authenticateMachine } from "@/lib/auth-machine";
import { prisma } from "@/lib/prisma";
import { KINDS, STATUSES } from "@/lib/status";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * Liệt kê góp ý (cho Claude/MCP/CLI ở chế độ thu nhận). Operator không kèm ?project= thì xem
 * mọi dự án. Lọc: status, kind, source, contentRef, ids (cách nhau dấu phẩy), q (tìm trong tiêu đề); phân trang: limit (≤ 200), offset, order (asc|desc).
 */
export async function GET(req: Request) {
  const auth = await authenticateMachine(req);
  if (!auth.ok) return auth.response;
  const u = new URL(req.url).searchParams;
  const status = u.get("status");
  const kind = u.get("kind");
  const contentRef = u.get("contentRef");
  const source = u.get("source");
  const q = u.get("q");
  const limit = Math.min(200, Math.max(1, Number(u.get("limit")) || 50));
  const offset = Math.max(0, Number(u.get("offset")) || 0);
  const ids = u.get("ids")?.split(",").filter(Boolean).slice(0, 200);
  const order = u.get("order") === "desc" ? "desc" : "asc";
  const items = await prisma.feedback.findMany({
    where: {
      ...(auth.project ? { projectId: auth.project.id } : {}),
      ...(ids ? { id: { in: ids } } : {}),
      ...(status ? { status: { in: status.split(",") } } : {}),
      ...(kind ? { kind: { in: kind.split(",") } } : {}),
      ...(contentRef ? { contentRef } : {}),
      ...(source ? { source: { in: source.split(",") } } : {}),
      ...(q ? { title: { contains: q, mode: "insensitive" as const } } : {}),
    },
    orderBy: { createdAt: order },
    skip: offset,
    take: limit,
    include: { project: { select: { slug: true } }, attachments: { select: { id: true, fileName: true, mimeType: true } } },
  });
  return json({ items });
}

const createSchema = z.object({
  kind: z.enum(KINDS).default("other"),
  type: z.string().max(40).optional(),
  title: z.string().min(4).max(200),
  body: z.string().max(20000).optional(),
  reporterName: z.string().max(120).default("Hệ thống"),
  pagePath: z.string().max(200).optional(),
  scope: z.enum(["page", "system"]).default("system"),
  source: z.enum(["system", "api", "import"]).default("system"),
  requirePlan: z.boolean().optional(),
  status: z.enum(STATUSES).optional(),
});

/** Máy tự lập góp ý (vd. phiếu rà soát nợ kỹ thuật). Người gửi là "system" nên không nhận thông báo. */
export async function POST(req: Request) {
  const g = await machineProject(req);
  if (!g.ok) return g.response;
  const body = await readBody(req, createSchema);
  if (!body.ok) return body.response;
  const v = body.value;
  const fb = await createFeedback(g.project, { id: "system", name: v.reporterName }, v);
  return json({ ok: true, feedback: fb });
}
