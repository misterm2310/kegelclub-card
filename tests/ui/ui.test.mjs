// 🧪 Oberflächen-Test der Karte und der Offline-App (Browser, ohne Home Assistant). Start: node tests/ui/ui.test.mjs
// Optional: SHOTS=ordner → Screenshots dort speichern.
import { chromium } from "playwright";
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const app = path.join(root, "custom_components/kegelclub/www/app");
const srv = http.createServer((q, r) => {
  const url = q.url.split("?")[0];
  if (url === "/favicon.ico") { r.statusCode = 204; r.end(); return; }
  if (url.startsWith("/auth/")) { r.statusCode = 503; r.end("{}"); return; }
  let f = url === "/" ? path.join(root, "tests/ui/harness.html")
    : url.startsWith("/kegelclub/app/") ? path.join(app, url.slice(15) || "index.html")
    : url.startsWith("/kegelclub/files/") ? path.join(root, "custom_components/kegelclub/www", url.slice(17))
    : path.join(root, url);
  r.setHeader("content-type", f.endsWith(".js") ? "text/javascript" : f.endsWith(".svg") ? "image/svg+xml" : f.endsWith(".png") ? "image/png" : f.endsWith(".json") ? "application/json" : f.endsWith(".webmanifest") ? "application/manifest+json" : "text/html");
  try { const buf = fs.readFileSync(f); r.end(f.endsWith(".png") ? buf : buf.toString().replaceAll("__KC_VERSION__", "test")); } catch (e) { r.statusCode = 404; r.end(); }
}).listen(0);
const port = srv.address().port;
const exe = process.env.PLAYWRIGHT_CHROMIUM || (fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const b = await chromium.launch(exe ? { executablePath: exe } : {});
const shots = process.env.SHOTS;
const p = await b.newPage({ viewport: { width: 560, height: 1100 }, deviceScaleFactor: shots ? 2 : 1 });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));
p.on("console", (m) => { if (m.type() === "error" || /Symbol fehlt/.test(m.text())) errs.push(m.text()); });
await p.goto(`http://localhost:${port}/`);
await p.waitForFunction(() => window.__ready);
await p.waitForTimeout(200);

let fails = 0;
const check = (name, ok, info = "") => { console.log(`${ok ? "✅" : "❌"} ${name}${ok ? "" : " – " + info}`); if (!ok) fails++; };
const sr = (js) => p.evaluate(`(() => { const h = document.querySelector('#c1').shadowRoot; ${js} })()`);
const shot = async (name) => { if (shots) await p.locator("#c1").screenshot({ path: path.join(shots, name) }); };
const tap = async (sel) => { await p.locator("#c1").locator(sel).first().click(); await p.waitForTimeout(120); };
const heroBig = () => sr(`return h.querySelector('.hero .big')?.textContent.replace(/\\s+/g, ' ').trim();`);

