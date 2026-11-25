import type { Feedback, Project } from "@prisma/client";
import { projectFeatures } from "./project-config";

/** Dự án bật cổng duyệt: AI (worker/reader) chỉ được thấy góp ý đã duyệt. */
export const requiresApproval = (p: Pick<Project, "features">) => projectFeatures(p).requireApproval === true;

/** Khoá này có bị chặn khỏi góp ý chưa duyệt không (operator thì không). */
export const blockedUntilApproved = (scope: string, p: Pick<Project, "features">, fb: Pick<Feedback, "approvedAt">) =>
  scope !== "operator" && requiresApproval(p) && !fb.approvedAt;

/** Vai trò của người gửi khớp quy tắc tự duyệt của dự án (không áp cho góp ý máy tự lập/nhập). */
export function autoApproveRule(p: Pick<Project, "features">, reporterRole: string | null | undefined, source: string | undefined) {
  const f = projectFeatures(p);
  if (!f.requireApproval || !reporterRole || source === "system" || source === "import") return null;
  return f.autoApproveRoles.includes(reporterRole) ? `vai trò ${reporterRole}` : null;
}

/** Nhãn người duyệt khi do quy tắc (không phải một người cụ thể). */
export const AUTO_APPROVER = "tự động (quy tắc)";
