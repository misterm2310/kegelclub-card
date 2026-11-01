// 🎳 Kegelclub-Karte – Kegelabende, Strafen und die Kegelkasse. Ersatz für Zettel, Stift und Kegelbuch.
// Läuft im Dashboard UND in der Offline-App (/kegelclub/app/). Kein Build-Schritt, reines JavaScript.
//
// So funktioniert's (für Doofe 😄):
// - Home Assistant schickt alle Daten („subscribe“).
// - Jede Änderung (Pumpe, Einzahlung, wer da ist …) wird als kleine „Änderung“ verschickt.
// - Klappt das Verschicken nicht (kein Netz auf der Kegelbahn), landet die Änderung im Postausgang und wird
//   später nachgeschickt. Bis dahin rechnet die Karte selbst so, als wäre sie schon angekommen.
const KC_VERSION = "0.1.0-beta.7";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const QKEY = "kegelclub_queue";
const PAYPAL = "https://paypal.me/MarcoStrickmann";
const REPO = "https://github.com/misterm2310/kegelclub-card";

// 👤 Wie war jemand da? (gleiche Schlüssel wie STATUSES in const.py)
const STATUS = {
  play: { icon: "bowling", color: "#43a047", label: "kegelt" },
  watch: { icon: "glass-mug-variant", color: "#1e88e5", label: "schaut zu" },
  excused: { icon: "account-cancel-outline", color: "#9e9e9e", label: "abgemeldet" },
  absent: { icon: "account-alert-outline", color: "#e53935", label: "nicht abgemeldet" },
};
const STATUS_NEXT = { play: "watch", watch: "excused", excused: "absent", absent: "play" };
// 🎨 Symbole zur Auswahl für Strafen (Material Design Icons)
const KC_ICONS = ["bowling", "arm-flex-outline", "target", "bell-ring-outline", "numeric", "sync", "clock-alert-outline", "cellphone", "crown-outline", "circle-outline", "arrow-down-bold-outline",
  "glass-mug-variant", "beer-outline", "cup-outline", "emoticon-poop", "emoticon-cry-outline", "hand-back-left-outline", "account-voice", "flash-outline", "star-outline", "fire", "alert-octagon-outline", "silverware-fork-knife", "cash"];
const MEMBER_COLORS = ["#1e88e5", "#e91e63", "#8e24aa", "#fb8c00", "#00897b", "#6d4c41", "#3949ab", "#43a047", "#f4511e", "#546e7a"];

// 📖 Anleitung – einfach erklärt, Kapitel zum Aufklappen
const KC_GUIDE = [
  { icon: "rocket-launch-outline", title: "Erste Schritte", text: `Beim allerersten Öffnen fragt die Karte, wie du starten willst: <b>leer</b>, mit <b>Beispiel-Strafen</b> oder mit der <b>Datei aus „Alle Neune“</b>.<br>Danach unter ⚙️ → <b>„Mitglieder & Strafen“</b> eure Leute anlegen und unter ⚙️ → <b>„Regeln & Beträge“</b> Grundbetrag und Kegelbahn einstellen. Fertig – gut Holz! 🎳` },
  { icon: "bowling", title: "Ein Kegelabend", text: `Reiter <b>„Abend“</b> → <b>„Kegelabend starten“</b>. Alle Mitglieder stehen als Kacheln da – in der Reihenfolge wie unter ⚙️ → „Mitglieder & Strafen“.<br><b>1.</b> Wer ist da? <b>Kleiner Knopf unten an der Kachel</b> schaltet weiter: kegelt → schaut zu → abgemeldet → nicht abgemeldet. Wer fehlt, bleibt als <b>blasse Kachel</b> stehen. Für Fehlende geht nur eine Strafe per Hand (<b>„Eigene“</b>).<br><b>2.</b> <b>„Grundbetrag kassiert“</b> antippen, sobald alle bezahlt haben (einzeln geht es in der Abrechnung).<br><b>3.</b> Strafe buchen: <b>Person antippen</b> (blau umrandet), dann die <b>Strafe antippen</b>. Jeder Tipp = +1. Vertippt? Das rote <b>−</b> oben links auf der Kachel nimmt eine zurück. Etwas Besonderes? <b>„Eigene“</b> = Betrag und Grund selbst eintippen.<br><b>4.</b> Zum Schluss in der <b>Abrechnung</b> (rechts stehen nur die Strafen) auf die <b>Münze</b> tippen, wenn bezahlt wurde – sie wird grün ✓.<br><b>5.</b> <b>„Abend abschließen“</b>. Hat noch jemand offen, sagt die Karte vorher Bescheid. Mit Knopf zum <b>Teilen</b> (z. B. in die WhatsApp-Gruppe).` },
  { icon: "account-plus-outline", title: "Gäste", text: `Im laufenden Abend <b>„＋ Gast“</b> antippen: bekannten Gast wählen oder neuen Namen eintippen. Für Gäste gelten die gleichen Regeln wie für Mitglieder. Ein Gast, der nicht da ist, zahlt nichts – er gehört ja nicht zum Abend.` },
  { icon: "cash-multiple", title: "Was kostet was?", text: `Unter ⚙️ → <b>„Regeln & Beträge“</b>:<br>• <b>Grundbetrag</b> pro Person und Abend (z. B. 7,50 €).<br>• <b>Zuschauer zahlen</b> den Grundbetrag (Schalter).<br>• <b>Fehlende Mitglieder zahlen</b> den Grundbetrag (Schalter) – egal ob abgemeldet oder nicht.<br>• <b>Nicht abgemeldet</b>: Extra-Betrag obendrauf (z. B. 5,00 €).<br>• <b>Kegelbahn</b>: pro Stunde, aus der <b>Kasse</b> (wird beim <b>Abschließen</b> als Zeile „Kegelbahn“ in die Buchungen geschrieben), auf die Anwesenden <b>aufgeteilt</b> oder <b>gar nicht</b>.<br>Ändern gilt ab sofort und für den laufenden Abend. Abgeschlossene Abende bleiben, wie sie waren.` },
  { icon: "gavel", title: "Sündenregister (Strafen)", text: `⚙️ → <b>„Mitglieder & Strafen“</b> → Bereich <b>Strafen</b> → <b>＋ Neu</b>. Jede Strafe hat Name, Symbol, Betrag und <b>„Wer zahlt?“</b>:<br>• <b>Er selbst</b> – z. B. Pumpe, Klingeln.<br>• <b>Alle anderen, die mitkegeln</b> – z. B. <b>Alle Neune</b>: Wer die Neun wirft, zahlt nichts, alle anderen Mitkegler zahlen. Zuschauer und Fehlende bleiben verschont.<br>Am Griff ⠿ ziehen = Reihenfolge der Knöpfe am Abend.` },
  { icon: "hand-okay", title: "Strafen erlassen", text: `Ausflug, Weihnachtsfeier, Geburtstag? Im Abend (oder später in der Liste der Abende) den Schalter <b>„Strafen erlassen“</b> an: Gezählt wird trotzdem (für die Statistik), bezahlt wird nur der Grundbetrag.` },
  { icon: "bank-outline", title: "Kegelkasse", text: `Reiter <b>„Kasse“</b>: oben der <b>Kassenstand</b>, darunter <b>„Wer schuldet was“</b>. Hat jemand bezahlt: <b>grünen Haken ✓</b> antippen – dann ist alles beglichen (Rückgängig geht 8 Sekunden lang). Teilbetrag? Auf die Person tippen.<br><b>＋ Einzahlung</b> und <b>− Ausgabe</b> (z. B. Kegelfahrt, Essen) für alles andere. Die Kegelbahn bucht sich je nach Einstellung selbst.<br><b>„Soll“</b> = Kasse + was noch offen ist.` },
  { icon: "chart-bar", title: "Statistik & Ehrungen", text: `Reiter <b>„Statistik“</b>: Jahr mit ‹ › wählen. Oben die <b>Könige</b> (wer hat die meisten Pumpen, Neunen …), dann <b>Strafen pro Person</b> (Säulen), <b>Strafen nach Art</b> (Kuchen), <b>Kasse übers Jahr</b> (Linie) und <b>Anwesenheit</b>.` },
  { icon: "history", title: "Alte Abende", text: `Unten im Reiter „Abend“ stehen die letzten Abende. Antippen = Abrechnung ansehen, <b>wieder öffnen</b> (z. B. vergessene Pumpe nachtragen), Datum ändern oder löschen.` },
  { icon: "database-import-outline", title: "Aus „Alle Neune“ umziehen", text: `In der App „Alle Neune“ die Daten <b>exportieren</b> (Datenbank-Datei). Dann hier ⚙️ → <b>„Import & Sicherung“</b> → Datei wählen. Erst kommt eine <b>Vorschau</b> (wie viele Abende, Personen, Buchungen, Kassenstand), erst nach „Übernehmen“ wird etwas geändert.<br>Übernommen werden Mitglieder, Ehemalige, Gäste, Strafen mit Preisen, alle Abende mit Strafen (für die Statistik) und die <b>komplette Kasse</b>. Alte Abende zählen nicht als „offen“ – die waren in der App ja schon abgerechnet. Spiele werden nicht übernommen.` },
  { icon: "content-save-outline", title: "Sichern", text: `⚙️ → „Import & Sicherung“: <b>„Sicherung speichern“</b> lädt alles als Datei herunter (.json). Mit derselben Datei holst du später alles zurück. Die Kasse gibt es zusätzlich als <b>CSV</b> für Excel.` },
  { icon: "cellphone-lock", title: "Offline-App für die Kegelbahn", text: `Auf der Kegelbahn ist das WLAN oft schlechter als die Pumpe vom Kassenwart. Darum gibt es eine eigene kleine App: Adresse in ⚙️ → <b>„Offline-App“</b>. Im Handy-Browser öffnen → anmelden → „Zum Startbildschirm“.<br>Ohne Netz läuft alles weiter. Was du einträgst, wartet im <b>Postausgang</b> (oben „⏳ wartet“) und wird von selbst nachgeschickt. Nichts zählt doppelt – auch wenn zwei Handys gleichzeitig Strafen buchen.` },
  { icon: "shield-key-outline", title: "PIN-Sperre und Seitenleiste", text: `In ⚙️ unter <b>„Schutz“</b> legst du eine PIN (4–8 Ziffern) fest. Dann fragt ⚙️ danach (auch für Mitglieder & Strafen). Strafen buchen geht weiter ohne PIN. Wahlweise sperrt die PIN die <b>ganze Karte</b>.<br><b>PIN vergessen?</b> Ein Admin geht auf <b>Einstellungen → Geräte & Dienste → Kegelclub → Konfigurieren</b> und hakt <b>„PIN zurücksetzen“</b> an. Dort gibt es auch <b>„In der Seitenleiste anzeigen“</b>.` },
  { icon: "home-group", title: "Mehrere Clubs", text: `<b>Einstellungen → Geräte &amp; Dienste → Kegelclub → Eintrag hinzufügen</b> und einen Namen geben. Jeder Club hat eigene Mitglieder, Strafen, Kasse, PIN und Sensoren. Im Karten-Editor wählst du bei „Welcher Club?“.` },
  { icon: "home-assistant", title: "Sensoren und Aktionen", text: `Sensoren: <b>Kegelkasse</b>, <b>Offen</b> (mit allen Schuldnern), <b>Letzter Abend</b> und <b>Kegelabend läuft</b> (an/aus).<br>Aktionen für Automationen: <code>kegelclub.strafe_buchen</code>, <code>kegelclub.abend_starten</code>, <code>kegelclub.abend_abschliessen</code>, <code>kegelclub.einzahlung</code>, <code>kegelclub.ausgabe</code>, <code>kegelclub.daten_abrufen</code>. Beispiele stehen im README.` },
  { icon: "lock-outline", title: "Datenschutz", text: `Alles bleibt in <b>deinem</b> Home Assistant. Keine Cloud, kein Tracking, nichts geht ins Internet. In der Offline-App liegt zusätzlich eine Kopie im Handy, bis du dich abmeldest.` },
  { icon: "eye-outline", title: "Ansicht, Verlauf, Gesundheit", text: `<b>👁️ Ansicht</b> (für alle): Reiter ausblenden, <b>Beschriftungen</b> unter Symbolen, <b>Kassenstand verschleiern</b>. <b>Ruhiger Modus</b> nur für dieses Gerät, in der Offline-App <b>Hell / Dunkel</b>.<br><b>📜 Verlauf</b>: wer hat wann was gebucht. <b>🩺 Alles ok?</b> sucht nach Dingen, die nicht passen (z. B. Abend vergessen abzuschließen).` },
];
// 🆕 Was ist neu – das Neueste oben (wie bei der Einkaufsliste)
const KC_NEWS = [
  ["0.1.0-beta.7", "🙏 <b>Credits wie bei der Einkaufsliste:</b> Mister-M-Logo, Version, Knöpfe für GitHub, 💡 Idee oder Wunsch, 🐞 Fehler melden und Spenden mit PayPal – in ⚙️ → Credits und unten in der Anleitung."],
  ["0.1.0-beta.6", "📤 <b>Drucken & Teilen</b> wie bei der Einkaufsliste: beim Abend auf „Teilen“ → Abrechnung drucken, als echte <b>PDF</b> teilen/speichern (iPhone: Teilen-Menü → Drucken), <b>QR-Code</b> fürs Handy oder als Text · 📸 <b>Fotos</b> für Mitglieder (Kamera oder Bild), ohne Foto bleibt alles wie vorher · 👥 <b>Mitglieder & Strafen</b> sind jetzt unter ⚙️ (Reiter weg) · 💶 Knopf wieder „Grundbetrag kassiert (5)“ · 🔒 Wer schon eine Strafe hat, dessen Grundbetrag bleibt bezahlt · 🤝 Bei Fehlenden kann man Grundbetrag und „nicht abgemeldet“ in der Abrechnung antippen, wenn jemand für sie zahlt · 📊 Statistik mit vollem Namen und liegenden Balken"],
  ["0.1.0-beta.5", "📊 Statistik viel ausführlicher: oben 4 Reiter <b>Überblick · Personen · Abende · Strafen</b> · 📅 Knopf „Alle Jahre“ (alles seit Beginn) · 📋 Zahlen mit Vergleich zum Vorjahr (▲ mehr, ▼ weniger) · 🏆 Rekorde (teuerster Abend, meiste Strafe, längste Serie …) · 👤 Person antippen = eigene Seite mit Strafen-Arten und Abend für Abend · 📅 Tabelle je Abend (antippen = Abend öffnen) · 🧮 Strafen-Tabelle „Wer hat was?“"],
  ["0.1.0-beta.4", "💶 Fix: Wer nach „Grundbetrag kassiert“ auf abgemeldet gestellt wird, bekommt den Grundbetrag automatisch wieder aus der Kasse (steht dann unter „Wer schuldet was“) · 👥 Der Knopf zeigt, <b>von wem</b> er kassiert · 🧾 In der Abrechnung stehen Fehlende wieder mit drin – blass, mit offenem Grundbetrag (+ Extra bei nicht abgemeldet)"],
  ["0.1.0-beta.3", "🙈 Keine extra Zeile „Fehlen heute“ mehr: Wer fehlt, bleibt als <b>blasse Kachel</b> stehen · ✍️ Für Fehlende geht nur <b>„Eigene“</b> (Strafe per Hand) – sie erscheinen dann auch in der Abrechnung"],
  ["0.1.0-beta.2", "➖ <b>Minus oben links</b> auf der Strafen-Kachel · ✍️ <b>Eigene Strafe</b> mit Betrag und Grund · 💶 <b>Grundbetrag kassiert</b> am Anfang und 🪙 <b>Münze</b> in der Abrechnung (rechts nur noch die Strafen) · 🙈 Wer fehlt, ist ausgeblendet („Fehlen heute“) · ⠿ feste Reihenfolge wie unter „Mitglieder“ · 🎳 Kegelbahn erst beim Abschließen aus der Kasse, als eigene Zeile · ⚠️ Hinweis beim Abschließen, wenn noch jemand offen ist · ↩️ Rückgängig-Knopf repariert"],
  ["0.1.0-beta.1", "🎉 <b>Erste Beta!</b> · 🎳 Kegelabend mit großen Strafen-Knöpfen, vier Zuständen (kegelt, schaut zu, abgemeldet, nicht abgemeldet) und Gästen · 💸 eigenes Sündenregister, auch „<b>alle anderen zahlen</b>“ (Alle Neune) · 🙌 Strafen erlassen · 🏦 Kegelkasse mit „Wer schuldet was“, Einzahlungen, Ausgaben und Kegelbahn (aus der Kasse, aufgeteilt oder aus) · 📊 Statistik mit Königen, Säulen, Kuchen und Linie · 📥 Umzug aus <b>„Alle Neune“</b> inkl. aller alten Abende und der Kasse · 💾 Sicherung · 📱 Offline-App für die Kegelbahn · 🔒 PIN · 📖 Anleitung"],
];
const GUIDE_EMO = ["🚀", "🎳", "👤", "💶", "💸", "🙌", "🏦", "📊", "🕘", "📥", "💾", "📱", "🔒", "🏠", "🤖", "🛡️", "👁️"];
const GUIDE_SUB = ["leer, Vorlage oder Umzug", "starten, buchen, abschließen", "gleiche Regeln wie Mitglieder", "Grundbetrag, Fehlende, Kegelbahn", "selbst angelegt, wer zahlt", "Ausflug & Co.", "Stand, Schulden, Einzahlung", "Könige und Diagramme", "nachtragen, ansehen", "Datei einlesen", "alles als Datei", "ohne Netz auf der Bahn", "PIN, Schloss, Seitenleiste", "mehrere Clubs", "für Automationen", "alles bleibt bei dir", "für alle oder nur hier"];
const KC_CARDS = new Set(); // ↩️ alle Kegelclub-Karten auf der Seite (für die Zurück-Taste)
const DKEY = "kegelclub_data";
const HKEY = "kegelclub_hidden";
const CALMKEY = "kegelclub_calm"; // 🧘 Ruhiger Modus – nur dieses Gerät
const THEMEKEY = "kcapp_theme";   // 🌓 Hell / Dunkel – nur in der Offline-App
const kcTheme = () => { try { return localStorage.getItem(THEMEKEY) || "auto"; } catch (_) { return "auto"; } };
// 👁️ Was man für alle ausblenden kann (gleiche Schlüssel wie VIEW_KEYS in manager.py)
const KC_VIEW = [["kasse", "bank-outline", "Reiter „Kasse“", "Kassenstand und Schulden"], ["statistik", "chart-bar", "Reiter „Statistik“", "Könige und Diagramme"]];
function kcVerCmp(a, b) {
  const p = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)(?:-beta\.(\d+))?/.exec(String(v).trim()); return m ? [+m[1], +m[2], +m[3], m[4] === undefined ? Infinity : +m[4]] : [0, 0, 0, Infinity]; };
  const [x, y] = [p(a), p(b)];
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  return 0;
}
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// 💱 Währung (⚙️ → Rechnen & Warnung). CHF wird schweizerisch geschrieben (CHF 1’234.50), der Rest deutsch (1.234,50 €)
const KC_CUR = { EUR: "Euro (€)", CHF: "Schweizer Franken (CHF)", USD: "US-Dollar ($)", GBP: "Britisches Pfund (£)", PLN: "Polnischer Złoty (zł)", CZK: "Tschechische Krone (Kč)", DKK: "Dänische Krone (kr)", SEK: "Schwedische Krone (kr)", NOK: "Norwegische Krone (kr)", HUF: "Ungarischer Forint (Ft)" };
const KC_MONEY = { key: "", fmt: null, code: "EUR", sym: "€", dec: "," };
function kcSetMoney(code, lang = "de") {
  code = KC_CUR[code] ? code : "EUR";
  const key = `${code}|${lang}`;
  if (KC_MONEY.key === key) return;
  const loc = code === "CHF" ? (lang === "en" ? "en-CH" : "de-CH") : (lang === "en" ? "en-IE" : "de-DE");
  const fmt = new Intl.NumberFormat(loc, { style: "currency", currency: code });
  const parts = fmt.formatToParts(1234.5);
  Object.assign(KC_MONEY, { key, fmt, code, sym: parts.find((x) => x.type === "currency")?.value || code, dec: parts.find((x) => x.type === "decimal")?.value || "," });
}
kcSetMoney("EUR");
const money = (v) => KC_MONEY.fmt.format(Number(v) || 0);
const uid = () => (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "").slice(0, 16) : Math.random().toString(36).slice(2) + Date.now().toString(36));
const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
function parseMoney(v) {
  if (typeof v === "number") return Math.round(v * 100) / 100;
  let s = String(v ?? "").replace("−", "-").replace(/\b(EUR|CHF|SFr\.?|Fr\.|USD|US\$|GBP|PLN|CZK|DKK|SEK|NOK|HUF|zł|Kč|kr\.?|Ft)(?![a-z])|[€$£]/gi, "").replace(/[\s  '’]/g, ""); // 💱 Zeichen weg
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""); // 1.234,56 oder 1,234.56
  else if (s.includes(",")) s = s.replace(",", ".");
  else if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
  put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) { /* voll/privat */ } },
};

