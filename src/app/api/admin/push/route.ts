import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { pushConfigured, pushEndpointOk, vapidPublicKey } from "@/lib/push";

export const runtime = "nodejs";

/** Trạng thái thông báo đẩy: máy chủ có bật không, khoá công khai (để trình duyệt đăng ký), số thiết bị của tài khoản này. */
export async function GET() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  if (!pushConfigured()) return json({ enabled: false });
  return json({ enabled: true, publicKey: vapidPublicKey(), devices: await prisma.pushSubscription.count({ where: { adminId: a.admin.id } }) });
}

const sub = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
});

/** Đăng ký một thiết bị. Chỉ phiên đăng nhập (không dùng token cá nhân) và chỉ nhận địa chỉ của dịch vụ đẩy trình duyệt đã biết. */
export async function POST(req: Request) {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  if (!pushConfigured()) return fail(503, "Máy chủ chưa bật thông báo đẩy");
  const body = await readBody(req, sub);
  if (!body.ok) return body.response;
  const { endpoint, keys } = body.value;
  if (!pushEndpointOk(endpoint)) return fail(400, "Địa chỉ đẩy không được chấp nhận");
  const mine = await prisma.pushSubscription.count({ where: { adminId: a.admin.id, NOT: { endpoint } } });
  if (mine >= 10) return fail(400, "Tối đa 10 thiết bị cho mỗi tài khoản — huỷ bớt thiết bị cũ");
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { adminId: a.admin.id, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent: (req.headers.get("user-agent") ?? "").slice(0, 200) || null },
    update: { adminId: a.admin.id, p256dh: keys.p256dh, auth: keys.auth },
  });
  return json({ ok: true });
}

/** Huỷ đăng ký một thiết bị của chính mình. */
export async function DELETE(req: Request) {
  const a = await requireAdminApi({ sessionOnly: true });
  if (!a.ok) return a.response;
  const body = await readBody(req, z.object({ endpoint: z.string().max(2000) }));
  if (!body.ok) return body.response;
  await prisma.pushSubscription.deleteMany({ where: { adminId: a.admin.id, endpoint: body.value.endpoint } });
  return json({ ok: true });
}
