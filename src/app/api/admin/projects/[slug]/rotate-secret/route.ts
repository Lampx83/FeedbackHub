import { requireAdminApi } from "@/lib/admin-session";
import { encrypt, randomToken } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Đổi khoá ký token. Token cũ hỏng ngay — ứng dụng chủ phải cập nhật khoá mới. */
export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const slug = (await params).slug;
  if (!(await prisma.project.findUnique({ where: { slug } }))) return fail(404, "Không có dự án này");
  const secret = randomToken(32);
  await prisma.project.update({ where: { slug }, data: { signingSecretEnc: encrypt(secret) } });
  return json({ ok: true, signingSecret: secret });
}
