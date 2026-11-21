#!/usr/bin/env bash
# Hub chạy dưới đường dẫn con của một tên miền do máy KHÁC phục vụ (vd. Apache ở máy front: https://fit.neu.edu.vn/feedbackhub
# → http://<máy này>:8003/feedbackhub). Script mở một cổng nội bộ trên nginx của máy này, chỉ cho máy front gọi vào,
# và chuyển tiếp tới hub GIỮ NGUYÊN tiền tố (hub phải build với HUB_BASE_PATH cùng tiền tố — xem docs/DEPLOY.md).
#
#   sudo bash deploy/install-subpath-listener.sh [cổng=8003] [IP máy front=192.168.100.85] [tiền tố=/feedbackhub]
#
# Idempotent; chỉ thêm 1 file /etc/nginx/sites-available/feedbackhub-<cổng>, không đụng site khác.
set -euo pipefail
LPORT="${1:-8003}"; FRONT_IP="${2:-192.168.100.85}"; PREFIX="${3:-/feedbackhub}"; PREFIX="/${PREFIX#/}"; PREFIX="${PREFIX%/}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
HPORT="$(grep -E '^HUB_PORT=' "$HERE/.env" | cut -d= -f2 || true)"; HPORT="${HPORT:-3100}"
CONF="/etc/nginx/sites-available/feedbackhub-$LPORT"
cat > "$CONF" <<EOC
# Quản lý bởi deploy/install-subpath-listener.sh (Feedback Hub) — chỉ máy front được gọi vào.
server {
    listen $LPORT;
    server_name _;
    allow 127.0.0.1;
    allow $FRONT_IP;
    deny all;

    client_max_body_size 12m;

    location $PREFIX/ {
        proxy_pass http://127.0.0.1:$HPORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # Tên miền dùng chung thường mang nhiều cookie của app khác (dễ vượt 8 KB) — chỉ chuyển cookie phiên của hub.
        proxy_set_header Cookie "hub_session=\$cookie_hub_session";
        # Hub giới hạn tần suất theo IP người gửi: giữ chuỗi X-Forwarded-For do máy front đặt.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120;
    }
    # Gốc: hub (Next) chuyển "$PREFIX/" về "$PREFIX" còn máy front lại chuyển "$PREFIX" về "$PREFIX/" => vòng lặp.
    # Nhận cả hai dạng và đưa vào hub ở dạng không có dấu / cuối, để không ai phải chuyển hướng.
    location = $PREFIX/ { proxy_pass http://127.0.0.1:$HPORT$PREFIX; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header Cookie "hub_session=\$cookie_hub_session"; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; }
    location = $PREFIX { proxy_pass http://127.0.0.1:$HPORT$PREFIX; proxy_http_version 1.1; proxy_set_header Host \$host; proxy_set_header Cookie "hub_session=\$cookie_hub_session"; proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for; proxy_set_header X-Forwarded-Proto https; }
}
EOC
ln -sf "$CONF" "/etc/nginx/sites-enabled/feedbackhub-$LPORT"
nginx -t && systemctl reload nginx
echo "Xong. Máy này nghe cổng $LPORT (cho $FRONT_IP) → hub 127.0.0.1:$HPORT$PREFIX/"
echo "Kiểm tra tại máy này: curl -s http://127.0.0.1:$LPORT$PREFIX/api/health"
