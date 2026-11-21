import { fail, json } from "@/lib/http";
import { machineFeedback } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { ALLOWED_MIME, MAX_BYTES, saveFile } from "@/lib/storage";

export const runtime = "nodejs";

/** Máy đính kèm tệp vào một góp ý (vd. nhập dữ liệu cũ, hoặc AI đính kèm ảnh kết quả). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return fail(400, "Thiếu tệp (trường `file`)");
  if (!ALLOWED_MIME[file.type]) return fail(415, "Loại tệp này không được phép");
  if (file.size > MAX_BYTES) return fail(413, "Tệp lớn quá 10 MB");
  const rel = await saveFile(g.project.slug, id, file.name, Buffer.from(await file.arrayBuffer()));
  const att = await prisma.attachment.create({
    data: { feedbackId: id, fileName: file.name.slice(0, 200), mimeType: file.type, sizeBytes: file.size, storagePath: rel },
    select: { id: true, fileName: true, mimeType: true, sizeBytes: true },
  });
  return json({ ok: true, attachment: att });
}
