import { z } from "zod";
import { prisma } from "./prisma";

export const PASSWORD_MIN = 10;
export const passwordSchema = z.string().min(PASSWORD_MIN, `Mật khẩu tối thiểu ${PASSWORD_MIN} ký tự`).max(200);

export const membershipsSchema = z
  .array(z.object({ slug: z.string().min(1).max(60), role: z.enum(["manager", "analyst", "viewer"]) }))
  .max(200)
  .refine((m) => new Set(m.map((x) => x.slug)).size === m.length, { message: "Một dự án chỉ gán một lần cho mỗi người" });

export const userSelect = {
  id: true,
  email: true,
  name: true,
  superAdmin: true,
  disabled: true,
  createdAt: true,
  memberships: { select: { role: true, project: { select: { slug: true, name: true } } }, orderBy: { project: { name: "asc" as const } } },
} as const;

/** Chuyển danh sách {slug, role} thành {projectId, role}; trả lỗi nếu có mã dự án không tồn tại. */
export async function resolveMemberships(items: { slug: string; role: "manager" | "analyst" | "viewer" }[]) {
  const projects = await prisma.project.findMany({ where: { slug: { in: items.map((i) => i.slug) } }, select: { id: true, slug: true } });
  const bySlug = new Map(projects.map((p) => [p.slug, p.id]));
  const missing = items.filter((i) => !bySlug.has(i.slug)).map((i) => i.slug);
  if (missing.length) return { ok: false as const, error: `Không có dự án: ${missing.join(", ")}` };
  return { ok: true as const, rows: items.map((i) => ({ projectId: bySlug.get(i.slug)!, role: i.role })) };
}

/** Còn bao nhiêu quản trị toàn hub đang hoạt động, không tính `excludeId`. Hub không được mất người cuối. */
export const otherActiveSupers = (excludeId: string) => prisma.adminUser.count({ where: { superAdmin: true, disabled: false, id: { not: excludeId } } });
