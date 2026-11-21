import { authenticateUser } from "@/lib/auth-user";
import { preflight, withCors } from "@/lib/cors";
import { canSeeFeedback } from "@/lib/feedback";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readStored } from "@/lib/storage";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Tải tệp đính kèm. Token đi trong header hoặc ?t= (thẻ <img> không gửi được header). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  const { id } = await params;
  const att = await prisma.attachment.findUnique({ where: { id }, include: { feedback: true } });
  if (!att || att.feedback.projectId !== project.id) return fail(404, "Không tìm thấy tệp");
  if (!canSeeFeedback(att.feedback, project, a.user)) return fail(403, "Bạn không có quyền xem tệp này");
  const bytes = await readStored(att.storagePath).catch(() => null);
  if (!bytes) return fail(404, "Tệp không còn trên máy chủ");
  return withCors(
    req,
    project.allowedOrigins,
    new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": att.mimeType,
        "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
        "Cache-Control": "private, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );
}
