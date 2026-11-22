import { z } from "zod";
import { allows, requireProjectIdApi } from "@/lib/admin-access";
import { addMessage, transition } from "@/lib/feedback";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { HUMAN_SETTABLE } from "@/lib/status";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const fb = await prisma.feedback.findUnique({
    where: { id: (await params).id },
    include: {
      project: { select: { slug: true, name: true, mode: true } },
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
  if (!fb) return fail(404, "Không tìm thấy góp ý");
  const a = await requireProjectIdApi(fb.projectId, "view", "Không tìm thấy góp ý");
  if (!a.ok) return a.response;
  return json({ feedback: fb, canManage: allows(a.role, "manage") });
}

const schema = z
  .object({ status: z.enum(HUMAN_SETTABLE).optional(), message: z.string().max(20000).optional(), approved: z.boolean().optional() })
  .refine((v) => v.status || v.message?.trim() || v.approved !== undefined, { message: "Cần trạng thái mới, lời nhắn hoặc duyệt/bỏ duyệt" });

/** Quản trị hub trả lời / đổi trạng thái. Trả lời lúc "chờ người gửi" thì về hàng đợi như ở API người dùng. */
export async function PATCH(req: Request, { params }: Ctx) {
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const fb = await prisma.feedback.findUnique({ where: { id: (await params).id }, include: { project: true } });
  if (!fb) return fail(404, "Không tìm thấy góp ý");
  const a = await requireProjectIdApi(fb.projectId, "manage", "Không tìm thấy góp ý");
  if (!a.ok) return a.response;
  const { project, ...feedback } = fb;
  // Duyệt / bỏ duyệt: quyết định của con người (máy không có đường nào đặt được). Ghi vào nhật ký để truy vết.
  if (body.value.approved !== undefined && body.value.approved !== Boolean(fb.approvedAt)) {
    await prisma.feedback.update({
      where: { id: fb.id },
      data: {
        approvedAt: body.value.approved ? new Date() : null,
        approvedBy: body.value.approved ? a.admin.name : null,
        events: { create: { kind: "approval", actor: "human", detail: { approved: body.value.approved, by: a.admin.name } } },
      },
    });
  }
  const message = body.value.message?.trim();
  const requeue = Boolean(message) && fb.status === "awaiting_user" && !body.value.status;
  const to = requeue ? "pending" : body.value.status;
  if (to) {
    await transition(project, feedback, to, {
      actor: "human",
      fields: message ? { adminNote: message } : {},
      ...(message ? { message: { role: "admin", authorName: a.admin.name, body: message } } : {}),
    });
  } else if (message) {
    await addMessage(project, feedback, { role: "admin", authorName: a.admin.name, body: message });
  }
  return json({ ok: true });
}
