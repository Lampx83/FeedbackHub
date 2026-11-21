import { z } from "zod";
import { requireAdminApi } from "@/lib/admin-session";
import { randomToken, sha256 } from "@/lib/crypto";
import { json, readBody } from "@/lib/http";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const keys = await prisma.apiKey.findMany({
    where: { scope: "operator" },
    orderBy: { createdAt: "desc" },
    select: { id: true, prefix: true, label: true, revokedAt: true, lastUsedAt: true, createdAt: true },
  });
  return json({ keys });
}

/** Cấp khoá operator (mọi dự án) — dùng cho Claude/MCP/CLI. Tách khỏi khoá worker để thu hồi riêng được. */
export async function POST(req: Request) {
  const a = await requireAdminApi();
  if (!a.ok) return a.response;
  const body = await readBody(req, z.object({ label: z.string().min(2).max(60) }));
  if (!body.ok) return body.response;
  const raw = `fhk_o_${randomToken(24)}`;
  await prisma.apiKey.create({ data: { scope: "operator", prefix: raw.slice(0, 12), hash: sha256(raw), label: body.value.label } });
  return json({ ok: true, key: raw });
}
