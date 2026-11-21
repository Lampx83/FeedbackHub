/**
 * Cấu hình từ biến môi trường. Thiếu khoá bí mật khi chạy thật là lỗi to, không rơi về giá trị
 * mặc định: một khoá đoán được còn tệ hơn không chạy.
 */
function secret(name: string): string {
  const v = process.env[name];
  if (v && v.length >= 16) return v;
  if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error(`Thiếu biến môi trường ${name} (tối thiểu 16 ký tự).`);
  }
  return `dev-only-${name}-0123456789abcdef`;
}

export const authSecret = () => secret("AUTH_SECRET");
export const encryptionKey = () => secret("HUB_ENCRYPTION_KEY");
export const dataDir = () => process.env.HUB_DATA_DIR || "./data";
/** Địa chỉ công khai của hub — để in vào đoạn mã nhúng. */
export const publicUrl = () => (process.env.HUB_PUBLIC_URL || "").replace(/\/$/, "");
