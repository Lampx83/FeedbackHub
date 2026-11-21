import { json, readBody } from "@/lib/http";
import { machineProject } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export const runtime = "nodejs";

/** Trí nhớ của worker: mỗi lượt là một tiến trình MỚI không nhớ gì, bảng này là trí nhớ duy nhất. */
export async function GET(req: Request) {
  const g = await machineProject(req);
  if (!g.ok) return g.response;
  const items = await prisma.memory.findMany({
    where: { projectId: g.project.id, active: true },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, kind: true, title: true, body: true, createdAt: true },
  });
  return json({ items });
}

const schema = z.object({
  kind: z.enum(["decision", "convention", "pitfall", "note"]).default("note"),
  title: z.string().min(3).max(200),
  body: z.string().min(1).max(5000),
});

export async function POST(req: Request) {
  const g = await machineProject(req);
  if (!g.ok) return g.response;
  const body = await readBody(req, schema);
  if (!body.ok) return body.response;
  const m = await prisma.memory.create({ data: { projectId: g.project.id, ...body.value } });
  return json({ ok: true, id: m.id });
}
