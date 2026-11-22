# Đặc tả chuẩn Feedback Hub (v1)

Tài liệu này là **chuẩn** mà mọi ứng dụng, lập trình viên và công cụ (widget, worker, MCP, script riêng) cùng tuân theo. Mã nguồn của hub là bản cài đặt tham chiếu; khi tài liệu và mã khác nhau, mã đúng và tài liệu cần sửa.

- Phiên bản API: `/api/v1`. Thay đổi phá vỡ sẽ lên `/api/v2`; `v1` giữ nguyên hành vi.
- Thuật ngữ: **Hub** (dịch vụ này), **ứng dụng chủ** (app nhúng hub), **dự án** (`Project`, một ứng dụng chủ), **góp ý** (`Feedback`), **người gửi** (người dùng cuối của ứng dụng chủ), **worker** (tiến trình tự xử lý góp ý), **operator** (người hoặc Claude xử lý tay qua khoá operator).

## 1. Ý tưởng

Hub gom mọi góp ý của nhiều ứng dụng về **một chỗ**, với **một mô hình dữ liệu chung**, rồi để AI hoặc lập trình viên xử lý. Ba lớp:

```
 Ứng dụng chủ                       Hub                          Bên xử lý
┌──────────────┐   token ký     ┌──────────────┐   khoá worker  ┌────────────────┐
│ widget.js    │ ─────────────▶ │ API người    │ ◀───────────── │ worker (AI tự  │
│ (nút nổi)    │   góp ý        │ dùng /v1     │                │ làm, execute)  │
│ + endpoint   │ ◀───────────── │ API máy      │ ◀───────────── │ MCP / CLI      │
│ ký token     │   webhook      │ /v1/machine  │   khoá operator│ (Claude làm tay)│
└──────────────┘                │ PostgreSQL   │                └────────────────┘
                                └──────────────┘
```

Hai **chế độ** của một dự án, đổi được bất cứ lúc nào trên hub mà không cần vào máy chủ của ứng dụng:

| Chế độ | `mode` | Điều gì xảy ra |
|---|---|---|
| Làm ngay | `execute` | Worker tự nhận việc, Claude Code viết mã, build, commit, giao kết quả theo `deliver`. |
| Chỉ thu nhận | `collect` | Chỉ lưu góp ý. Không có worker nào được nhận việc; người nhờ Claude lấy ra làm sau qua MCP/CLI/REST. |

Khi `execute`, `deliver` quyết định cách giao: `branch` (mở nhánh chờ duyệt) hoặc `deploy` (tự sao lưu, triển khai, kiểm sức khoẻ, tự quay lui). Worker còn bị **trần cục bộ** `maxDeliver` trong cấu hình của nó: hub bị chiếm quyền cũng không bật được tự triển khai ở nơi không cho phép.

## 2. Mô hình dữ liệu

Lược đồ đầy đủ ở [`prisma/schema.prisma`](../prisma/schema.prisma). Các thực thể:

| Thực thể | Vai trò |
|---|---|
| `Project` | Một ứng dụng chủ: khoá ký token (mã hoá), tên miền được phép, vai trò, chế độ, loại góp ý, tính năng, theme, webhook. |
| `Feedback` | Một góp ý. Trường lõi + ngữ cảnh + đo lường + kiểm chứng (mục 2.1). |
| `Message` | Luồng trao đổi của góp ý: `role` (`user`/`admin`/`ai`), `kind` (`chat`/`progress`/`system`). |
| `Attachment` | Tệp đính kèm (lưu trên đĩa, `HUB_DATA_DIR`). |
| `Event` | Nhật ký sự kiện (`created`, `status`, `webhook_fail`) kèm `actor`. Nguồn để tính mọi chỉ số. |
| `ApiKey` | Khoá cho máy: `worker` (gắn một dự án) hoặc `operator` (mọi dự án). Chỉ lưu băm SHA-256. |
| `Memory` | Trí nhớ của worker giữa các lượt chạy (quyết định, quy ước, cạm bẫy). |
| `AdminUser` | Người đăng nhập bảng điều khiển của hub. |

