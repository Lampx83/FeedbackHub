# Chuyển góp ý có sẵn sang Feedback Hub

Ứng dụng của bạn đã có chỗ góp ý riêng (một bảng `feedback`, form báo lỗi…)? Hai việc: **nhập dữ liệu cũ** vào hub, rồi **đổi nơi ghi** sang hub. Làm theo thứ tự dưới đây để không mất dữ liệu và không có khoảng ngừng.

## Cách tiếp cận khuyến nghị: "bật/tắt bằng biến môi trường"

1. Giữ nguyên mã cũ, thêm một nhánh `if (hubEnabled())` ở **đầu mỗi route** góp ý, chuyển tiếp sang hub và trả **cùng dạng JSON** như trước — giao diện cũ không phải sửa.
2. Hub tắt (mặc định) → hành vi y như cũ. Hub bật (đặt hai biến môi trường) → dữ liệu mới vào hub.
3. Nếu có sự cố: bỏ biến môi trường, ứng dụng quay lại bảng cũ ngay. Dữ liệu cũ không bị xoá.

Ví dụ thật: DGXL làm đúng như vậy (xem [mục cuối](#ví-dụ-dgxl)): một tệp khách hàng hub + ánh xạ trường, và các route cũ có thêm nhánh chuyển tiếp.

## Bước 1 — Tạo dự án trên hub

Khai các **loại** sao cho khớp loại cũ. Ví dụ ứng dụng cũ có `add|edit|change|bug|other|qa`:

| `type` cũ | `kind` chuẩn |
|---|---|
| `add`, `change` | `function` |
| `edit` | `content` |
| `bug` | `bug` |
| `qa` | `question` |
| `other` | `other` |

Chọn `adminRoles` (ai xem mọi góp ý), `chế độ` (`collect` an toàn nhất để bắt đầu) và tên miền.

## Bước 2 — Nhập dữ liệu cũ

Dùng **khoá operator** (Bảng điều khiển → Khoá API) gọi `POST /api/v1/machine/import?project=<slug>`, tối đa 200 góp ý mỗi lần:

```json
{ "items": [ {
  "id": "id-cũ-giữ-nguyên",
  "kind": "function", "type": "add",
  "title": "…", "body": "…", "status": "done",
  "reporterId": "u-17", "reporterName": "Nguyễn An",
  "createdAt": "2026-03-01T08:00:00Z", "updatedAt": "2026-03-02T09:30:00Z",
  "messages": [ { "role": "user", "kind": "chat", "authorName": "Nguyễn An", "body": "…", "createdAt": "…" } ]
} ] }
```

Quy tắc:

- **Giữ nguyên `id`**: chạy lại không nhân đôi (id đã có thì bỏ qua) và các tham chiếu ngoài (vd. commit ghi "refs #id") vẫn đúng.
- Trạng thái cũ phải thuộc 6 trạng thái chuẩn (`pending`, `reviewing`, `deploying`, `awaiting_user`, `done`, `rejected`); ánh xạ các giá trị khác trước khi gửi.
- Vai tin nhắn: `user` (người gửi), `ai`, `admin`, `system`.
- Nhập **không bắn webhook** và không tạo thông báo.
- Tệp đính kèm: tải lên sau bằng `POST /api/v1/machine/feedback/<id>/attachments` (multipart, trường `file`).
- Các trường đo lường tuỳ chọn: `pickedAt`, `codeDoneAt`, `liveAt`, `agentRuns`, `costUsd`, `rolledBack`, `expectedString`, `verifyResult`, `userVerdict`, `planApproval`…

Nên viết một script một lần: đọc bảng cũ → gom lô 50 → gọi import → in tổng kết. Chạy **thử khô** (chỉ đếm) trước. Chạy lại cuối cùng ngay trước khi bật hub để bắt phần phát sinh giữa chừng.

## Bước 3 — Đổi nơi ghi

1. Đặt biến môi trường của ứng dụng (`FEEDBACK_HUB_URL`, `FEEDBACK_HUB_SECRET`, …) và bật nhánh chuyển tiếp.
2. Nếu bạn dùng worker/bộ trả lời riêng đọc bảng cũ, chuyển chúng sang hàng đợi của hub (`GET /api/v1/machine/queue`, `?kind=question` cho Hỏi đáp) — hoặc dùng [worker](../worker/README.md) có sẵn.
3. Nếu ứng dụng gửi thông báo cho người dùng khi có phản hồi, nhận **webhook** `feedback.reply` ([INTEGRATION.md](INTEGRATION.md#nhận-thông-báo-khi-có-phản-hồi-webhook)) thay vì để AI ghi thẳng vào bảng thông báo.
4. Theo dõi một thời gian; khi chắc chắn mới bỏ mã cũ. Đừng xoá bảng cũ vội — nó là bản sao lưu.

## Điểm khác biệt cần biết

| Cũ (trong ứng dụng) | Hub |
|---|---|
| Quyền kiểm bằng phiên của ứng dụng | Ứng dụng vẫn là **ranh giới tin cậy**: route của ứng dụng kiểm quyền rồi mới ký token (vai trò `ADMIN`/`USER`) gửi hub |
| AI ghi thẳng vào CSDL của ứng dụng | AI chỉ nói chuyện với hub qua CLI/API; ứng dụng **không** cấp quyền CSDL cho agent |
| Thông báo do AI ghi vào bảng thông báo | Hub bắn **webhook**, ứng dụng tự tạo thông báo |
| Một lượt agent xử lý nhiều góp ý | Worker nhận **một** góp ý cũ nhất mỗi lượt (cô lập lỗi, dễ quay lui) |

## Ví dụ DGXL

DGXL chuyển "Yêu cầu cải tiến" và "Hỏi đáp" sang hub bằng cách trên:

- `FEEDBACK_HUB_URL` + `FEEDBACK_HUB_SECRET` (+ `FEEDBACK_HUB_PROJECT`, `FEEDBACK_HUB_KEY`) bật nhánh chuyển tiếp trong các route cũ; tắt = bảng Prisma cũ.
- Ánh xạ trường ở một chỗ: `body↔detail`, `reporterId↔submittedByUserId`, `reporterName↔submittedByName`, `kind`+`type` ↔ `type` cũ.
- Script nhập một lần: đọc `ImprovementRequest*` + tệp đính kèm → `/machine/import`, giữ id, idempotent.
- Webhook `POST /api/hub/webhook` (kiểm chữ ký HMAC) tạo thông báo cho người gửi.
- Worker nhận việc từ hub; phần riêng của DGXL (lịch sử phiên bản, khôi phục, đo độ phức tạp) vẫn nằm trong script bao ngoài.
