#!/usr/bin/env node
/**
 * Worker chung của Feedback Hub — chạy "chế độ làm ngay" (execute) cho BẤT KỲ ứng dụng nào.
 * Tổng quát hoá vòng lặp tự phát triển của DGXL (scripts/dgxl-autodev-server.sh), giữ nguyên các cơ chế an toàn
 * đã chạy thật, nhưng gọi API của hub thay vì SQL. Node ≥ 20, KHÔNG phụ thuộc gói ngoài.
 *
 * Mỗi lần gọi chạy MỘT LƯỢT rồi thoát (để cron/launchd gọi mỗi phút) và thoát ngay khi không có việc — không tốn token:
 *   khoá chống chạy chồng → heartbeat → (mode≠execute: thoát) → xử lý cờ Dừng → claim việc CŨ NHẤT → agent làm
 *   → kiểm phạm vi → dựng thử + kiểm chứng chuỗi đã khai → giao (nhánh chờ duyệt | sao lưu→triển khai→health→kiểm chứng; hỏng thì quay lui).
 *
 * Phân vai: AGENT chỉ được viết mã + dựng thử + commit và khai kết quả qua hub-cli.mjs (không có quyền DB, cấm deploy/push).
 * WORKER (script tất định này) lo sao lưu, triển khai, kiểm tra sức khoẻ, kiểm chứng và quay lui — vì quay lui không thể
 * phó thác cho một agent vừa làm hỏng hệ thống tự đánh giá là mình đã làm hỏng.
 * KHÔNG BAO GIỜ tự khôi phục dữ liệu từ bản sao lưu: khôi phục xoá mọi thao tác người dùng làm trong khoảng đó — để người quyết định.
 *
 *   node hub-worker.mjs [--config worker.config.json] [--verbose]
 *   Bí mật: HUB_KEY (khoá worker fhk_w_…) hoặc tệp `keyFile` chỉ-chủ-đọc (chmod 600). KHÔNG đặt khoá trong tệp cấu hình.
 */
import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Cấu hình ────────────────────────────────────────────────────────────────────────────────
const args = parseArgs({
  options: { config: { type: "string", short: "c" }, verbose: { type: "boolean", short: "v" }, help: { type: "boolean", short: "h" } },
  allowPositionals: false,
}).values;

if (args.help) {
  console.log("Dùng: node hub-worker.mjs [--config worker.config.json] [--verbose]\nXem worker/README.md.");
  process.exit(0);
}

const expand = (p, base) => {
  if (p == null) return p;
  if (p === "~" || p.startsWith("~/")) p = path.join(os.homedir(), p.slice(1));
  return path.isAbsolute(p) ? p : path.resolve(base, p);
};

function loadConfig() {
  const file =
    args.config || process.env.HUB_WORKER_CONFIG ||
    [path.resolve("worker.config.json"), path.join(HERE, "worker.config.json")].find((f) => fs.existsSync(f));
  if (!file || !fs.existsSync(file)) throw new Error("Không tìm thấy worker.config.json (dùng --config <tệp> hoặc HUB_WORKER_CONFIG).");
  const dir = path.dirname(path.resolve(file));
  const raw = JSON.parse(fs.readFileSync(file, "utf8"));
  const c = {
    baseBranch: null,
    maxDeliver: "branch",
    build: null, buildTimeoutSec: 1800,
    deploy: null, deployTimeoutSec: 1800,
    healthUrl: null, healthTries: 30, healthIntervalSec: 4,
    backup: null, backupTimeoutSec: 900,
    allowedModels: [], providers: {},
    allowedPaths: null, protectedPaths: [],
    boundaries: null, promptFile: null,
    verify: null,
    pathPrepend: [],
    lockDir: "~/.feedback-hub-worker", lockStaleMin: 50,
    keyFile: null,
    ...raw,
    agent: { cmd: "claude", args: null, modelArgs: ["--model", "{model}"], timeoutSec: 2400, budgetUsd: 10, envFile: null, requireAnyEnv: null, ...(raw.agent || {}) },
  };
  for (const k of ["hub", "project", "repo"]) if (!c[k]) throw new Error(`Cấu hình thiếu "${k}".`);
  if (!["branch", "deploy"].includes(c.maxDeliver)) throw new Error('"maxDeliver" phải là "branch" hoặc "deploy".');
  if (c.maxDeliver === "deploy" && !c.deploy) throw new Error('maxDeliver="deploy" thì bắt buộc có "deploy" (lệnh triển khai).');
  if (c.verify && !["grep-build", "cmd"].includes(c.verify.mode)) throw new Error('"verify.mode" phải là "grep-build" hoặc "cmd".');
  if (c.verify?.mode === "cmd" && !String(c.verify.cmd || "").includes("{expected}")) throw new Error('"verify.cmd" phải chứa {expected}.');
  c.hub = c.hub.replace(/\/+$/, "");
  c.repo = expand(c.repo, dir);
  c.lockDir = expand(c.lockDir, dir);
  c.logDir = expand(c.logDir || path.join(c.lockDir, "logs"), dir);
  c.keyFile = expand(c.keyFile, dir);
  c.agent.envFile = expand(c.agent.envFile, dir);
  c.promptFile = expand(c.promptFile, dir);
  c.pathPrepend = (c.pathPrepend || []).map((p) => expand(p, dir));
  c.providers = Object.fromEntries(
    Object.entries(c.providers || {}).map(([k, v]) => {
      const o = typeof v === "string" ? { envFile: v } : { ...v };
      o.envFile = expand(o.envFile, dir);
      return [k, o];
    }),
  );
  if (c.verify?.mode === "grep-build") c.verify = { dir: ".next", ...c.verify };
  return c;
}

let cfg;
try {
  cfg = loadConfig();
} catch (e) {
  console.error(`[hub-worker] CẤU HÌNH LỖI: ${e.message}`);
  process.exit(1);
}

