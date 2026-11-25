import { z } from "zod";
import { allows, roleOn } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const schema = z.object({ ids: z.array(z.string().min(1).max(40)).min(1).max(100), approved: z.boolean() });

/**
 * Duyệt / bỏ duyệt nhiều góp ý một lượt (người duyệt đã đọc từng dòng trong danh sách).
 * Quyền kiểm TỪNG dự án (cần quyền quản trị dự án đó); góp ý ngoài quyền bị bỏ qua và được liệt kê, không làm hỏng cả lượt.
 * Chỉ người (phiên đăng nhập / token cá nhân) gọi được — máy không có đường nào tới đây. Mỗi góp ý ghi một dòng nhật ký.
 */
export async function POST(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const { approved } = body.value;
  const ids = [...new Set(body.value.ids)];
  const rows = await prisma.feedback.findMany({ where: { id: { in: ids } }, select: { id: true, projectId: true, approvedAt: true } });
  const roles = new Map<string, boolean>();
  const changed: string[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const found = new Set(rows.map((r) => r.id));
  for (const id of ids) if (!found.has(id)) skipped.push({ id, reason: "không tìm thấy" });
  for (const r of rows) {
    if (!roles.has(r.projectId)) {
      const role = await roleOn(a.admin, r.projectId);
      roles.set(r.projectId, role !== null && allows(role, "manage"));
    }
    if (!roles.get(r.projectId)) skipped.push({ id: r.id, reason: "không đủ quyền" });
    else if (Boolean(r.approvedAt) === approved) skipped.push({ id: r.id, reason: approved ? "đã duyệt" : "chưa duyệt" });
    else changed.push(r.id);
  }
  if (changed.length) {
    const now = new Date();
    await prisma.$transaction(
      changed.map((id) =>
        prisma.feedback.update({
          where: { id },
          data: {
            approvedAt: approved ? now : null,
            approvedBy: approved ? a.admin.name : null,
            events: { create: { kind: "approval", actor: "human", detail: { approved, by: a.admin.name, bulk: true } } },
          },
        }),
      ),
    );
  }
  if (!changed.length && !skipped.length) return fail(400, "Không có góp ý nào");
  return json({ ok: true, changed: changed.length, skipped });
}
