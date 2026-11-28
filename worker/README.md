# Worker chung — "chế độ làm ngay" (execute)

Tổng quát hoá vòng lặp tự phát triển của DGXL (`scripts/dgxl-autodev-server.sh`) cho **bất kỳ ứng dụng nào** dùng Feedback Hub. Node ≥ 20, **không phụ thuộc gói ngoài**, gọi API của hub thay vì SQL.

Mỗi lần gọi chạy **một lượt** rồi thoát (để cron/launchd gọi mỗi phút) và **thoát ngay nếu không có việc** — không tốn token.

```
hub-worker.mjs      worker tất định: khoá, claim, chạy agent, kiểm phạm vi, dựng thử, giao, quay lui
hub-cli.mjs         CLI cho AGENT nói chuyện với hub (agent không có quyền DB)
prompt.vi.md        mẫu prompt cho agent ({{placeholder}}); ghi đè bằng "promptFile"
worker.config.example.json
test.mjs            kiểm thử trọn vòng với agent giả (KHÔNG chạy claude thật, KHÔNG deploy thật)
```

## Phân vai (cơ chế an toàn cốt lõi)

- **Agent** (Claude headless) chỉ được viết mã, dựng thử, commit trên nhánh gốc và *khai* kết quả qua `hub-cli`. Prompt cấm deploy/push/xoá DB/đụng tệp bí mật/`userVerdict`.
- **Worker** (script này) lo sao lưu, triển khai, kiểm tra sức khoẻ, kiểm chứng và quay lui — vì quay lui không thể phó thác cho một agent vừa làm hỏng hệ thống tự đánh giá là mình đã làm hỏng.
- `hub-cli transition <id> done` của agent **không** đánh dấu hoàn thành: nó ghi nhận lời khai (ghi chú + chuỗi `--expected`) và giữ `reviewing`. Chỉ worker mới đặt `done` thật, sau khi dựng/triển khai/kiểm chứng. Nhờ vậy người gửi không thấy "xong" khi thay đổi chưa lên, và webhook "done" chỉ bắn khi đã đúng.

## Một lượt chạy

1. **Khoá chống chạy chồng** (`mkdir` nguyên tử ở `lockDir/<project>.lock`). Van xả: khoá cũ hơn `lockStaleMin` (50) phút → coi phiên trước đã chết, cướp khoá và ghi cảnh báo. Worker tự làm tươi mốc thời gian khoá mỗi 30 giây nên một lượt dài hợp lệ không bị cướp nhầm.
2. **Heartbeat** (hub hiện "worker thấy lần cuối") → nếu `project.mode ≠ execute` thoát.
3. **Hàng đợi.** Cờ Dừng còn sót (mồ côi — đang giữ khoá nên chắc chắn không có agent nào chạy) → `awaiting_user` + tin hệ thống, `clearStop`. Hết việc → thoát.
4. Kiểm tra môi trường **trước** khi nhận việc (kho git, lệnh agent có trong PATH, biến xác thực) — lỗi môi trường không làm hỏng góp ý của ai; cảnh báo chỉ ghi khi nội dung đổi để khỏi ngập nhật ký.
5. **Claim việc cũ nhất** (nguyên tử; `409` = bên khác đang giữ → thử việc kế tiếp). Mỗi lượt làm **đúng một** góp ý.
6. **Nhà cung cấp & mô hình:** `aiProvider` khác `claude` → nạp tệp env theo bản đồ `providers` *cục bộ*; **thiếu thì không chạy lặng lẽ bằng Claude** mà đặt `awaiting_user` kèm lý do. `--model` chỉ truyền khi `aiModel` nằm trong `allowedModels` cục bộ (giá trị này đi thẳng vào tham số dòng lệnh).
7. Cất (không xoá) thay đổi chưa commit còn sót vào `git stash`; ghi mốc lùi `PREV_SHA`.
8. Ghi tin tiến độ, **chạy agent ở nền**, canh cờ Dừng mỗi 2 giây và trần `agent.timeoutSec`; cắt **cả nhóm tiến trình** (SIGTERM rồi SIGKILL), phần viết dở được cất vào `git stash`.
9. Lấy chi phí từ JSON `total_cost_usd` → `addCostUsd`, `addAgentRuns: 1`.
10. **Kiểm phạm vi:** tệp đụng ngoài `allowedPaths` → ghi `scopeViolation`; đụng `protectedPaths` (tệp bí mật) → không giao, giữ mã ở nhánh riêng, `awaiting_user`.
11. Quyết định theo kết quả:
    - Không có commit mới → giữ trạng thái agent đã ghi (`awaiting_user`/`rejected`/`done`); agent im lặng hoặc bị ngắt → `awaiting_user` trung thực, không để treo ở `reviewing`.
    - Có commit nhưng agent bị ngắt giữa chừng/làm lệch nhánh/viết lại lịch sử → **không giao**: commit được giữ ở nhánh `hub/<id>-…`, nhánh gốc về `PREV_SHA`.
    - Có commit hợp lệ → **cổng dựng thử** (`build`; hỏng thì không giao) rồi giao theo **mức giao hiệu lực = min(`deliver` trên hub, `maxDeliver` cục bộ)**:
      - `branch`: kiểm chứng (`grep-build`) → tạo nhánh `hub/<id>` trỏ commit, đưa nhánh gốc về `PREV_SHA`, đặt `done` kèm ghi chú "Chờ duyệt nhánh hub/<id>". **Không deploy.**
      - `deploy`: `deploying` → `backup` (**thất bại → KHÔNG deploy**) → `deploy` → health check (`healthTries`×`healthIntervalSec`, mặc định 30×4s) → kiểm chứng chuỗi đã khai → `done`. Hỏng → `git reset --hard PREV_SHA`, deploy lại bản cũ, `awaiting_user` + `rolledBack: true`; nếu cả quay lui cũng hỏng thì ghi chú **NGHIÊM TRỌNG** và thoát mã 1. Commit hỏng được giữ ở nhánh để điều tra.
