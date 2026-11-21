/**
 * Bộ sinh mã nhúng widget cho tab "Nhúng" của bảng điều khiển. Thuần hàm (không đụng DOM/React) để kiểm thử được
 * (scripts/test-embed-snippets.mjs). Chỉ in ra thuộc tính khác mặc định của widget, để mã ngắn và dễ đọc.
 */

export type OpenMode = "fab" | "launcher" | "trigger" | "mount";
export type EmbedOpts = {
  slug: string;
  hub: string;
  /**
   * fab = nút nổi; launcher = nút do widget vẽ vào chỗ ứng dụng đặt sẵn (vd. header); trigger = mở từ nút/menu có sẵn của
   * ứng dụng; mount = nhúng bảng góp ý vào một vùng của trang.
   */
  open: OpenMode;
  trigger: string;
  mount: string;
  /** "" = theo cấu hình dự án (tab Giao diện). */
  position: "" | "bottom-right" | "bottom-left" | "top-right" | "top-left";
  offsetX: number;
  offsetY: number;
  label: string;
  /** "" = theo cấu hình dự án. */
  icon: "" | "lightbulb" | "chat" | "pencil" | "flag" | "plus";
  locale: "vi" | "en";
  colorScheme: "auto" | "light" | "dark";
  /** token = người đã đăng nhập gửi kèm danh tính; anonymous = khách vãng lai (dự án phải bật gửi ẩn danh). */
  auth: "token" | "anonymous";
  tokenUrl: string;
  /** Bộ chọn CSS các vùng che trong ảnh chụp trang (cộng với [data-feedbackhub-mask]). */
  mask: string;
  /** Ứng dụng gửi kèm ngữ cảnh (contentRef/extra) qua getContext → cần dạng init() bằng JavaScript. */
  context: boolean;
};

export const DEFAULT_TRIGGER = "[data-feedbackhub-open]";

export const DEFAULT_OPTS: Omit<EmbedOpts, "slug" | "hub"> = {
  open: "fab",
  trigger: DEFAULT_TRIGGER,
  mount: "#feedback-panel",
  position: "",
  offsetX: 20,
  offsetY: 20,
  label: "",
  icon: "",
  locale: "vi",
  colorScheme: "auto",
  auth: "token",
  tokenUrl: "/api/feedback-token",
  mask: "",
  context: false,
};

/** Cặp [tên tuỳ chọn init(), giá trị] khác mặc định, theo thứ tự đọc dễ hiểu. */
function pairs(o: EmbedOpts): [string, string | number | boolean][] {
  const p: [string, string | number | boolean][] = [["project", o.slug]];
  if (o.auth === "token" && o.tokenUrl.trim()) p.push(["tokenUrl", o.tokenUrl.trim()]);
  if (o.open === "trigger" && o.trigger.trim()) p.push(["trigger", o.trigger.trim()]);
  // Hai kiểu mở này thay cho nút nổi → tắt nút nổi (widget mặc định vẽ nó).
  if (o.open === "trigger" || o.open === "launcher") p.push(["fab", false]);
  if (o.open === "mount" && o.mount.trim()) p.push(["mount", o.mount.trim()]);
  if (o.open === "fab") {
    if (o.position) p.push(["position", o.position]);
    if (o.offsetX !== 20) p.push(["offsetX", clamp(o.offsetX)]);
    if (o.offsetY !== 20) p.push(["offsetY", clamp(o.offsetY)]);
    if (o.label.trim()) p.push(["label", o.label.trim()]);
    if (o.icon) p.push(["icon", o.icon]);
  }
  if (o.locale !== "vi") p.push(["locale", o.locale]);
  if (o.colorScheme !== "auto") p.push(["colorScheme", o.colorScheme]);
  if (o.mask.trim()) p.push(["mask", o.mask.trim()]);
  return p;
}

const clamp = (n: number) => Math.max(0, Math.min(200, Math.round(Number.isFinite(n) ? n : 20)));
const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const jsStr = (s: string) => JSON.stringify(s);

/** Thẻ <script> dùng thuộc tính data-* (không cần JavaScript). Khi `context` bật thì chuyển sang dạng init(). */
export function scriptSnippet(o: EmbedOpts): string {
  if (o.context) return initSnippet(o);
  const attrs = pairs(o).map(([k, v]) => `  data-${kebab(k)}="${esc(String(v))}"`);
  return `<script src="${o.hub}/widget.js"\n${attrs.join("\n")}\n  defer></script>`;
}

