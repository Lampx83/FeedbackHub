/** Nhãn tiếng Việt cho các giá trị kỹ thuật của dự án. (Nhãn trạng thái/loại góp ý ở lib/status.ts.) */
export const MODE_LABEL: Record<string, string> = { execute: "Làm ngay", collect: "Chỉ thu nhận" };
export const DELIVER_LABEL: Record<string, string> = { branch: "Mở nhánh chờ duyệt", deploy: "Tự triển khai" };

export const ROLE_LABEL: Record<string, string> = { user: "Người gửi", admin: "Quản trị", ai: "AI" };
export const ACTOR_LABEL: Record<string, string> = { human: "Người", ai: "AI", ai_manual: "AI (làm tay)", system: "Hệ thống" };
export const SOURCE_LABEL: Record<string, string> = { widget: "Nút nổi", board: "Bảng góp ý", api: "API", import: "Nhập từ nơi khác", system: "Hệ thống" };
export const VERIFY_LABEL: Record<string, string> = { pass: "Đạt", fail: "Không đạt", skipped: "Bỏ qua" };
export const VERDICT_LABEL: Record<string, string> = { accepted: "Chấp nhận", rejected: "Từ chối" };

/** Bỏ dấu tiếng Việt để gợi ý mã dự án từ tên. */
export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 41);
}

export function isHttpOrigin(v: string): string | null {
  if (v === "*") return null;
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:" ? null : "Địa chỉ phải bắt đầu bằng http:// hoặc https://";
  } catch {
    return "Không phải địa chỉ hợp lệ, ví dụ https://ung-dung.example.com";
  }
}
