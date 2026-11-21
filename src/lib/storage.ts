import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./env";

/** Khớp danh sách của DGXL: ảnh ngoài danh sách này máy chủ sẽ từ chối. */
export const ALLOWED_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
};
export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_FEEDBACK = 12;

const safeName = (n: string) =>
  n.normalize("NFC").replace(/[^\p{L}\p{N}._ -]/gu, "_").replace(/^\.+/, "_").slice(0, 120) || "tep";

/** Lưu tệp ra đĩa; trả về đường dẫn TƯƠNG ĐỐI để ghi vào DB. */
export async function saveFile(projectSlug: string, feedbackId: string, fileName: string, bytes: Buffer) {
  const rel = path.join(projectSlug, feedbackId, `${randomUUID()}-${safeName(fileName)}`);
  const abs = path.join(path.resolve(dataDir()), rel);
  await mkdir(path.dirname(abs), { recursive: true });
  await writeFile(abs, bytes);
  return rel;
}

export async function readStored(rel: string): Promise<Buffer> {
  const root = path.resolve(dataDir());
  const abs = path.resolve(root, rel);
  // Chặn đường dẫn thoát khỏi thư mục dữ liệu (nếu DB bị sửa tay).
  if (!abs.startsWith(root + path.sep)) throw new Error("Đường dẫn tệp không hợp lệ");
  return readFile(abs);
}
