import { transition } from "@/lib/feedback";
import { json, readBody } from "@/lib/http";
import { actorOf, authorOf, machineFeedback } from "@/lib/machine-guard";
import { GUARDRAIL_KINDS, STATUSES } from "@/lib/status";
import { z } from "zod";

export const runtime = "nodejs";

const schema = z.object({
  to: z.enum(STATUSES),
  /** Ghi chú ngắn hiện cho người gửi (adminNote, ≤ 500 ký tự). */
  note: z.string().max(500).optional(),
  message: z
    .object({
      role: z.enum(["ai", "admin", "system"]).default("ai"),
      kind: z.enum(["chat", "progress", "system"]).default("chat"),
      authorName: z.string().max(120).optional(),
      body: z.string().min(1).max(20000),
    })
    .optional(),
  /**
   * Trường máy được đặt kèm. CỐ Ý không có userVerdict và planApproval: đó là phán quyết của CON
   * NGƯỜI, máy tự điền là nguỵ tạo bằng chứng.
   */
  fields: z
    .object({
      expectedString: z.string().max(200).nullable().optional(),
      verifyResult: z.enum(["pass", "fail", "skipped"]).optional(),
      scopeViolation: z.string().max(2000).nullable().optional(),
      guardrail: z.object({ kind: z.enum(GUARDRAIL_KINDS), detail: z.string().max(500) }).nullable().optional(),
      rolledBack: z.boolean().optional(),
      codeDoneAt: z.coerce.date().optional(),
      addCostUsd: z.number().min(0).max(1000).optional(),
      addAgentRuns: z.number().int().min(0).max(100).optional(),
      clearStop: z.boolean().optional(),
    })
    .optional(),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await machineFeedback(req, id);
  if (!g.ok) return g.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const v = body.value;
  const message = v.message
    ? { ...v.message, authorName: v.message.authorName ?? (v.message.role === "ai" ? authorOf(g.auth) : undefined) }
    : undefined;
  const updated = await transition(g.project, g.fb, v.to, {
    actor: actorOf(g.auth),
    fields: { ...v.fields, ...(v.note !== undefined ? { adminNote: v.note } : {}) },
    message,
  });
  return json({ ok: true, feedback: updated });
}
