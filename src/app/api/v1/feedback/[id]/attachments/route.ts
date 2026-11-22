import { authenticateUser } from "@/lib/auth-user";
import { preflight, withCors } from "@/lib/cors";
import { canSeeFeedback } from "@/lib/feedback";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { clientIp, rateLimit } from "@/lib/rate";
import { ALLOWED_MIME, MAX_BYTES, MAX_FILES_PER_FEEDBACK, saveFile } from "@/lib/storage";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Tải một tệp đính kèm lên (multipart, trường `file`). Người gửi hoặc quản trị dự án. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const a = await authenticateUser(req);
  if (!a.ok) return a.response;
  const { project } = a;
  const cors = <T extends Response>(r: T) => withCors(req, project.allowedOrigins, r);
  const { id } = await params;
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb || fb.projectId !== project.id) return cors(fail(404, "Không tìm thấy góp ý"));
  // Gửi ẩn danh không có danh tính để đối chiếu: chỉ cho đính kèm vào góp ý ẩn danh vừa tạo trong 10 phút.
  const allowed = a.user
    ? canSeeFeedback(fb, project, a.user)
    : fb.reporterId.startsWith("anon:") && Date.now() - fb.createdAt.getTime() < 10 * 60_000;
  if (!allowed) return cors(fail(403, "Bạn không có quyền đính kèm vào góp ý này"));
  if (!rateLimit(`attach:${project.id}:${a.user?.uid ?? clientIp(req)}`, 40, 10 * 60_000)) return cors(fail(429, "Tải lên quá nhanh, vui lòng đợi ít phút"));

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return cors(fail(400, "Thiếu tệp (trường `file`)"));
  if (!ALLOWED_MIME[file.type]) return cors(fail(415, "Loại tệp này không được phép"));
  if (file.size > MAX_BYTES) return cors(fail(413, "Tệp lớn quá 10 MB"));
  if ((await prisma.attachment.count({ where: { feedbackId: id } })) >= MAX_FILES_PER_FEEDBACK) {
    return cors(fail(409, `Mỗi góp ý tối đa ${MAX_FILES_PER_FEEDBACK} tệp`));
  }
  const rel = await saveFile(project.slug, id, file.name, Buffer.from(await file.arrayBuffer()));
  const att = await prisma.attachment.create({
    data: { feedbackId: id, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size, storagePath: rel },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
  });
  return cors(json({ ok: true, attachment: att }));
}
