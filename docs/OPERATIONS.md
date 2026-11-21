# Vận hành: ai xử lý góp ý, và xử lý thế nào

Mỗi dự án có **một chế độ** và **một mức giao**, đổi được bất cứ lúc nào ở bảng điều khiển (tab **Chế độ**) mà không cần vào máy chủ của ứng dụng.

| Chế độ (`mode`) | Ai làm | Khi nào dùng |
|---|---|---|
| `collect` — thu nhận | **Người** (hoặc Claude làm tay qua MCP/CLI) | Bắt đầu ở đây. Ứng dụng quan trọng, nội dung chuyên môn, hoặc chưa tin AI |
| `execute` — làm ngay | **Worker** tự nhận việc, Claude Code viết mã | Ứng dụng có thể thử nghiệm an toàn; đã đọc [SECURITY.md](SECURITY.md) |

Khi `execute`, **mức giao** (`deliver`) quyết định điều gì xảy ra với mã đã viết:

| `deliver` | Kết quả |
|---|---|
| `branch` | Mở nhánh `hub/<id>` chờ người duyệt. **Không đụng hệ thống đang chạy** |
| `deploy` | Sao lưu → triển khai → kiểm tra sức khoẻ → kiểm chứng chuỗi đã khai → hỏng thì **tự quay lui** |

Worker còn có **trần cục bộ** `maxDeliver` trong cấu hình của nó. Mức giao thật = min(`deliver` trên hub, `maxDeliver`). Kẻ chiếm được hub cũng không bật được tự triển khai ở nơi bạn không cho phép.

## Vòng đời một góp ý

```
người gửi ─▶ pending ─▶ reviewing ─▶ deploying ─▶ done ─▶ (người gửi nghiệm thu: đúng ý / chưa đúng ⇒ mở lại)
                           │
                           └─▶ awaiting_user ◀── AI hỏi lại khi mơ hồ; người gửi trả lời ⇒ về pending
```

Quy tắc đầy đủ: [SPEC.md §4](SPEC.md). Điểm đáng nhớ:

- **Người gửi luôn có tiếng nói cuối.** Máy không đặt được `userVerdict` (nghiệm thu) hay `planApproval` (duyệt kế hoạch).
- **"Xong" phải kiểm chứng được.** AI khai một chuỗi chữ mà bản đang chạy phải chứa; worker tự tìm. Không thấy ⇒ mở lại, bất kể AI báo gì.
- **Duyệt kế hoạch**: người gửi tick "cho tôi duyệt kế hoạch trước" ⇒ AI chỉ trình kế hoạch, người duyệt rồi mới sửa mã.
- **Nút Dừng** của người gửi cắt cả nhóm tiến trình AI; phần viết dở được cất (không xoá).

## Cách 1 — Chế độ thu nhận, làm tay với Claude (MCP)

1. Bảng điều khiển → **Khoá API** → cấp **khoá operator** (hiện một lần).
2. Cài MCP server: xem [mcp/README.md](../mcp/README.md) (Claude Code: `claude mcp add feedback-hub …`; Claude Desktop: thêm vào `claude_desktop_config.json`).
3. Trong Claude, gọi prompt **`xu_ly_gop_y`** (hoặc nói: *"Lấy các góp ý mới của dự án my-app và xử lý giúp"*). Claude sẽ: liệt kê hàng đợi → đọc kỹ (cả tệp đính kèm) → `claim` (nguyên tử) → làm → báo kết quả → đặt trạng thái.

Góp ý **nội dung** chuyên môn: Claude chỉ *đề xuất* bản sửa để người có chuyên môn duyệt — mô hình ngôn ngữ có thể tự tin đưa ra nội dung sai.

## Cách 2 — Worker tự động (`execute`)

Chi tiết cấu hình, cron/launchd, danh sách việc worker làm mỗi lượt: [worker/README.md](../worker/README.md). Tóm tắt:

