/**
 * Trạng thái và loại góp ý — NƠI DUY NHẤT định nghĩa (giữ nguyên bộ của DGXL để chuyển sang không đổi hành vi).
 * Thêm trạng thái mà quên đặt nhãn là lỗi biên dịch nhờ Record<Status, …>.
 */
export const STATUSES = ["pending", "reviewing", "deploying", "awaiting_user", "done", "rejected"] as const;
export type Status = (typeof STATUSES)[number];

/** Trạng thái NGƯỜI được đặt qua API. `deploying` chỉ do script triển khai đặt. */
export const HUMAN_SETTABLE = ["pending", "reviewing", "awaiting_user", "done", "rejected"] as const;

/** Còn mở: gửi trùng hệt một góp ý đang ở đây thì coi là trùng. */
export const OPEN_STATUSES: readonly string[] = ["pending", "reviewing", "deploying", "awaiting_user"];
/** Worker nhận việc ở các trạng thái này. */
export const QUEUE_STATUSES: readonly string[] = ["pending", "reviewing"];

export const STATUS_LABEL: Record<Status, string> = {
  pending: "Chờ nhận",
  reviewing: "Đang làm",
  deploying: "Đang cập nhật",
  awaiting_user: "Chờ người gửi trả lời",
  done: "Hoàn thành",
  rejected: "Không thực hiện",
};

export const KINDS = ["function", "content", "bug", "question", "other"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  function: "Chức năng",
  content: "Nội dung",
  bug: "Lỗi",
  question: "Câu hỏi",
  other: "Khác",
};

/**
 * `roles` (tuỳ chọn): chỉ những `role` trong token này được chọn/gửi loại này; rỗng hoặc vắng = mọi người gửi được góp ý.
 * Quản trị dự án (adminRoles) luôn được. Kiểm ở API (POST /api/v1/feedback), widget chỉ ẩn khỏi danh sách.
 */
export type TypeDef = { id: string; label: string; kind: Kind; roles?: string[] };

/** Loại mặc định cho dự án mới. */
export const DEFAULT_TYPES: TypeDef[] = [
  { id: "function", label: "Đề xuất chức năng", kind: "function" },
  { id: "content", label: "Sửa nội dung", kind: "content" },
  { id: "bug", label: "Báo lỗi", kind: "bug" },
  { id: "question", label: "Câu hỏi", kind: "question" },
  { id: "other", label: "Khác", kind: "other" },
];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { low: "Thấp", normal: "Bình thường", high: "Cao", urgent: "Khẩn" };

export const ACTORS = ["human", "ai", "ai_manual", "system"] as const;
export type Actor = (typeof ACTORS)[number];