Hub **không có bảng người dùng cuối**: danh tính người gửi do ứng dụng chủ cấp qua token và chốt vào góp ý (`reporterId`, `reporterName`, …) lúc gửi, nên vẫn đúng khi người đó đổi tên hay bị xoá khỏi ứng dụng chủ.

### 2.1 Trường của `Feedback`

**Lõi (mọi ứng dụng giống nhau)**

| Trường | Ý nghĩa |
|---|---|
| `id` | cuid. |
| `projectId` | Dự án. |
| `kind` | Phân loại **chuẩn**, quyết định ai xử lý: `function`, `content`, `bug`, `question`, `other` (mục 3). |
| `type` | Loại **riêng của ứng dụng** (tuỳ chọn), phải nằm trong danh sách loại của dự án. Mỗi loại ánh xạ về một `kind`. |
| `title` / `body` | Tiêu đề (4–200 ký tự) và mô tả (≤ 20 000). |
| `status` | Trạng thái (mục 4). |
| `reporterId`, `reporterName`, `reporterEmail`, `reporterRole` | Người gửi, chốt từ token. Ẩn danh: `reporterId = "anon:<ip>"`. |
| `adminNote` | Ghi chú/phản hồi gần nhất của bên xử lý (≤ 500 ký tự), hiện cho người gửi. |
| `createdAt`, `updatedAt` | Mốc thời gian. `updatedAt` đổi cả khi có tin nhắn mới (để widget biết mà tải lại). |

**Ngữ cảnh (giúp AI khỏi phải hỏi lại "chỗ nào")**

| Trường | Ý nghĩa |
|---|---|
| `pagePath` | Đường dẫn trang lúc gửi (chỉ nhận đường dẫn nội bộ, bắt đầu bằng `/`). |
| `pageUrl` | URL đầy đủ. |
| `scope` | `page` (chỉ sửa trang đã gửi kèm) hoặc `system` (việc chung toàn hệ thống). `system` thì bỏ `pagePath`/`pageTarget`. |
| `pageTarget` | Phần tử người dùng chỉ bằng chuột: `"<đường dẫn CSS> \| <chữ nhìn thấy>"`. Chuỗi chữ thường `grep` được thẳng trong mã nguồn. |
| `suggestion` | Đề xuất sửa chữ tại chỗ: `{ "before": "…", "after": "…" }`. |
| `contentRef` | Định danh đối tượng nội dung bị góp ý (vd. `question:12`) để gom các góp ý cùng đối tượng. |
| `extra` | JSON riêng của ứng dụng (vd. trợ lý AI bị góp ý). Hub không đọc nội dung. |

**Đo lường** (giữ nguyên nghĩa của hệ thống gốc để số liệu so sánh được)

`source` (`widget`/`board`/`api`/`import`/`system`) · `refDensity` (số tham chiếu máy phân giải được: có `pagePath`, có `pageTarget`, mô tả có trích nguyên văn một chuỗi trong dấu ngoặc kép — công thức cố ý thô và cố định) · `clarifyRounds` (số vòng phải hỏi lại người gửi) · `pickedAt` · `codeDoneAt` · `liveAt` · `agentRuns` · `costUsd` · `rolledBack`.

**Kiểm chứng lời khai của AI**

| Trường | Ý nghĩa |
|---|---|
| `successCriteria` | Tiêu chí nghiệm thu do người gửi nêu. |
| `expectedString` | Chuỗi chữ AI **khai trước** mà sau khi lên thật PHẢI xuất hiện trong bản đang chạy. |
| `verifyResult` (`pass`/`fail`/`skipped`) và `verifiedAt` | Do **script worker** đặt, không do AI tự đặt. |
| `scopeViolation` | Ghi nếu lượt chạy đụng tệp ngoài phạm vi cho phép. |
| `userVerdict` (`accepted`/`rejected`) và `userVerdictAt` | Phán quyết của **người gửi** sau khi thay đổi lên thật. Chỉ người gửi đặt được; **máy không có quyền đặt** (API từ chối trường này), vì máy tự điền là nguỵ tạo bằng chứng. |

