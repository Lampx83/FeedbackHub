import { authenticateUser, canSubmit, isProjectAdmin } from "@/lib/auth-user";
import { originAllowed, preflight, withCors } from "@/lib/cors";
import { createFeedback, findDuplicate, fromUser } from "@/lib/feedback";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { projectFeatures, projectTypes } from "@/lib/project-config";
import { clientIp, rateLimit } from "@/lib/rate";
import { KINDS } from "@/lib/status";
import { z } from "zod";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

const createSchema = z.object({
  kind: z.enum(KINDS).optional(),
  /** Loại riêng của ứng dụng — phải nằm trong danh sách loại của dự án. */
  type: z.string().max(40).optional(),
  title: z.string().min(4, "Tiêu đề tối thiểu 4 ký tự").max(200),
  body: z.string().max(20000).optional(),
  /** Chỉ nhận đường dẫn nội bộ để không ai nhét URL ngoài vào ngữ cảnh mà AI sẽ đọc. */
  pagePath: z.string().max(200).regex(/^\/[\w\-./[\]%~]*$/, "Đường dẫn không hợp lệ").optional(),
  pageUrl: z.string().url().max(500).optional(),
  scope: z.enum(["page", "system"]).default("page"),
  pageTarget: z.string().max(500).optional(),
  suggestion: z.object({ before: z.string().max(2000), after: z.string().max(2000) }).optional(),
  contentRef: z.string().max(200).optional(),
  extra: z.record(z.string().max(60), z.unknown()).optional(),
  source: z.enum(["widget", "board", "api"]).default("api"),
  successCriteria: z.string().max(300).optional(),
  requirePlan: z.boolean().optional(),
  aiProvider: z.string().regex(/^[a-z0-9_-]{1,20}$/).optional(),
  aiModel: z.string().max(60).optional(),
  allowDuplicate: z.boolean().optional(),
  /** Chỉ dùng cho gửi ẩn danh. */
  name: z.string().max(120).optional(),
  email: z.string().email().max(200).optional(),
});

/**
 * GET: người quản trị dự án thấy tất cả (mới nhất trước), người khác chỉ thấy của mình.
 * `?summary=1` chỉ trả id các góp ý CỦA CHÍNH người gọi đang chờ họ trả lời — widget hỏi định kỳ
 * để hiện số đỏ (DGXL từng để câu hỏi lại của AI nằm im hàng tháng vì thiếu cái này).
 */
export async function GET(req: Request) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  if (!a.user) return withCors(req, project.allowedOrigins, fail(403, "Gửi ẩn danh không xem được danh sách"));
  const user = a.user;
  const admin = isProjectAdmin(project, user);
  const url = new URL(req.url);

  if (url.searchParams.get("summary") === "1") {
    const rows = await prisma.feedback.findMany({
      where: { projectId: project.id, reporterId: user.uid, status: "awaiting_user", kind: { not: "question" } },
      select: { id: true },
      take: 200,
    });
    return withCors(req, project.allowedOrigins, json({ awaitingIds: rows.map((r) => r.id) }));
  }

  const status = url.searchParams.get("status");
  const kind = url.searchParams.get("kind");
  const contentRef = url.searchParams.get("contentRef");
  const mine = { reporterId: user.uid };
  const [items, grouped] = await Promise.all([
    prisma.feedback.findMany({
      where: {
        projectId: project.id,
        ...(status ? { status } : {}),
        ...(kind ? { kind } : {}),
        ...(contentRef ? { contentRef } : {}),
        ...(admin ? {} : mine),
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.feedback.groupBy({
      by: ["status"],
      where: { projectId: project.id, ...(admin ? {} : mine) },
      _count: { _all: true },
    }),
  ]);
  const stats: Record<string, number> = {};
  for (const g of grouped) stats[g.status] = g._count._all;
  return withCors(req, project.allowedOrigins, json({ items, stats, isAdmin: admin }));
}

export async function POST(req: Request) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  const cors = <T extends Response>(r: T) => withCors(req, project.allowedOrigins, r);

  if (!a.user) {
    // Ẩn danh: bắt buộc đúng tên miền và giới hạn tần suất chặt hơn.
    if (!originAllowed(req.headers.get("origin"), project.allowedOrigins)) {
      return cors(fail(403, "Tên miền này chưa được phép gửi góp ý ẩn danh"));
    }
    if (!rateLimit(`anon:${project.id}:${clientIp(req)}`, 5, 10 * 60_000)) {
      return cors(fail(429, "Bạn gửi quá nhanh, vui lòng thử lại sau ít phút"));
    }
  } else {
    if (!canSubmit(project, a.user)) return cors(fail(403, "Vai trò của bạn chưa được phép gửi góp ý"));
    if (!rateLimit(`u:${project.id}:${a.user.uid}`, 30, 10 * 60_000)) {
      return cors(fail(429, "Bạn gửi quá nhanh, vui lòng thử lại sau ít phút"));
    }
  }

  const body = await readBody(req, createSchema);
  if (!body.ok) return cors(body.response);
  const v = body.value;

  const types = projectTypes(project);
  let kind = v.kind;
  if (v.type) {
    const def = types.find((t) => t.id === v.type);
    if (!def) return cors(fail(400, `Loại "${v.type}" không có trong dự án này`));
    kind = kind ?? def.kind;
  }
  kind = kind ?? "other";

  // Danh sách mô hình đóng: giá trị này có thể đi thẳng vào tham số dòng lệnh của worker.
  if (v.aiModel && !projectFeatures(project).models.some((m) => m.id === v.aiModel)) {
    return cors(fail(400, "Mô hình không nằm trong danh sách cho phép của dự án"));
  }

  const reporter = a.user
    ? fromUser(a.user)
    : { id: `anon:${clientIp(req)}`, name: v.name?.trim() || "Ẩn danh", email: v.email ?? null, role: null };

  if (!v.allowDuplicate && kind !== "question") {
    const dup = await findDuplicate(project.id, reporter.id, v.title, v.body);
    if (dup) {
      return cors(
        fail(409, "Bạn đã gửi một góp ý giống hệt và góp ý đó vẫn đang được xử lý.", {
          duplicateOf: { id: dup.id, title: dup.title, status: dup.status },
        }),
      );
    }
  }

  const fb = await createFeedback(project, reporter, {
    kind,
    type: v.type,
    title: v.title,
    body: v.body,
    pagePath: v.pagePath,
    pageUrl: v.pageUrl,
    scope: v.scope,
    pageTarget: v.pageTarget,
    suggestion: v.suggestion,
    contentRef: v.contentRef,
    extra: v.extra as never,
    source: v.source,
    successCriteria: v.successCriteria,
    requirePlan: v.requirePlan,
    aiProvider: v.aiProvider,
    aiModel: v.aiModel,
  });
  return cors(json({ ok: true, feedback: fb }));
}
