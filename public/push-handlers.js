/* Web Push handlers, imported into the generated service worker (see vite.config
   workbox.importScripts). The browser decrypts the aes128gcm payload; we read it
   as JSON here. Kept as plain JS so it ships verbatim, no build step. */

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_e) { /* empty / non-JSON push */ }
  const title = data.title || "Rurana";
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || "Tus ejercicios de hoy te esperan.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/today" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/today";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(url); return client.focus(); }
      }
      return self.clients.openWindow(url);
    }),
  );
});