12. **Không bao giờ tự khôi phục dữ liệu từ bản sao lưu** — khôi phục xoá mọi thao tác người dùng làm trong khoảng đó; để người quyết định.

**Kiểm chứng lời khai** (`verify`): agent phải khai `--expected` một chuỗi quan sát được; worker tự tìm chuỗi đó — `{ "mode": "grep-build", "dir": ".next" }` (grep trong thư mục dựng của kho) hoặc `{ "mode": "cmd", "cmd": "docker exec app grep -rqF {expected} /app/.next" }` (`{expected}` được tự quote; mã thoát 0 = thấy). Không thấy → `verifyResult: "fail"` và `awaiting_user`, bất kể agent báo gì. Chế độ `cmd` chỉ chạy ở mức giao `deploy` (kiểm bản đang chạy thật). Không có `verify` hoặc agent không khai chuỗi → `skipped`.

## Cấu hình từ hub (chỉ thắt chặt)

Quản trị dự án đặt ở hub (Cài đặt → Chế độ → «Cấu hình AI làm việc»): ngân sách và thời gian tối đa mỗi lượt, ranh giới bổ sung, hướng dẫn riêng. Worker lấy **min(hub, trần cục bộ)** cho ngân sách/thời gian và **cộng thêm** ranh giới/hướng dẫn vào prompt. Hub không nới được gì: đường dẫn được sửa, lệnh dựng/triển khai, khoá, `maxDeliver` luôn là cấu hình cục bộ — hub bị chiếm quyền hay admin đặt nhầm cũng không mở rộng quyền của agent trên máy. Hàng đợi xếp theo mức ưu tiên (Khẩn trước).

## Cấu hình

Xem `worker.config.example.json`. Đường dẫn tương đối tính từ thư mục chứa tệp cấu hình; `~` được mở rộng.

| Khoá | Ý nghĩa |
|---|---|
| `hub`, `project`, `repo` | URL hub, slug dự án, kho git **riêng của worker** (đừng dùng kho bạn đang tự sửa tay) |
| `baseBranch` | nhánh agent commit vào (mặc định: nhánh đang checkout) |
| `maxDeliver` | `branch` \| `deploy` — **trần cục bộ**. Hub bị chiếm quyền cũng không bật được tự triển khai ở nơi không cho phép. Mặc định `branch`. |
| `build` | lệnh dựng thử (cổng bắt buộc nếu có) |
| `deploy` | lệnh triển khai — bắt buộc nếu `maxDeliver=deploy` |
| `healthUrl`, `healthTries`, `healthIntervalSec` | kiểm tra sau triển khai |
| `backup` | lệnh sao lưu trước triển khai; thoát ≠ 0 → không deploy. (Không khai thì deploy KHÔNG có sao lưu và nhật ký cảnh báo.) |
| `verify` | xem trên |
| `agent` | `{ cmd:"claude", args?, modelArgs?, timeoutSec:2400, budgetUsd:10, envFile?, requireAnyEnv? }`. Mặc định chạy `claude -p <prompt> --permission-mode bypassPermissions --output-format json --max-budget-usd N`. `args` thay được hoàn toàn (placeholder `{prompt}`, `{promptFile}`, `{budget}`, `{model}`). |
| `allowedModels` | mô hình được phép truyền `--model` |
| `providers` | `{ "glm": "~/.hub-worker-glm.env" }` hoặc `{ "glm": { "envFile": "…", "cmd": "…", "args": […] } }` |
| `allowedPaths` | tiền tố tệp agent được phép đụng; ngoài ra → `scopeViolation` |
| `protectedPaths` | tệp bí mật: bị sửa thì khôi phục / không giao |
| `boundaries` | đoạn văn (hoặc mảng) **ranh giới riêng của ứng dụng** — chèn vào `{{boundaries}}` của prompt, như CLAUDE.md của từng ứng dụng |
| `promptFile` | ghi đè prompt. Placeholder: `projectName projectSlug feedbackId cli repo baseBranch buildCmd allowedPaths boundaries` |
| `pathPrepend` | thư mục thêm vào PATH (cron chạy với môi trường tối thiểu — nơi `npm i -g` đặt `claude`) |
| `lockDir`, `logDir`, `lockStaleMin` | khoá và nhật ký (`<logDir>/<project>-YYYY-MM-DD.log`; prompt từng lượt ở `<logDir>/prompts/`) |