**Chạy bằng AI**: `planApproval` (`requested`/`approved`) · `aiProvider` · `aiModel` (phải nằm trong danh sách mô hình của dự án) · `stopRequestedAt` (người gửi bấm "Dừng") · `claimedBy` và `claimedAt` (ai đang giữ việc).

## 3. Phân loại `kind`

| `kind` | Ví dụ | Ai xử lý | Cách áp dụng |
|---|---|---|---|
| `function` | "Thêm nút xuất Excel", "đổi luồng này" | AI hoặc lập trình viên | Qua worker/Claude: sửa mã, build, giao theo `deliver` |
| `content` | "Câu 12 sai đáp án", "đoạn này sai chính tả" | Biên tập viên / chuyên gia nội dung | Sửa trong dữ liệu của ứng dụng, **không đụng mã**. Nên có người có chuyên môn duyệt |
| `bug` | "Bấm không chạy" | AI hoặc lập trình viên | Như `function` |
| `question` | "Chỗ này dùng thế nào?" | Bộ Hỏi đáp của ứng dụng | Trả lời, không đổi gì. Hàng đợi riêng (`/machine/queue?kind=question`), độc lập với chế độ dự án |
| `other` | Còn lại | Người xem | — |

Mỗi dự án khai danh sách **loại** của mình (`Project.types`: `[{ id, label, kind }]`). Ví dụ một app giáo dục khai `wrong_content → content`, một app quản trị khai `add → function`. Mặc định: `function`, `content`, `bug`, `question`, `other`.

Góp ý `content` nên có người chuyên môn duyệt trước khi áp dụng, vì mô hình ngôn ngữ có thể tự tin đưa ra nội dung sai. Hub chỉ chuyển góp ý, **không** tự áp dụng.

## 4. Máy trạng thái

Sáu trạng thái, giữ nguyên bộ của hệ thống gốc:

```
            ┌──────────── người gửi trả lời / nghiệm thu "chưa đúng" / duyệt kế hoạch ─────────────┐
            ▼                                                                                      │
 (tạo) ─▶ pending ──claim──▶ reviewing ──(đã viết xong, đang dựng)──▶ deploying ──▶ done ─────────┤
            │                    │  └──────────────────────────────────────────────────▶ done      │
            │                    └──(cần hỏi lại)──▶ awaiting_user ─────────────────────────────────┘
            └──(người gửi bấm Dừng khi chưa nhận)──▶ awaiting_user        rejected (không thực hiện)
```

| Trạng thái | Nghĩa | Nhãn mặc định |
|---|---|---|
| `pending` | Trong hàng đợi, chưa ai nhận | Chờ nhận |
| `reviewing` | Đã có bên nhận và đang làm | Đang làm |
| `deploying` | Mã đã viết xong, đang dựng lên hệ thống. **Chỉ script worker đặt**, không cho người đặt tay | Đang cập nhật |
| `awaiting_user` | Cần người gửi nói rõ thêm | Chờ người gửi trả lời |
| `done` | Thay đổi đã sống trên hệ thống | Hoàn thành |
| `rejected` | Không thực hiện (có lý do trong tin nhắn/`adminNote`) | Không thực hiện |

Các quy tắc đã được kiểm chứng ở hệ thống gốc và **bắt buộc**:

