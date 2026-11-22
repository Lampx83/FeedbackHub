import type { Feedback, Project } from "@prisma/client";
import { projectFeatures } from "./project-config";

/** Dự án bật cổng duyệt: AI (worker/reader) chỉ được thấy góp ý đã duyệt. */
export const requiresApproval = (p: Pick<Project, "features">) => projectFeatures(p).requireApproval === true;

/** Khoá này có bị chặn khỏi góp ý chưa duyệt không (operator thì không). */
export const blockedUntilApproved = (scope: string, p: Pick<Project, "features">, fb: Pick<Feedback, "approvedAt">) =>
  scope !== "operator" && requiresApproval(p) && !fb.approvedAt;
