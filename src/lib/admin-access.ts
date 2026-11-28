import { NextResponse } from "next/server";
import { requireAdminApi, currentAdmin } from "./admin-session";
import { fail } from "./http";
import { prisma } from "./prisma";

/**
 * Phân quyền bảng điều khiển theo dự án.
 *  - superAdmin: mọi thứ (mọi dự án, tài khoản, khoá operator, tạo/xoá dự án).
 *  - manager: xem + xử lý góp ý + cài đặt + khoá của DỰ ÁN ĐƯỢC GÁN (không xoá dự án).
 *  - analyst (BA/điều phối yêu cầu): như viewer, thêm TẠO yêu cầu và TRẢ LỜI. Không duyệt, không đổi trạng thái, không cài đặt/khoá.
 *  - viewer: chỉ xem góp ý (và tệp đính kèm) của dự án được gán.
 * Người không được gán nhận 404 như dự án không tồn tại (không lộ sự có mặt của dự án).
 * Luôn kiểm ở API, không chỉ ở giao diện (quy tắc bất biến số 3).
 */
export type Role = "manager" | "analyst" | "viewer";
export type Level = "view" | "write" | "manage";
type Admin = { id: string; superAdmin: boolean };

export const ROLE_LABEL: Record<Role, string> = { manager: "Quản trị dự án", analyst: "Điều phối yêu cầu (BA)", viewer: "Chỉ xem" };

export function allows(role: Role | "super", level: Level): boolean {
  if (role === "super" || role === "manager") return true;
  return level === "view" || (role === "analyst" && level === "write");
}

/** Dự án mà tài khoản được thấy + vai trò. `all` = quản trị toàn hub. */
export async function projectScope(admin: Admin): Promise<{ all: boolean; roles: Map<string, Role> }> {
  if (admin.superAdmin) return { all: true, roles: new Map() };
  const rows = await prisma.projectMember.findMany({ where: { adminId: admin.id }, select: { projectId: true, role: true } });
  return { all: false, roles: new Map(rows.map((r) => [r.projectId, r.role as Role])) };
}

/** Điều kiện Prisma lọc `Project` theo phạm vi. */
export const projectFilter = (s: { all: boolean; roles: Map<string, Role> }) => (s.all ? {} : { id: { in: [...s.roles.keys()] } });

/** Vai trò của tài khoản trên một dự án (null = không có quyền gì). */
export async function roleOn(admin: Admin, projectId: string): Promise<Role | "super" | null> {
  if (admin.superAdmin) return "super";
  const m = await prisma.projectMember.findUnique({ where: { projectId_adminId: { projectId, adminId: admin.id } }, select: { role: true } });
  return (m?.role as Role | undefined) ?? null;
}

type Denied = { ok: false; response: NextResponse };

/** Quản trị toàn hub. */
export async function requireSuperApi(): Promise<Denied | { ok: true; admin: NonNullable<Awaited<ReturnType<typeof currentAdmin>>> }> {
  const a = await requireAdminApi();
  if (!a.ok) return a;
  if (!a.admin.superAdmin) return { ok: false, response: fail(403, "Chỉ quản trị toàn hub làm được việc này") };
  return a;
}

/** Quyền trên dự án theo mã (slug). 404 nếu không tồn tại hoặc không được gán; 403 nếu được gán nhưng thiếu mức. */
export async function requireProjectApi(slug: string, level: Level) {
  const a = await requireAdminApi();
  if (!a.ok) return a;
  const p = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
  const role = p ? await roleOn(a.admin, p.id) : null;
  if (!p || !role) return { ok: false, response: fail(404, "Không có dự án này") } as Denied;
  if (!allows(role, level)) return { ok: false, response: fail(403, "Vai trò của bạn ở dự án này chưa được làm việc này") } as Denied;
  return { ok: true, admin: a.admin, projectId: p.id, role } as const;
}

/** Quyền trên dự án theo id (dùng cho góp ý, tệp, khoá). `projectId` null = đối tượng toàn hub → chỉ quản trị toàn hub. */
export async function requireProjectIdApi(projectId: string | null, level: Level, notFound = "Không tìm thấy") {
  const a = await requireAdminApi();
  if (!a.ok) return a;
  if (projectId === null) {
    return a.admin.superAdmin ? ({ ok: true, admin: a.admin, role: "super" } as const) : ({ ok: false, response: fail(404, notFound) } as Denied);
  }
  const role = await roleOn(a.admin, projectId);
  if (!role) return { ok: false, response: fail(404, notFound) } as Denied;
  if (!allows(role, level)) return { ok: false, response: fail(403, "Vai trò của bạn ở dự án này chưa được làm việc này") } as Denied;
  return { ok: true, admin: a.admin, role } as const;
}
