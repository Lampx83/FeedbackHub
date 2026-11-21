import "dotenv/config";
import { hash } from "bcryptjs";
import { PrismaClient } from "@prisma/client";

/**
 * Tạo tài khoản quản trị đầu tiên từ HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD (chỉ khi chưa có ai).
 * Chạy lại an toàn: không ghi đè mật khẩu của tài khoản đã có.
 */
const prisma = new PrismaClient();

async function main() {
  const email = process.env.HUB_ADMIN_EMAIL?.toLowerCase();
  const password = process.env.HUB_ADMIN_PASSWORD;
  if (!email || !password) {
    console.log("Bỏ qua: chưa đặt HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD.");
    return;
  }
  if (password.length < 8) throw new Error("HUB_ADMIN_PASSWORD tối thiểu 8 ký tự.");
  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) {
    console.log(`Tài khoản ${email} đã có — giữ nguyên.`);
    return;
  }
  await prisma.adminUser.create({ data: { email, name: "Quản trị Hub", passwordHash: await hash(password, 12) } });
  console.log(`Đã tạo tài khoản quản trị ${email}.`);
}

main().finally(() => prisma.$disconnect());
