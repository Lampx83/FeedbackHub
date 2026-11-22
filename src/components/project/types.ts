import type { Features } from "@/lib/project-config";
import type { TypeDef } from "@/lib/status";
import type { Theme } from "@/lib/theme";
import type { KeyRow } from "../KeysBoard";

export type ProjectData = {
  slug: string;
  name: string;
  allowedOrigins: string[];
  submitRoles: string[];
  adminRoles: string[];
  anonymousSubmit: boolean;
  mode: string;
  deliver: string;
  types: TypeDef[];
  features: Features;
  theme: Theme;
  webhookUrl: string | null;
  notify: { emails: string[]; webhookUrl: string | null; on: "all" | "bugs" | "off" };
  workerSeenAt: string | null;
  keys: KeyRow[];
  feedbackCount: number;
};

export type SaveResult = { ok: true; warnings: string[] } | { ok: false; error: string };
/** Gửi một phần cấu hình lên PATCH /api/admin/projects/[slug]; thành công thì trạng thái dự án được cập nhật. */
export type SavePatch = Partial<Omit<ProjectData, "slug" | "keys" | "feedbackCount" | "workerSeenAt" | "features">> & { features?: Partial<Features> };
export type Save = (patch: SavePatch) => Promise<SaveResult>;
