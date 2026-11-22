import { z } from "zod";
import { projectFilter, projectScope, requireSuperApi } from "@/lib/admin-access";
import { requireAdminApi } from "@/lib/admin-session";
import { encrypt, randomToken } from "@/lib/crypto";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { DEFAULT_FEATURES } from "@/lib/project-config";
import { DEFAULT_TYPES } from "@/lib/status";

export const runtime = "nodejs";

export async function GET() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const scope = await projectScope(a.admin);
  const projects = await prisma.project.findMany({
    where: projectFilter(scope),
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, name: true, mode: true, deliver: true, anonymousSubmit: true,
      allowedOrigins: true, workerSeenAt: true, createdAt: true,
      _count: { select: { feedback: true } },
    },
  });
  const open = await prisma.feedback.groupBy({
    by: ["projectId"],
    where: { project: projectFilter(scope), status: { in: ["pending", "reviewing", "deploying", "awaiting_user"] }, kind: { not: "question" } },
    _count: { _all: true },
  });
  const openBy = new Map(open.map((o) => [o.projectId, o._count._all]));
  return json({ projects: projects.map((p) => ({ ...p, openCount: openBy.get(p.id) ?? 0, myRole: scope.all ? "super" : scope.roles.get(p.id) ?? null })) });
}

const schema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/, "Mã dự án: chữ thường, số, gạch ngang (2–41 ký tự)"),
  name: z.string().min(2).max(100),
  allowedOrigins: z.array(z.string().url()).default([]),
  submitRoles: z.array(z.string().max(60)).default([]),
  adminRoles: z.array(z.string().max(60)).default([]),
});

/** Tạo dự án mới. Trả khoá ký token MỘT LẦN ở đây (xem lại được ở trang dự án vì lưu mã hoá, không băm). */
export async function POST(req: Request) {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  if (await prisma.project.findUnique({ where: { slug: body.value.slug } })) return fail(409, "Mã dự án đã tồn tại");
  const secret = randomToken(32);
  const p = await prisma.project.create({
    data: {
      ...body.value,
      signingSecretEnc: encrypt(secret),
      types: DEFAULT_TYPES as never,
      features: DEFAULT_FEATURES as never,
    },
  });
  return json({ ok: true, project: { id: p.id, slug: p.slug, name: p.name }, signingSecret: secret });
}
