#!/usr/bin/env node
/**
 * "Agent giả" cho worker/test.mjs — KHÔNG phải Claude. Mô phỏng một agent làm việc đúng quy trình qua hub-cli:
 * đọc góp ý, ghi tiến độ, sửa một tệp, commit, khai kết quả. Hành vi chọn bằng tệp $TEST_DIR/fake-mode.
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const T = process.env.TEST_DIR;
const id = process.env.HUB_FEEDBACK_ID;
const CLI = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hub-cli.mjs");
const mode = fs.readFileSync(path.join(T, "fake-mode"), "utf8").trim();
const cli = (...a) => spawnSync(process.execPath, [CLI, ...a], { env: process.env, encoding: "utf8" });
const git = (...a) => spawnSync("git", a, { cwd: process.cwd(), encoding: "utf8" });

const prompt = fs.existsSync(process.env.HUB_PROMPT_FILE || "") ? fs.readFileSync(process.env.HUB_PROMPT_FILE, "utf8") : "";
fs.appendFileSync(
  path.join(T, "agent-runs.log"),
  JSON.stringify({ id, mode, argv: process.argv.slice(2), cwd: process.cwd(), hasGlmToken: !!process.env.GLM_TOKEN, hubKeySet: !!process.env.HUB_KEY, promptHasId: prompt.includes(id) }) + "\n",
);

const got = cli("get", id);
if (got.status !== 0) { console.error(got.stderr); process.exit(2); }

if (mode === "hang") {
  cli("msg", id, "--kind", "progress", "Đang làm…");
  fs.writeFileSync(path.join(process.cwd(), "src/title.txt"), "ĐANG VIẾT DỞ\n"); // thay đổi chưa commit
  const gc = spawn("sleep", ["120"], { stdio: "ignore" }); // tiến trình cháu — phải bị cắt cùng nhóm
  fs.writeFileSync(path.join(T, "grandchild.pid"), String(gc.pid));
  fs.writeFileSync(path.join(T, "hang-started"), "1");
  setInterval(() => {}, 1000);
} else if (mode === "ask") {
  cli("transition", id, "awaiting_user", "--note", "Cần hỏi lại", "--message", "Bạn muốn đổi thành chữ gì cụ thể?");
  console.log(JSON.stringify({ result: "đã hỏi lại", total_cost_usd: 0.05 }));
} else if (mode === "silent") {
  console.log(JSON.stringify({ result: "không làm gì", total_cost_usd: 0.01 }));
} else {
  cli("msg", id, "--kind", "progress", "Đã hiểu: đổi tiêu đề ở Trang chủ.");
  const newTitle = `Tiêu đề mới ${id}`;
  fs.writeFileSync(path.join(process.cwd(), "src/title.txt"), newTitle + "\n");
  git("add", "src/title.txt");
  if (mode === "outside") {
    fs.mkdirSync(path.join(process.cwd(), "secret"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), "secret/notes.txt"), "ngoài phạm vi\n");
    git("add", "secret/notes.txt");
  }
  const c = git("commit", "-m", `feat: đổi tiêu đề (refs feedback-hub #${id})`);
  if (c.status !== 0) { console.error(c.stderr); process.exit(3); }
  cli("msg", id, "--kind", "chat", "Đã đổi tiêu đề ở Trang chủ.");
  const expected = mode === "wrongexpected" ? "Chuỗi này không hề tồn tại 987654" : newTitle;
  const t = cli("transition", id, "done", "--note", "Đã đổi tiêu đề Trang chủ", "--expected", expected);
  if (t.status !== 0) { console.error(t.stderr); process.exit(4); }
  console.log(JSON.stringify({ result: "Đã đổi tiêu đề.", total_cost_usd: 0.25 }));
}
