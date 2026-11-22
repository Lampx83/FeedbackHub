#!/usr/bin/env node
/**
 * Kiểm thử đầu-cuối trên một hub đang chạy: toàn bộ vòng đời của một góp ý, phân quyền, claim nguyên tử,
 * webhook có chữ ký, chế độ thu nhận. Tạo một dự án tạm rồi xoá ở cuối.
 *   HUB=http://localhost:3100 HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… npm run smoke
 * Hub trong Docker: thêm SMOKE_HOOK_HOST=host.docker.internal
 */
import { createHmac } from "node:crypto";
import http from "node:http";
import { SignJWT } from "jose";

const HUB = process.env.HUB || "http://localhost:3100";
const EMAIL = process.env.HUB_ADMIN_EMAIL || "admin@example.com";
const PASS = process.env.HUB_ADMIN_PASSWORD || "admin123";
const slug = `smoke-${Date.now().toString(36)}`;
let passed = 0;
const failures = [];
const ok = (cond, name, extra = "") => {
  if (cond) passed++;
  else failures.push(`${name} ${extra}`);
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : " " + extra}`);
};

async function call(method, path, { token, key, body, cookie, headers = {} } = {}) {
  const res = await fetch(HUB + path, {
    method,
    headers: {
      ...(body && !(body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, res };
}

const mint = async (secret, uid, name, role, ttl = "10m") =>
  new SignJWT({ prj: slug, uid, name, role })
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("feedback-hub")
    .setIssuedAt()
    .setExpirationTime(ttl)
    .sign(new TextEncoder().encode(secret));

// ── webhook receiver ─────────────────────────────────────────────────────────
const hooks = [];
let secret;
const server = http.createServer((req, res) => {
  let b = "";
  req.on("data", (c) => (b += c));
  req.on("end", () => {
    const sig = req.headers["x-hub-signature"];
    const want = "sha256=" + createHmac("sha256", secret || "").update(b).digest("hex");
    hooks.push({ event: req.headers["x-hub-event"], valid: sig === want, body: JSON.parse(b) });
    res.end("ok");
  });
});
// Hub chạy trong Docker không gọi được 127.0.0.1 của máy bạn: đặt SMOKE_HOOK_HOST=host.docker.internal.
const hookHost = process.env.SMOKE_HOOK_HOST || "127.0.0.1";
await new Promise((r) => server.listen(0, process.env.SMOKE_HOOK_HOST ? "0.0.0.0" : "127.0.0.1", r));
const hookUrl = `http://${hookHost}:${server.address().port}/hook`;