// ── Nhật ký ─────────────────────────────────────────────────────────────────────────────────
fs.mkdirSync(cfg.logDir, { recursive: true });
const logFile = () => path.join(cfg.logDir, `${cfg.project}-${new Date().toISOString().slice(0, 10)}.log`);
const stamp = () => new Date().toLocaleString("sv-SE").replace("T", " ");
const VERBOSE = args.verbose || process.env.HUB_WORKER_VERBOSE === "1";
function log(msg) {
  const line = `[${stamp()}] ${msg}\n`;
  try { fs.appendFileSync(logFile(), line); } catch {}
  if (VERBOSE) process.stdout.write(line);
}
/** Cảnh báo lỗi môi trường: cron gọi mỗi phút nên chỉ ghi khi nội dung đổi, khỏi ngập nhật ký. */
function warnOnce(key, msg) {
  const f = path.join(cfg.logDir, `.warned-${cfg.project}-${key}`);
  let prev = "";
  try { prev = fs.readFileSync(f, "utf8"); } catch {}
  if (prev !== msg) { log(`⚠ ${msg}`); try { fs.writeFileSync(f, msg); } catch {} }
}
const clearWarn = (key) => { try { fs.rmSync(path.join(cfg.logDir, `.warned-${cfg.project}-${key}`), { force: true }); } catch {} };

// ── Khoá hub ────────────────────────────────────────────────────────────────────────────────
function readKey() {
  if (process.env.HUB_KEY) return process.env.HUB_KEY.trim();
  if (cfg.keyFile) {
    const st = fs.statSync(cfg.keyFile);
    if (st.mode & 0o077) throw new Error(`Tệp khoá ${cfg.keyFile} cho phép người khác đọc — chạy: chmod 600 "${cfg.keyFile}"`);
    return fs.readFileSync(cfg.keyFile, "utf8").trim();
  }
  throw new Error("Thiếu khoá hub: đặt biến HUB_KEY hoặc \"keyFile\" trỏ tới tệp chỉ-chủ-đọc.");
}
let HUB_KEY;
try { HUB_KEY = readKey(); } catch (e) { console.error(`[hub-worker] ${e.message}`); log(`LỖI khoá: ${e.message}`); process.exit(1); }

class HubDown extends Error {}
async function hubApi(method, p, body) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(cfg.hub + p, {
        method,
        headers: { Authorization: `Bearer ${HUB_KEY}`, ...(body ? { "Content-Type": "application/json" } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(30_000),
      });
      let data = null;
      try { data = await res.json(); } catch {}
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      last = e;
      await sleep(1000 * (i + 1));
    }
  }
  throw new HubDown(`không gọi được hub (${cfg.hub}): ${last?.cause?.code || last}`);
}

// ── Tiện ích tiến trình / git ───────────────────────────────────────────────────────────────
const childEnv = () => {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
  if (cfg.pathPrepend.length) env.PATH = [...cfg.pathPrepend, env.PATH || ""].join(path.delimiter);
  delete env.HUB_KEY; // lệnh build/deploy/verify không cần khoá hub
  return env;
};
const sq = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;

let currentChild = null;
async function killGroup(child) {
  if (!child?.pid) return;
  try { process.kill(-child.pid, "SIGTERM"); } catch {}
  await sleep(3000);
  try { process.kill(-child.pid, "SIGKILL"); } catch {}
}

/** Chạy một lệnh shell, tối đa timeoutSec, cắt cả nhóm tiến trình khi quá hạn. */
function runCmd(cmd, { timeoutSec, label }) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", cmd], { cwd: cfg.repo, env: childEnv(), detached: true, stdio: ["ignore", "pipe", "pipe"] });
    currentChild = child;
    let tail = "";
    const add = (d) => { tail = (tail + d).slice(-8000); };
    child.stdout.on("data", add);
    child.stderr.on("data", add);
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; void killGroup(child); }, timeoutSec * 1000);
    child.on("error", (e) => { clearTimeout(t); resolve({ code: 127, tail: String(e), timedOut: false }); });
    child.on("close", (code) => {
      clearTimeout(t);
      currentChild = null;
      try { fs.appendFileSync(logFile(), `--- ${label} (mã ${code}${timedOut ? ", QUÁ HẠN" : ""}) ---\n${tail.slice(-3000)}\n`); } catch {}
      resolve({ code: code ?? 1, tail, timedOut });
    });
  });
}

function git(a) {
  const r = spawnSync("git", a, { cwd: cfg.repo, env: childEnv(), encoding: "utf8" });
  return { code: r.status ?? 1, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const head = () => git(["rev-parse", "HEAD"]).out;
const curBranch = () => git(["rev-parse", "--abbrev-ref", "HEAD"]).out;
const branchExists = (n) => git(["rev-parse", "--verify", "-q", `refs/heads/${n}`]).code === 0;
function uniqueBranch(name) {
  if (!branchExists(name)) return name;
  for (let i = 2; ; i++) if (!branchExists(`${name}-${i}`)) return `${name}-${i}`;
}
/** Các đường dẫn đang thay đổi (kể cả tệp mới chưa theo dõi). */
function dirtyPaths() {
  const r = spawnSync("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"], { cwd: cfg.repo, encoding: "utf8" });
  const parts = (r.stdout || "").split("\0").filter(Boolean);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    out.push({ status: e.slice(0, 2), file: e.slice(3) });
    if (e[0] === "R" || e[0] === "C") i++; // bỏ tên cũ của đổi tên
  }
  return out;
}

