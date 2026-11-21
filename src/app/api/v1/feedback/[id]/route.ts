import { authenticateUser, canSubmit, isProjectAdmin } from "@/lib/auth-user";
import { preflight, withCors } from "@/lib/cors";
import { addMessage, canSeeFeedback, transition } from "@/lib/feedback";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { HUMAN_SETTABLE } from "@/lib/status";
import { z } from "zod";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);
type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  const cors = <T extends Response>(r: T) => withCors(req, project.allowedOrigins, r);
  const { id } = await params;
  const fb = await prisma.feedback.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      attachments: { orderBy: { createdAt: "desc" }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, createdAt: true } },
    },
  });
  if (!fb || fb.projectId !== project.id) return cors(fail(404, "Không tìm thấy góp ý"));
  if (!canSeeFeedback(fb, project, a.user)) return cors(fail(403, "Bạn không có quyền xem góp ý này"));
  const { attachments, ...feedback } = fb;
  return cors(json({ feedback, attachments }));
}

const patchSchema = z
  .object({
    status: z.enum(HUMAN_SETTABLE).optional(),
    message: z.string().max(20000).optional(),
    /** Nghiệm thu của chính người gửi — thước đo "đúng ý" mà máy không tự sinh ra được. */
    userVerdict: z.enum(["accepted", "rejected"]).optional(),
    /** Duyệt kế hoạch AI đề xuất trước khi nó động vào mã. */
    planApproval: z.literal("approved").optional(),
    /** "Dừng lại" khi AI đang làm hoặc đang chờ nhận việc. */
    stop: z.literal(true).optional(),
  })
  .refine((v) => v.status || v.userVerdict || v.planApproval || v.stop || v.message?.trim(), {
    message: "Cần ít nhất trạng thái mới, lời nhắn, nghiệm thu, hoặc lệnh dừng.",
  });

/**
 * Người gửi hoặc quản trị dự án cập nhật một góp ý. Giữ đúng các quy tắc đã chạy thật ở DGXL:
 *  • trả lời lúc đang «chờ người gửi trả lời» → đẩy về hàng đợi (nếu không câu trả lời nằm chết);
 *  • nghiệm thu «chưa đúng» → mở lại; duyệt kế hoạch → về hàng đợi;
 *  • «Dừng»: pending dừng ngay, reviewing chỉ đánh dấu cờ để worker (đang giữ tiến trình AI) cắt;
 *  • không cho dừng lúc deploying vì cắt giữa chừng có thể để hệ thống nửa cũ nửa mới.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  const cors = <T extends Response>(r: T) => withCors(req, project.allowedOrigins, r);
  if (!a.user) return cors(fail(403, "Cần đăng nhập"));
  const user = a.user;
  const admin = isProjectAdmin(project, user);
  const { id } = await params;

  const body = await readBody(req, patchSchema);
  if (!body.ok) return cors(body.response);
  const v = body.value;

  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb || fb.projectId !== project.id) return cors(fail(404, "Không tìm thấy góp ý"));
  if (!canSeeFeedback(fb, project, user)) return cors(fail(403, "Bạn không có quyền với góp ý này"));
  // Đổi trạng thái tay chỉ dành cho quản trị; người gửi chỉ nhắn, nghiệm thu, duyệt kế hoạch, dừng.
  if (v.status && !admin) return cors(fail(403, "Chỉ quản trị dự án được đổi trạng thái"));
  if ((v.message || v.userVerdict || v.planApproval || v.stop) && !canSubmit(project, user) && !admin) {
    return cors(fail(403, "Vai trò của bạn không được phép"));
  }

  if (v.stop) {
    if (fb.kind === "question" || !["pending", "reviewing"].includes(fb.status)) {
      return cors(fail(409, "Góp ý này không còn đang chạy để dừng"));
    }
    if (fb.status === "pending") {
      await transition(project, fb, "awaiting_user", {
        actor: "human",
        fields: { adminNote: "Đã dừng theo yêu cầu của người gửi." },
        message: {
          role: "ai",
          kind: "system",
          authorName: "Hệ thống",
          body: "Đã dừng theo yêu cầu của anh/chị trước khi AI bắt đầu làm. Nhắn thêm ở đây nếu muốn AI làm tiếp.",
        },
      });
    } else {
      await prisma.feedback.update({ where: { id }, data: { stopRequestedAt: new Date() } });
    }
    return cors(json({ ok: true }));
  }

  const message = v.message?.trim();
  const reopens = v.userVerdict === "rejected";
  const planApproved = v.planApproval === "approved";
  const answeredWhileWaiting =
    Boolean(message) && fb.status === "awaiting_user" && (v.status ?? "awaiting_user") === "awaiting_user";
  const next = reopens || planApproved || answeredWhileWaiting ? "pending" : (v.status ?? null);

  const role = admin && fb.reporterId !== user.uid ? "admin" : "user";
  if (next) {
    const updated = await transition(project, fb, next, {
      actor: "human",
      fields: {
        ...(v.userVerdict ? { userVerdict: v.userVerdict } : {}),
        ...(planApproved ? { planApproval: "approved" as const } : {}),
        ...(message ? { adminNote: message } : {}),
      },
      ...(message ? { message: { role, authorName: user.name, body: message } } : {}),
    });
    return cors(json({ ok: true, feedback: updated }));
  }
  // Không đổi trạng thái: chỉ nhắn tin và/hoặc nghiệm thu "đúng ý".
  if (v.userVerdict) {
    await prisma.feedback.update({ where: { id }, data: { userVerdict: v.userVerdict, userVerdictAt: new Date() } });
  }
  if (message) {
    await addMessage(project, fb, { role, authorName: user.name, body: message });
    await prisma.feedback.update({ where: { id }, data: { adminNote: message.slice(0, 500) } });
  }
  return cors(json({ ok: true }));
}