1. **Mọi thay đổi trạng thái đi qua một hàm duy nhất** (`transition()`), để Event và webhook không bao giờ bị bỏ sót.
2. **Trả lời lúc `awaiting_user` ⇒ về `pending`** (tăng `clarifyRounds`). Nếu không, câu trả lời nằm chết vì worker chỉ quét `pending`/`reviewing`.
3. **Nghiệm thu "chưa đúng" ⇒ mở lại (`pending`)**. Build xanh và kiểm chứng chuỗi chỉ chứng minh thay đổi **có mặt**, không chứng minh **đúng ý**.
4. **Duyệt kế hoạch (`planApproval: approved`) ⇒ về `pending`** để AI làm tiếp.
5. **"Dừng"**: `pending` dừng ngay (⇒ `awaiting_user`); `reviewing` chỉ đặt cờ `stopRequestedAt` — worker giữ tiến trình AI nên chỉ nó cắt được, rồi nó đặt `awaiting_user` và xoá cờ. **Không cho dừng lúc `deploying`**: cắt giữa chừng có thể để hệ thống nửa cũ nửa mới.
6. **`claim` là nguyên tử**: chỉ một bên nhận được một góp ý `pending` (bên kia nhận `409`). Worker và người nhờ Claude làm tay không bao giờ cùng sửa một việc.
7. **Gửi trùng bị chặn**: cùng người, cùng tiêu đề và nội dung (so không phân biệt hoa/thường và khoảng trắng), góp ý cũ còn đang mở ⇒ `409` kèm `duplicateOf`. Câu hỏi (`question`) không bị tính trùng.
8. Khi `done` ghi `liveAt`; khi `reviewing` lần đầu ghi `pickedAt`; khi về `pending`/`awaiting_user`/`done`/`rejected` thì nhả `claimedBy`.

`actor` của Event: `human` (người thao tác qua API người dùng/bảng điều khiển), `ai` (worker), `ai_manual` (Claude/CLI được người nhờ làm tay qua khoá operator), `system`.

## 5. Danh tính và phân quyền

### 5.1 Token người dùng (ứng dụng có đăng nhập)

Ứng dụng chủ **ký một token ngắn hạn trong máy chủ của nó** (không bao giờ trong trình duyệt) bằng khoá ký của dự án, rồi đưa cho trình duyệt. Hub kiểm chữ ký.

JWT, thuật toán **HS256**:

| Claim | Bắt buộc | Ý nghĩa |
|---|---|---|
| `prj` | ✔ | Mã (`slug`) của dự án. |
| `aud` | ✔ | Đúng chuỗi `feedback-hub`. |
| `exp` | ✔ | Hết hạn. Hub từ chối token sống quá **24 giờ**; khuyến nghị **≤ 10 phút**. Dung sai đồng hồ 30 giây. |
| `uid` | ✔ | Định danh người dùng trong ứng dụng chủ (≤ 200 ký tự). |
| `name` | ✔ | Tên hiển thị (≤ 120). |
| `role` | | Vai trò (≤ 60). Quyết định quyền (mục 5.3). |
| `email` | | Email (≤ 200). |

Token đi trong header `Authorization: Bearer <token>`; riêng tải tệp (thẻ `<img>` không gửi được header) chấp nhận `?t=<token>`.

### 5.2 Gửi ẩn danh (ứng dụng không có đăng nhập)

Bật `anonymousSubmit` trên dự án. Không token; gọi kèm header `X-Hub-Project: <slug>`. Bắt buộc: `Origin` nằm trong `allowedOrigins`, giới hạn **5 góp ý / 10 phút / địa chỉ IP**. Chỉ gửi được, **không xem được danh sách**; chỉ đính kèm tệp vào góp ý ẩn danh vừa tạo trong 10 phút.

### 5.3 Phân quyền theo vai trò (`role`)

- `submitRoles` rỗng ⇒ mọi người có token hợp lệ gửi được; ngược lại chỉ vai trò trong danh sách.
- `adminRoles`: xem và xử lý **mọi** góp ý của dự án, đổi trạng thái tay. Vai trò khác chỉ thấy góp ý **của chính mình** (`reporterId == uid`).
- Người gửi luôn được: nhắn tin, nghiệm thu, duyệt kế hoạch, bấm Dừng trên góp ý của mình. **Đổi trạng thái tay** chỉ dành cho quản trị dự án.

### 5.3b Tài khoản bảng điều khiển & vai trò theo dự án

Tách khỏi `adminRoles` (vai trò của người dùng cuối trong ứng dụng chủ). Tài khoản đăng nhập hub có thể là:
- **Quản trị toàn hub** (`AdminUser.superAdmin`): mọi dự án, tài khoản, khoá operator, tạo/xoá dự án. Tài khoản có sẵn trước khi có tính năng này giữ nguyên quyền này.
- **Tài khoản thường** gán vào từng dự án qua `ProjectMember` với vai trò `manager` (xem + xử lý + cài đặt + khoá dự án đó, không xoá) hoặc `viewer` (chỉ đọc góp ý).

