/**
 * Tiền tố đường dẫn khi hub chạy dưới một đường dẫn con của tên miền (vd. https://fit.neu.edu.vn/feedbackhub).
 * Đặt bằng biến HUB_BASE_PATH LÚC BUILD (Next nhúng giá trị vào mã trình duyệt), vd. "/feedbackhub"; rỗng = chạy ở gốc.
 * `next/link`, `router`, `redirect()` tự thêm tiền tố; còn `fetch()`, `<a href>`, `<img src>` viết tay thì phải qua withBase().
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const withBase = (p: string) => (p.startsWith("/") ? BASE_PATH + p : p);
