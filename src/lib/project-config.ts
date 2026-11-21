import type { Project } from "@prisma/client";
import { DEFAULT_TYPES, type TypeDef } from "./status";
import { parseTheme } from "./theme";

export type Features = {
  scopePicker: boolean;
  elementPicker: boolean;
  voice: boolean;
  attachments: boolean;
  planApproval: boolean;
  successCriteria: boolean;
  /** Ảnh chụp trang kèm góp ý: off = không; optional = có ô chọn (mặc định bỏ chọn); default = có ô chọn (mặc định chọn). */
  screenshot: "off" | "optional" | "default";
  /** Mô hình người gửi được chọn cho từng góp ý (chỉ có nghĩa khi mode=execute). */
  models: { id: string; label: string }[];
  /**
   * Bôi đen chữ → hiện bong bóng "Góp ý đoạn này" ngay cạnh vùng chọn; bấm vào thì mở ngăn góp ý với đoạn chữ điền
   * sẵn. Ứng dụng chủ không phải viết thêm mã.
   */
  textSelection: boolean;
  /** Chỉ hiện bong bóng khi bôi đen bên trong vùng khớp bộ chọn CSS này (vd. "#lesson-content, article"). Rỗng = cả trang. */
  selectionScope: string;
  /** Chỉ những `role` (trong token) này mới thấy bong bóng bôi đen. Rỗng = mọi người gửi được góp ý. */
  selectionRoles: string[];
  /**
   * Tiền tố đường dẫn mà widget tự ẩn mọi lối vào (nút nổi, nút gắn trong trang, bong bóng bôi đen), vd. trang làm bài thi.
   * So với `location.pathname` của ứng dụng chủ (gồm cả tiền tố đường dẫn nếu ứng dụng chạy dưới đường dẫn con).
   */
  hidePaths: string[];
};

export const DEFAULT_FEATURES: Features = {
  scopePicker: true,
  elementPicker: true,
  voice: true,
  attachments: true,
  planApproval: false,
  successCriteria: false,
  screenshot: "optional",
  models: [],
  textSelection: false,
  selectionScope: "",
  selectionRoles: [],
  hidePaths: [],
};

export function projectTypes(p: Pick<Project, "types">): TypeDef[] {
  const t = p.types as unknown;
  return Array.isArray(t) && t.length ? (t as TypeDef[]) : DEFAULT_TYPES;
}

export function projectFeatures(p: Pick<Project, "features">): Features {
  return { ...DEFAULT_FEATURES, ...((p.features as Partial<Features>) ?? {}) };
}

/** Phần cấu hình công khai mà widget cần — KHÔNG chứa khoá bí mật hay webhook. */
export function publicConfig(p: Project) {
  const theme = parseTheme(p.theme);
  return {
    slug: p.slug,
    name: p.name,
    mode: p.mode,
    anonymousSubmit: p.anonymousSubmit,
    types: projectTypes(p),
    features: projectFeatures(p),
    theme: theme.ok ? theme.value : {},
  };
}