/** Dạng init() bằng JavaScript — cần khi muốn gửi kèm ngữ cảnh nội dung (getContext). */
export function initSnippet(o: EmbedOpts): string {
  const lines = pairs(o).map(([k, v]) => `      ${k}: ${typeof v === "string" ? jsStr(v) : v},`);
  return `<script src="${o.hub}/widget.js" defer></script>
<script>
  window.addEventListener("load", function () {
    FeedbackHub.init({
${lines.join("\n")}
      // Cho biết trang đang hiển thị bản ghi nào — góp ý sẽ ghi rõ "về dữ liệu nào" để tìm đúng chỗ sửa.
      getContext: function () {
        return {
          contentRef: "lesson:" + window.currentLessonId, // ví dụ: "<loại>:<mã bản ghi>"
          extra: { course: window.currentCourseSlug },    // tuỳ ý, người/AI xử lý đọc được
        };
      },
    });
  });
</script>`;
}

/** Gợi ý phần tử HTML đi kèm theo kiểu mở (nút của ứng dụng / vùng nhúng). */
export function companionHtml(o: EmbedOpts): { label: string; code: string } | null {
  if (o.open === "trigger") {
    const sel = o.trigger.trim();
    if (sel === DEFAULT_TRIGGER) return { label: "Nút của ứng dụng — bấm vào là mở góp ý (thêm thuộc tính này vào bất kỳ nút/mục menu nào)", code: `<button type="button" data-feedbackhub-open>Góp ý</button>` };
    return { label: "Bấm vào phần tử khớp bộ chọn dưới đây sẽ mở góp ý", code: `/* ${sel} */` };
  }
  if (o.open === "launcher")
    return {
      label: "Đặt phần tử này ở chỗ muốn có nút (vd. cạnh chuông thông báo trên header) — widget tự vẽ nút cùng màu chữ của chỗ đó và chỉ hiện khi người dùng gửi được góp ý. Thêm =\"label\" để có chữ cạnh biểu tượng",
      code: `<span data-feedbackhub-launcher hidden></span>`,
    };
  if (o.open === "mount") return { label: "Vùng nhúng — bảng góp ý hiện ngay trong trang thay vì ngăn kéo", code: `<div id="${o.mount.trim().replace(/^#/, "")}"></div>` };
  return null;
}

/** Bộ ba tệp cho Next.js (App Router): biến môi trường, điểm cuối token, component. */
export function nextKit(o: EmbedOpts) {
  const anon = o.auth === "anonymous";
  const env = `# .env (máy chủ) — khoá ký lấy ở mục "Khoá ký token" phía trên
FEEDBACK_HUB_SECRET=<khoá ký token>`;
  const route = `// app/api/feedback-token/route.ts — cấp token cho người đã đăng nhập (chạy ở MÁY CHỦ)
import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
// ĐỔI cho đúng ứng dụng của bạn: trả { id, name, email?, isAdmin } của người đang đăng nhập, hoặc null.
import { getCurrentUser } from "@/lib/current-user";

export const dynamic = "force-dynamic";
const b64 = (v: string | Buffer) => Buffer.from(v).toString("base64url");

export async function GET() {
  const secret = process.env.FEEDBACK_HUB_SECRET;
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const iat = Math.floor(Date.now() / 1000);
  const head = b64(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64(JSON.stringify({
    prj: ${jsStr(o.slug)}, aud: "feedback-hub", iat, exp: iat + 600,
    uid: String(user.id), name: user.name, email: user.email,
    role: user.isAdmin ? "ADMIN" : "USER", // ADMIN thấy mọi góp ý của dự án; USER chỉ thấy của mình
  }));
  const sig = createHmac("sha256", secret).update(\`\${head}.\${body}\`).digest("base64url");
  return NextResponse.json({ token: \`\${head}.\${body}.\${sig}\` }, { headers: { "Cache-Control": "no-store" } });
}`;
  const initPairs = pairs(o).filter(([k]) => k !== "project");
  const initLines = initPairs.map(([k, v]) => `          ${k}: ${typeof v === "string" ? jsStr(v) : v},`).join("\n");
  const comp = `// components/FeedbackHub.tsx
"use client";
import Script from "next/script";

export default function FeedbackHub() {
  return (
    <Script
      src="${o.hub}/widget.js"
      strategy="afterInteractive"
      onReady={() => {
        (window as any).FeedbackHub?.init({
          project: ${jsStr(o.slug)},
${initLines}${o.context ? `
          // Trang đang hiển thị bản ghi nào — góp ý ghi rõ "về dữ liệu nào" để tìm đúng chỗ sửa.
          getContext: () => ({
            contentRef: \`lesson:\${(window as any).currentLessonId}\`, // ví dụ: "<loại>:<mã bản ghi>"
            extra: { course: (window as any).currentCourseSlug },
          }),` : ""}
        });
      }}
    />
  );
}

// app/layout.tsx — chỉ thêm 1 dòng trong <body>${anon ? "" : " (và chỉ render khi đã đăng nhập, vì dự án này gửi kèm danh tính)"}:
//   <FeedbackHub />`;
  return { env: anon ? null : env, route: anon ? null : route, comp };
}
