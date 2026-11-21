import { addMessage } from "@/lib/feedback";
import { json, readBody } from "@/lib/http";
import { authorOf, machineFeedback } from "@/lib/machine-guard";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  role: z.enum(["ai", "admin", "user", "system"]).default("ai"),
  /** chat = đối thoại | progress = bước AI tự ghi khi đang chạy | system = mốc do script ghi. */
  kind: z.enum(["chat", "progress", "system"]).default("chat"),
  authorName: z.string().max(120).optional(),
  body: z.string().min(1).max(20000),
});

/** Ghi một tin vào luồng trao đổi. Tin `chat` của ai/admin sẽ bắn webhook báo người gửi. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const v = body.value;
  const msg = await addMessage(g.project, g.fb, { ...v, authorName: v.authorName ?? (v.role === "ai" ? authorOf(g.auth) : null) });
  return json({ ok: true, message: msg });
}
