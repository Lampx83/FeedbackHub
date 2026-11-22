-- Chỉ thêm: tài khoản có sẵn giữ nguyên quyền (superAdmin mặc định true).
ALTER TABLE "AdminUser" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "sessionsValidAfter" TIMESTAMP(3);

CREATE TABLE "ProjectMember" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectMember_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProjectMember_projectId_adminId_key" ON "ProjectMember"("projectId", "adminId");
CREATE INDEX "ProjectMember_adminId_idx" ON "ProjectMember"("adminId");

ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "AdminUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
