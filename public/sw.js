/* Service worker của Feedback Hub: nhận thông báo đẩy (Web Push) và mở đúng góp ý khi bấm vào. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const title = typeof d.title === "string" ? d.title.slice(0, 120) : "Thông báo";
  // Biểu tượng đặt cạnh sw.js (cùng đường dẫn gốc của hub, kể cả khi hub chạy dưới một tiền tố như /feedbackhub).
  const asset = (p) => new URL(p, self.registration.scope).href;
  event.waitUntil(
    self.registration.showNotification(title, {
      body: typeof d.body === "string" ? d.body.slice(0, 600) : "",
      tag: typeof d.tag === "string" ? d.tag.slice(0, 100) : undefined,
      icon: asset("icons/icon-192.png"),
      badge: asset("icons/badge-96.png"),
      timestamp: Date.now(),
      data: { url: typeof d.url === "string" ? d.url : "" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  // Chỉ mở địa chỉ cùng nguồn (chống thông báo giả dẫn sang trang khác).
  let target = self.registration.scope;
  try {
    const u = new URL(event.notification.data && event.notification.data.url, self.location.origin);
    if (u.origin === self.location.origin) target = u.href;
  } catch { /* dùng mặc định */ }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => c.url.startsWith(self.registration.scope));
      if (open && "navigate" in open) return open.navigate(target).then((c) => c && c.focus());
      return self.clients.openWindow(target);
    }),
  );
});
