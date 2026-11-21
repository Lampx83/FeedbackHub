import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { contrastWarnings, parseTheme } from "@/lib/theme";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const { slug } = await params;
  const p = await prisma.project.findUnique({
    where: { slug },
    include: {
      keys: { orderBy: { createdAt: "desc" }, select: { id: true, scope: true, prefix: true, label: true, revokedAt: true, lastUsedAt: true, createdAt: true } },
      _count: { select: { feedback: true } },
    },
  });
  if (!p) return fail(404, "Không có dự án này");
  const { signingSecretEnc, ...rest } = p;
  void signingSecretEnc;
  return json({ project: rest, warnings: contrastWarnings(parseTheme(p.theme).ok ? (p.theme as never) : {}) });
}

const patch = z
  .object({
    name: z.string().min(2).max(100),
    allowedOrigins: z.array(z.string().url().or(z.literal("*"))),
    submitRoles: z.array(z.string().max(60)),
    adminRoles: z.array(z.string().max(60)),
    anonymousSubmit: z.boolean(),
    mode: z.enum(["collect", "execute"]),
    deliver: z.enum(["branch", "deploy"]),
    types: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().min(1).max(60), kind: z.enum(["function", "content", "bug", "question", "other"]) })).min(1).max(20),
    features: z.object({
      scopePicker: z.boolean(), elementPicker: z.boolean(), voice: z.boolean(), attachments: z.boolean(),
      planApproval: z.boolean(), successCriteria: z.boolean(), screenshot: z.enum(["off", "optional", "default"]),
      models: z.array(z.object({ id: z.string().min(1).max(60), label: z.string().min(1).max(40) })).max(10),
    }).partial(),
    theme: z.unknown(),
    webhookUrl: z.string().url().nullable(),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const { slug } = await params;
  const body = await readBody(req, patch);
  if (!body.ok) return body.response;
  const { theme, features, ...rest } = body.value;
  let themeOut: object | undefined;
  if (theme !== undefined) {
    const t = parseTheme(theme);
    if (!t.ok) return fail(400, t.error);
    themeOut = t.value;
  }
  const current = await prisma.project.findUnique({ where: { slug } });
  if (!current) return fail(404, "Không có dự án này");
  const p = await prisma.project.update({
    where: { slug },
    data: {
      ...rest,
      ...(themeOut ? { theme: themeOut } : {}),
      ...(features ? { features: { ...(current.features as object), ...features } } : {}),
    },
  });
  return json({ ok: true, warnings: contrastWarnings(parseTheme(p.theme).ok ? (p.theme as never) : {}) });
}

/** Xoá dự án CÙNG toàn bộ góp ý, tệp và khoá. Giao diện phải bắt gõ lại mã dự án để xác nhận. */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const { slug } = await params;
  const body = await readBody(req, z.object({ confirm: z.string() }));
  if (!body.ok) return body.response;
  if (body.value.confirm !== slug) return fail(400, "Mã xác nhận không khớp");
  await prisma.project.delete({ where: { slug } });
  return json({ ok: true });
}
