-- Chỉ thêm: duyệt góp ý (mặc định chưa duyệt; dự án không bật requireApproval thì không ảnh hưởng gì).
ALTER TABLE "Feedback" ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "approvedBy" TEXT;
