import type { ApiKey, Project } from "@prisma/client";
import { sha256 } from "./crypto";
import { fail } from "./http";
import { prisma } from "./prisma";

export type MachineAuth =
  | { ok: true; key: ApiKey; scope: "worker" | "reader" | "operator"; project: Project | null }
  | { ok: false; response: ReturnType<typeof fail> };

/**
 * Khoá cho máy (worker, Claude/MCP, CLI). Worker và reader bị buộc vào MỘT dự án; operator xem được mọi
 * dự án và chọn dự án bằng `?project=<slug>`. Reader (khoá chỉ đọc) chỉ được GET — mọi phương thức ghi bị chặn ngay ở đây
 * để không route nào quên kiểm. Khoá lưu dạng băm nên mất là phải cấp lại.
 */
export async function authenticateMachine(req: Request): Promise<MachineAuth> {
  const h = req.headers.get("authorization");
  if (!h?.startsWith("Bearer ")) return { ok: false, response: fail(401, "Thiếu khoá API") };
  const key = await prisma.apiKey.findUnique({ where: { hash: sha256(h.slice(7).trim()) } });
  if (!key || key.revokedAt) return { ok: false, response: fail(401, "Khoá API không hợp lệ hoặc đã bị thu hồi") };

  // Cập nhật mốc dùng gần nhất, tối đa 1 lần/phút để không ghi DB ở mỗi nhịp.
  if (!key.lastUsedAt || Date.now() - key.lastUsedAt.getTime() > 60_000) {
    void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }

  const slug = new URL(req.url).searchParams.get("project");
  if (key.scope === "reader" && req.method !== "GET" && req.method !== "HEAD") {
    return { ok: false, response: fail(403, "Khoá chỉ đọc không được ghi hay đổi gì") };
  }
  if (key.scope === "worker" || key.scope === "reader") {
    if (!key.projectId) return { ok: false, response: fail(403, "Khoá chưa gắn dự án") };
    const project = await prisma.project.findUnique({ where: { id: key.projectId } });
    if (!project) return { ok: false, response: fail(403, "Dự án của khoá không còn tồn tại") };
    if (slug && slug !== project.slug) return { ok: false, response: fail(403, "Khoá này không thuộc dự án đó") };
    return { ok: true, key, scope: key.scope, project };
  }
  const project = slug ? await prisma.project.findUnique({ where: { slug } }) : null;
  if (slug && !project) return { ok: false, response: fail(404, "Không có dự án này") };
  return { ok: true, key, scope: "operator", project };
}
