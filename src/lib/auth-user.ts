import type { Project } from "@prisma/client";
import { decodeJwt, jwtVerify } from "jose";
import { decrypt } from "./crypto";
import { fail } from "./http";
import { prisma } from "./prisma";

export type HubUser = { uid: string; name: string; role: string | null; email: string | null };

export type UserAuth =
  | { ok: true; project: Project; user: HubUser }
  | { ok: true; project: Project; user: null; anonymous: true }
  | { ok: false; response: ReturnType<typeof fail> };

export const TOKEN_AUDIENCE = "feedback-hub";

/**
 * Xác thực người dùng cuối của một ứng dụng. Ứng dụng chủ ký một token ngắn hạn (HS256) bằng
 * khoá của dự án; hub tự tra dự án từ claim `prj` rồi kiểm chữ ký. Không có token thì chỉ cho
 * qua (ẩn danh) khi dự án bật `anonymousSubmit` và gọi kèm header X-Hub-Project.
 */
export async function authenticateUser(req: Request): Promise<UserAuth> {
  const url = new URL(req.url);
  const header = req.headers.get("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7).trim() : url.searchParams.get("t");

  if (token) {
    let slug: string | undefined;
    try {
      slug = decodeJwt(token).prj as string | undefined;
    } catch {
      return { ok: false, response: fail(401, "Token không hợp lệ") };
    }
    if (!slug) return { ok: false, response: fail(401, "Token thiếu claim prj (mã dự án)") };
    const project = await prisma.project.findUnique({ where: { slug } });
    if (!project) return { ok: false, response: fail(401, "Dự án không tồn tại") };
    try {
      const secret = new TextEncoder().encode(decrypt(project.signingSecretEnc));
      const { payload } = await jwtVerify(token, secret, {
        algorithms: ["HS256"],
        audience: TOKEN_AUDIENCE,
        clockTolerance: 30,
      });
      if (!payload.exp) return { ok: false, response: fail(401, "Token phải có thời hạn (exp)") };
      if (payload.exp - Math.floor(Date.now() / 1000) > 24 * 3600) {
        return { ok: false, response: fail(401, "Token sống quá lâu (tối đa 24 giờ)") };
      }
      const uid = typeof payload.uid === "string" ? payload.uid : "";
      const name = typeof payload.name === "string" ? payload.name : "";
      if (!uid || !name) return { ok: false, response: fail(401, "Token thiếu uid hoặc name") };
      return {
        ok: true,
        project,
        user: {
          uid: uid.slice(0, 200),
          name: name.slice(0, 120),
          role: typeof payload.role === "string" ? payload.role.slice(0, 60) : null,
          email: typeof payload.email === "string" ? payload.email.slice(0, 200) : null,
        },
      };
    } catch {
      return { ok: false, response: fail(401, "Chữ ký token không hợp lệ hoặc đã hết hạn") };
    }
  }

  const slug = req.headers.get("x-hub-project") || url.searchParams.get("project");
  if (!slug) return { ok: false, response: fail(401, "Thiếu token") };
  const project = await prisma.project.findUnique({ where: { slug } });
  if (!project || !project.anonymousSubmit) return { ok: false, response: fail(401, "Cần đăng nhập để góp ý") };
  return { ok: true, project, user: null, anonymous: true };
}

export const isProjectAdmin = (p: Project, u: HubUser | null) =>
  !!u && !!u.role && p.adminRoles.includes(u.role);

export const canSubmit = (p: Project, u: HubUser | null) =>
  p.submitRoles.length === 0 || (!!u && !!u.role && p.submitRoles.includes(u.role));
