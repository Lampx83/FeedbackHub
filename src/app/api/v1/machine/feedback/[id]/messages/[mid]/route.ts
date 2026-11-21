import { fail, json, readBody } from "@/lib/http";
import { machineFeedback } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

/**
 * Sửa/xoá một tin của MÁY (ai/system) — để bộ trả lời Hỏi đáp đẩy câu trả lời đang chạy dần vào CÙNG một tin
 * thay vì tạo hàng chục tin. Cố ý hẹp: không đụng tin của người gửi/quản trị (đó là bằng chứng), và KHÔNG bắn
 * webhook (chữ đang stream chưa phải câu trả lời cuối).
 */
async function target(req: Request, id: string, mid: string) {
  const g = await machineFeedback(req, id);
  if (!g.ok) return g;
  const msg = await prisma.message.findFirst({ where: { id: mid, feedbackId: id } });
  if (!msg) return { ok: false as const, response: fail(404, "Không có tin nhắn này") };
  if (msg.role !== "ai" && msg.role !== "system") {
    return { ok: false as const, response: fail(403, "Chỉ sửa/xoá được tin do máy ghi") };
  }
  return { ok: true as const, g, msg };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  const t = await target(req, id, mid);
  if (!t.ok) return t.response;
  const body = await readBody(req, z.object({ body: z.string().min(1).max(20000) }));
  if (!body.ok) return body.response;
  const message = await prisma.message.update({ where: { id: mid }, data: { body: body.value.body } });
  await prisma.feedback.update({ where: { id }, data: { updatedAt: new Date() } });
  return json({ ok: true, message });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string; mid: string }> }) {
  const { id, mid } = await params;
  const t = await target(req, id, mid);
  if (!t.ok) return t.response;
  await prisma.message.delete({ where: { id: mid } });
  await prisma.feedback.update({ where: { id }, data: { updatedAt: new Date() } });
  return json({ ok: true });
}
