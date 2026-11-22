import { z } from "zod";
import { requireProjectApi } from "@/lib/admin-access";
import { randomToken, sha256 } from "@/lib/crypto";
import { fail, json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Cấp khoá cho dự án: `worker` (mặc định, xử lý góp ý) hoặc `reader` (chỉ đọc, dùng cho AI/CLI của chủ dự án). Khoá hiện ĐÚNG MỘT LẦN, chỉ lưu băm. */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const slug = (await params).slug;
  const a = await requireProjectApi(slug, "manage");
  if (!a.ok) return a.response;
  const p = await prisma.project.findUnique({ where: { slug } });
  if (!p) return fail(404, "Không có dự án này");
  const body = await readBody(req, z.object({ label: z.string().min(2).max(60), scope: z.enum(["worker", "reader"]).default("worker") }));
  if (!body.ok) return body.response;
  const scope = body.value.scope;
  const raw = `${scope === "reader" ? "fhk_r_" : "fhk_w_"}${randomToken(24)}`;
  await prisma.apiKey.create({
    data: { projectId: p.id, scope, prefix: raw.slice(0, 12), hash: sha256(raw), label: body.value.label },
  });
  return json({ ok: true, key: raw });
}
