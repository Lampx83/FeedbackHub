#!/usr/bin/env node
/**
 * Kiểm thử bộ sinh mã nhúng (src/lib/embed-snippets.ts): chạy `npm run test:embed`, không cần hub đang chạy.
 * Biên dịch TS bằng chính `typescript` của dự án rồi nạp thử, nên bắt được cả lỗi cú pháp trong mã SINH RA.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const src = fs.readFileSync("src/lib/embed-snippets.ts", "utf8");
const out = ts.transpileModule(src, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const tmp = path.join(os.tmpdir(), `embed-snippets-${process.pid}.mjs`);
fs.writeFileSync(tmp, out);
const E = await import(tmp);
fs.unlinkSync(tmp);
const widget = fs.readFileSync("public/widget.js", "utf8");

let passed = 0;
const failures = [];
const ok = (c, name) => { if (c) passed++; else failures.push(name); console.log(`${c ? "✓" : "✗"} ${name}`); };
const base = { ...E.DEFAULT_OPTS, slug: "demo", hub: "https://hub.example.com" };
const syntaxOk = (code, kind = ts.ScriptKind.TSX) => {
  const r = ts.transpileModule(code, { reportDiagnostics: true, fileName: kind === ts.ScriptKind.TSX ? "x.tsx" : "x.ts", compilerOptions: { jsx: ts.JsxEmit.Preserve, module: ts.ModuleKind.ESNext } });
  return (r.diagnostics ?? []).length === 0;
};

// mặc định: ngắn gọn, chỉ project + token-url
const d = E.scriptSnippet(base);
ok(d.includes('data-project="demo"') && d.includes('data-token-url="/api/feedback-token"') && !d.includes("data-position") && !d.includes("data-offset") && !d.includes("data-locale"), "mặc định chỉ in thuộc tính cần thiết");
ok(d.startsWith('<script src="https://hub.example.com/widget.js"') && d.endsWith("defer></script>"), "thẻ script đúng nguồn và có defer");

// nút nổi có tuỳ chọn
const f = E.scriptSnippet({ ...base, position: "bottom-left", offsetX: 24, offsetY: 90, label: 'Góp ý "nhanh"', icon: "chat", locale: "en", colorScheme: "light", mask: ".diem, #email" });
ok(f.includes('data-position="bottom-left"') && f.includes('data-offset-x="24"') && f.includes('data-offset-y="90"') && f.includes('data-icon="chat"') && f.includes('data-locale="en"') && f.includes('data-color-scheme="light"'), "nút nổi: vị trí, lệch, biểu tượng, ngôn ngữ, màu");
ok(f.includes('data-label="Góp ý &quot;nhanh&quot;"') && f.includes('data-mask=".diem, #email"'), "thoát dấu nháy trong thuộc tính HTML; có data-mask");

// kiểu mở khác: không in tuỳ chọn của nút nổi
const t = E.scriptSnippet({ ...base, open: "trigger", position: "top-left", offsetX: 50, label: "x" });
ok(t.includes('data-trigger="[data-feedbackhub-open]"') && !t.includes("data-position") && !t.includes("data-label") && !t.includes("data-offset"), "kiểu trigger bỏ tuỳ chọn nút nổi");
ok(E.companionHtml({ ...base, open: "trigger" })?.code.includes("data-feedbackhub-open"), "gợi ý nút HTML kèm theo");
ok(t.includes('data-fab="false"'), "kiểu trigger tắt nút nổi");
const L = E.scriptSnippet({ ...base, open: "launcher", position: "top-left" });
ok(L.includes('data-fab="false"') && !L.includes("data-position") && !L.includes("data-trigger"), "kiểu nút đặt trong trang: tắt nút nổi, bỏ tuỳ chọn nút nổi");
ok(E.companionHtml({ ...base, open: "launcher" })?.code === "<span data-feedbackhub-launcher hidden></span>", "gợi ý phần tử đặt nút trong trang");
ok(widget.includes("[data-feedbackhub-launcher]"), "widget.js tìm đúng thuộc tính data-feedbackhub-launcher");
const Li = E.initSnippet({ ...base, open: "launcher" });
ok(Li.includes("fab: false,") && !Li.includes('fab: "false"'), "dạng init(): fab là boolean false, không phải chuỗi");
ok(E.scriptSnippet({ ...base, open: "mount" }).includes('data-mount="#feedback-panel"') && E.companionHtml({ ...base, open: "mount" })?.code === '<div id="feedback-panel"></div>', "kiểu mount + phần tử vùng nhúng");
ok(E.companionHtml(base) === null, "nút nổi không cần phần tử kèm theo");

// ẩn danh
ok(!E.scriptSnippet({ ...base, auth: "anonymous" }).includes("token-url"), "ẩn danh: không có data-token-url");

// ngữ cảnh → init()
const c = E.scriptSnippet({ ...base, context: true, open: "trigger", locale: "en" });
ok(c.includes("FeedbackHub.init(") && c.includes("getContext") && c.includes('tokenUrl: "/api/feedback-token"') && c.includes('trigger: "[data-feedbackhub-open]"') && c.includes('locale: "en"'), "bật ngữ cảnh → dạng init() có getContext");
const inline = c.split("<script>")[1].split("</script>")[0];
let parses = true; try { new Function(inline); } catch { parses = false; }
ok(parses, "đoạn JavaScript sinh ra không lỗi cú pháp");

// mọi data-* sinh ra phải là thuộc tính widget thật sự đọc
const camel = (s) => s.replace(/-([a-z])/g, (_, x) => x.toUpperCase());
const all = E.scriptSnippet({ ...base, position: "top-right", offsetX: 1, offsetY: 2, label: "a", icon: "flag", locale: "en", colorScheme: "dark", mask: "b" })
  + E.scriptSnippet({ ...base, open: "trigger" }) + E.scriptSnippet({ ...base, open: "mount" });
const attrs = [...new Set([...all.matchAll(/data-([a-z-]+)=/g)].map((m) => camel(m[1])))];
const unknown = attrs.filter((a) => !new RegExp(`d\\.${a}\\b`).test(widget));
ok(unknown.length === 0, `mọi data-* sinh ra đều được widget.js đọc${unknown.length ? " — thiếu: " + unknown.join(", ") : ""}`);

// bộ Next.js
const k = E.nextKit({ ...base, open: "trigger", context: true });
ok(k.env.includes("FEEDBACK_HUB_SECRET") && k.route.includes('prj: "demo"') && k.route.includes("createHmac"), "Next.js: env + điểm cuối token đúng dự án");
ok(syntaxOk(k.route, ts.ScriptKind.TS) && syntaxOk(k.comp.split("// app/layout.tsx")[0]), "Next.js: route và component không lỗi cú pháp");
ok(k.comp.includes('src="https://hub.example.com/widget.js"') && k.comp.includes("getContext") && k.comp.includes('trigger: "[data-feedbackhub-open]"'), "Next.js: component dùng đúng tuỳ chọn");
const ka = E.nextKit({ ...base, auth: "anonymous" });
ok(ka.route === null && ka.env === null && !ka.comp.includes("tokenUrl"), "Next.js ẩn danh: không sinh điểm cuối token");

// giới hạn
ok(E.scriptSnippet({ ...base, offsetX: 999, offsetY: -5 }).includes('data-offset-x="200"') && E.scriptSnippet({ ...base, offsetX: 999, offsetY: -5 }).includes('data-offset-y="0"'), "độ lệch bị kẹp trong 0–200");

console.log(`\n${passed} đạt, ${failures.length} lỗi`);
process.exit(failures.length ? 1 : 0);
