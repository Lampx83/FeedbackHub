import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
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
