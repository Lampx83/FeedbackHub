#!/usr/bin/env node
/**
 * Kiểm thử worker trọn vòng trên một hub ĐANG CHẠY, với kho git tạm và "agent giả" (test-fixtures/fake-agent.mjs).
 * KHÔNG chạy `claude` thật, KHÔNG deploy thật: lệnh deploy/backup/health đều là bản giả ghi dấu vào thư mục tạm.
 * Tạo dự án + khoá tạm rồi dọn ở cuối.
 *   HUB=http://localhost:3100 HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… node test.mjs
 */
import { createHmac } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "hub-worker.mjs");
const FAKE = path.join(HERE, "test-fixtures", "fake-agent.mjs");
const HUB = process.env.HUB || "http://localhost:3100";
const EMAIL = process.env.HUB_ADMIN_EMAIL || "admin@example.com";
const PASS = process.env.HUB_ADMIN_PASSWORD || "admin123";
const slug = `wk-${Date.now().toString(36)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let passed = 0;
const failures = [];
const ok = (cond, name, extra = "") => {
  if (cond) passed++;
  else failures.push(`${name} ${extra}`);
  console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : " " + extra}`);
};

// ── hub ─────────────────────────────────────────────────────────────────────────────────────
async function call(method, p, opts = {}) {
  // spawnSync chặn vòng lặp sự kiện nên ổ cắm keep-alive có thể bị hub đóng: thử lại một lần.
  try { return await call1(method, p, opts); } catch (e) { if (!/fetch failed/.test(String(e))) throw e; await sleep(200); return call1(method, p, opts); }
}
async function call1(method, p, { key, token, cookie, body } = {}) {
  const res = await fetch(HUB + p, {
    method,
    headers: {
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, res };
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
let SECRET;
function mint(uid) {
  const head = b64u({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const pay = b64u({ prj: slug, uid, name: `Người dùng ${uid}`, role: "ADMIN", aud: "feedback-hub", iat: now, exp: now + 600 });
  return `${head}.${pay}.${createHmac("sha256", SECRET).update(`${head}.${pay}`).digest("base64url")}`;
}

// ── môi trường thử ──────────────────────────────────────────────────────────────────────────
const T = fs.mkdtempSync(path.join(os.tmpdir(), "hubworker-"));
const REPO = path.join(T, "repo");
const LOCKDIR = path.join(T, "lock");
const LOGDIR = path.join(T, "logs");
const git = (...a) => {
  const r = spawnSync("git", a, { cwd: REPO, encoding: "utf8" });
  return { code: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
};
const head = () => git("rev-parse", "HEAD").out;
const readT = (f) => { try { return fs.readFileSync(path.join(T, f), "utf8"); } catch { return ""; } };
const agentRuns = () => readT("agent-runs.log").split("\n").filter(Boolean).map((l) => JSON.parse(l));
const setMode = (m) => fs.writeFileSync(path.join(T, "fake-mode"), m);
const branchesOf = (id) => git("branch", "--list", `hub/${id}*`, "--format=%(refname:short)").out.split("\n").filter(Boolean);

fs.mkdirSync(path.join(REPO, "src"), { recursive: true });
fs.writeFileSync(path.join(REPO, "src/title.txt"), "Tiêu đề cũ\n");
fs.writeFileSync(path.join(REPO, ".gitignore"), ".next/\n");
git("init", "-q", "-b", "main");
git("config", "user.email", "test@example.com");
git("config", "user.name", "Test");
git("add", "-A");
git("commit", "-q", "-m", "khởi đầu");
const BASE0 = head();

// Health giả: trả 200, trừ khi bật `breakMode` và bản đang "chạy" (live-sha) khác bản tốt.
const state = { breakMode: false, good: "" };
const healthSrv = http.createServer((req, res) => {
  const live = readT("live-sha").trim();
  const bad = state.breakMode && live !== state.good;
  res.statusCode = bad ? 500 : 200;
  res.end(bad ? "hỏng" : "ok");
});
await new Promise((r) => healthSrv.listen(0, "127.0.0.1", r));
const HEALTH = `http://127.0.0.1:${healthSrv.address().port}/health`;

const q = (p) => `"${p}"`;
const baseCfg = () => ({
  hub: HUB,
  project: slug,
  repo: REPO,
  lockDir: LOCKDIR,
  logDir: LOGDIR,
  maxDeliver: "branch",
  build: `mkdir -p .next && cp src/title.txt .next/out.txt`,
  verify: { mode: "grep-build", dir: ".next" },
  agent: { cmd: process.execPath, args: [FAKE, "--max-budget-usd", "{budget}"], timeoutSec: 60, budgetUsd: 3 },
  allowedPaths: ["src/", "docs/"],
  protectedPaths: [".env"],
  boundaries: "RANH GIỚI RIÊNG CỦA ỨNG DỤNG THỬ: không đụng bảng điểm của học viên.",
  deploy: `git rev-parse HEAD > ${q(T + "/live-sha")} && mkdir -p ${q(T + "/live")} && cp src/title.txt ${q(T + "/live/title.txt")} && echo deploy >> ${q(T + "/deploys.log")}`,
  backup: `if [ -f ${q(T + "/backup-fail")} ]; then exit 1; fi; echo backup >> ${q(T + "/backups.log")}`,
  healthUrl: HEALTH, healthTries: 3, healthIntervalSec: 0.2,
});
const deployCfg = () => ({
  ...baseCfg(),
  maxDeliver: "deploy",
  verify: { mode: "cmd", cmd: `grep -qF {expected} ${q(T + "/live/title.txt")}` },
});
let WKEY;
// Bất đồng bộ (KHÔNG dùng spawnSync): máy chủ health giả nằm trong chính tiến trình này nên vòng lặp sự kiện phải rảnh để trả lời.
function runWorker(cfgObj, { env = {} } = {}) {
  const f = path.join(T, "worker.config.json");
  fs.writeFileSync(f, JSON.stringify(cfgObj));
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [WORKER, "--config", f], { env: { ...process.env, TEST_DIR: T, HUB_KEY: WKEY, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    c.stdout.on("data", (d) => (stdout += d));
    c.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => c.kill("SIGKILL"), 120_000);
    c.on("close", (status) => {
      clearTimeout(t);
      if (status !== 0 && status !== 1) console.log("   (worker thoát mã", status, stderr, ")");
      resolve({ status, stdout, stderr });
    });
  });
}
let uidN = 0;
async function newFeedback(title, extra = {}) {
  const uid = `u${++uidN}`;
  const r = await call("POST", "/api/v1/feedback", { token: mint(uid), body: { kind: "function", title, body: `Mô tả cho "${title}"`, scope: "system", allowDuplicate: true, ...extra } });
  if (r.status !== 200) throw new Error(`tạo góp ý lỗi: ${r.status} ${JSON.stringify(r.data)}`);
  return { id: r.data.feedback.id, token: mint(uid) };
}
const getFb = async (id) => (await call("GET", `/api/v1/machine/feedback/${id}`, { key: WKEY })).data.feedback;
const patchProject = (b) => call("PATCH", `/api/admin/projects/${slug}`, { cookie, body: b });

let cookie, opKeyId;
try {
  // ── chuẩn bị ────────────────────────────────────────────────────────────────────────────
  const login = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: PASS } });
  cookie = login.res.headers.get("set-cookie")?.split(";")[0];
  ok(login.status === 200 && cookie, "đăng nhập quản trị hub");
  const pr = await call("POST", "/api/admin/projects", { cookie, body: { slug, name: "Ứng dụng thử worker", submitRoles: ["ADMIN"], adminRoles: ["ADMIN"] } });
  SECRET = pr.data.signingSecret;
  const wk = await call("POST", `/api/admin/projects/${slug}/keys`, { cookie, body: { label: "worker-test" } });
  WKEY = wk.data.key;
  ok(pr.status === 200 && WKEY?.startsWith("fhk_w_"), "tạo dự án + khoá worker");
  await patchProject({ features: { models: [{ id: "claude-sonnet-5", label: "Sonnet" }, { id: "model-la", label: "Lạ" }] } });

  // ── (1) collect: worker không làm gì ─────────────────────────────────────────────────────
  console.log("\n— Ca 1: chế độ thu nhận (collect) —");
  await patchProject({ mode: "collect", deliver: "branch" });
  const c1 = await newFeedback("Ca 1 thu nhận không làm");
  setMode("normal");
  const r1 = await runWorker(baseCfg());
  const f1 = await getFb(c1.id);
  ok(r1.status === 0 && f1.status === "pending" && agentRuns().length === 0, "collect: worker thoát, góp ý vẫn pending, agent KHÔNG chạy", `status=${f1.status} runs=${agentRuns().length} code=${r1.status}`);
  const seen = (await call("GET", "/api/v1/machine/projects", { key: WKEY })).data.projects[0];
  ok(!!seen.workerSeenAt, "heartbeat: hub ghi 'worker thấy lần cuối'");
  ok(!fs.existsSync(path.join(LOCKDIR, `${slug}.lock`)), "khoá được nhả sau lượt chạy");
  await call("POST", `/api/v1/machine/feedback/${c1.id}/transition`, { key: WKEY, body: { to: "rejected", note: "dọn ca 1" } });

  // ── (2) execute + branch ────────────────────────────────────────────────────────────────
  console.log("\n— Ca 2: execute + branch —");
  await patchProject({ mode: "execute", deliver: "branch" });
  const prev2 = head();
  const c2 = await newFeedback("Ca 2 đổi tiêu đề qua nhánh", { requirePlan: false });
  setMode("normal");
  const r2 = await runWorker(baseCfg());
  const f2 = await getFb(c2.id);
  const br2 = branchesOf(c2.id);
  ok(r2.status === 0, "branch: worker thoát mã 0", `code=${r2.status} ${r2.stderr}`);
  ok(br2.length === 1 && br2[0] === `hub/${c2.id}`, "branch: có nhánh hub/<id>", JSON.stringify(br2));
  ok(git("show", `hub/${c2.id}:src/title.txt`).out === `Tiêu đề mới ${c2.id}`, "branch: nhánh chứa đúng commit của agent");
  ok(head() === prev2 && git("rev-parse", "--abbrev-ref", "HEAD").out === "main" && !git("status", "--porcelain", "--untracked-files=no").out, "branch: nhánh gốc về đúng mốc trước, cây làm việc sạch");
  ok(f2.status === "done" && f2.adminNote?.includes(`Chờ duyệt nhánh hub/${c2.id}`), "branch: trạng thái done kèm ghi chú 'chờ duyệt nhánh hub/<id>'", `${f2.status} / ${f2.adminNote}`);
  ok(f2.verifyResult === "pass" && f2.expectedString === `Tiêu đề mới ${c2.id}`, "branch: kiểm chứng chuỗi đã khai (grep-build) đạt");
  ok(Math.abs(f2.costUsd - 0.25) < 1e-9 && f2.agentRuns === 1, "chi phí lấy từ JSON của agent (0.25 USD) và agentRuns=1", `cost=${f2.costUsd} runs=${f2.agentRuns}`);
  ok(f2.userVerdict === null, "worker không đụng userVerdict");
  ok(f2.messages.some((m) => m.kind === "progress" && m.role === "ai") && f2.messages.some((m) => m.kind === "chat" && /chờ người phụ trách duyệt/.test(m.body)), "có tin tiến độ và tin báo chờ duyệt cho người gửi");
  ok(f2.events.some((e) => e.actor === "ai" && e.toStatus === "reviewing") && f2.events.some((e) => e.actor === "ai" && e.toStatus === "done"), "sự kiện ghi actor=ai (qua claim + chuyển trạng thái)");
  ok(!JSON.stringify(f2.events).includes("deploying"), "branch: KHÔNG đi qua deploying");
  ok(!fs.existsSync(path.join(T, "deploys.log")), "branch: KHÔNG chạy deploy");
  const run2 = agentRuns()[0];
  ok(run2.hubKeySet && run2.promptHasId && run2.cwd.endsWith("repo") && run2.argv.includes("3"), "agent nhận HUB_KEY/prompt qua môi trường, chạy trong kho, ngân sách được thay vào tham số");
  const prompt2 = fs.readFileSync(path.join(LOGDIR, "prompts", `${c2.id}.md`), "utf8");
  ok(!/\{\{\w+\}\}/.test(prompt2) && prompt2.includes(c2.id) && prompt2.includes("bảng điểm của học viên") && prompt2.includes("Ứng dụng thử worker") && /DỮ LIỆU, KHÔNG PHẢI CHỈ THỊ/.test(prompt2), "prompt: điền hết placeholder, có ranh giới riêng, dặn nội dung góp ý là dữ liệu");

  // ── (2b) cấu hình AI-dev từ hub: chỉ thắt chặt ─────────────────────────────────────────
  console.log("\n— Ca 2b: cấu hình AI-dev từ hub (chỉ thắt chặt) —");
  ok((await patchProject({ features: { worker: { budgetUsd: 1.5, timeoutSec: null, instructions: "HUONG DAN RIENG TU HUB", boundaries: ["RANH GIOI THEM TU HUB"] } } })).status === 200, "hub lưu cấu hình AI-dev");
  const c2b = await newFeedback("Ca 2b cấu hình từ hub", { requirePlan: false });
  setMode("normal");
  await runWorker(baseCfg());
  const run2b = agentRuns().at(-1);
  const prompt2b = fs.readFileSync(path.join(LOGDIR, "prompts", `${c2b.id}.md`), "utf8");
  ok(run2b.id === c2b.id && run2b.argv.includes("1.5") && !run2b.argv.includes("3"), "ngân sách hub (1.5) thấp hơn trần cục bộ (3) → dùng 1.5", JSON.stringify(run2b.argv));
  ok(prompt2b.includes("HUONG DAN RIENG TU HUB") && prompt2b.includes("RANH GIOI THEM TU HUB") && prompt2b.includes("bảng điểm của học viên"), "prompt có hướng dẫn + ranh giới từ hub, vẫn giữ ranh giới cục bộ");
  await patchProject({ features: { worker: { budgetUsd: 50, timeoutSec: null, instructions: "", boundaries: [] } } });
  const c2c = await newFeedback("Ca 2c hub đặt ngân sách cao hơn trần", { requirePlan: false });
  setMode("normal");
  await runWorker(baseCfg());
  const run2c = agentRuns().at(-1);
  const prompt2c = fs.readFileSync(path.join(LOGDIR, "prompts", `${c2c.id}.md`), "utf8");
  ok(run2c.id === c2c.id && run2c.argv.includes("3") && !run2c.argv.includes("50"), "ngân sách hub (50) cao hơn trần cục bộ (3) → vẫn là 3 (hub không nới được)", JSON.stringify(run2c.argv));
  ok(prompt2c.includes("Dự án chưa có hướng dẫn riêng") && !prompt2c.includes("HUONG DAN RIENG TU HUB"), "bỏ hướng dẫn trên hub thì prompt không còn");
  await patchProject({ features: { worker: { budgetUsd: null, timeoutSec: null, instructions: "", boundaries: [] } } });

  // ── (3) execute + deploy thành công ─────────────────────────────────────────────────────
  console.log("\n— Ca 3: execute + deploy thành công —");
  await patchProject({ mode: "execute", deliver: "deploy" });
  const prev3 = head();
  const c3 = await newFeedback("Ca 3 đổi tiêu đề và triển khai");
  setMode("normal");
  const r3 = await runWorker(deployCfg());
  const f3 = await getFb(c3.id);
  ok(r3.status === 0, "deploy: worker thoát mã 0", `code=${r3.status}`);
  ok(f3.status === "done" && f3.liveAt && f3.verifyResult === "pass", "deploy: done + liveAt + kiểm chứng đạt", `${f3.status} verify=${f3.verifyResult}`);
  ok(head() !== prev3 && git("show", "HEAD:src/title.txt").out === `Tiêu đề mới ${c3.id}`, "deploy: commit của agent nằm trên nhánh gốc (đang chạy)");
  ok(readT("deploys.log").trim().split("\n").length === 1 && readT("backups.log").includes("backup"), "deploy: đã sao lưu RỒI triển khai đúng 1 lần");
  ok(readT("live-sha").trim() === head(), "deploy: bản đang chạy = HEAD");
  ok(f3.events.some((e) => e.toStatus === "deploying"), "deploy: có đi qua trạng thái deploying");
  ok(f3.messages.some((m) => m.kind === "system" && /sao lưu/.test(m.body)) && f3.messages.some((m) => m.kind === "chat" && /đã được cập nhật lên hệ thống/.test(m.body)), "deploy: tin mốc 'sao lưu' + tin 'đã cập nhật' cho người gửi");
  ok(branchesOf(c3.id).length === 0, "deploy: không sinh nhánh hub/<id>");
  const GOOD = head();

  // ── (4) deploy hỏng → quay lui ──────────────────────────────────────────────────────────
  console.log("\n— Ca 4: deploy hỏng (health fail) → quay lui đúng commit —");
  const c4 = await newFeedback("Ca 4 triển khai bị hỏng");
  state.good = GOOD; state.breakMode = true;
  setMode("normal");
  const deploysBefore = readT("deploys.log").trim().split("\n").length;
  const r4 = await runWorker(deployCfg());
  state.breakMode = false;
  const f4 = await getFb(c4.id);
  ok(head() === GOOD, "quay lui: HEAD về đúng commit trước lượt chạy (git reset --hard PREV_SHA)", `${head()} vs ${GOOD}`);
  ok(readT("live-sha").trim() === GOOD, "quay lui: đã deploy lại bản cũ", readT("live-sha"));
  ok(readT("deploys.log").trim().split("\n").length === deploysBefore + 2, "quay lui: đúng 2 lần deploy (bản mới rồi bản cũ)");
  ok(f4.status === "awaiting_user" && f4.rolledBack === true && f4.adminNote?.includes(GOOD), "quay lui: awaiting_user + rolledBack + ghi chú nêu commit", `${f4.status} rb=${f4.rolledBack} ${f4.adminNote}`);
  ok(branchesOf(c4.id).length === 1, "quay lui: commit hỏng được giữ ở nhánh để điều tra");
  ok(r4.status === 1, "quay lui: worker thoát mã 1 (báo cron có sự cố)");
  ok(!f4.messages.some((m) => /pg_restore|khôi phục dữ liệu/i.test(m.body)) && !fs.existsSync(path.join(T, "restore.log")), "quay lui: KHÔNG tự khôi phục dữ liệu từ bản sao lưu");

  // ── (4b) deploy hỏng ngay ở lệnh deploy; quay lui cũng hỏng → NGHIÊM TRỌNG ──────────────
  console.log("\n— Ca 4b: lệnh deploy luôn hỏng → quay lui cũng hỏng → ghi chú NGHIÊM TRỌNG —");
  const c4b = await newFeedback("Ca 4b triển khai hỏng hoàn toàn");
  setMode("normal");
  const r4b = await runWorker({ ...deployCfg(), deploy: "exit 1" });
  const f4b = await getFb(c4b.id);
  ok(head() === GOOD && f4b.status === "awaiting_user" && /NGHIÊM TRỌNG/.test(f4b.adminNote || "") && f4b.rolledBack === true && r4b.status === 1, "quay lui hỏng nốt → awaiting_user + ghi chú NGHIÊM TRỌNG, kho vẫn ở commit cũ", `${f4b.status} ${f4b.adminNote}`);

  // ── (5) hub đặt deploy nhưng maxDeliver=branch ──────────────────────────────────────────
  console.log("\n— Ca 5: hub đặt deploy, maxDeliver cục bộ=branch → KHÔNG deploy —");
  const deploysB5 = readT("deploys.log").trim().split("\n").length;
  const c5 = await newFeedback("Ca 5 hub đòi deploy nhưng trần cục bộ là branch");
  setMode("normal");
  const r5 = await runWorker({ ...baseCfg(), maxDeliver: "branch" });
  const f5 = await getFb(c5.id);
  ok(readT("deploys.log").trim().split("\n").length === deploysB5, "trần cục bộ: lệnh deploy KHÔNG được chạy");
  ok(!JSON.stringify(f5.events).includes("deploying") && f5.status === "done" && f5.adminNote?.includes("Chờ duyệt nhánh"), "trần cục bộ: giao qua nhánh chờ duyệt dù hub đặt deploy", `${f5.status} / ${f5.adminNote}`);
  ok(head() === GOOD && branchesOf(c5.id).length === 1, "trần cục bộ: nhánh gốc không tiến, commit nằm ở hub/<id>");
  ok(/maxDeliver cục bộ=branch/.test(fs.readFileSync(path.join(LOGDIR, fs.readdirSync(LOGDIR).find((x) => x.startsWith(slug))), "utf8")), "trần cục bộ: nhật ký ghi rõ việc hạ mức giao");
  void r5;

  // ── (6) cờ Dừng cắt agent ────────────────────────────────────────────────────────────────
  console.log("\n— Ca 6: người gửi bấm Dừng → cắt agent —");
  await patchProject({ mode: "execute", deliver: "branch" });
  const c6 = await newFeedback("Ca 6 sẽ bị dừng giữa chừng");
  setMode("hang");
  fs.rmSync(path.join(T, "hang-started"), { force: true });
  const f6 = path.join(T, "worker.config.json");
  fs.writeFileSync(f6, JSON.stringify(baseCfg()));
  const t0 = Date.now();
  const child = spawn(process.execPath, [WORKER, "--config", f6], { env: { ...process.env, TEST_DIR: T, HUB_KEY: WKEY }, stdio: "ignore" });
  const exited = new Promise((r) => child.on("close", (code) => r(code)));
  for (let i = 0; i < 100 && !fs.existsSync(path.join(T, "hang-started")); i++) await sleep(200);
  ok(fs.existsSync(path.join(T, "hang-started")), "agent giả đang chạy (treo)");
  const stopRes = await call("PATCH", `/api/v1/feedback/${c6.id}`, { token: c6.token, body: { stop: true } });
  ok(stopRes.status === 200, "người gửi bấm Dừng");
  const code6 = await Promise.race([exited, sleep(30_000).then(() => "treo")]);
  ok(code6 === 0 && Date.now() - t0 < 30_000, "worker cắt agent và thoát nhanh (không chờ hết trần thời gian)", `code=${code6} ${Date.now() - t0}ms`);
  const fb6 = await getFb(c6.id);
  ok(fb6.status === "awaiting_user" && fb6.stopRequestedAt === null && /dừng/i.test(fb6.adminNote || ""), "dừng: awaiting_user + cờ dừng được xoá", `${fb6.status} ${fb6.adminNote}`);
  ok(fb6.messages.some((m) => m.kind === "system" && /Đã dừng theo yêu cầu/.test(m.body)), "dừng: có tin hệ thống báo người gửi");
  ok(!git("status", "--porcelain", "--untracked-files=no").out && git("show", "HEAD:src/title.txt").out !== "ĐANG VIẾT DỞ", "dừng: cây làm việc sạch");
  ok(git("stash", "list").out.includes("hub-worker-dung"), "dừng: phần viết dở được CẤT vào git stash (không xoá)", git("stash", "list").out);
  await sleep(300);
  let alive = true;
  try { process.kill(Number(readT("grandchild.pid")), 0); } catch { alive = false; }
  ok(!alive, "dừng: tiến trình cháu của agent cũng bị cắt (cả nhóm tiến trình)");
  ok(!fs.existsSync(path.join(LOCKDIR, `${slug}.lock`)), "dừng: khoá được nhả");

  // ── (7) kiểm chứng thất bại ──────────────────────────────────────────────────────────────
  console.log("\n— Ca 7: agent khai chuỗi không có thật → verifyResult=fail —");
  const c7 = await newFeedback("Ca 7 agent khai sai chuỗi");
  setMode("wrongexpected");
  await runWorker(baseCfg());
  const f7 = await getFb(c7.id);
  ok(f7.status === "awaiting_user" && f7.verifyResult === "fail" && /KHÔNG tìm thấy/.test(f7.adminNote || ""), "kiểm chứng thất bại → awaiting_user, bất kể agent báo gì", `${f7.status} ${f7.verifyResult}`);
  ok(branchesOf(c7.id).length === 1 && head() === GOOD, "kiểm chứng thất bại: mã được giữ ở nhánh, nhánh gốc không tiến");

  // ── (8) nhà cung cấp lạ ──────────────────────────────────────────────────────────────────
  console.log("\n— Ca 8: aiProvider khác claude —");
  const c8 = await newFeedback("Ca 8 chọn nhà cung cấp glm", { aiProvider: "glm" });
  const runsB8 = agentRuns().length;
  setMode("ask");
  await runWorker(baseCfg());
  const f8 = await getFb(c8.id);
  ok(f8.status === "awaiting_user" && /glm/.test(f8.adminNote || "") && agentRuns().length === runsB8, "thiếu providers.glm → awaiting_user kèm lý do, KHÔNG chạy lặng lẽ bằng Claude", `${f8.status} ${f8.adminNote}`);
  const envGlm = path.join(T, "glm.env");
  fs.writeFileSync(envGlm, "# nhà cung cấp glm\nexport GLM_TOKEN='token-gia'\n", { mode: 0o600 });
  const c8b = await newFeedback("Ca 8b glm đã cấu hình", { aiProvider: "glm" });
  await runWorker({ ...baseCfg(), providers: { glm: envGlm } });
  const last8 = agentRuns().at(-1);
  ok(last8.id === c8b.id && last8.hasGlmToken, "có providers.glm → agent chạy với biến môi trường từ tệp env của nhà cung cấp");

  // ── (9) mô hình ──────────────────────────────────────────────────────────────────────────
  console.log("\n— Ca 9: danh sách mô hình cho phép cục bộ —");
  const c9a = await newFeedback("Ca 9a mô hình được phép", { aiModel: "claude-sonnet-5" });
  await runWorker({ ...baseCfg(), allowedModels: ["claude-sonnet-5"] });
  const a9 = agentRuns().at(-1);
  ok(a9.id === c9a.id && a9.argv.join(" ").includes("--model claude-sonnet-5"), "mô hình nằm trong allowedModels → truyền --model", JSON.stringify(a9.argv));
  const c9b = await newFeedback("Ca 9b mô hình ngoài danh sách", { aiModel: "model-la" });
  await runWorker({ ...baseCfg(), allowedModels: ["claude-sonnet-5"] });
  const b9 = agentRuns().at(-1);
  ok(b9.id === c9b.id && !b9.argv.includes("--model"), "mô hình ngoài allowedModels → KHÔNG truyền --model", JSON.stringify(b9.argv));

  // ── (10) phạm vi ─────────────────────────────────────────────────────────────────────────
  console.log("\n— Ca 10: agent đụng tệp ngoài allowedPaths —");
  const c10 = await newFeedback("Ca 10 đụng ngoài phạm vi");
  setMode("outside");
  await runWorker(baseCfg());
  const f10 = await getFb(c10.id);
  ok(/secret\/notes\.txt/.test(f10.scopeViolation || ""), "scopeViolation ghi tệp ngoài vùng cho phép", String(f10.scopeViolation));

  // ── (11) sao lưu hỏng → không deploy ─────────────────────────────────────────────────────
  console.log("\n— Ca 11: sao lưu thất bại → KHÔNG deploy —");
  await patchProject({ mode: "execute", deliver: "deploy" });
  fs.writeFileSync(path.join(T, "backup-fail"), "1");
  const dB11 = readT("deploys.log").trim().split("\n").length;
  const c11 = await newFeedback("Ca 11 sao lưu hỏng");
  setMode("normal");
  await runWorker(deployCfg());
  fs.rmSync(path.join(T, "backup-fail"));
  const f11 = await getFb(c11.id);
  ok(readT("deploys.log").trim().split("\n").length === dB11 && head() === GOOD, "sao lưu hỏng: không chạy deploy, nhánh gốc về mốc cũ");
  ok(f11.status === "awaiting_user" && /Sao lưu/.test(f11.adminNote || "") && branchesOf(c11.id).length === 1, "sao lưu hỏng: awaiting_user + mã được giữ ở nhánh", `${f11.status} ${f11.adminNote}`);

  // ── (12) khoá chống chạy chồng ───────────────────────────────────────────────────────────
  console.log("\n— Ca 12: khoá chống chạy chồng + van xả khoá cũ —");
  await patchProject({ mode: "execute", deliver: "branch" });
  const c12 = await newFeedback("Ca 12 khoá");
  setMode("ask");
  const lock = path.join(LOCKDIR, `${slug}.lock`);
  fs.mkdirSync(lock, { recursive: true });
  const runsB12 = agentRuns().length;
  await runWorker(baseCfg());
  ok(agentRuns().length === runsB12 && (await getFb(c12.id)).status === "pending", "khoá còn mới: lượt thứ hai thoát ngay, không làm gì");
  const old = new Date(Date.now() - 2 * 3600_000);
  fs.utimesSync(lock, old, old);
  await runWorker(baseCfg());
  ok(agentRuns().length === runsB12 + 1 && (await getFb(c12.id)).status === "awaiting_user", "khoá cũ >50 phút: worker cướp khoá và làm việc");
  ok(/cướp khoá/.test(fs.readFileSync(path.join(LOGDIR, fs.readdirSync(LOGDIR).find((x) => x.startsWith(slug))), "utf8")), "cướp khoá được ghi log cảnh báo");

  // ── (13) hàng đợi rỗng + nhận việc cũ nhất + CLI bị khoá vào một góp ý ───────────────────
  console.log("\n— Ca 13: hàng đợi rỗng, thứ tự cũ nhất trước, giới hạn của CLI —");
  const runsB13 = agentRuns().length;
  const t13 = Date.now();
  const r13 = await runWorker(baseCfg());
  ok(r13.status === 0 && agentRuns().length === runsB13 && Date.now() - t13 < 5000, "hàng đợi rỗng: thoát ngay, không chạy agent");
  const o1 = await newFeedback("Ca 13 góp ý cũ hơn");
  await sleep(50);
  const o2 = await newFeedback("Ca 13 góp ý mới hơn");
  setMode("ask");
  await runWorker(baseCfg());
  ok(agentRuns().at(-1).id === o1.id && (await getFb(o2.id)).status === "pending", "mỗi lượt nhận ĐÚNG MỘT góp ý, cũ nhất trước");
  await runWorker(baseCfg());
  ok(agentRuns().at(-1).id === o2.id, "lượt sau nhận góp ý kế tiếp");
  const cliEnv = { ...process.env, HUB_URL: HUB, HUB_KEY: WKEY, HUB_PROJECT: slug, HUB_FEEDBACK_ID: o1.id, HUB_RESULT_FILE: path.join(T, "x.json") };
  const cliBin = path.join(HERE, "hub-cli.mjs");
  const cli = (...a) => spawnSync(process.execPath, [cliBin, ...a], { env: cliEnv, encoding: "utf8" });
  ok(cli("transition", o2.id, "done", "--note", "x").status !== 0, "hub-cli: không cho đặt trạng thái góp ý khác với góp ý được giao");
  ok(cli("transition", o1.id, "deploying").status !== 0 && cli("transition", o1.id, "pending").status !== 0, "hub-cli: không cho agent đặt deploying/pending");
  ok(/Tiêu đề|Góp ý/.test(cli("get", o2.id).stdout) && cli("queue").status === 0 && /Chưa có|chưa có/.test(cli("memory", "list").stdout), "hub-cli: get/queue/memory list chạy được");
  const fd = new FormData();
  fd.append("file", new File(["Ghi chú đính kèm: chữ cần đổi là ABC"], "ghichu.txt", { type: "text/plain" }));
  const up = await fetch(`${HUB}/api/v1/feedback/${o1.id}/attachments`, { method: "POST", headers: { Authorization: `Bearer ${o1.token}` }, body: fd }).then((r) => r.json());
  const dl = cli("attachment", o1.id, up.attachment.id, "-o", path.join(T, "ghichu.txt"));
  ok(dl.status === 0 && fs.readFileSync(path.join(T, "ghichu.txt"), "utf8").includes("chữ cần đổi là ABC") && cli("get", o1.id).stdout.includes("ghichu.txt"), "hub-cli: tải tệp đính kèm về đúng nội dung; `get` liệt kê tệp");
  const att = cli("attachment", o1.id, "khong-co", "-o", path.join(T, "a.bin"));
  ok(att.status !== 0 && /404/.test(att.stderr), "hub-cli: attachment id sai → lỗi 404 rõ ràng");
  const done14 = cli("transition", o1.id, "done", "--note", "ghi nhận", "--expected", "abc");
  ok(done14.status === 0 && JSON.parse(fs.readFileSync(path.join(T, "x.json"), "utf8")).status === "done" && (await getFb(o1.id)).status === "reviewing", "hub-cli: 'done' do agent chỉ GHI NHẬN lời khai (hub vẫn reviewing, chưa 'hoàn thành')");
  await call("POST", `/api/v1/machine/feedback/${o1.id}/transition`, { key: WKEY, body: { to: "rejected", note: "dọn" } });

  // ── (14) agent kết thúc mà không ghi gì ──────────────────────────────────────────────────
  console.log("\n— Ca 14: agent kết thúc không ghi kết quả —");
  const c14 = await newFeedback("Ca 14 agent im lặng");
  setMode("silent");
  await runWorker(baseCfg());
  const f14 = await getFb(c14.id);
  ok(f14.status === "awaiting_user" && /chưa ghi lại kết quả/.test(f14.adminNote || ""), "agent im lặng → awaiting_user trung thực, không để treo ở reviewing", `${f14.status} ${f14.adminNote}`);
  ok(!(await call("GET", "/api/v1/machine/queue", { key: WKEY })).data.items.length, "cuối kiểm thử: hàng đợi sạch");

  // ── bí mật ───────────────────────────────────────────────────────────────────────────────
  console.log("\n— Bảo mật khoá —");
  const keyFile = path.join(T, "key.txt");
  fs.writeFileSync(keyFile, WKEY + "\n", { mode: 0o644 });
  const kcfg = path.join(T, "k.json");
  fs.writeFileSync(kcfg, JSON.stringify({ ...baseCfg(), keyFile }));
  const rk = spawnSync(process.execPath, [WORKER, "--config", kcfg], { env: { ...process.env, HUB_KEY: "" }, encoding: "utf8" });
  ok(rk.status === 1 && /chmod 600/.test(rk.stderr), "keyFile cho người khác đọc → worker từ chối, chỉ cách sửa");
  fs.chmodSync(keyFile, 0o600);
  const rk2 = spawnSync(process.execPath, [WORKER, "--config", kcfg], { env: { ...process.env, HUB_KEY: "" }, encoding: "utf8" });
  ok(rk2.status === 0, "keyFile chmod 600 → chạy được");
  ok(!JSON.stringify(baseCfg()).includes("fhk_"), "cấu hình mẫu không chứa khoá");
} catch (e) {
  failures.push("NGOẠI LỆ: " + (e.stack || e));
  console.error(e);
} finally {
  healthSrv.close();
  try {
    const l = await call("POST", "/api/admin/login", { body: { email: EMAIL, password: PASS } });
    const c = l.res.headers.get("set-cookie")?.split(";")[0];
    await call("DELETE", `/api/admin/projects/${slug}`, { cookie: c, body: { confirm: slug } });
  } catch {}
  if (process.env.KEEP) console.log("Giữ thư mục thử:", T);
  else fs.rmSync(T, { recursive: true, force: true });
}
void opKeyId;
console.log(`\n${passed} đạt, ${failures.length} lỗi`);
if (failures.length) { console.log(failures.map((f) => " - " + f).join("\n")); process.exit(1); }