### Nơi đặt khoá (bí mật)

**Không đặt khoá trong tệp cấu hình đã commit.** Dùng một trong hai:

- biến môi trường `HUB_KEY=fhk_w_…`;
- `"keyFile": "~/.feedback-hub-worker/key"` — tệp chỉ-chủ-đọc. Worker **từ chối chạy** nếu tệp cho người khác đọc (`chmod 600`).

```bash
mkdir -p ~/.feedback-hub-worker && umask 077
printf '%s\n' 'fhk_w_xxxxxxxx' > ~/.feedback-hub-worker/key     # khoá worker cấp ở trang quản trị của hub
```

Xác thực cho agent (token Claude dài hạn `claude setup-token`, hoặc `ANTHROPIC_API_KEY`) đặt ở `agent.envFile` (dạng `KEY=VALUE`, `chmod 600`).

## Cài bằng cron (mỗi phút)

```cron
* * * * * HUB_WORKER_CONFIG=$HOME/.feedback-hub-worker/worker.config.json /usr/local/bin/node /đường/dẫn/FeedbackHub/worker/hub-worker.mjs >/dev/null 2>&1
```

Khoá chống chạy chồng bảo đảm lượt sau thoát ngay nếu lượt trước còn chạy. Nhật ký ở `logDir`. Thêm `--verbose` khi chạy tay để in ra màn hình. Mã thoát 0 = bình thường (kể cả không có việc); 1 = lỗi môi trường/triển khai hỏng cần người xem.

## Cài bằng launchd (macOS)

`~/Library/LaunchAgents/vn.edu.feedback-hub.worker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>vn.edu.feedback-hub.worker</string>
  <key>ProgramArguments</key><array>
    <string>/usr/local/bin/node</string>
    <string>/đường/dẫn/FeedbackHub/worker/hub-worker.mjs</string>
    <string>--config</string>
    <string>/Users/ban/.feedback-hub-worker/worker.config.json</string>
  </array>
  <key>StartInterval</key><integer>60</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardErrorPath</key><string>/Users/ban/.feedback-hub-worker/launchd.err</string>
</dict></plist>
```

```bash
launchctl load ~/Library/LaunchAgents/vn.edu.feedback-hub.worker.plist
```

(launchd cũng chạy với PATH tối thiểu — đặt `pathPrepend` trong cấu hình cho `claude`/`node`/`docker`.)

## Kiểm thử

```bash
HUB=http://localhost:3100 HUB_ADMIN_EMAIL=admin@example.com HUB_ADMIN_PASSWORD=admin123 node test.mjs
```

Tạo dự án và khoá tạm, kho git tạm và "agent giả" (`test-fixtures/fake-agent.mjs` — đọc hàng đợi qua `hub-cli`, sửa tệp, commit, ghi tin, khai `done`), lệnh deploy/backup/health giả; chạy worker trọn vòng. Các ca: collect; execute+branch; execute+deploy; deploy hỏng → quay lui đúng commit (và quay lui cũng hỏng → NGHIÊM TRỌNG); hub đặt `deploy` nhưng `maxDeliver=branch`; cờ Dừng cắt cả nhóm tiến trình; kiểm chứng thất bại; nhà cung cấp lạ; danh sách mô hình; vi phạm phạm vi; sao lưu hỏng; khoá chống chạy chồng và cướp khoá cũ; hàng đợi rỗng; giới hạn của `hub-cli`. Dọn dữ liệu thử ở cuối. Đặt `KEEP=1` để giữ thư mục tạm khi gỡ lỗi.

## Giới hạn đã biết

- Một lượt = một góp ý (khác bản DGXL làm cả hàng đợi trong một phiên agent). Đổi lại: nhà cung cấp/mô hình đúng từng góp ý, claim nguyên tử không lẫn với người nhờ Claude làm tay, chi phí tính chính xác theo góp ý (không chia đều).
- Chạy agent bằng `--permission-mode bypassPermissions` nên không ngăn *trước* được việc agent đi ra ngoài phạm vi; worker chỉ *phát hiện sau* (`scopeViolation`, `protectedPaths`). Hãy chạy worker bằng tài khoản hệ điều hành hạn chế và kho git riêng.
- Kiểm chứng bằng chuỗi chỉ phát hiện được thay đổi *nhìn thấy được*; thay đổi thuần logic/màu sắc thì `skipped`.
- `git stash` cất phần viết dở nhưng worker không tự dọn stash cũ.