// ── Khoá chống chạy chồng ───────────────────────────────────────────────────────────────────
fs.mkdirSync(cfg.lockDir, { recursive: true });
const LOCK = path.join(cfg.lockDir, `${cfg.project}.lock`);
let lockTimer = null;
/** Van xả: một phiên treo mà giữ khoá mãi thì mọi góp ý nằm im không ai biết — thà cướp khoá và ghi log to còn hơn tắc âm thầm. */
function acquireLock() {
  try { fs.mkdirSync(LOCK); } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const ageMin = (Date.now() - fs.statSync(LOCK).mtimeMs) / 60_000;
    if (ageMin <= cfg.lockStaleMin) return false;
    log(`CẢNH BÁO: khoá cũ hơn ${cfg.lockStaleMin} phút (${Math.round(ageMin)} phút) — phiên trước coi như đã chết, cướp khoá và chạy tiếp.`);
    fs.rmSync(LOCK, { recursive: true, force: true });
    try { fs.mkdirSync(LOCK); } catch { return false; }
  }
  try { fs.writeFileSync(path.join(LOCK, "pid"), String(process.pid)); } catch {}
  // Làm tươi mốc thời gian để "cũ" nghĩa là tiến trình đã chết thật, không phải một lượt dài hợp lệ (agent 40' + dựng + triển khai).
  lockTimer = setInterval(() => { try { const n = new Date(); fs.utimesSync(LOCK, n, n); } catch {} }, 30_000);
  lockTimer.unref();
  return true;
}
const releaseLock = () => { clearInterval(lockTimer); try { fs.rmSync(LOCK, { recursive: true, force: true }); } catch {} };

let shuttingDown = false;
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`Nhận ${sig} — dừng tiến trình con và nhả khoá. (Góp ý đang giữ sẽ được làm tiếp ở lượt sau.)`);
    await killGroup(currentChild);
    releaseLock();
    process.exit(130);
  });
}

// ── Báo cáo lên hub ─────────────────────────────────────────────────────────────────────────
/** Trường máy dồn lại để gắn vào lần chuyển trạng thái ĐẦU TIÊN sau lượt agent (chi phí, phạm vi…). */
let pendingFields = {};
const takeFields = (extra = {}) => { const f = { ...pendingFields, ...extra }; pendingFields = {}; return f; };

async function report(id, to, { note, message, fields } = {}) {
  const f = takeFields(fields);
  const body = {
    to,
    ...(note ? { note: note.slice(0, 500) } : {}),
    ...(message ? { message: { role: "ai", kind: message.kind || "chat", ...(message.kind === "system" ? { authorName: "Hệ thống" } : {}), body: message.body } } : {}),
    ...(Object.keys(f).length ? { fields: f } : {}),
  };
  try {
    const r = await hubApi("POST", `/api/v1/machine/feedback/${id}/transition`, body);
    if (!r.ok) { log(`LỖI báo ${to} cho ${id}: HTTP ${r.status} ${JSON.stringify(r.data)}`); pendingFields = { ...f, ...pendingFields }; }
    return r.ok;
  } catch (e) {
    log(`LỖI báo ${to} cho ${id}: ${e.message}`);
    return false;
  }
}
const say = (id, body, kind = "chat") =>
  hubApi("POST", `/api/v1/machine/feedback/${id}/messages`, { role: "ai", kind, ...(kind === "system" ? { authorName: "Hệ thống" } : {}), body }).catch((e) => log(`LỖI ghi tin cho ${id}: ${e.message}`));
const getFeedback = async (id) => (await hubApi("GET", `/api/v1/machine/feedback/${id}`)).data?.feedback;

// ── Dừng theo yêu cầu người gửi ─────────────────────────────────────────────────────────────
const STOP_MSG = "Đã dừng theo yêu cầu của anh/chị. Phần AI viết dở đã được cất đi, chưa áp dụng vào hệ thống. Nhắn thêm ở đây nếu muốn AI làm tiếp.";
async function finalizeStop(id) {
  log(`Dừng ${id} theo lệnh của người gửi.`);
  await report(id, "awaiting_user", { note: "Đã dừng theo yêu cầu của người gửi.", message: { kind: "system", body: STOP_MSG }, fields: { clearStop: true } });
}

/** Cất (KHÔNG xoá) phần viết dở vào git stash để cây làm việc sạch mà vẫn khôi phục được nếu cần. */
function shelveDirty(tag, ignore = new Set()) {
  const files = dirtyPaths().map((d) => d.file).filter((f) => !ignore.has(f));
  if (!files.length) return false;
  const r = git(["stash", "push", "--include-untracked", "-m", `hub-worker-${tag}-${Date.now()}`, "--", ...files]);
  if (r.code === 0) log(`Đã cất công việc dở dang vào git stash (${files.length} tệp; xem: git stash list).`);
  else log(`CẢNH BÁO: không cất được công việc dở dang — cần người xem cây làm việc: ${r.err}`);
  return r.code === 0;
}

/** Đưa nhánh gốc về đúng mốc trước lượt chạy. Phần đã commit nếu cần giữ phải được gắn nhánh TRƯỚC khi gọi. */
function restoreBase(base, prev) {
  if (curBranch() !== base) git(["checkout", "-f", base]);
  if (head() !== prev) git(["reset", "--hard", prev]);
}
function preserve(id, tag, sha) {
  const name = uniqueBranch(`hub/${id}${tag}`);
  git(["branch", name, sha]);
  log(`Giữ lại commit ${sha.slice(0, 8)} ở nhánh ${name}.`);
  return name;
}

// ── Kiểm chứng lời khai ─────────────────────────────────────────────────────────────────────
/**
 * Navneet & Chandra (2025) đo được 17,8–22,6% trường hợp agent BÁO CÁO SAI SỰ THẬT. Nên "xong" không còn là lời agent tự khai:
 * agent khai trước một CHUỖI QUAN SÁT ĐƯỢC; sau khi dựng/triển khai, worker tự tìm chuỗi đó. Không thấy → thất bại, dù agent nói gì.
 */
async function verifyClaim(expected, { allowCmd }) {
  const e = (expected || "").replace(/[\r\n]+/g, " ").trim();
  if (!e) return "skipped";
  const v = cfg.verify;
  if (!v) return "skipped";
  if (v.mode === "grep-build") {
    const dir = path.resolve(cfg.repo, v.dir);
    if (!fs.existsSync(dir)) { log(`Kiểm chứng: không có thư mục ${dir}.`); return "fail"; }
    const r = spawnSync("grep", ["-rqF", "--", e, dir], { encoding: "utf8" });
    return r.status === 0 ? "pass" : "fail";
  }
  if (!allowCmd) return "skipped";
  const r = await runCmd(v.cmd.replaceAll("{expected}", sq(e)), { timeoutSec: 120, label: "kiểm chứng" });
  return r.code === 0 ? "pass" : "fail";
}

