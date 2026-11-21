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
  const ctxFb = await call("POST", "/api/v1/feedback", { token: staff, body: { title: "Số liệu sai ở bảng điểm", scope: "page", source: "widget", pagePath: "/learn/abc/lessons/9?tab=diem", pageUrl: "https://app.example.com/learn/abc/lessons/9?tab=diem", contentRef: "lesson:9", extra: { pageTitle: "Bài 9", viewport: "390x800", course: "abc" } } });
  const ctxGet = await call("GET", `/api/v1/feedback/${ctxFb.data.feedback?.id}`, { token: staff });
  const cf = ctxGet.data.feedback ?? {};
  ok(cf.pageUrl?.includes("tab=diem") && cf.contentRef === "lesson:9" && cf.extra?.pageTitle === "Bài 9" && cf.extra?.course === "abc", "góp ý lưu đủ url đầy đủ, contentRef và extra", JSON.stringify(cf.extra));
  const shotUp = new FormData();
  shotUp.append("file", new Blob([Buffer.from("89504e470d0a1a0a", "hex")], { type: "image/png" }), "trang-chup.png");
  const shotRes = await call("POST", `/api/v1/feedback/${ctxFb.data.feedback?.id}/attachments`, { token: staff, body: shotUp });
  ok(shotRes.status === 200 || shotRes.status === 201, "tải lên trang-chup.png được chấp nhận", JSON.stringify(shotRes.data));

} catch (e) {
  failures.push("NGOẠI LỆ: " + (e.stack || e));
  console.error(e);
} finally {
  // dọn dự án tạm
  try {
    const l = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: PASS } });
    const c = l.res.headers.get("set-cookie")?.split(";")[0];
    await call("DELETE", `/api/admin/projects/${slug}`, { cookie: c, body: { confirm: slug } });
    const keys = (await call("GET", "/api/admin/keys", { cookie: c })).data.keys || [];
    for (const k of keys.filter((k) => k.label === "operator-smoke" && !k.revokedAt)) await call("DELETE", `/api/admin/keys/${k.id}`, { cookie: c });
  } catch {}
  server.close();
}
console.log(`\n${passed} đạt, ${failures.length} lỗi`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
