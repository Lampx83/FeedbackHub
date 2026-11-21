---
name: integrate-feedback-hub
description: Tích hợp Feedback Hub (hộp góp ý dùng chung + widget) vào một ứng dụng web có sẵn — thêm endpoint ký token ở máy chủ và thẻ script ở giao diện. Dùng khi người dùng nói "tích hợp Feedback Hub", "thêm nút góp ý", "nhúng hộp góp ý" vào ứng dụng hiện tại.
---

# Tích hợp Feedback Hub vào ứng dụng hiện tại

Tham khảo đầy đủ: `docs/INTEGRATION.md` trong repo Feedback Hub (https://github.com/Lampx83/FeedbackHub).

## Việc cần hỏi người dùng (nếu chưa biết)

1. **Địa chỉ hub** (vd. `https://feedback.example.com`) và **mã dự án** (`slug`) đã tạo trên hub.
2. **Khoá ký** của dự án — người dùng tự đặt vào biến môi trường `FEEDBACK_HUB_SECRET` của máy chủ. **Đừng yêu cầu họ dán khoá vào chat và đừng ghi nó vào tệp được commit.** Chỉ thêm tên biến vào `.env.example`.

## Các bước

1. **Nhận diện** framework phía máy chủ (Express, Next.js, FastAPI/Flask, Laravel, Go, Rails…) và nơi lấy **phiên đăng nhập** (user id, tên, vai trò).
2. **Thêm endpoint `GET /api/feedback-token`** (hoặc đường dẫn hợp phong cách ứng dụng):
   - chỉ trả token khi đã đăng nhập (chưa đăng nhập → 401);
   - ký JWT **HS256** bằng `FEEDBACK_HUB_SECRET` với claim `prj` (mã dự án), `aud: "feedback-hub"`, `exp` ≤ 10 phút, `uid` (chuỗi), `name`, `role`, `email?`;
   - lấy `uid/name/role` từ **phiên phía máy chủ**, không từ tham số của trình duyệt;
   - trả `{ "token": "…" }` kèm `Cache-Control: no-store`.
   Dùng thư viện JWT đã có trong dự án nếu có (jose/jsonwebtoken/pyjwt/firebase-jwt/golang-jwt); chỉ thêm phụ thuộc mới khi không có.
3. **Thêm thẻ script** vào layout chung (chỉ trang cần đăng nhập):
   ```html
   <script src="https://HUB/widget.js" data-project="SLUG" data-token-url="/api/feedback-token" defer></script>
   ```
   Với Next.js dùng `next/script` (`strategy="afterInteractive"`); với SPA có thể gọi `FeedbackHub.init({...})` sau đăng nhập và `FeedbackHub.destroy()` khi đăng xuất.
   **Chỗ đặt nút — viết ít mã nhất có thể, để hub làm phần còn lại.** Nếu góc màn hình đã kín (nút chat, menu nổi…), đừng tự viết nút hay logic ẩn/hiện: đặt `<span data-feedbackhub-launcher hidden></span>` cạnh các biểu tượng của header và thêm `data-fab="false"` — widget tự vẽ nút, tự ẩn khi chưa đăng nhập. Góp ý khi bôi đen chữ và danh sách trang ẩn lối vào (trang thi, trình chiếu) **bật trên hub** (Dự án → Tính năng → Lối vào hộp góp ý), không viết mã trong ứng dụng. Xem `docs/INTEGRATION.md#lối-vào-không-cần-viết-mã`.
4. **CSP**: nếu ứng dụng có Content-Security-Policy, thêm origin của hub vào `script-src` và `connect-src`.
5. **CORS bên hub**: nhắc người dùng thêm origin của ứng dụng (cả `http://localhost:PORT` khi dev) vào `allowedOrigins` của dự án trên hub.
6. **Giao diện (tuỳ chọn)**: nếu ứng dụng có design token, đặt `--fh-primary`, `--fh-radius`… trỏ vào token (xem `docs/THEMING.md`).
7. **Nội dung (tuỳ chọn)**: nếu ứng dụng hiển thị nội dung từ CSDL người dùng có thể góp ý, truyền `getContext: () => ({ contentRef: "loai:id" })` vào `FeedbackHub.init`.

## Kiểm tra trước khi báo xong

- Chạy build/lint của ứng dụng.
- Đăng nhập thử → thấy nút 💡; chưa đăng nhập → không thấy, trang không lỗi.
- Gọi endpoint token khi chưa đăng nhập phải trả 401.
- `grep` đảm bảo khoá ký không xuất hiện trong mã giao diện hay tệp commit.
- Nói rõ cho người dùng phần họ phải tự làm: tạo dự án + lấy khoá ký trên hub, đặt biến môi trường, thêm origin vào `allowedOrigins`.
