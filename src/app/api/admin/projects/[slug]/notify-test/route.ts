import { requireProjectApi } from "@/lib/admin-access";
import { fail, json } from "@/lib/http";
import { sendTest } from "@/lib/notify";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate";

export const runtime = "nodejs";

/** Gửi thử thông báo theo cấu hình ĐÃ LƯU của dự án (email + webhook). Trả kết quả từng kênh. */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const a = await requireProjectApi(slug, "manage");
  if (!a.ok) return a.response;
  if (!rateLimit(`notify-test:${a.admin.id}`, 6, 5 * 60_000)) return fail(429, "Gửi thử quá nhiều lần, đợi vài phút");
  const p = await prisma.project.findUnique({ where: { slug } });
  if (!p) return fail(404, "Không có dự án này");
  return json({ ok: true, result: await sendTest(p) });
}