// ── Triển khai ──────────────────────────────────────────────────────────────────────────────
async function healthy() {
  if (!cfg.healthUrl) return true;
  for (let i = 0; i < cfg.healthTries; i++) {
    try {
      const r = await fetch(cfg.healthUrl, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return true;
    } catch {}
    await sleep(cfg.healthIntervalSec * 1000);
  }
  return false;
}
async function deployAndCheck(id) {
  const r = await runCmd(cfg.deploy, { timeoutSec: cfg.deployTimeoutSec, label: "triển khai" });
  if (r.code !== 0) return false;
  if (id) await say(id, "Đã dựng xong, đang khởi động lại và kiểm tra hệ thống…", "system");
  return healthy();
}

// ── Prompt cho agent ────────────────────────────────────────────────────────────────────────
function buildPrompt(item, project, base, extra = {}) {
  const tpl = fs.readFileSync(cfg.promptFile || path.join(HERE, "prompt.vi.md"), "utf8");
  const boundaries = [].concat(cfg.boundaries || [], extra.boundaries || []).join("\n\n").trim();
  const vars = {
    projectName: project.name || cfg.project,
    projectSlug: cfg.project,
    feedbackId: item.id,
    cli: `${sq(process.execPath)} ${sq(path.join(HERE, "hub-cli.mjs"))}`,
    repo: cfg.repo,
    baseBranch: base,
    buildCmd: cfg.build ? `chạy \`${cfg.build}\`` : "tự chạy bước dựng/kiểm thử phù hợp của dự án (cấu hình chưa có lệnh dựng riêng)",
    allowedPaths: cfg.allowedPaths?.length ? cfg.allowedPaths.map((p) => `\`${p}\``).join(", ") : "mọi tệp trong kho mã, trừ tệp bí mật",
    guidance: (extra.guidance || "").trim() || "(Dự án chưa có hướng dẫn riêng.)",
    boundaries: boundaries || "(Ứng dụng này không nêu thêm ranh giới riêng ngoài các điều chung ở trên.)",
  };
  return tpl.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (k in vars) return vars[k];
    log(`CẢNH BÁO: prompt có placeholder lạ ${m} — để trống.`);
    return "";
  });
}

function loadEnvFile(file) {
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trim().startsWith("#")) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  return env;
}

function resolveCmd(cmd) {
  if (cmd.includes("/")) { try { fs.accessSync(cmd, fs.constants.X_OK); return cmd; } catch { return null; } }
  const dirs = [...cfg.pathPrepend, ...(process.env.PATH || "").split(path.delimiter)];
  for (const d of dirs) { const f = path.join(d, cmd); try { fs.accessSync(f, fs.constants.X_OK); return f; } catch {} }
  return null;
}

