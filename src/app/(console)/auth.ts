import { redirect } from "next/navigation";
import { currentAdmin } from "@/lib/admin-session";

/** Dùng ở layout VÀ ở từng trang đọc dữ liệu: layout không chạy lại khi chuyển trang trong phiên. */
export async function requireAdminPage() {
  const admin = await currentAdmin();
  if (!admin) redirect("/login");
  return admin;
}

/** Trang chỉ dành cho quản trị toàn hub; người khác về trang tổng quan. */
export async function requireSuperPage() {
  const admin = await requireAdminPage();
  if (!admin.superAdmin) redirect("/");
  return admin;
}
