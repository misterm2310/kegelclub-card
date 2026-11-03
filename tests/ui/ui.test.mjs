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
  try { const buf = fs.readFileSync(f); r.end(/\.(png|webp)$/.test(f) ? buf : buf.toString().replaceAll("__KC_VERSION__", "test")); } catch (e) { r.statusCode = 404; r.end(); }
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

// 🎳 Laufender Abend: Personen, Strafen, Abrechnung (oben groß = nur die Strafen von heute)
check("Laufender Abend wird gezeigt", /Kegelabend/.test(await sr(`return h.querySelector('.hero .lbl').textContent;`)));
check("Strafen heute 2,20 €", (await heroBig()) === "2,20 €", await heroBig());
check("Strafen gesperrt, solange keiner gewählt ist", await sr(`return [...h.querySelectorAll('.fine')].every((b) => b.disabled);`));
await shot("1-abend.png");
await tap('.pp[data-id="m2"]');
await tap('.fine[data-id="s1"]');
let last = await p.evaluate(() => fake.applied.at(-1));
check("Pumpe für Bernd gebucht", last?.type === "abend_count" && last.member === "m2" && last.strafe === "s1" && last.delta === 1, JSON.stringify(last));
check("Summe +0,10 €", (await heroBig()) === "2,30 €", await heroBig());
await tap('.fine[data-id="s4"]');
check("Alle Neune von Bernd: 4 andere Mitkegler zahlen je 0,10 € (Zuschauerin nicht)", (await heroBig()) === "2,70 €", await heroBig());
check("Bernd zahlt seine Neun nicht selbst (Kachel = nur Strafen 0,70 €)", await sr(`return h.querySelector('.pp[data-id="m2"] .sum').textContent.includes("0,70");`), await sr(`return h.querySelector('.pp[data-id="m2"] .sum').textContent;`));
// ➖ oben links auf der Kachel
check("Minus oben links erscheint bei gezählter Strafe", await sr(`return !!h.querySelector('.fine[data-id="s4"] .fminus') && !h.querySelector('.fine[data-id="s3"] .fminus');`));
await tap('.fine[data-id="s4"] .fminus');
last = await p.evaluate(() => fake.applied.at(-1));
check("Minus nimmt eine zurück", last?.type === "abend_count" && last.strafe === "s4" && last.delta === -1 && (await heroBig()) === "2,30 €", JSON.stringify(last));
await tap('[data-a="undo"]');
check("Rückgängig bringt sie wieder", (await heroBig()) === "2,70 €", await heroBig());
await shot("2-strafe.png");
// ✍️ Eigene Strafe
await tap('[data-a="handopen"]');
await p.locator("#c1").locator('form[data-a="hand"] input[name="name"]').fill("Bier umgekippt");
await p.locator("#c1").locator('form[data-a="hand"] input[name="amount"]').fill("2,00");
await tap('form[data-a="hand"] button[type="submit"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Eigene Strafe gebucht", last?.type === "abend_extra_add" && last.member === "m2" && last.amount === 2 && (await heroBig()) === "4,70 €", JSON.stringify(last) + " " + (await heroBig()));
await tap('[data-a="handdel"]');
check("Eigene Strafe wieder raus", (await heroBig()) === "2,70 €", await heroBig());
// 🙈 Wer fehlt, ist ausgeblendet
await tap('.stbtn[data-id="m6"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Status weiter: schaut zu → gegangen", last?.type === "abend_status" && last.status === "gone" && await sr(`return /gegangen \\d\\d:\\d\\d/.test(h.querySelector('.stbtn[data-id="m6"]').textContent);`), JSON.stringify(last));
await tap('.stbtn[data-id="m6"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Status weiter: gegangen → abgemeldet", last?.type === "abend_status" && last.status === "excused", JSON.stringify(last));
check("Abgemeldet: blasse Kachel, keine Zeile „Fehlen heute“, blass in der Abrechnung mit offenem Grundbetrag", await sr(`const it = [...h.querySelectorAll('.bill .item')].find((x) => /Frida Holz/.test(x.textContent)); return h.querySelector('.pp[data-id="m6"]').classList.contains('off') && !h.querySelector('.away') && it?.classList.contains('off') && /Grundbetrag 7,50\\s€ offen/.test(it.textContent);`));
await tap('.pp[data-id="m6"]');
check("Fehlende: normale Strafen gesperrt, „Eigene“ geht", await sr(`return [...h.querySelectorAll('.fine[data-a="fine"]')].every((b) => b.disabled) && !h.querySelector('[data-a="handopen"]').disabled;`));
await tap('[data-a="handopen"]');
await p.locator("#c1").locator('form[data-a="hand"] input[name="name"]').fill("Kranzgeld");
await p.locator("#c1").locator('form[data-a="hand"] input[name="amount"]').fill("3");
await tap('form[data-a="hand"] button[type="submit"]');
check("Fehlende mit Hand-Strafe: Betrag steht in der Abrechnung", await sr(`const it = [...h.querySelectorAll('.bill .item')].find((x) => /Frida Holz/.test(x.textContent)); return /Kranzgeld/.test(it?.textContent || '') && /3,00/.test(it.querySelector('.amt').textContent);`));
await tap('[data-a="handdel"]');
await tap('.pp[data-id="m2"]');
check("Abrechnung in fester Reihenfolge wie unter Mitglieder", await sr(`return [...h.querySelectorAll('.bill .item b')].map((x) => x.textContent).join() === "Anna Beispiel,Bernd Muster,Carla Kugel,Dieter Pumpe,Emil Neuner,Frida Holz";`), await sr(`return [...h.querySelectorAll('.bill .item b')].map((x) => x.textContent).join();`));
// 💶 Grundbetrag kassiert + Münze
check("Knopf „Grundbetrag kassiert (5)“", await sr(`return /Grundbetrag kassiert \\(5\\)/.test(h.querySelector('[data-a="basepay"]').textContent);`), await sr(`return h.querySelector('[data-a="basepay"]').textContent;`));
await tap('[data-a="basepay"]');
const base = await p.evaluate(() => fake.applied.filter((o) => o.type === "pay" && o.tag === "base"));
check("Grundbetrag kassiert: 5 × 7,50 € mit Abend", base.length === 5 && base.every((o) => o.amount === 7.5 && o.abend === "evnow"), JSON.stringify(base));
await tap('.stbtn[data-id="m4"]'); await tap('.stbtn[data-id="m4"]'); await tap('.stbtn[data-id="m4"]');
check("Dieter danach abgemeldet → sein Grundbetrag ist wieder aus der Kasse", await p.evaluate(() => fake.data.kasse.filter((k) => k.tag === "base").length === 4 && !fake.data.kasse.some((k) => k.tag === "base" && k.member === "m4")));
check("Bernd hat Strafen → Grundbetrag gesperrt 🔒", await sr(`return !h.querySelector('.bill [data-a="basetoggle"][data-id="m2"]') && /🔒/.test([...h.querySelectorAll('.bill .item')].find((x) => /Bernd Muster/.test(x.textContent))?.textContent || '');`));
await tap('.bill [data-a="basetoggle"][data-id="m4"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Fehlender Dieter: Grundbetrag antippen = bezahlt (jemand zahlt für ihn)", last?.type === "pay" && last.tag === "base" && last.member === "m4" && last.amount === 7.5, JSON.stringify(last));
await tap('.bill [data-a="coin"][data-id="m2"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Münze: Bernd zahlt seine Strafen (0,70 €)", last?.type === "pay" && last.tag === "fines" && last.amount === 0.7, JSON.stringify(last));
check("Münze wird grün", await sr(`return h.querySelector('.bill [data-a="coin"][data-id="m2"]').classList.contains('ok');`));
await shot("3-abrechnung.png");
// 📤 Drucken & Teilen
check("Bildschirm-an-Knopf oben vor dem Schloss, kein Auge mehr", await sr(`const b = [...h.querySelectorAll('.head .iconbtn')].map((x) => x.dataset.a).join(','); return b.includes('awake,lock') && !b.includes('hide') && !h.querySelector('.hero [data-a="awake"]');`));
await tap('.bill ~ .btnrow [data-a="share"], [data-a="share"]');
check("Drucken & Teilen: Seite mit Vorschau", await sr(`return h.querySelectorAll('.kcprev .kstab tr').length >= 6 && !!h.querySelector('[data-a="shpdf"]') && !!h.querySelector('[data-a="shprint"]');`));
await tap('[data-a="shmode"]');
check("QR-Code gezeichnet", await sr(`return !!h.querySelector('.prqrc svg path');`));
await shot("3b-teilen.png");
const [dl] = await Promise.all([p.waitForEvent("download"), p.locator("#c1").locator('[data-a="shpdf"]').click()]);
const pdfPath = path.join(process.env.SHOTS || "/tmp", "abrechnung-test.pdf");
await dl.saveAs(pdfPath);
const pdfHead = fs.readFileSync(pdfPath).subarray(0, 5).toString();
check("PDF ist eine echte PDF-Datei", pdfHead === "%PDF-", pdfHead);
await tap('[data-a="back"]');
check("Zurück aus Teilen landet wieder am Abend", await sr(`return !!h.querySelector('.bill');`));
// ⚠️ Abschließen mit Offenen fragt nach (hier: Nein)
let dlg = "";
p.once("dialog", (x) => { dlg = x.message(); x.dismiss(); });
await tap('[data-a="evclose"]');
check("Abschließen warnt bei Offenen", /Noch nicht bezahlt: Anna Beispiel/.test(dlg) && !/Bernd/.test(dlg), dlg);
await tap('[data-a="nofines"]');
check("Strafen erlassen: 0,00 €", (await heroBig()) === "0,00 €", await heroBig());
await tap('[data-a="nofines"]');

// 🏦 Kasse
await tap('[data-a="tab"][data-v="kasse"]');
check("Kegelkasse (Bahn nur für abgeschlossene Abende)", (await heroBig()) === "315,30 €", await heroBig());
check("Kegelbahn als eigene Zeile in den Buchungen", await sr(`return [...h.querySelectorAll('.item b')].filter((x) => /^Kegelbahn /.test(x.textContent)).length === 3;`));
check("Schuldner-Liste da", await sr(`return h.querySelectorAll('[data-a="open"][data-k="pay"]').length >= 3;`), await sr(`return h.querySelectorAll('[data-a="open"][data-k="pay"]').length;`));
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

// 🔒📴 PIN ohne Netz: Karte prüft selbst mit dem Offline-Schlüssel (beta.10)
{
  const salt = "a1b2c3d4e5f60718293a4b5c6d7e8f90", hash = (await import("crypto")).pbkdf2Sync("4711", Buffer.from(salt, "hex"), 100000, 32, "sha256").toString("hex");
  const keys = async (pin) => { for (const k of pin) await sr(`h.querySelector('[data-a="pkey"][data-v="${k}"]').click();`); };
  const push = (po) => p.evaluate((po) => { fake.pin = "4711"; fake.data.pin = true; fake.data.pin_off = po; fake.data.settings.lock_all = true; cb && cb(JSON.parse(JSON.stringify(fake.data))); }, po);
  await push(null); await p.waitForTimeout(80);
  await p.evaluate(() => setOnline(false)); await p.waitForTimeout(60);
  check("Offline + PIN: Zahlenfeld da", await sr(`return !!h.querySelector('.ppad');`));
  await keys("4711✔"); await p.waitForTimeout(150);
  check("Offline ohne Schlüssel: ehrlicher Hinweis, bleibt zu", await sr(`return !!h.querySelector('.ppad');`) && await p.evaluate(() => toasts.some((t) => t.includes("kennt das Gerät noch nicht"))), await p.evaluate(() => toasts.slice(-2).join(" | ")));
  await p.evaluate(() => setOnline(true)); await push({ salt, iter: 100000, hash }); await p.waitForTimeout(80);
  await p.evaluate(() => setOnline(false)); await p.waitForTimeout(60);
  await keys("0000✔"); await p.waitForTimeout(400);
  check("Offline: falsche PIN bleibt zu", await sr(`return !!h.querySelector('.ppad');`) && await p.evaluate(() => toasts.at(-1) === "❌ Falsche PIN"), await p.evaluate(() => toasts.slice(-2).join(" | ")));
  await keys("4711✔"); await p.waitForTimeout(400);
  check("Offline: richtige PIN entsperrt", !(await sr(`return !!h.querySelector('.ppad');`)), await p.evaluate(() => toasts.slice(-3).join(" | ")));
  await p.evaluate(() => { fake.pin = null; fake.data.pin = false; fake.data.pin_off = null; fake.data.settings.lock_all = false; localStorage.removeItem("kegelclub_pinfehler"); setOnline(true); cb && cb(JSON.parse(JSON.stringify(fake.data))); });
  await p.waitForTimeout(150);
}

// 📊 Statistik + 👥 Mitglieder + ⚙️
await tap('[data-a="tab"][data-v="stats"]');
check("Statistik Überblick: Zahlen, Rekorde, Könige", await sr(`return h.querySelectorAll('.kpis .tile').length >= 4 && h.querySelectorAll('.recs .tile').length > 0 && h.querySelectorAll('.kings .tile').length > 0;`));
await shot("4-statistik.png");
await tap('[data-a="stattab"][data-v="people"]');
check("Statistik Personen: Balken + Tabelle", await sr(`return h.querySelectorAll('.hbar.click').length > 0 && h.querySelectorAll('table.sttab tr.click').length > 0;`));
await shot("4b-statistik-personen.png");
await tap('table.sttab tr.click');
check("Statistik Person: eigene Seite", await sr(`return !!h.querySelector('.hero') && /Abend für Abend|Welche Strafen/.test(h.textContent);`));
await shot("4c-statistik-person.png");
await tap('[data-a="stattab"][data-v="evs"]');
check("Statistik Abende: Tabelle", await sr(`return h.querySelectorAll('table.sttab tr[data-a="evopen"]').length > 0;`));
await shot("4d-statistik-abende.png");
await tap('table.sttab tr[data-a="evopen"]');
await tap('[data-a="back"]');
check("Abend aus Statistik: Zurück landet wieder in Statistik", await sr(`return !!h.querySelector('.stseg');`));
await tap('[data-a="stattab"][data-v="fines"]');
check("Statistik Strafen: Matrix", await sr(`return h.querySelectorAll('table.matrix td').length > 0 && !!h.querySelector('.pie .disc');`));
await shot("4e-statistik-strafen.png");
await tap('[data-a="yearall"]');
await tap('[data-a="stattab"][data-v="over"]');
check("Statistik alle Jahre", await sr(`return /Alle Jahre/.test(h.querySelector('.yearnav').textContent) && h.querySelectorAll('.kpis .tile').length >= 4;`));
await tap('[data-a="yearall"]');
check("Kein Reiter „Mitglieder“ mehr", await sr(`return !h.querySelector('[data-a="tab"][data-v="edit"]');`));
await tap('[data-a="tab"][data-v="set"]');
await tap('.lgbox >> nth=0');
await tap('[data-a="sheet"][data-v="club"]');
check("⚙️ → Mitglieder & Strafen: Mitglieder + Gast + Strafen gelistet", await sr(`return /Gast Gustav/.test(h.textContent) && /Alle Neune/.test(h.textContent);`));
// 📸 Foto für Anna
await tap('[data-a="open"][data-k="member"][data-id="m1"]');
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
await p.locator("#c1").locator('input[data-a="photofile"]').setInputFiles({ name: "anna.png", mimeType: "image/png", buffer: png });
await p.waitForTimeout(300);
await tap('form[data-a="save"] button[type="submit"]');
last = await p.evaluate(() => fake.applied.at(-1));
check("Foto gespeichert (klein, JPEG)", last?.type === "member_save" && /^data:image\/jpeg;base64,/.test(last.item.photo || "") && last.item.photo.length < 20000, JSON.stringify(last).slice(0, 200));
check("Foto in der Liste", await sr(`return !!h.querySelector('[data-id="m1"] img.phav');`));
await shot("4f-mitglieder.png");
await tap('[data-a="back"]');
// 🏠 Über den Club
await tap('[data-a="sheet"][data-v="about"]');
await p.locator("#c1").locator('input[data-a="clubinfo"][data-v="name"]').fill("Die Testkugeln");
await p.locator("#c1").locator('input[data-a="clubinfo"][data-v="name"]').press("Tab");
await p.locator("#c1").locator('input[data-a="clubinfo"][data-v="founded"]').fill("2019-05-11");
await p.locator("#c1").locator('textarea[data-a="clubinfo"]').click();
await p.locator("#c1").locator('.sechead').click();
await p.waitForTimeout(300);
check("Über den Club: gespeichert + Alter", await p.evaluate(() => fake.data.settings.club_info?.name === "Die Testkugeln" && fake.data.settings.club_info?.founded === "2019-05-11") && await sr(`return /Jahre/.test(h.querySelector('.hero')?.textContent || '');`), await p.evaluate(() => JSON.stringify(fake.data.settings.club_info)));
await shot("4g-ueber-den-club.png");
await tap('[data-a="back"]');
await tap('.lgbox >> nth=1');
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

// 🆕 1.0.1-beta.1: Reiter, Texte, Abrechnung ohne −, In Kasse buchen, Buchung ändern, PIN für Kasse, Kegelfigur
{
  const redraw = () => p.evaluate(() => { const c = document.querySelector("#c1"); c._force = true; c._render(); });
  await p.evaluate(() => { const c = document.querySelector("#c1"); c._view = "abend"; c._open = null; c._pad = null; c._sheet = null; });
  await redraw(); await p.waitForTimeout(100);
  check("Reiter: Abend · Statistik · Kasse", await sr(`return [...h.querySelectorAll('.tabs .tab')].map((x) => x.dataset.v).join() === "abend,stats,kasse";`), await sr(`return [...h.querySelectorAll('.tabs .tab')].map((x) => x.dataset.v).join();`));
  check("Oben klar: „Grundbetrag kassiert: … von …“ und Kegelbahn extra", await sr(`const t = h.querySelector('.hero').textContent; return /Grundbetrag kassiert:/.test(t) && /von/.test(t) && /In Kasse buchen/.test(t) && !/beim Abschließen in der Kasse/.test(t);`), await sr(`return h.querySelector('.hero').textContent;`));
  check("Schalter heißt „Heute keine Strafen berechnen“", await sr(`return /Heute keine Strafen berechnen/.test(h.querySelector('.evbar').textContent);`));
  check("Abrechnung: kein − an gezählten Strafen", await sr(`return !h.querySelector('.bill [data-a="minus"]') && h.querySelectorAll('.bill .chipx').length > 0;`));
  p.once("dialog", (x) => x.accept());
  await tap('[data-a="evclose"]');
  check("Nach „Abend abschließen“: „In Kasse buchen“ rechts neben „Wieder öffnen“", await sr(`const bk=h.querySelector('[data-a="evbook"]'); return !!bk && bk.previousElementSibling?.dataset.a === "evreopen" && /Kegelabend/.test(h.querySelector('.sechead').textContent);`));
  await shot("7-in-kasse-buchen.png");
  await tap('[data-a="back"]');
  check("Ohne Buchen geht's nicht weiter (kein „Kegelabend starten“)", await sr(`return !h.querySelector('form[data-a="evstart"]') && !!h.querySelector('[data-a="evbook"]');`));
  await tap('[data-a="evbook"]');
  last = await p.evaluate(() => fake.applied.at(-1));
  check("„In Kasse buchen“ schickt abend_book und geht zurück zum Start", last?.type === "abend_book" && await sr(`return !!h.querySelector('form[data-a="evstart"]');`), JSON.stringify(last));
  await tap('[data-a="tab"][data-v="kasse"]');
  check("Kasse ohne PIN: Tipp zur PIN", await sr(`return /Mit einer PIN/.test(h.textContent);`));
  await tap('[data-a="open"][data-k="kedit"]');
  check("Buchung antippen = Formular zum Ändern (Name, Betrag, Datum)", await sr(`const f = h.querySelector('form[data-a="kedit"]'); return !!f && !!f.querySelector('input[name="amount"]') && !!f.querySelector('input[name="date"]');`));
  await shot("8-buchung-aendern.png");
  await p.locator("#c1").locator('form[data-a="kedit"] input[name="name"]').fill("Kranz Jubiläum groß");
  await p.locator("#c1").locator('form[data-a="kedit"] input[name="amount"]').fill("40");
  await tap('form[data-a="kedit"] button[type="submit"]');
  last = await p.evaluate(() => fake.applied.at(-1));
  check("Buchung geändert: kasse_edit mit Name, Betrag, Datum", last?.type === "kasse_edit" && last.name === "Kranz Jubiläum groß" && last.amount === 40 && /^\d{4}-\d\d-\d\d$/.test(last.date), JSON.stringify(last));
  // 🔒 mit PIN: Kasse und fertige Abende nur mit PIN
  await p.evaluate(() => { const c = document.querySelector("#c1"); c._server.pin = true; c._view = "abend"; });
  await redraw(); await p.waitForTimeout(100);
  if (!(await sr(`return /Gesperrt/.test(h.querySelector('[data-a="lock"]').title);`))) await tap('[data-a="lock"]'); // vom Offline-Test noch entsperrt → zusperren
  await tap('[data-a="tab"][data-v="kasse"]');
  check("Mit PIN: Kasse fragt nach der PIN", await sr(`return !!h.querySelector('.ppad') && /die Kasse/.test(h.textContent);`));
  await shot("9-kasse-pin.png");
  await p.evaluate(() => { const c = document.querySelector("#c1"); c._pad = null; c._view = "ev"; c._evId = "ev7"; });
  await redraw(); await p.waitForTimeout(100);
  check("Mit PIN: fertiger Abend fragt nach der PIN", await sr(`return !!h.querySelector('.ppad') && /abgeschlossene Kegelabende/.test(h.textContent);`));
  await p.evaluate(() => { const c = document.querySelector("#c1"); c._server.pin = false; c._pad = null; c._view = "abend"; c._server.settings.mascot = true; });
  await redraw(); await p.waitForTimeout(100);
  check("Kegelfigur oben links (Schalter an)", await sr(`return !!h.querySelector('.head .mascotbox svg.mascot');`));
  await shot("10-kegelfigur.png");
  const deco = await p.evaluate(() => { const f = customElements.get("kegelclub-card").mascotDeco; return [f(new Date(2026, 11, 24)), f(new Date(2026, 9, 31)), f(new Date(2026, 6, 1)), f(new Date(2026, 0, 1))].join(); });
  check("Kegelfigur-Kostüme wie beim Sparschwein", deco === "santa,pumpkin,summer,party", deco);
  await tap('[data-a="tab"][data-v="set"]');
  await tap('.lgbox >> nth=4');
  await tap('[data-a="sheet"][data-v="mascot"]');
  check("⚙️ → Ansicht → Maskottchen: Vorschau mit Launen + Kostümen", await sr(`return h.querySelectorAll('.mascotprev svg').length === 14;`), await sr(`return h.querySelectorAll('.mascotprev svg').length;`));
  await shot("11-maskottchen-einstellung.png");
  await tap('[data-a="back"]'); await tap('[data-a="back"]');
}
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

// 📋 Kopieren, wenn das Handy die Zwischenablage sperrt (HA-App): Ersatzweg wie bei der Einkaufsliste, kein Fenster, kein Link
{
  let dialogs = 0; const onDlg = (dl) => { dialogs++; dl.dismiss(); }; p.on("dialog", onDlg);
  const r = await p.evaluate(async () => {
    const c = document.querySelector("#c1"), d = c._data || {};
    const oldUrl = d.app_url; d.app_url = "https://beispiel.ui.nabu.casa/kegelclub/app/";
    const oldCb = Object.getOwnPropertyDescriptor(Navigator.prototype, "clipboard");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => Promise.reject(new Error("NotAllowedError")) } });
    const oldEx = document.execCommand; let copied = null;
    document.execCommand = (cmd) => { if (cmd === "copy") { const a = document.activeElement; const el = a?.shadowRoot?.activeElement || a; copied = (el?.value || "").slice(el.selectionStart, el.selectionEnd) || window.getSelection().toString(); } return true; };
    let toast = ""; const onT = (e) => { toast = e.detail?.message || ""; }; c.addEventListener("hass-notification", onT);
    const inp = document.createElement("input"); inp.id = "appUrl"; inp.value = d.app_url; c.shadowRoot.appendChild(inp);
    c._act({ dataset: { a: "appcopy" } }, new Event("click"));
    await new Promise((res) => setTimeout(res, 50));
    inp.remove(); c.removeEventListener("hass-notification", onT); document.execCommand = oldEx; delete navigator.clipboard; if (oldCb) Object.defineProperty(Navigator.prototype, "clipboard", oldCb); d.app_url = oldUrl;
    return { copied, toast };
  });
  p.off("dialog", onDlg);
  check("Offline-App-Adresse kopieren klappt auch ohne Zwischenablage-Erlaubnis (kein Fenster)", r.copied?.includes("/app/") && dialogs === 0 && /kopiert/i.test(r.toast), JSON.stringify({ ...r, dialogs }));
}
check("Keine Fehler in der Konsole", errs.length === 0, errs.join(" | "));
await b.close();
srv.close();
console.log(fails ? `\n${fails} Prüfung(en) fehlgeschlagen` : "\nAlles grün 🎉");
process.exit(fails ? 1 : 0);