try {
  // ── quản trị: đăng nhập, tạo dự án ─────────────────────────────────────────
  const login = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: PASS } });
  ok(login.status === 200, "đăng nhập quản trị", JSON.stringify(login.data));
  const cookie = login.res.headers.get("set-cookie")?.split(";")[0];
  const bad = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: "sai-mat-khau" } });
  ok(bad.status === 401, "sai mật khẩu bị từ chối");

  const created = await call("POST", "/api/admin/projects", {
    cookie,
    body: { slug, name: "Smoke test", allowedOrigins: ["http://app.test"], submitRoles: ["ADMIN", "STAFF"], adminRoles: ["ADMIN"] },
  });
  ok(created.status === 200 && created.data.signingSecret, "tạo dự án", JSON.stringify(created.data));
  secret = created.data.signingSecret;
  const patched = await call("PATCH", `/api/admin/projects/${slug}`, {
    cookie,
    body: {
      mode: "execute",
      webhookUrl: hookUrl,
      features: { models: [{ id: "claude-sonnet-5", label: "Sonnet 5" }], planApproval: true },
      theme: { primary: "#1d4ed8", primaryText: "#ffffff", position: "bottom-right", label: "Góp ý" },
    },
  });
  ok(patched.status === 200, "cấu hình dự án (execute, webhook, theme)", JSON.stringify(patched.data));
  const badTheme = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { theme: { primary: "url(javascript:alert(1))" } } });
  ok(badTheme.status === 400, "theme chứa giá trị nguy hiểm bị từ chối");

  const cfg = await call("GET", `/api/v1/config?project=${slug}`);
  ok(cfg.status === 200 && cfg.data.theme.primary === "#1d4ed8" && !JSON.stringify(cfg.data).includes(secret), "cấu hình công khai, không lộ khoá");

  const wk = await call("POST", `/api/admin/projects/${slug}/keys`, { cookie, body: { label: "worker-smoke" } });
  const op = await call("POST", "/api/admin/keys", { cookie, body: { label: "operator-smoke" } });
  ok(wk.data.key?.startsWith("fhk_w_") && op.data.key?.startsWith("fhk_o_"), "cấp khoá worker và operator");

  // ── người dùng cuối ───────────────────────────────────────────────────────
  const staff = await mint(secret, "u-staff", "Nguyễn Văn A", "STAFF");
  const admin = await mint(secret, "u-admin", "Trần Thị B", "ADMIN");
  const guest = await mint(secret, "u-guest", "Khách", "GUEST");
  const forged = await mint("khoa-gia-khoa-gia-khoa-gia-1234", "u-x", "X", "ADMIN");

  ok((await call("POST", "/api/v1/feedback", { token: forged, body: { title: "Token giả mạo" } })).status === 401, "token ký sai khoá bị từ chối");
  ok((await call("POST", "/api/v1/feedback", { token: guest, body: { title: "Vai trò không được phép" } })).status === 403, "vai trò ngoài submitRoles bị từ chối");
  const expired = await mint(secret, "u-staff", "A", "STAFF", "-5m");
  ok((await call("POST", "/api/v1/feedback", { token: expired, body: { title: "Token hết hạn" } })).status === 401, "token hết hạn bị từ chối");

  const body1 = {
    type: "content", title: "Câu 12 sai đáp án", body: 'Đáp án đúng là "Hà Nội", không phải "Huế".',
    pagePath: "/quiz/12", pageTarget: "main > h2 | Câu 12", contentRef: "question:12",
    suggestion: { before: "Huế", after: "Hà Nội" }, source: "widget", requirePlan: true, aiModel: "claude-sonnet-5",
  };
  const c1 = await call("POST", "/api/v1/feedback", { token: staff, body: body1 });
  ok(c1.status === 200 && c1.data.feedback.status === "pending" && c1.data.feedback.refDensity === 3, "gửi góp ý (refDensity=3)", JSON.stringify(c1.data));
  const id = c1.data.feedback?.id;
  ok(c1.data.feedback?.kind === "content", "loại riêng ánh xạ về kind chuẩn");
  ok((await call("POST", "/api/v1/feedback", { token: staff, body: { ...body1, aiModel: "gpt-9" } })).status === 400, "mô hình ngoài danh sách bị từ chối");
  const dup = await call("POST", "/api/v1/feedback", { token: staff, body: body1 });
  ok(dup.status === 409 && dup.data.duplicateOf?.id === id, "chặn gửi trùng, trả góp ý cũ");
  ok((await call("POST", "/api/v1/feedback", { token: staff, body: { ...body1, allowDuplicate: true } })).status === 200, "vẫn gửi bản mới khi chọn allowDuplicate");

  const fd = new FormData();
  fd.append("file", new File([Uint8Array.from([137, 80, 78, 71])], "anh.png", { type: "image/png" }));
  const up = await call("POST", `/api/v1/feedback/${id}/attachments`, { token: staff, body: fd });
  ok(up.status === 200, "đính kèm ảnh", JSON.stringify(up.data));
  const fdBad = new FormData();
  fdBad.append("file", new File(["x"], "virus.exe", { type: "application/x-msdownload" }));
  ok((await call("POST", `/api/v1/feedback/${id}/attachments`, { token: staff, body: fdBad })).status === 415, "loại tệp lạ bị từ chối");
  const dl = await call("GET", `/api/v1/attachments/${up.data.attachment.id}?t=${staff}`);
  ok(dl.status === 200, "tải tệp bằng ?t=token");
  const other = await mint(secret, "u-other", "Người khác", "STAFF");
  ok((await call("GET", `/api/v1/attachments/${up.data.attachment.id}?t=${other}`)).status === 403, "người khác không tải được tệp");

  const mine = await call("GET", "/api/v1/feedback", { token: staff });
  ok(mine.data.items.length === 2 && mine.data.isAdmin === false, "người gửi chỉ thấy của mình");
  ok((await call("GET", "/api/v1/feedback", { token: other })).data.items.length === 0, "người khác không thấy góp ý của A");
  ok((await call("GET", `/api/v1/feedback/${id}`, { token: other })).status === 403, "xem chi tiết góp ý của người khác bị chặn");
  const adm = await call("GET", "/api/v1/feedback", { token: admin });
  ok(adm.data.items.length === 2 && adm.data.isAdmin === true, "quản trị dự án thấy tất cả");

  // ── worker ────────────────────────────────────────────────────────────────
  const W = wk.data.key;
  const q1 = await call("GET", "/api/v1/machine/queue", { key: W });
  ok(q1.status === 200 && q1.data.project.mode === "execute" && q1.data.items.length === 2 && q1.data.items[0].id === id, "worker thấy hàng đợi, cũ trước");
  ok((await call("GET", "/api/v1/machine/queue", { token: staff })).status === 401, "token người dùng không dùng được ở API máy");
  const claim = await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: W });
  ok(claim.status === 200, "worker nhận việc");
  ok((await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: op.data.key, headers: {} })).status === 409, "nhận lần hai bởi bên khác → 409 (claim nguyên tử)");
  ok((await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: W })).data.resumed === true, "bên đang giữ gọi lại → làm tiếp");
  await call("POST", `/api/v1/machine/feedback/${id}/messages`, { key: W, body: { kind: "progress", body: "Đang tìm câu 12" } });

  // người gửi bấm Dừng khi đang làm → chỉ đặt cờ
  const stop = await call("PATCH", `/api/v1/feedback/${id}`, { token: staff, body: { stop: true } });
  ok(stop.status === 200, "người gửi bấm Dừng khi AI đang làm");
  const q2 = await call("GET", "/api/v1/machine/queue", { key: W });
  ok(q2.data.stopRequested.includes(id), "worker thấy cờ dừng");

  // worker hỏi lại (awaiting_user) → webhook, rồi người gửi trả lời → về hàng đợi
  const ask = await call("POST", `/api/v1/machine/feedback/${id}/transition`, {
    key: W, body: { to: "awaiting_user", note: "Cần biết đáp án đúng", message: { body: "Đáp án đúng là gì ạ?" }, fields: { clearStop: true } },
  });
  ok(ask.status === 200 && ask.data.feedback.status === "awaiting_user" && ask.data.feedback.stopRequestedAt === null, "worker hỏi lại, xoá cờ dừng");
  await new Promise((r) => setTimeout(r, 400));
  ok(hooks.some((h) => h.event === "feedback.reply" && h.valid && h.body.feedback.reporterId === "u-staff"), "webhook feedback.reply có chữ ký hợp lệ");
  ok(hooks.some((h) => h.event === "feedback.status" && h.valid && h.body.feedback.status === "awaiting_user"), "webhook feedback.status khi chờ người gửi");
  const sum = await call("GET", "/api/v1/feedback?summary=1", { token: staff });
  ok(sum.data.awaitingIds.includes(id), "summary báo góp ý đang chờ mình trả lời");
  const reply = await call("PATCH", `/api/v1/feedback/${id}`, { token: staff, body: { message: "Hà Nội" } });
  ok(reply.status === 200 && (await call("GET", `/api/v1/feedback/${id}`, { token: staff })).data.feedback.status === "pending", "trả lời lúc chờ → tự về hàng đợi");
  ok((await call("GET", `/api/v1/feedback/${id}`, { token: staff })).data.feedback.clarifyRounds === 1, "đếm một vòng hỏi lại");

  // làm xong
  await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: W });
  const done = await call("POST", `/api/v1/machine/feedback/${id}/transition`, {
    key: W, body: { to: "done", note: "Đã sửa đáp án", fields: { expectedString: "Hà Nội", addCostUsd: 0.5, addAgentRuns: 1, verifyResult: "pass" } },
  });
  ok(done.status === 200 && done.data.feedback.liveAt && done.data.feedback.costUsd === 0.5, "worker đánh dấu hoàn thành, ghi chi phí");
  const forgedVerdict = await call("POST", `/api/v1/machine/feedback/${id}/transition`, { key: W, body: { to: "done", fields: { userVerdict: "accepted" } } });
  ok(forgedVerdict.status === 200 && forgedVerdict.data.feedback.userVerdict === null, "máy không tự nghiệm thu thay người gửi");

  const verdict = await call("PATCH", `/api/v1/feedback/${id}`, { token: staff, body: { userVerdict: "rejected" } });
  ok(verdict.status === 200 && (await call("GET", `/api/v1/feedback/${id}`, { token: staff })).data.feedback.status === "pending", "nghiệm thu «chưa đúng» → mở lại");
  ok((await call("PATCH", `/api/v1/feedback/${id}`, { token: staff, body: { status: "done" } })).status === 403, "người gửi không tự đổi trạng thái");

  // ── thu nhận (collect) ────────────────────────────────────────────────────
  await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { mode: "collect" } });
  const q3 = await call("GET", "/api/v1/machine/queue", { key: W });
  ok(q3.data.items.length === 0 && q3.data.project.mode === "collect", "chế độ thu nhận: hàng đợi worker luôn rỗng");
  const list = await call("GET", `/api/v1/machine/feedback?project=${slug}&status=pending&kind=content`, { key: op.data.key });
  ok(list.data.items.length === 2, "operator vẫn lấy được góp ý để làm tay");
  const claimCollect = await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: W });
  ok(claimCollect.status === 409, "worker không nhận việc khi dự án ở chế độ thu nhận");
  const manual = await call("POST", `/api/v1/machine/feedback/${id}/claim`, { key: op.data.key });
  ok(manual.status === 200, "operator (Claude làm tay) nhận được việc");
  const ev = await call("GET", `/api/v1/machine/feedback/${id}?project=${slug}`, { key: op.data.key });
  ok(ev.data.feedback.events.some((e) => e.actor === "ai_manual"), "sự kiện ghi actor=ai_manual");

  // ── Hỏi đáp ───────────────────────────────────────────────────────────────
  const qa = await call("POST", "/api/v1/feedback", { token: staff, body: { kind: "question", title: "Nộp phiếu ở đâu?" } });
  const qq = await call("GET", "/api/v1/machine/queue?kind=question", { key: W });
  ok(qq.data.items.some((i) => i.id === qa.data.feedback.id), "hàng đợi Hỏi đáp tách riêng, không phụ thuộc chế độ");

  // ── cách ly giữa các dự án + thu hồi khoá ─────────────────────────────────
  const other2 = await call("POST", "/api/admin/projects", { cookie, body: { slug: slug + "-b", name: "Dự án B" } });
  const wkB = await call("POST", `/api/admin/projects/${slug}-b/keys`, { cookie, body: { label: "wb" } });
  const cross = await call("GET", `/api/v1/machine/feedback/${id}`, { key: wkB.data.key });
  ok(cross.status === 403, "khoá worker dự án B không đọc được góp ý dự án A", `(nhận ${cross.status}: ${JSON.stringify(cross.data).slice(0, 120)}; tạo B=${other2.status} ${other2.data?.error ?? ""}; khoá B=${wkB.status})`);
  await call("DELETE", `/api/admin/keys/${(await call("GET", `/api/admin/projects/${slug}`, { cookie })).data.project.keys.find((k) => k.label === "worker-smoke").id}`, { cookie });
  ok((await call("GET", "/api/v1/machine/queue", { key: W })).status === 401, "khoá bị thu hồi dùng không được nữa");
  await call("DELETE", `/api/admin/projects/${slug}-b`, { cookie, body: { confirm: slug + "-b" } });
  void other2;

  // ── nhập dữ liệu cũ ───────────────────────────────────────────────────────
  const now = new Date().toISOString();
  const imp = { items: [{ id: "legacy-1", kind: "function", type: "add", title: "Thêm nút xuất Excel", status: "done", reporterId: "u-staff", reporterName: "Nguyễn Văn A", createdAt: now, updatedAt: now, messages: [{ role: "ai", body: "Đã làm", createdAt: now }] }] };
  const i1 = await call("POST", `/api/v1/machine/import?project=${slug}`, { key: op.data.key, body: imp });
  const i2 = await call("POST", `/api/v1/machine/import?project=${slug}`, { key: op.data.key, body: imp });
  ok(i1.data.created === 1 && i2.data.skipped === 1, "nhập dữ liệu cũ, chạy lại không nhân đôi");

  // ── ảnh chụp trang: cấu hình + ngữ cảnh trang lưu cùng góp ý ───────────────────
  const cfg0 = await call("GET", `/api/v1/config?project=${slug}`);
  ok(cfg0.data.features?.screenshot === "optional", "cấu hình công khai có features.screenshot (mặc định optional)", JSON.stringify(cfg0.data.features));
  const badShot = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { screenshot: "luon-luon" } } });
  ok(badShot.status === 400, "screenshot sai giá trị → 400");
  const okShot = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { screenshot: "default" } } });
  ok(okShot.status === 200 && (await call("GET", `/api/v1/config?project=${slug}`)).data.features.screenshot === "default", "admin đặt screenshot=default → widget nhận được");

  // ── lối vào: góp ý khi bôi đen chữ, trang ẩn lối vào (cấu hình trên hub, ứng dụng chủ không viết mã) ──
  ok(cfg0.data.features?.textSelection === false && Array.isArray(cfg0.data.features?.hidePaths), "mặc định tắt góp ý khi bôi đen; có hidePaths");
  const badHide = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { hidePaths: ["thi khong co gach"] } } });
  ok(badHide.status === 400, "hidePaths không bắt đầu bằng “/” → 400");
  const badScope = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { selectionScope: "<script>" } } });
  ok(badScope.status === 400, "selectionScope có ngoặc nhọn → 400");
  const okEntry = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { textSelection: true, selectionScope: "#lesson-content", selectionRoles: ["INSTRUCTOR"], hidePaths: ["/thi", "/exam-take"] } } });
  const cfgE = (await call("GET", `/api/v1/config?project=${slug}`)).data.features;
  ok(okEntry.status === 200 && cfgE.textSelection === true && cfgE.selectionScope === "#lesson-content" && cfgE.selectionRoles.join() === "INSTRUCTOR" && cfgE.hidePaths.join() === "/thi,/exam-take" && cfgE.screenshot === "default", "bật bôi đen + vùng + trang ẩn → widget nhận được, không mất tính năng khác", JSON.stringify(cfgE));
  const ctxFb = await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Số liệu sai ở bảng điểm", scope: "page", source: "widget", pagePath: "/learn/abc/lessons/9?tab=diem", pageUrl: "https://app.example.com/learn/abc/lessons/9?tab=diem", contentRef: "lesson:9", extra: { pageTitle: "Bài 9", viewport: "390x800", course: "abc" } } });
  const ctxGet = await call("GET", `/api/v1/feedback/${ctxFb.data.feedback?.id}`, { token: staff });
  const cf = ctxGet.data.feedback ?? {};
  ok(cf.pageUrl?.includes("tab=diem") && cf.contentRef === "lesson:9" && cf.extra?.pageTitle === "Bài 9" && cf.extra?.course === "abc", "góp ý lưu đủ url đầy đủ, contentRef và extra", JSON.stringify(cf.extra));
  const shotUp = new FormData();
  shotUp.append("file", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "trang-chup.png");
  const shotRes = await call("POST", `/api/v1/feedback/${ctxFb.data.feedback?.id}/attachments`, { token: staff, body: shotUp });
  ok(shotRes.status === 200 || shotRes.status === 201, "tải lên trang-chup.png được chấp nhận", JSON.stringify(shotRes.data));

  // ── loại góp ý giới hạn theo vai trò (types[].roles): kiểm ở API, không chỉ ẩn ở widget ──
  const curTypes = (await call("GET", `/api/v1/config?project=${slug}`)).data.types;
  const withRoles = await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { types: [...curTypes, { id: "cai-tien", label: "Yêu cầu cải tiến", kind: "function", roles: ["ADMIN"] }] } });
  ok(withRoles.status === 200 && (await call("GET", `/api/v1/config?project=${slug}`)).data.types.find((t) => t.id === "cai-tien")?.roles?.join() === "ADMIN", "loại có roles lưu và hiện ở cấu hình công khai");
  ok((await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Nhân viên gửi loại chỉ dành cho ADMIN", type: "cai-tien" } })).status === 403, "vai trò ngoài roles của loại bị từ chối (403)");
  ok((await call("POST", "/api/v1/feedback", { token: admin, body: { title: "Quản trị gửi loại chỉ dành cho ADMIN", type: "cai-tien" } })).status === 200, "vai trò trong roles gửi được loại đó");
  ok((await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Nhân viên gửi loại thường", type: curTypes[0].id } })).status === 200, "loại không giới hạn vẫn gửi được bình thường")

  // ── khoá chỉ đọc theo dự án (reader): đọc được dự án mình, KHÔNG ghi được, KHÔNG thấy dự án khác ──
  const rk = await call("POST", `/api/admin/projects/${slug}/keys`, { cookie, body: { label: "reader-smoke", scope: "reader" } });
  ok(rk.data.key?.startsWith("fhk_r_"), "cấp khoá chỉ đọc (fhk_r_)");
  const R = rk.data.key;
  const rid = ctxFb.data.feedback?.id;
  const rGet = await call("GET", `/api/v1/machine/feedback/${rid}`, { key: R });
  ok(rGet.status === 200 && rGet.data.feedback?.id === rid, "khoá chỉ đọc đọc được chi tiết góp ý của dự án mình");
  ok((await call("GET", "/api/v1/machine/feedback", { key: R })).status === 200, "khoá chỉ đọc liệt kê được góp ý");
  const rProj = await call("GET", "/api/v1/machine/projects", { key: R });
  ok(rProj.status === 200 && rProj.data.projects.length === 1 && rProj.data.projects[0].slug === slug, "khoá chỉ đọc chỉ thấy đúng một dự án", JSON.stringify(rProj.data).slice(0, 200));
  ok((await call("GET", "/api/v1/machine/queue?project=khong-phai-du-an-nay", { key: R })).status === 403, "khoá chỉ đọc không chọn được dự án khác");
  ok((await call("POST", `/api/v1/machine/feedback/${rid}/claim`, { key: R })).status === 403, "khoá chỉ đọc không nhận việc (403)");
  ok((await call("POST", `/api/v1/machine/feedback/${rid}/messages`, { key: R, body: { body: "thử ghi" } })).status === 403, "khoá chỉ đọc không nhắn tin (403)");
  ok((await call("POST", `/api/v1/machine/feedback/${rid}/transition`, { key: R, body: { to: "done" } })).status === 403, "khoá chỉ đọc không đổi trạng thái (403)");
  ok((await call("POST", `/api/v1/machine/import?project=${slug}`, { key: R, body: { items: [] } })).status === 403, "khoá chỉ đọc không nhập dữ liệu (403)")

  // ── tài khoản & vai trò theo dự án: người thường chỉ thấy/làm trong dự án được gán ──
  const tag = Date.now().toString(36);
  const slugB = `${slug}-b`;
  const PW = "Smoke-pass-12345";
  const ipH = () => ({ "x-forwarded-for": `10.77.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` });
  const loginAs = async (email, password) => {
    const r = await call("POST", "/api/admin/login", { body: { email, password }, headers: ipH() });
    return { status: r.status, cookie: r.res.headers.get("set-cookie")?.split(";")[0], data: r.data };
  };
  ok((await call("POST", "/api/admin/projects", { cookie, body: { slug: slugB, name: "Smoke B" } })).status === 200, "tạo dự án B để thử cô lập");
  const mk = (email, name, memberships, extra = {}) => call("POST", "/api/admin/users", { cookie, body: { email, name, password: PW, memberships, ...extra } });
  const mgrEmail = `smoke-mgr-${tag}@example.com`, viewEmail = `smoke-view-${tag}@example.com`, otherEmail = `smoke-other-${tag}@example.com`;
  const mgrC = await mk(mgrEmail, "Quản trị dự án", [{ slug, role: "manager" }]);
  ok(mgrC.status === 201 && mgrC.data.user?.superAdmin === false && !JSON.stringify(mgrC.data).includes("passwordHash"), "tạo tài khoản thường (không phải quản trị toàn hub, không lộ băm)", JSON.stringify(mgrC.data).slice(0, 160));
  ok((await mk(mgrEmail, "Trùng", [])).status === 409, "email trùng bị từ chối (409)");
  ok((await call("POST", "/api/admin/users", { cookie, body: { email: `smoke-short-${tag}@example.com`, name: "Ngắn", password: "short" } })).status === 400, "mật khẩu ngắn bị từ chối (400)");
  ok((await mk(`smoke-bad-${tag}@example.com`, "Sai dự án", [{ slug: "khong-co-du-an", role: "viewer" }])).status === 400, "gán dự án không tồn tại bị từ chối (400)");
  const viewC = await mk(viewEmail, "Chỉ xem", [{ slug, role: "viewer" }]);
  const othC = await mk(otherEmail, "Quản trị dự án B", [{ slug: slugB, role: "manager" }]);
  ok(viewC.status === 201 && othC.status === 201, "tạo tài khoản chỉ xem và tài khoản dự án khác");

  const M = await loginAs(mgrEmail, PW), V = await loginAs(viewEmail, PW), O = await loginAs(otherEmail, PW);
  ok(M.status === 200 && V.status === 200 && O.status === 200, "tài khoản thường đăng nhập được");
  ok((await call("GET", "/api/admin/me", { cookie: M.cookie })).data.superAdmin === false, "/me báo không phải quản trị toàn hub");
  const mProjects = await call("GET", "/api/admin/projects", { cookie: M.cookie });
  ok(JSON.stringify(mProjects.data.projects.map((p) => p.slug)) === JSON.stringify([slug]) && mProjects.data.projects[0].myRole === "manager", "danh sách dự án chỉ gồm dự án được gán", JSON.stringify(mProjects.data).slice(0, 200));
  ok((await call("GET", `/api/admin/projects/${slug}`, { cookie: M.cookie })).status === 200, "quản trị dự án mở được dự án của mình");
  ok((await call("GET", `/api/admin/projects/${slugB}`, { cookie: M.cookie })).status === 404, "dự án không được gán trả 404 (không lộ sự tồn tại)");
  ok((await call("PATCH", `/api/admin/projects/${slugB}`, { cookie: M.cookie, body: { name: "Chiếm quyền" } })).status === 404, "không sửa được dự án không được gán");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie: M.cookie, body: { name: "Smoke đổi tên" } })).status === 200, "quản trị dự án sửa được cài đặt dự án mình");
  ok((await call("GET", `/api/admin/projects/${slug}/secret`, { cookie: M.cookie })).status === 200, "quản trị dự án xem được khoá ký của dự án mình");
  ok((await call("GET", `/api/admin/projects/${slugB}/secret`, { cookie: M.cookie })).status === 404, "không xem được khoá ký dự án khác");
  ok((await call("POST", "/api/admin/projects", { cookie: M.cookie, body: { slug: `x-${tag}`, name: "Tạo lậu" } })).status === 403, "người thường không tạo được dự án (403)");
  ok((await call("DELETE", `/api/admin/projects/${slug}`, { cookie: M.cookie, body: { confirm: slug } })).status === 403, "quản trị dự án không xoá được dự án (403)");
  ok((await call("GET", "/api/admin/keys", { cookie: M.cookie })).status === 403, "người thường không thấy khoá operator (403)");
  ok((await call("POST", "/api/admin/keys", { cookie: M.cookie, body: { label: "lau-operator" } })).status === 403, "người thường không cấp khoá operator (403)");
  ok((await call("GET", "/api/admin/users", { cookie: M.cookie })).status === 403, "người thường không xem danh sách tài khoản (403)");
  ok((await call("PATCH", `/api/admin/users/${mgrC.data.user.id}`, { cookie: M.cookie, body: { superAdmin: true } })).status === 403, "không tự nâng mình thành quản trị toàn hub (403)");

  const mList = await call("GET", "/api/admin/feedback", { cookie: M.cookie });
  ok(mList.status === 200 && mList.data.items.length > 0 && mList.data.items.every((i) => i.project.slug === slug), "bảng góp ý chỉ chứa dự án được gán");
  ok((await call("GET", `/api/admin/feedback?project=${slugB}`, { cookie: M.cookie })).data.items.length === 0, "lọc theo dự án không được gán trả rỗng");
  ok((await call("GET", `/api/admin/feedback/${rid}`, { cookie: O.cookie })).status === 404, "quản trị dự án B không đọc được góp ý của dự án khác (404)");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: O.cookie, body: { message: "chen ngang" } })).status === 404, "quản trị dự án B không trả lời góp ý dự án khác");
  const mDetail = await call("GET", `/api/admin/feedback/${rid}`, { cookie: M.cookie });
  ok(mDetail.status === 200 && mDetail.data.canManage === true, "quản trị dự án đọc được góp ý + canManage");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: M.cookie, body: { message: "Đã ghi nhận (smoke)" } })).status === 200, "quản trị dự án trả lời được góp ý");

  const keysNow = (await call("GET", `/api/admin/projects/${slug}`, { cookie })).data.project.keys;
  const rkId = keysNow.find((k) => k.label === "reader-smoke")?.id;
  ok(rkId && (await call("DELETE", `/api/admin/keys/${rkId}`, { cookie: O.cookie })).status === 404, "không thu hồi được khoá của dự án khác (404)");

  const vDetail = await call("GET", `/api/admin/feedback/${rid}`, { cookie: V.cookie });
  ok(vDetail.status === 200 && vDetail.data.canManage === false, "người chỉ xem đọc được góp ý, canManage=false");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: V.cookie, body: { message: "viet bay" } })).status === 403, "người chỉ xem không trả lời được (403)");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: V.cookie, body: { status: "done" } })).status === 403, "người chỉ xem không đổi trạng thái (403)");
  const vProj = await call("GET", `/api/admin/projects/${slug}`, { cookie: V.cookie });
  ok(vProj.status === 200 && vProj.data.project.keys.length === 0, "người chỉ xem không thấy danh sách khoá");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie: V.cookie, body: { name: "Viết bậy" } })).status === 403, "người chỉ xem không sửa được cài đặt (403)");
  ok((await call("GET", `/api/admin/projects/${slug}/secret`, { cookie: V.cookie })).status === 403, "người chỉ xem không xem được khoá ký (403)");
  ok((await call("POST", `/api/admin/projects/${slug}/keys`, { cookie: V.cookie, body: { label: "lau-key", scope: "reader" } })).status === 403, "người chỉ xem không cấp khoá (403)");

  // Khoá / mở khoá / đặt lại mật khẩu
  const mid = mgrC.data.user.id;
  ok((await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { disabled: true } })).status === 200, "khoá tài khoản");
  ok((await call("GET", "/api/admin/me", { cookie: M.cookie })).status === 401, "phiên đang mở của tài khoản bị khoá mất hiệu lực ngay");
  ok((await loginAs(mgrEmail, PW)).status === 403, "tài khoản bị khoá không đăng nhập được (403)");
  ok((await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { disabled: false } })).status === 200 && (await loginAs(mgrEmail, PW)).status === 200, "mở khoá thì đăng nhập lại được");
  const NEWPW = "Smoke-reset-67890";
  ok((await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { password: NEWPW } })).status === 200, "quản trị đặt lại mật khẩu");
  ok((await loginAs(mgrEmail, PW)).status === 401 && (await loginAs(mgrEmail, NEWPW)).status === 200, "mật khẩu cũ hết dùng, mật khẩu mới đăng nhập được");
  ok((await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { password: "short" } })).status === 400, "đặt lại mật khẩu quá ngắn bị từ chối");
  const M2 = await loginAs(mgrEmail, NEWPW);

  // Tự đổi mật khẩu
  ok((await call("POST", "/api/admin/me/password", { cookie: M2.cookie, body: { current: "sai-mat-khau-hien-tai", next: "Smoke-self-24680" } })).status === 400, "đổi mật khẩu sai mật khẩu hiện tại bị từ chối");
  ok((await call("POST", "/api/admin/me/password", { cookie: M2.cookie, body: { current: NEWPW, next: "ngan" } })).status === 400, "mật khẩu mới quá ngắn bị từ chối");
  const SELFPW = "Smoke-self-24680";
  const chg = await call("POST", "/api/admin/me/password", { cookie: M2.cookie, body: { current: NEWPW, next: SELFPW } });
  const M3 = chg.res.headers.get("set-cookie")?.split(";")[0];
  ok(chg.status === 200 && M3, "tự đổi mật khẩu thành công và được cấp phiên mới");
  ok((await call("GET", "/api/admin/me", { cookie: M3 })).status === 200, "phiên mới sau khi đổi mật khẩu dùng được");
  ok((await loginAs(mgrEmail, NEWPW)).status === 401 && (await loginAs(mgrEmail, SELFPW)).status === 200, "đổi xong chỉ còn mật khẩu mới");

  // Thay danh sách dự án được gán, nâng/hạ quyền, bảo vệ quản trị cuối cùng
  ok((await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { memberships: [{ slug: slugB, role: "viewer" }] } })).status === 200, "thay danh sách dự án được gán");
  ok((await call("GET", `/api/admin/projects/${slug}`, { cookie: M3 })).status === 404, "gỡ gán thì mất quyền ngay (không cần đăng nhập lại)");
  const meSuper = (await call("GET", "/api/admin/users", { cookie })).data;
  ok((await call("PATCH", `/api/admin/users/${meSuper.selfId}`, { cookie, body: { superAdmin: false } })).status === 400, "không tự hạ quyền chính mình");
  ok((await call("PATCH", `/api/admin/users/${meSuper.selfId}`, { cookie, body: { disabled: true } })).status === 400, "không tự khoá chính mình");
  ok((await call("DELETE", `/api/admin/users/${meSuper.selfId}`, { cookie })).status === 400, "không tự xoá chính mình");
  ok((await call("PATCH", `/api/admin/users/${meSuper.selfId}`, { cookie, body: { password: "Smoke-own-pw-1234" } })).status === 400, "không đặt lại mật khẩu của chính mình qua trang quản lý");

  // ── cổng duyệt: khi bật, AI (reader/worker) chỉ thấy góp ý đã được con người duyệt ──
  const OPK = op.data.key;
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { requireApproval: true } } })).status === 200, "bật cổng duyệt cho dự án");
  const rList0 = await call("GET", "/api/v1/machine/feedback", { key: R });
  ok(rList0.status === 200 && rList0.data.items.length === 0, "cổng duyệt: khoá chỉ đọc không thấy góp ý chưa duyệt (danh sách)", JSON.stringify(rList0.data).slice(0, 120));
  ok((await call("GET", `/api/v1/machine/feedback/${rid}`, { key: R })).status === 403, "cổng duyệt: khoá chỉ đọc không mở được góp ý chưa duyệt theo mã (403)");
  ok((await call("GET", "/api/v1/machine/queue", { key: R })).data.items.length === 0, "cổng duyệt: hàng đợi không có góp ý chưa duyệt");
  const W2 = (await call("POST", `/api/admin/projects/${slug}/keys`, { cookie, body: { label: "worker-smoke-2" } })).data.key;
  const wClaim = await call("POST", `/api/v1/machine/feedback/${rid}/claim`, { key: W2 });
  ok(wClaim.status === 403, "cổng duyệt: worker không nhận được góp ý chưa duyệt (403)", `${wClaim.status} ${JSON.stringify(wClaim.data)}`);
  const opList = await call("GET", `/api/v1/machine/feedback?project=${slug}&approved=0`, { key: OPK });
  ok(opList.status === 200 && opList.data.items.some((i) => i.id === rid), "operator vẫn thấy góp ý chưa duyệt (lọc approved=0)");
  ok((await call("GET", `/api/v1/machine/feedback/${rid}`, { key: OPK })).status === 200, "operator mở được góp ý chưa duyệt");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: V.cookie, body: { approved: true } })).status === 403, "người chỉ xem không duyệt được (403)");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie: O.cookie, body: { approved: true } })).status === 404, "quản trị dự án khác không duyệt được góp ý này (404)");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie, body: { approved: true } })).status === 200, "quản trị duyệt góp ý");
  const apprDetail = await call("GET", `/api/admin/feedback/${rid}`, { cookie });
  ok(!!apprDetail.data.feedback.approvedAt && apprDetail.data.feedback.events.some((e) => e.kind === "approval" && e.detail?.approved === true), "duyệt được ghi vào nhật ký sự kiện");
  const rList1 = await call("GET", "/api/v1/machine/feedback", { key: R });
  ok(rList1.data.items.length === 1 && rList1.data.items[0].id === rid, "sau khi duyệt: khoá chỉ đọc thấy đúng góp ý đã duyệt");
  ok((await call("GET", `/api/v1/machine/feedback/${rid}`, { key: R })).status === 200, "sau khi duyệt: mở được theo mã");
  ok((await call("GET", `/api/admin/feedback?project=${slug}&approval=approved`, { cookie })).data.items.every((i) => i.id === rid), "bảng quản trị lọc đã duyệt");
  ok((await call("GET", `/api/admin/feedback?project=${slug}&approval=pending`, { cookie })).data.items.every((i) => i.id !== rid), "bảng quản trị lọc chưa duyệt không có góp ý đã duyệt");
  ok((await call("PATCH", `/api/admin/feedback/${rid}`, { cookie, body: { approved: false } })).status === 200 && (await call("GET", `/api/v1/machine/feedback/${rid}`, { key: R })).status === 403, "bỏ duyệt thì AI lại không thấy");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { features: { requireApproval: false } } })).status === 200 && (await call("GET", `/api/v1/machine/feedback/${rid}`, { key: R })).status === 200, "tắt cổng duyệt thì hành vi trở lại như cũ");

  // ── thông báo: chuông trong bảng điều khiển + cấu hình email/webhook ──
  const feed0 = await call("GET", "/api/admin/notifications", { cookie });
  ok(feed0.status === 200 && Array.isArray(feed0.data.items) && typeof feed0.data.unread === "number", "chuông thông báo trả danh sách + số chưa đọc");
  await call("POST", "/api/admin/notifications/seen", { cookie, body: {} });
  ok((await call("GET", "/api/admin/notifications", { cookie })).data.unread === 0, "đánh dấu đã đọc → chưa đọc = 0");
  const nf = await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Báo lỗi để thử chuông thông báo", type: curTypes[0].id } });
  const feed1 = await call("GET", "/api/admin/notifications", { cookie });
  ok(nf.status === 200 && feed1.data.unread >= 1 && feed1.data.items.some((i) => i.id === nf.data.feedback?.id && i.type === "new" && i.unread), "góp ý mới xuất hiện ở chuông và tính là chưa đọc", JSON.stringify(nf.data).slice(0, 100));
  const feedO = await call("GET", "/api/admin/notifications", { cookie: O.cookie });
  ok(feedO.status === 200 && feedO.data.items.every((i) => i.project.slug === slugB), "chuông của người thường chỉ có dự án được gán");
  const feedV = await call("GET", "/api/admin/notifications", { cookie: V.cookie });
  ok(feedV.status === 200 && feedV.data.items.every((i) => i.project.slug === slug), "chuông của người chỉ xem chỉ có dự án được gán");
  ok((await call("GET", "/api/admin/notifications")).status === 401, "chuông cần đăng nhập");
  await call("POST", "/api/admin/notifications/seen", { cookie, body: {} });

  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { notify: { on: "all", emails: ["khong-phai-email"], webhookUrl: null } } })).status === 400, "email thông báo sai định dạng bị từ chối");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { notify: { on: "all", emails: [], webhookUrl: "http://127.0.0.1:9/x" } } })).status === 400, "webhook thông báo http/nội bộ bị từ chối (SSRF)");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { notify: { on: "all", emails: [], webhookUrl: "https://169.254.169.254/latest" } } })).status === 400, "webhook trỏ tới địa chỉ metadata bị từ chối");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { notify: { on: "bugs", emails: ["Nguoi.Nhan@Example.com"], webhookUrl: null } } })).status === 200, "lưu cấu hình thông báo");
  const pn = await call("GET", `/api/admin/projects/${slug}`, { cookie });
  ok(pn.data.notify?.on === "bugs" && pn.data.notify.emails[0] === "nguoi.nhan@example.com" && typeof pn.data.mailConfigured === "boolean", "đọc lại cấu hình thông báo (email chuẩn hoá chữ thường)");
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie: V.cookie, body: { notify: { on: "off", emails: [], webhookUrl: null } } })).status === 403, "người chỉ xem không sửa được cấu hình thông báo");
  ok((await call("POST", `/api/admin/projects/${slug}/notify-test`, { cookie: V.cookie, body: {} })).status === 403, "người chỉ xem không gửi thử (403)");
  ok((await call("POST", `/api/admin/projects/${slug}/notify-test`, { cookie: O.cookie, body: {} })).status === 404, "quản trị dự án khác không gửi thử dự án này (404)");
  const nt = await call("POST", `/api/admin/projects/${slug}/notify-test`, { cookie, body: {} });
  ok(nt.status === 200 && typeof nt.data.result?.email === "string", "gửi thử trả kết quả từng kênh", JSON.stringify(nt.data).slice(0, 120));

  // ── rà soát bảo mật ───────────────────────────────────────────────────────
  ok((await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Địa chỉ trang giả mạo", pageUrl: "javascript:alert(1)", source: "widget" } })).status === 400, "pageUrl không phải http(s) bị từ chối");
  ok((await call("GET", "/api/admin/me", { cookie, headers: { "Sec-Fetch-Site": "same-site" } })).status === 403, "API quản trị từ trang cùng-site khác (CSRF) bị chặn");
  ok((await call("GET", "/api/admin/me", { cookie, headers: { "Sec-Fetch-Site": "cross-site" } })).status === 403, "API quản trị từ trang khác site bị chặn");
  ok((await call("GET", "/api/admin/me", { cookie, headers: { "Sec-Fetch-Site": "same-origin" } })).status === 200, "API quản trị từ chính giao diện vẫn chạy");
  const hdr = await call("GET", "/api/admin/me", { cookie });
  ok(/DENY/i.test(hdr.res.headers.get("x-frame-options") ?? "") && /frame-ancestors 'none'/.test(hdr.res.headers.get("content-security-policy") ?? ""), "chống nhúng khung (clickjacking)");
  const own = await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Góp ý để thử nghiệm thu chéo", source: "widget" } });
  const ownId = own.data.feedback.id;
  ok(own.data.feedback.costUsd === undefined && own.data.feedback.claimedBy === undefined && own.data.feedback.reporterEmail === undefined, "người gửi không thấy trường vận hành nội bộ");
  await call("POST", `/api/v1/machine/feedback/${ownId}/claim`, { key: op.data.key });
  await call("POST", `/api/v1/machine/feedback/${ownId}/transition`, { key: op.data.key, body: { to: "done", note: "xong" } });
  const forgedAdmin = await call("PATCH", `/api/v1/feedback/${ownId}`, { token: admin, body: { userVerdict: "accepted" } });
  ok(forgedAdmin.status === 403, "quản trị khác không nghiệm thu thay người gửi", `status ${forgedAdmin.status}`);
  const early = await call("PATCH", `/api/v1/feedback/${id}`, { token: staff, body: { userVerdict: "accepted" } });
  ok(early.status === 409 || early.status === 200, "nghiệm thu chỉ khi đã hoàn thành (không lỗi 5xx)");
  const planBad = await call("PATCH", `/api/v1/feedback/${ownId}`, { token: staff, body: { planApproval: "approved" } });
  ok(planBad.status === 409, "duyệt kế hoạch khi không có kế hoạch chờ duyệt bị từ chối");
  await call("PATCH", `/api/admin/users/${mid}`, { cookie, body: { memberships: [{ slug, role: "manager" }] } });
  const mw = await call("PATCH", `/api/admin/projects/${slug}`, { cookie: M3, body: { webhookUrl: "http://127.0.0.1:9/hook" } });
  ok(mw.status === 400, "quản trị dự án không đặt được webhook nội bộ (SSRF)", JSON.stringify(mw.data));
  ok((await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { webhookUrl: "http://127.0.0.1:9/hook" } })).status === 200, "quản trị toàn hub đặt được webhook nội bộ (DGXL cần)");
  await call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: { webhookUrl: null } });
  const big = await fetch(HUB + "/api/v1/feedback", { method: "POST", headers: { Authorization: `Bearer ${staff}`, "Content-Type": "application/json" }, body: JSON.stringify({ title: "x".repeat(4), body: "y".repeat(3 * 1024 * 1024) }) });
  ok(big.status === 413 || big.status === 400, "thân yêu cầu quá lớn bị từ chối", String(big.status));

} catch (e) {
  failures.push("NGOẠI LỆ: " + (e.stack || e));
  console.error(e);
} finally {
  // dọn dự án tạm
  try {
    const l = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: PASS } });
    const c = l.res.headers.get("set-cookie")?.split(";")[0];
    await call("DELETE", `/api/admin/projects/${slug}`, { cookie: c, body: { confirm: slug } });
    await call("DELETE", `/api/admin/projects/${slug}-b`, { cookie: c, body: { confirm: `${slug}-b` } });
    for (const u of (await call("GET", "/api/admin/users", { cookie: c })).data.users || []) if (/^smoke-.*@example\.com$/.test(u.email)) await call("DELETE", `/api/admin/users/${u.id}`, { cookie: c });
    const keys = (await call("GET", "/api/admin/keys", { cookie: c })).data.keys || [];
    for (const k of keys.filter((k) => k.label === "operator-smoke" && !k.revokedAt)) await call("DELETE", `/api/admin/keys/${k.id}`, { cookie: c });
  } catch {}
  server.close();
}
console.log(`\n${passed} đạt, ${failures.length} lỗi`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
