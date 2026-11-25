/**
 * Thông báo đẩy của trình duyệt (Web Push, chuẩn VAPID): tới được cả khi đã đóng mọi tab hub.
 * Chỉ bật khi máy chủ có HUB_VAPID_PUBLIC / HUB_VAPID_PRIVATE (tạo bằng `npx web-push generate-vapid-keys`).
 * Nội dung góp ý là dữ liệu không đáng tin: chỉ đưa tiêu đề đã cắt ngắn vào thông báo (trình duyệt hiển thị dạng chữ thuần).
 */
import type { Feedback, Project } from "@prisma/client";
import webpush from "web-push";
import { withBase } from "./base-path";
import { publicUrl } from "./env";
import { prisma } from "./prisma";
import { assertPublicHttpUrl } from "./safe-url";
import { KIND_LABEL } from "./status";

export const pushConfigured = () => Boolean(process.env.HUB_VAPID_PUBLIC && process.env.HUB_VAPID_PRIVATE);
export const vapidPublicKey = () => process.env.HUB_VAPID_PUBLIC ?? "";

/** Chỉ nhận địa chỉ đẩy của các dịch vụ trình duyệt đã biết — endpoint do máy khách gửi lên, không để hub gọi tới nơi tuỳ ý. */
const PUSH_HOSTS = ["googleapis.com", "mozilla.com", "push.apple.com", "notify.windows.com", ...(process.env.HUB_PUSH_HOSTS ?? "").split(",").map((s) => s.trim()).filter(Boolean)];
export function pushEndpointOk(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && !u.username && !u.password && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const link = (slug: string, id: string) => withBase(`/board?project=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}`);

/** Đẩy tới mọi thiết bị đã đăng ký của quản trị viên CÒN quyền với dự án (kiểm lúc gửi, không lúc đăng ký). Nền, lỗi bị nuốt. */
export async function pushToAdmins(project: Pick<Project, "id" | "slug" | "name">, fb: Pick<Feedback, "id" | "title" | "kind" | "reporterName">, event: "new" | "reply") {
  if (!pushConfigured()) return;
  const subs = await prisma.pushSubscription.findMany({
    where: { admin: { disabled: false, OR: [{ superAdmin: true }, { memberships: { some: { projectId: project.id } } }] } },
    select: { id: true, endpoint: true, p256dh: true, auth: true },
    take: 200,
  });
  if (!subs.length) return;
  const what = event === "reply" ? "Trả lời mới" : fb.kind === "bug" ? "Báo lỗi mới" : "Góp ý mới";
  const label = KIND_LABEL[fb.kind as keyof typeof KIND_LABEL] ?? fb.kind;
  const payload = JSON.stringify({
    title: `${what} · ${clip(project.name, 40)}`,
    body: `${clip(fb.title, 120)}\n${label} · ${clip(fb.reporterName, 40)}`,
    url: link(project.slug, fb.id),
    tag: `${event}-${fb.id}`,
  });
  const opts = {
    vapidDetails: { subject: process.env.HUB_VAPID_SUBJECT || publicUrl() || "mailto:admin@example.com", publicKey: process.env.HUB_VAPID_PUBLIC!, privateKey: process.env.HUB_VAPID_PRIVATE! },
    TTL: 3600,
    timeout: 8000,
  };
  const dead: string[] = [];
  await Promise.allSettled(
    subs.map(async (s) => {
      if (!pushEndpointOk(s.endpoint)) return void dead.push(s.id);
      try {
        await assertPublicHttpUrl(s.endpoint);
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, opts);
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) dead.push(s.id); // thiết bị đã huỷ đăng ký
      }
    }),
  );
  if (dead.length) await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } }).catch(() => {});
}
