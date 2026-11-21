import { requireAdminApi } from "@/lib/admin-session";
import { decrypt } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Xem khoá ký token của dự án (để dán vào cấu hình ứng dụng chủ). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const p = await prisma.project.findUnique({ where: { slug: (await params).slug } });
  if (!p) return fail(404, "Không có dự án này");
  return json({ signingSecret: decrypt(p.signingSecretEnc) });
}
