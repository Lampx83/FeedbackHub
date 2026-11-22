import type { NextConfig } from "next";

// Chạy dưới đường dẫn con (vd. "/feedbackhub")? Đặt HUB_BASE_PATH lúc build. Xem src/lib/base-path.ts.
const basePath = (process.env.HUB_BASE_PATH || "").replace(/\/+$/, "");
if (basePath && !/^\/[\w\-./]*$/.test(basePath)) throw new Error(`HUB_BASE_PATH không hợp lệ: ${basePath}`);

const nextConfig: NextConfig = {
  ...(basePath ? { basePath } : {}),
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  async headers() {
    return [
      {
        // Mọi trang: không cho nhúng khung (chống clickjacking bảng điều khiển), không đoán kiểu nội dung.
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
      {
        // Thư viện chụp trang nạp theo yêu cầu (import()) từ trang của ứng dụng khác nên cũng cần CORS mở.
        source: "/vendor/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=86400" },
        ],
      },
      {
        // widget.js được nhúng vào trang của ứng dụng khác nên phải tải được từ mọi nguồn.
        // Giữ bộ nhớ đệm ngắn: sửa widget xong ứng dụng chủ thấy trong vòng vài phút.
        source: "/widget.js",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Cache-Control", value: "public, max-age=300" },
        ],
      },
    ];
  },
};

export default nextConfig;
