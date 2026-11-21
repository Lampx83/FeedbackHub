import { withCors, preflight } from "@/lib/cors";
import { fail, json } from "@/lib/http";
import { prisma } from "@/lib/prisma";
import { publicConfig } from "@/lib/project-config";

export const runtime = "nodejs";
export const OPTIONS = (req: Request) => preflight(req);

/** Cấu hình công khai của dự án cho widget: loại góp ý, tính năng, giao diện. Không có bí mật. */
export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("project");
  if (!slug) return fail(400, "Thiếu ?project=<slug>");
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project) return fail(404, "Không có dự án này");
  return withCors(req, project.allowedOrigins, json(publicConfig(project)));
}
