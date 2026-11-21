import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Kiểm tra sức khoẻ cho reverse proxy / giám sát: 200 nếu app chạy và DB trả lời. Không lộ gì ngoài trạng thái. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 503 });
  }
}
