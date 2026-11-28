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

Người không phải quản trị dự án nhận bản **đã lược** các trường vận hành nội bộ (`costUsd`, `agentRuns`, `claimedBy/At`, `scopeViolation`, `approvedBy`, `reporterEmail`, `rolledBack`, `stopRequestedAt`); quản trị dự án thấy đủ.

`GET /feedback?summary=1` ⇒ `{ "awaitingIds": ["…"] }`: id các góp ý **của chính người gọi** đang chờ họ trả lời (để hiện số đỏ trên nút nổi).

### `GET /feedback/{id}` — chi tiết

`{ "feedback": { …, "messages": [ … ] }, "attachments": [ { id, fileName, mimeType, sizeBytes, createdAt } ] }`. Chỉ người gửi hoặc quản trị dự án; còn lại `403`.

### `PATCH /feedback/{id}` — người gửi/quản trị cập nhật

Phải có **ít nhất một** trường:

| Trường | Ai | Hiệu lực |
|---|---|---|
| `message` (chuỗi) | người gửi, quản trị | Thêm tin nhắn. Nếu đang `awaiting_user` ⇒ tự về `pending` |
| `userVerdict` (`accepted`\|`rejected`) | **chỉ chính người gửi** | Nghiệm thu; chỉ khi góp ý `done` (`409` nếu chưa). `rejected` ⇒ mở lại (`pending`) |
| `planApproval` (`"approved"`) | **chỉ chính người gửi** | Duyệt kế hoạch ⇒ `pending`; `409` nếu không có kế hoạch đang chờ duyệt |
| `stop` (`true`) | người gửi, quản trị | Dừng. `409` nếu không còn `pending`/`reviewing` |
| `status` | **chỉ quản trị dự án** | `pending`\|`reviewing`\|`awaiting_user`\|`done`\|`rejected` (không có `deploying`) |

### `POST /feedback/{id}/attachments` — đính kèm tệp

`multipart/form-data`, trường `file`. ≤ 10 MB, ≤ 12 tệp/góp ý; loại không được phép ⇒ `415`.

### `GET /attachments/{id}` — tải tệp

Token trong header **hoặc** `?t=<token>`. Chỉ người gửi/quản trị dự án.

---

## 2. API máy (worker / reader / operator)

Header: `Authorization: Bearer $KEY` (khoá `fhk_w_…`, `fhk_r_…` hoặc `fhk_o_…`). Khoá **operator** chọn dự án bằng `?project=<slug>`; khoá **worker** và **reader** (chỉ đọc) đã gắn sẵn một dự án (truyền `?project=` khác dự án của nó ⇒ `403`). Khoá **reader** chỉ được `GET`: mọi phương thức ghi (nhận việc, nhắn tin, đổi trạng thái, nhập) trả `403` — dùng cho AI/CLI của chủ dự án chỉ cần đọc góp ý.

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

**Cổng duyệt.** Dự án bật `features.requireApproval` thì khoá **worker** và **reader** chỉ thấy góp ý **đã duyệt** (`approvedAt != null`): danh sách, hàng đợi (`stopRequested` cũng vậy) và mọi route theo id (đọc, nhận, nhắn tin, đổi trạng thái…) trả `403 "Góp ý này chưa được quản trị dự án duyệt"` với góp ý chưa duyệt. Khoá **operator** không bị chặn. Duyệt là quyết định của con người (xem §3); máy không có đường nào đặt `approvedAt`. Hàng đợi Hỏi đáp (`?kind=question`) không qua cổng này.

**Người quyết định (admin, chỉ phiên đăng nhập / token cá nhân; khoá máy → 401).**
- `GET /api/admin/inbox[?project=slug]` → `{ counts: {approval, check, stuck, stale, total}, items: [{id, reason, title, kind, status, reporterName, createdAt, updatedAt, project, manage, detail?}] }`. Gom góp ý đang chờ một người ra tay, ràng theo dự án tài khoản được thấy: `approval` (chưa duyệt, dự án bật cổng), `check` (kiểm chứng trượt / sửa ngoài phạm vi / đã hoàn tác, 14 ngày gần đây), `stuck` (đang làm quá 2 giờ), `stale` (đã được phép nhưng chờ nhận quá 3 ngày). Mỗi góp ý chỉ hiện một lần, ở lý do khẩn nhất; tối đa 50 mỗi nhóm; `manage` cho biết tài khoản có quyền xử lý.
- `POST /api/admin/feedback { project, title, desired, criteria, kind?, priority?, context?, pagePath?, requirePlan? }` → `{ ok, feedback: {id, title, status, priority} }`. Người điều phối (BA) tạo **yêu cầu chỉnh sửa** trực tiếp, không qua widget. Cần quyền quản trị **dự án đó** (người chỉ xem 403, dự án không được gán 404; khoá máy 401). `desired` (hành vi mong muốn, ≥10 ký tự) và `criteria` (tiêu chí chấp nhận, ≥5 ký tự, lưu vào `successCriteria`) bắt buộc; `kind` mặc định `function`; `priority` = `low|normal|high|urgent` (mặc định `normal`, chỉ người quản trị thấy); `pagePath` chỉ nhận đường dẫn nội bộ. Nội dung lưu theo mẫu «Bối cảnh / Hành vi mong muốn». Nguồn `board`, người gửi là chính tài khoản tạo (vai trò `console`). **Tạo không đồng nghĩa với duyệt**: yêu cầu vẫn qua cổng duyệt của dự án.
- `POST /api/admin/feedback/bulk { ids: [≤100], approved: boolean }` → `{ changed, skipped: [{id, reason}] }`. Duyệt/bỏ duyệt nhiều góp ý; quyền kiểm **từng dự án** (cần quản trị dự án đó), góp ý ngoài quyền hoặc đã ở đúng trạng thái được liệt kê ở `skipped`, không làm hỏng cả lượt. Mỗi góp ý ghi một sự kiện `approval` (`detail.bulk = true`).
- Quy tắc tự duyệt (`features.autoApproveRoles`): người gửi có `role` khớp thì góp ý được duyệt ngay lúc tạo, `approvedBy = "tự động (quy tắc)"`, sự kiện `approval` mang `detail.rule`. Không áp cho góp ý `source` = `system`/`import`. Chỉ quản trị dự án đặt được; máy không đặt được.

