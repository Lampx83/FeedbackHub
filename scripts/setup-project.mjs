#!/usr/bin/env node
/**
 * Tạo (hoặc cập nhật) một dự án trên hub từ tệp JSON — để cấu hình lặp lại được, không phải bấm tay.
 *
 *   HUB_URL=https://feedback.example.com HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… \
 *   node scripts/setup-project.mjs <project.json> [--print-secret] [--worker-key "nhãn"]
 *
 * project.json: { "slug", "name", "allowedOrigins", "adminRoles", "submitRoles", "anonymousSubmit", "mode", "deliver",
 *                 "types", "features", "theme", "webhookUrl" }  (cùng trường như PATCH /api/admin/projects/<slug>).
 * Dự án chưa có thì tạo (kèm khoá ký); đã có thì chỉ cập nhật các trường trong tệp. Khoá ký chỉ in khi có
 * --print-secret; khoá worker chỉ hiện đúng MỘT LẦN ngay khi cấp (--worker-key). Không bao giờ ghi bí mật ra tệp.
 */
import fs from "node:fs";
import { parseArgs } from "node:util";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { "print-secret": { type: "boolean" }, "worker-key": { type: "string" } },
});
const hub = (process.env.HUB_URL || "").replace(/\/$/, "");
const email = process.env.HUB_ADMIN_EMAIL, password = process.env.HUB_ADMIN_PASSWORD;
if (!hub || !email || !password || !positionals[0]) {
  console.error("Dùng: HUB_URL=… HUB_ADMIN_EMAIL=… HUB_ADMIN_PASSWORD=… node scripts/setup-project.mjs <project.json> [--print-secret] [--worker-key nhãn]");
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(positionals[0], "utf8"));
if (!cfg.slug || !cfg.name) { console.error('project.json cần "slug" và "name".'); process.exit(1); }

let cookie = "";
async function api(method, path, body) {
  const res = await fetch(hub + path, {
    method,
    headers: { ...(body ? { "Content-Type": "application/json" } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${data.error ?? ""}`);
  return data;
}

await api("POST", "/api/admin/login", { email, password });
const { slug, name, allowedOrigins, submitRoles, adminRoles, ...rest } = cfg;
const list = await api("GET", "/api/admin/projects");
let created = false;
if (!list.projects.some((p) => p.slug === slug)) {
  await api("POST", "/api/admin/projects", { slug, name, allowedOrigins: allowedOrigins ?? [], submitRoles: submitRoles ?? [], adminRoles: adminRoles ?? [] });
  created = true;
}
const patch = { name, ...(allowedOrigins ? { allowedOrigins } : {}), ...(submitRoles ? { submitRoles } : {}), ...(adminRoles ? { adminRoles } : {}), ...rest };
const r = await api("PATCH", `/api/admin/projects/${encodeURIComponent(slug)}`, patch);
console.log(`${created ? "Đã tạo" : "Đã cập nhật"} dự án "${slug}".`);
for (const w of r.warnings ?? []) console.log(`  ⚠ ${w}`);
if (opt["print-secret"]) console.log(`Khoá ký token (đặt vào FEEDBACK_HUB_SECRET của ứng dụng): ${(await api("GET", `/api/admin/projects/${slug}/secret`)).signingSecret}`);
if (opt["worker-key"]) console.log(`Khoá worker (chỉ hiện lần này): ${(await api("POST", `/api/admin/projects/${slug}/keys`, { label: opt["worker-key"] })).key}`);
