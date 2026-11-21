# Triển khai Feedback Hub

Hub là một ứng dụng Next.js + PostgreSQL. Cách khuyến nghị: **Docker Compose** trên một máy chủ Linux (VPS 1 vCPU / 1 GB RAM là đủ cho vài chục ứng dụng), phía trước đặt Caddy hoặc nginx để có HTTPS.

## 1. Chuẩn bị

- Máy chủ có **Docker** và **Docker Compose v2** (`docker compose version`).
- Một **tên miền** trỏ về máy chủ, ví dụ `feedback.example.com` (cần HTTPS — token và khoá máy đi qua mạng).
- Cổng 80/443 mở.

## 2. Cài đặt (5 phút)

```bash
git clone https://github.com/Lampx83/FeedbackHub.git
cd FeedbackHub
cp .env.example .env
```

Sửa `.env` — **bắt buộc** điền 5 giá trị:

```bash
# Sinh chuỗi ngẫu nhiên mạnh cho 3 khoá bí mật:
openssl rand -base64 32     # → POSTGRES_PASSWORD
openssl rand -base64 32     # → AUTH_SECRET
openssl rand -base64 32     # → HUB_ENCRYPTION_KEY
```

| Biến | Bắt buộc | Ý nghĩa |
|---|---|---|
| `POSTGRES_PASSWORD` | ✔ | Mật khẩu PostgreSQL của container `db` |
| `AUTH_SECRET` | ✔ | Khoá ký cookie đăng nhập bảng điều khiển (≥ 16 ký tự). Đổi ⇒ mọi người đăng nhập lại |
| `HUB_ENCRYPTION_KEY` | ✔ | Khoá mã hoá các khoá ký token của dự án trong DB (≥ 16 ký tự). **Mất hoặc đổi ⇒ mọi khoá ký phải cấp lại.** Sao lưu riêng |
| `HUB_ADMIN_EMAIL`, `HUB_ADMIN_PASSWORD` | ✔ lần đầu | Tài khoản quản trị đầu tiên (mật khẩu ≥ 8 ký tự). Chỉ tạo khi **chưa có** ai; chạy lại không ghi đè mật khẩu. Sau khi đăng nhập được nên xoá `HUB_ADMIN_PASSWORD` khỏi `.env` |
| `HUB_PUBLIC_URL` | nên | Địa chỉ công khai có `https://` (kèm tiền tố nếu có), để in đúng đoạn mã nhúng |
| `HUB_BASE_PATH` | | Tiền tố khi chạy dưới đường dẫn con, vd. `/feedbackhub`. Đặt LÚC BUILD |
| `HUB_PORT` | | Cổng trên máy chủ (mặc định `3100`, chỉ mở cho `127.0.0.1`) |

Chạy:

```bash
docker compose up -d --build
docker compose logs -f app      # chờ "Ready"
curl -s http://127.0.0.1:3100/api/health     # {"ok":true}
```

Khi khởi động, container tự: áp migration CSDL (`prisma migrate deploy`, chỉ thêm, chạy lại an toàn) → tạo tài khoản quản trị đầu tiên nếu chưa có → chạy hub.

## 3. HTTPS bằng reverse proxy

Compose chỉ mở hub ở `127.0.0.1:3100`. Đặt proxy phía trước:

