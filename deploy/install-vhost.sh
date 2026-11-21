#!/usr/bin/env bash
# Cài vhost nginx + chứng chỉ Let's Encrypt cho hub trên máy dùng chung nhiều site (kiểu "một hub cho nhiều ứng dụng").
# Chạy bằng sudo:  sudo bash deploy/install-vhost.sh feedback.example.com [cổng, mặc định lấy từ .env]
# Idempotent: chạy lại an toàn. Không đụng tới vhost của site khác. Cần: nginx, certbot, DNS của tên miền đã trỏ về máy này
# (hoặc qua Cloudflare proxy), cổng 80 tới được máy này để xác thực HTTP-01.
set -euo pipefail
DOMAIN="${1:?Dùng: sudo bash deploy/install-vhost.sh feedback.example.com}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${2:-$(grep -E '^HUB_PORT=' "$HERE/.env" | cut -d= -f2 || true)}"; PORT="${PORT:-3100}"
CONF="/etc/nginx/sites-available/$DOMAIN"
WEBROOT=/var/lib/letsencrypt
mkdir -p "$WEBROOT"

proxy_block() { cat <<EOB
    client_max_body_size 12m;
    location / {
        proxy_pass http://127.0.0.1:$PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        # Hub giới hạn tần suất theo IP người gửi — phải là IP thật.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 120;
    }
EOB
}

# 1) Chỉ HTTP trước (kèm đường xác thực ACME) để xin chứng chỉ.
cat > "$CONF" <<EOC
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
EOC
ln -sf "$CONF" "/etc/nginx/sites-enabled/$DOMAIN"
nginx -t && systemctl reload nginx

# 2) Xin chứng chỉ (bỏ qua nếu đã có).
if [ ! -d "/etc/letsencrypt/live/$DOMAIN" ]; then
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email
fi

# 3) Vhost đầy đủ HTTP + HTTPS.
cat > "$CONF" <<EOC
# Quản lý bởi deploy/install-vhost.sh (Feedback Hub)
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location ^~ /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    server_name $DOMAIN;
    ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
$(proxy_block)
}
EOC
nginx -t && systemctl reload nginx

# 4) Báo hub biết địa chỉ công khai để in đúng mã nhúng.
if grep -q '^HUB_PUBLIC_URL=' "$HERE/.env"; then sed -i "s|^HUB_PUBLIC_URL=.*|HUB_PUBLIC_URL=https://$DOMAIN|" "$HERE/.env"; else echo "HUB_PUBLIC_URL=https://$DOMAIN" >> "$HERE/.env"; fi
OWNER="$(stat -c %U "$HERE")"
sudo -u "$OWNER" bash -c "cd '$HERE' && docker compose up -d app"
echo "Xong. Kiểm tra: curl -s https://$DOMAIN/api/health"
