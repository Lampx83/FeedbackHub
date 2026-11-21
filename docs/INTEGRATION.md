# Tích hợp vào ứng dụng của bạn

Tích hợp gồm **3 việc, khoảng 15 phút**:

1. Tạo **dự án** trên hub, lấy **khoá ký** (signing secret).
2. Thêm một **endpoint token** vào máy chủ của ứng dụng (≈ 10 dòng).
3. Chèn **một thẻ `<script>`** vào trang.

Ứng dụng không có đăng nhập? Đọc mục [Gửi ẩn danh](#gửi-ẩn-danh-ứng-dụng-không-có-đăng-nhập) — chỉ cần việc 1 và 3.

```
Trình duyệt ──(1) GET /api/feedback-token──▶ Máy chủ ứng dụng  ── ký token HS256 bằng khoá ký ──┐
     │◀──────────── { "token": "…" } ◀───────────────────────────────────────────────────────┘
     └──(2) widget gọi hub: Authorization: Bearer <token> ──▶ Hub  (kiểm chữ ký, hạn dùng, dự án)
```

Hub **không biết mật khẩu hay phiên đăng nhập** của ứng dụng. Nó chỉ tin một thứ: token do máy chủ ứng dụng ký bằng khoá riêng của dự án.

## 1. Tạo dự án trên hub

Bảng điều khiển → **Dự án** → **Thêm dự án**: đặt tên và mã (`slug`, ví dụ `my-app`), khai báo:

| Mục | Điền gì |
|---|---|
| **Tên miền được phép** (`allowedOrigins`) | Origin của ứng dụng, ví dụ `https://app.example.com` (thêm `http://localhost:3000` khi phát triển). Hub chỉ mở CORS cho các origin này |
| **Loại góp ý** | Ví dụ `Sửa nội dung → content`, `Đề xuất chức năng → function`, `Lỗi → bug`. Mỗi loại gắn với một `kind` chuẩn |
| **Vai trò quản trị** (`adminRoles`) | Giá trị `role` trong token được xem **mọi** góp ý của dự án (vd. `["ADMIN"]`). Người còn lại chỉ thấy góp ý của mình |
| **Vai trò được gửi** (`submitRoles`) | Để trống = ai có token hợp lệ cũng gửi được |
| **Chế độ** | `collect` (thu nhận — người xử lý) hoặc `execute` (AI tự làm). Xem [OPERATIONS.md](OPERATIONS.md) |

Sau khi tạo, mở tab **Khoá & nhúng** → **Hiện khoá ký** (hiện một lần mỗi lần mở; hub lưu mã hoá). Đặt nó vào **biến môi trường của máy chủ** ứng dụng, ví dụ `FEEDBACK_HUB_SECRET`. **Không** đưa vào mã gửi xuống trình duyệt, không commit vào git.

## 2. Endpoint token

Token là JWT **HS256**, ký bằng khoá ký của dự án, với các claim:

| Claim | Bắt buộc | Ý nghĩa |
|---|---|---|
| `prj` | ✔ | `slug` của dự án |
| `aud` | ✔ | luôn là `feedback-hub` |
| `exp` | ✔ | hết hạn — tối đa 24 giờ, **khuyến nghị ≤ 10 phút** (widget tự xin token mới khi hết hạn) |
| `uid` | ✔ | id người dùng trong ứng dụng của bạn (chuỗi ổn định) |
| `name` | ✔ | tên hiển thị |
| `role` | | vai trò; nếu nằm trong `adminRoles` của dự án thì là quản trị dự án |
| `email` | | để liên hệ |

Endpoint phải **chỉ trả token cho người đã đăng nhập** và lấy `uid`/`name`/`role` từ **phiên phía máy chủ**, không từ tham số do trình duyệt gửi.

### Node.js / Express

```js
import { SignJWT } from "jose";            // npm i jose
const SECRET = new TextEncoder().encode(process.env.FEEDBACK_HUB_SECRET);

app.get("/api/feedback-token", requireLogin, async (req, res) => {
  const token = await new SignJWT({
      prj: "my-app", uid: String(req.user.id), name: req.user.name, role: req.user.role,
    })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("feedback-hub")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(SECRET);
  res.set("Cache-Control", "no-store").json({ token });
});
```

### Next.js (App Router)

```ts
// app/api/feedback-token/route.ts
import { SignJWT } from "jose";
import { getSession } from "@/lib/session";     // hàm lấy phiên của bạn

export async function GET() {
  const s = await getSession();
  if (!s) return new Response("Unauthorized", { status: 401 });
  const token = await new SignJWT({ prj: "my-app", uid: s.userId, name: s.name, role: s.role })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("feedback-hub").setIssuedAt().setExpirationTime("10m")
    .sign(new TextEncoder().encode(process.env.FEEDBACK_HUB_SECRET!));
  return Response.json({ token }, { headers: { "Cache-Control": "no-store" } });
}
```

### Python (FastAPI / Flask)

```python
import os, time, jwt                      # pip install pyjwt

def mint_feedback_token(user):
    now = int(time.time())
    return jwt.encode(
        {"prj": "my-app", "aud": "feedback-hub", "iat": now, "exp": now + 600,
         "uid": str(user.id), "name": user.name, "role": user.role},
        os.environ["FEEDBACK_HUB_SECRET"], algorithm="HS256")

@app.get("/api/feedback-token")
def feedback_token(user=Depends(current_user)):        # FastAPI
    return {"token": mint_feedback_token(user)}
```

### PHP (Laravel / thuần)

```php
// composer require firebase/jwt
use Firebase\JWT\JWT;
Route::get('/api/feedback-token', function (Request $r) {      // middleware auth
    $u = $r->user(); $now = time();
    $token = JWT::encode([
        'prj' => 'my-app', 'aud' => 'feedback-hub', 'iat' => $now, 'exp' => $now + 600,
        'uid' => (string) $u->id, 'name' => $u->name, 'role' => $u->role,
    ], env('FEEDBACK_HUB_SECRET'), 'HS256');
    return response()->json(['token' => $token])->header('Cache-Control', 'no-store');
})->middleware('auth');
```

### Go

```go
// go get github.com/golang-jwt/jwt/v5
func feedbackToken(w http.ResponseWriter, r *http.Request) {
    u := currentUser(r) // phiên của bạn; trả 401 nếu chưa đăng nhập
    now := time.Now()
    t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
        "prj": "my-app", "aud": "feedback-hub", "iat": now.Unix(), "exp": now.Add(10 * time.Minute).Unix(),
        "uid": u.ID, "name": u.Name, "role": u.Role,
    })
    s, _ := t.SignedString([]byte(os.Getenv("FEEDBACK_HUB_SECRET")))
    w.Header().Set("Cache-Control", "no-store")
    json.NewEncoder(w).Encode(map[string]string{"token": s})
}
```

Ngôn ngữ khác: bất kỳ thư viện JWT nào hỗ trợ HS256 đều dùng được — chỉ cần đúng các claim ở bảng trên.

**Thử nhanh không cần viết mã:** `node scripts/mint-token.mjs my-app <khoá ký> user-1 "Nguyễn An" ADMIN` in ra một token để gọi API bằng `curl`.

## 3. Thẻ `<script>`

```html
<script src="https://feedback.example.com/widget.js"
        data-project="my-app"
        data-token-url="/api/feedback-token"
        defer></script>
```

Hết. Nút 💡 hiện ở góc phải dưới cho người đã đăng nhập; chưa đăng nhập (endpoint trả 401) thì **không hiện gì** và trang vẫn chạy bình thường — widget luôn "hỏng thì im lặng".

### Thuộc tính `data-*`

| Thuộc tính | Mặc định | Ý nghĩa |
|---|---|---|
| `data-project` | — (**bắt buộc**) | `slug` của dự án |
| `data-token-url` | — | URL endpoint token (cùng origin, gửi kèm cookie). Phản hồi: `{ "token": "…" }` |
| `data-hub` | origin của `widget.js` | Địa chỉ hub, khi `widget.js` được phục vụ từ nơi khác |
| `data-position` | theo cấu hình dự án | `bottom-right` · `bottom-left` · `top-right` · `top-left` |
| `data-color-scheme` | `auto` | `auto` (theo hệ thống, `html.dark`, `data-theme="dark"`) · `light` · `dark` |
| `data-label` | (không) | Chữ trên nút; cũng làm tiêu đề ngăn kéo |
| `data-icon` | `lightbulb` | `lightbulb` · `chat` · `pencil` · `flag` · `plus` |
| `data-locale` | `vi` | `vi` · `en` |
| `data-offset-x`, `data-offset-y` | `20` | Cách mép (px), 0–200 |
| `data-trigger` | — | Bộ chọn CSS của nút **có sẵn** trong ứng dụng; bấm vào đó mở widget (và ẩn nút nổi mặc định) |
| `data-fab` | `true` | `false` = không vẽ nút nổi (dùng cùng `data-trigger` hoặc `FeedbackHub.open()`) |
| `data-mask` | — | Bộ chọn CSS các vùng cần **che trong ảnh chụp trang** (cộng thêm với `[data-feedbackhub-mask]`, ô mật khẩu và ô `autocomplete=cc-*` luôn bị che) |
| `data-mount` | — | Bộ chọn CSS: nhúng bảng góp ý **vào trang** thay vì ngăn kéo |

Giao diện (màu, bo góc, phông…) đặt ở bảng điều khiển hoặc bằng biến CSS — xem [THEMING.md](THEMING.md).

### API JavaScript

```js
FeedbackHub.init({ project: "my-app", tokenUrl: "/api/feedback-token" });   // thay cho data-*
FeedbackHub.init({ project: "my-app", getToken: async () => (await myFetch("/me/feedback-token")).token });  // tự lấy token
FeedbackHub.open();      // mở ngăn kéo (vd. từ menu của bạn)
FeedbackHub.close();
FeedbackHub.refresh();   // tải lại danh sách ngay
FeedbackHub.hideFab(true);
FeedbackHub.destroy();   // gỡ widget (vd. khi đăng xuất trong ứng dụng một trang)

// Tuỳ chọn khác của init():
//   theme: { primary: "#0f766e", … }   ghi đè theme dự án (xem THEMING.md)
//   strings: { submit: "Gửi" }        ghi đè chữ
//   getContext: () => ({ contentRef, extra })
//   onState: ({ open }) => …           biết ngăn kéo mở/đóng (cũng bắn sự kiện window "feedbackhub:state")
```

Ứng dụng một trang (SPA): đăng xuất → `FeedbackHub.destroy()`; đăng nhập → `FeedbackHub.init({...})`.

### Content-Security-Policy

Nếu ứng dụng có CSP, thêm origin của hub: `script-src https://feedback.example.com; connect-src https://feedback.example.com`. Widget không dùng `eval`, không tải phông hay ảnh bên ngoài.

## Cho người dùng góp ý về **nội dung** (không chỉ chức năng)

Mỗi góp ý có thể mang ngữ cảnh để người (hoặc AI) tìm đúng chỗ:

- **Chỉ chỗ cần sửa**: người dùng bấm 🎯 rồi chọn phần tử → gửi kèm `pageTarget` (đường dẫn CSS + chữ nhìn thấy).
- **Sửa chữ tại chỗ**: bôi đen một đoạn → "✏️ Sửa chữ này" → nhập "sửa thành" → gửi `suggestion {before, after}`.
- **Định danh nội dung**: nếu nội dung nằm trong CSDL (câu hỏi, bài viết…), truyền hàm `getContext` khi khởi tạo; widget gọi nó lúc gửi và đính `contentRef` (vd. `"question:12"`) để biết góp ý thuộc bản ghi nào:
  ```js
  FeedbackHub.init({
    project: "my-app", tokenUrl: "/api/feedback-token",
    getContext: () => ({ contentRef: `question:${currentQuestionId}`, extra: { course: "CS101" } }),
  });
  ```
- **Dữ liệu riêng**: `extra` trong `getContext` (hoặc khi gọi API từ máy chủ) — object tuỳ ý, AI đọc được.

## Mỗi góp ý ghi rõ "từ trang nào, với dữ liệu nào"

Mục đích chính của widget là thu phản hồi về **chức năng, nội dung và dữ liệu**, rồi để người (hoặc Claude) dựa vào đó sửa hệ thống. Nên mỗi góp ý tự mang đủ thông tin để tìm đúng chỗ, không phải hỏi lại:

| Thông tin | Nguồn | Lưu ở |
|---|---|---|
| Đường dẫn và **địa chỉ đầy đủ** (kèm query) | widget tự lấy | `pagePath`, `pageUrl` |
| Tiêu đề trang, cỡ màn hình, ngôn ngữ trình duyệt | widget tự lấy | `extra.pageTitle`, `extra.viewport`, `extra.lang` |
| **Ảnh chụp trang** như người gửi thấy (đúng vị trí cuộn) | widget tự chụp, người gửi bỏ được | tệp đính kèm `trang-chup.png` |
| Phần tử người gửi chỉ vào, đoạn chữ họ bôi đen | người gửi | `pageTarget`, `suggestion` |
| **Bản ghi dữ liệu** bị góp ý (bài học, câu hỏi, khoá học…) | ứng dụng chủ qua `getContext` | `contentRef`, `extra` |

Quan trọng nhất là phần cuối: ứng dụng chủ biết "trang này đang hiển thị bản ghi nào", widget thì không. Hãy truyền:

```js
FeedbackHub.init({
  project: "my-app", tokenUrl: "/api/feedback-token",
  getContext: () => ({ contentRef: `lesson:${lessonId}`, extra: { course: courseSlug, role: currentRole } }),
});
```

### Ảnh chụp trang

- Admin chọn trong **Cấu hình → Tính năng → Ảnh chụp trang**: *Bật sẵn* (ô được chọn sẵn, nên dùng cho góp ý về nội dung/dữ liệu), *Cho chọn* (mặc định bỏ chọn, là mặc định của dự án mới) hoặc *Tắt*.
- Chụp ngay khi mở ngăn kéo, người gửi thấy ảnh xem trước và bấm **Chụp lại** hoặc bỏ chọn được. Ngăn kéo của widget không lọt vào ảnh.
- Thư viện chụp ([modern-screenshot](https://github.com/qq15725/modern-screenshot), MIT) nằm ngay trên hub (`/vendor/modern-screenshot.mjs`), nạp theo yêu cầu khi cần chụp — **không tải từ CDN ngoài**, không chạy khi người dùng không dùng tới. CSP của ứng dụng chủ cần cho phép `script-src` tới hub (đã cần để nạp `widget.js`).
- **Che dữ liệu nhạy cảm**: ô mật khẩu và ô `autocomplete="cc-*"` luôn bị che; thêm `data-feedbackhub-mask` vào bất kỳ phần tử nào (hoặc `data-mask="…"` / `mask: "…"` với bộ chọn CSS) để che nó và mọi thứ bên trong. Phần bị che chỉ còn khối xám, giá trị ô nhập bị xoá khỏi ảnh.
- Ảnh có thể chứa dữ liệu của người dùng khác (bảng điểm, danh sách lớp). Nếu trang đó nhạy cảm, hãy che vùng ấy hoặc để dự án ở chế độ *Cho chọn* / *Tắt*.
- Chụp bằng cách vẽ lại DOM, nên **không** thấy: nội dung `<iframe>` khác nguồn, `<video>`, `<canvas>` bị tainted, và một số hiệu ứng CSS mới. Chụp lỗi thì góp ý vẫn được gửi kèm đường dẫn.

## Nhận thông báo khi có phản hồi (webhook)

Hub có thể gọi ứng dụng của bạn khi AI/người xử lý trả lời hoặc đổi trạng thái. Điền **Webhook URL** ở tab cài đặt dự án. Hub `POST` JSON:

```json
{ "event": "feedback.reply",
  "project": "my-app",
  "feedback": { "id": "…", "title": "…", "kind": "content", "status": "awaiting_user", "reporterId": "u-17" },
  "message": { "role": "ai", "body": "Anh/chị muốn sửa ở bước nào?" } }
```

Header: `X-Hub-Event` (`feedback.reply` | `feedback.status`) và `X-Hub-Signature: sha256=<HMAC-SHA256 của thân yêu cầu thô, khoá = khoá ký của dự án>`. **Luôn kiểm chữ ký** bằng so sánh thời gian hằng số trước khi tin nội dung:

```js
import { createHmac, timingSafeEqual } from "node:crypto";
export async function POST(req) {
  const raw = await req.text();
  const want = "sha256=" + createHmac("sha256", process.env.FEEDBACK_HUB_SECRET).update(raw).digest("hex");
  const got = req.headers.get("x-hub-signature") ?? "";
  if (got.length !== want.length || !timingSafeEqual(Buffer.from(got), Buffer.from(want))) return new Response("bad signature", { status: 401 });
  const ev = JSON.parse(raw);
  // …tạo thông báo cho ev.feedback.reporterId trong ứng dụng của bạn…
  return Response.json({ ok: true });
}
```

Hub chờ tối đa 8 giây và **không gửi lại**; lỗi ghi vào nhật ký sự kiện của góp ý. Widget vẫn tự hỏi hub định kỳ nên không phụ thuộc hoàn toàn vào webhook.

## Gửi ẩn danh (ứng dụng không có đăng nhập)

Bật **Cho phép gửi ẩn danh** ở dự án và khai `allowedOrigins`. Khi đó **không cần endpoint token**:

```html
<script src="https://feedback.example.com/widget.js" data-project="my-site" defer></script>
```

Người dùng chỉ **gửi** được (không xem lại danh sách), kèm tên/email tuỳ chọn. Hub bắt buộc `Origin` hợp lệ và giới hạn 5 góp ý/10 phút/IP. Dùng cho trang tài liệu, trang giới thiệu, ứng dụng công khai.

## Gửi từ máy chủ (không dùng widget)

Mọi thứ widget làm đều là API công khai — xem [API.md](API.md). Ví dụ gửi một góp ý từ mã của bạn:

```bash
curl -X POST https://feedback.example.com/api/v1/feedback \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"type":"bug","title":"Xuất PDF bị cắt chữ","pagePath":"/reports/3","source":"api"}'
```

## Kiểm tra sau khi tích hợp

- [ ] Đăng nhập → thấy nút 💡; đăng xuất/mở cửa sổ ẩn danh → không thấy (nếu không bật ẩn danh).
- [ ] Gửi thử một góp ý → xuất hiện ở bảng điều khiển hub, tab **Bảng góp ý**.
- [ ] Mở DevTools → Network: gọi `/api/v1/...` trả 200, không có lỗi CORS (nếu có: thêm origin vào `allowedOrigins`).
- [ ] Token hết hạn (đặt `exp` 1 phút rồi chờ) → widget tự xin token mới, không báo lỗi.
- [ ] Khoá ký không xuất hiện trong mã nguồn trang hay lịch sử git.

## Cho AI tích hợp giúp bạn

Repo có sẵn skill cho Claude Code tại [`.claude/skills/integrate-feedback-hub/SKILL.md`](../.claude/skills/integrate-feedback-hub/SKILL.md). Trong thư mục ứng dụng của bạn, nói với Claude: *"Tích hợp Feedback Hub vào ứng dụng này"* — nó sẽ đọc framework, thêm endpoint token và thẻ script đúng chỗ.
