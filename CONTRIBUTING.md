# Đóng góp cho Feedback Hub

Cảm ơn bạn. Dự án nhỏ, dễ chạy cục bộ; vài quy ước dưới đây giúp thay đổi của bạn được nhận nhanh.

## Chạy cục bộ

Cần Node ≥ 20 và Docker (cho PostgreSQL).

```bash
docker run -d --name fh-db -e POSTGRES_PASSWORD=pw -e POSTGRES_DB=feedbackhub -p 5437:5432 postgres:16-alpine
cp .env.example .env
#   DATABASE_URL=postgresql://postgres:pw@localhost:5437/feedbackhub
#   AUTH_SECRET=… HUB_ENCRYPTION_KEY=… (≥ 16 ký tự)  HUB_DATA_DIR=./data
#   HUB_ADMIN_EMAIL=you@example.com  HUB_ADMIN_PASSWORD=mật-khẩu-thử
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev          # http://localhost:3100
```

Mở `http://localhost:3100/demo.html` để thử widget.

## Trước khi mở pull request

```bash
npx tsc --noEmit       # kiểu
npm run lint
npm run smoke          # kiểm thử đầu-cuối API (hub phải đang chạy ở :3100; hub trong Docker: thêm SMOKE_HOOK_HOST=host.docker.internal)
node worker/test.mjs   # kiểm thử worker (dùng hub giả, không tốn token)
node mcp/test.mjs      # kiểm thử MCP
```

Thay đổi API → cập nhật [docs/API.md](docs/API.md) **và** [docs/SPEC.md](docs/SPEC.md) nếu đụng khái niệm, rồi thêm bước vào `scripts/smoke.mjs`. Khi tài liệu và mã khác nhau, mã đúng và tài liệu cần sửa.

## Quy ước

- **Next.js 16**: `params`, `cookies()`, `headers()` là bất đồng bộ; đọc `node_modules/next/dist/docs/` trước khi dùng API mà bạn không chắc (xem [CLAUDE.md](CLAUDE.md)).
- **Mọi đầu vào** qua `zod`. **Mọi chuyển trạng thái** qua `transition()` trong `src/lib/feedback.ts` (để Event và webhook không bị bỏ sót) — đừng `prisma.feedback.update({status})` thẳng.
- **Quyền kiểm ở API**, không chỉ ở giao diện. Truy vấn của người dùng/worker luôn ràng theo `projectId`.
- **Không phụ thuộc mới** cho widget, worker, MCP (widget: JS thuần; worker: không gói ngoài). Có lý do chính đáng thì nêu trong PR.
- **Widget không bao giờ gắn dữ liệu ngoài vào `innerHTML`** — dùng `textContent`. Widget hỏng thì im lặng, không làm hỏng trang chủ.
- **Migration Prisma chỉ thêm** (cột mới có mặc định, bảng mới). Đổi/xoá cột đang dùng cần kế hoạch backfill.
- **Bí mật**: không commit `.env`, khoá ký, khoá máy. Không đưa dữ liệu thật của người dùng vào kiểm thử/ảnh chụp.
- Văn bản giao diện và tài liệu hiện bằng tiếng Việt; bản dịch (tiếng Anh, ngôn ngữ khác) rất được chào đón — widget có bảng chữ `VI`/`EN` ở đầu `public/widget.js`.

## Báo lỗi / đề xuất

Mở Issue, nêu: hành vi mong đợi, hành vi thực tế, các bước tái hiện, phiên bản (`git rev-parse --short HEAD`). **Lỗ hổng bảo mật**: đừng mở Issue công khai — xem [docs/SECURITY.md](docs/SECURITY.md#báo-lỗ-hổng).

## Cấu trúc mã

```
src/lib/feedback.ts       tạo/chuyển trạng thái/nhắn/webhook (lõi nghiệp vụ)
src/lib/auth-user.ts      xác thực token người dùng + ẩn danh
src/lib/auth-machine.ts   xác thực khoá worker/operator
src/app/api/v1/…          API người dùng; …/machine/… là API máy
src/app/api/admin/…       API của bảng điều khiển (cookie)
src/app/(console)/…       bảng điều khiển
public/widget.js          widget (một tệp)
worker/ mcp/              bên xử lý
prisma/schema.prisma      mô hình dữ liệu
```
