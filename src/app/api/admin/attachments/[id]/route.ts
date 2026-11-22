import { requireProjectIdApi } from "@/lib/admin-access";
import { fail } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { readStored } from "@/lib/storage";

export const runtime = "nodejs";

/** Quản trị xem/tải tệp đính kèm ngay trong bảng điều khiển (cookie phiên). Tệp do người dùng cuối tải lên nên luôn
 *  phục vụ kèm CSP sandbox + nosniff: kể cả khi sau này danh sách loại tệp rộng ra, tệp cũng không chạy được mã trong origin này. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const att = await prisma.attachment.findUnique({ where: { id: (await params).id }, include: { feedback: { select: { projectId: true } } } });
  if (!att) return fail(404, "Không tìm thấy tệp");
  const a = await requireProjectIdApi(att.feedback.projectId, "view", "Không tìm thấy tệp");
  if (!a.ok) return a.response;
  const bytes = await readStored(att.storagePath).catch(() => null);
  if (!bytes) return fail(404, "Tệp không còn trên máy chủ");
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": att.mimeType,
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(att.fileName)}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
