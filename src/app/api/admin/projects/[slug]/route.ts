import { z } from "zod";
import { requireProjectApi, requireSuperApi } from "@/lib/admin-access";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { removeProjectFiles } from "@/lib/storage";
import { contrastWarnings, parseTheme } from "@/lib/theme";
import { mailConfigured, projectNotify } from "@/lib/notify";
import { assertPublicHttpUrl } from "@/lib/safe-url";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const a = await requireProjectApi(slug, "view");
  if (!a.ok) return a.response;
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
  // Người chỉ xem không cần (và không được) thấy danh sách khoá của dự án.
  if (a.role === "viewer") rest.keys = [];
  return json({ myRole: a.role, notify: projectNotify(p), mailConfigured: mailConfigured(), project: rest, warnings: contrastWarnings(parseTheme(p.theme).ok ? (p.theme as never) : {}) });
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
    types: z.array(z.object({ id: z.string().regex(/^[a-z0-9_-]{1,40}$/), label: z.string().min(1).max(60), kind: z.enum(["function", "content", "bug", "question", "other"]), roles: z.array(z.string().trim().min(1).max(50)).max(20).optional() })).min(1).max(20),
    features: z.object({
      scopePicker: z.boolean(), elementPicker: z.boolean(), voice: z.boolean(), attachments: z.boolean(),
      planApproval: z.boolean(), successCriteria: z.boolean(), screenshot: z.enum(["off", "optional", "default"]),
      models: z.array(z.object({ id: z.string().min(1).max(60), label: z.string().min(1).max(40) })).max(10),
      textSelection: z.boolean(),
      requireApproval: z.boolean(),
      // Bộ chọn CSS (widget dùng trong try/catch, không chèn vào HTML). Chặn ký tự điều khiển và ngoặc nhọn cho chắc.
      selectionScope: z.string().max(200).regex(/^[^<>\p{Cc}]*$/u, "Bộ chọn CSS không hợp lệ"),
      selectionRoles: z.array(z.string().trim().min(1).max(50)).max(20),
      hidePaths: z.array(z.string().max(100).regex(/^\/[^\s<>"'`\\]*$/u, "Mỗi đường dẫn phải bắt đầu bằng “/”, không có khoảng trắng")).max(30),
    }).partial(),
    theme: z.unknown(),
    webhookUrl: z.string().url().nullable(),
    notify: z.object({
      emails: z.array(z.string().trim().toLowerCase().email().max(200)).max(10),
      webhookUrl: z.string().trim().url().max(500).nullable(),
      on: z.enum(["all", "bugs", "off"]),
    }),
  })
  .partial();

export async function PATCH(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const a = await requireProjectApi(slug, "manage");
  if (!a.ok) return a.response;
  const body = await readBody(req, patch);
  if (!body.ok) return body.response;
  const { theme, features, notify, ...rest } = body.value;
  if (notify?.webhookUrl) {
    try {
      await assertPublicHttpUrl(notify.webhookUrl);
    } catch (e) {
      return fail(400, `Webhook thông báo: ${(e as Error).message}`);
    }
  }
  let themeOut: object | undefined;
  if (theme !== undefined) {
    const t = parseTheme(theme);
    if (!t.ok) return fail(400, t.error);
    themeOut = t.value;
  }
  const current = await prisma.project.findUnique({ where: { slug } });
  if (!current) return fail(404, "Không có dự án này");
  // Webhook cũ (ký HMAC): chỉ quản trị toàn hub được trỏ vào địa chỉ nội bộ (vd. DGXL gọi dịch vụ trong mạng);
  // quản trị dự án phải dùng https công cộng — nếu không, hub bị lợi dụng để dò/gọi dịch vụ nội bộ (SSRF).
  if (rest.webhookUrl && !a.admin.superAdmin && rest.webhookUrl !== current.webhookUrl) {
    try {
      await assertPublicHttpUrl(rest.webhookUrl);
    } catch (e) {
      return fail(400, `Webhook: ${(e as Error).message}`);
    }
  }
  const p = await prisma.project.update({
    where: { slug },
    data: {
      ...rest,
      ...(themeOut ? { theme: themeOut } : {}),
      ...(notify ? { notify } : {}),
      ...(features ? { features: { ...(current.features as object), ...features } } : {}),
    },
  });
  return json({ ok: true, warnings: contrastWarnings(parseTheme(p.theme).ok ? (p.theme as never) : {}) });
}

/** Xoá dự án CÙNG toàn bộ góp ý, tệp và khoá. Giao diện phải bắt gõ lại mã dự án để xác nhận. */
export async function DELETE(req: Request, { params }: Ctx) {
  const a = await requireSuperApi();
  if (!a.ok) return a.response;
  const { slug } = await params;
  const body = await readBody(req, z.object({ confirm: z.string() }));
  if (!body.ok) return body.response;
  if (body.value.confirm !== slug) return fail(400, "Mã xác nhận không khớp");
  await prisma.project.delete({ where: { slug } });
  await removeProjectFiles(slug);
  return json({ ok: true });
}