### `GET /machine/feedback`
Liệt kê cho người xử lý tay. Lọc: `approved=1|0` (đã/chưa duyệt; worker/reader ở dự án bật cổng duyệt luôn chỉ thấy đã duyệt), `project`, `status` / `kind` / `source` (nhiều giá trị cách nhau dấu phẩy), `contentRef`, `ids` (danh sách id), `q` (tìm trong tiêu đề). Phân trang: `limit` (≤ 200), `offset`, `order` (`asc`\|`desc`, mặc định `asc`). Operator không kèm `project` ⇒ mọi dự án.

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

Cookie `hub_session` (đăng nhập `POST /api/admin/login { email, password }`, hiệu lực 12 giờ). Dành cho giao diện bảng điều khiển; tự động hoá nên dùng khoá operator thay vì cookie. Tài khoản bị khoá (403 lúc đăng nhập) hoặc phiên cấp trước lúc đổi/đặt lại mật khẩu thì không còn hiệu lực (401).

**Phân quyền theo dự án** (kiểm ở mọi route, không chỉ giao diện):

| Vai trò | Phạm vi |
|---|---|
| Quản trị toàn hub (`superAdmin`) | Mọi dự án; tạo/xoá dự án; khoá operator; quản lý tài khoản |
| `manager` (Quản trị dự án) | Chỉ dự án được gán: xem + trả lời/đổi trạng thái góp ý, cài đặt, khoá worker/reader, khoá ký. **Không** xoá dự án |
| `analyst` (Điều phối yêu cầu / BA) | Chỉ dự án được gán: như `viewer`, thêm **tạo yêu cầu** (`POST /api/admin/feedback`) và **trả lời** (`PATCH` chỉ có `message`). **Không** duyệt/bỏ duyệt, đổi trạng thái (`PATCH` có `status`/`approved` → 403), duyệt hàng loạt, cài đặt, khoá; không thấy khoá |
| `viewer` (Chỉ xem) | Chỉ dự án được gán: đọc góp ý và tệp đính kèm (ghi → 403; không thấy khoá) |

Dự án không được gán trả **404** (như không tồn tại). Danh sách `projects`/`feedback` chỉ gồm dự án được phép; `GET /projects` kèm `myRole`, `GET /feedback/{id}` kèm `canManage`.

