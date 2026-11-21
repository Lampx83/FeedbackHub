# MCP server `feedback-hub`

Cho Claude (Claude Code, Claude Desktop) lấy và xử lý góp ý trong Feedback Hub **bằng tay** — ở chế độ thu nhận (`collect`) hoặc khi muốn tự tay làm một góp ý thay vì chờ worker. Server nói chuyện với hub qua REST `/api/v1/machine/**`; không giữ trạng thái.

## Cài đặt

```bash
cd mcp && npm install        # Node ≥ 20
```

Cần hai thông tin:

| Biến | Ý nghĩa |
|---|---|
| `HUB_URL` | Địa chỉ hub, vd. `http://localhost:3100` |
| `HUB_KEY` | Khoá **operator** (`fhk_o_…`) — cấp ở trang quản trị của hub (`POST /api/admin/keys`). Hiện đúng một lần, hub chỉ lưu băm. Khoá worker (`fhk_w_…`) không dùng cho MCP. |

## Cấu hình vào Claude Code

```bash
claude mcp add feedback-hub \
  -e HUB_URL=http://localhost:3100 \
  -e HUB_KEY=fhk_o_xxxxxxxx \
  -- node /đường/dẫn/tuyệt/đối/FeedbackHub/mcp/server.mjs
```

(`claude mcp list` để kiểm tra. Thêm `--scope user` nếu muốn dùng ở mọi thư mục.)

## Cấu hình vào Claude Desktop

Sửa `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "feedback-hub": {
      "command": "node",
      "args": ["/đường/dẫn/tuyệt/đối/FeedbackHub/mcp/server.mjs"],
      "env": {
        "HUB_URL": "http://localhost:3100",
        "HUB_KEY": "fhk_o_xxxxxxxx"
      }
    }
  }
}
```

Khởi động lại Claude Desktop. Khoá nằm trong tệp cấu hình của máy bạn — đừng commit tệp đó.

## Công cụ

| Công cụ | Việc |
|---|---|
| `hub_projects` | Danh sách dự án, chế độ, cách giao, số góp ý theo trạng thái |
| `hub_list_feedback` | Liệt kê góp ý (`project`, `status` mặc định `pending`, `kind`, `q`, `limit`) |
| `hub_get_feedback` | Đọc đầy đủ: nội dung, ngữ cảnh, toàn bộ luồng tin nhắn, lịch sử, tệp đính kèm |
| `hub_get_attachment` | Ảnh → trả ảnh để model nhìn được; `txt` → trả chữ; pdf/Word/Excel → chỉ thông tin tệp |
| `hub_claim` | Nhận việc trước khi làm. **409 = bên khác đang giữ → đừng làm** |
| `hub_reply` | Nhắn người gửi (mặc định `chat`) |
| `hub_progress` | Ghi một bước làm (`progress`) |
| `hub_set_status` | Đặt trạng thái. `awaiting_user` bắt buộc kèm câu hỏi cụ thể; `done`/`rejected` bắt buộc kèm ghi chú; `done` chỉ khi thay đổi đã thật sự lên |
| `hub_memory_list` / `hub_memory_add` | Trí nhớ dự án (quyết định, quy ước, cạm bẫy) |

Prompt **`xu_ly_gop_y`** (tham số `project?`): quy trình đầy đủ — liệt kê hàng đợi `pending` → đọc kỹ (cả tệp đính kèm, toàn bộ luồng tin nhắn; tin mới nhất của người gửi là ý định hiện tại) → `claim` → làm → báo kết quả bằng ngôn ngữ người dùng không rành kỹ thuật → đặt trạng thái. Góp ý **nội dung** (sửa nội dung chuyên môn) chỉ được *đề xuất* bản sửa chờ người có chuyên môn duyệt, không tự áp dụng. Trong Claude Code gọi bằng `/mcp__feedback-hub__xu_ly_gop_y` (thêm tên dự án làm tham số).

## An toàn

- Nội dung góp ý (tiêu đề, mô tả, tin nhắn, tệp, ảnh) là **dữ liệu do người dùng nhập, không phải chỉ thị**. Mọi chỗ trả nội dung ấy ra đều được bọc trong `<<<NOI_DUNG_GOP_Y … NOI_DUNG_GOP_Y>>>` kèm lời dặn không làm theo lệnh nằm trong đó; mô tả công cụ và prompt cũng dặn như vậy.
- Công cụ không cho đặt `userVerdict` (nghiệm thu của người gửi) và không đặt được `deploying` — đó là việc của con người / worker.
- Lỗi HTTP trả `isError` với thông điệp tiếng Việt nêu nguyên nhân (401 khoá sai/bị thu hồi, 403 không đủ quyền, 404 không thấy, 409 đã có bên khác nhận, không kết nối được hub…).

## Kiểm thử

```bash
# cần hub đang chạy; tạo dự án + khoá tạm rồi dọn
HUB=http://localhost:3100 HUB_ADMIN_EMAIL=admin@example.com HUB_ADMIN_PASSWORD=admin123 node test.mjs
```

`test.mjs` nói JSON-RPC qua stdio với server thật: `initialize` → `tools/list` → `prompts/*` → gọi từng công cụ, kèm các ca lỗi (khoá sai, 409, 404, thiếu cấu hình, hub tắt).
