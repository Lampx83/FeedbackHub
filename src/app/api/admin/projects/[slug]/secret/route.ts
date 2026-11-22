import { requireProjectApi } from "@/lib/admin-access";
import { decrypt } from "@/lib/crypto";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Xem khoá ký token của dự án (để dán vào cấu hình ứng dụng chủ). */
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const a = await requireProjectApi(slug, "manage");
  if (!a.ok) return a.response;
  const p = await prisma.project.findUnique({ where: { slug } });
  if (!p) return fail(404, "Không có dự án này");
  return json({ signingSecret: decrypt(p.signingSecretEnc) });
}
