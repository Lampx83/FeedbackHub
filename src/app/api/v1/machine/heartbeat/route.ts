import { json } from "@/lib/http";
import { machineProject } from "@/lib/machine-guard";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

/** Worker báo còn sống; bảng điều khiển hiện "worker thấy lần cuối". Trả chế độ hiện hành. */
export async function POST(req: Request) {
  const g = await machineProject(req);
  if (!g.ok) return g.response;
  await prisma.project.update({ where: { id: g.project.id }, data: { workerSeenAt: new Date() } });
  return json({ ok: true, mode: g.project.mode, deliver: g.project.deliver });
}
