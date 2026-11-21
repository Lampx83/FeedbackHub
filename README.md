# Feedback Hub

**Hộp góp ý dùng chung cho mọi ứng dụng — nơi người dùng góp ý, AI đọc và tự sửa, người duyệt.**

*[English](README.en.md)*

Feedback Hub là một dịch vụ nhỏ (Next.js + PostgreSQL) cộng một widget JavaScript. Bạn nhúng **một thẻ `<script>`** vào ứng dụng của mình; người dùng bấm nút 💡 để góp ý về **chức năng**, **nội dung**, **lỗi** hay đặt **câu hỏi**. Góp ý đổ về hub, nơi:

- **người** đọc, trả lời, phân loại; hoặc
- **AI (Claude Code)** nhận việc, sửa mã, dựng thử, giao kết quả — rồi **hỏi lại người gửi** khi chưa rõ và **chờ họ nghiệm thu**.

> Ý tưởng: phần mềm không chỉ được phát triển bởi lập trình viên ngồi trong phòng, mà **tiến hoá theo ý định của chính người dùng** — góp ý của khách hàng, của chuyên gia, của nhóm phân tích nghiệp vụ, và cả dữ liệu sử dụng. AI đọc, đề xuất và làm; lập trình viên duyệt và xử lý phần khó.

Hệ thống được tách ra từ DGXL (một ứng dụng nội bộ của tác giả) — nơi vòng lặp này đã chạy thật hằng ngày với người dùng thật — và tổng quát hoá để **bất kỳ ứng dụng hoặc lập trình viên nào cũng dùng được**.

## Vì sao dùng

| | |
|---|---|
| **Cắm vào trong 15 phút** | Một endpoint ký token (≈ 10 dòng, ví dụ cho Node/Python/PHP/Go) + một thẻ `<script>`. Không cần sửa CSDL của ứng dụng |
| **Một chuẩn cho nhiều ứng dụng** | Mọi ứng dụng dùng chung mô hình dữ liệu, trạng thái, API → một bảng điều khiển cho tất cả; dùng lại công cụ, không viết lại hộp góp ý lần thứ n |
| **Hợp cả sửa nội dung** | Chỉ chỗ cần sửa bằng chuột, bôi đen chữ để đề xuất "trước → sau", gắn mã bản ghi nội dung (`contentRef`) |
| **AI làm nhưng không tự tung hoành** | Chế độ `collect` (chỉ thu nhận) hoặc `execute` (AI làm); giao `branch` (chờ duyệt) hoặc `deploy` (sao lưu → triển khai → kiểm tra → tự quay lui); duyệt kế hoạch trước khi sửa; **AI "báo xong" phải kèm chuỗi kiểm chứng được** mà worker tự tìm trong bản đang chạy |
| **Người ở trong vòng lặp** | AI hỏi lại khi mơ hồ; người gửi **nghiệm thu "đúng ý / chưa đúng"** (máy không tự điền được); nút **Dừng** |
| **Giao diện theo thương hiệu bạn** | Màu, bo góc, phông, vị trí, chữ, biểu tượng, chế độ tối; biến CSS `--fh-*` xuyên Shadow DOM |
| **Tự lưu trữ, mã nguồn mở** | Docker Compose, dữ liệu ở máy bạn. Giấy phép MIT |

## Cách hoạt động

```
 Ứng dụng của bạn                    Feedback Hub                      Bên xử lý
┌─────────────────┐  token ký   ┌───────────────────┐  khoá worker ┌─────────────────────┐
│ <script widget> │ ──────────▶ │ API người dùng    │ ◀─────────── │ worker: Claude Code │
│ nút 💡 + ngăn   │   góp ý     │ PostgreSQL        │              │ tự sửa/dựng/giao    │
│ kéo góp ý       │ ◀────────── │ bảng điều khiển   │ ◀─────────── │ MCP / CLI: Claude   │
│ + endpoint token│   webhook   └───────────────────┘ khoá operator│ làm tay cho bạn     │
└─────────────────┘                                                └─────────────────────┘
```

Trạng thái của một góp ý: `pending` → `reviewing` → (`awaiting_user` ⇄ hỏi lại người gửi) → `deploying` → `done` | `rejected`. Chi tiết: [docs/SPEC.md](docs/SPEC.md).

## Bắt đầu nhanh

### 1. Chạy hub (5 phút)

Cần Docker + Docker Compose v2.

```bash
git clone https://github.com/Lampx83/FeedbackHub.git
cd FeedbackHub
cp .env.example .env
# Điền POSTGRES_PASSWORD, AUTH_SECRET, HUB_ENCRYPTION_KEY (mỗi cái: openssl rand -base64 32)
# và HUB_ADMIN_EMAIL / HUB_ADMIN_PASSWORD (tài khoản quản trị đầu tiên)
docker compose up -d --build
curl -s http://127.0.0.1:3100/api/health        # {"ok":true}
```

Mở `http://127.0.0.1:3100`, đăng nhập bằng tài khoản vừa đặt. Đưa lên máy chủ thật (HTTPS, sao lưu): xem [docs/DEPLOY.md](docs/DEPLOY.md).

