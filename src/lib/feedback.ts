/**
 * Nghiệp vụ góp ý: tạo, chuyển trạng thái, nhắn tin, webhook. MỌI thay đổi trạng thái đều đi qua
 * `transition()` để Event và webhook không bao giờ bị bỏ sót (DGXL từng phải dùng trigger DB vì
 * agent ghi thẳng bằng SQL; ở hub agent chỉ gọi API nên chặn được ở đây).
 */
import { AUTO_APPROVER, autoApproveRule } from "./approval";
import { notifyExternal } from "./notify";
import type { Feedback, Prisma, Project } from "@prisma/client";
import { decrypt, hmacHex } from "./crypto";
import type { HubUser } from "./auth-user";
import { prisma } from "./prisma";
import { OPEN_STATUSES, type Actor, type Status } from "./status";

export const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * Mật độ quy chiếu: số tham chiếu MÁY phân giải được trong một góp ý. Công thức cố ý thô và cố
 * định (giống DGXL) để số liệu giữa các giai đoạn còn so sánh được.
 */
export function refDensity(v: { pagePath?: string | null; pageTarget?: string | null; body?: string | null }) {
  let n = 0;
  if (v.pagePath) n += 1;
  if (v.pageTarget) n += 1;
  if (v.body && /["«"''][^"»"'']{3,}["»"'']/.test(v.body)) n += 1;
  return n;
}

export type CreateInput = {
  kind: string;
  type?: string | null;
  title: string;
  body?: string | null;
  pagePath?: string | null;
  pageUrl?: string | null;
  scope?: "page" | "system";
  pageTarget?: string | null;
  suggestion?: { before: string; after: string } | null;
  contentRef?: string | null;
  extra?: Prisma.InputJsonValue | null;
  source?: string;
  successCriteria?: string | null;
  requirePlan?: boolean;
  aiProvider?: string | null;
  aiModel?: string | null;
};

export type Reporter = { id: string; name: string; email?: string | null; role?: string | null };

export function fromUser(u: HubUser): Reporter {
  return { id: u.uid, name: u.name, email: u.email, role: u.role };
}

/** Gửi lại y hệt một góp ý còn đang mở thì coi là trùng. Câu hỏi không bị tính trùng. */
export async function findDuplicate(projectId: string, reporterId: string, title: string, body: string | null | undefined) {
  const candidates = await prisma.feedback.findMany({
    where: {
      projectId,
      reporterId,
      status: { in: [...OPEN_STATUSES] },
      kind: { not: "question" },
      title: { equals: title.trim(), mode: "insensitive" },
    },
    select: { id: true, title: true, body: true, status: true },
    take: 20,
  });
  return candidates.find((c) => norm(c.title) === norm(title) && norm(c.body) === norm(body)) ?? null;
}

export async function createFeedback(project: Project, reporter: Reporter, input: CreateInput) {
  const system = input.scope === "system";
  const pagePath = system ? null : (input.pagePath ?? null);
  const pageTarget = system ? null : (input.pageTarget ?? null);
  // Quy tắc tự duyệt do quản trị dự án đặt (vd. giảng viên gửi thì khỏi chờ). Vẫn ghi vào nhật ký để truy vết.
  const autoRule = autoApproveRule(project, reporter.role, input.source);
  const fb = await prisma.feedback.create({
    data: {
      projectId: project.id,
      kind: input.kind,
      type: input.type ?? null,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      status: "pending",
      reporterId: reporter.id,
      reporterName: reporter.name,
      reporterEmail: reporter.email ?? null,
      reporterRole: reporter.role ?? null,
      pagePath,
      pageUrl: input.pageUrl ?? null,
      scope: input.scope ?? "page",
      pageTarget,
      suggestion: input.suggestion ?? undefined,
      contentRef: input.contentRef ?? null,
      extra: input.extra ?? undefined,
      source: input.source ?? "api",
      refDensity: refDensity({ pagePath, pageTarget, body: input.body }),
      successCriteria: input.successCriteria?.trim() || null,
      planApproval: input.requirePlan ? "requested" : null,
      aiProvider: input.aiProvider ?? null,
      aiModel: input.aiModel ?? null,
      ...(autoRule ? { approvedAt: new Date(), approvedBy: AUTO_APPROVER } : {}),
      events: {
        create: [
          { kind: "created", toStatus: "pending", actor: "human" },
          ...(autoRule ? [{ kind: "approval", actor: "human", detail: { approved: true, by: AUTO_APPROVER, rule: autoRule } }] : []),
        ],
      },
    },
  });
  // Báo cho người phụ trách (email/webhook theo cấu hình dự án). Máy tự lập (source=system|import) thì không báo.
  if (fb.source !== "system" && fb.source !== "import") notifyExternal(project, fb, "new");
  return fb;
}

/** Trường máy được phép đặt kèm khi chuyển trạng thái. */
export type MachineFields = {
  adminNote?: string | null;
  expectedString?: string | null;
  verifyResult?: "pass" | "fail" | "skipped";
  scopeViolation?: string | null;
  rolledBack?: boolean;
  codeDoneAt?: Date;
  addCostUsd?: number;
  addAgentRuns?: number;
  clearStop?: boolean;
  userVerdict?: "accepted" | "rejected";
  planApproval?: "requested" | "approved";
};

