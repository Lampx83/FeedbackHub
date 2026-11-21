# Giao diện (theme)

Widget phải **trông như một phần của ứng dụng chủ**. Có ba tầng tuỳ biến, từ dễ đến sâu:

1. **Bảng điều khiển** — đổi màu, vị trí, chữ, biểu tượng cho từng dự án, không cần sửa mã ứng dụng.
2. **Thuộc tính `data-*` / `FeedbackHub.init({ theme: {...} })`** — ghi đè theo trang (cùng khoá như bảng trên).
3. **Biến CSS `--fh-*`** — ứng dụng chủ tự đặt trong stylesheet của mình, xuyên qua Shadow DOM.

Thứ tự ưu tiên (cao thắng thấp): biến CSS `--fh-*` (màu, bo góc, phông, bóng) > `data-*`/`init()` > theme của dự án > mặc định.

## 1. Theme của dự án (bảng điều khiển → dự án → Giao diện)

Chỉ nhận **giá trị trong danh sách cho phép** — không CSS tự do, không HTML — để cấu hình sai hay bị chiếm quyền cũng không chèn được mã vào trang của ứng dụng.

| Khoá | Giá trị | Ví dụ |
|---|---|---|
| `primary` | màu `#hex`, `rgb()`, `hsl()` | `#7c3aed` |
| `primaryText` | màu — chữ trên nút chính | `#ffffff` |
| `bg`, `fg`, `border` | màu — nền, chữ, viền ngăn kéo (chế độ sáng) | `#ffffff`, `#1c1917`, `#d6d3d1` |
| `radius` | độ dài có đơn vị `px\|rem\|em\|%` | `12px` |
| `fontSize` | độ dài có đơn vị | `14px` |
| `font` | `inherit` (mặc định, theo trang) · `system` · `serif` · `mono` | `inherit` |
| `colorScheme` | `auto` · `light` · `dark` | `auto` |
| `position` | `bottom-right` · `bottom-left` · `top-right` · `top-left` | `bottom-right` |
| `offsetX`, `offsetY` | số nguyên 0–200 (px), mặc định 20 | `24` |
| `label` | chữ trên nút và tiêu đề ngăn kéo (≤ 24 ký tự) | `Góp ý` |
| `icon` | `lightbulb` · `chat` · `pencil` · `flag` · `plus` | `lightbulb` |
| `locale` | `vi` · `en` | `vi` |
| `strings` | ghi đè từng dòng chữ giao diện (≤ 200 ký tự mỗi dòng) | `{"submit":"Gửi cho đội sản phẩm"}` |

Qua API (`PATCH /api/admin/projects/<slug>`):

```json
{ "theme": { "primary": "#0f766e", "primaryText": "#ffffff", "radius": "8px",
             "position": "bottom-left", "label": "Phản hồi", "icon": "chat",
             "strings": { "title": "Phản hồi về ứng dụng" } } }
```

Bảng điều khiển **cảnh báo** (không chặn) khi cặp màu không đủ tương phản 4,5:1 theo WCAG AA — hãy sửa cảnh báo đó, người dùng khiếm thị sẽ không đọc được chữ trên nút.

Tên khoá của `strings`: xem đối tượng `VI` ở đầu [`public/widget.js`](../public/widget.js); tên trạng thái (`pending`, `reviewing`, `deploying`, `awaiting_user`, `done`, `rejected`) đổi nhãn trạng thái. Khoá lạ bị bỏ qua.

## 2. `data-*` và `init()`

```html
<script src="…/widget.js" data-project="my-app" data-token-url="/api/feedback-token"
        data-position="bottom-left" data-color-scheme="dark" data-label="Phản hồi"
        data-icon="chat" data-locale="en" data-offset-x="24" data-offset-y="24" defer></script>
```

Danh sách đầy đủ ở [INTEGRATION.md](INTEGRATION.md#thuộc-tính-data-).

## 3. Biến CSS `--fh-*`

Widget vẽ trong **Shadow DOM** nên CSS của trang không "rò" vào được — nhưng **biến CSS thì xuyên qua**. Đặt trong stylesheet của ứng dụng:

```css
:root {
  --fh-primary: #0f766e;        /* màu nút và điểm nhấn */
  --fh-primary-text: #ffffff;   /* chữ trên nút */
  --fh-bg: #ffffff;             /* nền ngăn kéo */
  --fh-fg: #1c1917;             /* chữ */
  --fh-border: #d6d3d1;         /* viền */
  --fh-radius: 12px;            /* bo góc */
  --fh-font: "Inter", system-ui, sans-serif;
  --fh-font-size: 14px;
  --fh-shadow: 0 8px 30px rgb(0 0 0 / .18);
}
```

Cách này hợp khi ứng dụng đã có **design token** riêng: trỏ `--fh-primary: var(--brand-600)` là widget đổi theo mỗi khi bạn đổi thương hiệu, kể cả chế độ tối nếu token của bạn đổi theo.

## Chế độ tối

`colorScheme: auto` (mặc định) bật tối khi: trang có `class="dark"` hoặc `data-theme="dark"` trên `<html>`, **hoặc** hệ điều hành đang ở chế độ tối. Widget quan sát thay đổi của `<html>` nên bật/tắt chế độ tối trong ứng dụng thì widget đổi theo ngay, không cần tải lại. Muốn cố định thì đặt `light` hoặc `dark`.

## Vị trí và nút có sẵn

- Nút nổi bị che bởi thành phần khác (thanh chat, banner cookie)? Đổi `position` hoặc `offsetX/offsetY`.
- Ứng dụng đã có nút "Góp ý" trên thanh điều hướng? Dùng `data-trigger=".my-feedback-btn"` — bấm nút của bạn thì mở widget, nút nổi tự ẩn.
- Muốn bảng góp ý nằm **trong** một trang (vd. trang "Hỗ trợ")? `data-mount="#feedback-panel"`.

## Chữ và ngôn ngữ

`locale` chọn `vi`/`en`. Ghi đè từng dòng bằng `strings` ở theme dự án. Muốn ngôn ngữ khác: đặt `locale: "en"` rồi ghi đè hết các dòng cần dịch bằng `strings` (hoặc đóng góp bản dịch vào `widget.js` — xem [CONTRIBUTING.md](../CONTRIBUTING.md)).
