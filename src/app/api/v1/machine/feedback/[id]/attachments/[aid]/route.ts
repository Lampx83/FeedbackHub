import { fail } from "@/lib/http";
import { machineFeedback } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { readStored } from "@/lib/storage";

export const runtime = "nodejs";

/** Tải nội dung tệp đính kèm — AI PHẢI đọc tệp trước khi làm (quy ước của DGXL). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; aid: string }> }) {
  const { id, aid } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const att = await prisma.attachment.findFirst({ where: { id: aid, feedbackId: id } });
  if (!att) return fail(404, "Không tìm thấy tệp");
  const bytes = await readStored(att.storagePath).catch(() => null);
  if (!bytes) return fail(404, "Tệp không còn trên máy chủ");
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": att.mimeType, "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}` },
  });
}
