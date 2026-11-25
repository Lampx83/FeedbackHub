import { projectFilter, projectScope } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

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
      select: { id: true, createdAt: true, updatedAt: true, kind: true, status: true, title: true, body: true, reporterName: true, reporterRole: true, pagePath: true, approvedAt: true, approvedBy: true, userVerdict: true, verifyResult: true, project: { select: { slug: true } } },
    });
    const head = ["id", "du_an", "tao_luc", "cap_nhat", "loai", "trang_thai", "tieu_de", "noi_dung", "nguoi_gui", "vai_tro", "trang", "duyet_luc", "duyet_boi", "nghiem_thu", "kiem_chung"];
    const lines = rows.map((r) => [r.id, r.project.slug, r.createdAt, r.updatedAt, r.kind, r.status, r.title, r.body, r.reporterName, r.reporterRole, r.pagePath, r.approvedAt, r.approvedBy, r.userVerdict, r.verifyResult].map(cell).join(","));
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