/** Chạy agent ở nền, canh cờ Dừng mỗi 2 giây và trần thời gian. */
async function runAgent({ item, agent, env, prompt, model, base }) {
  const promptFile = path.join(cfg.logDir, "prompts", `${item.id}.md`);
  fs.mkdirSync(path.dirname(promptFile), { recursive: true });
  fs.writeFileSync(promptFile, prompt);
  const sub = (s) => s.replaceAll("{prompt}", prompt).replaceAll("{promptFile}", promptFile).replaceAll("{budget}", String(agent.budgetUsd)).replaceAll("{model}", model || "");
  const baseArgs = agent.args || ["-p", "{prompt}", "--permission-mode", "bypassPermissions", "--output-format", "json", "--max-budget-usd", "{budget}"];
  const argv = [...baseArgs.map(sub), ...(model ? agent.modelArgs.map(sub) : [])];
  const resultFile = path.join(cfg.logDir, "results", `${item.id}.json`);
  fs.mkdirSync(path.dirname(resultFile), { recursive: true });
  fs.rmSync(resultFile, { force: true });
  const fullEnv = {
    ...childEnv(), ...env,
    HUB_URL: cfg.hub, HUB_KEY, HUB_PROJECT: cfg.project, HUB_FEEDBACK_ID: item.id, HUB_RESULT_FILE: resultFile, HUB_PROMPT_FILE: promptFile,
    PATH: childEnv().PATH,
  };
  log(`Khởi động agent (${agent.cmd}${model ? `, mô hình ${model}` : ""}, trần ${agent.timeoutSec}s, ngân sách ${agent.budgetUsd} USD).`);

  const child = spawn(agent.cmd, argv, { cwd: cfg.repo, env: fullEnv, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  currentChild = child;
  let out = "";
  child.stdout.on("data", (d) => { if (out.length < 5_000_000) out += d; });
  child.stderr.on("data", (d) => { try { fs.appendFileSync(logFile(), d); } catch {} });
  let spawnErr = null, timedOut = false, stopped = false;
  const exited = new Promise((r) => {
    child.on("error", (e) => { spawnErr = e; r({ code: 127 }); });
    child.on("close", (code, sig) => r({ code: code ?? 1, sig }));
  });
  const timer = setTimeout(() => { timedOut = true; log(`CẢNH BÁO: agent bị cắt vì quá ${agent.timeoutSec} giây.`); void killGroup(child); }, agent.timeoutSec * 1000);

  let done = false;
  exited.then(() => { done = true; });
  while (!done) {
    await Promise.race([exited, sleep(2000)]);
    if (done) break;
    try {
      const q = await hubApi("GET", "/api/v1/machine/queue");
      if (q.ok && q.data?.stopRequested?.includes(item.id)) {
        stopped = true;
        log("Người gửi bấm Dừng lại — cắt lượt chạy của AI.");
        await killGroup(child);
        break;
      }
    } catch {}
  }
  const { code } = await exited;
  clearTimeout(timer);
  currentChild = null;

  let cost = 0, resultText = "", isError = false;
  try {
    const j = JSON.parse(out.trim().split("\n").filter(Boolean).pop() || "{}");
    cost = Number(j.total_cost_usd) || 0;
    resultText = String(j.result ?? "");
    isError = !!j.is_error;
  } catch { resultText = out.slice(-2000); }
  try { fs.appendFileSync(logFile(), `${resultText}\n`); } catch {}
  let declared = null;
  try { declared = JSON.parse(fs.readFileSync(resultFile, "utf8")); } catch {}
  return { code, spawnErr, timedOut, stopped, cost, isError, declared, resultText, base };
}

// ── Một lượt ────────────────────────────────────────────────────────────────────────────────
const RANK = { branch: 0, deploy: 1 };

async function runOnce() {
  const hb = await hubApi("POST", "/api/v1/machine/heartbeat");
  if (hb.status === 401 || hb.status === 403) { warnOnce("auth", `Hub từ chối khoá (HTTP ${hb.status}): ${hb.data?.error ?? ""} — kiểm tra HUB_KEY/keyFile.`); return 1; }
  if (!hb.ok) { warnOnce("hub", `Hub trả HTTP ${hb.status} ở heartbeat.`); return 0; }
  clearWarn("auth"); clearWarn("hub");
  if (hb.data.mode !== "execute") return 0; // chế độ thu nhận: việc do người nhờ Claude lấy ra làm tay

  const q = await hubApi("GET", "/api/v1/machine/queue");
  if (!q.ok) { warnOnce("hub", `Hub trả HTTP ${q.status} ở queue.`); return 0; }
  const stops = q.data.stopRequested || [];
  // Đang giữ khoá nên chắc chắn không còn agent nào chạy: mọi cờ Dừng còn sót là mồ côi.
  for (const id of stops) await finalizeStop(id);
  const items = (q.data.items || []).filter((i) => !stops.includes(i.id));
  if (!items.length) return 0;

  // ── Kiểm tra môi trường TRƯỚC khi nhận việc (lỗi môi trường không được làm hỏng góp ý của ai) ──
  if (!fs.existsSync(path.join(cfg.repo, ".git"))) { warnOnce("repo", `"${cfg.repo}" không phải kho git — ${items.length} góp ý đang chờ.`); return 1; }
  if (!resolveCmd(cfg.agent.cmd)) { warnOnce("agent", `Không tìm thấy lệnh agent "${cfg.agent.cmd}" trong PATH — ${items.length} góp ý đang chờ (đặt pathPrepend trong cấu hình nếu chạy bằng cron).`); return 1; }
  if (cfg.agent.requireAnyEnv?.length && !cfg.agent.requireAnyEnv.some((k) => process.env[k] || (cfg.agent.envFile && fs.existsSync(cfg.agent.envFile) && loadEnvFile(cfg.agent.envFile)[k]))) {
    warnOnce("authenv", `CHƯA CẤU HÌNH XÁC THỰC cho agent: ${items.length} góp ý đang chờ. Cần một trong các biến: ${cfg.agent.requireAnyEnv.join(", ")}.`);
    return 1;
  }
  let base = cfg.baseBranch || curBranch();
  if (!base || base === "HEAD" || (!cfg.baseBranch && base.startsWith("hub/"))) { warnOnce("repo", `Kho đang ở trạng thái lạ ("${base}") — đặt baseBranch trong cấu hình.`); return 1; }
  if (curBranch() !== base) { const r = git(["checkout", base]); if (r.code !== 0) { warnOnce("repo", `Không chuyển được sang nhánh ${base}: ${r.err}`); return 1; } }
  clearWarn("repo"); clearWarn("agent"); clearWarn("authenv");

  // ── Nhận việc CŨ NHẤT còn nhận được (409 → bên khác đang giữ, bỏ qua) ──
  let item = null;
  for (const it of items) {
    const r = await hubApi("POST", `/api/v1/machine/feedback/${it.id}/claim`);
    if (r.ok) { item = it; break; }
    if (r.status !== 409) log(`Không nhận được ${it.id}: HTTP ${r.status} ${JSON.stringify(r.data)}`);
  }
  if (!item) return 0;
  const id = item.id;
  log(`══════ Nhận góp ý ${id} (${items.length} đang mở): ${JSON.stringify(item.title)} ══════`);

  // ── Nhà cung cấp & mô hình ──
  // `claude -p` chọn điểm truy xuất MỘT LẦN cho cả tiến trình; mỗi lượt chỉ làm một góp ý nên không còn lẫn nhà cung cấp như bản DGXL.
  const provider = item.aiProvider || "claude";
  let env = {}, agent = cfg.agent;
  // Cấu hình AI-dev từ hub: CHỈ THẮT CHẶT. Ngân sách/thời gian lấy min(hub, trần cục bộ); ranh giới và hướng dẫn chỉ cộng thêm vào prompt.
  const hw = q.data.project?.worker || {};
  const hubW = {
    boundaries: Array.isArray(hw.boundaries) ? hw.boundaries.filter((x) => typeof x === "string" && x.trim()).slice(0, 20) : [],
    instructions: typeof hw.instructions === "string" ? hw.instructions.slice(0, 4000) : "",
  };
  const tighten = (local, hub) => (typeof hub === "number" && Number.isFinite(hub) && hub > 0 ? Math.min(local, hub) : local);
  agent = { ...agent, budgetUsd: tighten(agent.budgetUsd, hw.budgetUsd), timeoutSec: tighten(agent.timeoutSec, hw.timeoutSec) };
  if (cfg.agent.envFile && fs.existsSync(cfg.agent.envFile)) env = { ...env, ...loadEnvFile(cfg.agent.envFile) };
  if (provider !== "claude") {
    const p = cfg.providers[provider];
    if (!p?.envFile || !fs.existsSync(p.envFile)) {
      // KHÔNG lặng lẽ chạy bằng Claude: người gửi chọn nhà khác là có chủ đích, chạy sai nhà cung cấp làm hỏng phép so sánh.
      log(`✗ Góp ý chọn '${provider}' nhưng cấu hình cục bộ thiếu providers.${provider} (hoặc tệp env không tồn tại) — không chạy.`);
      await report(id, "awaiting_user", {
        note: `Chọn mô hình "${provider}" nhưng máy chủ chưa được cài khoá cho nhà cung cấp này. Người phụ trách cần cấu hình rồi bạn trả lời để chạy lại, hoặc chọn mô hình khác.`,
        message: { body: `Mình chưa chạy được vì mô hình bạn chọn ("${provider}") chưa được cài đặt trên máy chủ. Người phụ trách cần cài đặt trước; hoặc bạn có thể chọn mô hình khác rồi nhắn lại ở đây để mình làm tiếp.` },
      });
      return 0;
    }
    env = { ...env, ...loadEnvFile(p.envFile) };
    if (p.cmd) agent = { ...agent, cmd: p.cmd, ...(p.args ? { args: p.args } : {}) };
    log(`Nhà cung cấp lượt này: ${provider} (nạp ${p.envFile}).`);
  }
  // Tên mô hình đi thẳng vào tham số dòng lệnh → CHỈ nhận khi nằm trong danh sách cho phép CỤC BỘ.
  const model = provider === "claude" && item.aiModel && cfg.allowedModels.includes(item.aiModel) ? item.aiModel : "";
  if (item.aiModel && !model && provider === "claude") log(`Mô hình "${item.aiModel}" không nằm trong allowedModels — dùng mặc định.`);

  // ── Trạng thái kho trước lượt chạy ──
  // Kho của worker là bản làm việc RIÊNG; thay đổi chưa commit còn sót (vd. lượt trước bị ngắt) được CẤT vào stash chứ không xoá.
  if (git(["status", "--porcelain", "--untracked-files=no"]).out) {
    const r = git(["stash", "push", "-m", `hub-worker-truoc-luot-${Date.now()}`]);
    log(r.code === 0 ? "Kho có thay đổi chưa commit từ trước — đã cất vào git stash để lượt này bắt đầu sạch." : `CẢNH BÁO: không cất được thay đổi cũ: ${r.err}`);
  }
  const prev = head();
  const dirtyBefore = new Set(dirtyPaths().map((d) => d.file));
  log(`Mốc lùi ${prev}, nhánh gốc ${base}.`);

  await say(id, "Trợ lý đã nhận việc này và đang đọc kỹ yêu cầu của bạn.", "progress");
  const prompt = buildPrompt(item, { name: q.data.project?.name || cfg.project }, base, { boundaries: hubW.boundaries, guidance: hubW.instructions });

  const run = await runAgent({ item, agent, env, prompt, model, base });
  log(`Agent kết thúc (mã ${run.code}${run.timedOut ? ", QUÁ HẠN" : ""}${run.stopped ? ", BỊ DỪNG" : ""}); chi phí ${run.cost} USD.`);
  pendingFields = { addCostUsd: Math.min(1000, run.cost), addAgentRuns: 1 };

  return afterAgent({ id, prev, base, dirtyBefore, run });
}

async function afterAgent({ id, prev, base, dirtyBefore, run }) {
  // ── Kiểm phạm vi (phát hiện SAU, vì không ngăn trước được khi agent chạy ở chế độ bỏ qua quyền) ──
  const newSha = head();
  const onBase = curBranch() === base;
  const ancestor = git(["merge-base", "--is-ancestor", prev, newSha]).code === 0;
  const hasCommit = newSha !== prev;
  const dirtyNew = dirtyPaths().filter((d) => !dirtyBefore.has(d.file));
  const changed = new Set(dirtyNew.map((d) => d.file));
  if (hasCommit && ancestor) git(["diff", "--name-only", `${prev}..${newSha}`]).out.split("\n").filter(Boolean).forEach((f) => changed.add(f));

  const protectedHit = [...changed].filter((f) => cfg.protectedPaths.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : p + "/")));
  if (cfg.allowedPaths?.length) {
    const out = [...changed].filter((f) => !cfg.allowedPaths.some((p) => f === p || f.startsWith(p.endsWith("/") ? p : p + "/")));
    if (out.length) {
      log(`CẢNH BÁO PHẠM VI: lượt chạy đụng vào tệp ngoài vùng cho phép: ${out.slice(0, 5).join(", ")}`);
      pendingFields.scopeViolation = out.slice(0, 20).join("\n").slice(0, 2000);
    }
  }
  // Tệp bí mật bị sửa mà chưa commit → khôi phục ngay.
  for (const f of protectedHit) {
    if (dirtyNew.some((d) => d.file === f)) { log(`NGHIÊM TRỌNG: tệp bảo vệ ${f} bị sửa — khôi phục.`); git(["checkout", "--", f]); }
  }

  // ── Cờ Dừng (kể cả vừa bật sát lúc agent kết thúc) ──
  let fb = null;
  try { fb = await getFeedback(id); } catch {}
  const stopped = run.stopped || (fb?.stopRequestedAt && fb.status === "reviewing");
  if (stopped) {
    shelveDirty("dung", dirtyBefore);
    if (hasCommit) preserve(id, "-dung", newSha);
    restoreBase(base, prev);
    await finalizeStop(id);
    return 0;
  }

  const declared = run.declared?.status === "done";
  const status = fb?.status;
  const normalExit = run.code === 0 && !run.timedOut && !run.spawnErr;
  const fail = async (tag, note, message) => {
    // Giữ mã đã viết ở một nhánh để người phụ trách xem; kho về đúng mốc cũ; cây làm việc sạch.
    shelveDirty(tag, dirtyBefore);
    const br = hasCommit ? preserve(id, `-${tag}`, newSha) : null;
    restoreBase(base, prev);
    await report(id, "awaiting_user", { note: note + (br ? ` Mã đã viết được giữ ở nhánh ${br}.` : ""), message: { body: message } });
    return 0;
  };

  if (run.spawnErr) return fail("loi", `Không chạy được agent: ${run.spawnErr.message}`, "Mình chưa làm được việc này vì có sự cố kỹ thuật ở phía máy chủ. Người phụ trách sẽ xử lý, bạn không cần làm gì thêm.");

  // ── Không có commit mới ──
  if (!hasCommit) {
    if (declared && dirtyNew.length) {
      return fail("chua-luu", "Trợ lý khai đã xong nhưng thay đổi chưa được lưu lại nên không áp dụng.", "Mình đã chuẩn bị xong nhưng bản sửa chưa được lưu lại đúng cách nên chưa áp dụng. Người phụ trách sẽ xem lại.");
    }
    if (declared || status === "done") {
      shelveDirty("du", dirtyBefore);
      await report(id, "done", { note: run.declared?.note || fb?.adminNote || "Đã xử lý (không cần thay đổi hệ thống).", fields: { verifyResult: "skipped", expectedString: run.declared?.expected ?? undefined } });
      log(`✓ ${id}: hoàn thành, không có thay đổi mã.`);
      return 0;
    }
    if (status === "awaiting_user" || status === "rejected") {
      shelveDirty("du", dirtyBefore);
      await report(id, status, {}); // chỉ để ghi chi phí/phạm vi
      log(`${id}: agent đặt ${status}.`);
      return 0;
    }
    if (status === "reviewing" || status === "pending" || !status) {
      const why = run.timedOut ? "Trợ lý làm quá lâu nên bị dừng giữa chừng." : normalExit ? "Trợ lý kết thúc mà chưa ghi lại kết quả." : "Trợ lý gặp sự cố và bị ngắt giữa chừng.";
      return fail("ngat", `${why} Chưa có thay đổi nào được áp dụng.`, `${why} Chưa có thay đổi nào được áp dụng vào hệ thống. Bạn có thể nhắn lại ở đây để mình thử làm lại, hoặc bổ sung thêm chi tiết cho rõ hơn.`);
    }
    await report(id, status, {});
    return 0;
  }

  // ── Có commit mới: các điều kiện KHÔNG được giao ──
  if (!onBase || !ancestor) return fail("lech", "Trợ lý làm lệch khỏi nhánh gốc hoặc viết lại lịch sử nên không áp dụng.", "Bản sửa không được lưu đúng cách nên chưa áp dụng. Người phụ trách sẽ xem lại, bạn không cần làm gì thêm.");
  if (protectedHit.length) return fail("bimat", `NGHIÊM TRỌNG: bản sửa đụng tệp được bảo vệ (${protectedHit.join(", ")}) nên không áp dụng.`, "Bản sửa này liên quan đến phần được bảo vệ của hệ thống nên mình không tự áp dụng. Người phụ trách sẽ xem lại.");
  if (status === "awaiting_user" || status === "rejected") {
    // Agent tự quyết không giao (vd. hỏi lại sau khi đã commit dở): giữ mã, không áp dụng, giữ nguyên trạng thái agent đặt.
    shelveDirty("du", dirtyBefore);
    const br = preserve(id, "-wip", newSha);
    restoreBase(base, prev);
    await report(id, status, { note: `Mã viết dở được giữ ở nhánh ${br}.` });
    return 0;
  }
  if (!normalExit && !declared) {
    return fail("ngat", run.timedOut ? "Trợ lý làm quá lâu nên bị dừng giữa chừng, bản sửa chưa được áp dụng." : "Trợ lý bị ngắt giữa chừng, bản sửa chưa được áp dụng.", "Mình chưa làm xong và bị ngắt giữa chừng nên chưa áp dụng thay đổi nào vào hệ thống. Bạn có thể nhắn lại ở đây để mình thử lại.");
  }
  shelveDirty("du", dirtyBefore);
  fb = (await getFeedback(id).catch(() => null)) || fb;
  return deliver({ id, prev, base, newSha, fb, declared: run.declared });
}