### 2. Tạo dự án và nhúng vào ứng dụng

Bảng điều khiển → **Dự án** → thêm dự án (mã ví dụ `my-app`, khai tên miền ứng dụng) → lấy **khoá ký**. Rồi:

```js
// Máy chủ ứng dụng của bạn — chỉ người đã đăng nhập mới nhận được token
app.get("/api/feedback-token", requireLogin, async (req, res) => {
  const token = await new SignJWT({ prj: "my-app", uid: String(req.user.id), name: req.user.name, role: req.user.role })
    .setProtectedHeader({ alg: "HS256" }).setAudience("feedback-hub")
    .setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.FEEDBACK_HUB_SECRET));
  res.json({ token });
});
```

```html
<script src="https://feedback.example.com/widget.js"
        data-project="my-app" data-token-url="/api/feedback-token" defer></script>
```

Xong — người đã đăng nhập thấy nút 💡. Ví dụ cho Next.js, Python, PHP, Go, chế độ ẩn danh, webhook: [docs/INTEGRATION.md](docs/INTEGRATION.md).

### 3. (Tuỳ chọn) Cho AI tự làm

Mặc định dự án ở chế độ `collect`: chỉ thu nhận, người xử lý. Muốn Claude Code tự làm:

- **Làm tay có Claude** — gắn [MCP server](mcp/README.md) vào Claude Code/Desktop: *"Lấy các góp ý mới của my-app và sửa giúp"*.
- **Tự động hoàn toàn** — chạy [worker](worker/README.md) bằng cron: nó nhận góp ý cũ nhất, để Claude Code sửa, dựng thử, kiểm chứng, giao nhánh hoặc triển khai.

Đọc [docs/OPERATIONS.md](docs/OPERATIONS.md) và [docs/SECURITY.md](docs/SECURITY.md) **trước khi** bật `execute` — AI đọc nội dung do người dùng nhập, nên cần ranh giới đúng.

## Trong kho này có gì

| Thư mục | Nội dung |
|---|---|
| `src/` | Hub: API người dùng `/api/v1`, API máy `/api/v1/machine`, bảng điều khiển |
| `public/widget.js` | Widget nhúng (JS thuần, Shadow DOM, không phụ thuộc). `public/demo.html` để thử |
| `worker/` | Worker tự xử lý góp ý bằng Claude Code (Node ≥ 20, không phụ thuộc gói ngoài) |
| `mcp/` | MCP server để Claude làm tay qua khoá operator |
| `deploy/` | Mẫu Caddy/nginx, script sao lưu |
| `docs/` | Tài liệu (dưới đây) |
| `scripts/` | `mint-token.mjs` (ký token thử), `smoke.mjs` (kiểm thử đầu-cuối 49 bước) |

## Tài liệu

| Tài liệu | Dành cho |
|---|---|
| [docs/INTEGRATION.md](docs/INTEGRATION.md) | Lập trình viên của ứng dụng chủ: token, thẻ script, webhook, ẩn danh |
| [docs/DEPLOY.md](docs/DEPLOY.md) | Người vận hành hub: Docker, HTTPS, sao lưu, nâng cấp |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Chế độ collect/execute, worker, MCP, quy trình xử lý |
| [docs/THEMING.md](docs/THEMING.md) | Tuỳ biến giao diện |
| [docs/API.md](docs/API.md) | Tham chiếu API đầy đủ |
| [docs/SPEC.md](docs/SPEC.md) | **Đặc tả chuẩn** (mô hình dữ liệu, trạng thái, quyền) |
| [docs/SECURITY.md](docs/SECURITY.md) | Mô hình bảo mật, giới hạn đã biết, danh sách việc phải làm |
| [docs/MIGRATION.md](docs/MIGRATION.md) | Chuyển góp ý có sẵn trong ứng dụng sang hub (ví dụ DGXL) |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Đóng góp, chạy thử cục bộ |

## Phát triển cục bộ

```bash
docker run -d --name fh-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=feedbackhub -p 5437:5432 postgres:16-alpine
cp .env.example .env     # DATABASE_URL=postgresql://postgres:pw@localhost:5437/feedbackhub
npm install && npx prisma migrate deploy && npm run db:seed
npm run dev              # http://localhost:3100
npm run smoke            # kiểm thử đầu-cuối (cần hub đang chạy)
```

## Tình trạng

Phiên bản `0.1`. Lõi (API, máy trạng thái, worker, widget) đã được kiểm thử đầu-cuối và được dùng thật ở DGXL. **Chưa có kiểm định bảo mật độc lập** — xem [giới hạn đã biết](docs/SECURITY.md#giới-hạn-đã-biết-đừng-giả-định-là-đã-được-che). Lỗi và ý tưởng: mở Issue — và vì đây là hộp góp ý, hãy thử nhúng chính nó vào ứng dụng của bạn rồi góp ý 😄.

## Giấy phép

[MIT](LICENSE) © 2026 Lampx83
