-- Chỉ thêm: ghi hàng rào đã chặn lượt chạy AI gần nhất.
ALTER TABLE "Feedback" ADD COLUMN "guardrailKind" TEXT,
ADD COLUMN "guardrailDetail" TEXT,
ADD COLUMN "guardrailAt" TIMESTAMP(3);
