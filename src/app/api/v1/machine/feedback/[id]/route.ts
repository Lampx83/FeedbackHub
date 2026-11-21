import { json } from "@/lib/http";
import { machineFeedback } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Chi tiết đầy đủ một góp ý: nội dung, toàn bộ luồng trao đổi, tệp đính kèm, sự kiện. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const full = await prisma.feedback.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "asc" } },
      attachments: { select: { id: true, fileName: true, mimeType: true, sizeBytes: true } },
    },
  });
  return json({ feedback: full, project: { slug: g.project.slug, mode: g.project.mode, deliver: g.project.deliver } });
}
