import { fail, json, readBody } from "@/lib/http";
import { authenticateMachine } from "@/lib/auth-machine";
import { prisma } from "@/lib/prisma";
import { KINDS, STATUSES } from "@/lib/status";
import { z } from "zod";

export const runtime = "nodejs";

const date = z.coerce.date().nullable().optional();
const item = z.object({
  /** Giữ nguyên id cũ để chạy lại không nhân đôi và để các tham chiếu ngoài (commit "refs #id") còn đúng. */
  id: z.string().min(1).max(60),
  kind: z.enum(KINDS).default("other"),
  type: z.string().max(40).nullable().optional(),
  title: z.string().min(1).max(200),
  body: z.string().max(20000).nullable().optional(),
  status: z.enum(STATUSES),
  reporterId: z.string().min(1).max(200),
  reporterName: z.string().min(1).max(120),
  adminNote: z.string().max(500).nullable().optional(),
  pagePath: z.string().max(200).nullable().optional(),
  scope: z.enum(["page", "system"]).default("page"),
  pageTarget: z.string().max(500).nullable().optional(),
  source: z.string().max(20).default("import"),
  refDensity: z.number().int().default(0),
  clarifyRounds: z.number().int().default(0),
  pickedAt: date,
  codeDoneAt: date,
  liveAt: date,
  agentRuns: z.number().int().default(0),
  costUsd: z.number().default(0),
  rolledBack: z.boolean().default(false),
  successCriteria: z.string().nullable().optional(),
  expectedString: z.string().nullable().optional(),
  verifyResult: z.string().nullable().optional(),
  verifiedAt: date,
  scopeViolation: z.string().nullable().optional(),
  userVerdict: z.string().nullable().optional(),
  userVerdictAt: date,
  planApproval: z.string().nullable().optional(),
  aiProvider: z.string().nullable().optional(),
  aiModel: z.string().nullable().optional(),
  votes: z.number().int().default(1),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
  messages: z
    .array(
      z.object({
        id: z.string().optional(),
        role: z.string().max(20),
        kind: z.string().max(20).default("chat"),
        authorName: z.string().nullable().optional(),
        body: z.string().max(20000),
        createdAt: z.coerce.date(),
      }),
    )
    .default([]),
  events: z
    .array(
      z.object({
        kind: z.string().max(30),
        fromStatus: z.string().nullable().optional(),
        toStatus: z.string().nullable().optional(),
        actor: z.string().default("unknown"),
        createdAt: z.coerce.date(),
      }),
    )
    .default([]),
});

/**
 * Nhập dữ liệu cũ từ ứng dụng (khoá operator, ?project=). Idempotent theo id: góp ý đã có thì bỏ
 * qua, nên chạy lại script nhập an toàn. KHÔNG bắn webhook và không đụng người dùng.
 */
export async function POST(req: Request) {
  const auth = await authenticateMachine(req);
  if (!auth.ok) return auth.response;
  if (auth.scope !== "operator" || !auth.project) return fail(403, "Nhập dữ liệu cần khoá operator kèm ?project=");
  const body = await readBody(req, z.object({ items: z.array(item).min(1).max(200) }));
  if (!body.ok) return body.response;

  let created = 0;
  let skipped = 0;
  for (const it of body.value.items) {
    if (await prisma.feedback.findUnique({ where: { id: it.id }, select: { id: true } })) {
      skipped++;
      continue;
    }
    const { messages, events, ...rest } = it;
    await prisma.feedback.create({
      data: {
        ...rest,
        projectId: auth.project.id,
        messages: { create: messages },
        events: { create: events.length ? events : [{ kind: "created", toStatus: it.status, actor: "unknown", createdAt: it.createdAt }] },
      },
    });
    created++;
  }
  return json({ ok: true, created, skipped });
}
