import type { Feedback, Project } from "@prisma/client";
import nodemailer from "nodemailer";
import { hubName, publicUrl } from "./env";
import { assertPublicHttpUrl } from "./safe-url";
import { prisma } from "./prisma";
import { pushToAdmins } from "./push";
import { GUARDRAIL_LABEL, KIND_LABEL, type GuardrailKind } from "./status";

export type NotifyConfig = { emails: string[]; webhookUrl: string | null; on: "all" | "bugs" | "off" };
export const DEFAULT_NOTIFY: NotifyConfig = { emails: [], webhookUrl: null, on: "all" };

export function projectNotify(p: Pick<Project, "notify">): NotifyConfig {
  const n = (p.notify ?? {}) as Partial<NotifyConfig>;
  return { emails: Array.isArray(n.emails) ? n.emails : [], webhookUrl: n.webhookUrl ?? null, on: n.on === "bugs" || n.on === "off" ? n.on : "all" };
}

/** Email chỉ gửi được khi máy chủ có SMTP: HUB_SMTP_URL (vd. smtps://user:pass@smtp.example.com:465) và HUB_MAIL_FROM. */
export const mailConfigured = () => Boolean(process.env.HUB_SMTP_URL && process.env.HUB_MAIL_FROM);

let transport: ReturnType<typeof nodemailer.createTransport> | null = null;
const mailer = () => (transport ??= nodemailer.createTransport(process.env.HUB_SMTP_URL!));

const linkFor = (slug: string, id: string) => `${publicUrl()}/board?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`;
/** Chat (Slack, Teams, Discord…) hiểu <, >, & là cú pháp: thay đi để tiêu đề không chèn được @channel hay liên kết giả. */
const chatSafe = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export type NotifyEvent = "new" | "reply" | "guardrail";

function describe(project: Pick<Project, "slug" | "name">, fb: Pick<Feedback, "id" | "title" | "kind" | "reporterName"> & Partial<Pick<Feedback, "guardrailKind" | "guardrailDetail">>, event: NotifyEvent) {
  if (event === "guardrail") {
    const url = linkFor(project.slug, fb.id);
    const why = GUARDRAIL_LABEL[fb.guardrailKind as GuardrailKind] ?? fb.guardrailKind ?? "hàng rào an toàn";
    const detail = fb.guardrailDetail ? ` — ${clip(fb.guardrailDetail.replace(/\s+/g, " "), 200)}` : "";
    return { icon: "🚧", what: "Hàng rào chặn lượt AI", label: why, url, subject: `🚧 Hàng rào chặn lượt AI · ${project.name}: ${clip(fb.title, 80)}`, text: `Hàng rào chặn lượt AI ở ${project.name}: ${why}${detail}\nYêu cầu: ${clip(fb.title, 200)}\n${url}` };
  }
  const icon = fb.kind === "bug" ? "🐞" : event === "reply" ? "💬" : "💡";
  const what = event === "reply" ? "Trả lời mới" : fb.kind === "bug" ? "Báo lỗi mới" : "Góp ý mới";
  const label = KIND_LABEL[fb.kind as keyof typeof KIND_LABEL] ?? fb.kind;
  const url = linkFor(project.slug, fb.id);
  return { icon, what, label, url, subject: `${icon} ${what} · ${project.name}: ${clip(fb.title, 80)}`, text: `${what} ở ${project.name} (${label}) từ ${fb.reporterName}: ${clip(fb.title, 200)}\n${url}` };
}

/** Gửi ra ngoài (email + webhook) khi có góp ý mới / người gửi trả lời. Nền, không bao giờ làm hỏng thao tác chính. */
export function notifyExternal(project: Project, fb: Feedback, event: NotifyEvent) {
  const cfg = projectNotify(project);
  if (cfg.on === "off") return;
  if (cfg.on === "bugs" && fb.kind !== "bug" && event !== "guardrail") return;
  void pushToAdmins(project, fb, event).catch(() => {});
  if (!cfg.emails.length && !cfg.webhookUrl) return;
  void sendAll(project, fb, event, cfg).catch(() => {});
}

