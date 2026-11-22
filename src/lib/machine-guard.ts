import type { Feedback, Project } from "@prisma/client";
import { authenticateMachine, type MachineAuth } from "./auth-machine";
import { blockedUntilApproved } from "./approval";
import { fail } from "./http";
import { prisma } from "./prisma";

type Ok = Extract<MachineAuth, { ok: true }>;

/** Xác thực khoá máy và đòi phải xác định được dự án (worker: từ khoá; operator: từ ?project=). */
export async function machineProject(
  req: Request,
): Promise<{ ok: true; auth: Ok; project: Project } | { ok: false; response: ReturnType<typeof fail> }> {
  const auth = await authenticateMachine(req);
  if (!auth.ok) return auth;
  if (!auth.project) return { ok: false, response: fail(400, "Khoá operator phải kèm ?project=<slug>") };
  return { ok: true, auth, project: auth.project };
}

/** Như trên nhưng cho các route theo id góp ý: dự án suy ra từ chính góp ý, rồi kiểm quyền của khoá. */
export async function machineFeedback(
  req: Request,
  id: string,
): Promise<
  { ok: true; auth: Ok; project: Project; fb: Feedback } | { ok: false; response: ReturnType<typeof fail> }
> {
  const auth = await authenticateMachine(req);
  if (!auth.ok) return auth;
  const fb = await prisma.feedback.findUnique({ where: { id } });
  if (!fb) return { ok: false, response: fail(404, "Không tìm thấy góp ý") };
  if (auth.scope !== "operator" && auth.project?.id !== fb.projectId) {
    return { ok: false, response: fail(403, "Góp ý này không thuộc dự án của khoá") };
  }
  const project = auth.project?.id === fb.projectId ? auth.project : await prisma.project.findUnique({ where: { id: fb.projectId } });
  if (!project) return { ok: false, response: fail(404, "Dự án không còn tồn tại") };
  // Cổng duyệt: AI không đụng được góp ý chưa duyệt (đọc, nhận, nhắn, đổi trạng thái…) — đây là điểm chặn chung của mọi route theo id.
  if (blockedUntilApproved(auth.scope, project, fb)) return { ok: false, response: fail(403, "Góp ý này chưa được quản trị dự án duyệt") };
  return { ok: true, auth, project, fb };
}

export const actorOf = (a: Ok) => (a.scope === "worker" ? ("ai" as const) : ("ai_manual" as const));
export const authorOf = (a: Ok) => (a.scope === "worker" ? "Trợ lý AI" : "Claude (làm tay)");
