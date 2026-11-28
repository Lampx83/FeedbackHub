/**
 * Đăng nhập bằng Google (Google Identity Services): trình duyệt lấy một ID token (JWT) từ nút của Google rồi gửi lên đây.
 * Hub kiểm chữ ký bằng khoá công khai của Google, kiểm người nhận (aud) đúng mã khách của hub, còn hạn, email đã xác minh.
 * Không cần bí mật nào ở phía hub. Chỉ ánh xạ vào tài khoản ĐÃ CÓ theo email — không tự tạo tài khoản hay cấp quyền.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { googleClientId } from "./env";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/** Trả email (chữ thường) đã được Google xác minh, hoặc null nếu token không hợp lệ. `keys` chỉ để kiểm thử. */
export async function verifyGoogleCredential(credential: string, keys: JWTVerifyGetKey = GOOGLE_JWKS, clientId = googleClientId()): Promise<{ email: string; name: string | null } | null> {
  if (!clientId) return null;
  try {
    const { payload } = await jwtVerify(credential, keys, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
      algorithms: ["RS256"],
      clockTolerance: 30,
    });
    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : "";
    if (!email || payload.email_verified !== true) return null;
    return { email, name: typeof payload.name === "string" ? payload.name : null };
  } catch {
    return null;
  }
}