export async function transition(
  project: Project,
  fb: Feedback,
  to: Status,
  opts: { actor: Actor; fields?: MachineFields; message?: { role: string; kind?: string; authorName?: string; body: string } },
) {
  const f = opts.fields ?? {};
  const now = new Date();
  const requeued = fb.status === "awaiting_user" && to === "pending";
  const data: Prisma.FeedbackUpdateInput = {
    status: to,
    ...(to === "reviewing" && !fb.pickedAt ? { pickedAt: now } : {}),
    ...(to === "done" ? { liveAt: now } : {}),
    ...(to === "pending" || to === "awaiting_user" || to === "done" || to === "rejected"
      ? { claimedBy: null, claimedAt: null }
      : {}),
    ...(requeued ? { clarifyRounds: { increment: 1 } } : {}),
    ...(f.adminNote !== undefined ? { adminNote: f.adminNote?.slice(0, 500) ?? null } : {}),
    ...(f.expectedString !== undefined ? { expectedString: f.expectedString } : {}),
    ...(f.verifyResult ? { verifyResult: f.verifyResult, verifiedAt: now } : {}),
    ...(f.scopeViolation !== undefined ? { scopeViolation: f.scopeViolation } : {}),
    ...(f.rolledBack !== undefined ? { rolledBack: f.rolledBack } : {}),
    ...(f.codeDoneAt ? { codeDoneAt: f.codeDoneAt } : {}),
    ...(f.addCostUsd ? { costUsd: { increment: f.addCostUsd } } : {}),
    ...(f.addAgentRuns ? { agentRuns: { increment: f.addAgentRuns } } : {}),
    ...(f.clearStop ? { stopRequestedAt: null } : {}),
    ...(f.userVerdict ? { userVerdict: f.userVerdict, userVerdictAt: now } : {}),
    ...(f.planApproval ? { planApproval: f.planApproval } : {}),
    events: { create: { kind: "status", fromStatus: fb.status, toStatus: to, actor: opts.actor } },
    ...(opts.message
      ? {
          messages: {
            create: {
              role: opts.message.role,
              kind: opts.message.kind ?? "chat",
              authorName: opts.message.authorName,
              body: opts.message.body,
            },
          },
        }
      : {}),
  };
  const updated = await prisma.feedback.update({ where: { id: fb.id }, data });
  if (fb.status !== to && (to === "awaiting_user" || to === "done" || to === "rejected")) {
    dispatchWebhook(project, "feedback.status", updated);
  }
  if (opts.message && opts.message.role !== "user" && (opts.message.kind ?? "chat") === "chat") {
    dispatchWebhook(project, "feedback.reply", updated, opts.message);
  }
  return updated;
}

export async function addMessage(
  project: Project,
  fb: Feedback,
  m: { role: string; kind?: string; authorName?: string | null; body: string },
) {
  const msg = await prisma.message.create({
    data: { feedbackId: fb.id, role: m.role, kind: m.kind ?? "chat", authorName: m.authorName ?? null, body: m.body },
  });
  // Chạm updatedAt để widget đang mở biết có nội dung mới mà tải lại luồng.
  const updated = await prisma.feedback.update({ where: { id: fb.id }, data: { updatedAt: new Date() } });
  if (m.role !== "user" && (m.kind ?? "chat") === "chat") dispatchWebhook(project, "feedback.reply", updated, m);
  if (m.role === "user" && (m.kind ?? "chat") === "chat") notifyExternal(project, updated, "reply");
  return msg;
}

/**
 * Báo ứng dụng chủ (POST, ký HMAC-SHA256 bằng khoá dự án trong header X-Hub-Signature). Gửi nền,
 * hỏng thì ghi Event `webhook_fail` chứ không làm hỏng thao tác chính — người dùng không nên mất
 * câu trả lời chỉ vì ứng dụng chủ đang bảo trì.
 */
export function dispatchWebhook(
  project: Project,
  event: "feedback.reply" | "feedback.status",
  fb: Feedback,
  message?: { role: string; kind?: string; authorName?: string | null; body: string },
) {
  if (!project.webhookUrl) return;
  void (async () => {
    try {
      const body = JSON.stringify({
        event,
        project: project.slug,
        at: new Date().toISOString(),
        feedback: {
          id: fb.id,
          title: fb.title,
          status: fb.status,
          kind: fb.kind,
          type: fb.type,
          reporterId: fb.reporterId,
          reporterName: fb.reporterName,
          adminNote: fb.adminNote,
        },
        ...(message
          ? { message: { role: message.role, kind: message.kind ?? "chat", authorName: message.authorName ?? null, body: message.body } }
          : {}),
      });
      const res = await fetch(project.webhookUrl!, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Event": event,
          "X-Hub-Signature": `sha256=${hmacHex(decrypt(project.signingSecretEnc), body)}`,
        },
        body,
        redirect: "manual",
        signal: AbortSignal.timeout(8000),
      });
      if (res.status >= 300) throw new Error(`HTTP ${res.status}`);
    } catch (e) {
      await prisma.event
        .create({ data: { feedbackId: fb.id, kind: "webhook_fail", actor: "system", detail: { event, error: String(e).slice(0, 300) } } })
        .catch(() => {});
    }
  })();
}

export const canSeeFeedback = (fb: Feedback, project: Project, user: HubUser | null) =>
  !!user && (fb.reporterId === user.uid || (!!user.role && project.adminRoles.includes(user.role)));

const INTERNAL_FIELDS = [
  "approvedBy", "claimedBy", "claimedAt", "costUsd", "agentRuns", "scopeViolation", "rolledBack",
  "reporterEmail", "stopRequestedAt",
] as const;

/** Bỏ các trường vận hành nội bộ (chi phí, ai đang giữ việc, email…) trước khi trả cho người gửi thường. */
export function forEndUser<T extends object>(fb: T): Omit<T, (typeof INTERNAL_FIELDS)[number]> {
  const out = { ...fb } as Record<string, unknown>;
  for (const k of INTERNAL_FIELDS) delete out[k];
  return out as Omit<T, (typeof INTERNAL_FIELDS)[number]>;
}