async function sendAll(project: Project, fb: Feedback, event: NotifyEvent, cfg: NotifyConfig) {
  const d = describe(project, fb, event);
  const jobs: Promise<unknown>[] = [];
  if (cfg.emails.length && mailConfigured()) {
    // Văn bản thuần: nội dung góp ý là dữ liệu không đáng tin, không dựng HTML từ nó.
    jobs.push(mailer().sendMail({ from: process.env.HUB_MAIL_FROM, to: cfg.emails, subject: d.subject.replace(/[\r\n]+/g, " "), text: `${d.text}\n\n— ${hubName()}` }));
  }
  if (cfg.webhookUrl) jobs.push(postChat(cfg.webhookUrl, project, fb, event, d));
  await Promise.allSettled(jobs);
}

async function postChat(url: string, project: Pick<Project, "slug" | "name">, fb: Feedback, event: NotifyEvent, d: ReturnType<typeof describe>) {
  const u = await assertPublicHttpUrl(url);
  const safe = chatSafe(d.text);
  const res = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // `text` cho Slack/Mattermost/Teams, `content` cho Discord; phần còn lại cho tự động hoá (Zapier, n8n…).
    body: JSON.stringify({ text: safe, content: safe, event: `feedback.${event}`, project: project.slug, feedback: { id: fb.id, title: fb.title, kind: fb.kind, reporterName: fb.reporterName }, ...(event === "guardrail" ? { guardrail: { kind: fb.guardrailKind, detail: fb.guardrailDetail } } : {}), url: d.url }),
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    // Không lộ chi tiết lỗi mạng (tránh dùng làm công cụ dò mạng nội bộ).
    throw new Error("không kết nối được tới webhook");
  });
  if (res.status >= 300) throw new Error(`webhook trả về mã ${res.status}`);
}

/** Gửi thử (nút "Gửi thử" ở cài đặt): trả lỗi cụ thể thay vì nuốt. */
export async function sendTest(project: Project): Promise<{ email: string; webhook: string }> {
  const cfg = projectNotify(project);
  const fake = { id: "test", title: `Thông báo thử từ ${hubName()}`, kind: "other", reporterName: hubName() } as Feedback;
  const d = describe(project, fake, "new");
  const out = { email: "chưa cấu hình", webhook: "chưa cấu hình" };
  if (cfg.emails.length) {
    if (!mailConfigured()) out.email = "máy chủ chưa cấu hình SMTP (HUB_SMTP_URL, HUB_MAIL_FROM)";
    else out.email = await mailer().sendMail({ from: process.env.HUB_MAIL_FROM, to: cfg.emails, subject: d.subject, text: `${d.text}\n\n— ${hubName()}` }).then(() => "đã gửi", (e) => `lỗi: ${String(e.message ?? e).slice(0, 160)}`);
  }
  if (cfg.webhookUrl) out.webhook = await postChat(cfg.webhookUrl, project, fake, "new", d).then(() => "đã gửi", (e) => `lỗi: ${String(e.message ?? e).slice(0, 160)}`);
  return out;
}

/** Nguồn cấp cho chuông trong bảng điều khiển: góp ý mới + trả lời của người gửi, trong phạm vi dự án được phép. */
export async function feedFor(projectIds: string[] | "all", limit = 20) {
  const where = projectIds === "all" ? {} : { projectId: { in: projectIds } };
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [created, replies] = await Promise.all([
    prisma.feedback.findMany({ where: { ...where, kind: { not: "question" }, source: { not: "import" }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, title: true, kind: true, reporterName: true, createdAt: true, project: { select: { slug: true, name: true } } } }),
    prisma.message.findMany({ where: { role: "user", kind: "chat", createdAt: { gte: since }, feedback: where }, orderBy: { createdAt: "desc" }, take: limit, select: { id: true, authorName: true, createdAt: true, feedback: { select: { id: true, title: true, kind: true, project: { select: { slug: true, name: true } } } } } }),
  ]);
  return [
    ...created.map((f) => ({ key: `f${f.id}`, type: "new" as const, id: f.id, title: f.title, kind: f.kind, by: f.reporterName, at: f.createdAt, project: f.project })),
    ...replies.map((m) => ({ key: `m${m.id}`, type: "reply" as const, id: m.feedback.id, title: m.feedback.title, kind: m.feedback.kind, by: m.authorName ?? "Người gửi", at: m.createdAt, project: m.feedback.project })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}