// 🎳 Laufender Abend: Personen, Strafen, Abrechnung
check("Laufender Abend wird gezeigt", /Kegelabend/.test(await sr(`return h.querySelector('.hero .lbl').textContent;`)));
check("Heute zusammen 47,20 €", (await heroBig()) === "47,20 €", await heroBig());
check("Strafen gesperrt, solange keiner gewählt ist", await sr(`return [...h.querySelectorAll('.fine')].every((b) => b.disabled);`));
await shot("1-abend.png");
await tap('.pp[data-id="m2"]');
await tap('.fine[data-id="s1"]');
let last = await p.evaluate(() => fake.applied.at(-1));
check("Pumpe für Bernd gebucht", last?.type === "abend_count" && last.member === "m2" && last.strafe === "s1" && last.delta === 1, JSON.stringify(last));
check("Summe +0,10 €", (await heroBig()) === "47,30 €", await heroBig());
await tap('.fine[data-id="s4"]');
check("Alle Neune von Bernd: 4 andere Mitkegler zahlen je 0,10 € (Zuschauerin nicht)", (await heroBig()) === "47,70 €", await heroBig());
check("Bernd zahlt seine Neun nicht selbst", await sr(`return h.querySelector('.pp[data-id="m2"] .sum').textContent.includes("8,20");`), await sr(`return h.querySelector('.pp[data-id="m2"] .sum').textContent;`));
await shot("2-strafe.png");
await tap('.stbtn[data-id="m6"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Status weiter: schaut zu → abgemeldet", last?.type === "abend_status" && last.status === "excused", JSON.stringify(last));
await tap('[data-a="nofines"]');
check("Strafen erlassen: nur noch Grundbeträge (6 × 7,50 €)", (await heroBig()) === "45,00 €", await heroBig());
await tap('[data-a="nofines"]');

// 🏦 Kasse
await tap('[data-a="tab"][data-v="kasse"]');
check("Kegelkasse 247,10 €", (await heroBig()) === "247,10 €", await heroBig());
check("Schuldner-Liste da", await sr(`return h.querySelectorAll('[data-a="open"][data-k="pay"]').length >= 5;`));
await shot("3-kasse.png");

// 📴 Offline: Strafe landet im Postausgang und wird später nachgeschickt
await tap('[data-a="tab"][data-v="abend"]');
await p.evaluate(() => setOnline(false));
const before = await p.evaluate(() => fake.applied.length);
await tap('.pp[data-id="m1"]');
await tap('.fine[data-id="s2"]');
check("Offline: Änderung wartet im Handy", await p.evaluate(() => JSON.parse(localStorage.getItem("kegelclub_queue") || "[]").length === 1));
await p.evaluate(() => setOnline(true));
await p.waitForTimeout(400);
check("Wieder online: nachgeschickt", await p.evaluate((n) => fake.applied.length === n + 1 && JSON.parse(localStorage.getItem("kegelclub_queue") || "[]").length === 0, before));

// 📊 Statistik + 👥 Mitglieder + ⚙️
await tap('[data-a="tab"][data-v="stats"]');
check("Statistik: Könige und Balken", await sr(`return h.querySelectorAll('.kings .tile').length > 0 && h.querySelectorAll('.stbar .c').length > 0;`));
await shot("4-statistik.png");
await tap('[data-a="tab"][data-v="edit"]');
check("Mitglieder + Gast + Strafen gelistet", await sr(`return /Gast Gustav/.test(h.textContent) && /Alle Neune/.test(h.textContent);`));
await tap('[data-a="tab"][data-v="set"]');
await tap('.lgbox >> nth=0');
await tap('[data-a="sheet"][data-v="rules"]');
check("Regeln: Grundbetrag 7,5", await sr(`return h.querySelector('input[data-v="base_fee"]')?.value === "7,5";`));
await shot("5-regeln.png");
await tap('[data-a="back"]');

// 🌍 Englisch
await p.evaluate(() => { const c = document.querySelector("#c1"); c._view = "kasse"; c._sheet = null; c.setConfig({ title: "Kegelclub", language: "en" }); c.hass = c._hass; });
await p.waitForTimeout(500);
await shot("6-english.png");
check("Englisch: Kasse heißt „Club cash“", await sr(`return /Club cash/.test(h.querySelector('.hero .lbl').textContent);`), await sr(`return h.querySelector('.hero .lbl').textContent;`));
await p.evaluate(() => { const c = document.querySelector("#c1"); c.setConfig({ title: "Kegelclub", language: "de" }); c.hass = c._hass; });
await new Promise((r) => setTimeout(r, 80));

// 📱 Offline-App: Anmeldeseite lädt ohne Fehler
const a = await b.newPage({ viewport: { width: 390, height: 760 }, deviceScaleFactor: shots ? 2 : 1 });
a.on("pageerror", (e) => errs.push("app: " + String(e)));
await a.goto(`http://localhost:${port}/kegelclub/app/`);
await a.waitForSelector("#loginBtn");
check("App: Anmeldeseite da", await a.evaluate(() => document.querySelector("h1")?.textContent === "Kegelclub"));
check("App: Icon lädt", await a.evaluate(() => { const i = document.querySelector(".login img"); return i && i.complete && i.naturalWidth === 192; }));
if (shots) await a.screenshot({ path: path.join(shots, "6-app-anmeldung.png") });

// 🏠 Zweiter Club: Karte mit „buch“ fragt nach genau diesem Club, eigener Postausgang, Editor zeigt alle Clubs
const rb = await p.evaluate(async () => {
  fake.msgs = [];
  const c = document.createElement("kegelclub-card"); c.id = "c2"; c.setConfig({ buch: "Damenclub" }); document.body.append(c);
  c.hass = document.querySelector("#c1")._hass;
  await new Promise((res) => setTimeout(res, 80));
  const sub = fake.msgs.find((m) => m.type === "kegelclub/subscribe");
  const ed = document.createElement("kegelclub-card-editor"); document.body.append(ed);
  ed.setConfig({ buch: "Damenclub" }); ed.hass = c._hass;
  await new Promise((res) => setTimeout(res, 50));
  const opts = [...ed.querySelectorAll('select[data-k="buch"] option')].map((o) => [o.textContent, o.selected]);
  let changed = null; ed.addEventListener("config-changed", (e) => { changed = e.detail.config; });
  const sel = ed.querySelector('select[data-k="buch"]'); sel.value = ""; sel.dispatchEvent(new Event("change"));
  const out = { book: sub?.book, qk: c._qk, opts, changed, };
  c.remove(); ed.remove();
  return out;
});
check("Club: Karte abonniert genau ihr Buch", rb.book === "Damenclub", JSON.stringify(rb));
check("Club: eigener Postausgang im Handy", rb.qk === "kegelclub_queue_damenclub", rb.qk);
check("Club: Editor zeigt beide Bücher, „Damenclub“ gewählt", rb.opts.length === 2 && rb.opts[1][0] === "Damenclub" && rb.opts[1][1], JSON.stringify(rb.opts));
check("Club: Editor zurück auf erstes Buch entfernt „buch“", rb.changed && !("buch" in rb.changed), JSON.stringify(rb.changed));

check("Keine Fehler in der Konsole", errs.length === 0, errs.join(" | "));
await b.close();
srv.close();
console.log(fails ? `\n${fails} Prüfung(en) fehlgeschlagen` : "\nAlles grün 🎉");
process.exit(fails ? 1 : 0);
