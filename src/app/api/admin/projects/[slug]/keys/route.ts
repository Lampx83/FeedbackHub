import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { randomToken, sha256 } from "@/lib/crypto";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Cấp khoá worker cho dự án. Khoá hiện ĐÚNG MỘT LẦN, chỉ lưu băm. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const p = await prisma.project.findUnique({ where: { slug: (await params).slug } });
  if (!p) return fail(404, "Không có dự án này");
  const body = await readBody(req, z.object({ label: z.string().min(2).max(60) }));
  if (!body.ok) return body.response;
  const raw = `fhk_w_${randomToken(24)}`;
  await prisma.apiKey.create({
    data: { projectId: p.id, scope: "worker", prefix: raw.slice(0, 12), hash: sha256(raw), label: body.value.label },
  });
  return json({ ok: true, key: raw });
}
