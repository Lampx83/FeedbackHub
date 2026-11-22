import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { BASE_PATH } from "./base-path";
import { authSecret } from "./env";
import { fail } from "./http";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "hub_session";
const key = () => new TextEncoder().encode(authSecret());

export async function createSession(adminId: string): Promise<string> {
  return new SignJWT({ sub: adminId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("12h")
    .sign(key());
}

/** Đặt cookie phiên cho tài khoản (đăng nhập, hoặc cấp lại sau khi đổi mật khẩu). */
export async function setSessionCookie(adminId: string) {
  (await cookies()).set(SESSION_COOKIE, await createSession(adminId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: BASE_PATH || "/", // chỉ gửi cookie trong phạm vi hub khi chạy dưới đường dẫn con của tên miền dùng chung
    maxAge: 12 * 3600,
  });
}

/** Mốc "phiên cấp trước đây bị huỷ", làm tròn xuống giây để token cấp ngay sau đó (cùng giây) vẫn hợp lệ. */
export const sessionCutoff = () => new Date(Math.floor(Date.now() / 1000) * 1000);

/** Người quản trị đang đăng nhập (đọc từ cookie), hoặc null. Tài khoản bị khoá hoặc phiên cấp trước lúc đổi mật khẩu → null. */
export async function currentAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    const admin = payload.sub ? await prisma.adminUser.findUnique({ where: { id: payload.sub } }) : null;
    if (!admin || admin.disabled) return null;
    if (admin.sessionsValidAfter && (payload.iat ?? 0) * 1000 < admin.sessionsValidAfter.getTime()) return null;
    return admin;
  } catch {
    return null;
  }
}

/**
 * Chặn yêu cầu do trang KHÁC gửi tới API quản trị. SameSite=Lax đã chặn khác trang web, nhưng "cùng site"
 * (vd. một ứng dụng khác chạy ở tên miền con cùng gốc) vẫn mang cookie theo — nên kiểm thêm Sec-Fetch-Site.
 * Trình duyệt không gửi header này (công cụ dòng lệnh, smoke) thì bỏ qua: chỉ trình duyệt mới bị CSRF.
 */
export async function isCrossSiteRequest(): Promise<boolean> {
  const site = (await headers()).get("sec-fetch-site");
  return Boolean(site) && site !== "same-origin" && site !== "none";
}

export async function requireAdminApi() {
  if (await isCrossSiteRequest()) return { ok: false, response: fail(403, "Yêu cầu từ trang khác không được chấp nhận") } as const;
  const admin = await currentAdmin();
  return admin ? ({ ok: true, admin } as const) : ({ ok: false, response: fail(401, "Chưa đăng nhập") } as const);
}
