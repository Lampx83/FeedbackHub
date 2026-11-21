# Tham chiếu API

Cơ sở: `https://<hub>/api/v1`. Mọi phản hồi là JSON; lỗi có dạng `{ "error": "thông điệp tiếng Việt", ...thêm }` kèm mã HTTP đúng nghĩa (`400` dữ liệu sai, `401` chưa xác thực, `403` không đủ quyền, `404`, `409` xung đột, `413`/`415` tệp, `429` gửi quá nhanh).

Khái niệm (token, khoá máy, trạng thái, quyền) xem [SPEC.md](SPEC.md). Dưới đây `$HUB` là địa chỉ hub, `$TOKEN` là token người dùng, `$KEY` là khoá máy.

- [1. API người dùng cuối](#1-api-người-dùng-cuối-token-người-dùng)
- [2. API máy (worker / operator)](#2-api-máy-worker--operator)
- [3. API quản trị bảng điều khiển](#3-api-quản-trị-bảng-điều-khiển-cookie)

CORS: các route của mục 1 trả `Access-Control-Allow-Origin` khi `Origin` của yêu cầu nằm trong `allowedOrigins` của dự án. Mục 2 và 3 **không** mở CORS (chỉ gọi từ máy chủ).

---

## 1. API người dùng cuối (token người dùng)

### `GET /config?project=<slug>` — công khai

Cấu hình công khai cho widget. Không chứa khoá hay webhook.

```json
{ "slug": "my-app", "name": "Ứng dụng của tôi", "mode": "collect", "anonymousSubmit": false,
  "types": [{ "id": "function", "label": "Đề xuất chức năng", "kind": "function" },
            { "id": "cai-tien", "label": "Yêu cầu cải tiến", "kind": "function", "roles": ["ADMIN"] }],  // roles: tuỳ chọn, rỗng = mọi người
  "features": { "scopePicker": true, "elementPicker": true, "voice": true, "attachments": true,
                "planApproval": false, "successCriteria": false, "screenshot": "optional", "models": [],
                "textSelection": false, "selectionScope": "", "selectionRoles": [], "hidePaths": [] },
  "theme": { "primary": "#1d4ed8", "position": "bottom-right" } }
```

### `POST /feedback` — gửi góp ý

```bash
curl -X POST $HUB/api/v1/feedback \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "type": "content",
    "title": "Câu 12 sai đáp án",
    "body": "Đáp án đúng là \"Hà Nội\", không phải \"Huế\".",
    "pagePath": "/quiz/12",
    "pageTarget": "main > h2 | Câu 12",
    "contentRef": "question:12",
    "suggestion": { "before": "Huế", "after": "Hà Nội" },
    "source": "widget"
  }'
```

| Trường | Kiểu | Ghi chú |
|---|---|---|
| `title` | chuỗi 4–200 | **Bắt buộc** |
| `body` | chuỗi ≤ 20 000 | |
| `kind` | `function`\|`content`\|`bug`\|`question`\|`other` | Mặc định suy ra từ `type`, không có thì `other` |
| `type` | chuỗi | Phải nằm trong danh sách loại của dự án, không thì `400` |
| `pagePath` | chuỗi ≤ 200 | Đường dẫn nội bộ: bắt đầu bằng đúng một `/`; không khoảng trắng, `<`, `>`, dấu nháy, `\` |
| `pageUrl` | URL | |
| `scope` | `page`\|`system` | Mặc định `page`. `system` = việc chung toàn hệ thống (client nên không gửi `pagePath`/`pageTarget`) |
| `pageTarget` | chuỗi ≤ 500 | `"<selector> \| <chữ>"` |
| `suggestion` | `{before, after}` | Mỗi ô ≤ 2000 |
| `contentRef` | chuỗi ≤ 200 | |
| `extra` | object | Dữ liệu riêng của ứng dụng |
| `source` | chuỗi `^[a-z0-9_-]{1,20}$` | Đường vào, để phân tích (vd. `widget`, `fab`). Mặc định `api` |
| `successCriteria` | chuỗi ≤ 300 | |
| `requirePlan` | bool | Yêu cầu duyệt kế hoạch trước khi AI sửa |
| `aiProvider` | `^[a-z0-9_-]{1,20}$` | Worker chỉ chấp nhận nhà cung cấp nằm trong danh sách **cục bộ** của nó |
| `aiModel` | chuỗi | Phải nằm trong `features.models` của dự án |
| `allowDuplicate` | bool | Gửi dù đã có góp ý giống hệt đang mở |
| `name`, `email` | chuỗi | Chỉ dùng khi gửi ẩn danh |

Trả `200 { "ok": true, "feedback": { … } }`. Trùng ⇒ `409 { "error": "…", "duplicateOf": { "id", "title", "status" } }`.

Gửi ẩn danh (dự án bật `anonymousSubmit`): bỏ header `Authorization`, thêm `X-Hub-Project: <slug>`.

### `GET /feedback` — danh sách

Quản trị dự án thấy tất cả; người khác chỉ thấy của mình. Lọc: `status`, `kind`, `contentRef`. Trả `{ items, stats, isAdmin }` (`stats` = số góp ý theo trạng thái).

`GET /feedback?summary=1` ⇒ `{ "awaitingIds": ["…"] }`: id các góp ý **của chính người gọi** đang chờ họ trả lời (để hiện số đỏ trên nút nổi).

### `GET /feedback/{id}` — chi tiết

`{ "feedback": { …, "messages": [ … ] }, "attachments": [ { id, fileName, mimeType, sizeBytes, createdAt } ] }`. Chỉ người gửi hoặc quản trị dự án; còn lại `403`.

### `PATCH /feedback/{id}` — người gửi/quản trị cập nhật

Phải có **ít nhất một** trường:

| Trường | Ai | Hiệu lực |
|---|---|---|
| `message` (chuỗi) | người gửi, quản trị | Thêm tin nhắn. Nếu đang `awaiting_user` ⇒ tự về `pending` |
| `userVerdict` (`accepted`\|`rejected`) | người gửi, quản trị | Nghiệm thu. `rejected` ⇒ mở lại (`pending`) |
| `planApproval` (`"approved"`) | người gửi, quản trị | Duyệt kế hoạch ⇒ `pending` |
| `stop` (`true`) | người gửi, quản trị | Dừng. `409` nếu không còn `pending`/`reviewing` |
| `status` | **chỉ quản trị dự án** | `pending`\|`reviewing`\|`awaiting_user`\|`done`\|`rejected` (không có `deploying`) |

### `POST /feedback/{id}/attachments` — đính kèm tệp

`multipart/form-data`, trường `file`. ≤ 10 MB, ≤ 12 tệp/góp ý; loại không được phép ⇒ `415`.

### `GET /attachments/{id}` — tải tệp

Token trong header **hoặc** `?t=<token>`. Chỉ người gửi/quản trị dự án.

---

## 2. API máy (worker / operator)

Header: `Authorization: Bearer $KEY` (khoá `fhk_w_…` hoặc `fhk_o_…`). Khoá **operator** chọn dự án bằng `?project=<slug>`; khoá **worker** đã gắn sẵn một dự án (truyền `?project=` khác dự án của nó ⇒ `403`).

### `GET /machine/projects`
Danh sách dự án kèm `counts` (số góp ý theo trạng thái). Operator thấy tất cả; worker chỉ thấy dự án của mình.

### `GET /machine/queue`
Hàng đợi của worker: góp ý `pending`/`reviewing` **không phải** `question`, cũ trước, tối đa 50, kèm tệp đính kèm.

```json
{ "project": { "slug": "my-app", "name": "…", "mode": "execute", "deliver": "branch", "models": ["claude-sonnet-5"] },
  "items": [ { "id": "…", "title": "…", "body": "…", "status": "pending", "kind": "function", "attachments": [ … ] } ],
  "stopRequested": ["id-cần-cắt"] }
```

- Khoá **worker** + dự án ở `collect` ⇒ `items` và `stopRequested` **luôn rỗng** (worker thoát ngay, không tốn token).
- `?kind=question` ⇒ hàng đợi **Hỏi đáp** (`pending`, `kind=question`), độc lập với chế độ dự án.
- Gọi bằng khoá worker cập nhật `workerSeenAt`.

### `GET /machine/feedback`
Liệt kê cho người xử lý tay. Lọc: `project`, `status` / `kind` / `source` (nhiều giá trị cách nhau dấu phẩy), `contentRef`, `ids` (danh sách id), `q` (tìm trong tiêu đề). Phân trang: `limit` (≤ 200), `offset`, `order` (`asc`\|`desc`, mặc định `asc`). Operator không kèm `project` ⇒ mọi dự án.

### `POST /machine/feedback`
Máy tự lập góp ý (vd. phiếu rà soát nợ kỹ thuật). Cần dự án xác định. Người gửi là `"system"` nên không nhận thông báo. Trường: `title`, `body?`, `kind?`, `type?`, `reporterName?`, `pagePath?`, `scope?`, `source?` (`system`\|`api`\|`import`), `requirePlan?`, `status?`.

### `GET /machine/feedback/{id}`
Chi tiết đầy đủ: góp ý, **toàn bộ** `messages`, `events`, `attachments`, kèm `project: { slug, mode, deliver }`.

### `POST /machine/feedback/{id}/claim`
Nhận việc **nguyên tử**. `200` nếu nhận được (hoặc `{ "resumed": true }` nếu chính bên đó đang giữ — làm tiếp sau khi tiến trình chết); `409` nếu đã có bên khác nhận hoặc không còn `pending`; `409` nếu khoá worker mà dự án ở `collect`.

### `POST /machine/feedback/{id}/messages`
```json
{ "role": "ai", "kind": "progress", "authorName": "Trợ lý AI", "body": "Đang tìm câu 12" }
```
`role`: `ai`\|`admin`\|`user`\|`system` (mặc định `ai`). `kind`: `chat`\|`progress`\|`system` (mặc định `chat`). Tin `chat` của `ai`/`admin` bắn webhook `feedback.reply`.

### `PATCH /machine/feedback/{id}/messages/{mid}` · `DELETE …/{mid}`
Sửa/xoá một tin **do máy ghi** (`role` `ai` hoặc `system`) — để bộ trả lời Hỏi đáp đẩy câu trả lời đang chạy dần vào cùng một tin. `PATCH { "body": "…" }`. Không bắn webhook; tin của người gửi/quản trị bị từ chối (`403`).

### `POST /machine/feedback/{id}/transition`
```json
{ "to": "done",
  "note": "Đã sửa đáp án câu 12",
  "message": { "role": "ai", "kind": "chat", "body": "Đã đổi đáp án câu 12 thành Hà Nội." },
  "fields": { "expectedString": "Hà Nội", "verifyResult": "pass", "addCostUsd": 0.5, "addAgentRuns": 1 } }
```
`to`: bất kỳ trong sáu trạng thái. `fields` (đều tuỳ chọn): `expectedString`, `verifyResult` (`pass`\|`fail`\|`skipped`), `scopeViolation`, `rolledBack`, `codeDoneAt`, `addCostUsd`, `addAgentRuns`, `clearStop`. **Cố ý không có** `userVerdict` và `planApproval` — phán quyết của người, máy không đặt được (trường lạ bị bỏ qua).

### `POST /machine/feedback/{id}/attachments` · `GET /machine/feedback/{id}/attachments/{aid}`
Đính kèm tệp (multipart `file`) và tải tệp. AI **phải đọc** tệp đính kèm trước khi làm.

### `GET /machine/memory` · `POST /machine/memory`
Trí nhớ worker: 20 bản ghi `active` mới nhất; `POST { kind: decision|convention|pitfall|note, title, body }`.

### `POST /machine/heartbeat`
Worker báo còn sống. Trả `{ ok, mode, deliver }`.

### `POST /machine/import?project=<slug>` — chỉ operator
Nhập dữ liệu cũ (≤ 200 góp ý/lần) giữ nguyên `id`, thời gian, tin nhắn, sự kiện. Idempotent theo `id`: đã có thì bỏ qua. Không bắn webhook. Trả `{ created, skipped }`. Xem [`docs/MIGRATION.md`](MIGRATION.md).

---

## 3. API quản trị bảng điều khiển (cookie)

Cookie `hub_session` (đăng nhập `POST /api/admin/login { email, password }`, hiệu lực 12 giờ). Dành cho giao diện bảng điều khiển; tự động hoá nên dùng khoá operator thay vì cookie.

| Route | Việc |
|---|---|
| `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/me` | Phiên |
| `GET/POST /api/admin/projects` | Liệt kê / tạo dự án (trả `signingSecret` một lần) |
| `GET/PATCH/DELETE /api/admin/projects/{slug}` | Xem / cấu hình / xoá (xoá phải gửi `{ "confirm": "<slug>" }`) |
| `GET /api/admin/projects/{slug}/secret` · `POST …/rotate-secret` | Xem / đổi khoá ký token |
| `POST /api/admin/projects/{slug}/keys` | Cấp khoá worker (hiện một lần) |
| `GET/POST /api/admin/keys` · `DELETE /api/admin/keys/{id}` | Khoá operator: liệt kê / cấp / thu hồi (khoá worker cũng thu hồi qua route này) |
| `GET /api/admin/feedback` · `GET/PATCH /api/admin/feedback/{id}` | Bảng góp ý, chi tiết, trả lời/đổi trạng thái |

`PATCH /api/admin/projects/{slug}` nhận (đều tuỳ chọn): `name`, `allowedOrigins` (URL hoặc `"*"`), `submitRoles`, `adminRoles`, `anonymousSubmit`, `mode`, `deliver`, `types`, `features` (gồm `screenshot`: `off` | `optional` | `default` — ảnh chụp trang kèm góp ý; `textSelection`: bật bong bóng "Góp ý đoạn này" khi bôi đen chữ; `selectionScope`: bộ chọn CSS giới hạn vùng bôi đen, ≤ 200 ký tự, không chứa `<` `>`; `hidePaths`: tối đa 30 tiền tố đường dẫn bắt đầu bằng `/` mà widget ẩn mọi lối vào), `theme`, `webhookUrl`. `theme` được kiểm nghiêm ([THEMING.md](THEMING.md)); phản hồi kèm `warnings` nếu tương phản màu dưới 4,5:1.
