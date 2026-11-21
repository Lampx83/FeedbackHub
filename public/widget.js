/*!
 * Feedback Hub — widget góp ý nhúng (JavaScript thuần, không phụ thuộc, vẽ trong Shadow DOM).
 *
 *   <script src="https://HUB/widget.js" data-project="slug" data-token-url="/api/feedback-token" defer></script>
 *
 * Thuộc tính data-*: project (bắt buộc), hub, token-url, position, color-scheme, label, icon, locale,
 * offset-x, offset-y, trigger, fab="false", mount.
 * Lối vào không cần viết mã: đặt <span data-feedbackhub-launcher hidden></span> ở chỗ muốn có nút (vd. thanh header —
 * widget vẽ nút và bỏ `hidden` khi sẵn sàng); bong bóng "Góp ý đoạn này" khi bôi đen chữ và danh sách trang ẩn lối vào
 * bật trên hub (features.textSelection / selectionScope / selectionRoles / hidePaths).
 * API JS: window.FeedbackHub = { init(opts), open(), close(), refresh(), hideFab(bool), destroy() }.
 * Hợp đồng API: docs/API.md. Nguyên tắc: không bao giờ gắn dữ liệu ngoài vào innerHTML; hỏng thì im lặng
 * (ẩn nút, console.warn) chứ không làm hỏng trang chủ.
 */