// 🌍 Englisch als zweite Sprache (wie bei der Einkaufsliste): Die Karte ist auf Deutsch geschrieben. Ist Home Assistant
// NICHT auf Deutsch (oder steht in der Karte „language: en“), holt sie einmal das Wörterbuch kegelclub-en.json und übersetzt,
// was sie anzeigt. Eure eigenen Namen (Mitglieder, Strafen, Buchungen …) bleiben, wie sie sind.
let KC_LANG = "de", KC_DICT = null, KC_PATTERNS = [], KC_DICT_PROMISE = null, KC_DICT_FAIL = 0;
const KC_USER = new Set(); // ✋ Namen, die die Leute selbst getippt haben – nie übersetzen
const KC_ATTRS = ["placeholder", "title", "aria-label", "alt"];
const KC_SKIP = "textarea,style,script,option[data-user],[translate=no]";
const KC_INLINE = new Set(["B", "I", "EM", "STRONG", "BR", "CODE", "U", "SMALL"]);
const kcNorm = (t) => String(t).replace(/\s+/g, " ").trim();
function kcWantLang(hass, config) {
  const want = String(config?.language || "auto").toLowerCase();
  const l = want !== "auto" ? want : String(hass?.locale?.language || hass?.language || "de").toLowerCase();
  return l.startsWith("de") ? "de" : "en";
}
function kcLoadDict() {
  if (!KC_DICT_PROMISE && Date.now() - KC_DICT_FAIL > 60000) {
    KC_DICT_PROMISE = fetch(`/kegelclub/files/kegelclub-en.json?v=${KC_VERSION}`).then((r) => r.json()).then((raw) => {
      const dict = {}, pats = [];
      for (const [de, en] of Object.entries(raw)) {
        if (de.startsWith("//")) continue; // Kommentar-Zeilen
        const key = kcNorm(de);
        if (!key.includes("{}")) { dict[key] = en; continue; }
        const parts = key.split("{}");
        pats.push([new RegExp("^" + parts.map((x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(.*?)") + "$", "s"), en, parts.join("").length]);
      }
      pats.sort((a, b) => b[2] - a[2]); // genauere Muster zuerst
      KC_DICT = dict; KC_PATTERNS = pats;
      for (const c of KC_CARDS) { c._force = true; c._render(); }
    }).catch(() => { KC_DICT_PROMISE = null; KC_DICT_FAIL = Date.now(); });
  }
  return KC_DICT_PROMISE || Promise.resolve();
}
// 📝 Ein Text auf Englisch (oder unverändert, wenn es ihn im Wörterbuch nicht gibt)
function kcT(text, depth = 0) {
  if (KC_LANG === "de" || !KC_DICT || text == null) return text;
  const raw = String(text), key = kcNorm(raw);
  if (!key || !/[A-Za-zÄÖÜäöüß]/.test(key) || KC_USER.has(key)) return raw;
  const lead = raw.match(/^\s*/)[0], trail = raw.match(/\s*$/)[0], wrap = (x) => lead + x + trail;
  if (key in KC_DICT) return wrap(KC_DICT[key]);
  for (const [rx, en] of KC_PATTERNS) {
    const m = key.match(rx);
    if (m) return wrap(en.replace(/\{(\d)\}/g, (_, i) => { const g = m[Number(i) + 1] ?? ""; return depth < 2 ? kcT(g, depth + 1) : g; }));
  }
  const m = depth < 2 && key.match(/^([^\p{L}\p{N}„“"(<]+?)\s(.+)$/u); // „🏦 Kasse“: Zeichen vorne weg, Rest übersetzen
  if (m) { const rest = kcT(m[2], depth + 1); if (rest !== m[2]) return wrap(`${m[1]} ${rest}`); }
  return raw;
}
// 🧱 Ein Absatz mit <b>fett</b> darin wird als Ganzes übersetzt (sonst zerfällt der Satz in Stücke)
function kcBlockKey(el) {
  if (!el.firstElementChild || el.closest(KC_SKIP)) return null;
  let words = false;
  for (const n of el.childNodes) {
    if (n.nodeType === 3) { if (/[A-Za-zÄÖÜäöüß]/.test(n.data)) words = true; }
    else if (n.nodeType === 1) { if (!KC_INLINE.has(n.tagName) || n.firstElementChild || n.attributes.length) return null; }
  }
  return words ? kcNorm(el.innerHTML) : null;
}
function kcTranslateTree(root) {
  if (KC_LANG === "de" || !KC_DICT || !root) return;
  const w = document.createTreeWalker(root, 5 /* Elemente + Text */);
  let n = w.nextNode();
  while (n) {
    if (n.nodeType === 1) {
      if (n.matches(KC_SKIP)) { n = w.nextSibling() || kcNext(w); continue; }
      for (const a of KC_ATTRS) { const v = n.getAttribute(a); if (v) { const t = kcT(v); if (t !== v) n.setAttribute(a, t); } }
      const bk = kcBlockKey(n);
      if (bk) { const t = kcT(bk); if (t !== bk) { n.innerHTML = t; n = w.nextSibling() || kcNext(w); continue; } }
    } else if (n.parentElement && !n.parentElement.closest(KC_SKIP)) { const t = kcT(n.data); if (t !== n.data) n.data = t; }
    n = w.nextNode();
  }
}
function kcNext(w) { let p; while ((p = w.parentNode())) { const s = w.nextSibling(); if (s) return s; } return null; }
const kcConfirm = (t) => confirm(kcT(t));
// ✋ Alles, was die Leute selbst benannt haben, landet in KC_USER und wird nie übersetzt
function kcCollectUser(d) {
  KC_USER.clear();
  if (!d) return;
  const add = (x) => { const k = kcNorm(x ?? ""); if (k) KC_USER.add(k); };
  for (const k of ["members", "strafen", "kasse"]) for (const it of d[k] || []) { add(it.name); add(it.note); }
  for (const ev of d.abende || []) add(ev.note);
  for (const q of d.settings?.quick || []) add(q);
  add(d.book?.title);
}
const kcLoc = () => (KC_LANG === "en" ? "en-GB" : "de-DE");
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// 🔒 Entsperrt gilt für alle Kegelclub-Karten dieser Seite, bis 🔒 angetippt wird oder 10 Minuten nichts passiert
const PIN_LOCK = { until: 0 };
const pinOpen = () => PIN_LOCK.until > Date.now();
const pinTouch = () => { if (pinOpen()) PIN_LOCK.until = Date.now() + 10 * 60 * 1000; };
// 🎨 Farben wie bei der Einkaufsliste: jede Gruppe bekommt ihre Farbe (Streifen links + Punkt im Kopf)
const GROUP_COLORS = ["#1e88e5", "#fb8c00", "#8e24aa", "#00897b", "#e53935", "#6d4c41", "#3949ab"];
const ic = (name) => `<ha-icon icon="mdi:${name}"></ha-icon>`;

const KC_EMOJI_ICONS = {
  "🏷": "mdi:tag-outline", "✏": "mdi:pencil-outline", "✍": "mdi:account-edit-outline", "📷": "mdi:camera-outline", "📖": "mdi:book-open-variant", "➕": "mdi:plus",
  "📍": "mdi:map-marker-outline", "👁": "mdi:eye-outline", "🛒": "mdi:cart-outline", "✅": "mdi:check-circle-outline", "🔄": "mdi:sync", "🔁": "mdi:repeat",
  "⚠": "mdi:alert-outline", "📋": "mdi:clipboard-text-outline", "📊": "mdi:chart-bar", "✔": "mdi:check", "🧂": "mdi:shaker-outline", "⏳": "mdi:timer-sand",
  "⌛": "mdi:timer-sand", "🏪": "mdi:store-outline", "📧": "mdi:email-outline", "↩": "mdi:undo-variant", "⇄": "mdi:swap-horizontal",
  "🤷": "mdi:map-marker-question-outline", "🕒": "mdi:clock-outline", "💡": "mdi:lightbulb-outline", "🧾": "mdi:receipt-text-outline", "🎉": "mdi:party-popper",
  "👥": "mdi:account-group-outline", "👪": "mdi:account-multiple-outline", "👤": "mdi:account-outline", "⏲": "mdi:pot-steam-outline", "⏱": "mdi:timer-outline",
  "🧲": "mdi:magnet", "🗓": "mdi:calendar-month-outline", "📅": "mdi:calendar-outline", "🚫": "mdi:cancel", "🥫": "mdi:food-variant", "📈": "mdi:chart-line",
  "🧽": "mdi:delete-sweep-outline", "🧹": "mdi:broom", "💣": "mdi:nuke", "🔧": "mdi:wrench-outline", "📝": "mdi:note-text-outline", "⭐": "mdi:star-outline",
  "⌨": "mdi:keyboard-outline", "🗞": "mdi:newspaper-variant-outline", "🖼": "mdi:image-outline", "🔒": "mdi:lock-outline", "🔓": "mdi:lock-open-variant-outline",
  "📦": "mdi:package-variant-closed", "🔥": "mdi:fire", "🤖": "mdi:robot-happy-outline", "🔠": "mdi:format-size", "⚙": "mdi:cog-outline", "🗂": "mdi:shape-outline",
  "🗺": "mdi:map-outline", "🧠": "mdi:brain", "🗣": "mdi:microphone-outline", "🌐": "mdi:web", "🍽": "mdi:silverware-fork-knife", "📄": "mdi:file-document-outline",
  "🧮": "mdi:calculator-variant-outline", "🔊": "mdi:volume-high", "📳": "mdi:vibrate", "🎌": "mdi:flag-outline", "👋": "mdi:hand-wave-outline", "🔐": "mdi:key-outline",
  "📏": "mdi:ruler", "✖": "mdi:close", "🗑": "mdi:delete-outline", "▥": "mdi:barcode", "🧩": "mdi:puzzle-outline", "🧰": "mdi:toolbox-outline", "🔢": "mdi:numeric", "🎨": "mdi:palette-outline", "🔀": "mdi:shuffle-variant", "✓": "mdi:check", "🍕": "mdi:pizza", "🍝": "mdi:pasta", "🥔": "mdi:food-variant", "🥚": "mdi:egg-outline", "🥦": "mdi:carrot", "🍗": "mdi:food-drumstick-outline", "🐟": "mdi:fish", "🍲": "mdi:pot-steam-outline", "💨": "mdi:weather-windy", "🍰": "mdi:cake-variant-outline", "🎛": "mdi:tune-variant", "💾": "mdi:content-save-outline", "💶": "mdi:cash-multiple", "🩺": "mdi:stethoscope", "📱": "mdi:cellphone", "🧪": "mdi:flask-outline", "👨‍🍳": "mdi:chef-hat", "🛍": "mdi:shopping-outline", "🪟": "mdi:window-open-variant", "✨": "mdi:creation-outline", "👆": "mdi:gesture-tap", "💳": "mdi:credit-card-outline", "🙏": "mdi:hand-heart-outline", "🐙": "mdi:github", "🐞": "mdi:bug-outline", "🔍": "mdi:magnify", "📥": "mdi:tray-arrow-down", "🕘": "mdi:history", "🌓": "mdi:theme-light-dark", "🛡": "mdi:shield-outline",
};
// 🎨 Farben zu den Symbolen (damit es nicht trist wird): nur außerhalb von Knöpfen/Links, dort gilt die Schriftfarbe des Knopfes
const KC_EMOJI_COLORS = {
  "🧹": "#fb8c00", "✍": "#5c6bc0", "📍": "#e53935", "🏷": "#d81b60", "🛒": "#43a047", "✅": "#43a047", "⚠": "#f9a825", "🔧": "#607d8b", "🥫": "#8d6e63",
  "🧾": "#3949ab", "📖": "#1e88e5", "⭐": "#f9a825", "🔒": "#546e7a", "🔓": "#546e7a", "📷": "#1e88e5", "📝": "#6d4c41", "✏": "#6d4c41", "💡": "#f9a825",
  "🎉": "#ab47bc", "🔥": "#ef6c00", "🕒": "#546e7a", "🌐": "#1e88e5", "🔊": "#1e88e5", "📊": "#00897b", "🧂": "#8d6e63", "🏪": "#43a047", "📧": "#1e88e5",
  "🔄": "#1e88e5", "🔁": "#1e88e5", "📋": "#1e88e5", "🗓": "#43a047", "📅": "#43a047", "👥": "#8e24aa", "👪": "#8e24aa", "👤": "#8e24aa", "🧲": "#e53935",
  "🚫": "#e53935", "🗑": "#e53935", "💣": "#b71c1c", "🧽": "#fb8c00", "📈": "#00897b", "🗞": "#d81b60", "🤖": "#5e35b1", "🧠": "#5e35b1", "🤷": "#78909c",
  "⏳": "#fb8c00", "⌛": "#fb8c00", "↩": "#1e88e5", "⇄": "#1e88e5", "🔠": "#546e7a", "🗂": "#fb8c00", "🗺": "#43a047", "🗣": "#1e88e5", "📦": "#8d6e63",
  "🍽": "#fb8c00", "📄": "#546e7a", "🧮": "#00897b", "📳": "#546e7a", "🎌": "#e53935", "👋": "#fb8c00", "🔐": "#546e7a", "📏": "#546e7a", "🧪": "#8e24aa",
  "👨‍🍳": "#e53935", "🛍": "#43a047", "🪟": "#1e88e5", "✨": "#f9a825", "👆": "#1e88e5", "💳": "#00acc1", "🙏": "#ec407a", "🐞": "#e53935", "🔍": "#546e7a",
  "📥": "#1e88e5", "🕘": "#546e7a", "🌓": "#546e7a", "🛡": "#455a64", "⌨": "#546e7a", "🖼": "#1e88e5", "⏲": "#ef6c00", "⏱": "#26a69a", "▥": "#6d4c41", "🍝": "#f9a825", "🥔": "#8d6e63", "🥚": "#fbc02d", "🥦": "#43a047", "🍗": "#bf6b3a", "🐟": "#1e88e5", "🍲": "#ef6c00", "💨": "#546e7a", "🧩": "#8e24aa", "🧰": "#546e7a", "🔢": "#1e88e5", "🎨": "#ec407a", "🔀": "#1e88e5",
};
// 🧩 Farben der großen Gruppen-Kästchen in den Einstellungen (Emoji der Gruppe → Farbe)
const KC_GEM_COLORS = { "💶": "#fb8c00", "🧮": "#00897b", "📋": "#1e88e5", "🎛": "#8e24aa", "💾": "#43a047", "🩺": "#e53935", "👁": "#00897b", "📱": "#3949ab" };

// 🎳 Extra-Symbole nur für den Kegelclub
Object.assign(KC_EMOJI_ICONS, { "🐷": "mdi:piggy-bank-outline", "🏦": "mdi:bank-outline", "💵": "mdi:cash", "➖": "mdi:minus", "💰": "mdi:cash-multiple", "🎳": "mdi:bowling", "💸": "mdi:cash-minus", "🏁": "mdi:flag-checkered", "🙌": "mdi:hand-okay", "🏆": "mdi:trophy-outline", "👑": "mdi:crown-outline", "🎯": "mdi:target", "📤": "mdi:tray-arrow-up", "🙈": "mdi:eye-off-outline" });
Object.assign(KC_EMOJI_COLORS, { "🐷": "#e91e63", "🏦": "#1e88e5", "💵": "#43a047", "💰": "#43a047", "🎳": "#fb8c00", "💸": "#e53935", "🏁": "#43a047", "🏆": "#f9a825", "👑": "#f9a825", "🎯": "#fb8c00", "📤": "#1e88e5" });
const KC_EMOJI_RX = new RegExp("^\\s*(" + Object.keys(KC_EMOJI_ICONS).sort((a, b) => b.length - a.length).join("|") + ")\\uFE0F?(?=\\s|$)\\s*", "u");
const KC_ICON_PARENTS = "button,h2,h3,h4,summary,legend,label,b,span,li,a,small,p,.lbl,.ic";
const KC_ICON_SKIP = "option,select,textarea,input,ha-icon,style,script,[data-noicon]";
// 🎛️ Wie bei der Einkaufsliste: Emoji vorn an Knöpfen/Überschriften → Linien-Symbol (sieht auf jedem Gerät gleich aus)
function kcIconizeTree(root) {
  if (!root) return;
  const nodes = []; const w = document.createTreeWalker(root, 4 /* Text */); let n; while ((n = w.nextNode())) nodes.push(n);
  for (const t of nodes) {
    const p = t.parentElement;
    if (!p || !p.matches(KC_ICON_PARENTS) || p.closest(KC_ICON_SKIP)) continue; // eigene Namen bekommen data-noicon
    let first = p.firstChild; // das Emoji muss ganz vorn stehen
    while (first && first !== t && ((first.nodeType === 3 && !first.data.trim()) || (p.tagName === "LABEL" && first.nodeType === 1 && first.matches("input")))) first = first.nextSibling;
    if (first !== t) continue;
    const m = KC_EMOJI_RX.exec(t.data);
    if (!m) continue;
    const key = m[1];
    const ic = document.createElement("ha-icon");
    ic.setAttribute("icon", KC_EMOJI_ICONS[key]);
    ic.dataset.eli = "1";
    const gem = p.classList.contains("gem"); // großes Kästchen in den Einstellungen: farbiger Grund, weißes Symbol
    const plain = !gem && !p.closest("button,a,.tgl,.swline"); // Knöpfe und Links behalten ihre Schriftfarbe
    const flex = /flex/.test(getComputedStyle(p).display || "");
    ic.style.cssText = `--mdc-icon-size:${gem ? "1.25em" : "1.2em"};vertical-align:-.22em;flex:none;${flex || gem ? "" : "margin-right:.3em;"}${plain && KC_EMOJI_COLORS[key] ? `color:${KC_EMOJI_COLORS[key]};` : ""}`;
    if (gem) { p.style.setProperty("background", KC_GEM_COLORS[key] || KC_EMOJI_COLORS[key] || "#607d8b"); p.style.color = "#fff"; }
    const rest = t.data.slice(m[0].length);
    t.data = rest;
    if (p.tagName === "LABEL") { const wrap = document.createElement("span"); p.insertBefore(wrap, t); wrap.append(ic, t); }
    else p.insertBefore(ic, t);
  }
}
const numDe = (v) => (KC_MONEY.dec === "," ? String(v).replace(".", ",") : String(v)); // ✍️ Zahl fürs Eingabefeld, passend zur Währung
// ---------------------------------------------------------------- 📱 QR-Code (selbst gezeichnet, ohne Bibliothek – aus der Einkaufsliste)
const kcQrMatrix = (text) => {
  const bytes = Array.from(new TextEncoder().encode(String(text)));
  // Korrektur-Bytes je Block und Anzahl Blöcke (Stufe M), Version 1–40 (aus der QR-Norm)
  const ECC = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28];
  const BLK = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49];
  const rawModules = (v) => {
    let r = (16 * v + 128) * v + 64;
    if (v >= 2) { const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; }
    return r;
  };
  let ver = 0;
  for (let v = 1; v <= 40; v++) {
    const cap = Math.floor(rawModules(v) / 8) - ECC[v] * BLK[v];
    const need = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
    if (need <= cap * 8) { ver = v; break; }
  }
  if (!ver) return null;
  const size = ver * 4 + 17;
  const dataCw = Math.floor(rawModules(ver) / 8) - ECC[ver] * BLK[ver];
  // 1) Bits: Modus „Bytes“, Länge, Daten, Abschluss
  const bits = [];
  const put = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  put(4, 4); put(bytes.length, ver < 10 ? 8 : 16); bytes.forEach((b) => put(b, 8));
  put(0, Math.min(4, dataCw * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  for (let pad = 0xec; bits.length < dataCw * 8; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  // 2) Reed-Solomon
  const exp = [], log = [];
  for (let i = 0, x = 1; i < 256; i++) { exp[i] = x; log[x] = i; x <<= 1; if (x & 256) x ^= 0x11d; }
  const mul = (a, b) => (a && b ? exp[(log[a] + log[b]) % 255] : 0);
  const rs = (blk, n) => {
    let gen = [1];
    for (let i = 0; i < n; i++) { const nx = new Array(gen.length + 1).fill(0); gen.forEach((c, j) => { nx[j] ^= c; nx[j + 1] ^= mul(c, exp[i]); }); gen = nx; }
    const rem = new Array(n).fill(0);
    blk.forEach((b) => { const f = b ^ rem.shift(); rem.push(0); for (let j = 0; j < n; j++) rem[j] ^= mul(gen[j + 1], f); });
    return rem;
  };
  const nb = BLK[ver], short = nb - (dataCw % nb), base = Math.floor(dataCw / nb), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const len = base + (i < short ? 0 : 1);
    const d = data.slice(k, k + len); k += len;
    blocks.push({ d, e: rs(d, ECC[ver]) });
  }
  const all = [];
  for (let i = 0; i <= base; i++) blocks.forEach((b, j) => { if (i < b.d.length && !(i === base && j < short)) all.push(b.d[i]); });
  for (let i = 0; i < ECC[ver]; i++) blocks.forEach((b) => all.push(b.e[i]));
  // 3) Matrix aufbauen
  const mod = Array.from({ length: size }, () => new Array(size).fill(0));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { if (x >= 0 && y >= 0 && x < size && y < size) { mod[y][x] = d ? 1 : 0; fn[y][x] = true; } };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } };
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
  const na = ver === 1 ? 0 : Math.floor(ver / 7) + 2;
  const step = ver === 1 ? 0 : ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
  const al = [6]; for (let p = size - 7; al.length < na; p -= step) al.splice(1, 0, p);
  al.forEach((ax, i) => al.forEach((ay, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === na - 1) || (i === na - 1 && j === 0)) return;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }));
  const fmtBits = (mask) => { // Formatinformation (Stufe M = 00)
    let rem = mask; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((mask << 10) | rem) ^ 0x5412;
  };
  const drawFormat = (mask) => {
    const b = fmtBits(mask), g = (i) => ((b >>> i) & 1) !== 0;
    for (let i = 0; i <= 5; i++) set(8, i, g(i));
    set(8, 7, g(6)); set(8, 8, g(7)); set(7, 8, g(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, g(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, g(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, g(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    let rem = ver; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    const b = (ver << 12) | rem;
    for (let i = 0; i < 18; i++) { const a = size - 11 + (i % 3), c = Math.floor(i / 3), d = ((b >>> i) & 1) !== 0; set(a, c, d); set(c, a, d); }
  }
  // 4) Daten im Zickzack einsetzen
  let bi = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && bi < all.length * 8) { mod[y][x] = (all[bi >>> 3] >>> (7 - (bi & 7))) & 1; bi++; }
    }
  }
  // 5) beste Maske suchen
  const MASKS = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const penalty = (m) => {
    let p = 0;
    const lines = [];
    for (let i = 0; i < size; i++) { lines.push(m[i]); lines.push(m.map((r) => r[i])); }
    lines.forEach((ln) => {
      let run = 1;
      for (let i = 1; i <= size; i++) {
        if (i < size && ln[i] === ln[i - 1]) run++; else { if (run >= 5) p += run - 2; run = 1; }
      }
      const s = ln.join("");
      for (const pat of ["10111010000", "00001011101"]) { let k = -1; while ((k = s.indexOf(pat, k + 1)) >= 0) p += 40; }
    });
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) if (m[y][x] === m[y][x + 1] && m[y][x] === m[y + 1][x] && m[y][x] === m[y + 1][x + 1]) p += 3;
    let dark = 0; m.forEach((r) => r.forEach((c) => { dark += c; }));
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return p;
  };
  let best = null, bestP = Infinity, bestMask = 0;
  for (let k = 0; k < 8; k++) {
    const m = mod.map((r, y) => r.map((c, x) => (fn[y][x] ? c : c ^ (MASKS[k](x, y) ? 1 : 0))));
    const p = penalty(m);
    if (p < bestP) { bestP = p; best = m; bestMask = k; }
  }
  best.forEach((r, y) => r.forEach((c, x) => { mod[y][x] = c; }));
  drawFormat(bestMask);
  return mod;
};
const kcQrSvg = (text) => {
  const m = kcQrMatrix(text);
  if (!m) return "";
  const n = m.length, q = 4;
  let d = "";
  m.forEach((row, y) => { let x = 0; while (x < n) { if (row[x]) { let e = x; while (e < n && row[e]) e++; d += `M${x + q} ${y + q}h${e - x}v1h-${e - x}z`; x = e; } else x++; } });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n + 2 * q} ${n + 2 * q}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
};
// ---------------------------------------------------------------- 📄 Kleiner PDF-Baukasten (aus der Einkaufsliste): A4, Helvetica, ohne fremde Bibliothek
// Warum? iPhone, iPad und die HA-App können aus dem Browser nicht drucken – eine echte PDF-Datei schon (Teilen → Drucken per AirPrint).
const KC_PDF_W = { r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556] }; // Zeichenbreiten (1/1000) für die Zeichen 32–255 (WinAnsi)
const KC_CP1252 = { 0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f };
function kcPdfChars(text) { // Text → WinAnsi; Emojis und Unbekanntes fallen weg (die Standard-Schrift kennt sie nicht)
  let out = "";
  for (const ch of String(text ?? "").normalize("NFC")) {
    const c = ch.codePointAt(0);
    if ((c >= 32 && c < 127) || (c >= 160 && c <= 255)) out += ch;
    else if (KC_CP1252[c]) out += String.fromCharCode(KC_CP1252[c]);
    else if (c === 0xff0b) out += "+";
    else if (c === 9 || c === 10 || c === 13) out += " ";
  }
  return out.replace(/\s+/g, " ").trim();
}
function kcPdfWidth(t, bold, size) {
  const w = bold ? KC_PDF_W.b : KC_PDF_W.r;
  let n = 0;
  for (let k = 0; k < t.length; k++) n += w[t.charCodeAt(k) - 32] || 556;
  return (n * size) / 1000;
}
function kcPdfWrap(t, bold, size, max) { // Wörter auf Zeilen verteilen; zu lange Wörter werden hart getrennt
  const lines = [];
  let cur = "";
  for (let word of t.split(" ")) {
    while (kcPdfWidth(word, bold, size) > max && word.length > 1) {
      let k = word.length - 1;
      while (k > 1 && kcPdfWidth(word.slice(0, k), bold, size) > max) k--;
      if (cur) { lines.push(cur); cur = ""; }
      lines.push(word.slice(0, k));
      word = word.slice(k);
    }
    const next = cur ? `${cur} ${word}` : word;
    if (cur && kcPdfWidth(next, bold, size) > max) { lines.push(cur); cur = word; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
function kcPdfRgb(hex, fallback = [0.33, 0.43, 0.48]) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// 📄 Die Einkaufsliste als PDF (Uint8Array). m = Daten aus _printModel; t = Übersetzer für feste Wörter

// 📄 Die Abrechnung eines Kegelabends als PDF (Uint8Array). m = Daten aus _billModel
function kcBillPdf(m) {
  const PW = 595.28, PH = 841.89, M = 36, BOTTOM = M + 22;
  const f = (n) => (Math.round(n * 100) / 100).toString();
  const str = (x) => `(${x.replace(/[\\()]/g, (c) => `\\${c}`).replace(/[\x80-\xff]/g, (c) => `\\${c.charCodeAt(0).toString(8).padStart(3, "0")}`)})`;
  const pages = [];
  let ops = null;
  const newPage = () => { ops = []; pages.push(ops); };
  const col = (rgb) => rgb.map(f).join(" ");
  const text = (x, y, s, size, bold = false, rgb = [0.13, 0.13, 0.13]) => { if (s) ops.push(`BT /${bold ? "F2" : "F1"} ${f(size)} Tf ${col(rgb)} rg ${f(x)} ${f(y)} Td ${str(s)} Tj ET`); };
  const right = (x, y, s, size, bold, rgb) => text(x - kcPdfWidth(s, bold, size), y, s, size, bold, rgb);
  const fill = (x, y, w, h, rgb) => ops.push(`${col(rgb)} rg ${f(x)} ${f(y)} ${f(w)} ${f(h)} re f`);
  const line = (x1, y1, x2, y2, rgb = [0.8, 0.8, 0.8], lw = 0.6) => ops.push(`${f(lw)} w ${col(rgb)} RG ${f(x1)} ${f(y1)} m ${f(x2)} ${f(y2)} l S`);
  const gray = [0.42, 0.42, 0.42], red = [0.83, 0.18, 0.18], green = [0.18, 0.55, 0.2];
  const accent = kcPdfRgb("#fb8c00");
  newPage();
  // 🧾 Kopf
  let y = PH - M;
  text(M, y - 20, kcPdfChars(m.title), 20, true);
  right(PW - M, y - 22, kcPdfChars(m.bigVal), 22, true, accent);
  y -= 38;
  for (const [s0, size, rgb] of [[m.sub, 10.5, [0.2, 0.2, 0.2]], [m.by, 9, gray]]) {
    if (!s0) continue;
    for (const l of kcPdfWrap(kcPdfChars(s0), false, size, PW - 2 * M - 120)) { text(M, y, l, size, false, rgb); y -= size + 3.5; }
  }
  y -= 2;
  fill(M, y, PW - 2 * M, 3, accent);
  y -= 18;
  // 📋 Spalten: Name · Status · Grundbetrag · Strafen (Details) · Betrag
  const X = { name: M, st: M + 150, base: M + 230, det: M + 300, amt: PW - M };
  const head = () => {
    for (const [k, t] of [["name", "Name"], ["st", "Status"], ["base", "Grundbetrag"], ["det", "Strafen"]]) text(X[k], y, kcPdfChars(t), 8.5, true, gray);
    right(X.amt, y, kcPdfChars("Betrag"), 8.5, true, gray);
    y -= 6; line(M, y, PW - M, y, [0.6, 0.6, 0.6], 0.8); y -= 13;
  };
  head();
  for (const r of m.rows) {
    const nameL = kcPdfWrap(kcPdfChars(r.name), true, 10.5, 145);
    const detL = r.detail ? kcPdfWrap(kcPdfChars(r.detail), false, 8.5, X.amt - X.det - 62) : [];
    const h = Math.max(nameL.length * 13, detL.length * 11, 13) + 6;
    if (y - h < BOTTOM) { newPage(); y = PH - M - 10; head(); }
    const rgb = r.here ? [0.13, 0.13, 0.13] : gray;
    nameL.forEach((l, k) => text(X.name, y - k * 13, l, 10.5, true, rgb));
    text(X.st, y, kcPdfChars(r.status), 9, false, gray);
    if (r.base) text(X.base, y, kcPdfChars(`${r.base} ${r.baseOk ? "bezahlt" : "offen"}`), 9, false, r.baseOk ? green : red);
    detL.forEach((l, k) => text(X.det, y - k * 11, l, 8.5, false, [0.25, 0.25, 0.25]));
    right(X.amt, y, kcPdfChars(r.amount), 10.5, true, r.paid ? green : r.open ? red : rgb);
    if (r.paidTxt) right(X.amt, y - 11, kcPdfChars(r.paidTxt), 7.5, false, r.paid ? green : red);
    y -= h;
    line(M, y + 8, PW - M, y + 8);
    y -= 4;
  }
  // ∑ Summen
  y -= 8;
  if (y - 16 * m.sums.length < BOTTOM) { newPage(); y = PH - M - 10; }
  for (const [label, val] of m.sums) { text(M, y, kcPdfChars(label), 10.5, false); right(PW - M, y, kcPdfChars(val), 10.5, true); y -= 16; }
  // 🔢 Fußzeile auf jeder Seite
  pages.forEach((pg, k) => {
    ops = pg;
    const ft = kcPdfChars(`Erstellt mit Kegelclub${pages.length > 1 ? ` · ${k + 1}/${pages.length}` : ""}`);
    text(PW / 2 - kcPdfWidth(ft, false, 8) / 2, M - 4, ft, 8, false, [0.55, 0.55, 0.55]);
  });
  // 🧱 Datei zusammensetzen
  const objs = [];
  const add = (o) => { objs.push(o); return objs.length; };
  const cat = add(""), pagesId = add("");
  const f1 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  const f2 = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  const kids = [];
  for (const pg of pages) {
    const body = pg.join("\n");
    const cs = add(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${cs} 0 R >>`));
  }
  objs[cat - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`;
  const info = add(`<< /Title ${str(kcPdfChars(m.title))} /Producer (Kegelclub) >>`);
  let out = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offs = [];
  objs.forEach((o, k) => { offs.push(out.length); out += `${k + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  const bytes = new Uint8Array(out.length);
  for (let k = 0; k < out.length; k++) bytes[k] = out.charCodeAt(k) & 255;
  return bytes;
}

// ---------------------------------------------------------------- 🧮 Rechnen (genau wie in manager.py)
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const RULE_KEYS = ["base_fee", "watch_pays", "missing_pays", "unexcused_extra", "lane_mode", "lane_rate"];
const DEF_SETTINGS = { base_fee: 7.5, watch_pays: true, missing_pays: true, unexcused_extra: 5, lane_mode: "kasse", lane_rate: 10, lane_hours: 3, start_balance: 0, currency: "EUR" };
const rulesOf = (st) => Object.fromEntries(RULE_KEYS.map((k) => [k, st?.[k] ?? DEF_SETTINGS[k]]));
// 🧾 Wer zahlt an diesem Abend was?
function billEvening(ev, members, strafen, settings) {
  const rules = { ...rulesOf(settings), ...(ev.rules || {}) };
  const prices = ev.prices || {}, status = ev.status || {}, counts = ev.counts || {};
  const base = Number(rules.base_fee) || 0, people = {};
  for (const [mid, st] of Object.entries(status)) {
    const guest = !!members[mid]?.guest;
    let fee = 0;
    if (st === "play") fee = base;
    else if (st === "watch") fee = rules.watch_pays !== false ? base : 0;
    else if ((st === "excused" || st === "absent") && !guest) fee = rules.missing_pays !== false ? base : 0;
    const extra = st === "absent" && !guest ? Number(rules.unexcused_extra) || 0 : 0;
    people[mid] = { status: st, fee: r2(fee), extra: r2(extra), own: 0, from_others: 0, hand: 0, lane: 0, items: {} };
  }
  const price = (sid) => prices[sid] ? [Number(prices[sid][0]) || 0, String(prices[sid][1])] : [Number(strafen[sid]?.amount) || 0, strafen[sid]?.payer || "self"];
  const players = Object.keys(people).filter((m) => people[m].status === "play");
  const fines = !ev.no_fines;
  for (const [mid, per] of Object.entries(counts)) {
    for (const [sid, n0] of Object.entries(per || {})) {
      const n = Number(n0) || 0;
      if (n <= 0) continue;
      const [amount, payer] = price(sid);
      if (payer === "others") {
        for (const oid of players) if (oid !== mid) { people[oid].from_others += fines ? n * amount : 0; people[oid].items[`${sid}>${mid}`] = (people[oid].items[`${sid}>${mid}`] || 0) + n; }
        if (people[mid]) people[mid].items[sid] = (people[mid].items[sid] || 0) + n;
      } else if (people[mid]) { people[mid].own += fines ? n * amount : 0; people[mid].items[sid] = (people[mid].items[sid] || 0) + n; }
    }
  }
  for (const x of ev.extra || []) if (people[x.member]) people[x.member].hand += fines ? Number(x.amount) || 0 : 0; // ✍️ Strafe per Hand
  const hours = Number(ev.hours) || 0;
  const lane = rules.lane_mode !== "off" ? r2(hours * (Number(rules.lane_rate) || 0)) : 0;
  const laneKasse = rules.lane_mode === "kasse" ? lane : 0;
  if (rules.lane_mode === "split" && lane) {
    const present = Object.keys(people).filter((m) => ["play", "watch"].includes(people[m].status));
    for (const m of present) people[m].lane = lane / present.length;
  }
  const appPaid = ev.app_paid || {};
  let total = 0;
  for (const [mid, p] of Object.entries(people)) {
    if (ev.imported) { p.total = r2(appPaid[mid] || 0); total += p.total; continue; }
    p.own = r2(p.own); p.from_others = r2(p.from_others); p.lane = r2(p.lane); p.hand = r2(p.hand);
    p.fines = r2(p.own + p.from_others + p.hand);
    p.total = r2(p.fee + p.extra + p.fines + p.lane);
    total += p.total;
  }
  return { people, lane, lane_kasse: laneKasse, total: r2(total), rules };
}
const maps = (d) => [Object.fromEntries(d.members.map((m) => [m.id, m])), Object.fromEntries(d.strafen.map((s) => [s.id, s]))];
function summary(d) {
  const [members, strafen] = maps(d);
  const charged = {}, paid = {};
  let laneKasse = 0, last = null;
  for (const ev of d.abende) {
    const b = billEvening(ev, members, strafen, d.settings);
    if (ev.closed) laneKasse += b.lane_kasse; // 🎳 Kegelbahn erst beim Abschließen
    if (ev.closed && (!last || String(ev.date) >= String(last.date))) last = { id: ev.id, date: ev.date, total: b.total };
    if (ev.imported) continue;
    for (const [mid, p] of Object.entries(b.people)) charged[mid] = (charged[mid] || 0) + p.total;
  }
  let kin = 0, kout = 0;
  for (const k of d.kasse) {
    const a = Number(k.amount) || 0;
    if (k.kind === "out") kout += a; else { kin += a; if (k.member && !k.imported) paid[k.member] = (paid[k.member] || 0) + a; }
  }
  let open = 0;
  const people = d.members.map((m) => { const debt = r2((charged[m.id] || 0) - (paid[m.id] || 0)); if (debt > 0) open += debt; return { id: m.id, name: m.name, guest: !!m.guest, charged: r2(charged[m.id] || 0), paid: r2(paid[m.id] || 0), debt }; });
  const kasse = r2((Number(d.settings.start_balance) || 0) + kin - kout - laneKasse);
  const run = [...d.abende].reverse().find((e) => !e.closed);
  return { kasse, open: r2(open), soll: r2(kasse + open), lane_total: r2(laneKasse), people, debtors: people.filter((p) => p.debt > 0).length, running: run?.id || null, running_date: run?.date || null, evenings: d.abende.length, last };
}
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const evFind = (d, ref) => ref ? d.abende.find((e) => e.id === ref) : [...d.abende].reverse().find((e) => !e.closed);
const sortAbende = (d) => d.abende.sort((a, b) => String(a.date).localeCompare(String(b.date)) || (a.started || 0) - (b.started || 0));
// Eine Änderung schon mal hier anwenden (damit man sofort sieht, was passiert – auch ohne Netz auf der Kegelbahn)
const KIND = { member: "members", strafe: "strafen" };
function applyLocal(d, op) {
  const t = op.type;
  const [kind, verb] = t.split("_");
  if (KIND[kind] && verb === "save") {
    const list = d[KIND[kind]], it = op.item || {};
    const old = it.id && list.find((x) => x.id === it.id);
    const next = { ...(old || { id: it.id || op.op_id, active: true, ...(kind === "strafe" ? { payer: "self", icon: "mdi:bowling", amount: 0 } : {}) }), ...it };
    if ("amount" in it) next.amount = Math.abs(parseMoney(it.amount)) || 0;
    if (old) Object.assign(old, next); else {
      list.push(next);
      const ev = evFind(d);
      if (ev && kind === "member" && !next.guest) ev.status[next.id] = ev.status[next.id] || "play";
    }
    const ev = evFind(d);
    if (ev && kind === "strafe") (ev.prices = ev.prices || {})[next.id] = [Number(next.amount) || 0, next.payer || "self"];
  } else if (KIND[kind] && verb === "delete") {
    const used = kind === "member" ? d.abende.some((e) => op.id in (e.status || {})) || d.kasse.some((k) => k.member === op.id) : d.abende.some((e) => Object.values(e.counts || {}).some((per) => op.id in (per || {})));
    if (used) { const x = d[KIND[kind]].find((y) => y.id === op.id); if (x) { x.active = false; x.left = true; } }
    else d[KIND[kind]] = d[KIND[kind]].filter((x) => x.id !== op.id);
  } else if (t === "restore") {
    const it = op.item || {};
    if (KIND[op.kind]) { const lst = d[KIND[op.kind]], old = lst.find((x) => x.id === it.id); if (old) { Object.assign(old, it); delete old.left; } else lst.splice(Math.min(op.index ?? lst.length, lst.length), 0, { ...it }); }
    else if (op.kind === "kasse" && !d.kasse.some((k) => k.id === it.id)) d.kasse.push({ ...it });
    else if (op.kind === "abend" && !d.abende.some((e) => e.id === it.id)) { d.abende.push({ ...it }); sortAbende(d); }
  } else if (t === "order" && KIND[op.kind]) {
    const key = KIND[op.kind], pos = new Map((op.ids || []).map((x, i) => [x, i]));
    d[key] = d[key].map((x, i) => [x, i]).sort((a, b) => (pos.get(a[0].id) ?? 1e6 + a[1]) - (pos.get(b[0].id) ?? 1e6 + b[1])).map((x) => x[0]);
  } else if (t === "abend_start") {
    if (evFind(d) || d.abende.some((e) => e.id === (op.id || op.op_id))) return;
    const status = {};
    for (const m of d.members) if (m.active !== false && !m.guest) status[m.id] = "play";
    d.abende.push({ id: op.id || op.op_id, date: op.date || todayIso(), started: op.ts, closed: false, hours: Number(op.hours ?? d.settings.lane_hours ?? 3) || 0, note: "", status, status_ts: {}, counts: {}, rules: rulesOf(d.settings),
      prices: Object.fromEntries(d.strafen.map((s) => [s.id, [Number(s.amount) || 0, s.payer || "self"]])), waiting: true });
    sortAbende(d);
  } else if (t.startsWith("abend_")) {
    const ev = t === "abend_delete" ? null : evFind(d, op.abend);
    if (t === "abend_delete") { d.abende = d.abende.filter((e) => e.id !== op.id); return; }
    if (!ev) return;
    if (t === "abend_status") {
      if ((ev.status_ts?.[op.member] || 0) > op.ts) return;
      (ev.status_ts = ev.status_ts || {})[op.member] = op.ts;
      if (["excused", "absent", "out"].includes(op.status)) d.kasse = d.kasse.filter((k) => !(k.abend === ev.id && k.member === op.member && k.tag === "base")); // 💶 nicht da → Grundbetrag zurück
      if (op.status === "out") delete ev.status[op.member]; else ev.status[op.member] = op.status;
    } else if (t === "abend_count") {
      if (!(op.member in ev.status)) return;
      const s = d.strafen.find((x) => x.id === op.strafe);
      if (s) (ev.prices = ev.prices || {})[s.id] = ev.prices[s.id] || [Number(s.amount) || 0, s.payer || "self"];
      const per = (ev.counts[op.member] = ev.counts[op.member] || {});
      per[op.strafe] = Math.max(0, (per[op.strafe] || 0) + (Number(op.delta) || 1));
      if (!per[op.strafe]) delete per[op.strafe];
    } else if (t === "abend_hours") ev.hours = Number(String(op.hours).replace(",", ".")) || 0;
    else if (t === "abend_close") { ev.closed = op.value !== false; }
    else if (t === "abend_nofines") ev.no_fines = op.value !== false;
    else if (t === "abend_note") ev.note = op.note || "";
    else if (t === "abend_extra_add") { if (op.member in ev.status && !(ev.extra || []).some((x) => x.id === (op.id || op.op_id))) (ev.extra = ev.extra || []).push({ id: op.id || op.op_id, member: op.member, name: op.name || "Strafe", amount: Math.abs(parseMoney(op.amount)), ts: op.ts }); }
    else if (t === "abend_extra_delete") ev.extra = (ev.extra || []).filter((x) => x.id !== op.id);
    else if (t === "abend_date") { ev.date = op.date; sortAbende(d); }
  } else if (t === "pay") {
    if (!d.kasse.some((k) => k.id === (op.id || op.op_id))) d.kasse.push({ id: op.id || op.op_id, ts: op.ts, kind: "in", member: op.member, amount: parseMoney(op.amount), name: op.name || "Einzahlung", waiting: true, ...(op.abend ? { abend: op.abend, tag: op.tag === "base" ? "base" : "fines" } : {}) });
  } else if (t === "kasse_add") {
    if (!d.kasse.some((k) => k.id === (op.id || op.op_id))) d.kasse.push({ id: op.id || op.op_id, ts: op.when || op.ts, kind: op.kind === "out" ? "out" : "in", member: op.kind === "out" ? null : op.member || null, amount: Math.abs(parseMoney(op.amount)), name: op.name || (op.kind === "out" ? "Ausgabe" : "Einnahme"), waiting: true });
  } else if (t === "kasse_edit") { const k = d.kasse.find((x) => x.id === op.id); if (k) { if ("name" in op) k.name = op.name; if ("amount" in op) k.amount = Math.abs(parseMoney(op.amount)); } }
  else if (t === "kasse_delete") d.kasse = d.kasse.filter((k) => k.id !== op.id);
  else if (t === "settings") {
    const s = { ...op.settings };
    for (const k of ["base_fee", "unexcused_extra", "lane_rate", "start_balance"]) if (k in s) s[k] = parseMoney(s[k]);
    d.settings = { ...d.settings, ...s, view: { ...(d.settings.view || {}), ...(op.settings?.view || {}) } };
    const ev = evFind(d);
    if (ev && RULE_KEYS.some((k) => k in s)) ev.rules = rulesOf(d.settings);
  } else if (t === "log_clear") d.log = [];
  else if (t === "setup_done") d.setup_done = true;
}

// 📊 Statistik für ein Jahr: Strafen pro Person, nach Art, Kasse übers Jahr, Anwesenheit, Könige
// 📊 Statistik: year = Jahreszahl oder 0 = alle Jahre
function yearStats(d, year) {
  const [members, strafen] = maps(d);
  const evs = d.abende.filter((e) => !year || String(e.date).startsWith(String(year))).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const perPerson = {}, perType = {}, attend = {}, kings = {}, perEv = [], best = {}, streak = {}, run = {};
  const fineOf = (ev, p) => (ev.imported ? Math.max(0, (p.total || 0) - (p.fee || 0)) : (p.fines || 0) + (p.extra || 0));
  for (const ev of evs) {
    const b = billEvening(ev, members, strafen, d.settings);
    const row = { ev, sum: 0, here: 0, top: null, topAmt: 0, per: {} };
    for (const [mid, p] of Object.entries(b.people)) {
      const f = r2(fineOf(ev, p));
      perPerson[mid] = (perPerson[mid] || 0) + f;
      row.per[mid] = f; row.sum += f;
      if (f > row.topAmt) { row.top = mid; row.topAmt = f; }
      if (!best[mid] || f > best[mid].amt) best[mid] = { amt: f, ev };
      if (["play", "watch"].includes(p.status)) { attend[mid] = (attend[mid] || 0) + 1; row.here++; run[mid] = (run[mid] || 0) + 1; streak[mid] = Math.max(streak[mid] || 0, run[mid]); }
      else run[mid] = 0;
    }
    for (const mid of Object.keys(run)) if (!(mid in b.people)) run[mid] = 0;
    row.sum = r2(row.sum);
    let maxCnt = null;
    for (const [mid, per] of Object.entries(ev.counts || {})) for (const [sid, n] of Object.entries(per || {})) {
      const c = Number(n || 0);
      perType[sid] = (perType[sid] || 0) + c;
      const k = (kings[sid] = kings[sid] || {});
      k[mid] = (k[mid] || 0) + c;
      if (!maxCnt || c > maxCnt.n) maxCnt = { n: c, mid, sid };
    }
    row.maxCnt = maxCnt;
    perEv.push(row);
  }
  // 🏆 Rekorde
  const rec = {};
  for (const r of perEv) {
    if (r.sum > 0 && (!rec.evMax || r.sum > rec.evMax.sum)) rec.evMax = r;
    if (r.topAmt > 0 && (!rec.pMax || r.topAmt > rec.pMax.topAmt)) rec.pMax = r;
    if (r.maxCnt && r.maxCnt.n > 0 && (!rec.cMax || r.maxCnt.n > rec.cMax.maxCnt.n)) rec.cMax = r;
    if (r.here > 0 && (!rec.hereMax || r.here > rec.hereMax.here)) rec.hereMax = r;
  }
  const st = Object.entries(streak).sort((a, b) => b[1] - a[1])[0];
  if (st && st[1] > 1) rec.streak = { mid: st[0], n: st[1] };
  // 💶 Kasse: im Jahr Stand nach jedem Monat, bei „alle“ Stand am Jahresende
  const s0 = Number(d.settings.start_balance) || 0;
  const flows = [];
  for (const k of d.kasse) flows.push([k.ts || 0, (k.kind === "out" ? -1 : 1) * (Number(k.amount) || 0)]);
  for (const ev of d.abende) { const b = billEvening(ev, members, strafen, d.settings); if (b.lane_kasse) flows.push([ev.closed_ts || ev.started || Date.parse(ev.date) || 0, -b.lane_kasse]); }
  flows.sort((a, b) => a[0] - b[0]);
  const line = [];
  let bal = s0, i = 0;
  if (year) {
    for (let m = 0; m < 12; m++) {
      const end = new Date(year, m + 1, 1).getTime();
      while (i < flows.length && flows[i][0] < end) bal += flows[i++][1];
      if (new Date(year, m, 1).getTime() <= Date.now()) line.push([m, r2(bal)]);
    }
  } else {
    const ys = statYears(d);
    for (const y of ys) {
      const end = new Date(y + 1, 0, 1).getTime();
      while (i < flows.length && flows[i][0] < end) bal += flows[i++][1];
      line.push([y, r2(bal)]);
    }
  }
  const fineSum = r2(Object.values(perPerson).reduce((s, v) => s + v, 0)), fineCnt = Object.values(perType).reduce((s, v) => s + v, 0);
  return { evs, perPerson, perType, attend, kings, line, perEv, rec, best, streak, fineSum, fineCnt };
}
// 📅 Alle Jahre, in denen es Abende gab (aufsteigend)
function statYears(d) { return [...new Set(d.abende.map((e) => Number(String(e.date).slice(0, 4))).filter((y) => y > 1900))].sort((a, b) => a - b); }
const CSS = `
:host { display:block; --kc-green:var(--success-color,#43a047); --kc-yellow:var(--warning-color,#ffa600); --kc-red:var(--error-color,#db4437); --pc:var(--primary-color,#03a9f4); }
ha-card { display:block; padding:12px 12px 8px; overflow:hidden; background:var(--ha-card-background, var(--card-background-color)); border-radius:var(--ha-card-border-radius, 12px); }
* { box-sizing:border-box; }
button { font:inherit; color:inherit; }
ha-icon { --mdc-icon-size:20px; display:inline-flex; }
input, select, textarea { font:inherit; font-size:.95em; color:var(--primary-text-color); background:var(--card-background-color, var(--ha-card-background, #fff)); border:1px solid color-mix(in srgb, var(--primary-text-color, #000) 22%, transparent); border-radius:12px; padding:9px 10px; min-width:0; width:100%; outline:none; }
input::placeholder, textarea::placeholder { color:var(--secondary-text-color); opacity:.75; }
input:focus, select:focus, textarea:focus { border-color:var(--pc); box-shadow:0 0 0 2px color-mix(in srgb, var(--pc) 18%, transparent); }
input.swchk { -webkit-appearance:none; appearance:none; flex:none; width:40px; height:22px; margin:0; border:0; border-radius:12px; background:#bdbdbd; position:relative; cursor:pointer; transition:background .15s; padding:0; box-shadow:none; }
input.swchk::after { content:""; position:absolute; top:2px; left:2px; width:18px; height:18px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.3); transition:left .15s; }
input.swchk:checked { background:var(--pc); }
input.swchk:checked::after { left:20px; }
/* 🟢 Leiste oben – wie bei der Einkaufsliste */
.topbar { display:flex; align-items:center; gap:8px; margin:0 4px 8px; font-size:13px; color:var(--secondary-text-color); }
.topbar .grow { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-align:center; color:var(--primary-text-color); }
.topbar .ver { opacity:.8; }
.topbar .lbl { display:none; }
.pill { cursor:pointer; border-radius:999px; padding:2px 10px; background:color-mix(in srgb, var(--kc-green) 18%, transparent); color:var(--primary-text-color); white-space:nowrap; border:0; font-size:13px; }
.pill.wait { background:color-mix(in srgb, var(--kc-yellow) 25%, transparent); }
.pill.off { background:color-mix(in srgb, var(--kc-red) 20%, transparent); }
.iconbtn { background:none; border:0; cursor:pointer; padding:6px; border-radius:50%; display:inline-flex; color:var(--secondary-text-color); line-height:0; }
.iconbtn:hover { background:var(--secondary-background-color, rgba(127,127,127,.12)); color:var(--primary-text-color); }
.iconbtn.on { color:var(--pc); }
/* 🏷️ Kopf in der Karte – wie bei der Einkaufsliste: Symbol + Zähler links, Werkzeuge rechts */
.head { display:flex; align-items:center; gap:4px; margin:0 2px 8px; min-height:36px; }
.title { display:flex; align-items:center; gap:8px; font-size:1.25em; font-weight:600; flex:1; min-width:0; }
.title .logo { cursor:pointer; display:inline-flex; }
.badge { cursor:pointer; background:var(--pc); color:var(--text-primary-color,#fff); border-radius:999px; padding:1px 9px; font-size:.75em; font-weight:600; }
.tabs { display:flex; gap:6px; overflow-x:auto; padding:2px 2px 8px; scrollbar-width:none; }
.tabs::-webkit-scrollbar { display:none; }
.tab { -webkit-user-select:none; user-select:none; flex:0 0 auto; border:1.5px solid color-mix(in srgb, var(--pc) 55%, transparent); background:transparent; border-radius:999px; padding:5px 12px; cursor:pointer; display:inline-flex; align-items:center; gap:6px; font-size:.9em; }
.tab ha-icon { --mdc-icon-size:18px; }
.tab.active { background:var(--pc); border-color:var(--pc); color:var(--text-primary-color,#fff); }
.tip { display:flex; align-items:center; gap:8px; border-radius:12px; padding:9px 12px; margin:2px 2px 8px; background:color-mix(in srgb, var(--kc-yellow) 18%, transparent); font-size:.9em; }
.hero { border-radius:12px; padding:12px 14px; margin:2px 2px 10px; background:color-mix(in srgb, var(--hc, var(--kc-green)) 12%, transparent); }
.hero .lbl { font-size:.85em; color:var(--secondary-text-color); }
.big { font-size:2.4em; font-weight:700; line-height:1.15; color:var(--hc, var(--kc-green)); font-variant-numeric:tabular-nums; cursor:pointer; }
.bar { height:8px; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); border-radius:5px; overflow:hidden; margin-top:8px; }
.bar i { display:block; height:100%; background:var(--hc, var(--kc-green)); border-radius:5px; }
.tiles { display:grid; grid-template-columns:repeat(3,1fr); gap:6px; margin:0 2px 10px; }
.tile { background:var(--secondary-background-color, rgba(127,127,127,.06)); border:1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius:16px; padding:10px 12px; text-align:left; min-width:0; color:var(--primary-text-color); }
.tile.click:hover { border-color:var(--pc); }
.tile.click { cursor:pointer; }
.tile b { display:block; font-size:1em; font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.tile span { font-size:.75em; color:var(--secondary-text-color); display:flex; align-items:center; gap:3px; }
.tile span ha-icon { --mdc-icon-size:13px; }
.next { display:flex; align-items:center; gap:8px; border-radius:12px; padding:9px 12px; margin:0 2px 6px; background:color-mix(in srgb, var(--kc-yellow) 15%, transparent); font-size:.92em; }
.next ha-icon { color:var(--kc-yellow); }
.ghead { display:flex; align-items:center; gap:6px; font-size:.8em; font-weight:600; text-transform:uppercase; letter-spacing:.04em; color:var(--secondary-text-color); padding:12px 4px 2px; }
.ghead .gdot { width:22px; height:22px; flex:none; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--gc, var(--pc)) 18%, transparent); color:var(--gc, var(--pc)); }
.ghead .gdot ha-icon { --mdc-icon-size:16px; }
.ghead.click { cursor:pointer; border-radius:10px; }
.ghead.click:hover { background:var(--secondary-background-color, rgba(127,127,127,.08)); }
.ghead .chev { display:inline-flex; color:var(--secondary-text-color); }
.ghead.click .n { margin-left:auto; }
.ghead .n { margin-left:auto; font-weight:500; text-transform:none; letter-spacing:0; font-size:.9em; }
/* 🧾 Zeilen wie bei der Einkaufsliste: kompakt, farbiger Streifen links */
.item { display:flex; align-items:center; gap:8px; padding:5px 4px 5px 6px; border-radius:12px; border-left:4px solid var(--cc, transparent); transition:opacity .25s, background .2s; }
.item.click:hover { background:color-mix(in srgb, var(--pc) 6%, transparent); }
.item.click { cursor:pointer; }
.chk { width:26px; height:26px; flex:none; border-radius:50%; border:2px solid var(--pc); background:none; cursor:pointer; color:#fff; padding:0; display:inline-flex; align-items:center; justify-content:center; }
.chk ha-icon { --mdc-icon-size:17px; }
.chk.on { background:var(--kc-green); border-color:var(--kc-green); }
.item.done .n b { opacity:.6; text-decoration:line-through; }
.n { flex:1; min-width:0; padding:2px 0; }
.n b { font-weight:500; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.meta { font-size:.75em; color:var(--secondary-text-color); display:flex; flex-wrap:wrap; gap:3px 6px; margin-top:2px; }
.tag { border-radius:8px; padding:0 6px; background:color-mix(in srgb, var(--primary-text-color, #000) 6%, transparent); white-space:nowrap; }
.tag.wait { background:color-mix(in srgb, var(--kc-yellow) 25%, transparent); color:var(--primary-text-color); }
.amt { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.neg { color:var(--kc-red); } .pos { color:var(--kc-green); }
.quick { display:flex; flex-wrap:nowrap; gap:6px; margin:4px 2px 6px; overflow-x:auto; scrollbar-width:none; -webkit-overflow-scrolling:touch; padding-bottom:2px; } /* ↔️ volle Leiste = wischen, wie die Reiter der Einkaufsliste */
.quick::-webkit-scrollbar { display:none; }
.chip { flex:0 0 auto; white-space:nowrap; border:1.5px solid var(--divider-color, rgba(127,127,127,.35)); background:transparent; border-radius:999px; padding:7px 14px; cursor:pointer; font-size:.95em; }
.chip.on { background:var(--pc); border-color:var(--pc); color:var(--text-primary-color,#fff); }
form.add { display:grid; grid-template-columns:1fr 110px 48px; gap:6px; margin:2px 2px 6px; }
form.add.pinf { grid-template-columns:1fr 48px; }
.potbox { padding:8px 10px; }
.pothead { cursor:pointer; margin:0 0 6px; }
.potrow { display:grid; grid-template-columns:1fr auto auto; gap:6px; align-items:center; margin:0 0 6px; }
.potrow.set { grid-template-columns:auto 1fr auto auto; margin:0; }
.potrow input.amount { text-align:right; min-width:0; }
.lentbtn { border:0; font:inherit; font-size:.85em; cursor:pointer; display:inline-flex; align-items:center; gap:2px; vertical-align:middle; }
.lentbtn ha-icon { --mdc-icon-size:14px; }
.potlbl { font-size:.85em; color:var(--secondary-text-color); }
.iconbtn.potbtn { border:1.5px solid var(--divider-color, rgba(127,127,127,.35)); padding:7px; }
form.add input.amount { text-align:right; }
.addbtn { border:0; border-radius:12px; background:var(--kc-green); color:#fff; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; }
.addbtn ha-icon { --mdc-icon-size:26px; }
.btn { box-sizing:border-box; min-height:40px; border:1px solid color-mix(in srgb, var(--primary-text-color, #000) 22%, transparent); background:transparent; color:var(--primary-text-color); border-radius:12px; padding:8px 14px; cursor:pointer; font:inherit; font-size:.9em; font-weight:500; display:inline-flex; align-items:center; justify-content:center; gap:6px; transition:background .15s, border-color .15s; }
.btn:hover:not([disabled]) { border-color:var(--pc); background:color-mix(in srgb, var(--pc) 6%, transparent); }
.btn:active:not([disabled]) { transform:scale(.97); }
.btn ha-icon { --mdc-icon-size:18px; }
.btn.main { border:1px solid transparent; background:var(--pc); color:var(--text-primary-color,#fff); }
.btn.main:hover:not([disabled]) { background:color-mix(in srgb, var(--pc) 88%, #000); border-color:transparent; }
.btn.ok { color:var(--kc-green); border-color:color-mix(in srgb, var(--kc-green) 45%, transparent); }
.btn.small { padding:5px 10px; min-height:32px; font-size:.85em; }
.sum { display:flex; justify-content:space-between; padding:8px 6px 0; font-weight:600; }
.edit { border:1px solid var(--divider-color, rgba(127,127,127,.2)); border-radius:12px; padding:10px; margin:6px 2px; }
.f { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
.f label { display:flex; flex-direction:column; gap:3px; font-size:.8em; color:var(--secondary-text-color); }
.f label.wide { grid-column:1 / -1; }
.months { display:flex; flex-wrap:wrap; gap:4px; }
.months button { border:1.5px solid color-mix(in srgb, var(--pc) 45%, transparent); background:none; border-radius:999px; padding:3px 9px; font-size:.85em; cursor:pointer; }
.months button.on { background:var(--pc); color:#fff; border-color:var(--pc); }
.btnrow { display:flex; flex-wrap:wrap; gap:6px; margin-top:8px; }
.btnrow.end { justify-content:flex-end; }
.switch { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 4px; border-bottom:1px solid var(--divider-color, rgba(127,127,127,.15)); }
.switch span { display:flex; align-items:center; gap:8px; }
.hist { display:flex; align-items:flex-end; gap:6px; height:150px; padding:8px 0 0; border-bottom:1px solid var(--divider-color); }
.hist .m { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:2px; min-width:0; }
.hist .m span { font-size:10.5px; color:var(--secondary-text-color); }
.legend { display:flex; gap:12px; font-size:12px; color:var(--secondary-text-color); margin:6px 4px; }
.legend i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:4px; vertical-align:-1px; }
table { width:100%; border-collapse:collapse; font-size:13px; margin-top:8px; }
td, th { padding:6px 4px; border-bottom:1px solid var(--divider-color); text-align:right; font-variant-numeric:tabular-nums; }
td:first-child, th:first-child { text-align:left; }
.hidden-amt { filter:blur(7px); user-select:none; }
.empty { text-align:center; padding:22px 8px; color:var(--secondary-text-color); }
.small { font-size:.82em; color:var(--secondary-text-color); margin:6px 4px; }
/* 📖 Knöpfe UNTER der Karte – wie bei der Einkaufsliste */
.foot { display:flex; justify-content:center; gap:10px; margin:14px 6px 8px; font-size:13px; color:var(--secondary-text-color); }
.foot button { font:inherit; color:inherit; background:none; text-decoration:underline; border:1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius:12px; padding:8px 18px; cursor:pointer; }
.foot button.on { border-color:var(--pc); color:var(--pc); }
.foot button { display:inline-flex; align-items:center; gap:6px; }
.foot button ha-icon { --mdc-icon-size:18px; }
details.gsec { border-radius:12px; margin:6px 2px; background:var(--secondary-background-color, rgba(127,127,127,.08)); }
details.gsec summary { list-style:none; cursor:pointer; display:flex; align-items:center; gap:10px; padding:10px 12px; font-weight:600; }
details.gsec summary::-webkit-details-marker { display:none; }
details.gsec .gdot { width:28px; height:28px; flex:none; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--gc) 20%, transparent); color:var(--gc); }
details.gsec .gdot ha-icon { --mdc-icon-size:17px; }
details.gsec .gtext { padding:0 14px 12px 50px; font-size:.92em; line-height:1.5; }
a.btn { text-decoration:none; color:inherit; }
a.btn.paypal { background:#0070ba; border-color:#0070ba; color:#fff; }
/* 🙏 Credits – wie bei der Einkaufsliste */
.elcredits { text-align:center; } .elcredits p { margin:8px 0; }
.ellogo { background:#fff; border-radius:16px; padding:10px; display:inline-block; max-width:100%; box-shadow:0 1px 4px rgba(0,0,0,.12); }
.ellogo img { display:block; max-width:100%; width:200px; height:auto; }
.elcbtns { display:flex; flex-wrap:wrap; gap:8px; justify-content:center; margin:12px 0; }
a.elcbtn { color:var(--primary-text-color); background:var(--secondary-background-color, rgba(127,127,127,.12)); border-radius:12px; padding:10px 14px; text-decoration:none; font-weight:500; }
a.elcbtn.pp { display:inline-flex; align-items:center; gap:8px; background:#0070BA; color:#fff; border:2px solid #003087; font-weight:700; }
.elcbtn.pp svg { width:20px; height:20px; flex:none; }
.elcsmall { opacity:.7; font-size:.9em; }
a { color:var(--pc); }
/* 🧮 Taschenrechner */
.calc { border-radius:12px; padding:10px; margin:0 2px 10px; background:var(--secondary-background-color, rgba(127,127,127,.1)); }
.calc .disp { display:flex; flex-direction:column; align-items:flex-end; background:var(--card-background-color); border-radius:10px; padding:6px 12px; margin-bottom:8px; min-height:62px; }
.calc .expr { font-size:.9em; color:var(--secondary-text-color); min-height:1.3em; word-break:break-all; text-align:right; }
.calc .res { font-size:1.8em; font-weight:600; font-variant-numeric:tabular-nums; }
.calc .keys { display:grid; grid-template-columns:repeat(4,1fr); gap:6px; }
.calc .keys button { border:0; border-radius:10px; padding:12px 0; font-size:1.15em; cursor:pointer; background:var(--card-background-color); }
.calc .keys button.op { color:var(--pc); font-weight:600; }
.calc .keys button.eq { background:var(--pc); color:#fff; }
.calc .keys button.cl { color:var(--kc-red); }
/* ⏸️ pausiert */
.item.paused .chk { opacity:.6; cursor:default; }
/* ⠿ Verschieben */
.olist { display:flex; flex-direction:column; }

.grip { display:inline-flex; color:var(--secondary-text-color); cursor:grab; touch-action:none; padding:4px 2px; margin:-4px 0; }
.item.drag { background:color-mix(in srgb, var(--pc) 12%, transparent); box-shadow:0 2px 8px rgba(0,0,0,.25); }
.gsub { font-size:.78em; font-weight:600; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.04em; padding:8px 6px 2px; }
/* ⚙️ Einstellungen wie bei der Einkaufsliste: ein Kasten pro Zweck, Zeilen mit bunten Symbol-Kästchen */
.sethead { font-weight:600; font-size:1.05em; margin:4px 4px 2px; display:flex; align-items:center; gap:8px; }
.lgbox { margin:10px 0 0; border:1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius:12px; overflow:hidden; }
.lgroup { display:flex; align-items:center; gap:12px; width:100%; margin:0; padding:10px 12px; font:inherit; font-size:1em; color:var(--primary-text-color); background:color-mix(in srgb, var(--primary-text-color, #000) 3%, transparent); border:0; cursor:pointer; text-align:left; }
.lgroup[aria-expanded="true"] { border-bottom:1px solid var(--divider-color, rgba(127,127,127,.25)); }
.lgroup b, .lrow b { display:block; font-weight:600; }
.lrow b { font-weight:500; }
.lgroup small, .lrow small { display:block; color:var(--secondary-text-color); font-size:.8em; font-weight:400; }
.lgroup .gem { width:36px; height:36px; flex:none; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; background:color-mix(in srgb, var(--primary-text-color, #000) 7%, transparent); }
.lgroup .grow, .lrow .grow { flex:1 1 auto; min-width:0; }
.lgroup > ha-icon, .lrow > ha-icon:last-child { flex:none; color:var(--secondary-text-color); }
.lrow { display:flex; align-items:center; gap:12px; width:calc(100% - 4px); margin:0 0 0 4px; text-align:left; padding:10px 12px; cursor:pointer; border:0; border-top:1px solid var(--divider-color, rgba(127,127,127,.25)); background:none; color:var(--primary-text-color); font:inherit; }
.lgroup + .lrow { border-top:0; }
.lrow:hover { background:color-mix(in srgb, var(--pc) 6%, transparent); }
.lrow > ha-icon:last-child { opacity:.5; }
.ic { --ic:#607d8b; width:36px; height:36px; flex:none; border-radius:12px; display:flex; align-items:center; justify-content:center; background:var(--ic); color:#fff; }
.ic ha-icon { --mdc-icon-size:20px; color:#fff; }
.pagebody textarea, .pagebody input[readonly] { width:100%; }
/* ↩️ Rückgängig-Leiste unten in der Mitte – wie bei der Einkaufsliste */
/* ✓ nur ein grüner Haken – was er macht, zeigt langes Drücken (wie bei der Einkaufsliste) */
.iconbtn.okbtn { color:var(--kc-green); border:1.5px solid color-mix(in srgb, var(--kc-green) 45%, transparent); padding:5px; }
.iconbtn.okbtn:hover { background:color-mix(in srgb, var(--kc-green) 12%, transparent); color:var(--kc-green); }
.iconbtn.potbtn.okbtn { padding:7px; }
.finding { border:1px solid var(--divider-color, rgba(127,127,127,.25)); border-left:4px solid var(--kc-yellow); border-radius:12px; padding:8px 10px; margin:6px 0; }
.okmsg { color:var(--kc-green); font-weight:600; }
.btn.danger { color:#fff; background:#c62828; border-color:#c62828; }
.tag.lent, .lenttxt { color:#ef6c00; } .tag.lent { background:color-mix(in srgb, #fb8c00 18%, transparent); }
.undobar { position:fixed; left:50%; bottom:calc(20px + env(safe-area-inset-bottom, 0px)); transform:translateX(-50%); z-index:50; max-width:calc(100vw - 24px); display:flex; align-items:center; gap:12px; padding:8px 8px 8px 16px; border-radius:24px; background:#323232; color:#fff; box-shadow:0 3px 12px rgba(0,0,0,.35); font-size:.92em; }
.undobar .ut { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.undobar .ub { border:0; border-radius:16px; padding:7px 12px; background:#fff; color:#222; font:inherit; font-weight:600; cursor:pointer; white-space:nowrap; }
/* 🔄 Neue Version – wie bei der Einkaufsliste */
.updbar { margin:0 2px 8px; padding:8px 10px; border-radius:12px; background:color-mix(in srgb, var(--primary-color,#03a9f4) 14%, transparent); font-size:.88em; display:flex; align-items:center; gap:8px; }
.updbar b { flex:1; }
/* 🪟 Seiten IN der Karte – wie bei der Einkaufsliste (Symbol + Titel, ← / ✕ oben rechts) */
.sec { margin:4px 2px 16px; }
.sechead { display:flex; align-items:center; gap:12px; margin-bottom:10px; }
.sechead h3 { min-width:0; margin:0; font-size:1em; }
.pagebody p { line-height:1.4; }
/* 🔢 PIN-Eingabe wie am Handy – wie bei der Einkaufsliste */
.pinpad { text-align:center; max-width:300px; width:100%; margin:0 auto; }
.pinpad .pdots { font-size:28px; letter-spacing:10px; min-height:40px; margin:10px 0 16px; }
.pinpad .ppad { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
.pinpad .ppad .btn { font-size:24px; padding:16px 0; margin:0; width:100%; }
.pinpad .pcancel { margin-top:18px; }
.btn.primary { border:1px solid transparent; background:var(--pc); color:var(--text-primary-color,#fff); }
/* 📖 Anleitung wie bei der Einkaufsliste */
.elg { font:15px/1.5 Roboto, sans-serif; }
.elg h2 { font-size:20px; margin:6px 0 4px; }
.elg .elg-sub { color:var(--secondary-text-color); margin:0 0 12px; font-size:14px; }
.elg-q { width:100%; margin:0 0 10px; font-size:16px; padding:10px 12px; }
.elg-none { color:var(--secondary-text-color); margin:8px 2px; }
.elg-sec { border:1px solid var(--divider-color, rgba(127,127,127,.3)); border-radius:12px; margin:10px 0 0; overflow:hidden; }
.elg-sec[hidden] { display:none; }
.elg-sec summary { cursor:pointer; padding:10px 12px; font-weight:600; font-size:16px; list-style:none; display:flex; align-items:center; gap:12px; background:color-mix(in srgb, var(--primary-text-color, #000) 3%, transparent); }
.elg-sec summary::-webkit-details-marker { display:none; }
.elg-sec summary::after { content:""; flex:none; width:8px; height:8px; margin:0 6px 4px auto; border-right:2px solid var(--secondary-text-color); border-bottom:2px solid var(--secondary-text-color); transform:rotate(45deg); transition:transform .2s; }
.elg-sec[open] summary::after { transform:rotate(225deg); margin-bottom:-4px; }
.elg-sec[open] summary { border-bottom:1px solid var(--divider-color, rgba(127,127,127,.3)); }
.elg-ic { flex:none; width:36px; height:36px; border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:18px; background:color-mix(in srgb, var(--primary-text-color, #000) 7%, transparent); }
.elg-tt { flex:1; min-width:0; } .elg-tt b { display:block; } .elg-tt small { display:block; font-weight:400; font-size:12.5px; color:var(--secondary-text-color); }
.elg-sec > div { padding:8px 12px 12px; }
.elg-sec ul { margin:4px 0; padding-left:20px; } .elg-sec li { margin:4px 0; }
.betabox { border:1px solid #fb8c00; border-radius:12px; padding:10px 12px; margin:0 0 12px; background:rgba(251,140,0,.1); }
ol.steps { padding-left:22px; }
ol.steps li { margin:3px 0; }
/* 🔤 Beschriftungen unter Symbol-Knöpfen (⚙️ → Ansicht) */
.iconbtn .lbl { font-size:10px; line-height:1.1; font-weight:500; }
:host(.labels) .iconbtn:has(.lbl) { flex-direction:column; align-items:center; gap:2px; border-radius:10px; padding:4px 5px; }
:host(.labels) .topbar .lbl { display:inline; }
:host(.labels) .topbar .iconbtn { flex-direction:column; align-items:center; gap:2px; border-radius:10px; }
/* 🧘 Ruhiger Modus (nur dieses Gerät) */
:host(.calm) *, :host(.calm) *::before, :host(.calm) *::after { animation:none !important; transition:none !important; }
:host(.calm) .gdot, :host(.calm) .ic, :host(.calm) .gem, :host(.calm) .hero, :host(.calm) .badge, :host(.calm) .mascot { filter:saturate(.35); }
/* 🐷 Maskottchen */
.mascotbox { color:var(--primary-text-color); }
.mascot.happy { animation:fkwob 2.6s ease-in-out infinite; transform-origin:50% 90%; }
.mascotbox.hop .mascot { animation:fkhop .7s ease-out 2; }
@keyframes fkwob { 0%,100% { transform:rotate(0); } 25% { transform:rotate(-4deg); } 75% { transform:rotate(4deg); } }
@keyframes fkhop { 0%,100% { transform:translateY(0); } 40% { transform:translateY(-7px); } }
@media (prefers-reduced-motion: reduce) { .mascot, .mascotbox .mascot { animation:none !important; } }
.mascotprev { display:flex; flex-wrap:wrap; gap:14px; margin:10px 0; color:var(--primary-text-color); }
.mascotprev > span { display:flex; flex-direction:column; align-items:center; gap:2px; }
.mascotprev svg { width:44px; height:39px; }
.mascotprev small { font-size:11px; color:var(--secondary-text-color); }
.mascotprev > span.now { outline:2px solid #ec407a; outline-offset:3px; border-radius:10px; }
/* 📜 Verlauf */
.logday { margin:12px 0 4px; font-size:.8em; font-weight:600; color:var(--secondary-text-color); text-transform:uppercase; letter-spacing:.03em; }
.logrow { display:flex; align-items:baseline; gap:8px; padding:4px 2px; border-bottom:1px solid var(--divider-color, rgba(127,127,127,.15)); font-size:.9em; }
.logrow .lt { flex:none; width:42px; color:var(--secondary-text-color); font-variant-numeric:tabular-nums; }
.logrow .lx { flex:1; min-width:0; }
.switch .vt { display:flex; flex-direction:column; } .switch .vt small { color:var(--secondary-text-color); font-size:.82em; }
/* 🙈 verschleierte Beträge: PC = Maus drüber, Handy = antippen (4 Sekunden) */
.veil { filter:blur(6px); cursor:pointer; user-select:none; -webkit-user-select:none; transition:filter .2s; }
.veil.peek { filter:none; }
@media (hover:hover) { .veil:hover { filter:none; } }
/* 🎳 Kegelabend: Personen-Kacheln und Strafen-Knöpfe */
.ppl { display:grid; grid-template-columns:repeat(auto-fill, minmax(92px, 1fr)); gap:6px; margin:4px 2px 8px; }
.pp { position:relative; border:2px solid transparent; border-radius:16px; padding:8px 4px 6px; text-align:center; background:var(--secondary-background-color, rgba(127,127,127,.06)); cursor:pointer; min-width:0; color:var(--primary-text-color); font:inherit; }
.pp.sel { border-color:var(--pc); background:color-mix(in srgb, var(--pc) 12%, transparent); }
.pp.off { opacity:.55; }
.pp .av { width:38px; height:38px; margin:0 auto 4px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:700; font-size:14px; background:var(--ac, #607d8b); }
.pp .nm { display:block; font-size:.85em; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pp .sum { display:block; font-size:.75em; font-variant-numeric:tabular-nums; color:var(--kc-red); padding:0; font-weight:500; }
.pp .gst { position:absolute; top:4px; left:6px; font-size:9px; font-weight:700; color:var(--secondary-text-color); text-transform:uppercase; }
.stbtn { white-space:nowrap; display:inline-flex; align-items:center; gap:3px; margin-top:4px; border:0; border-radius:999px; padding:2px 8px; font:inherit; font-size:.72em; cursor:pointer; color:#fff; background:var(--sc, #9e9e9e); }
.stbtn ha-icon { --mdc-icon-size:13px; }
.pp.add .av { background:color-mix(in srgb, var(--primary-text-color) 12%, transparent); color:var(--primary-text-color); }
.fines { display:grid; grid-template-columns:repeat(auto-fill, minmax(96px, 1fr)); gap:8px; margin:4px 2px 8px; }
.fine { border:0; border-radius:16px; padding:12px 6px 10px; text-align:center; cursor:pointer; background:var(--secondary-background-color, rgba(127,127,127,.08)); color:var(--primary-text-color); font:inherit; position:relative; }
.fine:active:not([disabled]) { transform:scale(.95); }
.fine[disabled] { opacity:.4; cursor:default; }
.fine ha-icon { --mdc-icon-size:30px; color:var(--kc-orange, #fb8c00); display:block; margin:0 auto 4px; }
.fine b { display:block; font-weight:500; font-size:.9em; line-height:1.2; }
.fine small { display:block; font-size:.75em; color:var(--secondary-text-color); }
.fine small.oth { color:#1e88e5; }
.fine .cnt { position:absolute; top:6px; right:8px; min-width:20px; height:20px; padding:0 5px; border-radius:999px; background:var(--pc); color:#fff; font-size:.72em; font-weight:700; display:flex; align-items:center; justify-content:center; }
.evbar { display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin:2px 2px 8px; }
.evbar .hrs { display:inline-flex; align-items:center; gap:4px; }
.evbar .hrs input { width:64px; text-align:right; padding:6px 8px; }
.bill .item { cursor:default; }
.bill .n .meta .tag.del { cursor:pointer; }
.chips { display:flex; flex-wrap:wrap; gap:4px; }
.chipx { display:inline-flex; align-items:center; gap:2px; border-radius:999px; padding:1px 4px 1px 8px; background:color-mix(in srgb, var(--primary-text-color, #000) 7%, transparent); font-size:.78em; }
.chipx button { border:0; background:none; cursor:pointer; color:var(--kc-red); padding:0 2px; font:inherit; font-weight:700; line-height:1; }
.big.kasse { color:var(--hc, var(--kc-green)); }
.stbar { display:flex; align-items:flex-end; gap:6px; height:150px; padding:18px 2px 0; border-bottom:1px solid var(--divider-color); }
.stbar .c { flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; min-width:0; position:relative; }
.stbar .c i { display:block; width:100%; max-width:42px; border-radius:6px 6px 0 0; background:var(--bc, var(--pc)); }
.stbar .c span { position:absolute; top:-16px; font-size:10.5px; white-space:nowrap; }
.stlbl { display:flex; gap:6px; padding:3px 2px 0; }
.stlbl span { flex:1; min-width:0; text-align:center; font-size:10.5px; color:var(--secondary-text-color); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.pie { display:flex; align-items:center; gap:14px; margin:6px 2px; }
.pie .disc { width:120px; height:120px; flex:none; border-radius:50%; }
.pie .lg { font-size:.85em; line-height:1.7; min-width:0; }
.pie .lg i { display:inline-block; width:10px; height:10px; border-radius:3px; margin-right:6px; vertical-align:-1px; }
.kings { display:grid; grid-template-columns:repeat(auto-fill, minmax(130px, 1fr)); gap:6px; margin:0 2px 8px; }
.yearnav { display:flex; align-items:center; justify-content:center; gap:10px; margin:0 2px 6px; font-weight:600; }
.wiz { display:grid; gap:8px; margin:6px 2px; }
.wiz .btn { justify-content:flex-start; padding:12px 14px; text-align:left; }
.wiz .btn small { display:block; font-weight:400; color:var(--secondary-text-color); }
.iconpick { display:grid; grid-template-columns:repeat(auto-fill, minmax(40px, 1fr)); gap:4px; }
.iconpick button { border:1.5px solid transparent; border-radius:10px; background:var(--secondary-background-color, rgba(127,127,127,.08)); padding:6px 0; cursor:pointer; color:var(--primary-text-color); }
.iconpick button.on { border-color:var(--pc); color:var(--pc); }
.seg { display:flex; flex-wrap:wrap; gap:6px; }
.seg button { border:1.5px solid color-mix(in srgb, var(--pc) 45%, transparent); background:none; border-radius:999px; padding:5px 12px; cursor:pointer; font:inherit; font-size:.88em; color:var(--primary-text-color); }
.seg button.on { background:var(--pc); color:#fff; border-color:var(--pc); }
.preview { border:1px solid var(--divider-color, rgba(127,127,127,.25)); border-radius:12px; padding:10px 12px; margin:8px 0; }
.preview table td:first-child { color:var(--secondary-text-color); }
.fine .fminus { position:absolute; top:4px; left:6px; width:26px; height:26px; border-radius:50%; background:var(--kc-red, #e53935); color:#fff; font-size:18px; font-weight:700; line-height:24px; display:flex; align-items:center; justify-content:center; cursor:pointer; z-index:1; }
.fine.hand ha-icon { color:#1e88e5; }
.away { display:flex; flex-wrap:wrap; align-items:center; gap:6px; margin:0 2px 10px; }
.away .chip { border-left:3px solid var(--sc, #9e9e9e); }
.bill .tag.ok { background:color-mix(in srgb, var(--kc-green, #43a047) 18%, transparent); color:var(--kc-green, #43a047); }
.bill .tag.no { background:color-mix(in srgb, var(--kc-red, #e53935) 15%, transparent); color:var(--kc-red, #e53935); }
.bill button.tag { border:0; cursor:pointer; font:inherit; font-size:inherit; }
.evbar .tag.ok { display:inline-flex; align-items:center; gap:3px; color:var(--kc-green, #43a047); }
.evbar .tag.ok ha-icon { --mdc-icon-size:15px; }
.coin { color:var(--secondary-text-color); }
.coin.ok { color:var(--kc-green, #43a047); }
.coin ha-icon { --mdc-icon-size:26px; }
.bill .item.off { opacity:.6; }
/* 📊 Statistik (beta.5) */
.yearnav .btn.small { margin-left:8px; }
.stseg { justify-content:center; margin:2px 0 10px; }
.stseg button { display:inline-flex; align-items:center; gap:4px; }
.stseg ha-icon { --mdc-icon-size:16px; }
.kpis { grid-template-columns:repeat(auto-fill, minmax(140px, 1fr)); }
.tile .dl { font-size:.72em; display:block; margin-top:2px; color:var(--secondary-text-color); }
.tile .dl.up { color:#e53935; }
.tile .dl.down { color:#43a047; }
.recs { display:grid; grid-template-columns:repeat(auto-fill, minmax(160px, 1fr)); gap:6px; margin:0 2px 8px; }
.tile.rec { border-left:4px solid var(--rc); }
.tile.rec > span:first-child ha-icon { color:var(--rc); }
.tile .rs { font-size:.72em; color:var(--secondary-text-color); display:block; }
.stbar .c.click { cursor:pointer; }
table.sttab td, table.sttab th { padding:6px 4px; border-bottom:1px solid var(--divider-color); text-align:left; }
table.sttab th { font-weight:500; font-size:.85em; color:var(--secondary-text-color); }
table.sttab tr.click { cursor:pointer; }
table.sttab tr.click:hover td { background:color-mix(in srgb, var(--pc) 8%, transparent); }
table.sttab td:not(:first-child), table.sttab th:not(:first-child) { text-align:right; white-space:nowrap; font-variant-numeric:tabular-nums; }
i.dot { display:inline-block; width:9px; height:9px; border-radius:50%; margin-right:7px; vertical-align:0; }
.cellbar { position:relative; display:block; min-width:84px; padding:2px 6px; isolation:isolate; }
.cellbar i { position:absolute; right:0; top:0; bottom:0; background:color-mix(in srgb, #e53935 22%, transparent); border-radius:6px; z-index:-1; }
.hbar { display:grid; grid-template-columns:minmax(90px, 38%) 1fr auto; align-items:center; gap:8px; margin:5px 2px; font-size:.9em; }
.hbar > span { display:flex; align-items:center; gap:5px; min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.hbar > span ha-icon { --mdc-icon-size:16px; color:#fb8c00; flex:none; }
.hbar i { display:block; height:12px; border-radius:6px; background:var(--bc, var(--pc)); }
.minibars { display:flex; align-items:flex-end; gap:2px; height:64px; padding:4px 2px; border-bottom:1px solid var(--divider-color); }
.minibars i { flex:1; min-width:2px; max-width:14px; border-radius:3px 3px 0 0; background:var(--bc, var(--pc)); }
.mxwrap { overflow-x:auto; margin:0 -2px; }
table.matrix { width:auto; min-width:100%; }
table.matrix th, table.matrix td { padding:5px 6px; text-align:center; border-bottom:1px solid var(--divider-color); font-variant-numeric:tabular-nums; }
table.matrix td:first-child { text-align:left; white-space:nowrap; position:sticky; left:0; background:var(--card-background-color, #fff); }
table.matrix th ha-icon { --mdc-icon-size:18px; color:#fb8c00; }
table.matrix td:not(:first-child) { background:rgba(142, 36, 170, var(--a)); }
.tile b > span, .tile b .m { font-size:inherit !important; color:inherit !important; display:inline !important; }
table.matrix th small { display:block; font-size:9.5px; font-weight:400; color:var(--secondary-text-color); max-width:62px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:2px auto 0; }
/* 📸 Mitglieder-Fotos (beta.6) */
.pp .av.ph { padding:0; overflow:hidden; box-shadow:0 0 0 2px var(--ac, #607d8b); }
.pp .av.ph img { width:100%; height:100%; object-fit:cover; display:block; }
img.phav { border-radius:50%; object-fit:cover; flex:none; vertical-align:middle; margin-right:8px; }
.item > img.phav { margin-right:2px; }
.hbar img.phav { margin-right:2px; }
table.sttab img.phav { margin-right:7px; }
.hero { position:relative; }
img.phhero { position:absolute; right:14px; top:50%; transform:translateY(-50%); width:72px; height:72px; border-radius:50%; object-fit:cover; box-shadow:0 0 0 3px var(--hc); }
.phrow { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
.phprev { width:56px; height:56px; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center; background:color-mix(in srgb, var(--primary-text-color) 10%, transparent); flex:none; }
.phprev img { width:100%; height:100%; object-fit:cover; }
.phprev ha-icon { --mdc-icon-size:30px; opacity:.5; }
.phrow label.btn { cursor:pointer; }
.hbar.click { cursor:pointer; }
/* 📤 Drucken & Teilen (beta.6) */
.prchoice { display:flex; flex-wrap:wrap; gap:8px; margin:2px 0 10px; }
.prqr { display:flex; flex-direction:column; align-items:center; gap:8px; margin:6px 0 10px; }
.prqrbox { display:flex; flex-direction:column; align-items:center; gap:4px; }
.prqrc { width:min(280px, 80vw); background:#fff; padding:6px; border-radius:12px; }
.prqrc svg { width:100%; height:auto; display:block; }
.kcprev { overflow-x:auto; border:1px solid var(--divider-color); border-radius:12px; }
`;

const initials = (n) => { const p = String(n || "?").trim().split(/\s+/); return ((p[0]?.[0] || "?") + (p.length > 1 ? p[p.length - 1][0] : (p[0]?.[1] || ""))).toUpperCase(); };
const mcol = (d, mid) => { const i = d.members.findIndex((m) => m.id === mid); return MEMBER_COLORS[(i < 0 ? 0 : i) % MEMBER_COLORS.length]; };
const fmtDate = (iso, opt = { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) => { const [y, m, dd] = String(iso || "").split("-").map(Number); return y ? new Date(y, (m || 1) - 1, dd || 1).toLocaleDateString(kcLoc(), opt) : ""; };
const icn = (s) => String(s || "mdi:bowling").replace(/^mdi:/, "");
const PIE = ["#1e88e5", "#fb8c00", "#43a047", "#e53935", "#8e24aa", "#00897b", "#f9a825", "#6d4c41", "#3949ab", "#ec407a"];

class KegelclubCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._view = "abend";
    this._open = null;          // welcher Eintrag gerade bearbeitet wird
    this._sel = null;           // 👤 ausgewählte Person im Kegelabend
    this._qk = QKEY; this._dk = DKEY;
    this._queue = store.get(this._qk, []);
    this._server = null;
    this._hidden = store.get(HKEY, null);
    this._sheet = null;
    this._pad = null;
    this._year = new Date().getFullYear();
    this._kform = "in";         // 🏦 Kasse: Einzahlung oder Ausgabe
    const root = this.shadowRoot;
    let lpTimer = null, lpFired = false;
    const lpBtn = (t) => { const b = t?.closest?.("button"); return b && !(b.innerText || "").trim() && (b.getAttribute("title") || b.getAttribute("aria-label")) ? b : null; };
    root.addEventListener("pointerdown", (e) => {
      const b = lpBtn(e.target);
      clearTimeout(lpTimer); lpFired = false;
      if (!b) return;
      const text = b.getAttribute("title") || b.getAttribute("aria-label");
      lpTimer = setTimeout(() => { lpFired = true; try { navigator.vibrate?.(20); } catch (_) { /* egal */ } this._toast(text); }, 550);
    }, true);
    for (const ev of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(ev, () => clearTimeout(lpTimer), true);
    root.addEventListener("click", (e) => { if (lpFired) { lpFired = false; e.stopImmediatePropagation(); e.preventDefault(); } }, true);
    root.addEventListener("contextmenu", (e) => { if (lpBtn(e.target)) e.preventDefault(); }, true);
    this._onKey = (e) => {
      if (!this._padShown || !this.isConnected || !this._pad) return;
      if (/^\d$/.test(e.key)) this._padPress(e.key);
      else if (e.key === "Backspace") this._padPress("⌫");
      else if (e.key === "Enter" || e.code === "NumpadEnter") this._padPress("✔");
      else if (e.key === "Escape") this.shadowRoot.querySelector('[data-a="back"]')?.click();
      else return;
      e.preventDefault(); e.stopPropagation();
    };
  }

  static getStubConfig() { return { title: "Kegelclub" }; }
  getCardSize() { return 8; }
  static getConfigElement() { return document.createElement("kegelclub-card-editor"); }
  setConfig(config) {
    this._config = { title: "Kegelclub", ...config };
    const book = String(this._config.buch || this._config.club || "").trim(); // 🏠 welcher Club (leer = erster)
    if (book !== (this._book ?? "")) {
      const changed = this._book !== undefined;
      this._book = book;
      const sfx = book ? "_" + book.toLowerCase().replace(/[^a-z0-9äöüß]+/g, "_") : "";
      this._qk = QKEY + sfx; this._dk = DKEY + sfx;
      this._queue = store.get(this._qk, []);
      if (changed) { this._unsub?.then((u) => u?.()).catch(() => {}); this._unsub = null; this._server = null; if (this._hass) { this._subscribe(); this._render(); } }
    }
    if (this._hidden == null) this._hidden = !!this._config.privat;
    if (this._hass) { const before = KC_LANG; this._useLang(); if (before !== KC_LANG) { this._force = true; this._render(); } }
  }
  _useLang() {
    const lang = kcWantLang(this._hass, this._config);
    if (lang !== KC_LANG) { KC_LANG = lang; for (const c of KC_CARDS) if (c !== this) { c._force = true; c._render(); } }
    if (KC_LANG !== "de") kcLoadDict();
  }
  get _app() { return !!window.__kcOfflineApp; }
  _bk() { return this._book ? { book: this._book } : {}; }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._useLang();
    if (first) {
      if (this._app) this._server = store.get(this._dk, null);
      this._subscribe();
      this._render();
    }
    if (hass.connected !== false) this._flush();
  }
  connectedCallback() { if (this._hass && !this._unsub) this._subscribe(); document.addEventListener("keydown", this._onKey, true); }
  disconnectedCallback() { this._unsub?.then((u) => u?.()).catch(() => {}); this._unsub = null; document.removeEventListener("keydown", this._onKey, true); }
  _subscribe() {
    if (this._unsub || !this._hass?.connection) return;
    this._unsub = this._hass.connection.subscribeMessage((data) => {
      this._server = data;
      if (this._app) store.put(this._dk, data);
      this._render();
    }, { type: "kegelclub/subscribe", ...this._bk() }).catch((err) => { this._err = err?.message || String(err); this._unsub = null; this._render(); });
  }
  // Der Stand, den man sieht = Stand von HA + alles, was noch im Postausgang liegt
  get _data() {
    if (!this._server) return null;
    const d = JSON.parse(JSON.stringify(this._server));
    for (const k of ["members", "strafen", "abende", "kasse", "log"]) d[k] = d[k] || [];
    d.settings = { ...DEF_SETTINGS, ...(d.settings || {}) };
    for (const ev of d.abende) { ev.status = ev.status || {}; ev.counts = ev.counts || {}; }
    for (const op of this._queue) { try { applyLocal(d, op); } catch (_) { /* kaputte Änderung – HA sagt dann Bescheid */ } }
    d.summary = summary(d);
    return d;
  }
  _send(op) {
    op = { op_id: uid(), ts: Date.now(), ...op };
    this._queue.push(op);
    store.put(this._qk, this._queue);
    this._render();
    this._flush();
    return op;
  }
  async _flush() {
    if (this._flushing || !this._queue.length || !this._hass) return;
    this._flushing = true;
    try {
      const batch = this._queue.slice(0, 100);
      const res = await this._hass.callWS({ type: "kegelclub/apply", ops: batch, ...this._bk() });
      const done = new Set(batch.map((o) => o.op_id));
      const failed = (res?.results || []).filter((r) => !r.ok);
      this._queue = this._queue.filter((o) => !done.has(o.op_id));
      store.put(this._qk, this._queue);
      if (failed.length) this._toast("⚠️ " + failed.map((f) => f.error).join(", "));
      this._render();
      if (this._queue.length) setTimeout(() => this._flush(), 50);
    } catch (_) {
      clearTimeout(this._retry);
      this._retry = setTimeout(() => this._flush(), 15000);
    } finally { this._flushing = false; }
  }
  _toast(message) { this.dispatchEvent(new CustomEvent("hass-notification", { detail: { message: kcT(message) }, bubbles: true, composed: true })); }

  // ---------------------------------------------------------------- 🖼️ Zeichnen (Optik wie die Einkaufsliste)
  _m(v, cls = "") { return `<span class="${cls} ${this._hidden ? "hidden-amt" : ""}">${money(v)}</span>`; }
  _mv(v, key, cls = "") {
    if (this._hidden || !this._data?.settings?.veil) return this._m(v, cls);
    const on = this._peek?.key === key && this._peek.until > Date.now();
    return `<span class="${cls} veil ${on ? "peek" : ""}" data-a="peek" data-v="${esc(key)}" title="Antippen = 4 Sekunden zeigen">${money(v)}</span>`;
  }
  _gh(icon, color, title, right = "") { return `<div class="ghead"><span class="gdot" style="--gc:${color}">${ic(icon)}</span><span>${title}</span><span class="n">${right}</span></div>`; }
  // 📸 Mitglieder-Foto (nur wenn eins da ist – sonst bleibt alles wie vorher)
  _avatar(d, mid, size = 28) { const ph = d.members.find((m) => m.id === mid)?.photo; return ph ? `<img class="phav" src="${esc(ph)}" alt="" style="width:${size}px;height:${size}px">` : ""; }
  _lb(t) { return this._labels ? `<span class="lbl">${esc(t)}</span>` : ""; }
  _greet() {
    const h = new Date().getHours();
    const g = h < 11 ? "☀️ Guten Morgen" : h < 18 ? "🎳 Gut Holz" : "🌙 Gut Holz";
    const name = String(this._hass?.user?.name || "").split(" ")[0];
    return name ? `${g}, ${esc(name)}` : g;
  }
  _name(d, mid) { return d.members.find((m) => m.id === mid)?.name || "?"; }

  _render() {
    if (this._dragging) { this._pending = true; return; }
    const a = this.shadowRoot.activeElement;
    if (a && ((a.tagName === "INPUT" && !["checkbox", "radio", "button"].includes(a.type)) || a.tagName === "TEXTAREA" || a.tagName === "SELECT") && !this._force) { this._pending = true; return; }
    this._force = false;
    const d = this._data;
    kcSetMoney(d?.settings?.currency, KC_LANG);
    this._labels = !!d?.settings?.labels;
    this.classList.toggle("labels", this._labels);
    this.classList.toggle("calm", !!store.get(CALMKEY, false));
    const online = this._hass?.connected !== false;
    const q = this._queue.length;
    const pill = q ? `<button class="pill wait" data-a="tab" data-v="abend">⏳ ${q} ${q === 1 ? "wartet" : "warten"}</button>`
      : online ? `<button class="pill" data-a="tab" data-v="abend">🟢 verbunden</button>`
      : `<button class="pill off" data-a="tab" data-v="abend">${this._app ? "📴 offline – letzter Stand" : "🔴 keine Verbindung"}</button>`;
    const top = `<div class="topbar">${pill}<span class="grow">${this._greet()}</span>${d ? `<button class="iconbtn ${this._view === "set" ? "on" : ""}" data-a="tab" data-v="set" title="Einstellungen">${ic("cog-outline")}<span class="lbl">Einstellungen</span></button>` : ""}<span class="ver" translate="no">v${KC_VERSION}</span></div>`;
    const lockAll = !!(d && d.pin && d.settings?.lock_all && !(this._app && window.__kcAppLock?.on?.()));
    const locked = !!(d && d.pin && !pinOpen() && (lockAll || this._view === "edit" || this._view === "set"));
    this._lockAll = lockAll && locked;
    if (lockAll && !locked) { clearTimeout(this._relockT); this._relockT = setTimeout(() => { this._force = true; this._render(); }, Math.max(1000, PIN_LOCK.until - Date.now() + 500)); }
    if (locked && this._pad?.step !== "unlock") this._pad = { purpose: "unlock", step: "unlock", buf: "", back: "abend" };
    if (!locked && this._pad?.step === "unlock") this._pad = null;
    if (this._view === "ev" && d && !d.abende.some((e) => e.id === this._evId)) this._view = "abend";
    if (this._view === "share" && d && !d.abende.some((e) => e.id === this._shareId)) this._view = "abend";
    const page = !d ? null : this._pad ? this._padPage(d) : this._view === "guide" ? { icon: "book-open-variant", color: "#3949ab", title: "Anleitung", html: this._guideView() }
      : this._view === "ev" ? this._evPage(d) : this._view === "share" ? this._sharePage(d) : this._view === "set" && this._sheet ? this._sheetPage(d) : null;
    this._padShown = !!(d && this._pad);
    if (this._view !== "set") this._setOpen = null;
    const deeper = !!(this._pad ? this._pad.back === "sheet" : this._view === "set" && this._sheet);
    const showBack = !!(d && !this._lockAll && (this._view === "set" || this._view === "guide" || this._view === "ev" || this._view === "share" || this._pad));
    const appLock = this._app && !!window.__kcAppLock?.on?.();
    const isLocked = d?.pin && !pinOpen();
    const inSet = this._view === "set";
    const tools = this._lockAll ? "" : `${inSet ? "" : `<button class="iconbtn ${this._hidden ? "on" : ""}" data-a="hide" title="Beträge ${this._hidden ? "zeigen" : "verstecken"}">${ic(this._hidden ? "eye-off-outline" : "eye-outline")}${this._lb(this._hidden ? "Zeigen" : "Verstecken")}</button>`}
      <button class="iconbtn" data-a="lock" title="${appLock ? "App jetzt sperren" : isLocked ? "Gesperrt – PIN nötig für ⚙️ und Mitglieder" : "Jetzt sperren"}">${ic(isLocked && !appLock ? "lock-outline" : "lock-open-variant-outline")}${this._lb(isLocked && !appLock ? "Gesperrt" : "Sperren")}</button>
      ${showBack ? `<button class="iconbtn" data-a="back" title="${deeper ? "Zurück" : "Schließen"}">${ic(deeper ? "arrow-left" : "close")}${this._lb(deeper ? "Zurück" : "Schließen")}</button>` : ""}`;
    let body;
    if (!d) {
      body = this._err ? `<div class="empty">⚠️ ${esc(this._err)}<br>Ist die Integration „Kegelclub“ eingerichtet?</div>` : `<div class="empty">⏳ Lade …</div>`;
    } else {
      const v = d.settings.view || {};
      const tabs = [["abend", "bowling", "Abend"], ...(v.kasse === false ? [] : [["kasse", "bank-outline", "Kasse"]]), ...(v.statistik === false ? [] : [["stats", "chart-bar", "Statistik"]])];
      const s = d.summary;
      const badge = s.running ? `<span class="badge" data-a="tab" data-v="abend" title="Kegelabend läuft">🎳 läuft</span>` : s.debtors ? `<span class="badge" data-a="tab" data-v="kasse" title="so viele haben noch offen">${s.debtors}</span>` : "";
      const title = d.book && !d.book.primary ? esc(d.book.title) : esc(this._config?.title && this._config.title !== "Kegelclub" ? this._config.title : "");
      body = `<div class="head"><div class="title"><span class="logo" data-a="tab" data-v="abend" title="Zurück zum Abend">${ic("bowling")}</span>${title ? `<span data-noicon>${title}</span>` : ""}${this._lockAll ? "" : badge}</div>${tools}</div>`;
      body += this._updHtml(d);
      if (!page && this._view !== "set") body += `<div class="tabs">${tabs.map(([k, i, l]) => `<button class="tab ${this._view === k ? "active" : ""}" data-a="tab" data-v="${k}">${ic(i)}${l}</button>`).join("")}</div>`;
      if (!locked) pinTouch();
      body += page ? `<div class="sec pagehost"><div class="sechead"><span class="ic" style="--ic:${page.color}">${ic(page.icon)}</span><h3>${page.title}</h3></div><div class="pagebody">${page.html}</div></div>`
        : this._view === "edit" ? this._editView(d) : this._view === "set" ? this._setView(d) : this._view === "kasse" ? this._kasseView(d) : this._view === "stats" ? this._statsView(d) : this._abendView(d);
    }
    this.shadowRoot.innerHTML = `<style>${CSS}</style>${top}<ha-card>${body}</ha-card>
      <div class="foot"><button class="${this._view === "guide" ? "on" : ""}" data-a="tab" data-v="${this._view === "guide" ? "abend" : "guide"}">${ic("book-open-page-variant-outline")}<span>Anleitung</span></button></div>
      ${this._undo ? `<div class="undobar" role="status"><span class="ut">${esc(this._undo.label)}</span><button class="ub" data-a="undo">↩️ Rückgängig</button></div>` : ""}`;
    if (KC_LANG !== "de" && KC_DICT) {
      try { kcCollectUser(this._data); if (this._config?.title && this._config.title !== "Kegelclub") KC_USER.add(kcNorm(this._config.title)); kcTranslateTree(this.shadowRoot); } catch (_) { /* dann eben Deutsch */ }
    }
    if (!window.__kcNoIcons) try { kcIconizeTree(this.shadowRoot); } catch (_) { /* Symbole sind nur Deko */ }
    this._bind();
    KC_CARDS.add(this);
    try { window.dispatchEvent(new CustomEvent("kegelclub-nav")); } catch (_) { /* egal */ }
  }
  kegelclubIsRoot() { return !this._pad && !this._open && !["set", "guide", "ev", "share"].includes(this._view); }
  kegelclubBack() {
    if (this.kegelclubIsRoot()) return false;
    if (this._pad?.step === "unlock") { this._pad = null; this._view = "abend"; this._sheet = null; }
    else if (this._pad) { const back = this._pad.back; this._pad = null; if (back !== "sheet") { this._view = "abend"; this._sheet = null; } }
    else if (this._open) this._open = null;
    else if (this._view === "set" && this._sheet) this._sheet = null;
    else if (this._view === "share") { this._view = this._shareBack || "abend"; this._shareMode = null; }
    else { this._view = this._view === "ev" ? this._evBack || "abend" : "abend"; this._evBack = null; this._sheet = null; }
    this._force = true; this._render();
    return true;
  }
  _updHtml(d) {
    const server = d.version;
    if (!server || server === KC_VERSION) return "";
    return kcVerCmp(server, KC_VERSION) > 0
      ? `<div class="updbar">🔄 <b>Neue Version ${esc(server)} ist da (hier läuft noch ${KC_VERSION}).</b><button class="btn small" data-a="reload">Neu laden</button></div>`
      : `<div class="updbar">🔄 <b>Die Karte ist schon ${KC_VERSION}, Home Assistant noch ${esc(server)} – bitte Home Assistant neu starten.</b></div>`;
  }

  // ---------------------------------------------------------------- 🎳 Abend
  _abendView(d) {
    const ev = evFind(d);
    if (!d.members.length && !d.setup_done && !ev) return this._wizard(d);
    if (ev) return this._evRunning(d, ev);
    const st = d.settings;
    let h = `<div class="hero" style="--hc:#fb8c00"><div class="lbl">Nächster Kegelabend</div><div style="font-size:1.15em;font-weight:600;margin-top:2px">Gut Holz! 🎳</div></div>
      <form class="edit" data-a="evstart"><div class="f"><label>Datum<input name="date" type="date" value="${todayIso()}"></label>
      ${st.lane_mode === "off" ? "" : `<label>Kegelbahn (Stunden)<input name="hours" inputmode="decimal" value="${numDe(st.lane_hours ?? 3)}"></label>`}</div>
      <div class="btnrow end"><button class="btn main" type="submit">${ic("play")}Kegelabend starten</button></div></form>`;
    if (!d.strafen.some((s) => s.active !== false)) h += `<div class="tip">💡 Noch keine Strafen. Unter ⚙️ → <b>„Mitglieder & Strafen“</b> anlegen.</div>`;
    if (!d.members.some((m) => !m.guest && m.active !== false)) h += `<div class="tip">💡 Noch keine Mitglieder. Unter ⚙️ → <b>„Mitglieder & Strafen“</b> anlegen.</div>`;
    h += this._pastList(d);
    return h;
  }
  _wizard(d) {
    return `<div class="hero" style="--hc:#fb8c00"><div class="lbl">Willkommen</div><div style="font-size:1.2em;font-weight:600;margin-top:2px">🎳 Los geht's – wie willst du starten?</div></div>
      <div class="wiz">
        <button class="btn" data-a="wiz" data-v="import">${ic("database-import-outline")}<span><b>Aus „Alle Neune“ übernehmen</b><small>Datei aus der App einlesen – mit allen alten Abenden und der Kasse</small></span></button>
        <button class="btn" data-a="wiz" data-v="template">${ic("clipboard-list-outline")}<span><b>Beispiel-Strafen laden</b><small>Pumpe, Klingeln, Alle Neune … – alles änderbar</small></span></button>
        <button class="btn" data-a="wiz" data-v="empty">${ic("file-outline")}<span><b>Leer starten</b><small>Mitglieder und Strafen selbst anlegen</small></span></button>
      </div><p class="small">Das kannst du später jederzeit in ⚙️ ändern.</p>`;
  }
  _pastList(d) {
    const past = d.abende.filter((e) => e.closed).slice().reverse();
    if (!past.length) return "";
    const [members, strafen] = maps(d);
    const n = this._allPast ? past.length : 8;
    return this._gh("history", "#546e7a", "Letzte Abende", String(past.length)) + past.slice(0, n).map((ev) => {
      const b = billEvening(ev, members, strafen, d.settings);
      const here = Object.values(b.people).filter((p) => ["play", "watch"].includes(p.status)).length;
      return `<div class="item click" style="--cc:#fb8c00" data-a="evopen" data-id="${esc(ev.id)}"><div class="n"><b>${esc(fmtDate(ev.date))}</b><div class="meta"><span class="tag">${here} da</span>${ev.no_fines ? `<span class="tag">🙌 Strafen erlassen</span>` : ""}${ev.imported ? `<span class="tag">aus Alle Neune</span>` : ""}${ev.note ? `<span class="tag" data-noicon>${esc(ev.note)}</span>` : ""}</div></div><div class="amt">${this._m(b.total)}</div></div>`;
    }).join("") + (past.length > n ? `<div class="btnrow"><button class="btn small" data-a="allpast">${ic("chevron-down")}Alle ${past.length} zeigen</button></div>` : "");
  }
  // 💶 Was ist für diesen Abend schon am Tisch bezahlt? (tag: base = Grundbetrag, fines = Strafen)
  _paidAt(d, evId, mid, tag) { return r2(d.kasse.filter((k) => k.abend === evId && k.member === mid && k.tag === tag && k.kind !== "out").reduce((s, k) => s + (Number(k.amount) || 0), 0)); }
  // 👥 Reihenfolge wie unter „Mitglieder“ (erst Mitglieder, dann Gäste)
  _order(d, ids) { const pos = new Map(d.members.map((m, i) => [m.id, i])), g = (x) => (d.members[pos.get(x)]?.guest ? 1 : 0); return ids.slice().sort((x, y) => g(x) - g(y) || (pos.get(x) ?? 1e6) - (pos.get(y) ?? 1e6)); }
  // 🔒 Hat die Person an diesem Abend schon eine Strafe (gezählt, von anderen oder per Hand)?
  _hasFines(ev, mid) {
    if (Object.values(ev.counts?.[mid] || {}).some((n) => Number(n) > 0)) return true;
    if ((ev.extra || []).some((x) => x.member === mid)) return true;
    const pr = ev.prices || {};
    return Object.entries(ev.counts || {}).some(([oid, per]) => oid !== mid && ev.status?.[mid] === "play" && Object.entries(per || {}).some(([sid, n]) => Number(n) > 0 && (pr[sid]?.[1] || "self") === "others"));
  }
  // 🧾 Wer hat am Ende des Abends noch etwas offen?
  _openAt(d, ev, b) {
    const out = [];
    for (const [mid, p] of Object.entries(b.people)) {
      if (!["play", "watch"].includes(p.status)) continue;
      const due = r2(Math.max(0, p.fee - this._paidAt(d, ev.id, mid, "base")) + Math.max(0, p.fines + p.lane + p.extra - this._paidAt(d, ev.id, mid, "fines")));
      if (due > 0.004) out.push([mid, due]);
    }
    return this._order(d, out.map((x) => x[0])).map((mid) => out.find((x) => x[0] === mid));
  }
  _evRunning(d, ev) {
    const [members, strafen] = maps(d);
    const b = billEvening(ev, members, strafen, d.settings);
    const here = (mid) => ["play", "watch"].includes(ev.status[mid]);
    const all = this._order(d, Object.keys(ev.status)), ids = all.filter(here);
    if (this._sel && !all.includes(this._sel)) this._sel = null;
    const sel = this._sel, selAway = !!sel && !here(sel);
    const finesSum = r2(all.reduce((s, m) => s + b.people[m].fines, 0));
    const feeSum = r2(ids.reduce((s, m) => s + b.people[m].fee, 0));
    const feeOpen = ids.filter((m) => b.people[m].fee > 0 && this._paidAt(d, ev.id, m, "base") < b.people[m].fee - 0.004);
    let h = `<div class="hero" style="--hc:#fb8c00"><div class="lbl">Kegelabend · ${esc(fmtDate(ev.date))}${ev.waiting ? " · ⏳ wartet" : ""}</div><div class="big" style="font-size:1.9em">${this._m(finesSum)}</div>
      <div class="lbl">Strafen heute${feeSum ? ` · Grundbeträge ${money(feeSum)}` : ""}${b.lane ? ` · Kegelbahn ${money(b.lane)}${b.rules.lane_mode === "kasse" ? " beim Abschließen aus der Kasse" : " aufgeteilt"}` : ""}</div></div>`;
    h += `<div class="evbar">${b.rules.lane_mode === "off" ? "" : `<label class="hrs">${ic("timer-outline")}<input data-a="evhours" inputmode="decimal" value="${numDe(ev.hours || 0)}" aria-label="Stunden Kegelbahn"> Std.</label>`}
      <button class="btn small" data-a="guest">${ic("account-plus-outline")}Gast</button>
      ${feeSum ? feeOpen.length ? `<button class="btn small main" data-a="basepay" title="Kassiert jetzt von allen, die da sind">${ic("hand-coin-outline")}Grundbetrag kassiert (${feeOpen.length})</button>` : `<span class="tag ok">${ic("check")}Grundbetrag kassiert</span>` : ""}
      <label class="switch" style="border:0;padding:0 4px"><span>${ic("hand-okay")}Strafen erlassen</span><input type="checkbox" class="swchk" data-a="nofines" ${ev.no_fines ? "checked" : ""}></label></div>`;
    if (this._guestPick) {
      const known = d.members.filter((m) => m.guest && m.active !== false && !(m.id in ev.status));
      const back = d.members.filter((m) => !m.guest && !(m.id in ev.status) && m.active !== false);
      h += `<div class="edit"><b>Wer kommt dazu?</b>${known.length || back.length ? `<div class="quick" style="flex-wrap:wrap">${[...back, ...known].map((m) => `<button class="chip" data-a="guestadd" data-id="${esc(m.id)}" data-noicon>${esc(m.name)}</button>`).join("")}</div>` : ""}
        <form class="add pinf" data-a="guestnew"><input name="name" placeholder="Neuer Gast: Name" autocomplete="off"><button class="addbtn" type="submit" title="Gast dazu">${ic("plus")}</button></form>
        <div class="btnrow end"><button class="btn small" data-a="guest">${ic("close")}Fertig</button></div></div>`;
    }
    h += this._gh("account-group-outline", "#1e88e5", "Wer war's?", sel ? `<span data-noicon>${esc(members[sel]?.name || "")}</span>` : "Person antippen");
    h += `<div class="ppl">${all.map((mid) => {
      const m = members[mid] || {}, p = b.people[mid], st = STATUS[p.status] || STATUS.play;
      return `<div class="pp ${sel === mid ? "sel" : ""} ${here(mid) ? "" : "off"}" data-a="pick" data-id="${esc(mid)}" role="button">${m.guest ? `<span class="gst">Gast</span>` : ""}<span class="av ${m.photo ? "ph" : ""}" style="--ac:${mcol(d, mid)}">${m.photo ? `<img src="${esc(m.photo)}" alt="">` : esc(initials(m.name))}</span><span class="nm" data-noicon>${esc(m.name || "?")}</span><span class="sum">${this._m(p.fines)}</span>
        <button class="stbtn" style="--sc:${st.color}" data-a="status" data-id="${esc(mid)}" title="Antippen = weiter: kegelt → schaut zu → abgemeldet → nicht abgemeldet">${ic(st.icon)}${st.label}</button></div>`;
    }).join("")}</div>`;
    const fines = d.strafen.filter((s) => s.active !== false);
    h += this._gh("gavel", "#e53935", sel ? `Strafe für ${esc(members[sel]?.name || "")}` : "Strafen", sel ? (selAway ? "fehlt – nur „Eigene“" : "") : "erst Person wählen");
    h += `<div class="fines">${fines.map((s) => {
      const n = ev.counts?.[sel]?.[s.id] || 0, pr = ev.prices?.[s.id] || [s.amount, s.payer];
      return `<button class="fine" data-a="fine" data-id="${esc(s.id)}" ${sel && !selAway ? "" : "disabled"} title="${esc(s.name)}">${n && !selAway ? `<span class="fminus" data-a="fminus" data-id="${esc(s.id)}" role="button" title="eins zurück" aria-label="eins zurück">−</span><span class="cnt">${n}</span>` : ""}<ha-icon icon="${esc(s.icon || "mdi:bowling")}"></ha-icon><b data-noicon>${esc(s.name)}</b><small class="${pr[1] === "others" ? "oth" : ""}">${money(pr[0])}${pr[1] === "others" ? " · alle anderen" : ""}</small></button>`;
    }).join("")}<button class="fine hand" data-a="handopen" ${sel ? "" : "disabled"} title="Strafe per Hand">${ic("pencil-plus-outline")}<b>Eigene</b><small>Betrag + Grund</small></button></div>`;
    if (sel && this._hand) h += `<form class="edit" data-a="hand"><div class="f"><label class="wide">Wofür? (z. B. Bier umgekippt)<input name="name" autocomplete="off"></label><label>Betrag (${KC_MONEY.sym})<input name="amount" inputmode="decimal" autocomplete="off"></label></div>
      <div class="btnrow end"><button type="button" class="btn" data-a="handopen">${ic("close")}Abbrechen</button><button class="btn main" type="submit">${ic("check")}Für ${esc(members[sel]?.name || "")} buchen</button></div></form>`;
    if (!fines.length) h += `<div class="empty">Noch keine Strafen – unter ⚙️ → „Mitglieder & Strafen“ anlegen.</div>`;
    h += this._billHtml(d, ev, b, true);
    h += `<div class="btnrow"><button class="btn main" data-a="evclose" data-id="${esc(ev.id)}">${ic("flag-checkered")}Abend abschließen</button><button class="btn" data-a="share" data-id="${esc(ev.id)}">${ic("share-variant-outline")}Teilen</button></div>`;
    return h;
  }
  // 🧾 Abrechnung: alle in fester Reihenfolge (Fehlende blass); rechts nur die Strafen + 💰 Münze = bezahlt
  _billHtml(d, ev, b, live) {
    const [members, strafen] = maps(d);
    const ids = this._order(d, Object.keys(b.people)), away = [];
    const isAway = (mid) => !["play", "watch"].includes(b.people[mid].status);
    const sumF = r2(ids.reduce((s, m) => s + (ev.imported ? b.people[m].total : b.people[m].fines + b.people[m].lane), 0));
    // (Fehlende stehen mit drin – blass, mit offenem Grundbetrag)
    let h = this._gh("receipt-text-outline", "#3949ab", "Abrechnung", this._m(sumF));
    if (ev.imported) h += `<p class="small">📥 Aus „Alle Neune“ übernommen: Die Beträge sind die, die damals wirklich in die Kasse gebucht wurden.</p>`;
    h += `<div class="bill">${ids.map((mid) => {
      const p = b.people[mid], st = STATUS[p.status] || STATUS.play;
      const chips = Object.entries(p.items).map(([k, n]) => {
        const [sid, from] = k.split(">"), s = strafen[sid];
        const label = from ? `${s?.name || "?"} von ${members[from]?.name || "?"}` : s?.name || "?";
        const canDel = live && !from && !ev.imported;
        return `<span class="chipx" data-noicon>${esc(label)} ×${n}${canDel ? `<button data-a="minus" data-id="${esc(mid)}" data-v="${esc(sid)}" title="eins weniger" aria-label="eins weniger">−</button>` : ""}</span>`;
      }).concat((ev.extra || []).filter((x) => x.member === mid).map((x) => `<span class="chipx"><span data-noicon>✍️ ${esc(x.name)}</span>&nbsp;${money(x.amount)}${live ? `<button data-a="handdel" data-id="${esc(x.id)}" title="wieder raus" aria-label="wieder raus">−</button>` : ""}</span>`)).join("");
      if (ev.imported) return `<div class="item" style="--cc:${st.color}"><div class="n"><b data-noicon>${esc(members[mid]?.name || "?")}</b>${chips ? `<div class="chips" style="margin-top:3px">${chips}</div>` : ""}</div><div class="amt">${this._m(p.total)}</div></div>`;
      const due = r2(p.fines + p.lane + p.extra), paidF = this._paidAt(d, ev.id, mid, "fines"), paidB = this._paidAt(d, ev.id, mid, "base");
      const baseOk = !p.fee || paidB >= p.fee - 0.004, finesOk = due <= 0.004 || paidF >= due - 0.004;
      const baseLock = baseOk && paidB > 0 && this._hasFines(ev, mid); // 🔒 wer schon eine Strafe hat, saß am Tisch – Grundbetrag bleibt bezahlt
      const baseTag = p.fee ? baseLock ? `<span class="tag ok" title="Gesperrt: ${esc(this._name(d, mid))} hat schon Strafen">Grundbetrag ${money(p.fee)} ✓ 🔒</span>` : `<button class="tag ${baseOk ? "ok" : "no"}" data-a="basetoggle" data-id="${esc(mid)}" title="Antippen = Grundbetrag bezahlt / nicht bezahlt">Grundbetrag ${money(p.fee)} ${baseOk ? "✓" : "offen"}</button>` : "";
      const tags = isAway(mid) ? [`<span class="tag">${st.label}</span>`, baseTag, p.extra ? `<button class="tag ${finesOk ? "ok" : "no"}" data-a="coin" data-id="${esc(mid)}" title="Antippen = bezahlt / nicht bezahlt">+ ${money(p.extra)} nicht abgemeldet ${finesOk ? "✓" : ""}</button>` : ""].join("") : [`<span class="tag">${st.label}</span>`,
        baseTag,
        p.lane ? `<span class="tag">inkl. Bahn ${money(p.lane)}</span>` : "", ev.no_fines && Object.keys(p.items).length ? `<span class="tag">Strafen erlassen</span>` : ""].join("");
      const coin = due > 0.004 || paidF > 0 ? `<button class="iconbtn coin ${finesOk ? "ok" : ""}" data-a="coin" data-id="${esc(mid)}" title="${finesOk ? "Bezahlt ✓ – antippen = zurücknehmen" : "Antippen = Strafen bezahlt"}" aria-label="bezahlt">${ic(finesOk ? "check-circle" : "hand-coin-outline")}</button>` : `<span class="iconbtn coin"></span>`;
      return `<div class="item ${isAway(mid) ? "off" : ""}" style="--cc:${st.color}">${this._avatar(d, mid, 34)}<div class="n"><b data-noicon>${esc(members[mid]?.name || "?")}</b><div class="meta">${tags}</div>${chips ? `<div class="chips" style="margin-top:3px">${chips}</div>` : ""}</div><div class="amt">${this._m(due, finesOk ? "" : "neg")}</div>${coin}</div>`;
    }).join("")}</div>`;
    return h;
  }
  // 🕘 Alter Abend: ansehen, wieder öffnen, Datum, Strafen erlassen, löschen
  _evPage(d) {
    const ev = d.abende.find((e) => e.id === this._evId);
    const [members, strafen] = maps(d);
    const b = billEvening(ev, members, strafen, d.settings);
    const open = !ev.closed;
    const html = `<div class="evbar"><label style="display:inline-flex;align-items:center;gap:6px">${ic("calendar-outline")}<input type="date" data-a="evdate" value="${esc(ev.date)}" style="width:auto"></label>
        ${ev.imported ? "" : `<label class="switch" style="border:0;padding:0 4px"><span>${ic("hand-okay")}Strafen erlassen</span><input type="checkbox" class="swchk" data-a="nofines" data-id="${esc(ev.id)}" ${ev.no_fines ? "checked" : ""}></label>`}</div>
      <div class="f" style="margin:0 2px 8px"><label class="wide">Notiz (z. B. Kegeltour)<input data-a="evnote" value="${esc(ev.note || "")}"></label></div>
      ${b.lane ? `<p class="small">Kegelbahn: ${numDe(ev.hours)} Std. = ${money(b.lane)}${b.rules.lane_mode === "kasse" ? " aus der Kasse" : " auf die Anwesenden aufgeteilt"}</p>` : ""}
      ${this._billHtml(d, ev, b, false)}
      <div class="btnrow">${open ? "" : ev.imported ? "" : `<button class="btn" data-a="evreopen" data-id="${esc(ev.id)}">${ic("lock-open-variant-outline")}Wieder öffnen</button>`}
      <button class="btn" data-a="share" data-id="${esc(ev.id)}">${ic("share-variant-outline")}Teilen</button>
      <button class="btn" data-a="evdel" data-id="${esc(ev.id)}">${ic("delete-outline")}Löschen</button></div>`;
    return { icon: "bowling", color: "#fb8c00", title: `Kegelabend ${fmtDate(ev.date)}`, html };
  }
  // 📤 Drucken & Teilen: Abrechnung als Blatt, echte PDF, QR-Code oder Text
  _billModel(d, ev) {
    const [members, strafen] = maps(d);
    const b = billEvening(ev, members, strafen, d.settings);
    const ids = this._order(d, Object.keys(b.people));
    const here = (mid) => ["play", "watch"].includes(b.people[mid].status);
    const rows = ids.map((mid) => {
      const p = b.people[mid], st = STATUS[p.status] || STATUS.play;
      const det = Object.entries(p.items).filter(([, n]) => n > 0).map(([key, n]) => { const [sid, from] = key.split(">"); return `${strafen[sid]?.name || "?"}${from ? ` von ${members[from]?.name || "?"}` : ""} ×${n}`; })
        .concat((ev.extra || []).filter((x) => x.member === mid).map((x) => `${x.name} ${money(x.amount)}`));
      if (ev.imported) return { name: members[mid]?.name || "?", status: st.label, here: here(mid), detail: det.join(", "), amount: money(p.total), paid: true, paidTxt: "" };
      const due = r2(p.fines + p.lane + p.extra), paidF = this._paidAt(d, ev.id, mid, "fines"), paidB = this._paidAt(d, ev.id, mid, "base");
      const finesOk = due <= 0.004 || paidF >= due - 0.004;
      if (p.extra) det.unshift(`nicht abgemeldet ${money(p.extra)}`);
      if (p.lane) det.push(`Bahn ${money(p.lane)}`);
      if (ev.no_fines && Object.keys(p.items).length) det.push("Strafen erlassen");
      return { name: members[mid]?.name || "?", status: st.label, here: here(mid), base: p.fee ? money(p.fee) : "", baseOk: !p.fee || paidB >= p.fee - 0.004, detail: det.join(", "), amount: money(due), paid: due > 0.004 && finesOk, open: due > 0.004 && !finesOk, paidTxt: due > 0.004 ? (finesOk ? "bezahlt" : "offen") : "" };
    });
    const finesSum = r2(ids.reduce((x, m) => x + (b.people[m].fines || 0) + (b.people[m].extra || 0), 0));
    const feeSum = r2(ids.reduce((x, m) => x + (b.people[m].fee || 0), 0));
    const sums = [["Strafen zusammen", money(finesSum)]];
    if (feeSum) sums.push(["Grundbeträge", money(feeSum)]);
    if (b.lane) sums.push([`Kegelbahn (${numDe(ev.hours || 0)} Std.)`, money(b.lane)]);
    sums.push(["Kasse jetzt", money(d.summary.kasse)]);
    const club = d.book && !d.book.primary ? d.book.title : "";
    const first = String(this._hass?.user?.name || "").trim().split(/\s+/)[0];
    const now = new Date();
    return {
      title: `Kegelabend ${fmtDate(ev.date, { day: "2-digit", month: "2-digit", year: "numeric" })}`, bigVal: money(finesSum),
      sub: [club, fmtDate(ev.date, { weekday: "long", day: "numeric", month: "long", year: "numeric" }), `${ids.filter(here).length} da`, ev.note, ev.closed ? "abgeschlossen" : "läuft noch"].filter(Boolean).join(" · "),
      by: `Erstellt${first ? ` von ${first}` : ""} am ${now.toLocaleDateString("de-DE")} um ${now.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" })} Uhr`,
      rows, sums,
    };
  }
  _billSheet(m) {
    return `<div class="kcsheet"><div class="ksh"><div><div class="kst">${esc(m.title)}</div><div class="kss">${esc(m.sub)}</div><div class="kss">${esc(m.by)}</div></div><div class="ksn">${esc(m.bigVal)}</div></div><div class="ksbar"></div>
      <table class="kstab"><tr><th>Name</th><th>Status</th><th>Grundbetrag</th><th>Strafen</th><th>Betrag</th></tr>${m.rows.map((r) => `<tr class="${r.here ? "" : "ksaway"}"><td><b>${esc(r.name)}</b></td><td>${esc(r.status)}</td><td class="${r.base ? (r.baseOk ? "ok" : "no") : ""}">${r.base ? `${esc(r.base)} ${r.baseOk ? "✓" : "offen"}` : ""}</td><td class="det">${esc(r.detail)}</td><td class="amt ${r.paid ? "ok" : r.open ? "no" : ""}"><b>${esc(r.amount)}</b>${r.paidTxt ? `<small>${esc(r.paidTxt)}</small>` : ""}</td></tr>`).join("")}</table>
      <table class="kssum">${m.sums.map(([l, v]) => `<tr><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table><div class="ksf">Erstellt mit Kegelclub</div></div>`;
  }
  _billCss(scope) {
    return `${scope} .kcsheet{font:13px/1.35 Roboto,Helvetica,Arial,sans-serif;color:#222;background:#fff;padding:14px;border-radius:10px}
${scope} .ksh{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}${scope} .kst{font-size:20px;font-weight:700}${scope} .kss{font-size:11.5px;color:#666;margin-top:2px}
${scope} .ksn{font-size:24px;font-weight:700;color:#fb8c00;white-space:nowrap}${scope} .ksbar{height:3px;background:#fb8c00;margin:8px 0 10px;border-radius:2px}
${scope} .kstab{width:100%;border-collapse:collapse}${scope} .kstab th{text-align:left;font-size:10.5px;color:#777;font-weight:600;border-bottom:1.5px solid #999;padding:4px 4px}
${scope} .kstab td{border-bottom:1px solid #ddd;padding:5px 4px;vertical-align:top;font-size:12px}${scope} .kstab td.det{font-size:11px;color:#444}
${scope} .kstab td.amt{text-align:right;white-space:nowrap}${scope} .kstab th:last-child{text-align:right}${scope} .kstab td.amt small{display:block;font-size:9.5px}
${scope} .kstab .ok{color:#2e7d32}${scope} .kstab .no{color:#c62828}${scope} .kstab tr.ksaway td{color:#888}
${scope} .kssum{margin:10px 0 0 auto;border-collapse:collapse}${scope} .kssum td{padding:2px 4px;font-size:12.5px}${scope} .kssum td:last-child{text-align:right;font-weight:700;padding-left:18px}
${scope} .ksf{text-align:center;font-size:10px;color:#999;margin-top:12px}`;
  }
  _sharePage(d) {
    const ev = d.abende.find((e) => e.id === this._shareId);
    const m = this._billModel(d, ev), mode = this._shareMode;
    const apple = /iPhone|iPad|iPod/i.test(navigator.userAgent || "") || (/Macintosh/i.test(navigator.userAgent || "") && (navigator.maxTouchPoints || 0) > 1) || (this._inHaApp() && /Mac|iPhone|iPad/i.test(navigator.userAgent || ""));
    let html = `<div class="prchoice">${apple ? "" : `<button class="btn" data-a="shprint">${ic("printer-outline")}Drucken</button>`}<button class="btn ${apple ? "main" : ""}" data-a="shpdf">${ic("file-pdf-box")}${apple ? "PDF drucken / teilen" : "PDF teilen / speichern"}</button><button class="btn ${mode === "qr" ? "main" : ""}" data-a="shmode" data-v="${mode === "qr" ? "" : "qr"}">${ic("qrcode")}QR-Code fürs Handy</button>${navigator.share ? `<button class="btn" data-a="shtext">${ic("message-text-outline")}Als Text teilen</button>` : ""}<button class="btn" data-a="shcopy">${ic("content-copy")}Text kopieren</button></div>`;
    if (mode === "qr") {
      const parts = this._qrParts(this._shareText(d, ev)), many = parts.length > 1;
      html += `<div class="prqr">${parts.map((t, k) => `<div class="prqrbox">${many ? `<b>Teil ${k + 1} von ${parts.length}</b>` : ""}<div class="prqrc">${kcQrSvg(t)}</div></div>`).join("")}
        <p class="small">Mit der Handy-Kamera abfotografieren – die Abrechnung erscheint als Text. Ohne App, ohne Anmelden.${many ? " Sie ist lang, darum gibt es mehrere Codes: einen nach dem anderen." : ""}</p></div>`;
    }
    html += `<p class="small">${apple ? "Auf iPhone und iPad geht Drucken über die PDF: Teilen-Menü → Drucken." : "Vorschau:"}</p><style>${this._billCss(".kcprev")}</style><div class="kcprev">${this._billSheet(m)}</div>`;
    return { icon: "share-variant-outline", color: "#546e7a", title: "Drucken & Teilen", html };
  }
  _qrParts(full, max = 900) { // 📱 ein Code fasst gut lesbar ~900 Bytes – mehr = mehrere Codes „(1/2)“
    const enc = (t) => new TextEncoder().encode(t).length;
    if (enc(full) <= max) return [full];
    const [head, ...lines] = full.split("\n"), chunks = [];
    let cur = [];
    for (const l of lines) { if (cur.length && enc([`${head} (9/9)`, ...cur, l].join("\n")) > max) { chunks.push(cur); cur = []; } cur.push(l.slice(0, 300)); }
    if (cur.length) chunks.push(cur);
    return chunks.map((c, k) => [`${head} (${k + 1}/${chunks.length})`, ...c].join("\n"));
  }
  _inHaApp() { return !!this._hass?.auth?.external && !this._app; }
  _printBill(ev) {
    if (!ev) return;
    const m = this._billModel(this._data, ev);
    const fr = document.createElement("iframe");
    fr.style.cssText = "position:fixed;left:-10000px;top:0;width:182mm;height:263mm;border:0;visibility:hidden;";
    fr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(m.title)}</title><style>@page{size:A4;margin:14mm}body{margin:0}${this._billCss("body")} body .kcsheet{padding:0}</style></head><body>${this._billSheet(m)}</body></html>`;
    fr.onload = () => {
      try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch (_) { this._toast("Drucken geht hier nicht – nimm „PDF“."); }
      setTimeout(() => fr.remove(), 60000);
    };
    document.body.append(fr);
  }
  async _pdfShare(ev) { // 📄 iPhone/iPad = Teilen-Menü (dort Drucken per AirPrint), HA-App = kurz von Home Assistant bereitgestellt, sonst Herunterladen
    if (!ev) return;
    const m = this._billModel(this._data, ev);
    const bytes = kcBillPdf(m);
    const name = `Kegelabend-${ev.date}.pdf`;
    const file = typeof File === "function" ? new File([bytes], name, { type: "application/pdf" }) : null;
    const touch = (navigator.maxTouchPoints || 0) > 0 || /iPhone|iPad|Android/i.test(navigator.userAgent || "");
    if (this._inHaApp()) {
      try {
        let bin = "";
        for (let k = 0; k < bytes.length; k += 0x8000) bin += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
        const r = await this._hass.callWS({ type: "kegelclub/pdf/store", data: btoa(bin), name });
        window.open(this._hass?.hassUrl ? this._hass.hassUrl(r.url) : new URL(r.url, location.origin).href, "_blank");
        this._toast("📄 PDF geöffnet – dort über Teilen drucken oder sichern");
      } catch (err) { this._toast("⚠️ " + (err?.message || "PDF ging nicht")); }
      return;
    }
    if (touch && file && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file], title: m.title }); return; } catch (err) { if (err?.name === "AbortError") return; }
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    this._toast("📄 PDF gespeichert – öffnen und drucken");
  }
  _shareText(d, ev) {
    const [members, strafen] = maps(d);
    const b = billEvening(ev, members, strafen, d.settings);
    const lines = [`🎳 Kegelabend ${fmtDate(ev.date)}${ev.note ? ` – ${ev.note}` : ""}`, ""];
    const ids = this._order(d, Object.keys(b.people));
    for (const mid of ids.filter((m) => ["play", "watch"].includes(b.people[m].status))) { const p = b.people[mid]; lines.push(`${members[mid]?.name || "?"}: ${money(r2(p.fines + p.lane))}${p.status !== "play" ? ` (${STATUS[p.status]?.label})` : ""}`); }
    const away = ids.filter((m) => !["play", "watch"].includes(b.people[m].status));
    if (away.length) lines.push("", `Fehlten: ${away.map((m) => `${members[m]?.name || "?"} ${money(b.people[m].total)}`).join(", ")}`);
    lines.push("", `Strafen zusammen: ${money(r2(ids.reduce((x, m) => x + (["play", "watch"].includes(b.people[m].status) ? b.people[m].fines : 0), 0)))}`);
    if (ev.no_fines) lines.push("🙌 Strafen erlassen");
    lines.push(`🏦 Kasse jetzt: ${money(d.summary.kasse)}`);
    return lines.join("\n");
  }

  // ---------------------------------------------------------------- 🏦 Kasse
  _kasseView(d) {
    const s = d.summary;
    const hc = s.kasse < 0 ? "var(--kc-red)" : "var(--kc-green)";
    let h = `<div class="hero" style="--hc:${hc}"><div class="lbl">Kegelkasse</div><div class="big kasse" data-a="hide">${this._mv(s.kasse, "kasse")}</div></div>
      <div class="tiles"><div class="tile"><span>${ic("account-clock-outline")}Noch offen</span><b>${this._m(s.open, s.open ? "neg" : "")}</b></div>
      <div class="tile"><span>${ic("scale-balance")}Soll</span><b>${this._mv(s.soll, "soll")}</b></div>
      <div class="tile"><span>${ic("bowling")}Kegelbahn</span><b>${this._m(s.lane_total)}</b></div></div>`;
    const debtors = s.people.filter((p) => p.debt > 0.004).sort((a, b) => b.debt - a.debt);
    h += this._gh("account-cash-outline", "var(--kc-red)", "Wer schuldet was", debtors.length ? this._m(s.open, "neg") : "");
    h += debtors.length ? debtors.map((p) => this._open?.kind === "pay" && this._open.id === p.id ? this._payForm(p)
      : `<div class="item click" style="--cc:${mcol(d, p.id)}" data-a="open" data-k="pay" data-id="${esc(p.id)}" title="Antippen = Teilbetrag"><div class="n"><b data-noicon>${esc(p.name)}</b><div class="meta">${p.guest ? `<span class="tag">Gast</span>` : ""}<span class="tag">bezahlt ${money(p.paid)}</span></div></div><div class="amt">${this._m(p.debt, "neg")}</div>
        <button class="iconbtn okbtn" data-a="payall" data-id="${esc(p.id)}" title="✓ Hat alles bezahlt" aria-label="bezahlt">${ic("check-bold")}${this._lb("bezahlt")}</button></div>`).join("") : `<div class="empty">Alle haben bezahlt 🎉</div>`;
    const credit = s.people.filter((p) => p.debt < -0.004);
    if (credit.length) h += `<p class="small">Guthaben: ${credit.map((p) => `<span data-noicon>${esc(p.name)}</span> ${money(-p.debt)}`).join(" · ")}</p>`;
    // ＋ Einzahlung / − Ausgabe
    const mem = d.members.filter((m) => m.active !== false);
    h += this._gh("swap-vertical", "#1e88e5", "Buchen", "");
    h += `<div class="seg" style="margin:0 2px 6px"><button class="${this._kform === "in" ? "on" : ""}" data-a="kform" data-v="in">＋ Einzahlung</button><button class="${this._kform === "out" ? "on" : ""}" data-a="kform" data-v="out">− Ausgabe</button></div>
      <form class="edit" data-a="kadd"><div class="f">${this._kform === "in" ? `<label>Von wem?<select name="member"><option value="">– niemand (sonstige Einnahme) –</option>${mem.map((m) => `<option value="${esc(m.id)}" data-user>${esc(m.name)}</option>`).join("")}</select></label>` : ""}
        <label ${this._kform === "in" ? "" : `class="wide"`}>Wofür?<input name="name" placeholder="${this._kform === "in" ? "Einzahlung" : "z. B. Kegelfahrt, Essen"}" autocomplete="off"></label>
        <label>Betrag (${KC_MONEY.sym})<input name="amount" inputmode="decimal" autocomplete="off"></label>
        <label>Datum<input name="date" type="date" value="${todayIso()}"></label></div>
        <div class="btnrow end"><button class="btn main" type="submit">${ic("check")}Buchen</button></div></form>`;
    // 🎳 Kegelbahn: beim Abschließen aus der Kasse – als eigene Zeile (rechnet sich aus den Stunden, darum ohne ✕)
    const [mm, ss] = maps(d);
    const lanes = d.abende.filter((e) => e.closed && !e.imported).map((e) => [e, billEvening(e, mm, ss, d.settings)]).filter(([, b]) => b.lane_kasse > 0)
      .map(([e, b]) => ({ id: "lane_" + e.id, lane: true, kind: "out", amount: b.lane_kasse, name: `Kegelbahn ${fmtDate(e.date)}`, ts: new Date(e.date + "T23:00:00").getTime(), hours: e.hours }));
    const list = d.kasse.concat(lanes).sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const n = this._allK ? list.length : 25;
    h += this._gh("format-list-bulleted", "#546e7a", "Buchungen", String(list.length));
    h += list.slice(0, n).map((k) => `<div class="item" style="--cc:${k.kind === "out" ? "var(--kc-red)" : "var(--kc-green)"}"><div class="n"><b data-noicon>${esc(k.name)}</b><div class="meta"><span class="tag">${k.ts ? new Date(k.ts).toLocaleDateString(kcLoc(), { day: "2-digit", month: "2-digit", year: "2-digit" }) : ""}</span>${k.member ? `<span class="tag" data-noicon>${esc(this._name(d, k.member))}</span>` : ""}${k.waiting || this._queue.some((o) => (o.id || o.op_id) === k.id) ? `<span class="tag wait">⏳ wartet</span>` : ""}${k.imported ? `<span class="tag">Alle Neune</span>` : ""}${k.lane ? `<span class="tag">${numDe(k.hours)} Std.</span>` : ""}</div></div>
      <div class="amt">${this._m(k.kind === "out" ? -k.amount : k.amount, k.kind === "out" ? "neg" : "pos")}</div>${k.imported || k.lane ? "" : `<button class="iconbtn" data-a="kdel" data-id="${esc(k.id)}" title="Löschen">${ic("close")}${this._lb("löschen")}</button>`}</div>`).join("")
      + (list.length > n ? `<div class="btnrow"><button class="btn small" data-a="allk">${ic("chevron-down")}Alle ${list.length} zeigen</button></div>` : "")
      + (list.length ? "" : `<div class="empty">Noch keine Buchungen.</div>`);
    return h;
  }
  _payForm(p) {
    return `<form class="edit" data-a="paypart" data-id="${esc(p.id)}"><div class="f"><label class="wide"><span data-noicon>${esc(p.name)}</span> zahlt (${KC_MONEY.sym})<input name="amount" inputmode="decimal" autocomplete="off" value="${numDe(p.debt)}"></label></div>
      <div class="btnrow end"><button type="button" class="btn" data-a="cancel">${ic("close")}Abbrechen</button><button class="btn main" type="submit">${ic("check")}Einzahlen</button></div></form>`;
  }

  // ---------------------------------------------------------------- 📊 Statistik
  _statsView(d) {
    const y = this._year, st = yearStats(d, y), tab = this._statTab || "over";
    const [members, strafen] = maps(d);
    const fn = (mid) => esc(String(members[mid]?.name || "?")); // 👤 immer voller Name (es gibt mehrere Sandras)
    const ys = statYears(d);
    let h = `<div class="yearnav"><button class="iconbtn" data-a="year" data-v="-1" title="Jahr davor" ${!y ? "disabled" : ""}>${ic("chevron-left")}</button><span>${y || "Alle Jahre"}</span><button class="iconbtn" data-a="year" data-v="1" title="Jahr danach" ${!y ? "disabled" : ""}>${ic("chevron-right")}</button><button class="btn small ${y ? "" : "main"}" data-a="yearall">${ic("calendar-multiple")}${y ? "Alle Jahre" : "Ein Jahr"}</button></div>`;
    h += `<div class="seg stseg">${[["over", "view-dashboard-outline", "Überblick"], ["people", "account-group-outline", "Personen"], ["evs", "calendar-text-outline", "Abende"], ["fines", "gavel", "Strafen"]].map(([k, i, t]) => `<button data-a="stattab" data-v="${k}" class="${tab === k ? "on" : ""}">${ic(i)}${t}</button>`).join("")}</div>`;
    if (!st.evs.length) return h + `<div class="empty">${y ? `In ${y} gab es keinen Kegelabend.` : "Noch kein Kegelabend."}</div>`;
    if (tab === "people") return h + this._statPeople(d, st, members, strafen, fn);
    if (tab === "evs") return h + this._statEvs(d, st, members, fn);
    if (tab === "fines") return h + this._statFines(d, st, members, strafen, fn);
    // 📋 Zahlen + Vergleich mit dem Vorjahr
    const prev = y && ys.includes(y - 1) ? yearStats(d, y - 1) : null;
    const avg = (s) => (s.evs.length ? s.fineSum / s.evs.length : 0);
    const delta = (cur, old, isMoney) => {
      if (!prev) return "";
      const dv = r2(cur - old);
      if (!dv) return `<span class="dl">± 0 zu ${y - 1}</span>`;
      return `<span class="dl ${dv > 0 ? "up" : "down"}">${dv > 0 ? "▲" : "▼"} ${isMoney ? this._m(Math.abs(dv)) : numDe(Math.abs(dv))} zu ${y - 1}</span>`;
    };
    const kpi = (icon, label, val, cur, old, isMoney) => `<div class="tile"><span>${ic(icon)}${label}</span><b>${val}</b>${delta(cur, old, isMoney)}</div>`;
    h += this._gh("counter", "#3949ab", "Zahlen", prev ? `Vergleich mit ${y - 1}` : "");
    h += `<div class="tiles kpis">${kpi("calendar-check-outline", "Abende", String(st.evs.length), st.evs.length, prev?.evs.length, false)}${kpi("cash-multiple", "Strafen", this._m(st.fineSum), st.fineSum, prev?.fineSum, true)}${kpi("pound", "Strafen (Anzahl)", `${st.fineCnt}×`, st.fineCnt, prev?.fineCnt, false)}${kpi("division", "Ø pro Abend", this._m(r2(avg(st))), r2(avg(st)), prev ? r2(avg(prev)) : 0, true)}${kpi("account-multiple-outline", "Ø anwesend", numDe(r2(st.perEv.reduce((s, r) => s + r.here, 0) / st.evs.length)), r2(st.perEv.reduce((s, r) => s + r.here, 0) / st.evs.length), prev && prev.evs.length ? r2(prev.perEv.reduce((s, r) => s + r.here, 0) / prev.evs.length) : 0, false)}</div>`;
    // 🏆 Rekorde
    const r = st.rec, recs = [];
    if (r.evMax) recs.push(["cash-plus", "#e53935", "Teuerster Abend", `${this._m(r.evMax.sum)}`, fmtDate(r.evMax.ev.date)]);
    if (r.pMax) recs.push(["account-cash-outline", "#fb8c00", "Meiste Strafe an einem Abend", `${fn(r.pMax.top)} · ${this._m(r.pMax.topAmt)}`, fmtDate(r.pMax.ev.date)]);
    if (r.cMax && strafen[r.cMax.maxCnt.sid]) recs.push([icn(strafen[r.cMax.maxCnt.sid].icon), "#8e24aa", `Meiste „${esc(strafen[r.cMax.maxCnt.sid].name)}“ an einem Abend`, `${fn(r.cMax.maxCnt.mid)} · ${r.cMax.maxCnt.n}×`, fmtDate(r.cMax.ev.date)]);
    if (r.hereMax) recs.push(["account-group", "#00897b", "Volles Haus", `${r.hereMax.here} da`, fmtDate(r.hereMax.ev.date)]);
    if (r.streak) recs.push(["fire", "#f4511e", "Längste Serie dabei", `${fn(r.streak.mid)} · ${r.streak.n} Abende`, "ohne zu fehlen"]);
    if (recs.length) h += this._gh("trophy-outline", "#f9a825", "Rekorde", "") + `<div class="recs">${recs.map(([i, c, t, v, s]) => `<div class="tile rec" style="--rc:${c}"><span>${ic(i)}<span data-noicon>${t}</span></span><b data-noicon>${v}</b><span class="rs">${esc(s)}</span></div>`).join("")}</div>`;
    // 👑 Könige
    const kings = Object.entries(st.kings).map(([sid, per]) => { const top = Object.entries(per).sort((a, b) => b[1] - a[1])[0]; return top && top[1] > 0 && strafen[sid] ? { s: strafen[sid], mid: top[0], n: top[1] } : null; }).filter(Boolean).sort((a, b) => b.n - a.n);
    if (kings.length) h += this._gh("crown-outline", "#f9a825", "Könige", "") + `<div class="kings">${kings.map((k) => `<div class="tile"><span><ha-icon icon="${esc(k.s.icon || "mdi:bowling")}"></ha-icon><span data-noicon>${esc(k.s.name)}</span></span><b data-noicon>${fn(k.mid)} · ${k.n}×</b></div>`).join("")}</div>`;
    // 📈 Kasse
    if (st.line.length > 1) {
      const vals = st.line.map((x) => x[1]), mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1, n = st.line.length;
      const W = 320, H = 90, px = (j) => (y ? (st.line[j][0] / 11) : j / Math.max(1, n - 1)) * (W - 20) + 10, py = (v) => H - 10 - ((v - mn) / span) * (H - 24);
      const lbl = (x) => (y ? (KC_LANG === "en" ? MONTHS_EN : MONTHS)[x] : String(x));
      h += this._gh("chart-line", "#43a047", y ? "Kasse übers Jahr" : "Kasse über die Jahre", this._m(vals[vals.length - 1])) + `<svg viewBox="0 0 ${W} ${H + 14}" style="width:100%;height:auto;margin:4px 0"><polyline fill="none" stroke="#43a047" stroke-width="3" stroke-linejoin="round" points="${st.line.map(([, v], j) => `${px(j).toFixed(1)},${py(v).toFixed(1)}`).join(" ")}"/>${st.line.map(([, v], j) => `<circle cx="${px(j).toFixed(1)}" cy="${py(v).toFixed(1)}" r="3" fill="#43a047"/>`).join("")}${st.line.map(([x], j) => `<text x="${px(j).toFixed(1)}" y="${H + 10}" font-size="9" text-anchor="middle" fill="currentColor" opacity=".6">${lbl(x)}</text>`).join("")}</svg>`;
    }
    return h;
  }
  // 👤 Personen: Säulen, Anwesenheit, antippen = Einzelansicht
  _statPeople(d, st, members, strafen, fn) {
    const sel = this._statP && (this._statP in st.perPerson || this._statP in st.attend) ? this._statP : null;
    if (sel) return this._statPerson(d, st, sel, members, strafen);
    let h = "";
    const pp = this._order(d, Object.keys(st.perPerson).filter((m) => st.perPerson[m] > 0)).sort((a, b) => st.perPerson[b] - st.perPerson[a]).slice(0, 20);
    if (pp.length) {
      const max = Math.max(...pp.map((m) => st.perPerson[m]), 1);
      h += this._gh("chart-bar", "#1e88e5", `Strafen pro Person (${KC_MONEY.sym})`, "antippen = Details") + pp.map((mid) => `<div class="hbar click" data-a="statp" data-id="${esc(mid)}"><span>${this._avatar(d, mid, 20)}<span data-noicon>${fn(mid)}</span></span><i style="width:${Math.max(3, (st.perPerson[mid] / max) * 100).toFixed(0)}%;--bc:${mcol(d, mid)}"></i><b>${r2(st.perPerson[mid]).toFixed(2).replace(".", ",")}</b></div>`).join("");
    }
    const ids = this._order(d, [...new Set([...Object.keys(st.attend), ...Object.keys(st.perPerson)])]);
    h += this._gh("account-check-outline", "#00897b", "Alle Personen", "antippen = Details") + `<table class="sttab"><tr><th></th><th>da</th><th>Strafen</th><th>Ø</th></tr>${ids.map((mid) => { const a = st.attend[mid] || 0; return `<tr class="click" data-a="statp" data-id="${esc(mid)}"><td data-noicon>${this._avatar(d, mid, 22) || `<i class="dot" style="background:${mcol(d, mid)}"></i>`}${esc(members[mid]?.name || "?")}</td><td>${a} / ${st.evs.length}</td><td>${this._m(r2(st.perPerson[mid] || 0))}</td><td>${a ? this._m(r2((st.perPerson[mid] || 0) / a)) : "–"}</td></tr>`; }).join("")}</table>`;
    return h;
  }
  _statPerson(d, st, mid, members, strafen) {
    const m = members[mid] || {}, a = st.attend[mid] || 0, sum = r2(st.perPerson[mid] || 0);
    let h = `<div class="btnrow"><button class="btn small" data-a="statp" data-id="">${ic("arrow-left")}Alle Personen</button></div>`;
    h += `<div class="hero" style="--hc:${mcol(d, mid)}">${m.photo ? `<img class="phhero" src="${esc(m.photo)}" alt="">` : ""}<div class="lbl" data-noicon>${esc(m.name || "?")}${m.guest ? " · Gast" : ""}</div><div class="big" style="font-size:1.9em">${this._m(sum)}</div><div class="small">Strafen ${this._year || "gesamt"}</div></div>`;
    const best = st.best[mid];
    h += `<div class="tiles kpis"><div class="tile"><span>${ic("calendar-check-outline")}Dabei</span><b>${a} / ${st.evs.length}</b></div><div class="tile"><span>${ic("division")}Ø pro Abend</span><b>${a ? this._m(r2(sum / a)) : "–"}</b></div><div class="tile"><span>${ic("fire")}Längste Serie</span><b>${st.streak[mid] || 0} Abende</b></div>${best && best.amt > 0 ? `<div class="tile"><span>${ic("arrow-up-bold-outline")}Teuerster Abend</span><b>${this._m(best.amt)}</b><span class="rs">${esc(fmtDate(best.ev.date))}</span></div>` : ""}</div>`;
    // Strafen nach Art
    const kinds = Object.entries(st.kings).map(([sid, per]) => [sid, per[mid] || 0]).filter(([sid, n]) => n > 0 && strafen[sid]).sort((x, z) => z[1] - x[1]);
    if (kinds.length) {
      const mx = Math.max(...kinds.map((k) => k[1]));
      h += this._gh("gavel", "#e53935", "Welche Strafen?", "") + kinds.map(([sid, n]) => `<div class="hbar"><span><ha-icon icon="${esc(strafen[sid].icon || "mdi:bowling")}"></ha-icon><span data-noicon>${esc(strafen[sid].name)}</span></span><i style="width:${Math.max(4, (n / mx) * 100).toFixed(0)}%;--bc:${mcol(d, mid)}"></i><b>${n}×</b></div>`).join("");
    }
    // Verlauf je Abend
    const rows = st.perEv.filter((r) => mid in r.per);
    if (rows.length) {
      const mx = Math.max(...rows.map((r) => r.per[mid]), 0.01);
      h += this._gh("chart-timeline-variant", "#1e88e5", "Abend für Abend", "") + `<div class="minibars">${rows.map((r) => `<i title="${esc(fmtDate(r.ev.date))}: ${esc(money(r.per[mid]))}" style="height:${Math.max(2, (r.per[mid] / mx) * 60).toFixed(0)}px;--bc:${mcol(d, mid)}"></i>`).join("")}</div>`;
      h += `<table class="sttab">${rows.slice().reverse().slice(0, 30).map((r) => { const s = (d.abende.find((e) => e.id === r.ev.id)?.status || {})[mid] || "play"; return `<tr><td>${esc(fmtDate(r.ev.date))}</td><td>${esc(STATUS[s]?.label || "")}</td><td>${this._m(r.per[mid])}</td></tr>`; }).join("")}</table>`;
    }
    return h;
  }
  // 📅 Tabelle je Abend
  _statEvs(d, st, members, fn) {
    const rows = st.perEv.slice().reverse();
    const mx = Math.max(...rows.map((r) => r.sum), 0.01);
    return this._gh("calendar-text-outline", "#546e7a", "Abend für Abend", `${rows.length}`) + `<table class="sttab"><tr><th>Datum</th><th>da</th><th>Strafen</th><th>Meiste</th></tr>${rows.map((r) => `<tr class="click" data-a="evopen" data-id="${esc(r.ev.id)}"><td>${esc(fmtDate(r.ev.date, { day: "2-digit", month: "2-digit", year: "2-digit" }))}${r.ev.no_fines ? " 🙌" : ""}</td><td>${r.here}</td><td><span class="cellbar"><i style="width:${((r.sum / mx) * 100).toFixed(0)}%"></i>${this._m(r.sum)}</span></td><td data-noicon>${r.top && r.topAmt > 0 ? `${fn(r.top)} ${this._m(r.topAmt)}` : "–"}</td></tr>`).join("")}</table>`;
  }
  // 🧮 Strafen: Kuchen + Matrix
  _statFines(d, st, members, strafen, fn) {
    let h = "";
    const pt = Object.entries(st.perType).filter(([sid, n]) => n > 0 && strafen[sid]).sort((a, b) => b[1] - a[1]);
    if (pt.length) {
      const tot = pt.reduce((s, x) => s + x[1], 0);
      let acc = 0;
      const grad = pt.map(([, n], i) => { const a0 = acc; acc += (n / tot) * 100; return `${PIE[i % PIE.length]} ${a0.toFixed(2)}% ${acc.toFixed(2)}%`; }).join(",");
      h += this._gh("chart-pie", "#fb8c00", "Strafen nach Art", `${tot}×`) + `<div class="pie"><div class="disc" style="background:conic-gradient(${grad})"></div><div class="lg">${pt.map(([sid, n], i) => `<div><i style="background:${PIE[i % PIE.length]}"></i><span data-noicon>${esc(strafen[sid].name)}</span> ${n}× · ${Math.round((n / tot) * 100)} %</div>`).join("")}</div></div>`;
      const ids = this._order(d, Object.keys(st.attend).filter((mid) => pt.some(([sid]) => (st.kings[sid] || {})[mid])));
      if (ids.length) {
        const mx = Math.max(...ids.flatMap((mid) => pt.map(([sid]) => (st.kings[sid] || {})[mid] || 0)), 1);
        h += this._gh("table-large", "#8e24aa", "Wer hat was?", "Anzahl") + `<div class="mxwrap"><table class="matrix"><tr><th></th>${pt.map(([sid]) => `<th title="${esc(strafen[sid].name)}"><ha-icon icon="${esc(strafen[sid].icon || "mdi:bowling")}"></ha-icon><small data-noicon>${esc(strafen[sid].name)}</small></th>`).join("")}</tr>${ids.map((mid) => `<tr><td data-noicon>${fn(mid)}</td>${pt.map(([sid]) => { const n = (st.kings[sid] || {})[mid] || 0; return `<td style="--a:${n ? (0.12 + (n / mx) * 0.6).toFixed(2) : 0}">${n || ""}</td>`; }).join("")}</tr>`).join("")}</table></div><p class="small">Je dunkler das Feld, desto öfter. Zu breit? Einfach seitlich wischen.</p>`;
      }
    } else h += `<div class="empty">Keine Strafen gezählt.</div>`;
    return h;
  }

  // ---------------------------------------------------------------- 👥 Mitglieder & Strafen
  _editView(d) {
    const row = (kind, it, meta, sortable) => this._open?.kind === kind && this._open.id === it.id ? this._form(d, kind, it)
      : `<div class="item click ${it.active === false ? "done" : ""}" data-a="open" data-k="${kind}" data-id="${esc(it.id)}" ${sortable ? `data-row="${esc(it.id)}"` : ""} ${kind === "member" ? `style="--cc:${mcol(d, it.id)}"` : ""}>${sortable ? `<span class="grip" data-grip="${kind}" title="Ziehen zum Verschieben">${ic("drag")}</span>` : ""}${kind === "strafe" ? `<ha-icon icon="${esc(it.icon || "mdi:bowling")}" style="color:#fb8c00"></ha-icon>` : this._avatar(d, it.id, 32)}<div class="n"><b data-noicon>${esc(it.name)}</b>${meta.length ? `<div class="meta">${meta.map((x) => `<span class="tag">${x}</span>`).join("")}</div>` : ""}</div>${kind === "strafe" ? `<div class="amt">${money(it.amount)}</div>` : ""}<span class="iconbtn">${ic("pencil-outline")}</span></div>`;
    const head = (kind, icon, color, title, extra = "") => this._gh(icon, color, title, `${extra}<button class="btn small" data-a="new" data-k="${kind}">${ic("plus")}Neu</button>`) + (this._open?.kind === kind && this._open.id === "new" ? this._form(d, kind, {}) : "");
    const act = d.members.filter((m) => !m.guest && m.active !== false), guests = d.members.filter((m) => m.guest && m.active !== false), left = d.members.filter((m) => m.active === false);
    let h = head("member", "account-group-outline", "#1e88e5", "Mitglieder", "");
    h += act.length ? `<div class="olist" data-list="member">${act.map((m) => row("member", m, m.note ? [esc(m.note)] : [], true)).join("")}</div>` : `<div class="empty">Noch keine Mitglieder.</div>`;
    if (guests.length) h += `<div class="gsub">Gäste</div>` + guests.map((m) => row("member", m, ["Gast"], false)).join("");
    if (left.length) h += `<div class="gsub">Ehemalige / ausgeblendet</div>` + left.map((m) => row("member", m, [m.guest ? "Gast" : "ehemalig"], false)).join("");
    const fines = d.strafen.filter((s) => s.active !== false), off = d.strafen.filter((s) => s.active === false);
    h += head("strafe", "gavel", "#e53935", "Strafen (Sündenregister)");
    h += fines.length ? `<div class="olist" data-list="strafe">${fines.map((s) => row("strafe", s, [s.payer === "others" ? "alle anderen zahlen" : "zahlt er selbst"], true)).join("")}</div>` : `<div class="empty">Noch keine Strafen.<div class="btnrow" style="justify-content:center"><button class="btn small" data-a="template">${ic("clipboard-list-outline")}Beispiel-Strafen laden</button></div></div>`;
    if (off.length) h += `<div class="gsub">Ausgeblendet</div>` + off.map((s) => row("strafe", s, ["aus"], false)).join("");
    h += `<p class="small">⠿ Am Griff vorne ziehen = Reihenfolge ändern (so stehen sie auch am Kegelabend). Wer schon bei Abenden dabei war, wird beim Löschen nur ausgeblendet – sonst stimmt die Kasse nicht mehr.</p>`;
    return h;
  }
  _form(d, kind, it) {
    const isNew = !it.id;
    const f = [`<label class="wide">Name<input name="name" value="${esc(it.name || "")}" required autocomplete="off"></label>`];
    if (kind === "member") {
      const ph = it.photo || "";
      f.push(`<div class="wide phrow"><span class="phprev">${ph ? `<img src="${esc(ph)}" alt="">` : ic("account-outline")}</span><label class="btn small">${ic("camera-outline")}Foto<input type="file" data-a="photofile" accept="image/*" hidden></label><button type="button" class="btn small" data-a="photodel" ${ph ? "" : "hidden"}>${ic("delete-outline")}Foto weg</button><input type="hidden" name="photo" value="${esc(ph)}"></div>`);
      f.push(`<label class="wide">Notiz<input name="note" value="${esc(it.note || "")}" placeholder="z. B. Kassenwart"></label>`);
      f.push(`<label class="wide" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" class="swchk" name="guest" ${it.guest ? "checked" : ""}> Gast (kein Mitglied)</label>`);
    } else {
      f.push(`<label>Betrag (${KC_MONEY.sym})<input name="amount" inputmode="decimal" value="${it.amount != null ? numDe(it.amount) : ""}"></label>`);
      const payer = it.payer || "self";
      f.push(`<label class="wide">Wer zahlt?<div class="seg"><button type="button" data-a="payer" data-v="self" class="${payer === "self" ? "on" : ""}">Er selbst</button><button type="button" data-a="payer" data-v="others" class="${payer === "others" ? "on" : ""}">Alle anderen, die mitkegeln</button></div><input type="hidden" name="payer" value="${payer}"></label>`);
      const cur = icn(it.icon);
      f.push(`<label class="wide">Symbol<div class="iconpick">${KC_ICONS.map((x) => `<button type="button" data-a="icon" data-v="${x}" class="${x === cur ? "on" : ""}" title="${x}">${ic(x)}</button>`).join("")}</div><input type="hidden" name="icon" value="mdi:${cur}"></label>`);
    }
    if (!isNew) f.push(`<label class="wide" style="flex-direction:row;align-items:center;gap:8px"><input type="checkbox" class="swchk" name="active" ${it.active === false ? "" : "checked"}> ${kind === "member" ? "aktiv (aus = ehemalig, ausgeblendet)" : "aktiv (aus = ausgeblendet)"}</label>`);
    return `<form class="edit" data-a="save" data-k="${kind}" data-id="${esc(it.id || "")}"><div class="f">${f.join("")}</div>
      <div class="btnrow end">${isNew ? "" : `<button type="button" class="btn" data-a="del" data-k="${kind}" data-id="${esc(it.id)}">${ic("delete-outline")}Löschen</button>`}
      <button type="button" class="btn" data-a="cancel">${ic("close")}Abbrechen</button><button class="btn main" type="submit">${ic("check")}Speichern</button></div></form>`;
  }
  _removeWithUndo(kind, id, label) {
    const d = this._data, key = kind === "kasse" ? "kasse" : kind === "abend" ? "abende" : KIND[kind];
    const idx = d[key].findIndex((x) => x.id === id);
    if (idx < 0) return;
    const item = JSON.parse(JSON.stringify(d[key][idx]));
    delete item.waiting;
    clearTimeout(this._undoT);
    this._undo = { label: `${label}${item.name ? `: „${item.name}“` : ""}`, op: { type: "restore", kind, item, index: idx } };
    this._undoT = setTimeout(() => { this._undo = null; this._force = true; this._render(); }, 8000);
    this._send({ type: kind === "kasse" ? "kasse_delete" : kind === "abend" ? "abend_delete" : `${kind}_delete`, id });
  }
  _sendOrder(listEl) {
    const kind = listEl.dataset.list, ids = [];
    for (const el of listEl.children) if (el.dataset.row) ids.push(el.dataset.row);
    const d = this._data, rest = d[KIND[kind]].filter((x) => !ids.includes(x.id)).map((x) => x.id);
    this._send({ type: "order", kind, ids: [...ids, ...rest] });
  }
  _startDrag(grip, ev) {
    const row = grip.closest("[data-row]"), list = row?.parentElement;
    if (!row || !list) return;
    ev.preventDefault(); ev.stopPropagation();
    this._dragging = true;
    row.classList.add("drag");
    const before = [...list.children].map((x) => x.dataset.row || "-").join();
    const move = (e) => {
      const y = e.clientY;
      const others = [...list.children].filter((x) => x !== row && x.dataset.row);
      let target = null;
      for (const o of others) { const r = o.getBoundingClientRect(); if (y < r.top + r.height / 2) { target = o; break; } }
      if (target) { if (target !== row.nextElementSibling) list.insertBefore(row, target); }
      else if (row !== list.lastElementChild) list.appendChild(row);
    };
    const up = () => {
      window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up);
      row.classList.remove("drag");
      this._dragging = false; this._dragEnd = Date.now();
      const after = [...list.children].map((x) => x.dataset.row || "-").join();
      if (after !== before) this._sendOrder(list); else if (this._pending) { this._pending = false; this._force = true; this._render(); }
    };
    window.addEventListener("pointermove", move); window.addEventListener("pointerup", up); window.addEventListener("pointercancel", up);
  }

  // ---------------------------------------------------------------- 📖 Anleitung, Neuigkeiten, Credits
  _guideView() {
    const sec = (emo, title, sub, body) => `<details class="elg-sec"><summary><span class="elg-ic">${emo}</span><span class="elg-tt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span></summary><div>${body}</div></details>`;
    return `<div class="elg"><h2>🎳 So funktioniert der Kegelclub</h2>
      <p class="elg-sub">Tipp auf eine Überschrift klappt sie auf. Diese Anleitung findest du immer über den Knopf <b>📖 Anleitung</b> ganz unten unter der Karte.</p>
      <input type="search" class="elg-q" placeholder="🔎 In dieser Anleitung suchen, z. B. Gast" aria-label="In dieser Anleitung suchen" autocomplete="off" enterkeyhint="search"><p class="elg-none" hidden>Nichts gefunden 🤷 – versuch ein anderes Wort.</p>
      ${sec("🆕", "Was ist neu", "die letzten Neuerungen", this._newsHtml())}
      ${KC_GUIDE.map((g, i) => sec(GUIDE_EMO[i] || "📌", g.title, GUIDE_SUB[i] || "", g.text)).join("")}
      ${sec("🙏", "Credits", "wer das gemacht hat", this._creditsHtml())}</div>`;
  }
  _newsHtml() {
    if (KC_LANG === "en") return `<div class="betabox" translate="no"><b>${/-beta/.test(KC_VERSION) ? "🧪 You are on beta" : "Version"} ${KC_VERSION}</b><p class="small" style="margin:4px 0 2px">The release notes are written in German. You find them on <a href="${REPO}/releases" target="_blank" rel="noopener">GitHub → Releases</a>.</p></div>`;
    const li = (t) => `<ul>${t.split(" · ").map((x) => `<li>${x}</li>`).join("")}</ul>`;
    const cur = KC_NEWS.find((n) => n[0] === KC_VERSION);
    const beta = /-beta/.test(KC_VERSION) && cur ? `<div class="betabox"><b>🧪 Du bist in der Beta ${KC_VERSION}</b><p class="small" style="margin:4px 0 2px">Neu in dieser Beta:</p>${li(cur[1])}</div>` : "";
    return `${beta}<p class="small">Das Neueste steht oben.</p>${KC_NEWS.filter((n) => n !== cur).map((n) => `<p style="margin:10px 0 0"><b>v${n[0]}</b></p>${li(n[1])}`).join("")}`;
  }
  // 🙏 Credits – genau wie bei der Einkaufsliste (Logo, Version, Knöpfe, PayPal), in ⚙️ und in der Anleitung
  _creditsHtml() {
    const t = (de, en) => (KC_LANG === "en" ? en : de);
    return `<div class="elcredits" translate="no">
      <div class="ellogo"><img src="/kegelclub/files/mister-m.webp?v=${KC_VERSION}" alt="Mister-M" loading="lazy"></div>
      <p class="elcv"><b>Kegelclub</b> v${KC_VERSION}</p>
      <p>${t("Gemacht von <b>Mister-M</b> – mit Hilfe von Claude 🤖", "Made by <b>Mister-M</b> – with help from Claude 🤖")}</p>
      <p>${t("Ich versuche, Updates und Fehler-Korrekturen zeitnah zu erledigen.", "I try to ship updates and fixes promptly.")}</p>
      <p class="elcsmall">📅 ${t("Neue offizielle Versionen kommen immer sonntags. An den anderen Tagen gibt es nur Test-Versionen (Beta) – die siehst du in HACS unter „Beta-Versionen anzeigen“.", "New official versions always come out on Sundays. On the other days there are only test versions (beta) – you see them in HACS under “Show beta versions”.")}</p>
      <div class="elcbtns">
        <a class="elcbtn" href="${REPO}" target="_blank" rel="noopener">🐙 GitHub</a>
        <a class="elcbtn" href="${REPO}/discussions" target="_blank" rel="noopener">💡 ${t("Idee oder Wunsch", "Idea or request")}</a>
        <a class="elcbtn" href="${REPO}/issues" target="_blank" rel="noopener">🐞 ${t("Fehler melden", "Report a bug")}</a>
        <a class="elcbtn pp" href="${PAYPAL}" target="_blank" rel="noopener"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7.5-4.6-9.6-9.2C1 8.6 2.7 5 6.2 5c2 0 3.5 1.1 5.8 3.4C14.3 6.1 15.8 5 17.8 5c3.5 0 5.2 3.6 3.8 6.8C19.5 16.4 12 21 12 21z" fill="#fff"/></svg><span>${t("Spenden mit PayPal", "Donate with PayPal")}</span></a>
      </div>
      <p class="elcsmall">${t("Der Kegelclub ist und bleibt kostenlos. Wenn er dir gefällt, freue ich mich über eine kleine Spende – ganz freiwillig, die nächste Runde geht auf dich 🍻. Beim Antippen öffnet sich PayPal im Browser; vorher geht nichts ins Internet.", "Kegelclub is and stays free. If you like it, I would be happy about a small donation – completely voluntary, the next round is on you 🍻. Tapping opens PayPal in your browser; nothing goes to the internet before that.")}</p>
      <p>🔒 ${t("Alle Daten bleiben in deinem Home Assistant. Keine Cloud, kein Tracking – ins Internet geht nichts. Mehr unter ⚙️ → Datenschutz.", "All data stays in your Home Assistant. No cloud, no tracking – nothing goes to the internet. More under ⚙️ → Privacy.")}</p>
      <p class="elcsmall">${t("Nicht verbunden mit der App „Alle Neune“ – der Import liest nur deren Export-Datei. · Symbole: Material Design Icons (Pictogrammers) · Lizenz: MIT", "Not affiliated with the “Alle Neune” app – the import only reads its export file. · Icons: Material Design Icons (Pictogrammers) · License: MIT")}</p>
    </div>`;
  }

  // ---------------------------------------------------------------- 🔢 PIN
  _padPage(d) {
    const p = this._pad;
    const what = this._view === "set" ? "⚙️ Einstellungen" : "Mitglieder";
    const t = {
      unlock: ["PIN eingeben", this._lockAll ? "Der Kegelclub ist gesperrt. Mit der PIN geht's weiter." : `Für <b>${what}</b> brauchst du die PIN. Strafen buchen geht auch ohne.`],
      old: ["Alte PIN", p.purpose === "off" ? "Zum Ausschalten erst die jetzige PIN eintippen." : "Erst die jetzige PIN eintippen."],
      new: ["Neue PIN", "4 bis 8 Ziffern, dann ✔."],
      new2: ["Neue PIN nochmal", "Zur Sicherheit noch einmal dieselbe PIN."],
    }[p.step];
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⌫", "0", "✔"];
    return { icon: "lock-outline", color: "#f4511e", title: t[0], html: `<div class="pinpad"><p class="small">${t[1]}</p>
      <div class="pdots">${p.buf ? "●".repeat(p.buf.length) : "&nbsp;"}</div>
      <div class="ppad">${keys.map((k) => `<button type="button" class="btn ${k === "✔" ? "primary" : ""}" data-a="pkey" data-v="${k}" aria-label="${k === "⌫" ? "Löschen" : k === "✔" ? "OK" : k}">${k}</button>`).join("")}</div>
      ${this._lockAll ? "" : `<button type="button" class="btn pcancel" data-a="back">Abbrechen</button>`}
      ${p.step === "unlock" ? `<p class="small" style="margin-top:16px">PIN vergessen? Ein Admin geht in Home Assistant auf <b>Einstellungen → Geräte & Dienste → Kegelclub → Konfigurieren</b> und hakt <b>„PIN zurücksetzen“</b> an.</p>` : ""}</div>` };
  }
  _padPress(k) {
    const p = this._pad;
    if (!p) return;
    try { navigator.vibrate?.(12); } catch (_) { /* egal */ }
    if (k === "⌫") p.buf = p.buf.slice(0, -1);
    else if (k === "✔") { if (p.buf.length >= 4) this._padNext(); else this._toast("Die PIN hat 4 bis 8 Ziffern"); }
    else if (/^\d$/.test(k) && p.buf.length < 8) p.buf += k;
    this._force = true; this._render();
  }
  _padNext() {
    const p = this._pad, v = p.buf;
    p.buf = "";
    const redraw = () => { this._force = true; this._render(); };
    const restart = () => { if (this._pad === p) { p.step = p.purpose === "unlock" ? "unlock" : this._data?.pin ? "old" : "new"; p.buf = ""; } redraw(); };
    const setPin = (pin) => this._pin("kegelclub/pin/set", { pin, old: p.old || null }).then((r) => {
      if (!r) { restart(); return; }
      PIN_LOCK.until = pin ? Date.now() + 10 * 60 * 1000 : 0;
      this._toast(pin ? "🔒 PIN gespeichert" : "🔓 PIN ist aus");
      this._pad = null; redraw();
    });
    if (p.step === "unlock") {
      this._pin("kegelclub/pin/check", { pin: v }).then((r) => {
        if (r?.ok) { PIN_LOCK.until = Date.now() + 10 * 60 * 1000; this._pad = null; this._toast("🔓 Entsperrt"); }
        else if (r) this._toast("❌ Falsche PIN");
        redraw();
      });
    } else if (p.step === "old") { p.old = v; if (p.purpose === "off") setPin(null); else p.step = "new"; }
    else if (p.step === "new") { p.neu = v; p.step = "new2"; }
    else if (p.step === "new2") { if (v === p.neu) setPin(v); else { this._toast("Die zwei PINs sind nicht gleich – bitte nochmal"); p.step = "new"; } }
  }
  _pinSetHtml(d) {
    return `<p class="small">${d.pin ? "🔒 PIN ist <b>an</b>. ⚙️ fragt nach der PIN." : "Mit einer PIN (4–8 Ziffern) sperrst du ⚙️ (auch Mitglieder & Strafen), z. B. auf dem Tablet am Kegeltisch. Strafen buchen und die Kasse ansehen gehen weiter ohne PIN."}</p>
      <div class="btnrow">${d.pin ? `<button class="btn main" data-a="padstart" data-v="set">${ic("lock-reset")}PIN ändern</button><button class="btn" data-a="padstart" data-v="off">${ic("lock-open-variant-outline")}PIN ausschalten</button>` : `<button class="btn main" data-a="padstart" data-v="set">${ic("lock-outline")}PIN einschalten</button>`}</div>
      ${d.pin ? `<label class="switch"><span>${ic("lock-outline")}<span class="vt"><b>Ganze Karte sperren</b><small>Aus = nur ⚙️ und Mitglieder. An = ohne PIN sieht man gar nichts.</small></span></span><input type="checkbox" class="swchk" data-a="set" data-v="lock_all" ${d.settings.lock_all ? "checked" : ""}></label>` : ""}
      <p class="small">Die PIN liegt nur als Prüfsumme in Home Assistant. Vergessen? Admin → <b>Geräte & Dienste → Kegelclub → Konfigurieren → „PIN zurücksetzen“</b>. 5× falsch = 1 Minute Pause.</p>`;
  }
  async _pin(type, payload) {
    if (this._hass?.connected === false) { this._toast("📴 Die PIN wird in Home Assistant geprüft – dafür braucht es Netz"); return null; }
    try { return await this._hass.callWS({ type, ...payload, ...this._bk() }); }
    catch (err) { this._toast("⚠️ " + (err?.message || "Ging nicht")); return null; }
  }

  // ---------------------------------------------------------------- ⚙️ Einstellungen (wie bei der Einkaufsliste)
  _sw(key, icon, title, sub, on) { return `<label class="switch"><span>${ic(icon)}<span class="vt"><b>${title}</b>${sub ? `<small>${sub}</small>` : ""}</span></span><input type="checkbox" class="swchk" data-a="set" data-v="${key}" ${on ? "checked" : ""}></label>`; }
  _num(key, icon, title, val, unit) { return `<div class="switch"><span>${ic(icon)}${title}</span><span><input data-a="setnum" data-v="${key}" inputmode="decimal" value="${numDe(val ?? 0)}" style="width:90px;text-align:right"> ${unit}</span></div>`; }
  _sheets(d) {
    const st = d.settings, admin = this._hass?.user?.is_admin !== false;
    const lane = { kasse: "aus der Kasse", split: "aufgeteilt", off: "nicht erfasst" }[st.lane_mode] || "";
    return {
      club: { icon: "account-group-outline", color: "#1e88e5", title: "Mitglieder & Strafen", info: `${d.members.filter((m) => m.active !== false && !m.guest).length} Mitglieder · ${d.strafen.filter((s) => s.active !== false).length} Strafen`, html: () => this._editView(d) },
      rules: { icon: "cash-multiple", color: "#43a047", title: "Regeln & Beträge", info: `${money(st.base_fee)} pro Person · Bahn ${lane}`, html: () => `
        <p class="small">Gilt ab sofort und auch für den laufenden Abend. Abgeschlossene Abende bleiben, wie sie waren.</p>
        ${this._num("base_fee", "cash", "Grundbetrag pro Person und Abend", st.base_fee, KC_MONEY.sym)}
        ${this._sw("watch_pays", "glass-mug-variant", "Zuschauer zahlen den Grundbetrag", "da, kegelt aber nicht", st.watch_pays !== false)}
        ${this._sw("missing_pays", "account-cancel-outline", "Fehlende Mitglieder zahlen den Grundbetrag", "abgemeldet oder nicht – Gäste nie", st.missing_pays !== false)}
        ${this._num("unexcused_extra", "account-alert-outline", "Extra, wenn nicht abgemeldet", st.unexcused_extra, KC_MONEY.sym)}
        <div class="switch"><span>${ic("bowling")}Kegelbahn</span><span class="seg">${[["kasse", "aus der Kasse"], ["split", "aufteilen"], ["off", "aus"]].map(([v, t]) => `<button class="${st.lane_mode === v ? "on" : ""}" data-a="lane" data-v="${v}">${t}</button>`).join("")}</span></div>
        ${st.lane_mode === "off" ? "" : this._num("lane_rate", "timer-outline", "Kegelbahn pro Stunde", st.lane_rate, KC_MONEY.sym) + this._num("lane_hours", "timer-sand", "Stunden-Vorschlag für neue Abende", st.lane_hours, "Std.")}
        ${this._num("start_balance", "piggy-bank-outline", "Kassenstand am Anfang", st.start_balance, KC_MONEY.sym)}
        <div class="switch"><span>${ic("cash-multiple")}Währung</span><select data-a="setcur" style="width:auto;max-width:60%">${Object.entries(KC_CUR).map(([c, n]) => `<option value="${c}" ${(st.currency || "EUR") === c ? "selected" : ""}>${n}</option>`).join("")}</select></div>
        <p class="small">Die Währung ändert nur Zeichen und Schreibweise – es wird <b>nichts umgerechnet</b>.</p>` },
      imp: { icon: "database-import-outline", color: "#1e88e5", title: "Import & Sicherung", info: admin ? "Alle Neune, Sicherung, CSV" : "nur Admins", html: () => admin ? this._importHtml(d) : `<p class="small">Nur für Admins.</p>` },
      app: { icon: "cellphone-arrow-down", color: "#3949ab", title: "Offline-App", info: "auch ohne Netz auf der Bahn", html: () => `
        <p class="small">Eine eigene kleine App nur für den Kegelclub. Sie öffnet sich auch <b>ohne Netz</b>, zeigt den letzten Stand, lässt dich Strafen buchen und schickt alles nach, sobald wieder Netz da ist.</p>
        <ol class="small steps"><li>Auf dem Handy im <b>Browser</b> (Chrome oder Safari, nicht in der HA-App) die Adresse unten öffnen.</li><li>Einmal mit deinem Home-Assistant-Benutzer <b>anmelden</b>.</li><li>Im Browser-Menü <b>„Zum Startbildschirm hinzufügen“</b> – fertig, eigenes 🎳-Symbol.</li></ol>
        <p class="small">Unten in der App: <b>„👆 Fingerabdruck-Sperre“</b>. <b>Abmelden</b> meldet nur das Handy ab – in Home Assistant bleibt alles. Es braucht eine <b>https</b>-Adresse (z. B. Nabu Casa).</p>
        ${d.app_url ? `<p class="small"><b>Deine Adresse für die App:</b></p><input id="appUrl" readonly value="${esc(d.app_url)}" translate="no"><div class="btnrow"><button class="btn main" data-a="appcopy">${ic("content-copy")}Kopieren</button></div>`
        : `<p class="small">⚠️ Home Assistant kennt keine https-Adresse für unterwegs. Mit <b>Nabu Casa</b> oder einer eigenen https-Adresse klappt es. Zu Hause geht auch: <code>${esc(location.origin)}/kegelclub/app/</code></p>`}` },
      pin: { icon: d.pin ? "lock-outline" : "lock-open-variant-outline", color: "#f4511e", title: "Schutz", info: d.pin ? "PIN ist an" : "PIN fürs Zahnrad", html: () => this._pinSetHtml(d) },
      privacy: { icon: "shield-lock-outline", color: "#455a64", title: "Datenschutz", info: "alles lokal", html: () => `<p class="small">🔒 Namen, Strafen und Kasse bleiben in <b>deinem</b> Home Assistant. Keine Cloud, kein Tracking, nichts geht ins Internet. In der Offline-App liegt zusätzlich eine Kopie im Handy, bis du dich abmeldest.</p>` },
      factory: { icon: "nuke", color: "#b71c1c", title: "Werkseinstellungen", info: admin ? "alles zurücksetzen" : "nur Admins", html: () => admin ? `
        <p><b>💣 Werkseinstellungen</b><br>Löscht <b>wirklich alles</b>: Mitglieder, Gäste, Strafen, alle Abende, die ganze Kasse und alle Schalter. Nur die <b>PIN</b> bleibt. <b>Das geht nicht rückgängig</b> – vorher unter „Import &amp; Sicherung“ → „Sicherung speichern“.</p>
        <div class="btnrow"><button class="btn danger" data-a="factory">${ic("nuke")}Werkseinstellungen – alles löschen</button></div>` : `<p class="small">💣 Werkseinstellungen gibt es nur für Admins.</p>` },
      log: { icon: "history", color: "#5e35b1", title: "Verlauf", info: st.log_on === false ? "aus" : `${(d.log || []).length} Einträge · wer, wann, was`, html: () => this._logHtml(d, admin) },
      view: { icon: "eye-outline", color: "#00897b", title: "Ansicht – für alle", info: (() => { const n = KC_VIEW.filter(([k]) => (st.view || {})[k] === false).length; return n ? `${n} ausgeblendet` : "alles sichtbar"; })(), html: () => `
        <p class="small">Gilt für <b>alle</b> – auf allen Handys, im Dashboard und in der App.</p>
        ${this._sw("veil", "eye-off-outline", "Kassenstand verschleiern", "PC: Maus drüber · Handy: antippen = 4 Sekunden sichtbar", !!st.veil)}
        ${KC_VIEW.map(([k, i, t, sub]) => `<label class="switch"><span>${ic(i)}<span class="vt"><b>${t}</b><small>${sub}</small></span></span><input type="checkbox" class="swchk" data-a="setview" data-v="${k}" ${(st.view || {})[k] !== false ? "checked" : ""}></label>`).join("")}` },
      labels: { icon: "format-text", color: "#546e7a", title: "Beschriftungen", info: st.labels ? "an – für alle" : "aus", html: () => `
        ${this._sw("labels", "format-text", "Beschriftungen anzeigen", "", !!st.labels)}
        <p class="small">Zeigt unter den kleinen Symbol-Knöpfen einen kurzen Text. Auch ohne den Schalter gilt: <b>Länger auf ein Symbol drücken</b> zeigt kurz, was es macht.</p>` },
      calm: { icon: "meditation", color: "#5c6bc0", title: "Ruhiger Modus", info: store.get(CALMKEY, false) ? "an – nur dieses Gerät" : "aus", html: () => `
        <label class="switch"><span>${ic("meditation")}Ruhiger Modus</span><input type="checkbox" class="swchk" data-a="setcalm" ${store.get(CALMKEY, false) ? "checked" : ""}></label>
        <p class="small">Nur für <b>dieses Gerät</b>. Gedämpfte Farben, keine Animationen – angenehm für alte Tablets.</p>` },
      ...(this._app ? { theme: { icon: "theme-light-dark", color: "#37474f", title: "Hell / Dunkel", info: { light: "☀️ Hell", dark: "🌙 Dunkel" }[kcTheme()] || "🌓 Automatisch", html: () => `
        <p class="small">Nur für die Offline-App auf diesem Gerät.</p>
        <div class="btnrow">${[["auto", "🌓 Automatisch"], ["light", "☀️ Hell"], ["dark", "🌙 Dunkel"]].map(([v, l]) => `<button class="btn ${kcTheme() === v ? "main" : ""}" data-a="theme" data-v="${v}">${l}</button>`).join("")}</div>` } } : {}),
      check: { icon: "check-decagram-outline", color: "#43a047", title: "Alles ok?", info: "prüfen", html: () => this._checkHtml(d) },
      errors: { icon: "bug-outline", color: "#e53935", title: "Fehler-Protokoll", info: this._health ? (this._health.errors.length ? `${this._health.errors.length} Meldungen` : "keine Fehler 🎉") : "Meldungen ansehen", html: () => this._errorsHtml() },
      stats: { icon: "chart-donut", color: "#00897b", title: "Ressourcen", info: "Speicher & Umfang", html: () => this._resHtml(d) },
      news: { icon: "new-box", color: "#fb8c00", title: "Was ist neu", info: `Version ${KC_VERSION}`, html: () => this._newsHtml() },
      credits: { icon: "hand-heart-outline", color: "#ec407a", title: "Credits", info: `v${KC_VERSION} · von Mister-M`, html: () => this._creditsHtml() },
    };
  }
  _setView(d) {
    const sh = this._sheets(d);
    const cats = [["👥", "Club", ["club"]], ["💶", "Regeln", ["rules"]], ["💾", "Daten", ["imp", "log", "factory"]], ["🩺", "Gesundheit", ["check", "errors", "stats"]], ["👁️", "Ansicht", ["view", "labels", "calm", ...(this._app ? ["theme"] : [])]], ["📱", "App & Info", ["app", "pin", "privacy", "news", "credits"]]];
    return `<div class="sethead">${ic("cog-outline")}<span>Einstellungen</span></div>` + cats.map(([emo, title, keys]) => {
      const open = this._setOpen === title;
      const rows = open ? keys.map((k) => `<button class="lrow" data-a="sheet" data-v="${k}"><span class="ic" style="--ic:${sh[k].color}">${ic(sh[k].icon)}</span><span class="grow"><b>${sh[k].title}</b><small>${esc(sh[k].info)}</small></span>${ic("chevron-right")}</button>`).join("") : "";
      return `<div class="lgbox"><button class="lgroup" data-a="setgrp" data-v="${esc(title)}" aria-expanded="${open}"><span class="gem">${emo}</span><span class="grow"><b>${title}</b><small>${keys.map((k) => sh[k].title).join(", ")}</small></span>${ic(open ? "chevron-up" : "chevron-down")}</button>${rows}</div>`;
    }).join("");
  }
  _importHtml(d) {
    const p = this._imp;
    let prev = "";
    if (p?.busy) prev = `<div class="preview">⏳ Lese die Datei …</div>`;
    else if (p?.error) prev = `<div class="preview finding"><b>⚠️ ${esc(p.error)}</b></div>`;
    else if (p?.res?.format === "alle_neune" && p.res.counts) {
      const r = p.res, c = r.counts;
      prev = `<div class="preview"><b>🔍 Gefunden in „${esc(r.club)}“</b><table>
        <tr><td>Mitglieder</td><td>${c.members}</td></tr><tr><td>Ehemalige</td><td>${c.former}</td></tr><tr><td>Gäste</td><td>${c.guests}</td></tr>
        <tr><td>Strafen</td><td>${c.strafen}</td></tr><tr><td>Kegelabende</td><td>${c.abende}${r.first ? ` (${fmtDate(r.first, { month: "2-digit", year: "numeric" })} – ${fmtDate(r.last, { month: "2-digit", year: "numeric" })})` : ""}</td></tr>
        <tr><td>Kassenbuchungen</td><td>${c.kasse}</td></tr><tr><td>Kassenstand laut App</td><td><b>${money(r.kasse_total)}</b></td></tr><tr><td>Grundbetrag</td><td>${money(r.base_fee || 0)}</td></tr></table>
        <p class="small">Spiele werden nicht übernommen. Die alten Abende zählen nicht als „offen“ – die waren in der App ja schon abgerechnet.${d.abende.length || d.kasse.length ? " <b>Achtung:</b> Was jetzt hier steht (Abende, Kasse, Mitglieder, Strafen) wird <b>ersetzt</b>." : ""}</p>
        <div class="btnrow"><button class="btn main" data-a="impapply">${ic("check")}Übernehmen</button><button class="btn" data-a="impcancel">${ic("close")}Abbrechen</button></div></div>`;
    } else if (p?.res?.format === "alle_neune") {
      const r = p.res;
      prev = `<div class="preview"><b>🤔 Unbekannte Datenbank</b><p class="small">Die Tabellen kenne ich nicht genau. Gefunden: ${r.members.length} Namen, ${r.strafen.length} Strafen.</p>${r.members.length || r.strafen.length ? `<div class="btnrow"><button class="btn main" data-a="impapply">${ic("check")}Namen und Strafen übernehmen</button><button class="btn" data-a="impcancel">${ic("close")}Abbrechen</button></div>` : ""}</div>`;
    } else if (p?.res?.format === "sicherung") {
      const c = p.res.counts;
      prev = `<div class="preview"><b>💾 Sicherung</b><table><tr><td>Personen</td><td>${c.members}</td></tr><tr><td>Strafen</td><td>${c.strafen}</td></tr><tr><td>Abende</td><td>${c.abende}</td></tr><tr><td>Kassenbuchungen</td><td>${c.kasse}</td></tr></table>
        <p class="small"><b>Achtung:</b> Alles, was jetzt hier steht, wird durch die Sicherung <b>ersetzt</b>.</p><div class="btnrow"><button class="btn main" data-a="impapply">${ic("check")}Zurückholen</button><button class="btn" data-a="impcancel">${ic("close")}Abbrechen</button></div></div>`;
    }
    return `<p class="small"><b>📥 Aus „Alle Neune“ umziehen:</b> In der App die Daten exportieren und die Datei hier wählen. Erst kommt eine <b>Vorschau</b>, geändert wird erst nach „Übernehmen“. Auch eine <b>Sicherung</b> (.json) von hier geht.</p>
      <input type="file" data-a="impfile" accept=".db,.sqlite,.zip,.json,application/octet-stream,application/json,application/zip">${prev}
      <p class="small" style="margin-top:14px"><b>💾 Sichern:</b> alles als Datei – damit holst du später alles zurück. Die Kasse gibt es zusätzlich als CSV für Excel.</p>
      <div class="btnrow"><button class="btn" data-a="backup">${ic("content-save-outline")}Sicherung speichern</button><button class="btn" data-a="csv">${ic("file-delimited-outline")}Kasse als CSV</button></div>`;
  }
  _logHtml(d, admin) {
    const on = d.settings.log_on !== false, log = (d.log || []).slice().reverse();
    let day = "", rows = "";
    for (const e of log.slice(0, 150)) {
      const dt = new Date(e.ts), dk = dt.toLocaleDateString(kcLoc(), { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
      if (dk !== day) { day = dk; rows += `<div class="logday">${esc(dk)}</div>`; }
      rows += `<div class="logrow"><span class="lt">${dt.toLocaleTimeString(kcLoc(), { hour: "2-digit", minute: "2-digit" })}</span><span class="lx ${this._hidden ? "hidden-amt" : ""}" data-noicon>${esc(e.text)}</span>${e.by ? `<span class="tag" data-noicon>${esc(e.by)}</span>` : ""}</div>`;
    }
    return `${this._sw("log_on", "history", "Verlauf an", "", on)}
      <p class="small">Merkt sich <b>wer wann was</b> gebucht hat. Die letzten 300 Einträge, nur in deinem Home Assistant.</p>
      ${log.length ? rows + (log.length > 150 ? `<p class="small">… und ${log.length - 150} ältere.</p>` : "") : `<p class="okmsg">Noch nichts passiert 🙂</p>`}
      ${admin && log.length ? `<div class="btnrow"><button class="btn" data-a="logclear">${ic("delete-sweep-outline")}Verlauf leeren</button></div>` : ""}`;
  }
  _checks(d) {
    const out = [], day = 86400000;
    const ev = evFind(d);
    if (ev && Date.now() - (ev.started || Date.parse(ev.date) || Date.now()) > day) out.push({ t: `Der Kegelabend vom ${fmtDate(ev.date)} läuft noch`, fix: "Vergessen abzuschließen? Im Reiter „Abend“ → „Abend abschließen“." });
    for (const s of d.strafen.filter((x) => x.active !== false && !x.amount)) out.push({ t: `Strafe „${s.name}“ kostet ${money(0)}`, fix: "Unter ⚙️ → „Mitglieder & Strafen“ den Betrag eintragen oder sie ausschalten." });
    if (!d.members.some((m) => !m.guest && m.active !== false)) out.push({ t: "Es gibt noch keine Mitglieder", fix: "⚙️ → „Mitglieder & Strafen“ → ＋ Neu." });
    if (d.summary.kasse < 0) out.push({ t: `Die Kasse steht im Minus (${money(d.summary.kasse)})`, fix: "Stimmt der Kassenstand am Anfang? ⚙️ → Regeln & Beträge." });
    const old = d.summary.people.filter((p) => p.debt > 0 && !d.members.find((m) => m.id === p.id && m.active !== false));
    for (const p of old) out.push({ t: `${p.name} ist ausgeblendet, hat aber noch ${money(p.debt)} offen`, fix: "Reiter „Kasse“ → bei der Person den Haken ✓ antippen, wenn bezahlt." });
    return out;
  }
  _checkHtml(d) {
    const res = this._checks(d);
    return `<p class="small">Sucht nach Dingen, die nicht zusammenpassen – mit „so reparierst du's“.</p>
      ${res.length ? `<p><b>${res.length} ${res.length === 1 ? "Sache" : "Sachen"} gefunden:</b></p>` + res.map((x) => `<div class="finding"><b>⚠️ ${esc(x.t)}</b><div class="small" style="margin:2px 0 0">${x.fix}</div></div>`).join("") : `<p class="okmsg">✅ Alles ok – nichts gefunden. 🎉</p>`}`;
  }
  async _loadHealth() {
    try { this._health = await this._hass.callWS({ type: "kegelclub/health", ...this._bk() }); }
    catch (_) { this._health = { errors: [], size: 0, counts: {}, offline: true }; }
    this._force = true; this._render();
  }
  _errorsHtml() {
    const h = this._health;
    if (!h) return `<p class="small">Lade …</p>`;
    if (h.offline) return `<p class="small">📴 Das Protokoll liegt in Home Assistant – dafür braucht es Netz.</p>`;
    return `<p class="small">Hier steht, was beim Speichern nicht geklappt hat. Nur Art und Fehler. Wird beim Neustart von Home Assistant geleert.</p>
      ${h.errors.length ? h.errors.map((e) => `<div class="finding"><b>${esc(e.error)}</b><div class="small" style="margin:2px 0 0">${new Date(e.ts).toLocaleString(kcLoc())} · ${esc(e.type)}${e.by ? ` · ${esc(e.by)}` : ""}</div></div>`).join("")
        + `<div class="btnrow"><button class="btn" data-a="errclear">${ic("delete-sweep-outline")}Protokoll leeren</button></div>` : `<p class="okmsg">Keine Fehler 🎉</p>`}`;
  }
  _resHtml(d) {
    const h = this._health;
    if (!h) return `<p class="small">Lade …</p>`;
    const kb = (n) => n > 1024 * 1024 ? `${(n / 1048576).toFixed(1).replace(".", ",")} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
    const c = h.counts || {};
    const rows = [["Personen", c.members], ["Strafen", c.strafen], ["Kegelabende", c.abende], ["Kassenbuchungen", c.kasse], ["Verlauf", c.log]];
    let local = 0;
    try { for (const k of [this._dk, this._qk, HKEY]) local += (localStorage.getItem(k) || "").length; } catch (_) { /* egal */ }
    return `${h.offline ? `<p class="small">📴 Ohne Netz sieht man nur den Platz auf diesem Gerät.</p>` : `<table><tr><td>In Home Assistant</td><td><b>${kb(h.size)}</b></td></tr>${rows.map(([l, n]) => `<tr><td>${l}</td><td>${n ?? 0}</td></tr>`).join("")}</table>`}
      <table><tr><td>Auf diesem Gerät</td><td><b>${kb(local)}</b></td></tr><tr><td>Im Postausgang</td><td>${this._queue.length}</td></tr></table>`;
  }
  _sheetPage(d) { const x = this._sheets(d)[this._sheet]; return x ? { icon: x.icon, color: x.color, title: x.title, html: x.html() } : null; }

  // ---------------------------------------------------------------- 👆 Klicks
  _bind() {
    const root = this.shadowRoot;
    root.querySelectorAll("input,textarea,select").forEach((el) => el.addEventListener("blur", () => {
      setTimeout(() => { if (this._pending && !["INPUT", "TEXTAREA", "SELECT"].includes(root.activeElement?.tagName)) { this._pending = false; this._render(); } }, 150);
    }));
    root.querySelectorAll("form").forEach((f) => f.addEventListener("submit", (e) => { e.preventDefault(); this._submit(f); }));
    const gsecs = [...root.querySelectorAll("details.elg-sec")];
    let searching = false;
    gsecs.forEach((x) => x.addEventListener("toggle", () => { if (x.open && !searching) gsecs.forEach((o) => { if (o !== x) o.open = false; }); }));
    const gq = root.querySelector(".elg-q");
    if (gq) {
      const norm = (t) => String(t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ß/g, "ss");
      const texts = gsecs.map((x) => norm(x.textContent));
      gq.addEventListener("input", () => {
        const words = norm(gq.value).split(/\s+/).filter(Boolean);
        searching = words.length > 0;
        let hits = 0;
        gsecs.forEach((x, i) => { const hit = !words.length || words.every((w) => texts[i].includes(w)); x.hidden = !hit; x.open = !!words.length && hit; if (hit && words.length) hits++; });
        root.querySelector(".elg-none").hidden = !words.length || hits > 0;
      });
    }
    root.querySelectorAll("[data-grip]").forEach((g) => { g.addEventListener("pointerdown", (e) => this._startDrag(g, e)); g.addEventListener("click", (e) => e.stopPropagation()); });
    root.querySelectorAll("[data-a]").forEach((el) => {
      if (el.tagName === "FORM") return;
      const ev = el.tagName === "INPUT" || el.tagName === "SELECT" ? "change" : "click";
      el.addEventListener(ev, (e) => { e.stopPropagation(); this._act(el, e); });
    });
  }
  _undoFor(label, op) {
    clearTimeout(this._undoT);
    this._undo = { label, op };
    this._undoT = setTimeout(() => { this._undo = null; this._force = true; this._render(); }, 8000);
  }
  _act(el, e) {
    const a = el.dataset.a, id = el.dataset.id, d = this._data;
    const redraw = () => { this._force = true; this._render(); };
    const ev = d && evFind(d);
    if (a === "tab") { this._view = el.dataset.v; this._open = null; this._sheet = null; this._guestPick = false; if (this._pad?.step !== "unlock") this._pad = null; redraw(); }
    else if (a === "lock") {
      const appLock = this._app && window.__kcAppLock?.on?.();
      if (appLock) { PIN_LOCK.until = 0; this._pad = null; this._sheet = null; this._view = "abend"; this._open = null; redraw(); window.__kcAppLock.now(); return; }
      if (!d?.pin) { this._toast("🔒 Erst eine PIN festlegen – dann sperrt das Schloss ⚙️ und Mitglieder"); this._view = "set"; this._sheet = "pin"; this._pad = null; }
      else if (pinOpen()) { PIN_LOCK.until = 0; this._pad = null; this._toast("🔒 Gesperrt"); if (this._view === "edit" || this._view === "set") { this._view = "abend"; this._sheet = null; } }
      else this._view = "set";
      this._open = null; redraw();
    }
    else if (a === "back") {
      if (this._pad) { const back = this._pad.back; this._pad = null; if (back !== "sheet") { this._view = "abend"; this._sheet = null; } }
      else if (this._view === "set" && this._sheet) { this._sheet = null; this._imp = null; }
      else if (this._view === "share") { this._view = this._shareBack || "abend"; this._shareMode = null; }
      else { this._view = this._view === "ev" ? this._evBack || "abend" : "abend"; this._evBack = null; this._sheet = null; }
      this._open = null; redraw();
    }
    else if (a === "hide") { this._hidden = !this._hidden; store.put(HKEY, this._hidden); redraw(); }
    else if (a === "pkey") this._padPress(el.dataset.v);
    else if (a === "padstart") { this._pad = { purpose: el.dataset.v, step: d.pin ? "old" : "new", buf: "", back: "sheet" }; redraw(); }
    else if (a === "reload") {
      try { caches?.keys?.().then((ks) => ks.filter((k) => k.startsWith("kegelclub-")).forEach((k) => caches.delete(k))); } catch (_) { /* egal */ }
      try { navigator.serviceWorker?.getRegistrations?.().then((rs) => rs.forEach((r) => { if (/\/kegelclub\/app\//.test(r.scope)) r.update().catch(() => {}); })); } catch (_) { /* egal */ }
      setTimeout(() => location.reload(), 300);
    }
    else if (a === "sheet") { this._sheet = el.dataset.v; this._imp = null; redraw(); if (["errors", "stats"].includes(this._sheet)) this._loadHealth(); }
    else if (a === "setgrp") { this._setOpen = this._setOpen === el.dataset.v ? null : el.dataset.v; redraw(); }
    else if (a === "errclear") { this._hass.callWS({ type: "kegelclub/errors_clear", ...this._bk() }).then(() => this._loadHealth(), () => this._toast("📴 Geht nur mit Netz")); }
    else if (a === "peek") { clearTimeout(this._peekT); this._peek = { key: el.dataset.v, until: Date.now() + 4000 }; el.classList.add("peek"); this._peekT = setTimeout(() => { this._peek = null; this.shadowRoot.querySelectorAll(".veil.peek").forEach((x) => x.classList.remove("peek")); }, 4000); }
    // 🧭 Einrichten
    else if (a === "wiz") {
      const v = el.dataset.v;
      if (v === "template") { this._send({ type: "template" }); this._send({ type: "setup_done" }); this._view = "set"; this._sheet = "club"; this._toast("📋 Beispiel-Strafen geladen – jetzt Mitglieder anlegen"); }
      else if (v === "empty") { this._send({ type: "setup_done" }); this._view = "set"; this._sheet = "club"; }
      else { this._view = "set"; this._sheet = "imp"; }
      redraw();
    }
    else if (a === "template") this._send({ type: "template" });
    // 🎳 Abend
    else if (a === "pick") { this._sel = this._sel === id ? null : id; redraw(); }
    else if (a === "status" && ev) { const cur = ev.status[id] || "play"; this._send({ type: "abend_status", abend: ev.id, member: id, status: STATUS_NEXT[cur] }); }
    else if (a === "fine" && ev && this._sel && ["play", "watch"].includes(ev.status[this._sel])) {
      try { navigator.vibrate?.(15); } catch (_) { /* egal */ }
      const s = d.strafen.find((x) => x.id === id);
      this._send({ type: "abend_count", abend: ev.id, member: this._sel, strafe: id, delta: 1 });
      this._undoFor(`💸 ${s?.name || ""} für ${this._name(d, this._sel)}`, { type: "abend_count", abend: ev.id, member: this._sel, strafe: id, delta: -1 });
      redraw();
    }
    else if (a === "minus" && ev) this._send({ type: "abend_count", abend: ev.id, member: id, strafe: el.dataset.v, delta: -1 });
    else if (a === "fminus" && ev && this._sel) {
      e?.preventDefault?.();
      const s0 = d.strafen.find((x) => x.id === id);
      this._send({ type: "abend_count", abend: ev.id, member: this._sel, strafe: id, delta: -1 });
      this._undoFor(`↩️ ${s0?.name || ""} für ${this._name(d, this._sel)} zurückgenommen`, { type: "abend_count", abend: ev.id, member: this._sel, strafe: id, delta: 1 });
      redraw();
    }
    else if (a === "handopen") { this._hand = !this._hand; redraw(); if (this._hand) setTimeout(() => this.shadowRoot.querySelector('form[data-a="hand"] input')?.focus(), 50); }
    else if (a === "handdel" && ev) this._send({ type: "abend_extra_delete", abend: ev.id, id });
    else if (a === "basepay" && ev) {
      const b = billEvening(ev, ...maps(d), d.settings), ops = [];
      for (const [mid, p] of Object.entries(b.people)) {
        if (!["play", "watch"].includes(p.status) || !p.fee) continue;
        const rest = r2(p.fee - this._paidAt(d, ev.id, mid, "base"));
        if (rest > 0.004) ops.push(this._send({ type: "pay", member: mid, amount: rest, abend: ev.id, tag: "base", name: `Grundbetrag ${fmtDate(ev.date)}`, id: uid() }));
      }
      if (ops.length) this._undoFor(`💶 Grundbetrag von ${ops.length} kassiert`, ops.map((o) => ({ type: "kasse_delete", id: o.id })));
    }
    else if ((a === "basetoggle" || a === "coin") && ev) {
      const tag = a === "coin" ? "fines" : "base";
      const p = billEvening(ev, ...maps(d), d.settings).people[id]; if (!p) return;
      const due = tag === "base" ? p.fee : r2(p.fines + p.lane + p.extra), paid = this._paidAt(d, ev.id, id, tag);
      if (paid >= due - 0.004 && paid > 0) {
        if (tag === "base" && this._hasFines(ev, id)) { this._toast("🔒 Hat schon Strafen – Grundbetrag bleibt bezahlt"); return; }
        const mine = d.kasse.filter((k) => k.abend === ev.id && k.member === id && k.tag === tag);
        mine.forEach((k) => this._send({ type: "kasse_delete", id: k.id }));
        this._undoFor(`↩️ Zahlung von ${this._name(d, id)} zurückgenommen`, mine.map((k) => ({ type: "restore", kind: "kasse", item: { ...k, waiting: undefined } })));
      } else {
        const op = this._send({ type: "pay", member: id, amount: r2(due - paid), abend: ev.id, tag, name: `${tag === "base" ? "Grundbetrag" : "Strafen"} ${fmtDate(ev.date)}`, id: uid() });
        this._undoFor(`💶 ${this._name(d, id)} hat ${money(r2(due - paid))} bezahlt`, { type: "kasse_delete", id: op.id });
      }
    }
    else if (a === "undo" && this._undo) {
      const ops = [].concat(this._undo.op); clearTimeout(this._undoT); this._undo = null;
      ops.forEach((o) => this._send(o)); redraw();
    }
    else if (a === "evhours" && ev) { const h = Number(String(el.value).replace(",", ".")); if (Number.isFinite(h) && h >= 0) this._send({ type: "abend_hours", abend: ev.id, hours: h }); }
    else if (a === "nofines") { const target = id || ev?.id || this._evId; if (target) this._send({ type: "abend_nofines", abend: target, value: el.checked }); }
    else if (a === "guest") { this._guestPick = !this._guestPick; redraw(); }
    else if (a === "guestadd" && ev) { this._send({ type: "abend_status", abend: ev.id, member: id, status: "play" }); this._sel = id; }
    else if (a === "evclose") {
      const b = billEvening(ev, ...maps(d), d.settings), open = this._openAt(d, ev, b);
      const msg = open.length ? `Noch nicht bezahlt: ${open.map(([m, v]) => `${this._name(d, m)} ${money(v)}`).join(", ")}.\n\nTrotzdem abschließen? Dann stehen sie unter „Kasse“ → „Wer schuldet was“.` : "Kegelabend abschließen?\n\nAlle haben bezahlt 🎉";
      if (!kcConfirm(msg)) return;
      this._sel = null; this._guestPick = false;
      this._send({ type: "abend_close", abend: id, value: true });
      this._evId = id; this._view = "ev"; redraw();
    }
    else if (a === "evopen") { this._evBack = this._view === "stats" ? "stats" : "abend"; this._evId = id; this._view = "ev"; redraw(); }
    else if (a === "evreopen") {
      if (ev) { this._toast("Es läuft schon ein anderer Kegelabend"); return; }
      this._send({ type: "abend_close", abend: id, value: false }); this._view = "abend"; redraw();
    }
    else if (a === "evdel") {
      const x = d.abende.find((y) => y.id === id);
      if (!x || !kcConfirm(`Kegelabend vom ${fmtDate(x.date)} löschen?\n\nAlle Strafen und Beträge dieses Abends sind dann weg.`)) return;
      this._view = "abend"; this._removeWithUndo("abend", id, `🗑️ Kegelabend ${fmtDate(x.date)} gelöscht`);
    }
    else if (a === "evdate") { if (/^\d{4}-\d{2}-\d{2}$/.test(el.value)) this._send({ type: "abend_date", abend: this._evId, date: el.value }); }
    else if (a === "evnote") this._send({ type: "abend_note", abend: this._evId, note: el.value });
    else if (a === "allpast") { this._allPast = true; redraw(); }
    else if (a === "share") { // 📤 Drucken & Teilen (wie bei der Einkaufsliste)
      if (!d.abende.some((y) => y.id === id)) return;
      if (this._view !== "share") this._shareBack = this._view === "ev" ? "ev" : this._view;
      this._shareId = id; this._shareMode = null; this._view = "share"; redraw();
    }
    else if (a === "shmode") { this._shareMode = el.dataset.v || null; redraw(); }
    else if (a === "shprint") this._printBill(d.abende.find((y) => y.id === this._shareId));
    else if (a === "shpdf") this._pdfShare(d.abende.find((y) => y.id === this._shareId));
    else if (a === "shtext" || a === "shcopy") {
      const x = d.abende.find((y) => y.id === this._shareId); if (!x) return;
      const text = this._shareText(d, x);
      if (a === "shtext" && navigator.share) navigator.share({ text }).catch(() => {});
      else (navigator.clipboard?.writeText(text) || Promise.reject()).then(() => this._toast("📋 Kopiert – jetzt z. B. in WhatsApp einfügen"), () => prompt(kcT("Zum Kopieren:"), text));
    }
    // 🏦 Kasse
    else if (a === "payall") {
      const p = d.summary.people.find((x) => x.id === id); if (!p || p.debt <= 0) return;
      const op = this._send({ type: "pay", member: id, amount: p.debt, id: uid() });
      this._undoFor(`✓ ${p.name} hat ${money(p.debt)} bezahlt`, { type: "kasse_delete", id: op.id });
    }
    else if (a === "kform") { this._kform = el.dataset.v; redraw(); }
    else if (a === "kdel") this._removeWithUndo("kasse", id, "🗑️ Buchung gelöscht");
    else if (a === "allk") { this._allK = true; redraw(); }
    else if (a === "year") { this._year = (this._year || new Date().getFullYear()) + Number(el.dataset.v); redraw(); }
    else if (a === "yearall") { this._year = this._year ? 0 : new Date().getFullYear(); redraw(); }
    else if (a === "stattab") { this._statTab = el.dataset.v; this._statP = null; redraw(); }
    else if (a === "statp") { this._statP = id || null; redraw(); }
    // 👥 Mitglieder & Strafen
    else if ((a === "open" || a === "new") && this._dragEnd && Date.now() - this._dragEnd < 400) { /* gerade gezogen */ }
    else if (a === "open" || a === "new") { this._open = { kind: el.dataset.k, id: a === "new" ? "new" : id }; redraw(); }
    else if (a === "cancel") { this._open = null; redraw(); }
    else if (a === "payer") { const f = el.closest("form"); f.querySelector('input[name="payer"]').value = el.dataset.v; el.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el)); }
    else if (a === "icon") { const f = el.closest("form"); f.querySelector('input[name="icon"]').value = "mdi:" + el.dataset.v; el.parentElement.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === el)); }
    else if (a === "del") { const k = el.dataset.k; this._open = null; this._removeWithUndo(k, id, "🗑️ Gelöscht"); }
    // ⚙️ Schalter
    else if (a === "set") this._send({ type: "settings", settings: { [el.dataset.v]: el.checked } });
    else if (a === "setnum") { const v = el.dataset.v === "lane_hours" ? Number(String(el.value).replace(",", ".")) : parseMoney(el.value); if (Number.isFinite(v)) this._send({ type: "settings", settings: { [el.dataset.v]: v } }); else this._toast("Bitte eine Zahl eintippen"); }
    else if (a === "lane") this._send({ type: "settings", settings: { lane_mode: el.dataset.v } });
    else if (a === "setcur") this._send({ type: "settings", settings: { currency: el.value } });
    else if (a === "setview") this._send({ type: "settings", settings: { view: { [el.dataset.v]: el.checked } } });
    else if (a === "setcalm") { store.put(CALMKEY, el.checked); redraw(); }
    else if (a === "theme") {
      const v = el.dataset.v;
      try { v === "auto" ? localStorage.removeItem(THEMEKEY) : localStorage.setItem(THEMEKEY, v); } catch (_) { /* egal */ }
      v === "auto" ? document.documentElement.removeAttribute("data-theme") : document.documentElement.setAttribute("data-theme", v);
      redraw();
    }
    else if (a === "logclear") { if (kcConfirm("Den ganzen Verlauf löschen?")) this._send({ type: "log_clear" }); }
    else if (a === "appcopy") { const u = d.app_url || ""; (navigator.clipboard?.writeText(u) || Promise.reject()).then(() => this._toast("📋 Adresse kopiert"), () => prompt(kcT("Adresse zum Kopieren:"), u)); }
    else if (a === "factory") {
      if (!kcConfirm("Wirklich ALLES löschen?\n\nMitglieder, Strafen, alle Abende und die ganze Kasse. Nur die PIN bleibt.\n\nDas geht nicht rückgängig.")) return;
      if (!kcConfirm("Letzte Frage: Wirklich ALLES auf Werkseinstellungen setzen?")) return;
      this._queue = []; store.put(this._qk, this._queue);
      this._hass.callWS({ type: "kegelclub/factory_reset", ...this._bk() }).then(() => { this._toast("💣 Alles zurückgesetzt"); this._sheet = null; this._view = "abend"; redraw(); }, (err) => this._toast("⚠️ " + (err?.message || "Das hat nicht geklappt")));
    }
    // 📥 Import & Sicherung
    else if (a === "photofile") { // 📸 Foto: quadratisch mittig zuschneiden, klein als JPEG speichern
      const file = el.files?.[0], form = el.closest("form"); if (!file || !form) return;
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const S = 128, c = document.createElement("canvas"), m = Math.min(img.naturalWidth, img.naturalHeight);
        c.width = c.height = S;
        c.getContext("2d").drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
        const du = c.toDataURL("image/jpeg", 0.78);
        URL.revokeObjectURL(url);
        form.querySelector('input[name="photo"]').value = du;
        form.querySelector(".phprev").innerHTML = `<img src="${du}" alt="">`;
        form.querySelector('[data-a="photodel"]').hidden = false;
      };
      img.onerror = () => { URL.revokeObjectURL(url); this._toast("Das Bild kann ich nicht lesen"); };
      img.src = url;
    }
    else if (a === "photodel") { const form = el.closest("form"); if (!form) return; form.querySelector('input[name="photo"]').value = ""; form.querySelector(".phprev").innerHTML = ic("account-outline"); el.hidden = true; }
    else if (a === "impfile") {
      const file = el.files?.[0]; if (!file) return;
      if (file.size > 8 * 1024 * 1024) { this._toast("Die Datei ist zu groß (höchstens 8 MB)"); return; }
      this._imp = { busy: true }; redraw();
      const rd = new FileReader();
      rd.onload = () => { const b64 = String(rd.result).split(",")[1] || ""; this._imp = { busy: true, name: file.name, data: b64 }; this._importCall(false); };
      rd.onerror = () => { this._imp = { error: "Die Datei ließ sich nicht lesen" }; redraw(); };
      rd.readAsDataURL(file);
    }
    else if (a === "impapply") this._importCall(true);
    else if (a === "impcancel") { this._imp = null; redraw(); }
    else if (a === "backup") this._download(`kegelclub-sicherung-${todayIso()}.json`, JSON.stringify({ kegelclub: 1, version: KC_VERSION, exported: new Date().toISOString(), members: d.members, strafen: d.strafen, abende: d.abende, kasse: d.kasse, settings: d.settings }, null, 1), "application/json");
    else if (a === "csv") {
      const q = (x) => /[;"\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : String(x ?? "");
      const lines = ["Datum;Art;Wofür;Wer;Betrag", ...d.kasse.slice().sort((x, y) => (x.ts || 0) - (y.ts || 0)).map((k) => [k.ts ? new Date(k.ts).toLocaleDateString("de-DE") : "", k.kind === "out" ? "Ausgabe" : "Einzahlung", k.name, k.member ? this._name(d, k.member) : "", String((k.kind === "out" ? -k.amount : k.amount).toFixed(2)).replace(".", ",")].map(q).join(";"))];
      this._download(`kegelkasse-${todayIso()}.csv`, "﻿" + lines.join("\n"), "text/csv");
    }
  }
  _download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async _importCall(apply) {
    const p = this._imp;
    if (!p?.data) return;
    if (apply && !kcConfirm("Jetzt übernehmen?\n\nWas hier steht, wird ersetzt. Vorher lieber „Sicherung speichern“.")) return;
    this._imp = { ...p, busy: true }; this._force = true; this._render();
    try {
      const res = await this._hass.callWS({ type: "kegelclub/import", name: p.name || "", data: p.data, apply, replace: true, ...this._bk() });
      if (apply) { this._imp = null; this._sheet = null; this._view = "abend"; this._toast(`✅ Übernommen${res.counts ? `: ${res.counts.abende ?? 0} Abende` : ""}`); }
      else this._imp = { ...p, busy: false, res };
    } catch (err) { this._imp = { error: err?.message || "Einlesen ging nicht (ohne Netz geht das nicht)" }; }
    this._force = true; this._render();
  }
  _submit(f) {
    const a = f.dataset.a, data = Object.fromEntries(new FormData(f).entries()), d = this._data;
    const done = () => { this.shadowRoot.activeElement?.blur(); this._force = true; };
    if (a === "evstart") {
      const hours = data.hours != null ? Number(String(data.hours).replace(",", ".")) : undefined;
      done(); this._sel = null;
      this._send({ type: "abend_start", id: uid(), date: data.date || todayIso(), ...(Number.isFinite(hours) ? { hours } : {}) });
      return;
    }
    if (a === "guestnew") {
      const name = String(data.name || "").trim(); const ev = evFind(d);
      if (!name || !ev) { this._toast("Name fehlt"); return; }
      const old = d.members.find((m) => m.name.toLowerCase() === name.toLowerCase());
      const mid = old?.id || uid();
      if (!old) this._send({ type: "member_save", item: { id: mid, name, guest: true } });
      done(); this._sel = mid;
      this._send({ type: "abend_status", abend: ev.id, member: mid, status: "play" });
      return;
    }
    if (a === "hand") {
      const v = Math.abs(parseMoney(data.amount)), ev = evFind(d);
      if (!v || Number.isNaN(v)) { this._toast("Bitte einen Betrag eintippen"); return; }
      if (!ev || !this._sel) return;
      const name = String(data.name || "").trim() || "Strafe";
      done(); this._hand = false;
      const op = this._send({ type: "abend_extra_add", abend: ev.id, member: this._sel, name, amount: v, id: uid() });
      this._undoFor(`✍️ ${name} für ${this._name(d, this._sel)}`, { type: "abend_extra_delete", abend: ev.id, id: op.id });
      return;
    }
    if (a === "paypart") {
      const v = parseMoney(data.amount);
      if (!v || Number.isNaN(v) || v <= 0) { this._toast("Bitte einen Betrag eintippen"); return; }
      this._open = null; done();
      const op = this._send({ type: "pay", member: f.dataset.id, amount: v, id: uid() });
      this._undoFor(`✓ ${this._name(d, f.dataset.id)} hat ${money(v)} bezahlt`, { type: "kasse_delete", id: op.id });
      return;
    }
    if (a === "kadd") {
      const v = Math.abs(parseMoney(data.amount));
      if (!v || Number.isNaN(v)) { this._toast("Bitte einen Betrag eintippen"); return; }
      const when = data.date ? new Date(data.date + "T12:00:00").getTime() : Date.now();
      done(); f.reset();
      if (this._kform === "in" && data.member) this._send({ type: "pay", member: data.member, amount: v, name: (data.name || "").trim() || "Einzahlung", id: uid() });
      else this._send({ type: "kasse_add", kind: this._kform, name: (data.name || "").trim(), amount: v, when, id: uid() });
      return;
    }
    if (a === "save") {
      const kind = f.dataset.k, item = { name: (data.name || "").trim() };
      if (!item.name) { this._toast("Name fehlt"); return; }
      item.id = f.dataset.id || uid();
      if (kind === "member") { item.note = data.note || ""; item.photo = String(data.photo || "").startsWith("data:image/") ? data.photo : ""; item.guest = !!f.querySelector('input[name="guest"]')?.checked; }
      else {
        const amount = parseMoney(data.amount || 0);
        if (Number.isNaN(amount)) { this._toast("Betrag stimmt nicht"); return; }
        item.amount = Math.abs(amount); item.payer = data.payer === "others" ? "others" : "self"; item.icon = data.icon || "mdi:bowling";
      }
      const act = f.querySelector('input[name="active"]');
      if (act) item.active = !!act.checked;
      this._open = null; done();
      this._send({ type: `${kind}_save`, item });
    }
  }
}
// ↩️ Zurück-Taste am Handy (wie bei der Einkaufsliste): Solange in der Karte eine Unterseite offen ist, liegt ein „Merkzettel“ im Verlauf.
// Zurück nimmt ihn weg und geht genau einen Schritt zurück (PIN → Einstellungen → Übersicht) – die Seite selbst bleibt stehen.
(function kcBackGuard() {
  if (window.__kcBackGuard) return;
  window.__kcBackGuard = true;
  let timer = null, ignorePop = false;
  const live = () => [...KC_CARDS].filter((c) => c.isConnected);
  const isOpen = () => live().some((c) => !c.kegelclubIsRoot());
  const push = (state) => {
    const prev = history.scrollRestoration;
    try { history.scrollRestoration = "manual"; } catch (_) { /* egal */ }
    history.pushState(state, "");
    try { history.scrollRestoration = prev || "auto"; } catch (_) { /* egal */ }
  };
  const sync = () => {
    timer = null;
    const open = isOpen(), st = history.state;
    if (open && !st?.kcCardGuard) push({ ...(st || {}), kcCardGuard: 1 });
    else if (!open && st?.kcCardGuard) { ignorePop = true; history.back(); }
  };
  window.addEventListener("popstate", () => {
    if (ignorePop) { ignorePop = false; return; }
    if (history.state?.kcCardGuard) return;
    const c = live().find((x) => !x.kegelclubIsRoot());
    if (c?.kegelclubBack()) setTimeout(sync, 60);
  });
  window.addEventListener("kegelclub-nav", () => { if (!timer) timer = setTimeout(sync, 80); });
})();

if (!customElements.get("kegelclub-card")) customElements.define("kegelclub-card", KegelclubCard);
KegelclubCard.bill = billEvening; KegelclubCard.summary = summary; KegelclubCard.applyLocal = applyLocal; // 🧪 für Tests: Rechnen
KegelclubCard.i18n = { kcBlockKey, kcNorm, kcT, skip: KC_SKIP, attrs: KC_ATTRS }; // 🧪 für Tests: Übersetzung

// ✏️ Karten-Editor: Titel, welcher Club, Beträge erst nach Antippen zeigen
class KegelclubCardEditor extends HTMLElement {
  setConfig(config) { this._config = { ...config }; this._draw(); }
  set hass(hass) {
    const first = !this._hass; this._hass = hass;
    if (first) hass.callWS({ type: "kegelclub/books" }).then((r) => { this._books = r.books || []; this._draw(); }, () => { this._books = []; this._draw(); });
  }
  _set(key, value) {
    const c = { ...this._config };
    if (value === "" || value === false || value == null) delete c[key]; else c[key] = value;
    this._config = c;
    this.dispatchEvent(new CustomEvent("config-changed", { detail: { config: c }, bubbles: true, composed: true }));
  }
  _draw() {
    if (!this._config) return;
    const c = this._config, books = this._books || [];
    const esc2 = (x) => String(x ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
    const opts = books.map((b) => `<option value="${b.primary ? "" : esc2(b.title)}" ${(b.primary ? !c.buch : String(c.buch || "").toLowerCase() === b.title.toLowerCase()) ? "selected" : ""}>${esc2(b.title)}${b.primary ? " (erster Club)" : ""}</option>`).join("");
    this.innerHTML = `<div style="display:grid;gap:12px;padding:4px 0">
      <label style="display:grid;gap:4px">Titel<input data-k="title" value="${esc2(c.title || "")}" style="padding:8px;border-radius:8px;border:1px solid var(--divider-color,#ccc);background:none;color:inherit;font:inherit"></label>
      <label style="display:grid;gap:4px">🏠 Welcher Club?<select data-k="buch" style="padding:8px;border-radius:8px;border:1px solid var(--divider-color,#ccc);background:var(--card-background-color,#fff);color:inherit;font:inherit">${opts || `<option value="">Kegelclub</option>`}</select>
        <small style="opacity:.7">Weitere Clubs: Einstellungen → Geräte &amp; Dienste → Kegelclub → Eintrag hinzufügen.</small></label>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" data-k="privat" ${c.privat ? "checked" : ""}> 🙈 Beträge erst nach Antippen zeigen</label>
      <label style="display:grid;gap:4px">🌍 Sprache / Language<select data-k="language" style="padding:8px;border-radius:8px;border:1px solid var(--divider-color,#ccc);background:var(--card-background-color,#fff);color:inherit;font:inherit">${[["", "Automatisch (wie Home Assistant)"], ["de", "Deutsch"], ["en", "English"]].map(([v, t]) => `<option value="${v}" ${(c.language || "") === v ? "selected" : ""}>${t}</option>`).join("")}</select></label></div>`;
    this.querySelector('[data-k="title"]').addEventListener("change", (e) => this._set("title", e.target.value));
    this.querySelector('[data-k="buch"]').addEventListener("change", (e) => this._set("buch", e.target.value));
    this.querySelector('[data-k="privat"]').addEventListener("change", (e) => this._set("privat", e.target.checked));
    this.querySelector('[data-k="language"]').addEventListener("change", (e) => this._set("language", e.target.value));
  }
}
if (!customElements.get("kegelclub-card-editor")) customElements.define("kegelclub-card-editor", KegelclubCardEditor);
window.customCards = window.customCards || [];
if (!window.customCards.some((c) => c.type === "kegelclub-card")) {
  window.customCards.push({ type: "kegelclub-card", name: "Kegelclub", description: "Kegelabende, Strafen und Kegelkasse – auch ohne Netz.", preview: false });
}
console.info(`%c 🎳 KEGELCLUB %c v${KC_VERSION} `, "background:#fb8c00;color:#fff;border-radius:3px 0 0 3px", "background:#333;color:#fff;border-radius:0 3px 3px 0");
