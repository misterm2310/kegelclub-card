// 📱 Kegelclub – Offline-Speicher für die App. Hier liegt NUR Programm, keine Zahlen.
// (Die Zahlen merkt sich die Seite selbst im Handy – und löscht sie beim Abmelden.)
const CACHE = "kegelclub-app-__KC_VERSION__";
const FILES = ["./", "manifest.webmanifest", "icon-192.png", "icon-512.png", "icons.json", "/kegelclub/files/kegelclub-card.js?v=__KC_VERSION__", "/kegelclub/files/kegelclub-en.json?v=__KC_VERSION__", "/kegelclub/files/mister-m.webp?v=__KC_VERSION__"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.map((f) => c.add(f)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith("kegelclub-app-") && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Erst das Netz fragen (dann ist alles aktuell). Ohne Netz – oder nach 4 Sekunden Funkloch – das Gespeicherte nehmen.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const ours = url.pathname.startsWith("/kegelclub/app/") || url.pathname.startsWith("/kegelclub/files/");
  if (e.request.method !== "GET" || url.origin !== location.origin || !ours || url.pathname.endsWith("sw.js")) return;
  const lookup = () => caches.match(e.request).then((r) => r || caches.match(e.request, { ignoreSearch: true }))
    .then((r) => r || (url.pathname.startsWith("/kegelclub/app/") ? caches.match("./") : undefined));
  const net = fetch(e.request).then((resp) => {
    if (/\.(js|svg|json)$/.test(url.pathname) && /text\/html/.test(resp.headers.get("content-type") || "")) throw new Error("html"); // WLAN-Anmeldeseite
    if (resp.ok && resp.type === "basic" && !resp.redirected) {
      const copy = resp.clone();
      const key = url.pathname === "/kegelclub/app/" || url.pathname === "/kegelclub/app/index.html" ? "./" : e.request;
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {});
    }
    return resp;
  });
  const guarded = net.catch(() => lookup().then((r) => r || new Response("offline", { status: 503 })));
  const slow = new Promise((res) => setTimeout(() => lookup().then((r) => res(r || null), () => res(null)), 4000));
  e.waitUntil(net.catch(() => {}));
  e.respondWith(Promise.race([guarded, slow]).then((r) => r || guarded));
});

// ---------------------------------------------------------------- 🔄 Im Hintergrund nachschicken (Android/Chrome, wie bei der Einkaufsliste)
// Für Doofe: Ist die App zu und kommt das Netz zurück, weckt Chrome diesen Helfer kurz auf („sync“).
// Er schickt den Postausgang an Home Assistant – genau so, wie es die Karte selbst tun würde.
// Doppelt zählt nichts: Jede Änderung hat ihre eigene Nummer (op_id), Home Assistant erkennt Wiederholungen.
// iPhones kennen das leider nicht; dort wird beim nächsten Öffnen nachgeschickt.
let dbp = null;
function db() {
  return dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open("kegelclub-app", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => ok(r.result);
    r.onerror = () => { dbp = null; fail(r.error); };
  }));
}
async function kv(mode, fn) {
  const d = await db();
  return new Promise((ok, fail) => {
    const tx = d.transaction("kv", mode);
    let out;
    fn(tx.objectStore("kv"), (v) => { out = v; });
    tx.oncomplete = () => ok(out);
    tx.onerror = () => fail(tx.error);
  });
}
const kvGet = (k) => kv("readonly", (st, set) => { const r = st.get(k); r.onsuccess = () => set(r.result); });
const kvSet = (k, v) => kv("readwrite", (st) => { st.put(v, k); });
const kvKeys = () => kv("readonly", (st, set) => { const r = st.getAllKeys(); r.onsuccess = () => set(r.result || []); });

async function accessToken(auth) {
  if (auth.access && auth.expires > Date.now()) return auth.access;
  const r = await fetch("/auth/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: auth.refresh, client_id: auth.client_id }),
  });
  if (!r.ok) throw new Error("token " + r.status);
  const j = await r.json();
  const next = { ...auth, access: j.access_token, expires: Date.now() + (j.expires_in || 1800) * 1000 - 60000 };
  await kvSet("auth", next);
  return next.access;
}

function openSocket(token) {
  return new Promise((ok, fail) => {
    const ws = new WebSocket(self.location.origin.replace(/^http/, "ws") + "/api/websocket");
    const pending = new Map();
    let id = 1;
    const timer = setTimeout(() => { try { ws.close(); } catch (_) { /* egal */ } fail(new Error("timeout")); }, 15000);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "auth_required") ws.send(JSON.stringify({ type: "auth", access_token: token }));
      else if (m.type === "auth_invalid") { clearTimeout(timer); fail(new Error("auth")); }
      else if (m.type === "auth_ok") {
        clearTimeout(timer);
        ok({
          call: (msg) => new Promise((res, rej) => { const n = id++; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, ...msg })); }),
          close: () => { try { ws.close(); } catch (_) { /* egal */ } },
        });
      } else if (m.type === "result") {
        const p = pending.get(m.id);
        if (p) { pending.delete(m.id); m.success ? p.res(m.result) : p.rej(new Error(m.error?.message || "ha")); }
      }
    };
    ws.onclose = () => { clearTimeout(timer); for (const p of pending.values()) p.rej(new Error("lost")); pending.clear(); fail(new Error("closed")); };
    ws.onerror = () => { try { ws.close(); } catch (_) { /* egal */ } };
  });
}

let busy = false;
async function flushQueue(force) {
  if (busy) return;
  if (!force) { // ist die App gerade offen und sichtbar? Dann schickt die Karte selbst
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (wins.some((c) => c.visibilityState === "visible")) return;
  }
  const keys = (await kvKeys()).filter((k) => String(k).startsWith("q:"));
  const boxes = [];
  for (const k of keys) { const b = await kvGet(k); if (b?.queue?.length) boxes.push([k, b]); }
  if (!boxes.length) return;
  const auth = await kvGet("auth");
  if (!auth?.refresh) return; // abgemeldet: nichts schicken
  busy = true;
  let sock = null;
  try {
    sock = await openSocket(await accessToken(auth));
    for (const [k, box] of boxes) {
      let q = box.queue;
      while (q.length) {
        const batch = q.slice(0, 100);
        await sock.call({ type: "kegelclub/apply", ops: batch, ...(box.book ? { book: box.book } : {}) }); // Fehler = Netz weg → Chrome versucht es später nochmal
        const done = new Set(batch.map((o) => o.op_id));
        q = q.filter((o) => !done.has(o.op_id));
        await kvSet(k, { ...box, queue: q });
        const sent = (await kvGet("sent")) || [];
        await kvSet("sent", [...sent, ...done]); // die Seite streicht diese beim nächsten Öffnen aus ihrem Postausgang
      }
    }
  } finally {
    sock?.close();
    busy = false;
  }
}

self.addEventListener("sync", (e) => {
  if (e.tag === "kc-queue") e.waitUntil(flushQueue(false));
});
// Zum Testen: die Seite kann den Helfer auch direkt bitten
self.addEventListener("message", (e) => {
  if (e.data?.type === "kc-flush") e.waitUntil(flushQueue(!!e.data.force).catch(() => {}));
});
