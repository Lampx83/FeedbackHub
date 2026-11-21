#!/usr/bin/env node
/**
 * Nhập góp ý cũ của DGXL vào một dự án trên hub. Giữ nguyên id (chạy lại không nhân đôi), KHÔNG xoá gì ở DGXL.
 *
 *   1. Trên máy chủ DGXL:  docker exec -i dgxl-db psql -U dgxl -d dgxl -At -f - < scripts/dgxl-export.sql > dgxl-export.json
 *   2. (nếu muốn kèm tệp) sao thư mục tệp đính kèm của DGXL (DGXL_UPLOAD_DIR) về máy:  rsync -a <server>:<dir>/ ./dgxl-uploads/
 *   3. HUB_URL=https://… HUB_OPERATOR_KEY=fhk_o_… node scripts/migrate-from-dgxl.mjs dgxl-export.json \
 *        [--project dgxl] [--uploads ./dgxl-uploads] [--dry-run]
 *
 * Ánh xạ: type cũ add|change|edit|bug|other|qa → kind function|function|content|bug|other|question (giữ nguyên `type`);
 * detail→body; submittedByUserId→reporterId; submittedByName→reporterName; vai tin nhắn ba→user.
 * Mặc định là chạy thử khô khi thiếu khoá; --dry-run chỉ đếm và in mẫu, không gọi hub.
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: opt, positionals } = parseArgs({
  allowPositionals: true,
  options: { project: { type: "string", default: "dgxl" }, uploads: { type: "string" }, "dry-run": { type: "boolean" } },
});
if (!positionals[0]) {
  console.error("Dùng: HUB_URL=… HUB_OPERATOR_KEY=… node scripts/migrate-from-dgxl.mjs <dgxl-export.json> [--project dgxl] [--uploads <thư mục>] [--dry-run]");
  process.exit(1);
}
const hub = (process.env.HUB_URL || "").replace(/\/$/, "");
const key = process.env.HUB_OPERATOR_KEY || "";
const dry = opt["dry-run"] || !hub || !key;
const rows = JSON.parse(fs.readFileSync(positionals[0], "utf8"));
if (!Array.isArray(rows)) throw new Error("Tệp xuất phải là một mảng JSON");

const KIND = { add: "function", change: "function", edit: "content", bug: "bug", other: "other", qa: "question" };
const STATUS_OK = new Set(["pending", "reviewing", "deploying", "awaiting_user", "done", "rejected"]);
const ROLE = { ba: "user", user: "user", ai: "ai", admin: "admin", system: "system" };
const iso = (v) => (v ? new Date(v).toISOString() : null);
const cut = (s, n) => (s == null ? null : String(s).slice(0, n));

function toItem(r) {
  return {
    id: r.id,
    kind: KIND[r.type] ?? "other",
    type: cut(r.type, 40),
    title: cut(r.title, 200) || "(không tiêu đề)",
    body: cut(r.detail, 20000),
    status: STATUS_OK.has(r.status) ? r.status : "pending",
    reporterId: cut(r.submittedByUserId, 200),
    reporterName: cut(r.submittedByName, 120) || "?",
    adminNote: cut(r.adminNote, 500),
    pagePath: cut(r.pagePath, 200),
    scope: r.scope === "system" ? "system" : "page",
    pageTarget: cut(r.pageTarget, 500),
    source: cut(r.source, 20) || "import",
    refDensity: r.refDensity ?? 0,
    clarifyRounds: r.clarifyRounds ?? 0,
    pickedAt: iso(r.pickedAt), codeDoneAt: iso(r.codeDoneAt), liveAt: iso(r.liveAt),
    agentRuns: r.agentRuns ?? 0, costUsd: r.costUsd ?? 0, rolledBack: !!r.rolledBack,
    successCriteria: r.successCriteria ?? null, expectedString: r.expectedString ?? null,
    verifyResult: r.verifyResult ?? null, verifiedAt: iso(r.verifiedAt), scopeViolation: r.scopeViolation ?? null,
    userVerdict: r.userVerdict ?? null, userVerdictAt: iso(r.userVerdictAt), planApproval: r.planApproval ?? null,
    aiProvider: r.aiProvider ?? null, aiModel: r.aiModel ?? null, votes: r.votes ?? 1,
    createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
    messages: (r.messages || []).map((m) => ({
      role: ROLE[m.role] ?? "user", kind: ["chat", "progress", "system"].includes(m.kind) ? m.kind : "chat",
      authorName: m.authorName ?? null, body: cut(m.body, 20000) ?? "", createdAt: iso(m.createdAt),
    })),
    events: (r.events || []).map((e) => ({
      kind: cut(e.kind, 30), fromStatus: e.fromStatus ?? null, toStatus: e.toStatus ?? null,
      actor: cut(e.actor, 20) || "unknown", createdAt: iso(e.createdAt),
    })),
  };
}

const items = rows.map(toItem);
const byType = {};
for (const it of items) byType[it.type] = (byType[it.type] || 0) + 1;
const nAtt = rows.reduce((n, r) => n + (r.attachments?.length || 0), 0);
console.log(`Đọc ${items.length} góp ý, ${nAtt} tệp đính kèm. Theo loại: ${JSON.stringify(byType)}`);
if (dry) {
  console.log(!hub || !key ? "Thiếu HUB_URL/HUB_OPERATOR_KEY → chỉ chạy thử khô." : "--dry-run: không gọi hub.");
  if (items[0]) console.log("Mẫu đầu tiên:", JSON.stringify({ ...items[0], messages: items[0].messages.length, events: items[0].events.length }));
  process.exit(0);
}

async function api(method, p, body, isForm) {
  const res = await fetch(`${hub}${p}`, { method, headers: { Authorization: `Bearer ${key}`, ...(body && !isForm ? { "Content-Type": "application/json" } : {}) }, body: isForm ? body : body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${p} → ${res.status} ${data.error ?? ""}`);
  return data;
}

let created = 0, skipped = 0;
for (let i = 0; i < items.length; i += 50) {
  const r = await api("POST", `/api/v1/machine/import?project=${encodeURIComponent(opt.project)}`, { items: items.slice(i, i + 50) });
  created += r.created; skipped += r.skipped;
  console.log(`  lô ${i / 50 + 1}: +${r.created}, bỏ qua ${r.skipped}`);
}
console.log(`Nhập xong: tạo ${created}, đã có sẵn ${skipped}.`);

if (opt.uploads) {
  const root = path.resolve(opt.uploads);
  let up = 0, miss = 0, dup = 0;
  for (const r of rows) {
    if (!r.attachments?.length) continue;
    const have = new Set(((await api("GET", `/api/v1/machine/feedback/${encodeURIComponent(r.id)}?project=${encodeURIComponent(opt.project)}`)).feedback?.attachments || []).map((a) => a.fileName));
    for (const a of r.attachments) {
      if (have.has(a.fileName)) { dup++; continue; }
      const file = path.resolve(root, a.storageKey);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { miss++; console.warn(`  thiếu tệp: ${a.storageKey}`); continue; }
      const form = new FormData();
      form.append("file", new Blob([fs.readFileSync(file)], { type: a.mimeType }), a.fileName);
      try { await api("POST", `/api/v1/machine/feedback/${encodeURIComponent(r.id)}/attachments?project=${encodeURIComponent(opt.project)}`, form, true); up++; }
      catch (e) { miss++; console.warn(`  lỗi tải ${a.fileName}: ${e.message}`); }
    }
  }
  console.log(`Tệp đính kèm: tải ${up}, đã có ${dup}, thiếu/lỗi ${miss}.`);
}
