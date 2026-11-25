-- Token truy cập cá nhân cho quản trị viên (chỉ thêm bảng, không đụng dữ liệu cũ).
CREATE TABLE "AdminToken" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminToken_hash_key" ON "AdminToken"("hash");
CREATE INDEX "AdminToken_adminId_idx" ON "AdminToken"("adminId");
ALTER TABLE "AdminToken" ADD CONSTRAINT "AdminToken_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