async function deliver({ id, prev, base, newSha, fb, declared }) {
  const expected = fb?.expectedString || declared?.expected || null;
  const agentNote = declared?.note || fb?.adminNote || "";
  let level = "branch";
  try {
    const hb = await hubApi("POST", "/api/v1/machine/heartbeat");
    const hubLevel = hb.ok && hb.data?.deliver in RANK ? hb.data.deliver : "branch";
    // TRẦN CỤC BỘ: hub bị chiếm quyền cũng không bật được tự triển khai ở nơi không cho phép.
    level = RANK[hubLevel] <= RANK[cfg.maxDeliver] ? hubLevel : cfg.maxDeliver;
    if (hubLevel !== level) log(`Hub đặt deliver=${hubLevel} nhưng maxDeliver cục bộ=${cfg.maxDeliver} → giao theo "${level}".`);
  } catch (e) { log(`Không đọc được mức giao từ hub (${e.message}) → dùng "branch".`); }

  const reject = async (tag, note, message) => {
    const br = preserve(id, tag, newSha);
    restoreBase(base, prev);
    await report(id, "awaiting_user", { note: `${note} Mã được giữ ở nhánh ${br}.`, message: { body: message } });
    return 0;
  };

  // Cổng dựng thử: không tin suông lời agent "build xanh".
  if (cfg.build) {
    const b = await runCmd(cfg.build, { timeoutSec: cfg.buildTimeoutSec, label: "dựng thử" });
    if (b.code !== 0) {
      log(`✗ ${id}: dựng thử THẤT BẠI.`);
      return reject("-loi-dung", `Dựng thử thất bại${b.timedOut ? " (quá hạn)" : ""}: ${b.tail.replace(/\s+/g, " ").slice(-220)}`.slice(0, 380), "Mình đã viết xong phần sửa nhưng khi kiểm tra kỹ thuật thì chưa đạt nên không áp dụng vào hệ thống. Người phụ trách sẽ xem lại, bạn không cần làm gì thêm.");
    }
  }

  // ── Giao qua nhánh chờ duyệt ──
  if (level === "branch") {
    const verify = await verifyClaim(expected, { allowCmd: false });
    if (verify === "fail") {
      log(`✗ ${id}: kiểm chứng THẤT BẠI (nhánh).`);
      const br = preserve(id, "", newSha);
      restoreBase(base, prev);
      await report(id, "awaiting_user", {
        note: `Hệ thống KHÔNG tìm thấy thay đổi mà trợ lý báo là đã làm. Mã được giữ ở nhánh ${br}.`,
        message: { body: "Đã kiểm tra lại bản vừa dựng và KHÔNG thấy thay đổi như trợ lý báo cáo. Yêu cầu được mở lại, chưa coi là hoàn thành." },
        fields: { verifyResult: "fail", expectedString: expected ?? undefined },
      });
      return 0;
    }
    const br = preserve(id, "", newSha);
    restoreBase(base, prev);
    const ok = await report(id, "done", {
      note: `Chờ duyệt nhánh ${br}. ${agentNote}`,
      message: { body: "Bản sửa đã làm xong và đang chờ người phụ trách duyệt trước khi áp dụng lên hệ thống. Bạn sẽ được báo khi thay đổi thật sự lên." },
      fields: { codeDoneAt: new Date().toISOString(), verifyResult: verify, ...(expected ? { expectedString: expected } : {}) },
    });
    log(`✓ ${id}: xong, chờ duyệt nhánh ${br}${ok ? "" : " (NHƯNG báo hub thất bại)"}.`);
    return 0;
  }

  // ── Giao qua triển khai thật ──
  // AI viết xong code nhưng lúc đó thay đổi CHƯA lên hệ thống: đánh dấu 'deploying' để người gửi thấy đúng việc đang diễn ra.
  await report(id, "deploying", {
    message: { kind: "system", body: "Đang sao lưu dữ liệu trước khi cập nhật…" },
    fields: { codeDoneAt: new Date().toISOString(), ...(expected ? { expectedString: expected } : {}) },
  });
  if (cfg.backup) {
    const b = await runCmd(cfg.backup, { timeoutSec: cfg.backupTimeoutSec, label: "sao lưu" });
    if (b.code !== 0) {
      log(`LỖI ${id}: sao lưu thất bại → KHÔNG triển khai. Giữ nguyên hệ thống đang chạy.`);
      return reject("-khong-sao-luu", "Sao lưu dữ liệu thất bại nên đã dừng, hệ thống giữ nguyên.", "Mình đã làm xong nhưng bước sao lưu an toàn trước khi cập nhật gặp sự cố nên chưa áp dụng gì cả; hệ thống vẫn như cũ. Người phụ trách sẽ xử lý.");
    }
    log("Đã sao lưu.");
  } else log("CẢNH BÁO: cấu hình không có lệnh sao lưu — triển khai KHÔNG có sao lưu trước.");
  await say(id, "Đã sao lưu xong. Đang dựng lại hệ thống…", "system");

  if (await deployAndCheck(id)) {
    log(`✓ ${id}: TRIỂN KHAI THÀNH CÔNG.`);
    const verify = await verifyClaim(expected, { allowCmd: true });
    if (verify === "fail") {
      log(`✗ ${id}: kiểm chứng THẤT BẠI sau triển khai.`);
      await report(id, "awaiting_user", {
        note: "Hệ thống KHÔNG tìm thấy thay đổi mà trợ lý báo là đã làm. Yêu cầu được mở lại để kiểm tra.",
        message: { kind: "system", body: "Đã kiểm tra lại trên hệ thống thật và KHÔNG thấy thay đổi như trợ lý báo cáo. Yêu cầu được mở lại, chưa coi là hoàn thành." },
        fields: { verifyResult: "fail" },
      });
      return 0;
    }
    await say(id, "Thay đổi đã được cập nhật lên hệ thống. Bạn tải lại trang bằng Ctrl+Shift+R (hoặc Cmd+Shift+R trên máy Mac) để nhìn thấy kết quả.");
    await report(id, "done", { note: agentNote || "Đã cập nhật lên hệ thống.", fields: { verifyResult: verify } });
    return 0;
  }

  // ── Hỏng → quay lui. KHÔNG tự khôi phục dữ liệu từ bản sao lưu: việc đó xoá thao tác người dùng, để người quyết định. ──
  log(`✗ ${id}: TRIỂN KHAI HỎNG — quay về ${prev} và dựng lại.`);
  preserve(id, "-loi-trien-khai", newSha);
  git(["reset", "--hard", prev]);
  let note;
  if (await deployAndCheck(id)) {
    log("✓ Đã quay về bản cũ, hệ thống chạy lại bình thường.");
    note = `Bản cải tiến làm hệ thống không phản hồi nên đã tự quay về commit ${prev}. Cần người kiểm tra.`;
  } else {
    log("✗✗ NGHIÊM TRỌNG: quay về bản cũ vẫn không lên. CẦN NGƯỜI XỬ LÝ NGAY.");
    note = "NGHIÊM TRỌNG: triển khai hỏng và quay lui cũng không cứu được. Cần xử lý thủ công ngay.";
  }
  await report(id, "awaiting_user", {
    note,
    message: { body: "Bản cập nhật gặp sự cố nên hệ thống đã được đưa về trạng thái trước đó; thay đổi của bạn chưa được áp dụng. Người phụ trách sẽ kiểm tra." },
    fields: { rolledBack: true },
  });
  return 1;
}

// ── main ────────────────────────────────────────────────────────────────────────────────────
let code = 0;
if (!acquireLock()) process.exit(0);
try {
  code = await runOnce();
} catch (e) {
  if (e instanceof HubDown) warnOnce("hub", e.message);
  else log(`NGOẠI LỆ: ${e.stack || e}`);
  code = e instanceof HubDown ? 0 : 1;
} finally {
  releaseLock();
}
process.exit(code);
