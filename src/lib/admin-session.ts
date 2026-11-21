import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
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

/** Người quản trị đang đăng nhập (đọc từ cookie), hoặc null. Dùng trong trang và route. */
export async function currentAdmin() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    return payload.sub ? await prisma.adminUser.findUnique({ where: { id: payload.sub } }) : null;
  } catch {
    return null;
  }
}

export async function requireAdminApi() {
  const admin = await currentAdmin();
  return admin ? ({ ok: true, admin } as const) : ({ ok: false, response: fail(401, "Chưa đăng nhập") } as const);
}