**Caddy** (tự xin và gia hạn chứng chỉ Let's Encrypt) — mẫu ở [`deploy/Caddyfile.example`](../deploy/Caddyfile.example):

```
feedback.example.com {
    encode zstd gzip
    request_body { max_size 12MB }
    reverse_proxy 127.0.0.1:3100
}
```

**Dưới đường dẫn con của tên miền có sẵn** (vd. `https://fit.neu.edu.vn/feedbackhub`, tên miền do máy khác — Apache/nginx front — phục vụ; không cần tên miền riêng):
1. Đặt `HUB_BASE_PATH=/feedbackhub` và `HUB_PUBLIC_URL=https://fit.neu.edu.vn/feedbackhub` trong `.env`, rồi `docker compose up -d --build` (tiền tố được nhúng lúc build, đổi là phải build lại).
2. Trên máy chạy hub: `sudo bash deploy/install-subpath-listener.sh 8003 <IP máy front> /feedbackhub` — mở một cổng nội bộ chỉ cho máy front gọi vào, giữ nguyên tiền tố.
3. Trên máy front thêm một luật chuyển tiếp, GIỮ tiền tố. Apache: `ProxyPass /feedbackhub/ http://<máy hub>:8003/feedbackhub/` + `ProxyPassReverse` tương ứng (nhớ `ProxyPreserveHost On`, và truyền `X-Forwarded-For`).
Mã nhúng khi đó là `<script src="https://fit.neu.edu.vn/feedbackhub/widget.js" …>`; mọi địa chỉ API của hub tự nối theo tiền tố này. Công cụ dòng lệnh/MCP/worker đặt `FEEDBACK_HUB_URL=https://fit.neu.edu.vn/feedbackhub` (có cả tiền tố).

**Máy dùng chung nhiều site** (nginx đã chạy các vhost khác): `sudo bash deploy/install-vhost.sh feedback.example.com` tạo vhost riêng, xin chứng chỉ Let's Encrypt (webroot, không đụng site khác) và đặt `HUB_PUBLIC_URL`. Một hub phục vụ được nhiều ứng dụng — mỗi ứng dụng là một *dự án* với khoá ký riêng.

**nginx + certbot** — mẫu ở [`deploy/nginx.conf.example`](../deploy/nginx.conf.example). Bắt buộc có `proxy_set_header X-Forwarded-For $remote_addr;` (hub giới hạn tần suất theo địa chỉ IP) và `client_max_body_size 12m;`.

Mở `https://feedback.example.com`, đăng nhập bằng tài khoản quản trị, rồi **đổi mật khẩu** ngay.

## 4. Việc đầu tiên sau khi chạy

1. Đăng nhập bảng điều khiển → **Thêm dự án** (mã dự án, tên, tên miền ứng dụng của bạn).
2. Lưu khoá ký token hiện ra (đặt vào cấu hình **máy chủ** của ứng dụng — không đưa lên trình duyệt, không commit).
3. Tích hợp ứng dụng: xem [INTEGRATION.md](INTEGRATION.md).
4. Chạy kiểm thử đầu-cuối để chắc hub hoạt động: `HUB=https://feedback.example.com HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… npm run smoke` (cần Node ≥ 20 và `npm install` ở máy bạn; script tạo một dự án tạm rồi xoá).

## 5. Nâng cấp

```bash
cd FeedbackHub
git pull
docker compose up -d --build      # migration tự chạy khi khởi động
```

Migration chỉ **thêm** cột/bảng, không đổi tên hay xoá cột đang dùng, nên quay về bản cũ vẫn chạy được. **Sao lưu trước** (mục 6) khi nâng cấp lên bản có migration mới.

## 6. Sao lưu và khôi phục

Cần sao lưu **ba thứ**: CSDL, thư mục tệp đính kèm, và `HUB_ENCRYPTION_KEY`.

```bash
./deploy/backup.sh      # → ~/backups/feedbackhub/db-*.sql.gz và files-*.tar.gz, giữ 14 ngày
```

Cron mỗi đêm: `30 1 * * *  cd /opt/FeedbackHub && ./deploy/backup.sh >> backup.log 2>&1`.

> ⚠️ Bản sao lưu nằm **cùng máy chủ** không cứu được khi mất máy chủ. Đồng bộ thư mục sao lưu sang nơi khác (rsync, rclone, S3…). Giữ `HUB_ENCRYPTION_KEY` ở nơi khác nữa (trình quản lý mật khẩu), **không** để trong cùng tệp sao lưu với DB.

Khôi phục:

```bash
docker compose down
docker compose up -d db
gunzip -c ~/backups/feedbackhub/db-20261121-013000.sql.gz | docker compose exec -T db psql -U hub -d feedbackhub
docker compose run --rm app sh -c 'rm -rf /app/data/*'          # nếu cần làm sạch trước
docker compose run --rm -T app tar -C /app -xz < ~/backups/feedbackhub/files-20261121-013000.tar.gz
docker compose up -d
```

(Khôi phục vào DB đã có dữ liệu thì tạo DB trống trước: `docker compose exec db psql -U hub -c 'DROP DATABASE feedbackhub; CREATE DATABASE feedbackhub;'`.)

## 7. Chạy không dùng Docker

Cần Node ≥ 20 và một PostgreSQL ≥ 14.

```bash
npm ci
export DATABASE_URL=postgresql://hub:matkhau@localhost:5432/feedbackhub
export AUTH_SECRET=… HUB_ENCRYPTION_KEY=… HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=…
export HUB_DATA_DIR=/var/lib/feedbackhub        # nơi lưu tệp đính kèm
npx prisma migrate deploy
npx prisma db seed
npm run build
npm start                                       # cổng 3000; đặt PORT=… để đổi
```

Chạy nền bằng systemd/pm2. Phát triển: `npm run dev` (cổng 3100).

## 8. Quy mô và giới hạn

- Một tiến trình hub là đủ cho tải góp ý thông thường. **Đừng chạy nhiều bản hub song song** trừ khi bạn thay bộ giới hạn tần suất trong bộ nhớ (`src/lib/rate.ts`) bằng kho dùng chung (Redis) — mỗi bản đang đếm riêng.
- Tệp đính kèm lưu trên đĩa của máy chủ (`HUB_DATA_DIR`). Nhiều bản hub phải dùng chung một thư mục (NFS) hoặc đổi `src/lib/storage.ts` sang S3.
- Giám sát: `GET /api/health` trả `200`/`503` (có kiểm DB). Bảng điều khiển hiện "worker thấy lần cuối" cho từng dự án.

## 9. Gỡ rối

| Triệu chứng | Nguyên nhân thường gặp |
|---|---|
| `app` khởi động rồi thoát, log báo thiếu biến | Thiếu `AUTH_SECRET`/`HUB_ENCRYPTION_KEY`/`POSTGRES_PASSWORD` trong `.env` |
| Không đăng nhập được lần đầu | `HUB_ADMIN_EMAIL`/`HUB_ADMIN_PASSWORD` chưa đặt lúc khởi động lần đầu; đặt rồi `docker compose restart app` |
| Widget báo `CORS`/không hiện nút | Tên miền ứng dụng chưa nằm trong **tên miền được phép** của dự án (phải khớp cả giao thức và cổng, ví dụ `https://app.example.com`) |
| `401 Chữ ký token không hợp lệ` | Khoá ký ở ứng dụng khác khoá của dự án, hoặc đồng hồ máy chủ ứng dụng lệch quá 30 giây |
| `401 Thiếu claim prj` / `Token thiếu uid hoặc name` | Token ký thiếu claim bắt buộc (xem [SPEC.md](SPEC.md) mục 5.1) |
| Tải tệp đính kèm lỗi quyền ghi | Volume `hub-data` không thuộc user `nextjs` (uid 1001); chạy `docker compose exec -u root app chown -R 1001:1001 /app/data` |
| Giới hạn tần suất sai (mọi người cùng một IP) | Reverse proxy chưa đặt `X-Forwarded-For` |