| Route | Việc |
|---|---|
| `POST /api/admin/login` · `POST /api/admin/logout` · `GET /api/admin/me` | Phiên (`me` kèm `superAdmin`) |
| `POST /api/admin/me/password` `{ current, next }` | Tự đổi mật khẩu (≥ 10 ký tự, phải đúng mật khẩu hiện tại, 5 lần/10 phút). Mọi phiên khác bị đăng xuất, phiên này được cấp lại |
| `GET/POST /api/admin/me/tokens` · `DELETE /api/admin/me/tokens/{id}` | **Token cá nhân** (`fhk_a_…`) cho CLI/script/Claude Code, thay mật khẩu. `POST { label, days?=90 (1–365) }` trả token **một lần**; `GET` chỉ liệt kê token còn hiệu lực (không lộ giá trị). Dùng: `Authorization: Bearer fhk_a_…` ở mọi route quản trị — **đúng quyền của chủ tài khoản** (viewer vẫn chỉ xem). Cấp/thu hồi/đổi mật khẩu **chỉ qua cookie đăng nhập**, token không làm được. Đổi/đặt lại mật khẩu hoặc khoá tài khoản thu hồi mọi token của người đó |
| `GET/POST /api/admin/users` | Chỉ quản trị toàn hub. Liệt kê / tạo tài khoản `{ email, name, password, superAdmin?=false, memberships?: [{ slug, role: "manager"\|"viewer" }] }` |
| `PATCH/DELETE /api/admin/users/{id}` | Chỉ quản trị toàn hub. `PATCH` nhận `name`, `superAdmin`, `disabled`, `password` (đặt lại, đăng xuất người đó), `memberships` (thay toàn bộ). Không tự khoá/hạ quyền/xoá mình; hub luôn còn ≥ 1 quản trị toàn hub hoạt động |
| `GET/POST /api/admin/projects` | Liệt kê (theo phạm vi) / tạo dự án (chỉ quản trị toàn hub; trả `signingSecret` một lần) |
| `GET/PATCH/DELETE /api/admin/projects/{slug}` | Xem (`viewer` trở lên) / cấu hình (`manager`) / xoá (chỉ quản trị toàn hub, gửi `{ "confirm": "<slug>" }`) |
| `GET /api/admin/projects/{slug}/secret` · `POST …/rotate-secret` | Xem / đổi khoá ký token |
| `POST /api/admin/projects/{slug}/keys` `{ label, scope?: "worker" \| "reader" }` | Cấp khoá worker (mặc định) hoặc khoá chỉ đọc (hiện một lần) |
| `GET/POST /api/admin/keys` · `DELETE /api/admin/keys/{id}` | Khoá operator: liệt kê / cấp (chỉ quản trị toàn hub). `DELETE` thu hồi mọi khoá: khoá dự án do `manager` của dự án đó, khoá operator do quản trị toàn hub |
| `GET /api/admin/feedback` · `GET/PATCH /api/admin/feedback/{id}` | Bảng góp ý (lọc `project`, `status`, `kind`, `q`, `approval=approved\|pending`; `sort=new\|old\|updated`; `limit` 1–1000, mặc định 100; `format=csv` tải tối đa 5000 dòng theo cùng bộ lọc, UTF-8 có BOM, ô bắt đầu bằng `= + - @` được thêm `'` phía trước để chống CSV injection), chi tiết, trả lời/đổi trạng thái. `PATCH { approved: true\|false }` = duyệt / bỏ duyệt (cần quyền `manager`; ghi sự kiện `approval`, đặt `approvedAt`/`approvedBy`) |

| `GET /api/admin/stats?days=30&project=<slug>` | Số liệu cho **Tổng quan** (`days` 7–180): `kpi` (đang mở, chờ người gửi, lỗi đang mở, mới tạo so kỳ trước, đã xong, thời gian xử lý trung bình, chờ duyệt), `series` theo ngày (giờ Việt Nam), `byStatus`, `byKind`, `byProject`, `attention`, `recent`. Luôn ràng theo dự án được phép; câu hỏi thuần không tính vào việc đang mở |
| `GET /api/admin/notifications` · `POST …/notifications/seen` | Chuông thông báo: góp ý mới + trả lời của người gửi (30 ngày), kèm số chưa đọc; `seen` đánh dấu đã đọc cho tài khoản |
| `GET/POST/DELETE /api/admin/push` | Thông báo đẩy của trình duyệt (Web Push, VAPID). `GET` → `{ enabled, publicKey, devices }`; `POST { endpoint, keys: {p256dh, auth} }` đăng ký thiết bị, `DELETE { endpoint }` huỷ (chỉ phiên đăng nhập; không dùng token cá nhân). Chỉ nhận endpoint HTTPS của dịch vụ đẩy trình duyệt đã biết (chống SSRF). Khi có góp ý mới/trả lời, hub đẩy tới mọi thiết bị của tài khoản **còn quyền** với dự án (kiểm lúc gửi), theo `notify.on` của dự án. `503` nếu máy chủ chưa có khoá VAPID |
| `POST /api/admin/projects/{slug}/notify-test` | Gửi thử email/webhook theo cấu hình thông báo của dự án (`manager`; 6 lần/5 phút) |

`PATCH /api/admin/projects/{slug}` nhận (đều tuỳ chọn): `name`, `allowedOrigins` (URL hoặc `"*"`), `submitRoles`, `adminRoles`, `anonymousSubmit`, `mode`, `deliver`, `types`, `features` (gồm `screenshot`: `off` | `optional` | `default` — ảnh chụp trang kèm góp ý; `textSelection`: bật bong bóng "Góp ý đoạn này" khi bôi đen chữ; `selectionScope`: bộ chọn CSS giới hạn vùng bôi đen, ≤ 200 ký tự, không chứa `<` `>`; `requireApproval`: bật cổng duyệt cho khoá AI; `autoApproveRoles`: các `role` (≤ 20) được tự duyệt ngay khi gửi, chỉ có tác dụng khi `requireApproval` bật; `hidePaths`: tối đa 30 tiền tố đường dẫn bắt đầu bằng `/` mà widget ẩn mọi lối vào), `theme`, `webhookUrl` (webhook ký HMAC cũ; địa chỉ nội bộ chỉ quản trị toàn hub đặt được), `notify` (`{ on: "all"|"bugs"|"off", emails: [≤10], webhookUrl: https công cộng | null }` — thông báo khi có góp ý mới/trả lời; webhook nhận `text`, `content` cho Slack/Mattermost/Teams/Discord và các trường có cấu trúc). Email cần `HUB_SMTP_URL` ở máy chủ. `theme` được kiểm nghiêm ([THEMING.md](THEMING.md)); phản hồi kèm `warnings` nếu tương phản màu dưới 4,5:1.
