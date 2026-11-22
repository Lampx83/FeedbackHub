import { hash } from "bcryptjs";
import { z } from "zod";
import { requireSuperApi } from "@/lib/admin-access";
import { membershipsSchema, passwordSchema, resolveMemberships, userSelect } from "@/lib/accounts";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Danh sách tài khoản kèm các dự án được gán (chỉ quản trị toàn hub). Không bao giờ trả mật khẩu/băm. */
export async function GET() {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const [users, projects] = await Promise.all([
    prisma.adminUser.findMany({ orderBy: { createdAt: "asc" }, select: userSelect }),
    prisma.project.findMany({ orderBy: { name: "asc" }, select: { slug: true, name: true } }),
  ]);
  return json({ users, projects, selfId: a.admin.id });
}

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  name: z.string().trim().min(2).max(100),
  password: passwordSchema,
  superAdmin: z.boolean().default(false),
  memberships: membershipsSchema.default([]),
});

/** Tạo tài khoản. Mặc định KHÔNG phải quản trị toàn hub: chỉ thấy các dự án được gán. */
export async function POST(req: Request) {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const v = body.value;
  if (await prisma.adminUser.findUnique({ where: { email: v.email } })) return fail(409, "Email này đã có tài khoản");
  const m = await resolveMemberships(v.superAdmin ? [] : v.memberships);
  if (!m.ok) return fail(400, m.error);
  const u = await prisma.adminUser.create({
    data: {
      email: v.email,
      name: v.name,
      passwordHash: await hash(v.password, 12),
      superAdmin: v.superAdmin,
      memberships: { create: m.rows },
    },
    select: userSelect,
  });
  return json({ ok: true, user: u }, { status: 201 });
}
