-- Chỉ thêm: thông báo (chuông trong bảng điều khiển + email/webhook theo dự án).
ALTER TABLE "AdminUser" ADD COLUMN "notifSeenAt" TIMESTAMP(3);
ALTER TABLE "Project" ADD COLUMN "notify" JSONB;
