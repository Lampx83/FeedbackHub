import { actorOf, machineFeedback } from "@/lib/machine-guard";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/**
 * Nhận việc — NGUYÊN TỬ: chỉ một bên nhận được một góp ý đang `pending`. Trả 409 nếu đã có người
 * nhận (hai worker, hoặc worker và người nhờ Claude làm tay, không bao giờ cùng sửa một việc).
 * Gọi lại bởi chính bên đang giữ thì trả 200 (làm tiếp sau khi tiến trình chết).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const holder = `${g.auth.key.label}`.slice(0, 80);
  if (g.auth.scope === "worker" && g.project.mode !== "execute") {
    return fail(409, "Dự án đang ở chế độ thu nhận — worker không được nhận việc");
  }
  if (g.fb.status === "reviewing" && g.fb.claimedBy === holder) return json({ ok: true, resumed: true });

  const now = new Date();
  const r = await prisma.feedback.updateMany({
    where: { id, status: "pending" },
    data: { status: "reviewing", claimedBy: holder, claimedAt: now, ...(g.fb.pickedAt ? {} : { pickedAt: now }) },
  });
  if (r.count === 0) return fail(409, "Góp ý này đã có người nhận hoặc không còn ở hàng đợi");
  await prisma.event.create({
    data: { feedbackId: id, kind: "status", fromStatus: "pending", toStatus: "reviewing", actor: actorOf(g.auth) },
  });
  return json({ ok: true });
}
