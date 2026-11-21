#!/usr/bin/env bash
# Giống install-subpath-listener.sh nhưng KHÔNG cần sudo/nginx của máy: chạy một container nginx nhỏ (mạng host) nghe một
# cổng nội bộ, chỉ cho máy front gọi vào, và chuyển tiếp tới hub GIỮ NGUYÊN tiền tố. Dùng khi user chỉ có quyền docker.
#
#   bash deploy/docker-subpath-listener.sh [cổng=8003] [IP máy front=192.168.100.85] [tiền tố=/feedbackhub]
#
# Idempotent: chạy lại sẽ thay container cũ (feedbackhub-listener-<cổng>). Tự khởi động lại cùng Docker.
set -euo pipefail
LPORT="${1:-8003}"; FRONT_IP="${2:-192.168.100.85}"; PREFIX="${3:-/feedbackhub}"; PREFIX="/${PREFIX#/}"; PREFIX="${PREFIX%/}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
HPORT="$(grep -E '^HUB_PORT=' "$HERE/.env" | cut -d= -f2 || true)"; HPORT="${HPORT:-3100}"
NAME="feedbackhub-listener-$LPORT"
CONF_DIR="$HERE/deploy/.listener-$LPORT"
mkdir -p "$CONF_DIR"
cat > "$CONF_DIR/default.conf" <<EOC
# Quản lý bởi deploy/docker-subpath-listener.sh (Feedback Hub) — chỉ máy front được gọi vào.
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
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" --restart unless-stopped --network host \
  -v "$CONF_DIR/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:1.27-alpine >/dev/null
sleep 1
echo "Xong. Container $NAME nghe cổng $LPORT (cho $FRONT_IP) → hub 127.0.0.1:$HPORT$PREFIX/"
echo "Kiểm tra tại máy này: curl -s http://127.0.0.1:$LPORT$PREFIX/api/health"