Mọi route `/api/admin/**` kiểm quyền theo dự án (xem [API.md §3](API.md)); dự án không được gán trả 404. Khoá tài khoản (`disabled`) và đổi/đặt lại mật khẩu (`sessionsValidAfter`) huỷ phiên đang mở ngay. Hub luôn giữ ≥ 1 quản trị toàn hub hoạt động.

### 5.4 Khoá máy

| Khoá | Tiền tố | Phạm vi |
|---|---|---|
| Worker | `fhk_w_…` | Gắn **một dự án**. Dành cho worker tự động. |
| Reader | `fhk_r_…` | Gắn **một dự án**, **chỉ đọc** (`GET`; mọi ghi ⇒ 403). Cho AI/CLI của chủ dự án chỉ cần xem góp ý. |
| Operator | `fhk_o_…` | **Mọi dự án** (chọn bằng `?project=`). Dành cho Claude/MCP/CLI của người vận hành. Thu hồi riêng được. |

Khoá hiện **một lần** lúc cấp, hub chỉ lưu băm. Thu hồi có hiệu lực ngay. Token người dùng **không** dùng được ở API máy và ngược lại.

## 6. Webhook

Đặt `webhookUrl` trên dự án. Hub gửi `POST` JSON khi:

- `feedback.reply`: bên xử lý (`ai`/`admin`) ghi một tin `chat`;
- `feedback.status`: góp ý chuyển sang `awaiting_user`, `done` hoặc `rejected`.

```json
{
  "event": "feedback.reply",
  "project": "my-app",
  "at": "2026-11-21T08:00:00.000Z",
  "feedback": { "id": "…", "title": "…", "status": "awaiting_user", "kind": "function",
                "type": "add", "reporterId": "u-123", "reporterName": "Nguyễn Văn A", "adminNote": "…" },
  "message": { "role": "ai", "kind": "chat", "authorName": "Trợ lý AI", "body": "…" }
}
```

Header: `X-Hub-Event: feedback.reply` và `X-Hub-Signature: sha256=<hex>`, với `hex = HMAC-SHA256(signingSecret, rawBody)`. **Phải kiểm chữ ký bằng so sánh thời gian hằng số** trước khi tin nội dung. Hub chờ tối đa 8 giây, **không gửi lại**; lỗi được ghi thành `Event` loại `webhook_fail` (và không làm hỏng thao tác chính). Ứng dụng chủ thường dùng webhook để tạo thông báo trong ứng dụng cho `reporterId`; widget cũng tự hỏi định kỳ nên webhook chỉ là phần thưởng, không phải điều kiện để chạy.

## 7. Giao diện (theme)

Cấu hình một lần trên hub (`Project.theme`) hoặc ghi đè tại chỗ. **Chỉ nhận giá trị trong danh sách cho phép** — không CSS tự do, không HTML — để một cấu hình sai hay bị chiếm không chèn được mã vào trang của ứng dụng chủ. Chi tiết: [THEMING.md](THEMING.md).

## 8. Giới hạn và mặc định

| Mục | Giá trị |
|---|---|
| Tệp đính kèm | ≤ 10 MB/tệp, ≤ 12 tệp/góp ý; png, jpeg, webp, gif, pdf, doc(x), xls(x), txt |
| Gửi góp ý | 30 / 10 phút / người dùng; 5 / 10 phút / IP nếu ẩn danh |
| Đăng nhập bảng điều khiển | 8 lần / 10 phút / IP |
| Hàng đợi worker | 50 góp ý, cũ trước |
| Danh sách góp ý người dùng | 500 mới nhất |

Giới hạn tần suất nằm **trong bộ nhớ của một tiến trình**. Chạy nhiều bản hub song song thì phải chuyển sang kho dùng chung (Redis) — xem [SECURITY.md](SECURITY.md).
