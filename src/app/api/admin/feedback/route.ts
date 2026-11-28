import { z } from "zod";
import { allows, projectFilter, projectScope, roleOn } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { createFeedback } from "@/lib/feedback";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { KINDS, PRIORITIES } from "@/lib/status";

export const runtime = "nodejs";

const SORTS = {
  new: { createdAt: "desc" },
  old: { createdAt: "asc" },
  updated: { updatedAt: "desc" },
} as const;

/** Ô CSV: bọc nháy kép; ô bắt đầu bằng = + - @ tab thì thêm ' phía trước để Excel/Sheets không chạy như công thức. */
const cell = (v: unknown) => {
  let t = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};

/**
 * Bảng góp ý của mọi dự án. Lọc: project, status (cách nhau dấu phẩy), kind, approval, q.
 * sort = new (mặc định) | old | updated; limit = 1–1000 (mặc định 100, bảng "Hiện thêm" tăng dần).
 * format=csv → tải về tối đa 5000 dòng theo cùng bộ lọc (UTF-8 có BOM để Excel đọc đúng tiếng Việt).
 */
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
  const orderBy = SORTS[(u.get("sort") ?? "new") as keyof typeof SORTS] ?? SORTS.new;

  if (u.get("format") === "csv") {
    const rows = await prisma.feedback.findMany({
      where, orderBy, take: 5000,
      select: { id: true, createdAt: true, updatedAt: true, kind: true, status: true, priority: true, title: true, body: true, reporterName: true, reporterRole: true, pagePath: true, approvedAt: true, approvedBy: true, userVerdict: true, verifyResult: true, project: { select: { slug: true } } },
    });
    const head = ["id", "du_an", "tao_luc", "cap_nhat", "loai", "trang_thai", "uu_tien", "tieu_de", "noi_dung", "nguoi_gui", "vai_tro", "trang", "duyet_luc", "duyet_boi", "nghiem_thu", "kiem_chung"];
    const lines = rows.map((r) => [r.id, r.project.slug, r.createdAt, r.updatedAt, r.kind, r.status, r.priority, r.title, r.body, r.reporterName, r.reporterRole, r.pagePath, r.approvedAt, r.approvedBy, r.userVerdict, r.verifyResult].map(cell).join(","));
    return new Response("\uFEFF" + [head.map(cell).join(","), ...lines].join("\r\n"), {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="gop-y-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "no-store" },
    });
  }

  const limit = Math.min(1000, Math.max(1, Math.floor(Number(u.get("limit"))) || 100));
  const [items, grouped] = await Promise.all([
    prisma.feedback.findMany({
      where,
      orderBy,
      take: limit,
      include: { project: { select: { slug: true, name: true } }, _count: { select: { messages: true, attachments: true } } },
    }),
    prisma.feedback.groupBy({ by: ["status"], where: { project: projectWhere }, _count: { _all: true } }),
  ]);
  return json({ items, stats: Object.fromEntries(grouped.map((g) => [g.status, g._count._all])) });
}

const createSchema = z.object({
  /** Mã (slug) dự án nhận yêu cầu. */
  project: z.string().min(1).max(60),
  kind: z.enum(KINDS).default("function"),
  title: z.string().trim().min(4, "Tiêu đề tối thiểu 4 ký tự").max(200),
  /** Bối cảnh / vấn đề nghiệp vụ hiện tại (không bắt buộc). */
  context: z.string().max(10000).optional(),
  /** Hành vi mong muốn sau khi sửa — bắt buộc, để người/AI xử lý hiểu cần làm gì. */
  desired: z.string().trim().min(10, "Mô tả hành vi mong muốn tối thiểu 10 ký tự").max(10000),
  /** Tiêu chí chấp nhận — bắt buộc: không có thì không có cách kiểm chứng đã xong hay chưa. */
  criteria: z.string().trim().min(5, "Cần ít nhất một tiêu chí chấp nhận").max(4000),
  priority: z.enum(PRIORITIES).default("normal"),
  /** Đường dẫn NỘI BỘ của trang áp dụng (cùng quy tắc với widget). */
  pagePath: z.string().max(200).regex(/^\/(?!\/)[^\s<>"'`\\]*$/u, "Đường dẫn không hợp lệ").optional(),
  /** Muốn AI trình kế hoạch cho người duyệt trước khi sửa mã. */
  requirePlan: z.boolean().optional(),
});

/**
 * Người điều phối (BA) tạo yêu cầu chỉnh sửa trực tiếp trên bảng quản trị. Cần quyền quản trị DỰ ÁN đó
 * (kiểm ở đây, không chỉ ẩn nút). Yêu cầu vẫn qua cổng duyệt như mọi góp ý — tạo không đồng nghĩa với duyệt;
 * người gửi ghi nhận là chính người tạo, nguồn `board`. Nội dung lưu theo mẫu: Bối cảnh / Hành vi mong muốn.
 */
export async function POST(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const body = await readBody(req, createSchema);
  if (!body.ok) return body.response;
  const v = body.value;
  const project = await prisma.project.findUnique({ where: { slug: v.project } });
  const role = project ? await roleOn(a.admin, project.id) : null;
  if (!project || !role) return fail(404, "Không có dự án này");
  if (!allows(role, "manage")) return fail(403, "Bạn chỉ có quyền xem dự án này");
  const text = [v.context?.trim() ? `Bối cảnh:\n${v.context.trim()}` : null, `Hành vi mong muốn:\n${v.desired}`].filter(Boolean).join("\n\n");
  const fb = await createFeedback(
    project,
    // Vai trò "console" (không trùng vai trò của ứng dụng chủ) để quy tắc tự duyệt theo vai trò không vô tình áp vào đây.
    { id: `admin:${a.admin.id}`, name: a.admin.name, email: a.admin.email, role: "console" },
    { kind: v.kind, title: v.title, body: text, pagePath: v.pagePath, scope: v.pagePath ? "page" : "system", source: "board", successCriteria: v.criteria, priority: v.priority, requirePlan: v.requirePlan },
  );
  return json({ ok: true, feedback: { id: fb.id, title: fb.title, status: fb.status, priority: fb.priority } });
}
