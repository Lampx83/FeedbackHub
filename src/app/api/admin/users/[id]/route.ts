import { hash } from "bcryptjs";
import { z } from "zod";
import { requireSuperApi } from "@/lib/admin-access";
import { sessionCutoff } from "@/lib/admin-session";
import { membershipsSchema, otherActiveSupers, passwordSchema, resolveMemberships, userSelect } from "@/lib/accounts";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

const patch = z
  .object({
    name: z.string().trim().min(2).max(100),
    superAdmin: z.boolean(),
    disabled: z.boolean(),
    /** Đặt lại mật khẩu (quản trị đặt hộ). Mọi phiên đang mở của người đó bị đăng xuất. */
    password: passwordSchema,
    /** Thay toàn bộ danh sách dự án được gán. */
    memberships: membershipsSchema,
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const id = (await params).id;
  const body = await readBody(req, patch);
  if (!body.ok) return body.response;
  const v = body.value;
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return fail(404, "Không tìm thấy tài khoản");
  if (id === a.admin.id && v.password !== undefined) return fail(400, "Đổi mật khẩu của chính mình ở trang “Tài khoản của tôi”");

  // Không tự làm mất quyền của chính mình, và hub luôn còn ít nhất một quản trị toàn hub đang hoạt động.
  const losesSuper = (v.superAdmin === false && target.superAdmin) || (v.disabled === true && target.superAdmin && !target.disabled);
  if (id === a.admin.id && (v.superAdmin === false || v.disabled === true)) return fail(400, "Không thể tự khoá hoặc hạ quyền của chính mình");
  if (losesSuper && (await otherActiveSupers(id)) === 0) return fail(400, "Hub phải còn ít nhất một quản trị toàn hub đang hoạt động");

  const willBeSuper = v.superAdmin ?? target.superAdmin;
  let rows: { projectId: string; role: "manager" | "viewer" }[] | null = null;
  if (v.memberships !== undefined) {
    const m = await resolveMemberships(willBeSuper ? [] : v.memberships);
    if (!m.ok) return fail(400, m.error);
    rows = m.rows;
  }

  await prisma.$transaction([
    ...(rows || v.superAdmin === true ? [prisma.projectMember.deleteMany({ where: { adminId: id } })] : []),
    prisma.adminUser.update({
      where: { id },
      data: {
        ...(v.name !== undefined ? { name: v.name } : {}),
        ...(v.superAdmin !== undefined ? { superAdmin: v.superAdmin } : {}),
        ...(v.disabled !== undefined ? { disabled: v.disabled } : {}),
        // Hạ quyền / khoá / đặt lại mật khẩu → huỷ phiên cũ ngay (quyền cũ không còn hiệu lực qua cookie đã cấp).
        ...(v.password !== undefined ? { passwordHash: await hash(v.password, 12) } : {}),
        ...(v.password !== undefined || v.superAdmin === false || v.disabled === true ? { sessionsValidAfter: sessionCutoff() } : {}),
        ...(rows && !willBeSuper ? { memberships: { create: rows } } : {}),
      },
    }),
  ]);
  return json({ ok: true, user: await prisma.adminUser.findUnique({ where: { id }, select: userSelect }) });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const id = (await params).id;
  if (id === a.admin.id) return fail(400, "Không thể tự xoá tài khoản của chính mình");
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return fail(404, "Không tìm thấy tài khoản");
  if (target.superAdmin && !target.disabled && (await otherActiveSupers(id)) === 0) return fail(400, "Hub phải còn ít nhất một quản trị toàn hub đang hoạt động");
  await prisma.adminUser.delete({ where: { id } });
  return json({ ok: true });
}