(function () {
  "use strict";
  var W = window;
  if (W.FeedbackHub && W.FeedbackHub.__loaded) return;

  var CUR = document.currentScript;
  var DATA_SCRIPT =
    (CUR && CUR.hasAttribute("data-project") ? CUR : null) || document.querySelector("script[data-project][src*='widget']");
  var SCRIPT_ORIGIN = (function () {
    try {
      var s = CUR || DATA_SCRIPT;
      // Gồm cả tiền tố đường dẫn khi hub chạy dưới đường dẫn con (https://host/feedbackhub/widget.js → https://host/feedbackhub).
      var u = new URL(s.src, location.href);
      return u.origin + u.pathname.replace(/\/[^\/]*$/, "");
    } catch (e) {
      return location.origin;
    }
  })();

  var log = function () {
    try {
      console.warn.apply(console, ["[FeedbackHub]"].concat([].slice.call(arguments)));
    } catch (e) {}
  };

  /* ───────────────────────────── Chuỗi giao diện ───────────────────────────── */
  var VI = {
    title: "Góp ý cải tiến",
    fab_tip: "Góp ý cải tiến trang này",
    fab_wait: "{n} góp ý của bạn đang chờ bạn trả lời",
    launcher_tip: "Góp ý",
    sel_btn: "Góp ý đoạn này",
    sel_body: "Về đoạn: «{text}»",
    close: "Đóng",
    at_page: "📍 Đang ở trang {path}",
    scope_page: "📍 Trang này",
    scope_system: "🌐 Toàn hệ thống",
    scope_label: "Phạm vi góp ý",
    pick: "🎯 Chỉ chỗ cần sửa bằng chuột",
    picked: "Đã chỉ: {label}",
    unpick: "Bỏ chọn",
    pick_banner: "🎯 Bấm vào chỗ cần sửa",
    pick_esc: "Esc để huỷ",
    type_label: "Loại góp ý",
    model_label: "Mô hình sẽ thực hiện góp ý này",
    title_ph_page: "Cần sửa gì ở trang này?",
    title_ph_system: "Cần thêm/sửa gì trong hệ thống?",
    body_ph:
      "Mô tả cụ thể: chỗ nào, hiện đang thế nào, mong muốn thành thế nào. Có thể dán ảnh chụp màn hình vào đây (Ctrl/⌘+V).",
    body_ph_plain: "Mô tả cụ thể: chỗ nào, hiện đang thế nào, mong muốn thành thế nào.",
    title_aria: "Tiêu đề góp ý",
    body_aria: "Mô tả chi tiết",
    criteria_ph: "Làm sao biết đã đúng? (VD: trang hiện đúng chữ ‘…’)",
    plan_check: "Cho tôi duyệt kế hoạch trước khi AI sửa",
    mic_start: "Nói thay vì gõ",
    mic_stop: "Đang nghe, bấm để dừng",
    attach: "📎 Đính kèm tệp",
    shot_label: "📸 Đính kèm ảnh chụp trang này",
    shot_hint: "",
    shot_busy: "Đang chụp trang…",
    shot_fail: "Không chụp được ảnh — góp ý vẫn được gửi kèm đường dẫn trang.",
    shot_retake: "Chụp lại",
    remove: "Bỏ {name}",
    offer: "Bạn đang bôi đen: «{text}»",
    offer_btn: "✏️ Sửa chữ này",
    before_label: "Chữ hiện tại",
    after_label: "Sửa thành",
    suggest_title: "Sửa chữ: «{text}»",
    anon_name: "Tên của bạn (tuỳ chọn)",
    anon_email: "Email để liên hệ (tuỳ chọn)",
    submit_ai: "📨 Gửi tới AI",
    submit: "📨 Gửi góp ý",
    sending: "Đang gửi…",
    uploading: "Đang tải tệp {i}/{n}…",
    sent_ai: "✓ Đã gửi — AI sẽ nhận trong khoảng 1 phút.",
    sent: "✓ Đã gửi. Cảm ơn bạn đã góp ý!",
    sent_fail: "⚠️ Đã gửi góp ý, nhưng không tải được: {names}",
    err_title: "⚠️ Tiêu đề tối thiểu 4 ký tự",
    err_email: "⚠️ Email chưa đúng dạng",
    err_network: "⚠️ Lỗi mạng, vui lòng thử lại",
    err_400: "⚠️ Nội dung chưa hợp lệ: {detail}",
    err_401: "⚠️ Phiên đăng nhập đã hết hạn — hãy tải lại trang rồi thử lại",
    err_403: "⚠️ Bạn chưa được phép thực hiện thao tác này",
    err_409: "⚠️ Thao tác này không còn áp dụng được cho góp ý hiện tại",
    err_429: "⚠️ Bạn gửi quá nhanh, vui lòng thử lại sau ít phút",
    err_other: "⚠️ Không thực hiện được (mã lỗi {code})",
    file_big: "⚠️ Tệp «{name}» lớn hơn 10 MB nên bị bỏ qua",
    file_many: "⚠️ Mỗi góp ý tối đa 12 tệp",
    dup: "Bạn đã gửi góp ý giống hệt «{title}» và góp ý đó vẫn đang ở trạng thái «{status}». Mở góp ý cũ để nhắn tiếp thay vì gửi bản mới.",
    dup_open: "Mở yêu cầu cũ",
    dup_again: "Vẫn gửi bản mới",
    list_title: "Đã gửi ({n})",
    list_empty: "Chưa có góp ý nào.",
    awaiting_box:
      "Có {n} góp ý đang chờ bạn trả lời (xếp lên đầu danh sách). Mở từng góp ý, đọc câu hỏi cuối và trả lời đúng ý được hỏi — trả lời «ok» thường chưa đủ để làm tiếp.",
    sent_at: "gửi lúc {t} ({e} trước)",
    from_page: "từ trang {p}",
    whole_system: "🌐 toàn hệ thống",
    by: "bởi {name}",
    target_note: "🎯 Đã chỉ đúng chỗ: {t}",
    suggest_note: "✏️ Đề xuất sửa chữ: «{before}» → «{after}»",
    ran_for: "đã chạy {t}",
    live_pending: "Đang chờ AI nhận việc — {t}",
    live_reviewing: "AI đang làm — {t}",
    live_deploying: "Đã viết xong, đang cập nhật lên hệ thống — {t}",
    stop: "⏹ Dừng lại",
    stopping: "Đang dừng lại…",
    stop_q:
      "Dừng AI đang làm góp ý này? Phần AI viết dở sẽ được cất đi, chưa áp dụng vào hệ thống. Bạn nhắn thêm là AI làm tiếp.",
    stop_yes: "Dừng",
    stop_no: "Không dừng",
    verdict_q: "Thay đổi đã lên hệ thống. Có đúng ý bạn không?",
    verdict_yes: "✓ Đúng ý rồi",
    verdict_no: "✗ Chưa đúng — làm lại",
    verdict_ok: "✓ Bạn đã xác nhận đúng ý.",
    verdict_bad: "Bạn đã báo chưa đúng — góp ý được mở lại.",
    plan_q: "AI đã đề xuất kế hoạch. Đọc kế hoạch trong luồng trao đổi rồi duyệt để AI bắt đầu sửa.",
    plan_btn: "✓ Duyệt kế hoạch",
    reply_ph_wait: "Trả lời để AI làm tiếp…",
    reply_ph: "Nhắn thêm cho AI…",
    reply_ph_plain: "Nhắn thêm…",
    reply_aria: "Nội dung trả lời",
    reply_send: "Gửi",
    reply_hint: "Trả lời xong góp ý sẽ tự quay lại hàng đợi để AI làm tiếp.",
    author_ai: "Trợ lý AI",
    author_admin: "Quản trị",
    author_user: "Người gửi",
    author_system: "Hệ thống",
    model_badge: "Góp ý này chạy bằng {m}",
    open_card: "Mở/đóng góp ý: {title}",
    status_pending: "Chờ nhận",
    status_reviewing: "Đang làm",
    status_deploying: "Đang cập nhật",
    status_awaiting_user: "Chờ bạn trả lời",
    status_done: "Hoàn thành",
    status_rejected: "Không thực hiện",
    u_s: "giây",
    u_m: "phút",
    u_h: "giờ",
    mount_title: "Góp ý",
  };
  var EN = {
    title: "Feedback",
    fab_tip: "Send feedback about this page",
    fab_wait: "{n} of your items are waiting for your reply",
    launcher_tip: "Feedback",
    sel_btn: "Feedback on this text",
    sel_body: "About: “{text}”",
    close: "Close",
    at_page: "📍 You are on {path}",
    scope_page: "📍 This page",
    scope_system: "🌐 Whole system",
    scope_label: "Scope of feedback",
    pick: "🎯 Point at the spot with the mouse",
    picked: "Selected: {label}",
    unpick: "Clear selection",
    pick_banner: "🎯 Click what needs changing",
    pick_esc: "Esc to cancel",
    type_label: "Type of feedback",
    model_label: "Model that will handle this item",
    title_ph_page: "What needs changing on this page?",
    title_ph_system: "What should be added or changed in the system?",
    body_ph:
      "Be specific: where, how it behaves now, how you want it to behave. You can paste a screenshot here (Ctrl/⌘+V).",
    body_ph_plain: "Be specific: where, how it behaves now, how you want it to behave.",
    title_aria: "Feedback title",
    body_aria: "Details",
    criteria_ph: "How will we know it is right? (e.g. the page shows the text ‘…’)",
    plan_check: "Let me approve the plan before the AI changes anything",
    mic_start: "Dictate instead of typing",
    mic_stop: "Listening, press to stop",
    attach: "📎 Attach files",
    shot_label: "📸 Attach a screenshot of this page",
    shot_hint: "",
    shot_busy: "Capturing the page…",
    shot_fail: "Could not capture the page — your feedback is still sent with the page address.",
    shot_retake: "Retake",
    remove: "Remove {name}",
    offer: "You have selected: “{text}”",
    offer_btn: "✏️ Fix this text",
    before_label: "Current text",
    after_label: "Change to",
    suggest_title: "Fix text: “{text}”",
    anon_name: "Your name (optional)",
    anon_email: "Contact email (optional)",
    submit_ai: "📨 Send to AI",
    submit: "📨 Send feedback",
    sending: "Sending…",
    uploading: "Uploading file {i}/{n}…",
    sent_ai: "✓ Sent — the AI will pick it up within about a minute.",
    sent: "✓ Sent. Thank you for your feedback!",
    sent_fail: "⚠️ Feedback sent, but these files failed to upload: {names}",
    err_title: "⚠️ The title needs at least 4 characters",
    err_email: "⚠️ That email does not look right",
    err_network: "⚠️ Network error, please try again",
    err_400: "⚠️ Invalid content: {detail}",
    err_401: "⚠️ Your session has expired — reload the page and try again",
    err_403: "⚠️ You are not allowed to do this",
    err_409: "⚠️ This no longer applies to the current state of the item",
    err_429: "⚠️ You are sending too fast, please wait a few minutes",
    err_other: "⚠️ Something went wrong (error {code})",
    file_big: "⚠️ “{name}” is larger than 10 MB and was skipped",
    file_many: "⚠️ At most 12 files per item",
    dup: "You already sent an identical item “{title}” and it is still “{status}”. Open it to add a message instead of sending a new copy.",
    dup_open: "Open the earlier item",
    dup_again: "Send as new anyway",
    list_title: "Sent ({n})",
    list_empty: "Nothing sent yet.",
    awaiting_box:
      "{n} item(s) are waiting for your reply (listed first). Open each one, read the last question and answer what was asked — “ok” is usually not enough to continue.",
    sent_at: "sent at {t} ({e} ago)",
    from_page: "from page {p}",
    whole_system: "🌐 whole system",
    by: "by {name}",
    target_note: "🎯 Pointed at: {t}",
    suggest_note: "✏️ Suggested text change: “{before}” → “{after}”",
    ran_for: "running {t}",
    live_pending: "Waiting for the AI to pick this up — {t}",
    live_reviewing: "The AI is working — {t}",
    live_deploying: "Written, now being published — {t}",
    stop: "⏹ Stop",
    stopping: "Stopping…",
    stop_q:
      "Stop the AI working on this item? Unfinished work is set aside and not applied. Send another message to resume.",
    stop_yes: "Stop",
    stop_no: "Keep going",
    verdict_q: "The change is live. Is it what you wanted?",
    verdict_yes: "✓ Yes, that is right",
    verdict_no: "✗ Not right — redo",
    verdict_ok: "✓ You confirmed it is right.",
    verdict_bad: "You said it is not right — the item was reopened.",
    plan_q: "The AI proposed a plan. Read it in the conversation, then approve so it can start.",
    plan_btn: "✓ Approve plan",
    reply_ph_wait: "Reply so the AI can continue…",
    reply_ph: "Send another message…",
    reply_ph_plain: "Send another message…",
    reply_aria: "Reply text",
    reply_send: "Send",
    reply_hint: "After you reply, the item goes back in the queue so the AI can continue.",
    author_ai: "AI assistant",
    author_admin: "Admin",
    author_user: "Sender",
    author_system: "System",
    model_badge: "This item runs on {m}",
    open_card: "Open/close item: {title}",
    status_pending: "Queued",
    status_reviewing: "In progress",
    status_deploying: "Publishing",
    status_awaiting_user: "Waiting for you",
    status_done: "Done",
    status_rejected: "Declined",
    u_s: "s",
    u_m: "min",
    u_h: "h",
    mount_title: "Feedback",
  };
  var TABLES = { vi: VI, en: EN };

  /* ───────────────────────────── Tiện ích ───────────────────────────── */
  var RE_COLOR = /^(#[0-9a-fA-F]{3,8}|rgba?\([\d\s.,%/]+\)|hsla?\([\d\s.,%/deg]+\))$/;
  var RE_LEN = /^\d+(\.\d+)?(px|rem|em|%)$/;
  var FONTS = {
    system: 'system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif',
    serif: 'Georgia,"Times New Roman",serif',
    mono: 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
  };
  var POSITIONS = ["bottom-right", "bottom-left", "top-right", "top-left"];
  var ICONS = { lightbulb: "💡", chat: "💬", pencil: "✏️", flag: "🚩", plus: "➕" };
  var RUNNING = ["pending", "reviewing", "deploying"];
  var STATUS_IDS = ["pending", "reviewing", "deploying", "awaiting_user", "done", "rejected"];
  var PASTE_TYPES = ["image/png", "image/jpeg", "image/webp"];
  var MAX_BYTES = 10 * 1024 * 1024;
  var MAX_FILES = 12;

  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) {
      for (var k in attrs) {
        var v = attrs[k];
        if (v == null || v === false) continue;
        if (k === "class") e.className = v;
        else if (k === "text") e.textContent = v;
        else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
        else e.setAttribute(k, v === true ? "" : String(v));
      }
    }
    if (kids != null) {
      (Array.isArray(kids) ? kids : [kids]).forEach(function (c) {
        if (c == null || c === false) return;
        e.appendChild(typeof c === "object" ? c : document.createTextNode(String(c)));
      });
    }
    return e;
  }
  function fmt(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, function (m, k) {
      return vars && vars[k] != null ? String(vars[k]) : "";
    });
  }
  function jwtPayload(tok) {
    try {
      var p = String(tok).split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      while (p.length % 4) p += "=";
      return JSON.parse(decodeURIComponent(escape(atob(p))));
    } catch (e) {
      return {};
    }
  }
  function parseRGB(c) {
    c = String(c || "").trim();
    var m = /^#([0-9a-f]{3,8})$/i.exec(c);
    if (m) {
      var x = m[1];
      if (x.length === 3 || x.length === 4) x = x.split("").map(function (d) { return d + d; }).join("");
      if (x.length < 6) return null;
      return [0, 2, 4].map(function (i) { return parseInt(x.slice(i, i + 2), 16); });
    }
    m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/.exec(c);
    return m ? [+m[1], +m[2], +m[3]] : null;
  }
  function lum(rgb) {
    var a = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function resolveScheme(pref) {
    if (pref === "light" || pref === "dark") return pref;
    var de = document.documentElement;
    var dt = (de.getAttribute("data-theme") || "").toLowerCase();
    if (de.classList.contains("dark") || dt === "dark") return "dark";
    if (de.classList.contains("light") || dt === "light") return "light";
    try {
      return W.matchMedia && W.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch (e) {
      return "light";
    }
  }
  function idSel(id) {
    return /^[A-Za-z][\w-]*$/.test(id) ? "#" + id : '[id="' + id.replace(/["\\]/g, "\\$&") + '"]';
  }
  /** Đường dẫn CSS ổn định: id → data-testid → chuỗi tag:nth-of-type, tối đa 5 tầng (như useElementPicker của DGXL). */
  function cssPath(el) {
    var parts = [];
    var node = el;
    for (var depth = 0; node && node.nodeType === 1 && depth < 5; depth++) {
      // Bỏ qua id sinh tự động (React/Radix…) vì đổi sau mỗi lần tải.
      if (node.id && !/^:|^(radix|headlessui|react-aria|mui|rc)[-_:]|\d{5,}/i.test(node.id)) {
        parts.unshift(idSel(node.id));
        break;
      }
      var tid = node.getAttribute("data-testid");
      if (tid) {
        parts.unshift('[data-testid="' + tid.replace(/["\\]/g, "\\$&") + '"]');
        break;
      }
      var tag = node.tagName.toLowerCase();
      if (tag === "body" || tag === "html") break;
      var parent = node.parentElement;
      if (!parent) {
        parts.unshift(tag);
        break;
      }
      var same = Array.prototype.filter.call(parent.children, function (c) { return c.tagName === node.tagName; });
      parts.unshift(same.length > 1 ? tag + ":nth-of-type(" + (same.indexOf(node) + 1) + ")" : tag);
      node = parent;
    }
    return parts.join(" > ") || el.tagName.toLowerCase();
  }
  function safePath() {
    var p = (location.pathname || "/").replace(/[^\w\-./[\]%~]/gu, function (c) {
      return c.charCodeAt(0) < 128 ? "%" + ("0" + c.charCodeAt(0).toString(16).toUpperCase()).slice(-2) : encodeURIComponent(c);
    });
    if (p.charAt(0) !== "/") p = "/" + p;
    return p.slice(0, 200);
  }
  function safeUrl() {
    if (!/^https?:$/.test(location.protocol)) return undefined;
    if (location.href.length <= 500) return location.href;
    var u = location.origin + location.pathname;
    return u.length <= 500 ? u : undefined;
  }

  /* ───────────────────────────── CSS ───────────────────────────── */
  var CSS = [
    "[hidden]{display:none!important}",
    "*{box-sizing:border-box}",
    ".fh{--p:var(--fh-primary,var(--_p));--pt:var(--fh-primary-text,var(--_pt));--bg:var(--fh-bg,var(--_bg));--fg:var(--fh-fg,var(--_fg));--bd:var(--fh-border,var(--_bd));--r:var(--fh-radius,var(--_r));--fs:var(--fh-font-size,var(--_fs));--ff:var(--fh-font,var(--_ff));--sh:var(--fh-shadow,0 10px 40px rgba(0,0,0,.28));",
    "--muted:var(--fg);--muted:color-mix(in srgb,var(--fg) 68%,var(--bg));--soft:rgba(127,127,127,.09);--soft:color-mix(in srgb,var(--fg) 6%,var(--bg));--soft2:rgba(127,127,127,.2);--soft2:color-mix(in srgb,var(--fg) 14%,var(--bg));",
    "--dg:#be123c;--wbg:#fffbeb;--wfg:#78350f;--wbd:#fcd34d;--okbg:#d1fae5;--okfg:#064e3b;",
    "--s1b:#e2e8f0;--s1f:#1e293b;--s2b:#dbeafe;--s2f:#1e3a8a;--s3b:#ede9fe;--s3f:#4c1d95;--s4b:#fef3c7;--s4f:#78350f;--s5b:#d1fae5;--s5f:#064e3b;--s6b:#ffe4e6;--s6f:#881337;",
    "font-family:var(--ff);font-size:var(--fs);line-height:1.45;color:var(--fg);-webkit-text-size-adjust:100%}",
    '.fh[data-scheme="dark"]{--dg:#fda4af;--wbg:#422006;--wfg:#fef3c7;--wbd:#b45309;--okbg:#064e3b;--okfg:#d1fae5;--s1b:#334155;--s1f:#e2e8f0;--s2b:#1e3a8a;--s2f:#dbeafe;--s3b:#4c1d95;--s3f:#ede9fe;--s4b:#78350f;--s4f:#fef3c7;--s5b:#064e3b;--s5f:#d1fae5;--s6b:#881337;--s6f:#ffe4e6}',
    "button{font:inherit;color:inherit}",
    "button:focus-visible,.in:focus-visible,a:focus-visible,input[type=checkbox]:focus-visible{outline:2px solid var(--p);outline-offset:2px}",
    /* nút nổi */
    ".fab{position:fixed;z-index:2147483000;width:48px;height:48px;border-radius:50%;border:0;background:var(--p);color:var(--pt);font-size:22px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 6px 18px rgba(0,0,0,.28);transition:transform .15s}",
    ".fab:hover{transform:scale(1.06)}",
    ".pos-br .fab{right:calc(var(--_ox) + env(safe-area-inset-right,0px));bottom:calc(var(--_oy) + env(safe-area-inset-bottom,0px))}",
    ".pos-bl .fab{left:calc(var(--_ox) + env(safe-area-inset-left,0px));bottom:calc(var(--_oy) + env(safe-area-inset-bottom,0px))}",
    ".pos-tr .fab{right:calc(var(--_ox) + env(safe-area-inset-right,0px));top:calc(var(--_oy) + env(safe-area-inset-top,0px))}",
    ".pos-tl .fab{left:calc(var(--_ox) + env(safe-area-inset-left,0px));top:calc(var(--_oy) + env(safe-area-inset-top,0px))}",
    ".pos-br.open .fab,.pos-tr.open .fab{right:calc(min(100vw,34rem) + var(--_ox))}",
    ".pos-bl.open .fab,.pos-tl.open .fab{left:calc(min(100vw,34rem) + var(--_ox))}",
    ".badge{position:absolute;right:-4px;top:-4px;min-width:20px;height:20px;padding:0 5px;border-radius:999px;background:#be123c;color:#fff;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 2px var(--bg)}",
    /* ngăn kéo */
    ".scrim{position:fixed;inset:0;z-index:2147482999;background:rgba(15,23,42,.22);backdrop-filter:blur(1px)}",
    ".drawer{position:fixed;top:0;bottom:0;right:0;z-index:2147483001;width:min(100vw,34rem);display:flex;flex-direction:column;background:var(--bg);color:var(--fg);border-left:1px solid var(--bd);box-shadow:var(--sh);padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) 0;animation:fh-in .18s ease-out}",
    ".pos-bl .drawer,.pos-tl .drawer{right:auto;left:0;border-left:0;border-right:1px solid var(--bd);padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);animation-name:fh-in-l}",
    ".hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:14px 20px;border-bottom:1px solid var(--bd)}",
    ".hd-t{font-weight:600;font-size:1.15em}",
    ".hd-s{color:var(--muted);font-size:.85em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:24rem}",
    ".x{border:0;background:transparent;border-radius:calc(var(--r) * .7);padding:4px 8px;cursor:pointer;color:var(--muted);font-size:1.1em}",
    ".x:hover{background:var(--soft2)}",
    ".scroll{flex:1;overflow-y:auto;padding:16px 20px;display:flex;flex-direction:column;gap:18px}",
    ".mount .panel{border:1px solid var(--bd);border-radius:var(--r);background:var(--bg);padding:16px;display:flex;flex-direction:column;gap:18px}",
    /* biểu mẫu */
    ".form{display:flex;flex-direction:column;gap:10px}",
    ".row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}",
    ".grow{flex:1;min-width:0}",
    ".in{width:100%;border:1px solid var(--bd);background:var(--bg);color:var(--fg);border-radius:calc(var(--r) * .7);padding:8px 12px;font:inherit}",
    ".in::placeholder{color:var(--muted);opacity:1}",
    "textarea.in{resize:vertical;min-height:4.5em}",
    ".rel{position:relative}",
    ".rel textarea.in,.rel input.in{padding-right:42px}",
    ".mic{position:absolute;right:8px;top:8px;border:0;border-radius:999px;padding:6px;background:var(--soft2);color:var(--fg);cursor:pointer;line-height:1}",
    ".rel.mid .mic{top:50%;transform:translateY(-50%)}",
    ".mic.rec{background:#be123c;color:#fff;animation:fh-pulse 1s ease-in-out infinite}",
    ".btn{border:1px solid var(--bd);background:transparent;color:var(--fg);border-radius:calc(var(--r) * .7);padding:7px 14px;font:inherit;font-weight:600;cursor:pointer}",
    ".btn:hover:not([disabled]){background:var(--soft2)}",
    ".btn.pri{background:var(--p);border-color:var(--p);color:var(--pt)}",
    ".btn.pri:hover:not([disabled]){background:var(--p);filter:brightness(1.1)}",
    ".btn.ok{background:#047857;border-color:#047857;color:#fff}",
    ".btn.ok:hover:not([disabled]){background:#047857;filter:brightness(1.1)}",
    ".btn.dg{color:var(--dg);border-color:var(--dg)}",
    ".btn.sm{padding:4px 10px;font-size:.88em}",
    ".btn[disabled]{opacity:.55;cursor:not-allowed}",
    ".seg{display:flex;border:1px solid var(--bd);border-radius:calc(var(--r) * .85);padding:2px}",
    ".seg button{flex:1;border:0;background:transparent;border-radius:calc(var(--r) * .7);padding:6px 8px;cursor:pointer}",
    '.seg button[aria-pressed="true"]{background:var(--p);color:var(--pt);font-weight:600}',
    ".chip{display:inline-flex;align-items:center;gap:4px;background:var(--okbg);color:var(--okfg);border-radius:999px;padding:2px 4px 2px 10px;font-size:.88em}",
    ".chip button{border:0;background:transparent;cursor:pointer;opacity:.75;padding:0 6px;font-size:1em}",
    ".chip button:hover{opacity:1}",
    ".note{border:1px solid var(--bd);background:var(--soft);border-radius:calc(var(--r) * .7);padding:8px 12px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.92em}",
    ".warn{border:1px solid var(--wbd);background:var(--wbg);color:var(--wfg);border-radius:calc(var(--r) * .7);padding:8px 12px;font-size:.9em;display:flex;flex-direction:column;gap:8px}",
    ".okbox{border:1px solid #34d399;background:var(--okbg);color:var(--okfg);border-radius:calc(var(--r) * .7);padding:8px 12px;display:flex;flex-direction:column;gap:8px;font-size:.92em}",
    ".chk{display:flex;gap:8px;align-items:center;font-size:.92em;color:var(--muted)}",
    ".files{display:flex;flex-wrap:wrap;gap:8px}",
    ".shot{display:flex;flex-direction:column;gap:6px}",
    ".shot img{max-width:100%;max-height:120px;object-fit:contain;align-self:flex-start;border-radius:6px;border:1px solid var(--bd)}",
    ".shot .hint{font-size:.85em;color:var(--muted)}",
    ".pf{position:relative}",
    ".pf img{width:64px;height:64px;object-fit:cover;border-radius:6px;border:1px solid var(--bd);display:block}",
    ".pf .fn{display:flex;align-items:center;height:64px;max-width:10rem;border:1px solid var(--bd);border-radius:6px;padding:0 8px;font-size:.88em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".pf button{position:absolute;right:-6px;top:-6px;width:20px;height:20px;border-radius:50%;border:0;background:#334155;color:#fff;font-size:11px;line-height:1;cursor:pointer}",
    ".pf button:hover{background:#be123c}",
    ".msg{font-size:.9em;color:var(--muted)}",
    ".sug{display:flex;flex-direction:column;gap:6px}",
    ".sug label{font-size:.85em;color:var(--muted);display:block;margin-bottom:2px}",
    /* danh sách */
    ".lsec{border-top:1px solid var(--bd);padding-top:14px}",
    ".lh{font-size:.8em;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);margin-bottom:8px}",
    ".list{display:flex;flex-direction:column;gap:6px}",
    ".empty{padding:22px 0;text-align:center;color:var(--muted)}",
    ".card{border:1px solid var(--bd);border-radius:calc(var(--r) * .85);overflow:hidden}",
    ".card.flash{animation:fh-flash 1.2s ease-out}",
    ".card-h{display:flex;align-items:center;gap:8px;width:100%;padding:8px 12px;background:none;border:0;text-align:left;cursor:pointer}",
    ".card-h:hover{background:var(--soft)}",
    ".ct{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
    ".clk{color:var(--muted);font-size:.85em;white-space:nowrap}",
    ".pill{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:2px 8px;font-size:.8em;font-weight:600;white-space:nowrap;flex-shrink:0}",
    ".pill.pm{background:var(--soft2);color:var(--fg)}",
    ".st-pending{background:var(--s1b);color:var(--s1f)}.st-reviewing{background:var(--s2b);color:var(--s2f)}.st-deploying{background:var(--s3b);color:var(--s3f)}.st-awaiting_user{background:var(--s4b);color:var(--s4f)}.st-done{background:var(--s5b);color:var(--s5f)}.st-rejected{background:var(--s6b);color:var(--s6f)}",
    ".card-b{border-top:1px solid var(--bd);background:var(--soft);padding:10px 12px;display:flex;flex-direction:column;gap:8px}",
    ".card-b>:empty{display:none}",
    ".meta{color:var(--muted);font-size:.85em}",
    ".tgt{background:var(--okbg);color:var(--okfg);border-radius:6px;padding:4px 8px;font-size:.88em}",
    ".txt{white-space:pre-wrap;overflow-wrap:anywhere}",
    ".atts{display:flex;flex-wrap:wrap;gap:6px}",
    ".thumb{width:56px;height:56px;object-fit:cover;border-radius:6px;border:1px solid var(--bd);display:block}",
    ".thumb:hover{opacity:.85}",
    ".fl{background:var(--soft2);border-radius:6px;padding:2px 8px;font-size:.88em;color:var(--fg);text-decoration:underline}",
    ".tl{list-style:none;margin:0;padding:0 0 0 12px;border-left:2px solid var(--bd);display:flex;flex-direction:column;gap:8px}",
    ".tl .mh{display:flex;gap:6px;align-items:baseline;color:var(--muted);font-size:.8em}",
    ".tl .mb{white-space:pre-wrap;overflow-wrap:anywhere}",
    ".tl .mb.soft{color:var(--muted);font-size:.88em}",
    ".tl li.live{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:.88em}",
    ".dot{display:inline-block;width:7px;height:7px;border-radius:50%;background:currentColor;animation:fh-pulse 1.4s ease-in-out infinite}",
    ".spin{display:inline-block;width:.85em;height:.85em;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;animation:fh-spin .8s linear infinite;flex-shrink:0}",
    ".err{color:var(--dg);font-size:.88em}",
    /* chọn phần tử */
    ".pk{position:fixed;inset:0;z-index:2147483002;pointer-events:none}",
    ".pk-box{position:fixed;border:2px solid var(--p);background:rgba(37,99,235,.16);border-radius:4px;box-shadow:0 0 0 1px #fff;pointer-events:none}",
    ".pk-bar{position:fixed;left:50%;top:16px;transform:translateX(-50%);max-width:calc(100vw - 32px);background:rgba(15,23,42,.94);color:#fff;border-radius:999px;padding:8px 16px;box-shadow:0 6px 18px rgba(0,0,0,.35);text-align:center}",
    ".pk-bar span{opacity:.8}",
    ".selb{position:fixed;z-index:2147483000;display:inline-flex;align-items:center;gap:6px;max-width:calc(100vw - 16px);padding:6px 12px;border:0;border-radius:999px;background:var(--p);color:var(--pt);font:600 13px/1.2 var(--ff);cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.25);animation:fh-pop .12s ease-out;white-space:nowrap}",
    ".selb:hover{filter:brightness(1.08)}",
    ".selb:focus-visible{outline:2px solid var(--fg);outline-offset:2px}",
    "@keyframes fh-pop{from{transform:translateY(4px);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes fh-in{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes fh-in-l{from{transform:translateX(-24px);opacity:0}to{transform:none;opacity:1}}",
    "@keyframes fh-spin{to{transform:rotate(360deg)}}",
    "@keyframes fh-pulse{50%{opacity:.35}}",
    "@keyframes fh-flash{from{box-shadow:0 0 0 3px var(--p)}to{box-shadow:0 0 0 0 transparent}}",
    "@media (max-width:640px){.drawer{width:100vw}.pos-br.open .fab,.pos-tr.open .fab,.pos-bl.open .fab,.pos-tl.open .fab{display:none}.in,.btn,select.in{font-size:16px}.hd,.scroll{padding-left:16px;padding-right:16px}.hd-s{max-width:calc(100vw - 96px)}.card-h{flex-wrap:wrap}.ct{flex:1 1 100%}}",
    "@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}}",
    "@media print{:host,.fh{display:none!important}}",
  ].join("\n");

  /* Nút gắn trong trang (data-feedbackhub-launcher): kế thừa màu chữ và phông của chỗ đặt nó, như một biểu tượng của header. */
  var LAUNCHER_CSS = [
    ":host{display:inline-flex;vertical-align:middle}",
    ":host([hidden]){display:none}",
    "button{position:relative;display:inline-flex;align-items:center;justify-content:center;gap:6px;height:36px;min-width:36px;padding:0;border:0;border-radius:999px;background:transparent;color:inherit;font:inherit;font-size:14px;line-height:1;cursor:pointer;transition:background-color .15s}",
    "button.lb{padding:0 12px 0 10px}",
    "button:hover{background:rgba(127,127,127,.15)}",
    "button:focus-visible{outline:2px solid currentColor;outline-offset:2px}",
    "svg{width:18px;height:18px;flex:none}",
    ".b{position:absolute;right:-2px;top:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#be123c;color:#fff;font:700 10px/16px system-ui,sans-serif;text-align:center}",
    ".b[hidden]{display:none}",
    "@media print{:host{display:none!important}}",
  ].join("\n");

  /* ───────────────────────────── Xác thực ───────────────────────────── */
  function makeAuth(opts) {
    var token = null, exp = 0, pending = null;
    var hasSource = !!(opts.getToken || opts.tokenUrl);
    var listeners = [];
    function fetchNew() {
      if (opts.getToken) return Promise.resolve().then(function () { return opts.getToken(); });
      return fetch(opts.tokenUrl, { credentials: "same-origin", headers: { Accept: "application/json" } }).then(function (r) {
        if (!r.ok) throw new Error("token HTTP " + r.status);
        return r.json();
      });
    }
    /** Trả token còn hạn (≥ 60 giây) hoặc lấy mới; lỗi thì null (đã console.warn). */
    function get(force) {
      if (!hasSource) return Promise.resolve(null);
      var now = Date.now() / 1000;
      if (!force && token && exp - now > 60) return Promise.resolve(token);
      if (!pending) {
        pending = fetchNew()
          .then(function (t) {
            if (t && typeof t === "object") t = t.token;
            if (!t || typeof t !== "string") {
              token = null;
              exp = 0;
              return null;
            }
            token = t;
            exp = jwtPayload(t).exp || Date.now() / 1000 + 300;
            listeners.forEach(function (f) { try { f(); } catch (e) {} });
            return t;
          })
          .catch(function (e) {
            log("Không lấy được token:", (e && e.message) || e);
            token = null;
            exp = 0;
            return null;
          })
          .then(function (t) {
            pending = null;
            return t;
          });
      }
      return pending;
    }
    return {
      hasSource: hasSource,
      get: get,
      peek: function () { return token; },
      onToken: function (f) { listeners.push(f); },
    };
  }

  /* ───────────────────────────── Tạo widget ───────────────────────────── */
  function mountWidget(opts, cfg, hub, project, auth, anon) {
    var disposers = [];
    function on(target, ev, fn, o) {
      target.addEventListener(ev, fn, o);
      disposers.push(function () { target.removeEventListener(ev, fn, o); });
    }
    function guard(fn) {
      return function () {
        try {
          return fn.apply(this, arguments);
        } catch (e) {
          log(e);
        }
      };
    }

    /* — theme & chuỗi — */
    var hubTheme = cfg.theme && typeof cfg.theme === "object" ? cfg.theme : {};
    var userTheme = opts.theme && typeof opts.theme === "object" ? opts.theme : {};
    function pick(k) {
      var v = hubTheme[k];
      if (userTheme[k] != null) v = userTheme[k];
      if (opts[k] != null && opts[k] !== "") v = opts[k];
      return v;
    }
    var TH = {
      primary: pick("primary"), primaryText: pick("primaryText"), bg: pick("bg"), fg: pick("fg"), border: pick("border"),
      radius: pick("radius"), fontSize: pick("fontSize"), font: pick("font"), colorScheme: pick("colorScheme") || "auto",
      position: POSITIONS.indexOf(pick("position")) >= 0 ? pick("position") : "bottom-right",
      icon: ICONS[pick("icon")] ? pick("icon") : "lightbulb",
      locale: pick("locale") === "en" ? "en" : "vi",
      label: typeof pick("label") === "string" ? pick("label").slice(0, 24) : "",
    };
    ["offsetX", "offsetY"].forEach(function (k) {
      var n = parseInt(pick(k), 10);
      TH[k] = isFinite(n) ? Math.max(0, Math.min(200, n)) : 20;
    });
    var STR = Object.assign({}, VI, TABLES[TH.locale]);
    var overrides = Object.assign({}, hubTheme.strings || {}, userTheme.strings || {}, opts.strings || {});
    Object.keys(overrides).forEach(function (k) {
      if (typeof overrides[k] === "string" && overrides[k].length <= 200) {
        if (STATUS_IDS.indexOf(k) >= 0) STR["status_" + k] = overrides[k];
        else STR[k] = overrides[k];
      }
    });
    if (TH.label) STR.title = TH.label;
    var LOC = TH.locale === "en" ? "en-US" : "vi-VN";
    function t(k, vars) {
      return fmt(STR[k] != null ? STR[k] : k, vars);
    }

    /* — cấu hình — */
    var feat = Object.assign({ scopePicker: true, elementPicker: true, voice: true, attachments: true, planApproval: false, successCriteria: false, screenshot: "optional", models: [], textSelection: false, selectionScope: "", selectionRoles: [], hidePaths: [] }, cfg.features || {});
    var models = Array.isArray(feat.models) ? feat.models.filter(function (m) { return m && typeof m.id === "string"; }) : [];
    var allTypes = (Array.isArray(cfg.types) ? cfg.types : []).filter(function (x) { return x && typeof x.id === "string"; });
    var formTypes = allTypes.filter(function (x) { return x.kind !== "question"; });
    if (!formTypes.length) formTypes = allTypes;
    var executeMode = cfg.mode === "execute";
    var mountEl = null;
    if (opts.mount) {
      try { mountEl = document.querySelector(opts.mount); } catch (e) {}
      if (!mountEl) log("Không tìm thấy phần tử data-mount:", opts.mount);
    }
    var myUid = auth.peek() ? jwtPayload(auth.peek()).uid : null;

    /* — trạng thái — */
    var S = {
      open: false, picking: false, items: [], awaiting: [], openId: null, cards: {}, files: [], target: null,
      sel: null, scope: "page", fabHidden: false, pathHidden: false, openedVia: null, gen: 0, busy: false, dup: null,
    };

    /* — DOM gốc — */
    var host = h("div");
    host.style.cssText = "all:initial";
    var shadow = host.attachShadow({ mode: "open" });
    var style = h("style", { text: CSS });
    var wrap = h("div", { class: "fh pos-" + (TH.position === "bottom-right" ? "br" : TH.position === "bottom-left" ? "bl" : TH.position === "top-right" ? "tr" : "tl") + (mountEl ? " mount" : "") });
    shadow.appendChild(style);
    shadow.appendChild(wrap);

    function applyTheme() {
      var scheme = resolveScheme(TH.colorScheme);
      var dark = scheme === "dark";
      var bg = TH.bg && RE_COLOR.test(TH.bg) ? TH.bg : dark ? "#0f172a" : "#ffffff";
      var bgRGB = parseRGB(bg);
      var effDark = bgRGB ? lum(bgRGB) < 0.4 : dark;
      var fg = TH.fg && RE_COLOR.test(TH.fg) ? TH.fg : null;
      if (!fg) {
        // Mặc định lấy màu chữ của trang nếu đọc được rõ trên nền của widget.
        try {
          var bc = parseRGB(getComputedStyle(document.body).color);
          if (bc && bgRGB && contrast(bc, bgRGB) >= 4.5) fg = "rgb(" + bc.join(",") + ")";
        } catch (e) {}
      }
      if (!fg) fg = effDark ? "#e2e8f0" : "#1e293b";
      var ff;
      if (TH.font && FONTS[TH.font]) ff = FONTS[TH.font];
      else {
        try { ff = getComputedStyle(document.body).fontFamily; } catch (e) {}
        ff = ff || FONTS.system;
      }
      var vars = {
        "--_p": TH.primary && RE_COLOR.test(TH.primary) ? TH.primary : dark ? "#2563eb" : "#1d4ed8",
        "--_pt": TH.primaryText && RE_COLOR.test(TH.primaryText) ? TH.primaryText : "#ffffff",
        "--_bg": bg,
        "--_fg": fg,
        "--_bd": TH.border && RE_COLOR.test(TH.border) ? TH.border : effDark ? "#334155" : "#cbd5e1",
        "--_r": TH.radius && RE_LEN.test(TH.radius) ? TH.radius : "12px",
        "--_fs": TH.fontSize && RE_LEN.test(TH.fontSize) ? TH.fontSize : "14px",
        "--_ff": ff,
        "--_ox": TH.offsetX + "px",
        "--_oy": TH.offsetY + "px",
      };
      Object.keys(vars).forEach(function (k) { wrap.style.setProperty(k, vars[k]); });
      wrap.setAttribute("data-scheme", effDark ? "dark" : "light");
    }
    applyTheme();
    try {
      var mq = W.matchMedia("(prefers-color-scheme: dark)");
      if (mq.addEventListener) on(mq, "change", guard(applyTheme));
    } catch (e) {}
    try {
      var mo = new MutationObserver(guard(applyTheme));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
      disposers.push(function () { mo.disconnect(); });
    } catch (e) {}

    /* — gọi API — */
    function api(method, path, o) {
      o = o || {};
      var url = hub + "/api/v1" + path;
      function attempt(n) {
        return (anon ? Promise.resolve(null) : auth.get(n > 0)).then(function (tok) {
          var headers = {};
          if (tok) headers.Authorization = "Bearer " + tok;
          else if (anon) headers["X-Hub-Project"] = project;
          var body;
          if (o.form) body = o.form;
          else if (o.json !== undefined) {
            headers["Content-Type"] = "application/json";
            body = JSON.stringify(o.json);
          }
          return fetch(url, { method: method, headers: headers, body: body, credentials: "omit" }).then(
            function (res) {
              if (res.status === 401 && n === 0 && !anon && auth.hasSource) return attempt(1);
              return res.json().then(function (d) { return d; }, function () { return null; }).then(function (data) {
                return { ok: res.ok, status: res.status, data: data };
              });
            },
            function () { return { ok: false, status: 0, data: null }; }
          );
        });
      }
      return attempt(0);
    }
    function errText(r) {
      if (r.status === 0) return t("err_network");
      if (r.status === 400) return t("err_400", { detail: (r.data && r.data.error) || "" });
      if (r.status === 401) return t("err_401");
      if (r.status === 403) return (r.data && r.data.error ? "⚠️ " + r.data.error : t("err_403"));
      if (r.status === 409) return (r.data && r.data.error ? "⚠️ " + r.data.error : t("err_409"));
      if (r.status === 429) return t("err_429");
      if (r.status === 413) return "⚠️ " + ((r.data && r.data.error) || t("file_big", { name: "" }));
      if (r.status === 415) return "⚠️ " + ((r.data && r.data.error) || t("err_other", { code: 415 }));
      return t("err_other", { code: r.status });
    }
    function attUrl(id) {
      var tok = auth.peek();
      return hub + "/api/v1/attachments/" + encodeURIComponent(id) + (tok ? "?t=" + encodeURIComponent(tok) : "");
    }
    var attRefs = [];
    auth.onToken(function () {
      attRefs = attRefs.filter(function (r) { return r.el.isConnected; });
      attRefs.forEach(function (r) {
        if (r.el.tagName === "A") r.el.href = attUrl(r.id);
        else if (!r.el.complete || !r.el.naturalWidth) r.el.src = attUrl(r.id);
      });
    });

    /* — thời gian — */
    function hhmm(s) {
      try { return new Date(s).toLocaleTimeString(LOC, { hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; }
    }
    /** "29 giây", "2 phút 05 giây", "1 giờ 20 phút" — giữ giây tới mốc 10 phút để người chờ thấy đồng hồ nhúc nhích. */
    function elapsed(from, now) {
      var sec = Math.max(0, Math.floor((now - new Date(from).getTime()) / 1000));
      var us = t("u_s"), um = t("u_m"), uh = t("u_h");
      if (sec < 60) return sec + " " + us;
      var m = Math.floor(sec / 60), s = sec % 60;
      if (m < 10) return m + " " + um + " " + ("0" + s).slice(-2) + " " + us;
      if (m < 60) return m + " " + um;
      return Math.floor(m / 60) + " " + uh + " " + (m % 60) + " " + um;
    }
    function statusLabel(s) {
      return STR["status_" + s] || s;
    }

    /* — giọng nói — */
    var SR = W.SpeechRecognition || W.webkitSpeechRecognition;
    var activeRec = null;
    function stopVoice() {
      try { if (activeRec) activeRec.stop(); } catch (e) {}
    }
    function micButton(onText) {
      if (!SR || !feat.voice) return null;
      var rec = null, listening = false;
      var b = h("button", { type: "button", class: "mic", "aria-label": t("mic_start"), "aria-pressed": "false", title: t("mic_start") }, "🎤");
      function set(v) {
        listening = v;
        b.classList.toggle("rec", v);
        b.setAttribute("aria-pressed", String(v));
        b.setAttribute("aria-label", v ? t("mic_stop") : t("mic_start"));
        b.title = v ? t("mic_stop") : t("mic_start");
      }
      b.addEventListener("click", function () {
        if (listening) { try { rec.stop(); } catch (e) {} return; }
        try {
          rec = new SR();
          rec.lang = TH.locale === "en" ? "en-US" : "vi-VN";
          rec.interimResults = false;
          rec.maxAlternatives = 1;
          rec.onresult = function (e) {
            var text = Array.prototype.map.call(e.results, function (r) { return r[0].transcript; }).join(" ").trim();
            if (text) onText(text);
          };
          rec.onend = rec.onerror = function () { set(false); if (activeRec === rec) activeRec = null; };
          activeRec = rec;
          rec.start();
          set(true);
        } catch (e) { set(false); }
      });
      return b;
    }
    function appendText(el, text) {
      var v = el.value.trim();
      el.value = (v ? v + " " + text : text).slice(0, Number(el.maxLength) > 0 ? el.maxLength : 20000);
    }

    /* ──────────────────── Biểu mẫu gửi góp ý ──────────────────── */
    var F = {};
    var form = h("form", { class: "form", novalidate: "" });

    // đề xuất sửa chữ đang bôi đen
    F.offerText = h("span");
    F.offer = h("div", { class: "note", hidden: true }, [
      F.offerText,
      h("button", { type: "button", class: "btn sm", onclick: guard(useSelection) }, t("offer_btn")),
    ]);
    form.appendChild(F.offer);

    // phạm vi
    if (feat.scopePicker) {
      F.scopeBtns = {};
      var seg = h("div", { class: "seg", role: "group", "aria-label": t("scope_label") });
      [["page", "scope_page"], ["system", "scope_system"]].forEach(function (p) {
        var b = h("button", { type: "button", "aria-pressed": p[0] === "page" ? "true" : "false", onclick: function () { setScope(p[0]); } }, t(p[1]));
        F.scopeBtns[p[0]] = b;
        seg.appendChild(b);
      });
      form.appendChild(seg);
    }

    // chỉ phần tử
    if (feat.elementPicker) {
      F.chip = h("span", { class: "chip", hidden: true });
      F.pickRow = h("div", { class: "row" }, [
        h("button", { type: "button", class: "btn sm", onclick: guard(startPick) }, t("pick")),
        F.chip,
      ]);
      form.appendChild(F.pickRow);
    }

    // loại + mô hình
    var typeRow = h("div", { class: "row" });
    if (formTypes.length > 1) {
      F.type = h("select", { class: "in grow", "aria-label": t("type_label") }, formTypes.map(function (x) { return h("option", { value: x.id, text: x.label || x.id }); }));
      F.type.addEventListener("change", guard(onTypeChange));
      typeRow.appendChild(F.type);
    }
    if (models.length) {
      F.model = h("select", { class: "in grow", "aria-label": t("model_label"), title: t("model_label") }, models.map(function (m) { return h("option", { value: m.id, text: "🤖 " + (m.label || m.id) }); }));
      typeRow.appendChild(F.model);
    }
    if (typeRow.children.length) form.appendChild(typeRow);

    // sửa chữ (loại nội dung)
    F.before = h("textarea", { class: "in", rows: "2", maxlength: "2000", "aria-label": t("before_label") });
    F.after = h("textarea", { class: "in", rows: "2", maxlength: "2000", "aria-label": t("after_label") });
    F.sug = h("div", { class: "sug", hidden: true }, [
      h("div", null, [h("label", { text: t("before_label") }), F.before]),
      h("div", null, [h("label", { text: t("after_label") }), F.after]),
    ]);
    form.appendChild(F.sug);

    // tiêu đề + mô tả
    F.title = h("input", { class: "in", maxlength: "200", "aria-label": t("title_aria"), autocomplete: "off" });
    form.appendChild(F.title);
    F.body = h("textarea", { class: "in", rows: "3", maxlength: "20000", "aria-label": t("body_aria"), placeholder: feat.attachments ? t("body_ph") : t("body_ph_plain") });
    var bodyMic = micButton(function (x) { appendText(F.body, x); });
    form.appendChild(h("div", { class: "rel" }, [F.body, bodyMic]));
    if (feat.attachments) on(F.body, "paste", guard(onPaste));

    // ảnh chụp trang (tự động, người gửi bỏ được)
    var shotMode = feat.screenshot === "off" ? "off" : feat.screenshot === "default" ? "default" : "optional";
    var shotLibP = null, shotSeq = 0, maskSel = 'input[type="password"],input[autocomplete^="cc-"],[data-feedbackhub-mask]' + (opts.mask ? "," + opts.mask : "");
    if (shotMode !== "off") {
      F.shot = h("input", { type: "checkbox", id: "fh-shot" });
      F.shot.checked = shotMode === "default";
      F.shotImg = h("img", { alt: "", hidden: true });
      F.shotNote = h("div", { class: "hint", "aria-live": "polite" });
      F.shotRe = h("button", { type: "button", class: "btn sm", hidden: true, onclick: function () { captureShot(); } }, t("shot_retake"));
      form.appendChild(h("div", { class: "shot" }, [
        h("label", { class: "chk" }, [F.shot, t("shot_label")]),
        F.shotImg, F.shotNote, F.shotRe,
      ]));
      on(F.shot, "change", guard(function () { if (F.shot.checked && !S.shot) captureShot(); else paintShot(); }));
    }

    if (feat.successCriteria) {
      F.criteria = h("input", { class: "in", maxlength: "300", placeholder: t("criteria_ph"), "aria-label": t("criteria_ph") });
      form.appendChild(F.criteria);
    }
    if (feat.planApproval) {
      F.plan = h("input", { type: "checkbox", id: "fh-plan" });
      form.appendChild(h("label", { class: "chk" }, [F.plan, t("plan_check")]));
    }
    if (anon) {
      F.name = h("input", { class: "in", maxlength: "120", placeholder: t("anon_name"), "aria-label": t("anon_name"), autocomplete: "name" });
      F.email = h("input", { class: "in", type: "email", maxlength: "200", placeholder: t("anon_email"), "aria-label": t("anon_email"), autocomplete: "email" });
      form.appendChild(h("div", { class: "row" }, [h("div", { class: "grow" }, F.name), h("div", { class: "grow" }, F.email)]));
    }

    // tệp
    F.filesBox = h("div", { class: "files", hidden: true });
    var actions = h("div", { class: "row" });
    if (feat.attachments) {
      form.appendChild(F.filesBox);
      F.fileInput = h("input", { type: "file", multiple: "", accept: ".doc,.docx,.pdf,.xls,.xlsx,.png,.jpg,.jpeg", hidden: true, tabindex: "-1" });
      F.fileInput.addEventListener("change", guard(function () {
        addFiles(Array.prototype.slice.call(F.fileInput.files || []));
        F.fileInput.value = "";
      }));
      actions.appendChild(F.fileInput);
      actions.appendChild(h("button", { type: "button", class: "btn sm", onclick: function () { F.fileInput.click(); } }, t("attach")));
    }
    F.submit = h("button", { type: "submit", class: "btn pri", style: "margin-left:auto" }, executeMode ? t("submit_ai") : t("submit"));
    actions.appendChild(F.submit);
    form.appendChild(actions);
    F.msg = h("div", { class: "msg", role: "status", "aria-live": "polite" });
    form.appendChild(F.msg);
    F.dup = h("div", { class: "warn", hidden: true });
    form.appendChild(F.dup);

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      guard(function () { submit(false); })();
    });

    /* ── trạng thái biểu mẫu ── */
    function kindOf(id) {
      var d = allTypes.filter(function (x) { return x.id === id; })[0];
      return d ? d.kind : "other";
    }
    function curType() {
      return F.type ? F.type.value : formTypes[0] ? formTypes[0].id : undefined;
    }
    function onTypeChange() {
      var isContent = kindOf(curType()) === "content";
      F.sug.hidden = !isContent;
    }
    function setScope(v) {
      S.scope = v;
      if (F.scopeBtns) Object.keys(F.scopeBtns).forEach(function (k) { F.scopeBtns[k].setAttribute("aria-pressed", String(k === v)); });
      if (F.pickRow) F.pickRow.hidden = v !== "page";
      F.title.placeholder = v === "system" ? t("title_ph_system") : t("title_ph_page");
    }
    setScope("page");
    function paintChip() {
      if (!F.chip) return;
      F.chip.textContent = "";
      F.chip.hidden = !S.target;
      if (S.target) {
        F.chip.appendChild(document.createTextNode(t("picked", { label: S.target.label })));
        F.chip.appendChild(h("button", { type: "button", "aria-label": t("unpick"), onclick: function () { S.target = null; paintChip(); } }, "✕"));
      }
    }
    function contentType() {
      return formTypes.filter(function (x) { return x.kind === "content"; })[0];
    }
    function showOffer() {
      var ct = contentType();
      if (!S.sel || !ct) { F.offer.hidden = true; return; }
      F.offerText.textContent = t("offer", { text: S.sel.length > 80 ? S.sel.slice(0, 80) + "…" : S.sel });
      F.offer.hidden = false;
    }
    function useSelection() {
      var ct = contentType();
      if (!ct || !S.sel) return;
      if (F.type) F.type.value = ct.id;
      onTypeChange();
      F.before.value = S.sel.slice(0, 2000);
      // Tiêu đề trống hoặc vẫn là tiêu đề widget tự điền lần trước (người dùng chưa sửa) → đặt theo đoạn mới.
      if (!F.title.value.trim() || F.title.value === S.autoTitle) {
        F.title.value = t("suggest_title", { text: S.sel.replace(/\s+/g, " ").slice(0, 40) });
        S.autoTitle = F.title.value;
      }
      S.sel = null;
      F.offer.hidden = true;
      F.after.focus();
    }
    onTypeChange();

    /* — ảnh chụp trang — */
    function maskNode(n) {
      try {
        if (n.nodeType !== 1 || !n.matches || !n.matches(maskSel)) return;
        if ("value" in n) { try { n.value = ""; } catch (e) {} n.setAttribute("value", ""); }
        while (n.firstChild) n.removeChild(n.firstChild);
        ["background", "color", "border-color"].forEach(function (k) { n.style.setProperty(k, k === "color" ? "transparent" : "#4b5563", "important"); });
      } catch (e) {}
    }
    var shotUrl = null;
    function paintShot() {
      if (!F.shot) return;
      if (shotUrl) { URL.revokeObjectURL(shotUrl); shotUrl = null; }
      var on_ = F.shot.checked;
      F.shotImg.hidden = !(on_ && S.shot);
      if (on_ && S.shot) { shotUrl = URL.createObjectURL(S.shot); F.shotImg.src = shotUrl; }
      F.shotRe.hidden = !on_ || S.shotBusy;
      F.shotNote.textContent = !on_ ? "" : S.shotBusy ? t("shot_busy") : S.shotFail ? t("shot_fail") : t("shot_hint");
    }
    function captureShot() {
      if (!F.shot || !F.shot.checked) return Promise.resolve();
      var seq = ++shotSeq;
      S.shotBusy = true; S.shotFail = false; S.shot = null;
      paintShot();
      S.shotP = (shotLibP || (shotLibP = import(hub + "/vendor/modern-screenshot.mjs")))
        .then(function (lib) {
          var vw = window.innerWidth, vh = window.innerHeight;
          return lib.domToBlob(document.documentElement, {
            width: vw, height: vh,
            scale: Math.max(0.5, Math.min(window.devicePixelRatio || 1, 1600 / vw)),
            style: { transform: "translate(" + -window.scrollX + "px," + -window.scrollY + "px)", transformOrigin: "0 0" },
            filter: function (n) { return n !== host; },
            onCloneEachNode: maskNode,
            backgroundColor: "#ffffff",
            type: "image/png",
          });
        })
        .then(function (blob) {
          if (seq !== shotSeq) return;
          if (!blob || !blob.size || blob.size > MAX_BYTES) throw new Error("ảnh rỗng hoặc quá lớn");
          S.shot = new File([blob], "trang-chup.png", { type: "image/png" });
        })
        .catch(function (e) { if (seq === shotSeq) { S.shotFail = true; log("Chụp trang lỗi:", e); } })
        .then(function () { if (seq === shotSeq) { S.shotBusy = false; paintShot(); } });
      return S.shotP;
    }
    disposers.push(function () { if (shotUrl) URL.revokeObjectURL(shotUrl); });

    /* — tệp đính kèm — */
    function renamePasted(f, n) {
      var ext = f.type === "image/jpeg" ? "jpg" : f.type.split("/")[1];
      var d = new Date();
      var p2 = function (x) { return ("0" + x).slice(-2); };
      return new File([f], "anh-dan-" + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + "-" + n + "." + ext, { type: f.type });
    }
    function addFiles(list) {
      var msgs = [];
      list.forEach(function (f) {
        if (f.size > MAX_BYTES) { msgs.push(t("file_big", { name: f.name })); return; }
        if (S.files.length >= MAX_FILES) { if (msgs.indexOf(t("file_many")) < 0) msgs.push(t("file_many")); return; }
        S.files.push(f);
      });
      F.msg.textContent = msgs.join(" ");
      paintFiles();
    }
    function onPaste(e) {
      var cd = e.clipboardData;
      if (!cd) return;
      var imgs = Array.prototype.filter.call(cd.files || [], function (f) { return PASTE_TYPES.indexOf(f.type) >= 0; });
      if (!imgs.length) return;
      if (!cd.getData("text/plain")) e.preventDefault();
      var base = S.files.length;
      addFiles(imgs.map(function (f, i) { return renamePasted(f, base + i + 1); }));
    }
    var objUrls = [];
    function paintFiles() {
      objUrls.forEach(function (u) { URL.revokeObjectURL(u); });
      objUrls = [];
      F.filesBox.textContent = "";
      F.filesBox.hidden = !S.files.length;
      S.files.forEach(function (f, i) {
        var thumb;
        if (/^image\//.test(f.type)) {
          var u = URL.createObjectURL(f);
          objUrls.push(u);
          thumb = h("img", { src: u, alt: f.name, title: f.name });
        } else thumb = h("div", { class: "fn", title: f.name }, "📎 " + f.name);
        F.filesBox.appendChild(h("div", { class: "pf" }, [
          thumb,
          h("button", { type: "button", "aria-label": t("remove", { name: f.name }), onclick: function () { S.files.splice(i, 1); paintFiles(); } }, "✕"),
        ]));
      });
    }
    disposers.push(function () { objUrls.forEach(function (u) { URL.revokeObjectURL(u); }); });

    /* ── gửi ── */
    function setMsg(s) { F.msg.textContent = s || ""; }
    function resetForm() {
      F.title.value = "";
      F.body.value = "";
      F.before.value = "";
      F.after.value = "";
      if (F.criteria) F.criteria.value = "";
      if (F.plan) F.plan.checked = false;
      S.files = [];
      S.shot = null; S.shotFail = false;
      if (F.shot) { F.shot.checked = shotMode === "default"; paintShot(); }
      S.target = null;
      S.sel = null;
      F.offer.hidden = true;
      paintFiles();
      paintChip();
    }
    function submit(allowDuplicate) {
      var title = F.title.value.trim();
      if (title.length < 4) { setMsg(t("err_title")); F.title.focus(); return Promise.resolve(); }
      var email = F.email ? F.email.value.trim() : "";
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setMsg(t("err_email")); return Promise.resolve(); }
      S.busy = true;
      F.submit.disabled = true;
      F.dup.hidden = true;
      setMsg(t("sending"));
      var typeId = curType();
      var payload = {
        title: title, scope: S.scope, source: "widget", pagePath: safePath(), pageUrl: safeUrl(),
      };
      if (typeId) payload.type = typeId;
      var body = F.body.value.trim();
      if (body) payload.body = body;
      if (S.scope === "page" && S.target) payload.pageTarget = (S.target.selector + " | " + S.target.text).slice(0, 500);
      if (kindOf(typeId) === "content") {
        var b = F.before.value.trim(), a = F.after.value.trim();
        if (b || a) payload.suggestion = { before: b.slice(0, 2000), after: a.slice(0, 2000) };
      }
      if (F.criteria && F.criteria.value.trim()) payload.successCriteria = F.criteria.value.trim().slice(0, 300);
      if (F.plan && F.plan.checked) payload.requirePlan = true;
      if (F.model && F.model.value) { payload.aiModel = F.model.value; payload.aiProvider = "claude"; }
      if (allowDuplicate) payload.allowDuplicate = true;
      if (anon) {
        if (F.name.value.trim()) payload.name = F.name.value.trim();
        if (email) payload.email = email;
      }
      // Ngữ cảnh tự động (ứng dụng chủ ghi đè được qua getContext): tiêu đề trang, cỡ màn hình, ngôn ngữ.
      var autoExtra = { pageTitle: String(document.title || "").slice(0, 200), viewport: window.innerWidth + "x" + window.innerHeight, lang: String(navigator.language || "").slice(0, 20) };
      var hostExtra = {};
      if (typeof opts.getContext === "function") {
        try {
          var c = opts.getContext() || {};
          if (typeof c.contentRef === "string") payload.contentRef = c.contentRef.slice(0, 200);
          if (c.extra && typeof c.extra === "object") hostExtra = c.extra;
        } catch (e) { log("getContext lỗi:", e); }
      }
      payload.extra = Object.assign(autoExtra, hostExtra);
      var wantShot = Boolean(F.shot && F.shot.checked);
      return api("POST", "/feedback", { json: payload }).then(function (r) {
        if (r.status === 409 && r.data && r.data.duplicateOf) {
          showDup(r.data.duplicateOf);
          setMsg("");
          return;
        }
        if (!r.ok) { setMsg(errText(r)); return; }
        var id = r.data && r.data.feedback && r.data.feedback.id;
        var files = S.files.slice();
        var failed = [];
        // Chờ ảnh chụp trang (nếu còn đang chụp) rồi tải lần lượt, không song song: đỡ dồn nhiều ảnh lớn cùng lúc và biết chính xác tệp nào hỏng.
        var chain = (wantShot && S.shotP ? S.shotP : Promise.resolve()).then(function () {
          if (wantShot && S.shot) files.push(S.shot);
          return files.reduce(function (p, f, i) {
            return p.then(function () {
              if (!id) return;
              setMsg(t("uploading", { i: i + 1, n: files.length }));
              var fd = new FormData();
              fd.append("file", f);
              return api("POST", "/feedback/" + encodeURIComponent(id) + "/attachments", { form: fd }).then(function (u) { if (!u.ok) failed.push(f.name); });
            });
          }, Promise.resolve());
        });
        return chain.then(function () {
          resetForm();
          setMsg(failed.length ? t("sent_fail", { names: failed.join(", ") }) : executeMode ? t("sent_ai") : t("sent"));
          if (!anon && id) {
            S.openId = id;
            return loadList().then(function () { revealCard(id); });
          }
        });
      }).then(function () {
        S.busy = false;
        F.submit.disabled = false;
      }, function (e) {
        log(e);
        S.busy = false;
        F.submit.disabled = false;
        setMsg(t("err_network"));
      });
    }
    function showDup(d) {
      F.dup.textContent = "";
      F.dup.appendChild(h("div", { text: t("dup", { title: d.title, status: statusLabel(d.status) }) }));
      F.dup.appendChild(h("div", { class: "row" }, [
        h("button", { type: "button", class: "btn sm", onclick: function () {
          F.dup.hidden = true;
          S.openId = d.id;
          loadList().then(function () { revealCard(d.id); });
        } }, t("dup_open")),
        h("button", { type: "button", class: "btn sm", onclick: function () { guard(function () { submit(true); })(); } }, t("dup_again")),
      ]));
      F.dup.hidden = false;
    }

    /* ──────────────────── Danh sách + thẻ góp ý ──────────────────── */
    var listSec = null, listHead, awaitBox, listEl, emptyEl;
    if (!anon) {
      listHead = h("div", { class: "lh" });
      awaitBox = h("div", { class: "warn", hidden: true });
      listEl = h("div", { class: "list" });
      emptyEl = h("div", { class: "empty", text: t("list_empty") });
      listSec = h("div", { class: "lsec" }, [listHead, awaitBox, emptyEl, listEl]);
    }

    function spinner() { return h("span", { class: "spin", "aria-hidden": "true" }); }

    function makeCard(initial) {
      var item = initial, isOpen = false, built = false, loadedAt = null, msgs = [], atts = [];
      var busy = false, stopAsk = false;
      var D = {};
      var titleEl = h("span", { class: "ct" });
      var modelEl = h("span", { class: "pill pm", hidden: true });
      var clockEl = h("span", { class: "clk" });
      var pillEl = h("span", { class: "pill" });
      var head = h("button", { type: "button", class: "card-h", "aria-expanded": "false", onclick: function () { toggle(item.id); } }, [titleEl, modelEl, clockEl, pillEl]);
      var el = h("div", { class: "card" }, [head]);
      var liveTxt = null;

      // Chế độ thu nhận (collect) không có AI nhận việc; riêng Hỏi đáp luôn có bộ trả lời riêng.
      function aiHandles() { return executeMode || item.kind === "question"; }
      function running() { return aiHandles() && RUNNING.indexOf(item.status) >= 0; }
      function since() { return item.status === "pending" ? item.createdAt : item.updatedAt; }

      function paintHead() {
        titleEl.textContent = item.title;
        head.setAttribute("aria-label", t("open_card", { title: item.title }));
        var m = item.aiModel && models.filter(function (x) { return x.id === item.aiModel; })[0];
        modelEl.hidden = !m;
        if (m) { modelEl.textContent = m.label || m.id; modelEl.title = t("model_badge", { m: m.label || m.id }); }
        pillEl.className = "pill st-" + (STATUS_IDS.indexOf(item.status) >= 0 ? item.status : "pending");
        pillEl.textContent = "";
        if (item.status === "reviewing" || item.status === "deploying") pillEl.appendChild(spinner());
        else if (item.status === "pending") pillEl.appendChild(h("span", { class: "dot", "aria-hidden": "true" }));
        pillEl.appendChild(document.createTextNode(statusLabel(item.status)));
        tick(Date.now());
      }
      function tick(now) {
        clockEl.textContent = running() ? t("ran_for", { t: elapsed(since(), now) }) : "";
        if (liveTxt) liveTxt.textContent = t("live_" + item.status, { t: elapsed(since(), now) });
      }

      function build() {
        built = true;
        D.meta = h("div", { class: "meta" });
        D.target = h("div", { class: "tgt", hidden: true });
        D.suggest = h("div", { class: "tgt", hidden: true });
        D.body = h("div", { class: "txt" });
        D.atts = h("div", { class: "atts", hidden: true });
        D.tl = h("ol", { class: "tl" });
        D.dyn = h("div", { style: "display:flex;flex-direction:column;gap:10px" });
        D.err = h("div", { class: "err", role: "alert" });
        D.reply = h("input", { class: "in", maxlength: "20000", "aria-label": t("reply_aria") });
        D.reply.addEventListener("keydown", function (e) {
          if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); sendReply(); }
        });
        D.send = h("button", { type: "button", class: "btn sm", style: "background:var(--fg);color:var(--bg);border-color:var(--fg)", onclick: sendReply }, t("reply_send"));
        var rmic = micButton(function (x) { appendText(D.reply, x); });
        if (rmic) rmic.style.cssText = "top:50%;transform:translateY(-50%)";
        D.hint = h("div", { class: "meta", hidden: true, text: t("reply_hint") });
        D.root = h("div", { class: "card-b" }, [
          D.meta, D.target, D.suggest, D.body, D.atts, D.tl, D.dyn, D.err,
          h("div", { class: "row", style: "flex-wrap:nowrap" }, [h("div", { class: "rel grow" }, [D.reply, rmic]), D.send]),
          D.hint,
        ]);
        el.appendChild(D.root);
      }

      function paintMeta() {
        var tdef = item.type && allTypes.filter(function (x) { return x.id === item.type; })[0];
        var bits = [];
        if (tdef && tdef.kind !== "other") bits.push(tdef.label);
        bits.push(t("sent_at", { t: hhmm(item.createdAt), e: elapsed(item.createdAt, Date.now()) }));
        if (item.scope === "system") bits.push(t("whole_system"));
        else if (item.pagePath) bits.push(t("from_page", { p: item.pagePath }));
        if (item.reporterId && myUid && item.reporterId !== myUid) bits.push(t("by", { name: item.reporterName || "?" }));
        D.meta.textContent = bits.join(" · ");
        var pt = item.pageTarget ? (String(item.pageTarget).split(" | ")[1] || item.pageTarget) : "";
        D.target.hidden = !pt;
        D.target.textContent = pt ? t("target_note", { t: pt }) : "";
        var sg = item.suggestion && typeof item.suggestion === "object" ? item.suggestion : null;
        D.suggest.hidden = !sg;
        D.suggest.textContent = sg ? t("suggest_note", { before: String(sg.before || "").slice(0, 120), after: String(sg.after || "").slice(0, 120) }) : "";
        D.body.textContent = item.body || "";
        D.body.hidden = !item.body;
        D.reply.placeholder = item.status === "awaiting_user" ? t("reply_ph_wait") : t(aiHandles() ? "reply_ph" : "reply_ph_plain");
        D.hint.hidden = item.status !== "awaiting_user" || !aiHandles();
      }
      function paintAtts() {
        D.atts.textContent = "";
        D.atts.hidden = !atts.length;
        atts.forEach(function (a) {
          var isImg = /^image\//.test(a.mimeType || "");
          var link = h("a", { href: attUrl(a.id), target: "_blank", rel: "noopener", title: a.fileName, class: isImg ? "" : "fl" });
          attRefs.push({ el: link, id: a.id });
          if (isImg) {
            var img = h("img", { class: "thumb", src: attUrl(a.id), alt: a.fileName, loading: "lazy" });
            attRefs.push({ el: img, id: a.id });
            link.appendChild(img);
          } else link.textContent = "📎 " + a.fileName;
          D.atts.appendChild(link);
        });
      }
      function paintTimeline() {
        D.tl.textContent = "";
        msgs.forEach(function (m) {
          var kind = m.kind || "chat";
          var chat = kind === "chat";
          var icon = kind === "system" ? "⚙️" : kind === "progress" ? "•" : m.role === "ai" ? "🤖" : m.role === "admin" ? "🛠️" : "👤";
          var name = m.authorName || (kind === "system" || m.role === "system" ? t("author_system") : m.role === "ai" ? t("author_ai") : m.role === "admin" ? t("author_admin") : t("author_user"));
          D.tl.appendChild(h("li", { class: chat ? "" : "dim" }, [
            h("div", { class: "mh" }, [h("span", { text: icon, "aria-hidden": "true" }), h("span", { text: name }), h("span", { text: "· " + hhmm(m.createdAt) })]),
            h("div", { class: "mb" + (chat ? "" : " soft"), text: m.body }),
          ]));
        });
        liveTxt = null;
        if (running()) {
          liveTxt = h("span");
          D.tl.appendChild(h("li", { class: "live" }, [
            item.status === "pending" ? h("span", { class: "dot", "aria-hidden": "true" }) : spinner(),
            liveTxt,
          ]));
          tick(Date.now());
        }
      }
      function renderDyn() {
        D.dyn.textContent = "";
        var st = item.status;
        if (aiHandles() && (st === "pending" || st === "reviewing")) {
          if (item.stopRequestedAt) {
            D.dyn.appendChild(h("div", { class: "meta row" }, [spinner(), t("stopping")]));
          } else if (stopAsk) {
            var no = h("button", { type: "button", class: "btn sm", onclick: function () { stopAsk = false; renderDyn(); } }, t("stop_no"));
            D.dyn.appendChild(h("div", { class: "warn", role: "alertdialog", "aria-label": t("stop") }, [
              h("div", { text: t("stop_q") }),
              h("div", { class: "row" }, [
                h("button", { type: "button", class: "btn sm dg", onclick: function () { stopAsk = false; act({ stop: true }); } }, t("stop_yes")),
                no,
              ]),
            ]));
            setTimeout(function () { try { no.focus(); } catch (e) {} }, 0);
          } else {
            D.dyn.appendChild(h("div", null, h("button", { type: "button", class: "btn sm dg", disabled: busy, onclick: function () { stopAsk = true; renderDyn(); } }, t("stop"))));
          }
        }
        if (st === "awaiting_user" && item.planApproval === "requested") {
          D.dyn.appendChild(h("div", { class: "warn" }, [
            h("div", { text: t("plan_q") }),
            h("div", null, h("button", { type: "button", class: "btn sm ok", disabled: busy, onclick: function () { act({ planApproval: "approved" }); } }, t("plan_btn"))),
          ]));
        }
        if (st === "done" && !item.userVerdict) {
          D.dyn.appendChild(h("div", { class: "okbox" }, [
            h("div", { style: "font-weight:600", text: t("verdict_q") }),
            h("div", { class: "row" }, [
              h("button", { type: "button", class: "btn sm ok", disabled: busy, onclick: function () { act({ userVerdict: "accepted" }); } }, t("verdict_yes")),
              h("button", { type: "button", class: "btn sm dg", disabled: busy, onclick: function () { act({ userVerdict: "rejected" }); } }, t("verdict_no")),
            ]),
          ]));
        }
        if (item.userVerdict === "accepted") D.dyn.appendChild(h("div", { class: "meta", style: "font-weight:600", text: t("verdict_ok") }));
        else if (item.userVerdict === "rejected" && st !== "done") D.dyn.appendChild(h("div", { class: "meta", text: t("verdict_bad") }));
      }
      function loadDetail() {
        loadedAt = item.updatedAt;
        var id = item.id;
        return api("GET", "/feedback/" + encodeURIComponent(id)).then(function (r) {
          if (!r.ok || !r.data || !built) return;
          msgs = (r.data.feedback && r.data.feedback.messages) || [];
          atts = r.data.attachments || [];
          paintAtts();
          paintTimeline();
        });
      }
      function act(payload) {
        busy = true;
        D.err.textContent = "";
        renderDyn();
        return api("PATCH", "/feedback/" + encodeURIComponent(item.id), { json: payload }).then(function (r) {
          busy = false;
          D.err.textContent = r.ok ? "" : errText(r);
          renderDyn();
          return Promise.all([loadList(), loadSummary(), isOpen ? loadDetail() : null]).then(function () { return r.ok; });
        });
      }
      function sendReply() {
        var text = D.reply.value.trim();
        if (!text || D.send.disabled) return;
        D.send.disabled = true;
        act({ message: text }).then(function (ok) {
          D.send.disabled = false;
          if (ok) D.reply.value = "";
        });
      }

      function setOpen(v) {
        isOpen = v;
        head.setAttribute("aria-expanded", String(v));
        if (v && !built) build();
        if (built) D.root.hidden = !v;
        if (v) {
          paintMeta();
          renderDyn();
          paintTimeline();
          loadDetail();
        }
      }
      function update(next) {
        var changed = next.updatedAt !== item.updatedAt || next.status !== item.status;
        item = next;
        paintHead();
        if (isOpen && built) {
          // Chỉ vẽ lại khi có thay đổi thật: vẽ lại mỗi nhịp làm mất vùng bôi chọn và tiêu điểm của người dùng.
          if (changed) { paintMeta(); renderDyn(); }
          if (changed || loadedAt !== item.updatedAt) loadDetail();
        }
      }
      paintHead();
      return { id: initial.id, el: el, update: update, setOpen: setOpen, tick: tick, running: running, isOpen: function () { return isOpen; }, item: function () { return item; } };
    }

    function toggle(id) {
      S.openId = S.openId === id ? null : id;
      Object.keys(S.cards).forEach(function (k) { S.cards[k].setOpen(k === S.openId); });
    }

    function renderList() {
      if (anon) return;
      var items = S.items;
      listHead.textContent = t("list_title", { n: items.length });
      emptyEl.hidden = items.length > 0;
      var aw = S.awaiting;
      awaitBox.hidden = !aw.length;
      awaitBox.textContent = aw.length ? t("awaiting_box", { n: aw.length }) : "";
      var ordered = items.filter(function (r) { return aw.indexOf(r.id) >= 0; }).concat(items.filter(function (r) { return aw.indexOf(r.id) < 0; }));
      var seen = {};
      ordered.forEach(function (it, idx) {
        seen[it.id] = true;
        var c = S.cards[it.id];
        if (!c) {
          c = S.cards[it.id] = makeCard(it);
          if (S.openId === it.id) c.setOpen(true);
        } else c.update(it);
        if (listEl.children[idx] !== c.el) listEl.insertBefore(c.el, listEl.children[idx] || null);
      });
      Object.keys(S.cards).forEach(function (k) {
        if (!seen[k]) { S.cards[k].el.remove(); delete S.cards[k]; }
      });
    }
    function revealCard(id) {
      var c = S.cards[id];
      if (!c) return;
      S.openId = id;
      Object.keys(S.cards).forEach(function (k) {
        var want = k === id;
        if (S.cards[k].isOpen() !== want) S.cards[k].setOpen(want);
      });
      try { c.el.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } catch (e) {}
      c.el.classList.remove("flash");
      void c.el.offsetWidth;
      c.el.classList.add("flash");
    }

    function loadList() {
      if (anon) return Promise.resolve();
      return api("GET", "/feedback").then(function (r) {
        if (!r.ok || !r.data) return;
        S.items = (r.data.items || []).filter(function (x) { return x.kind !== "question"; });
        renderList();
      });
    }
    function loadSummary() {
      if (anon) return Promise.resolve();
      return api("GET", "/feedback?summary=1").then(function (r) {
        if (!r.ok || !r.data || !Array.isArray(r.data.awaitingIds)) return;
        S.awaiting = r.data.awaitingIds;
        paintBadge();
        renderList();
      });
    }

    /* ──────────────────── Nút nổi, ngăn kéo ──────────────────── */
    var fab = null, badge = null, drawer = null, scrim = null, titleSub = null, closeBtn = null, panel = null;
    var fabEnabled = !mountEl && opts.fab !== false;
    if (!mountEl) {
      fab = h("button", { type: "button", class: "fab", "aria-haspopup": "dialog", "aria-expanded": "false", onclick: guard(function () { S.openedVia = "fab"; setOpen(!S.open); }) });
      badge = h("span", { class: "badge", hidden: true, "aria-hidden": "true" });
      wrap.appendChild(fab);
      scrim = h("div", { class: "scrim", hidden: true, onclick: guard(function () { setOpen(false); }) });
      titleSub = h("div", { class: "hd-s" });
      closeBtn = h("button", { type: "button", class: "x", "aria-label": t("close"), onclick: guard(function () { setOpen(false); }) }, "✕");
      var scroller = h("div", { class: "scroll" });
      drawer = h("aside", { class: "drawer", role: "dialog", "aria-modal": "true", "aria-label": t("title"), hidden: true }, [
        h("header", { class: "hd" }, [h("div", { style: "min-width:0" }, [h("div", { class: "hd-t", text: t("title") }), titleSub]), closeBtn]),
        scroller,
      ]);
      wrap.appendChild(scrim);
      wrap.appendChild(drawer);
      scroller.appendChild(form);
      if (listSec) scroller.appendChild(listSec);
      on(drawer, "keydown", guard(trapTab));
      paintFab();
    } else {
      panel = h("div", { class: "panel" }, [h("div", { class: "hd-t", text: t("title") }), form]);
      if (listSec) panel.appendChild(listSec);
      wrap.appendChild(panel);
    }
    var pickBar = h("div", { class: "pk-bar", role: "status" });
    var pickBox = h("div", { class: "pk-box", hidden: true });
    var pickLayer = h("div", { class: "pk", hidden: true }, [pickBox, pickBar]);
    wrap.appendChild(pickLayer);

    function trapTab(e) {
      if (e.key !== "Tab") return;
      var nodes = Array.prototype.filter.call(drawer.querySelectorAll("button,input,textarea,select,a[href]"), function (n) {
        return !n.disabled && n.type !== "hidden" && n.getClientRects().length > 0;
      });
      if (!nodes.length) return;
      var first = nodes[0], last = nodes[nodes.length - 1];
      var act = shadow.activeElement;
      if (e.shiftKey && (act === first || !act)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
    }

    function paintFab() {
      paintLaunchers();
      if (!fab) return;
      fab.hidden = !fabEnabled || S.fabHidden || S.pathHidden;
      fab.textContent = "";
      fab.appendChild(document.createTextNode(S.open ? "✕" : ICONS[TH.icon]));
      var n = S.awaiting.length;
      if (!S.open && n > 0) fab.appendChild(badge);
      var label = n ? t("fab_wait", { n: n }) : TH.label || t("fab_tip");
      fab.title = label;
      fab.setAttribute("aria-label", S.open ? t("close") : label);
      fab.setAttribute("aria-expanded", String(S.open));
    }
    function paintBadge() {
      if (badge) badge.textContent = S.awaiting.length > 99 ? "99+" : String(S.awaiting.length);
      if (badge) badge.hidden = !S.awaiting.length;
      paintFab();
    }

    /* ── đồng hồ + làm mới định kỳ ── */
    var timers = { poll: null, clock: null, summary: null };
    function visible() { return document.visibilityState === "visible"; }
    function startOpenTimers() {
      stopOpenTimers();
      var n = 0;
      timers.poll = setInterval(guard(function () { if (visible()) { loadList(); loadSummary(); } }), 10000);
      timers.clock = setInterval(guard(function () {
        n++;
        var anyRun = S.items.some(function (r) { return RUNNING.indexOf(r.status) >= 0; });
        if (anyRun || n % 30 === 0) {
          var now = Date.now();
          Object.keys(S.cards).forEach(function (k) { S.cards[k].tick(now); });
        }
      }), 1000);
    }
    function stopOpenTimers() {
      clearInterval(timers.poll);
      clearInterval(timers.clock);
    }

    /* ── mở/đóng ── */
    function emit(open) {
      try { W.dispatchEvent(new CustomEvent("feedbackhub:state", { detail: { open: open } })); } catch (e) {}
      try { if (typeof opts.onState === "function") opts.onState({ open: open }); } catch (e) { log("onState lỗi:", e); }
    }
    function setOpen(v, silentFocus) {
      if (mountEl) return;
      v = !!v;
      if (v === S.open) return;
      S.open = v;
      drawer.hidden = !v;
      scrim.hidden = !v;
      wrap.classList.toggle("open", v);
      paintFab();
      if (v) {
        hideSelBubble();
        S.lastFocus = S.openedVia === "trigger" && S.triggerEl ? S.triggerEl : document.activeElement;
        titleSub.textContent = t("at_page", { path: location.pathname });
        var ts = lastSel && Date.now() - lastSel.at < 120000 ? lastSel.text : null;
        if (ts) { S.sel = ts; lastSel = null; }
        showOffer();
        if (F.shot && F.shot.checked) captureShot();
        loadList();
        loadSummary();
        startOpenTimers();
        setTimeout(function () { try { F.title.focus(); } catch (e) {} }, 0);
      } else {
        stopOpenTimers();
        stopVoice();
        if (!silentFocus) {
          var back = S.openedVia === "trigger" && S.lastFocus && S.lastFocus.isConnected ? S.lastFocus : fab && !fab.hidden ? fab : S.lastFocus;
          try { if (back && back.focus) back.focus(); } catch (e) {}
        }
      }
      emit(v);
    }

    /* ── bôi đen chữ trên trang trước khi mở ── */
    var lastSel = null;
    on(document, "selectionchange", guard(function () {
      var s = document.getSelection && document.getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) return;
      var n = s.anchorNode;
      if (n && (n === host || host.contains(n))) return;
      var txt = s.toString().trim();
      if (txt) lastSel = { text: txt.slice(0, 2000), at: Date.now() };
    }));

    /* ── chọn phần tử bằng chuột (tái tạo useElementPicker) ── */
    var pickHandlers = null;
    function startPick() {
      if (S.picking) return;
      S.picking = true;
      var wasOpen = S.open;
      if (wasOpen) setOpen(false, true);
      pickLayer.hidden = false;
      pickBox.hidden = true;
      var hover = "";
      function paintBar() {
        pickBar.textContent = "";
        pickBar.appendChild(document.createTextNode(t("pick_banner")));
        if (hover) pickBar.appendChild(h("span", { text: " · " + hover }));
        pickBar.appendChild(h("span", { text: " — " + t("pick_esc") }));
      }
      paintBar();
      function targetAt(e) {
        var el = document.elementFromPoint(e.clientX, e.clientY);
        if (!el || el === host || host.contains(el) || (mountEl && mountEl.contains(el) && el === mountEl)) return null;
        return el;
      }
      function finish(picked) {
        if (!S.picking) return;
        S.picking = false;
        ["mousemove", "click", "keydown", "mousedown", "mouseup", "pointerdown", "pointerup"].forEach(function (ev) {
          document.removeEventListener(ev, pickHandlers[ev], true);
        });
        pickHandlers = null;
        pickLayer.hidden = true;
        if (picked) { S.target = picked; setScope("page"); paintChip(); }
        if (wasOpen) { S.openedVia = S.openedVia || "fab"; setOpen(true); }
        else if (mountEl) F.title.focus();
      }
      var swallow = function (e) {
        if (!targetAt(e)) return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
      };
      pickHandlers = {
        mousemove: guard(function (e) {
          var el = targetAt(e);
          if (!el) return;
          var r = el.getBoundingClientRect();
          pickBox.hidden = false;
          pickBox.style.cssText = "top:" + r.top + "px;left:" + r.left + "px;width:" + r.width + "px;height:" + r.height + "px";
          hover = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60);
          paintBar();
        }),
        click: guard(function (e) {
          var el = targetAt(e);
          if (!el) return;
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          var text = (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 120);
          finish({ selector: cssPath(el), text: text, label: text ? "«" + text.slice(0, 40) + "»" : el.tagName.toLowerCase() });
        }),
        keydown: guard(function (e) {
          if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(null); }
        }),
        mousedown: swallow, mouseup: swallow, pointerdown: swallow, pointerup: swallow,
      };
      Object.keys(pickHandlers).forEach(function (ev) { document.addEventListener(ev, pickHandlers[ev], true); });
    }
    disposers.push(function () {
      if (pickHandlers) Object.keys(pickHandlers).forEach(function (ev) { document.removeEventListener(ev, pickHandlers[ev], true); });
    });

    /* ── Esc, trigger, tab hiện lại ── */
    on(document, "keydown", guard(function (e) {
      if (e.key === "Escape" && S.open && !S.picking) setOpen(false);
    }));
    if (opts.trigger) {
      on(document, "click", guard(function (e) {
        var el = e.target && e.target.closest ? e.target.closest(opts.trigger) : null;
        if (!el) return;
        e.preventDefault();
        S.openedVia = "trigger";
        S.triggerEl = el;
        if (mountEl) api_open(); else setOpen(!S.open);
      }), true);
    }
    on(document, "visibilitychange", guard(function () {
      if (visible()) { loadSummary(); if (S.open || mountEl) loadList(); }
    }));
    function api_open() {
      if (mountEl) {
        try { host.scrollIntoView({ block: "start" }); } catch (e) {}
        F.title.focus();
      }
    }

    /* ── ẩn mọi lối vào ở các trang trong features.hidePaths (vd. trang làm bài thi) ── */
    var hidePaths = (Array.isArray(feat.hidePaths) ? feat.hidePaths : []).filter(function (p) {
      return typeof p === "string" && p.charAt(0) === "/";
    });
    function pathHidden() {
      var p = location.pathname;
      return hidePaths.some(function (x) {
        x = x.replace(/\/+$/, "");
        return x ? p === x || p.indexOf(x + "/") === 0 : p === "/";
      });
    }
    function syncPath() {
      var hid = pathHidden();
      if (hid === S.pathHidden) return;
      S.pathHidden = hid;
      if (hid) hideSelBubble();
      paintFab();
    }

    /* ── nút gắn trong trang: ứng dụng chủ chỉ đặt <span data-feedbackhub-launcher hidden></span> ở chỗ muốn ──
       Widget vẽ nút vào Shadow DOM của chính phần tử đó (màu chữ, phông kế thừa từ trang để hợp với thanh header),
       bỏ `hidden` khi đã sẵn sàng; chưa đăng nhập / widget không nạp được thì phần tử vẫn ẩn. Giá trị "label" → có chữ. */
    var launchers = [];
    function bulbSvg() {
      var NS = "http://www.w3.org/2000/svg";
      var s = document.createElementNS(NS, "svg");
      var a = { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round", "aria-hidden": "true" };
      Object.keys(a).forEach(function (k) { s.setAttribute(k, a[k]); });
      ["M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5", "M9 18h6", "M10 22h4"].forEach(function (d) {
        var p = document.createElementNS(NS, "path");
        p.setAttribute("d", d);
        s.appendChild(p);
      });
      return s;
    }
    function mountLaunchers() {
      if (mountEl) return;
      var els;
      try { els = document.querySelectorAll("[data-feedbackhub-launcher]"); } catch (e) { return; }
      Array.prototype.forEach.call(els, function (el) {
        if (el.__fhLauncher) return;
        var root;
        try { root = el.shadowRoot || el.attachShadow({ mode: "open" }); } catch (e) {
          el.__fhLauncher = true;
          log("Không gắn được nút vào phần tử data-feedbackhub-launcher (thẻ này không hỗ trợ Shadow DOM — dùng <span> hoặc <div>).");
          return;
        }
        while (root.firstChild) root.removeChild(root.firstChild);
        var withLabel = el.getAttribute("data-feedbackhub-launcher") === "label";
        var badgeEl = h("span", { class: "b", hidden: true, "aria-hidden": "true" });
        var L = { el: el, root: root, badge: badgeEl, btn: null };
        L.btn = h("button", { type: "button", class: withLabel ? "lb" : "", "aria-haspopup": "dialog", onclick: guard(function () {
          S.openedVia = "trigger";
          S.triggerEl = L.btn;
          setOpen(!S.open);
        }) }, [bulbSvg(), withLabel ? h("span", { text: TH.label || t("launcher_tip") }) : null, badgeEl]);
        root.appendChild(h("style", { text: LAUNCHER_CSS }));
        root.appendChild(L.btn);
        el.__fhLauncher = L;
        launchers.push(L);
      });
      launchers = launchers.filter(function (L) { return L.el.isConnected; });
      paintLaunchers();
    }
    function paintLaunchers() {
      if (!launchers || !launchers.length) return;
      var n = S.awaiting.length;
      var label = n ? t("fab_wait", { n: n }) : TH.label || t("launcher_tip");
      launchers.forEach(function (L) {
        L.el.hidden = S.pathHidden;
        L.btn.title = label;
        L.btn.setAttribute("aria-label", label);
        L.btn.setAttribute("aria-expanded", String(S.open));
        L.badge.textContent = n > 99 ? "99+" : String(n);
        L.badge.hidden = !n;
      });
    }
    disposers.push(function () {
      launchers.forEach(function (L) {
        while (L.root.firstChild) L.root.removeChild(L.root.firstChild);
        L.el.hidden = true;
        L.el.__fhLauncher = null;
      });
      launchers = [];
    });

    /* ── bôi đen chữ → bong bóng "Góp ý đoạn này" (features.textSelection) ──
       Đặt DƯỚI vùng chọn: trên điện thoại, menu chép/dán của hệ điều hành nằm phía trên. Bấm chuột phải (menu riêng của
       ứng dụng) hay cuộn trang thì bong bóng tự ẩn để không chồng lên giao diện của ứng dụng. */
    var selBtn = null, selText = null, selEl = null, selTimer = null;
    function hideSelBubble() {
      if (selBtn) selBtn.hidden = true;
      selText = null;
      selEl = null;
    }
    /* Chỉ những vai trò (claim `role` của token) trong features.selectionRoles được thấy bong bóng; rỗng = mọi người.
       Đây chỉ là cách ẩn giao diện — ai gửi được góp ý vẫn dùng được nút chung. */
    function selectionAllowed() {
      var roles = Array.isArray(feat.selectionRoles) ? feat.selectionRoles : [];
      if (!roles.length) return true;
      var tok = auth.peek();
      var role = tok ? String(jwtPayload(tok).role || "").toLowerCase() : "";
      return !!role && roles.some(function (r) { return String(r).toLowerCase() === role; });
    }
    function selectable(node) {
      var el = node && (node.nodeType === 1 ? node : node.parentElement);
      if (!el || !el.closest) return null;
      if (el.closest("input,textarea,select,[contenteditable]:not([contenteditable='false'])")) return null;
      if (!feat.selectionScope) return el;
      try { return el.closest(feat.selectionScope) ? el : null; } catch (e) { return null; }
    }
    function evalSelection() {
      if (!selBtn) return;
      if (S.open || S.picking || S.pathHidden || !selectionAllowed()) { hideSelBubble(); return; }
      var s = document.getSelection && document.getSelection();
      if (!s || s.isCollapsed || !s.rangeCount) { hideSelBubble(); return; }
      var r = s.getRangeAt(0);
      var el = selectable(r.commonAncestorContainer);
      var txt = s.toString().trim();
      if (!el || txt.replace(/\s+/g, "").length < 2) { hideSelBubble(); return; }
      var rects = r.getClientRects();
      var last = rects.length ? rects[rects.length - 1] : r.getBoundingClientRect();
      if (!last || (!last.width && !last.height)) { hideSelBubble(); return; }
      selText = txt.slice(0, 2000);
      selEl = el;
      selBtn.hidden = false;
      var bw = selBtn.offsetWidth || 160, bh = selBtn.offsetHeight || 30;
      var x = Math.max(8, Math.min(last.right - bw / 2, W.innerWidth - bw - 8));
      var y = last.bottom + 10;
      if (y + bh > W.innerHeight - 8) y = Math.max(8, (rects.length ? rects[0] : last).top - bh - 10);
      selBtn.style.left = x + "px";
      selBtn.style.top = y + "px";
    }
    function openWithSelection(txt, el) {
      lastSel = null;
      S.openedVia = "selection";
      setOpen(true);
      // Sau bước focus mặc định của setOpen (cũng setTimeout 0) để con trỏ nằm đúng ô cần gõ.
      setTimeout(guard(function () {
        if (el) {
          var one = txt.replace(/\s+/g, " ");
          S.target = { selector: cssPath(el), text: one.slice(0, 200), label: "«" + one.slice(0, 40) + (one.length > 40 ? "…" : "") + "»" };
          setScope("page");
          paintChip();
        }
        S.sel = txt;
        if (contentType()) { useSelection(); return; }
        // Dự án không có loại "nội dung": đưa đoạn trích vào mô tả.
        S.sel = null;
        F.offer.hidden = true;
        var q = t("sel_body", { text: txt.length > 300 ? txt.slice(0, 300) + "…" : txt });
        F.body.value = F.body.value.trim() ? q + "\n\n" + F.body.value : q + "\n\n";
        try { F.body.focus(); } catch (e) {}
      }), 0);
    }
    if (feat.textSelection && !mountEl) {
      selBtn = h("button", {
        type: "button",
        class: "selb",
        hidden: true,
        // Giữ nguyên vùng bôi đen khi bấm.
        onmousedown: function (e) { e.preventDefault(); },
        onclick: guard(function () {
          var tx = selText, el = selEl;
          hideSelBubble();
          if (tx) openWithSelection(tx, el);
        }),
      }, [h("span", { "aria-hidden": "true", text: ICONS.pencil }), h("span", { text: t("sel_btn") })]);
      wrap.appendChild(selBtn);
      var later = function () {
        clearTimeout(selTimer);
        selTimer = setTimeout(guard(evalSelection), 30);
      };
      on(document, "mouseup", later);
      on(document, "keyup", later);
      on(document, "touchend", later);
      on(document, "selectionchange", guard(function () {
        var s = document.getSelection && document.getSelection();
        if (!s || s.isCollapsed) hideSelBubble();
        else if (selBtn && !selBtn.hidden) later();
      }));
      on(document, "contextmenu", guard(hideSelBubble));
      on(W, "scroll", guard(hideSelBubble), { capture: true, passive: true });
      on(W, "resize", guard(hideSelBubble));
      disposers.push(function () { clearTimeout(selTimer); });
    }

    /* ── theo dõi trang: ứng dụng một trang (SPA) đổi đường dẫn và vẽ lại header mà không tải lại trang ── */
    var scanTimer = null;
    function scheduleScan() {
      if (scanTimer) return;
      scanTimer = setTimeout(guard(function () {
        scanTimer = null;
        syncPath();
        mountLaunchers();
      }), 150);
    }
    try {
      var bodyObs = new MutationObserver(scheduleScan);
      bodyObs.observe(document.body || document.documentElement, { childList: true, subtree: true });
      disposers.push(function () { bodyObs.disconnect(); clearTimeout(scanTimer); });
    } catch (e) {}
    on(W, "popstate", guard(syncPath));

    /* ── gắn vào trang ── */
    if (mountEl) mountEl.appendChild(host);
    else (document.body || document.documentElement).appendChild(host);
    host.style.cssText = mountEl ? "all:initial;display:block" : "all:initial";
    applyTheme();
    syncPath();
    mountLaunchers();

    if (!anon) {
      loadSummary();
      timers.summary = setInterval(guard(function () { if (visible()) loadSummary(); }), 60000);
      if (mountEl) {
        loadList();
        timers.poll = setInterval(guard(function () { if (visible()) loadList(); }), 10000);
        timers.clock = setInterval(guard(function () {
          var now = Date.now();
          Object.keys(S.cards).forEach(function (k) { S.cards[k].tick(now); });
        }), 1000);
      }
    }

    return {
      open: function () {
        if (mountEl) { api_open(); return; }
        S.openedVia = S.openedVia === "trigger" ? "trigger" : "fab";
        setOpen(true);
      },
      close: function () { setOpen(false); },
      refresh: function () { loadSummary(); return loadList(); },
      hideFab: function (b) { S.fabHidden = !!b; paintFab(); },
      destroy: function () {
        clearInterval(timers.summary);
        stopOpenTimers();
        stopVoice();
        if (S.open) { S.open = false; emit(false); }
        disposers.forEach(function (d) { try { d(); } catch (e) {} });
        host.remove();
      },
    };
  }

  /* ───────────────────────────── Khởi tạo ───────────────────────────── */
  var instance = null;
  var gen = 0;
  var explicitInit = false;
  var queuedOpen = false;
  var queuedFabHidden = null;

  function domReady() {
    return new Promise(function (res) {
      if (document.readyState !== "loading" && document.body) res();
      else document.addEventListener("DOMContentLoaded", function () { res(); }, { once: true });
    });
  }
  function readData(s) {
    var d = s.dataset;
    return {
      project: d.project, hub: d.hub, tokenUrl: d.tokenUrl, position: d.position, colorScheme: d.colorScheme,
      label: d.label, icon: d.icon, locale: d.locale, offsetX: d.offsetX, offsetY: d.offsetY, trigger: d.trigger,
      fab: d.fab == null ? undefined : d.fab !== "false", mount: d.mount, mask: d.mask,
    };
  }
  function merge(a, b) {
    var out = {};
    [a, b].forEach(function (o) {
      Object.keys(o || {}).forEach(function (k) { if (o[k] !== undefined && o[k] !== null) out[k] = o[k]; });
    });
    return out;
  }

  function start(opts) {
    var myGen = ++gen;
    if (instance) { try { instance.destroy(); } catch (e) {} instance = null; }
    var project = String(opts.project || "").trim();
    if (!project) { log("Thiếu project (data-project hoặc init({project}))."); return Promise.resolve(null); }
    var hub = String(opts.hub || SCRIPT_ORIGIN).replace(/\/+$/, "");
    return domReady()
      .then(function () {
        return fetch(hub + "/api/v1/config?project=" + encodeURIComponent(project), { headers: { Accept: "application/json" } });
      })
      .then(function (r) {
        if (!r.ok) throw new Error("config HTTP " + r.status);
        return r.json();
      })
      .then(function (cfg) {
        if (myGen !== gen) return null;
        var auth = makeAuth(opts);
        return (auth.hasSource ? auth.get() : Promise.resolve(null)).then(function (tok) {
          if (myGen !== gen) return null;
          var anon = !tok;
          if (anon && !cfg.anonymousSubmit) {
            log(auth.hasSource ? "Không có token người dùng nên không hiện widget." : "Chưa cấu hình data-token-url hoặc getToken, và dự án không cho gửi ẩn danh.");
            return null;
          }
          instance = mountWidget(opts, cfg, hub, project, auth, anon);
          if (queuedFabHidden != null) instance.hideFab(queuedFabHidden);
          if (queuedOpen) { queuedOpen = false; instance.open(); }
          return instance;
        });
      })
      .catch(function (e) {
        log("Không khởi tạo được widget:", (e && e.message) || e);
        return null;
      });
  }

  W.FeedbackHub = {
    __loaded: true,
    version: "1.1.0",
    init: function (o) {
      explicitInit = true;
      var base = DATA_SCRIPT && DATA_SCRIPT.dataset.project ? readData(DATA_SCRIPT) : {};
      var opts = merge(base, o || {});
      if (o && o.fab === false) opts.fab = false;
      return start(opts);
    },
    open: function () { if (instance) instance.open(); else queuedOpen = true; },
    close: function () { queuedOpen = false; if (instance) instance.close(); },
    refresh: function () { return instance ? instance.refresh() : Promise.resolve(); },
    hideFab: function (b) { queuedFabHidden = !!b; if (instance) instance.hideFab(b); },
    destroy: function () { gen++; if (instance) { instance.destroy(); instance = null; } },
  };

  if (DATA_SCRIPT && DATA_SCRIPT.dataset.project) {
    var auto = function () {
      setTimeout(function () {
        if (!explicitInit) start(readData(DATA_SCRIPT));
      }, 0);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", auto, { once: true });
    else auto();
  }
})();