1. Tạo **khoá worker** của dự án (tab **Khoá & nhúng**), lưu vào tệp chỉ-chủ-đọc (`chmod 600`) trên máy chạy worker.
2. Chuẩn bị **kho git riêng cho worker** (đừng dùng kho bạn đang tự sửa tay) và xác thực cho Claude (`claude setup-token`).
3. Sao chép `worker/worker.config.example.json`, điền `hub`, `project`, `repo`, lệnh `build`/`deploy`/`backup`, `allowedPaths`, **`boundaries`** (điều AI không được tự làm trong ứng dụng của bạn: xác thực, phân quyền, dữ liệu cá nhân, xoá vĩnh viễn, công thức nghiệp vụ…).
4. Đặt `maxDeliver: "branch"` để bắt đầu. Chạy thử bằng tay: `node worker/hub-worker.mjs --config … --verbose`.
5. Cho cron gọi mỗi phút. Worker thoát ngay khi không có việc nên không tốn token.
6. Ở bảng điều khiển đổi dự án sang `execute`. Khi đã tin quy trình mới nâng `deliver`/`maxDeliver` lên `deploy`.

Theo dõi: dự án hiện "worker thấy lần cuối"; nhật ký ở `logDir`; mỗi góp ý có dòng thời gian sự kiện đầy đủ.

## Hỏi đáp (`question`)

Câu hỏi "chỗ này dùng thế nào?" có **hàng đợi riêng**: `GET /api/v1/machine/queue?kind=question`, độc lập với chế độ dự án — không đổi mã, chỉ cần một bộ trả lời đọc tài liệu của ứng dụng và trả lời. Hub cung cấp sẵn API để đẩy câu trả lời dần vào cùng một tin (`PATCH …/messages/{mid}`). Widget mặc định **ẩn** loại `question` khỏi form góp ý; ứng dụng chủ tự làm khung chat Hỏi đáp rồi gọi API (xem DGXL làm thế nào ở [MIGRATION.md](MIGRATION.md)).

## Trí nhớ dự án

Mỗi lượt Claude là một tiến trình mới, không nhớ gì. Worker/MCP đọc `GET /machine/memory` (20 mục mới nhất: quyết định đã chốt, quy ước, cạm bẫy) đầu mỗi lượt và ghi thêm điều đáng nhớ cuối lượt. Đây là cách ứng dụng "học" từ lịch sử góp ý mà không cần bạn viết lại hướng dẫn.

## Cấu hình dự án ở dạng tệp

Cấu hình lặp lại được (tên miền, loại góp ý, giao diện, webhook…) có thể lưu thành JSON rồi áp bằng script thay vì bấm tay:

```bash
HUB_URL=https://feedback.example.com HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… \
  node scripts/setup-project.mjs project.json --print-secret --worker-key "worker 1"
```

Tạo dự án nếu chưa có, cập nhật nếu đã có. Khoá ký và khoá worker chỉ in ra màn hình, không ghi tệp.

## Số liệu

Mỗi góp ý ghi: số vòng hỏi lại, số lượt chạy AI, chi phí (USD), mật độ quy chiếu (có `pagePath`/`pageTarget`/trích nguyên văn), mốc thời gian nhận/viết xong/lên hệ thống, kết quả kiểm chứng, phán quyết của người gửi. Lấy qua `GET /api/v1/machine/feedback` (có phân trang) để vẽ biểu đồ riêng.

## Giới hạn đã biết

- **Giao ở mức `branch` vẫn bắn webhook `feedback.status` với trạng thái `done`.** Worker đặt `done` ngay khi mở nhánh, dù mã chưa chạy ở môi trường thật. Ứng dụng chủ nên coi `done` + `liveAt` rỗng là "đã có nhánh, chờ người duyệt triển khai".
- **`widget.js` nặng ~85 KB (~25 KB nén gzip)**, tải bất đồng bộ và không chặn trang. Reverse proxy nên bật nén.
- **Smoke trên hub chạy trong Docker** cần `SMOKE_HOOK_HOST=host.docker.internal` để hub gọi ngược được máy bạn.
