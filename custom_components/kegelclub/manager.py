"""🧠 Das Gehirn vom Kegelclub: speichert alles und rechnet aus, wer was zahlt und was in der Kasse ist.

Alles läuft über „Änderungen“ (ops). Jede Änderung hat eine eigene Nummer (op_id) und eine Uhrzeit (ts).
Darum kann die Offline-App auf der Kegelbahn ohne Netz sammeln und später nachschicken, ohne dass etwas doppelt zählt:
- schon gesehene Nummern werden einfach übersprungen,
- Strafen werden gezählt (+1 / −1) – zwei Handys = zwei Pumpen, kein Streit,
- beim Zustand (kegelt, schaut zu, fehlt …) gewinnt die neuere Uhrzeit.

So wird gerechnet (für Doofe 😄):
1. Jeder am Abend bekommt den Grundbetrag – je nach Zustand und Schalter (Zuschauer, Fehlende).
2. Wer nicht abgemeldet ist, zahlt den Extra-Betrag obendrauf.
3. Strafen „zahlt er selbst“ landen bei dem, der sie geschafft hat.
   Strafen „zahlen alle anderen“ (z. B. Alle Neune) landen bei allen ANDEREN, die mitkegeln.
4. Kegelbahn: aus der Kasse (Ausgabe), auf die Anwesenden verteilt oder gar nicht.
5. Offen = alles, was jemand je zahlen sollte − alles, was er eingezahlt hat.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import io
import json
import logging
import re
import secrets
import sqlite3
import tempfile
import threading
import time
import uuid
import zipfile
from collections.abc import Callable
from datetime import datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers.dispatcher import async_dispatcher_send
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    APP_URL,
    CURRENCIES,
    DEFAULT_SETTINGS,
    LANE_MODES,
    MAX_IMPORT_BYTES,
    MAX_LOG,
    MAX_SEEN_OPS,
    PAYERS,
    SIGNAL_UPDATE,
    STATUSES,
    STORAGE_KEY,
    STORAGE_VERSION,
    TEMPLATE_STRAFEN,
    VERSION,
)

_LOGGER = logging.getLogger(__name__)

LIST_KINDS = {"member": "members", "strafe": "strafen"}
VIEW_KEYS = ("abend", "kasse", "statistik")


def new_id() -> str:
    return uuid.uuid4().hex[:12]


_CUR_RE = re.compile(r"(?i)\b(EUR|CHF|SFr\.?|Fr\.|USD|US\$|GBP|PLN|CZK|DKK|SEK|NOK|HUF|zł|Kč|kr\.?|Ft)(?![a-z])|[€$£]")


def parse_money(value: Any) -> float:
    """„−1.234,56 €“, „-58,29“, „12.5“ → Zahl. Leer → 0."""
    if value is None:
        return 0.0
    if isinstance(value, bool):
        raise HomeAssistantError(f"„{value}“ ist kein Betrag")
    if isinstance(value, (int, float)):
        return round(float(value), 2)
    s = str(value).strip().replace("−", "-")
    s = _CUR_RE.sub("", s)
    s = s.replace(" ", "").replace(" ", "").replace(" ", "").replace("'", "").replace("’", "")
    if not s:
        return 0.0
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    elif s.count(".") > 1:
        s = s.replace(".", "")
    try:
        return round(float(s), 2)
    except ValueError as err:
        raise HomeAssistantError(f"„{value}“ ist kein Betrag") from err


def r2(v: float) -> float:
    return round(float(v) + 0.0, 2)


def _empty() -> dict[str, Any]:
    return {
        "members": [],   # 👥 Mitglieder UND Gäste (guest: True)
        "strafen": [],   # 💸 euer Sündenregister – alles selbst angelegt
        "abende": [],    # 🎳 Kegelabende
        "kasse": [],     # 🏦 Einzahlungen (in) und Ausgaben (out)
        "settings": dict(DEFAULT_SETTINGS),
        "setup_done": False,  # 🧭 Einrichtungs-Assistent schon durch?
        "log": [],
        "seen": [],
        "pin": None,
    }


def rules_of(settings: dict[str, Any]) -> dict[str, Any]:
    """📏 Die Regeln, die für einen Abend gelten (werden beim Start gemerkt – spätere Änderungen ändern alte Abende nicht)."""
    return {k: settings.get(k, DEFAULT_SETTINGS[k]) for k in ("base_fee", "watch_pays", "missing_pays", "unexcused_extra", "lane_mode", "lane_rate")}


def bill_evening(ev: dict[str, Any], members: dict[str, dict[str, Any]], strafen: dict[str, dict[str, Any]], settings: dict[str, Any]) -> dict[str, Any]:
    """🧾 Wer zahlt an diesem Abend was? Gibt {people: {mid: {...}}, lane: Kosten, lane_kasse: aus der Kasse} zurück."""
    rules = {**rules_of(settings), **(ev.get("rules") or {})}
    prices = ev.get("prices") or {}
    status: dict[str, str] = ev.get("status") or {}
    counts: dict[str, dict[str, int]] = ev.get("counts") or {}
    base = float(rules.get("base_fee") or 0)
    people: dict[str, dict[str, Any]] = {}
    for mid, st in status.items():
        guest = bool((members.get(mid) or {}).get("guest"))
        fee = 0.0
        if st == "play":
            fee = base
        elif st == "watch":
            fee = base if rules.get("watch_pays", True) else 0.0
        elif st in ("excused", "absent") and not guest:
            fee = base if rules.get("missing_pays", True) else 0.0
        extra = float(rules.get("unexcused_extra") or 0) if st == "absent" and not guest else 0.0
        people[mid] = {"status": st, "fee": r2(fee), "extra": r2(extra), "own": 0.0, "from_others": 0.0, "hand": 0.0, "lane": 0.0, "items": {}}

    def price(sid: str) -> tuple[float, str]:
        if sid in prices:
            p = prices[sid]
            return float(p[0]), str(p[1])
        s = strafen.get(sid) or {}
        return float(s.get("amount") or 0), str(s.get("payer") or "self")

    players = [m for m, p in people.items() if p["status"] == "play"]
    fines = not ev.get("no_fines")  # 🙌 „Strafen erlassen“: gezählt wird trotzdem (Statistik), bezahlt nicht
    for mid, per in counts.items():
        for sid, n in (per or {}).items():
            n = int(n or 0)
            if n <= 0:
                continue
            amount, payer = price(sid)
            if payer == "others":
                for oid in players:
                    if oid != mid:
                        people[oid]["from_others"] += n * amount if fines else 0.0
                        it = people[oid]["items"].setdefault(f"{sid}>{mid}", 0)
                        people[oid]["items"][f"{sid}>{mid}"] = it + n
                if mid in people:
                    people[mid]["items"][sid] = people[mid]["items"].get(sid, 0) + n  # 🎯 zählt für die Statistik, kostet ihn nix
            elif mid in people:
                people[mid]["own"] += n * amount if fines else 0.0
                people[mid]["items"][sid] = people[mid]["items"].get(sid, 0) + n
    for x in ev.get("extra") or []:  # ✍️ Strafe per Hand (eigener Betrag + Grund)
        if x.get("member") in people:
            people[x["member"]]["hand"] += float(x.get("amount") or 0) if fines else 0.0
    hours = float(ev.get("hours") or 0)
    lane = r2(hours * float(rules.get("lane_rate") or 0)) if rules.get("lane_mode") != "off" else 0.0
    lane_kasse = lane if rules.get("lane_mode") == "kasse" else 0.0
    if rules.get("lane_mode") == "split" and lane:
        present = [m for m, p in people.items() if p["status"] in ("play", "watch")]
        if present:
            share = lane / len(present)
            for m in present:
                people[m]["lane"] = share
    app_paid = ev.get("app_paid") or {}  # 📥 aus „Alle Neune“: was damals wirklich kassiert wurde
    total = 0.0
    for mid, p in people.items():
        if ev.get("imported"):
            p["total"] = r2(float(app_paid.get(mid, 0) or 0))
            total += p["total"]
            continue
        p["own"] = r2(p["own"])
        p["from_others"] = r2(p["from_others"])
        p["lane"] = r2(p["lane"])
        p["hand"] = r2(p["hand"])
        p["fines"] = r2(p["own"] + p["from_others"] + p["hand"])
        p["total"] = r2(p["fee"] + p["extra"] + p["fines"] + p["lane"])
        total += p["total"]
    return {"people": people, "lane": lane, "lane_kasse": lane_kasse, "total": r2(total)}


class KegelclubManager:
    """Hält die Daten, rechnet und meldet Änderungen an Karte und Sensoren."""

    def __init__(self, hass: HomeAssistant, store_key: str = STORAGE_KEY, entry_id: str = "", title: str = "Kegelclub") -> None:
        self.hass = hass
        # 🏠 Mehrere Clubs: der erste Club behält den Speicher „kegelclub“, weitere bekommen einen eigenen
        self.store_key = store_key
        self.primary = store_key == STORAGE_KEY
        self.entry_id = entry_id
        self.title = title
        self.signal = f"{SIGNAL_UPDATE}_{entry_id}" if entry_id else SIGNAL_UPDATE
        self._store: Store = Store(hass, STORAGE_VERSION, store_key)
        self.data: dict[str, Any] = _empty()
        self._listeners: list[Callable[[], None]] = []
        self._pin_fails = 0
        self._pin_locked_until = 0.0
        self.errors: list[dict[str, Any]] = []

    # ------------------------------------------------------------------ 💾 Laden / Speichern
    async def async_load(self) -> None:
        stored = await self._store.async_load()
        base = _empty()
        if isinstance(stored, dict):
            base.update({k: v for k, v in stored.items() if k in base})
            base["settings"] = {**DEFAULT_SETTINGS, **(stored.get("settings") or {})}
        self.data = base

    def _save(self) -> None:
        self._store.async_delay_save(lambda: self.data, 1.0)

    async def async_save_now(self) -> None:
        await self._store.async_save(self.data)

    @callback
    def async_start(self) -> None:
        """(Platzhalter – der Kegelclub braucht keinen Mitternachts-Wecker.)"""

    @callback
    def async_stop(self) -> None:
        """(nichts aufzuräumen)"""

    # ------------------------------------------------------------------ 📣 Melden
    @callback
    def add_listener(self, cb: Callable[[], None]) -> Callable[[], None]:
        self._listeners.append(cb)
        return lambda: self._listeners.remove(cb) if cb in self._listeners else None

    def _changed(self) -> None:
        if getattr(self.hass, "loop_thread_id", None) not in (None, threading.get_ident()):
            # 🧵 aus dem Hintergrund (Import) → zurück in Home Assistants Hauptschleife
            self.hass.loop.call_soon_threadsafe(self._changed)
            return
        self._save()
        for cb in list(self._listeners):
            cb()
        async_dispatcher_send(self.hass, self.signal)

    # ------------------------------------------------------------------ 🧮 Rechnen
    def _maps(self) -> tuple[dict[str, dict], dict[str, dict]]:
        return {m["id"]: m for m in self.data["members"]}, {s["id"]: s for s in self.data["strafen"]}

    def open_evening(self) -> dict[str, Any] | None:
        for ev in reversed(self.data["abende"]):
            if not ev.get("closed"):
                return ev
        return None

    def summary(self) -> dict[str, Any]:
        """Alle Zahlen für Karte und Sensoren."""
        d = self.data
        members, strafen = self._maps()
        charged: dict[str, float] = {m: 0.0 for m in members}
        lane_kasse = 0.0
        last = None
        for ev in d["abende"]:
            b = bill_evening(ev, members, strafen, d["settings"])
            if ev.get("closed"):  # 🎳 Kegelbahn geht erst beim Abschließen aus der Kasse
                lane_kasse += b["lane_kasse"]
            if ev.get("imported"):  # 📥 alte Abende aus der App: schon in der Kasse gebucht, keine offenen Beträge
                continue
            for mid, p in b["people"].items():
                charged[mid] = charged.get(mid, 0.0) + p["total"]
            if ev.get("closed") and (last is None or str(ev.get("date")) >= str(last.get("date"))):
                last = {"id": ev["id"], "date": ev.get("date"), "total": b["total"]}
        paid: dict[str, float] = {}
        k_in = k_out = 0.0
        for k in d["kasse"]:
            amt = float(k.get("amount") or 0)
            if k.get("kind") == "out":
                k_out += amt
            else:
                k_in += amt
                if k.get("member") and not k.get("imported"):
                    paid[k["member"]] = paid.get(k["member"], 0.0) + amt
        people = []
        open_total = 0.0
        for mid, m in members.items():
            debt = r2(charged.get(mid, 0.0) - paid.get(mid, 0.0))
            if debt > 0:
                open_total += debt
            people.append({"id": mid, "name": m.get("name"), "guest": bool(m.get("guest")), "charged": r2(charged.get(mid, 0.0)), "paid": r2(paid.get(mid, 0.0)), "debt": debt})
        kasse = float(d["settings"].get("start_balance") or 0) + k_in - k_out - lane_kasse
        ev = self.open_evening()
        return {
            "kasse": r2(kasse),
            "open": r2(open_total),
            "soll": r2(kasse + open_total),
            "lane_total": r2(lane_kasse),
            "people": people,
            "debtors": sum(1 for p in people if p["debt"] > 0),
            "running": ev["id"] if ev else None,
            "running_date": ev.get("date") if ev else None,
            "evenings": len(d["abende"]),
            "last": last,
        }

    def snapshot(self) -> dict[str, Any]:
        """Was die Karte bekommt (ohne interne Merkliste)."""
        out = {k: v for k, v in self.data.items() if k not in ("seen", "pin")}
        out["pin"] = bool(self.data.get("pin"))
        out["app_url"] = self._app_url()
        out["version"] = VERSION
        out["book"] = {"id": self.entry_id, "title": self.title, "primary": self.primary}
        return out

    def _app_url(self) -> str | None:
        """📱 Adresse der Offline-App von unterwegs (Nabu Casa bzw. externe https-Adresse) – wie bei der Einkaufsliste."""
        try:
            from homeassistant.helpers.network import NoURLAvailableError, get_url  # noqa: PLC0415
        except ImportError:  # pragma: no cover
            return None
        try:
            base = get_url(self.hass, allow_internal=False, allow_ip=False, require_ssl=True, prefer_cloud=True)
        except NoURLAvailableError:
            return None
        except Exception:  # noqa: BLE001
            return None
        return base.rstrip("/") + APP_URL + ("" if self.primary else "?buch=" + quote(self.title))

    # ------------------------------------------------------------------ 🔒 PIN (wie bei der Einkaufsliste)
    @staticmethod
    def _pin_hash(pin: str, salt: str) -> str:
        return salt + "$" + hashlib.sha256((salt + str(pin)).encode()).hexdigest()

    def check_pin(self, pin: str | None) -> bool:
        """PIN prüfen. 5× falsch = 60 Sekunden Pause (gegen Durchprobieren)."""
        if not self.data.get("pin"):
            return True
        left = self._pin_locked_until - time.monotonic()
        if left > 0:
            raise HomeAssistantError(f"Zu oft falsch – bitte {int(left) + 1} Sekunden warten")
        salt = self.data["pin"].split("$", 1)[0]
        ok = hmac.compare_digest(self._pin_hash(str(pin or ""), salt), self.data["pin"])
        if ok:
            self._pin_fails = 0
        else:
            self._pin_fails += 1
            if self._pin_fails >= 5:
                self._pin_fails = 0
                self._pin_locked_until = time.monotonic() + 60
        return ok

    def set_pin(self, pin: str | None, old: str | None = None) -> None:
        if self.data.get("pin") and not self.check_pin(old):
            raise HomeAssistantError("Die alte PIN stimmt nicht")
        pin = (pin or "").strip()
        if pin and not re.fullmatch(r"\d{4,8}", pin):
            raise HomeAssistantError("Die PIN muss 4 bis 8 Ziffern haben")
        self.data["pin"] = self._pin_hash(pin, secrets.token_hex(8)) if pin else None
        self._changed()

    def clear_pin(self) -> None:
        self.data["pin"] = None
        self._pin_fails = 0
        self._pin_locked_until = 0.0
        self._changed()

    # ------------------------------------------------------------------ ✏️ Ändern
    def find(self, kind: str, ref: str) -> dict[str, Any] | None:
        key = LIST_KINDS[kind]
        ref_l = str(ref).strip().lower()
        for it in self.data[key]:
            if it["id"] == ref or str(it.get("name", "")).strip().lower() == ref_l:
                return it
        return None

    def evening(self, ref: Any) -> dict[str, Any]:
        """Abend per ID oder Datum; „aktuell“/leer = der laufende Abend."""
        ref = str(ref or "").strip()
        if not ref or ref in ("aktuell", "current", "laufend"):
            ev = self.open_evening()
            if ev is None:
                raise HomeAssistantError("Es läuft gerade kein Kegelabend")
            return ev
        for ev in self.data["abende"]:
            if ev["id"] == ref or ev.get("date") == ref:
                return ev
        raise HomeAssistantError(f"Kegelabend „{ref}“ gibt es nicht")

    def apply(self, ops: list[dict[str, Any]], user: str | None = None) -> list[dict[str, Any]]:
        """Mehrere Änderungen auf einmal. Gibt pro Änderung {op_id, ok, error?} zurück."""
        results = []
        changed = False
        for op in ops:
            oid = str(op.get("op_id") or new_id())
            if oid in self.data["seen"]:
                results.append({"op_id": oid, "ok": True, "duplicate": True})
                continue
            try:
                text = self._describe(op)
                self._apply_one(op, user, oid)
                changed = True
                results.append({"op_id": oid, "ok": True})
                self._log(op, text, user)
            except HomeAssistantError as err:
                results.append({"op_id": oid, "ok": False, "error": str(err)})
                self._log_error(op, str(err), user)
            except (KeyError, TypeError, ValueError, AttributeError) as err:
                results.append({"op_id": oid, "ok": False, "error": f"ungültig: {err}"})
                self._log_error(op, f"ungültig: {err}", user)
            self.data["seen"].append(oid)
        self.data["seen"] = self.data["seen"][-MAX_SEEN_OPS:]
        if changed:
            self._changed()
        else:
            self._save()
        return results

    # ------------------------------------------------------------------ 📜 Verlauf
    def _eur(self, value: Any) -> str:
        try:
            v = float(value)
        except (TypeError, ValueError):
            return "?"
        code = (self.data.get("settings") or {}).get("currency") or "EUR"
        sym = CURRENCIES.get(code, code)
        return f"{v:,.2f} {sym}".replace(",", "X").replace(".", ",").replace("X", ".")

    def _mname(self, mid: Any) -> str:
        m = next((x for x in self.data["members"] if x["id"] == mid), None)
        return str((m or {}).get("name") or mid or "")

    def _sname(self, sid: Any) -> str:
        s = next((x for x in self.data["strafen"] if x["id"] == sid), None)
        return str((s or {}).get("name") or sid or "")

    def _describe(self, op: dict[str, Any]) -> str | None:
        """📜 Ein Satz für den Verlauf. None = nicht merken."""
        t = str(op.get("type") or "")
        what = {"member": "Mitglied", "strafe": "Strafe"}
        kind, _, verb = t.partition("_")
        if kind in what and verb == "save":
            item = op.get("item") or {}
            name = item.get("name") or (self.find(kind, item["id"]) or {}).get("name") if item.get("id") else item.get("name")
            if kind == "member" and item.get("guest"):
                what = {**what, "member": "Gast"}
            return f"✏️ {what[kind]} „{name or ''}“ {'geändert' if item.get('id') and self.find(kind, item['id']) else 'neu'}"
        if kind in what and verb == "delete":
            it = self.find(kind, str(op.get("id")))
            return f"🗑️ {what[kind]} „{(it or {}).get('name') or ''}“ gelöscht"
        if t == "abend_start":
            return f"🎳 Kegelabend {op.get('date') or ''} gestartet"
        if t == "abend_close":
            return "🏁 Kegelabend abgeschlossen" if op.get("value", True) is not False else "🔓 Kegelabend wieder geöffnet"
        if t == "abend_delete":
            return "🗑️ Kegelabend gelöscht"
        if t == "abend_count":
            n = int(op.get("delta") or 1)
            return f"{'💸' if n > 0 else '↩️'} {self._sname(op.get('strafe'))} {'+' if n > 0 else ''}{n} · {self._mname(op.get('member'))}"
        if t == "abend_status":
            st = {"play": "kegelt", "watch": "schaut zu", "excused": "abgemeldet", "absent": "fehlt (nicht abgemeldet)", "out": "nicht dabei"}.get(str(op.get("status")), "?")
            return f"👤 {self._mname(op.get('member'))}: {st}"
        if t == "abend_nofines":
            return "🙌 Strafen erlassen" if op.get("value", True) is not False else "💸 Strafen zählen wieder"
        if t == "abend_hours":
            return f"⏱️ Kegelbahn {op.get('hours')} Std."
        if t == "abend_extra_add":
            return f"✍️ {op.get('name') or 'Strafe'} {self._eur(abs(parse_money(op.get('amount', 0))))} · {self._mname(op.get('member'))}"
        if t == "abend_extra_delete":
            return "↩️ Strafe per Hand entfernt"
        if t == "pay":
            what = {"base": "Grundbetrag", "fines": "Strafen"}.get(str(op.get("tag")), "Einzahlung") if op.get("abend") else "Einzahlung"
            return f"💶 {what} {self._mname(op.get('member'))} {self._eur(parse_money(op.get('amount', 0)))}"
        if t == "kasse_add":
            sign = "−" if op.get("kind") == "out" else "+"
            return f"🏦 {op.get('name') or ('Ausgabe' if op.get('kind') == 'out' else 'Einnahme')} {sign}{self._eur(abs(parse_money(op.get('amount', 0))))}"
        if t == "kasse_delete":
            return "🗑️ Kassenbuchung gelöscht"
        if t == "settings":
            return "⚙️ Einstellungen geändert"
        if t == "order":
            return "⠿ Reihenfolge geändert"
        if t == "template":
            return "📋 Beispiel-Strafen geladen"
        return None

    def _log(self, op: dict[str, Any], text: str | None, user: str | None) -> None:
        if not text or self.data["settings"].get("log_on", True) is False:
            return
        ts = int(op.get("ts") or dt_util.utcnow().timestamp() * 1000)
        log = self.data.setdefault("log", [])
        log.append({"ts": ts, "by": user, "text": text[:120]})
        self.data["log"] = log[-MAX_LOG:]

    # ------------------------------------------------------------------ 🩺 Gesundheit
    def _log_error(self, op: dict[str, Any], error: str, user: str | None) -> None:
        self.errors.append({"ts": int(dt_util.utcnow().timestamp() * 1000), "type": str(op.get("type"))[:40], "error": error[:200], "by": user})
        self.errors = self.errors[-50:]

    def clear_errors(self) -> None:
        self.errors = []

    def health(self) -> dict[str, Any]:
        size = len(json.dumps(self.data, ensure_ascii=False).encode("utf-8"))
        counts = {k: len(self.data.get(k) or []) for k in ("members", "strafen", "abende", "kasse", "log")}
        return {"errors": list(reversed(self.errors)), "size": size, "counts": counts, "seen": len(self.data.get("seen") or [])}

    def factory_reset(self) -> None:
        """💣 Werkseinstellungen: alles zurück auf Anfang – nur die PIN bleibt."""
        pin = self.data.get("pin")
        self.data = _empty()
        self.data["pin"] = pin
        self.errors = []
        self._changed()

    # ------------------------------------------------------------------ 🔧 Eine Änderung
    def _apply_one(self, op: dict[str, Any], user: str | None, oid: str) -> None:
        t = op.get("type")
        ts = int(op.get("ts") or dt_util.utcnow().timestamp() * 1000)
        d = self.data

        if t in ("member_save", "strafe_save"):
            self._save_item(t.split("_")[0], op.get("item") or {}, ts)
        elif t in ("member_delete", "strafe_delete"):
            kind = t.split("_")[0]
            item = self.find(kind, str(op["id"]))
            if item is None:
                return
            if kind == "member" and any(item["id"] in (ev.get("status") or {}) for ev in d["abende"]) or kind == "member" and any(k.get("member") == item["id"] for k in d["kasse"]):
                item["active"] = False  # 👋 war schon bei Abenden dabei → nur ausblenden, damit die Rechnung stimmt
                item["left"] = True
                return
            if kind == "strafe" and any(item["id"] in (per or {}) for ev in d["abende"] for per in (ev.get("counts") or {}).values()):
                item["active"] = False  # 💸 wurde schon benutzt → nur ausblenden
                item["left"] = True
                return
            d[LIST_KINDS[kind]] = [x for x in d[LIST_KINDS[kind]] if x["id"] != item["id"]]
        elif t == "restore":
            kind = op.get("kind")
            item = op.get("item") or {}
            if kind in LIST_KINDS and item.get("id"):
                lst = d[LIST_KINDS[kind]]
                old = next((x for x in lst if x["id"] == item["id"]), None)
                if old is not None:
                    old.update({k: v for k, v in item.items() if k != "left"})
                    old.pop("left", None)
                else:
                    lst.insert(min(int(op.get("index") or len(lst)), len(lst)), dict(item))
            elif kind == "kasse" and item.get("id") and not any(k["id"] == item["id"] for k in d["kasse"]):
                d["kasse"].append(dict(item))
            elif kind == "abend" and item.get("id") and not any(e["id"] == item["id"] for e in d["abende"]):
                d["abende"].append(dict(item))
                d["abende"].sort(key=lambda e: (str(e.get("date") or ""), e.get("started") or 0))
        elif t == "order":
            kind = op.get("kind")
            if kind not in LIST_KINDS:
                raise HomeAssistantError("Unbekannte Liste")
            pos = {x: i for i, x in enumerate(op.get("ids") or [])}
            lst = d[LIST_KINDS[kind]]
            d[LIST_KINDS[kind]] = [x for _, x in sorted(enumerate(lst), key=lambda p: (pos.get(p[1]["id"], 10**6 + p[0])))]
        elif t == "template":
            have = {s["name"].casefold() for s in d["strafen"]}
            for s in TEMPLATE_STRAFEN:
                if s["name"].casefold() not in have:
                    d["strafen"].append({"id": new_id(), "active": True, **s})
        elif t == "setup_done":
            d["setup_done"] = True
        elif t == "abend_start":
            if self.open_evening() is not None:
                raise HomeAssistantError("Es läuft schon ein Kegelabend – erst abschließen")
            date = str(op.get("date") or dt_util.now().date().isoformat())[:10]
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise HomeAssistantError("Datum bitte als JJJJ-MM-TT")
            eid = str(op.get("id") or oid)
            if any(e["id"] == eid for e in d["abende"]):
                return
            status = {m["id"]: "play" for m in d["members"] if m.get("active", True) and not m.get("guest")}
            hours = op.get("hours", d["settings"].get("lane_hours", 3))
            d["abende"].append({
                "id": eid, "date": date, "started": ts, "closed": False, "hours": float(hours or 0), "note": "",
                "status": status, "status_ts": {}, "counts": {},
                "rules": rules_of(d["settings"]),
                "prices": {s["id"]: [float(s.get("amount") or 0), s.get("payer") or "self"] for s in d["strafen"]},
                "by": user,
            })
            d["abende"].sort(key=lambda e: (str(e.get("date") or ""), e.get("started") or 0))
        elif t == "abend_status":
            ev = self.evening(op.get("abend"))
            mid = str(op["member"])
            st = str(op.get("status"))
            if not any(m["id"] == mid for m in d["members"]):
                raise HomeAssistantError("Dieses Mitglied gibt es nicht")
            if (ev.get("status_ts") or {}).get(mid, 0) > ts:
                return  # 🕒 neuere Änderung gewinnt
            ev.setdefault("status_ts", {})[mid] = ts
            if st in ("excused", "absent", "out"):  # 💶 nicht da → am Tisch kassierter Grundbetrag zurück (steht dann unter „Wer schuldet was“)
                d["kasse"] = [k for k in d["kasse"] if not (k.get("abend") == ev["id"] and k.get("member") == mid and k.get("tag") == "base")]
            if st == "out":  # 👋 ganz aus dem Abend nehmen (nur für Gäste gedacht)
                ev["status"].pop(mid, None)
                return
            if st not in STATUSES:
                raise HomeAssistantError("Unbekannter Zustand")
            ev["status"][mid] = st
        elif t == "abend_count":
            ev = self.evening(op.get("abend"))
            mid, sid = str(op["member"]), str(op["strafe"])
            if mid not in (ev.get("status") or {}):
                raise HomeAssistantError(f"{self._mname(mid)} ist an dem Abend nicht dabei")
            s = next((x for x in d["strafen"] if x["id"] == sid), None)
            if s is None:
                raise HomeAssistantError("Diese Strafe gibt es nicht")
            ev.setdefault("prices", {}).setdefault(sid, [float(s.get("amount") or 0), s.get("payer") or "self"])
            per = ev.setdefault("counts", {}).setdefault(mid, {})
            per[sid] = max(0, int(per.get(sid, 0)) + int(op.get("delta") or 1))
            if not per[sid]:
                per.pop(sid)
        elif t == "abend_hours":
            ev = self.evening(op.get("abend"))
            h = float(str(op.get("hours", 0)).replace(",", "."))
            if h < 0 or h > 24:
                raise HomeAssistantError("Stunden: 0 bis 24")
            ev["hours"] = round(h, 2)
        elif t == "abend_nofines":
            self.evening(op.get("abend"))["no_fines"] = op.get("value", True) is not False
        elif t == "abend_note":
            self.evening(op.get("abend"))["note"] = str(op.get("note") or "")[:500]
        elif t == "abend_extra_add":  # ✍️ Strafe per Hand
            ev = self.evening(op.get("abend"))
            mid = str(op.get("member") or "")
            if mid not in (ev.get("status") or {}):
                raise HomeAssistantError("Diese Person ist an dem Abend nicht dabei")
            amount = abs(parse_money(op.get("amount")))
            if amount <= 0:
                raise HomeAssistantError("Betrag muss größer als 0 sein")
            xid = str(op.get("id") or oid)
            lst = ev.setdefault("extra", [])
            if not any(x["id"] == xid for x in lst):
                lst.append({"id": xid, "member": mid, "name": str(op.get("name") or "Strafe")[:60], "amount": amount, "ts": ts})
        elif t == "abend_extra_delete":
            ev = self.evening(op.get("abend"))
            ev["extra"] = [x for x in ev.get("extra") or [] if x["id"] != op.get("id")]
        elif t == "abend_date":
            date = str(op.get("date") or "")[:10]
            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
                raise HomeAssistantError("Datum bitte als JJJJ-MM-TT")
            self.evening(op.get("abend"))["date"] = date
            d["abende"].sort(key=lambda e: (str(e.get("date") or ""), e.get("started") or 0))
        elif t == "abend_close":
            ev = self.evening(op.get("abend"))
            close = op.get("value", True) is not False
            if not close and any(not e.get("closed") and e is not ev for e in d["abende"]):
                raise HomeAssistantError("Es läuft schon ein anderer Kegelabend")
            ev["closed"] = close
            if close:
                ev["closed_ts"] = ts
        elif t == "abend_delete":
            d["abende"] = [e for e in d["abende"] if e["id"] != op.get("id")]
        elif t == "pay":
            mid = str(op["member"])
            if not any(m["id"] == mid for m in d["members"]):
                raise HomeAssistantError("Dieses Mitglied gibt es nicht")
            amount = parse_money(op.get("amount"))
            if amount <= 0:
                raise HomeAssistantError("Betrag muss größer als 0 sein")
            kid = str(op.get("id") or oid)
            if not any(k["id"] == kid for k in d["kasse"]):
                entry = {"id": kid, "ts": ts, "kind": "in", "member": mid, "amount": amount, "name": str(op.get("name") or "Einzahlung")[:80], "by": user}
                if op.get("abend"):  # 💶 am Kegeltisch kassiert: gehört zu diesem Abend (Grundbetrag oder Strafen)
                    entry["abend"] = str(op["abend"])
                    entry["tag"] = "base" if op.get("tag") == "base" else "fines"
                d["kasse"].append(entry)
        elif t == "kasse_add":
            kind = "out" if op.get("kind") == "out" else "in"
            amount = abs(parse_money(op.get("amount")))
            if amount <= 0:
                raise HomeAssistantError("Betrag muss größer als 0 sein")
            kid = str(op.get("id") or oid)
            mid = op.get("member") or None
            if not any(k["id"] == kid for k in d["kasse"]):
                d["kasse"].append({"id": kid, "ts": int(op.get("when") or ts), "kind": kind, "member": mid if kind == "in" else None, "amount": amount,
                                   "name": str(op.get("name") or ("Ausgabe" if kind == "out" else "Einnahme"))[:80], "by": user})
        elif t == "kasse_edit":
            k = next((x for x in d["kasse"] if x["id"] == op.get("id")), None)
            if k is None:
                raise HomeAssistantError("Diese Buchung gibt es nicht")
            if "name" in op:
                k["name"] = str(op["name"] or "")[:80]
            if "amount" in op:
                amount = abs(parse_money(op["amount"]))
                if amount <= 0:
                    raise HomeAssistantError("Betrag muss größer als 0 sein")
                k["amount"] = amount
        elif t == "kasse_delete":
            d["kasse"] = [k for k in d["kasse"] if k["id"] != op.get("id")]
        elif t == "settings":
            self._settings(op.get("settings") or {})
        elif t == "log_clear":
            d["log"] = []
        else:
            raise HomeAssistantError(f"Unbekannte Änderung „{t}“")

    def _settings(self, new: dict[str, Any]) -> None:
        st = self.data["settings"]
        for k, v in new.items():
            if k not in DEFAULT_SETTINGS:
                continue
            if k in ("base_fee", "unexcused_extra", "lane_rate", "start_balance"):
                v = parse_money(v)
                if k != "start_balance" and v < 0:
                    raise HomeAssistantError("Beträge dürfen nicht negativ sein")
            elif k == "lane_hours":
                v = float(str(v).replace(",", "."))
            elif k == "lane_mode":
                if v not in LANE_MODES:
                    raise HomeAssistantError("Unbekannte Einstellung für die Kegelbahn")
            elif k == "currency":
                if v not in CURRENCIES:
                    raise HomeAssistantError("Unbekannte Währung")
            elif k == "view":
                v = {**(st.get("view") or {}), **{x: bool(y) for x, y in (v or {}).items() if x in VIEW_KEYS}}
            else:
                v = bool(v)
            st[k] = v
        # 📏 Regeln gelten auch für den laufenden Abend (abgeschlossene bleiben wie sie waren)
        ev = self.open_evening()
        if ev is not None and any(k in new for k in ("base_fee", "watch_pays", "missing_pays", "unexcused_extra", "lane_mode", "lane_rate")):
            ev["rules"] = rules_of(st)

    def _save_item(self, kind: str, item: dict[str, Any], ts: int) -> dict[str, Any]:
        key = LIST_KINDS[kind]
        lst = self.data[key]
        old = next((x for x in lst if x["id"] == item.get("id")), None) if item.get("id") else None
        new = dict(old) if old else {"id": str(item.get("id") or new_id()), "active": True}
        if "name" in item:
            name = str(item["name"] or "").strip()[:60]
            if not name:
                raise HomeAssistantError("Name fehlt")
            if any(x is not old and str(x.get("name", "")).casefold() == name.casefold() and x.get("active", True) for x in lst):
                raise HomeAssistantError(f"„{name}“ gibt es schon")
            new["name"] = name
        elif not old:
            raise HomeAssistantError("Name fehlt")
        if "active" in item:
            new["active"] = bool(item["active"])
            if new["active"]:
                new.pop("left", None)
        if kind == "member":
            if "guest" in item:
                new["guest"] = bool(item["guest"])
            if "note" in item:
                new["note"] = str(item["note"] or "")[:200]
            if "photo" in item:  # 📸 kleines Foto als data-URL (Karte schneidet es auf 128 px zu)
                ph = str(item["photo"] or "")
                if ph and (not re.match(r"^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$", ph) or len(ph) > 120_000):
                    raise HomeAssistantError("Foto ist zu groß oder kein Bild")
                if ph:
                    new["photo"] = ph
                else:
                    new.pop("photo", None)
        else:
            if "amount" in item:
                amount = parse_money(item["amount"])
                if amount < 0:
                    raise HomeAssistantError("Betrag darf nicht negativ sein")
                new["amount"] = amount
            elif "amount" not in new:
                new["amount"] = 0.0
            if "payer" in item:
                if item["payer"] not in PAYERS:
                    raise HomeAssistantError("Wer zahlt? Unbekannt")
                new["payer"] = item["payer"]
            new.setdefault("payer", "self")
            if "icon" in item:
                icon = str(item["icon"] or "").strip()[:40]
                new["icon"] = icon if re.fullmatch(r"mdi:[a-z0-9-]+", icon) else "mdi:bowling"
            new.setdefault("icon", "mdi:bowling")
        if old:
            old.clear()
            old.update(new)
            if kind == "strafe":  # 💸 Preis ändern: gilt auch für den laufenden Abend
                ev = self.open_evening()
                if ev is not None and old["id"] in (ev.get("prices") or {}):
                    ev["prices"][old["id"]] = [float(old.get("amount") or 0), old.get("payer") or "self"]
            return old
        lst.append(new)
        if kind == "strafe":
            ev = self.open_evening()
            if ev is not None:
                ev.setdefault("prices", {})[new["id"]] = [float(new.get("amount") or 0), new.get("payer") or "self"]
        if kind == "member" and not new.get("guest"):
            ev = self.open_evening()  # 👤 neues Mitglied während des Abends: gleich mit dabei
            if ev is not None:
                ev["status"].setdefault(new["id"], "play")
        return new

    # ------------------------------------------------------------------ 💾 Sichern & Einlesen
    def export_json(self) -> dict[str, Any]:
        out = {k: self.data[k] for k in ("members", "strafen", "abende", "kasse", "settings")}
        return {"kegelclub": 1, "version": VERSION, "exported": dt_util.utcnow().isoformat(), **out}

    def import_file(self, name: str, b64: str, apply: bool = False, replace: bool = False) -> dict[str, Any]:
        """📥 Datei einlesen: eigene Sicherung (.json) oder die Datei aus der App „Alle Neune“ (SQLite, auch in .zip).

        apply=False → nur Vorschau, nichts wird geändert."""
        try:
            raw = base64.b64decode(b64 or "", validate=False)
        except (ValueError, TypeError) as err:
            raise HomeAssistantError("Die Datei ließ sich nicht lesen") from err
        if not raw:
            raise HomeAssistantError("Die Datei ist leer")
        if len(raw) > MAX_IMPORT_BYTES:
            raise HomeAssistantError("Die Datei ist zu groß (höchstens 8 MB)")
        if raw[:2] == b"PK":  # 🗜️ ZIP: die erste Datenbank darin nehmen
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as z:
                    inner = next((n for n in z.namelist() if not n.endswith("/") and z.read(n)[:16].startswith(b"SQLite format 3")), None)
                    if inner is None:
                        inner = next((n for n in z.namelist() if n.lower().endswith(".json")), None)
                    if inner is None:
                        raise HomeAssistantError("In der ZIP-Datei ist keine Datenbank")
                    raw, name = z.read(inner), inner
            except zipfile.BadZipFile as err:
                raise HomeAssistantError("Die ZIP-Datei ist kaputt") from err
        if raw.startswith(b"SQLite format 3"):
            return self._import_sqlite(raw, apply, replace)  # 🎳 „Alle Neune“
        text = raw.decode("utf-8-sig", errors="replace").strip()
        if text.startswith("{"):
            return self._import_json(text, apply, replace)
        raise HomeAssistantError("Unbekanntes Dateiformat – erwartet wird die Sicherung aus der Karte (.json) oder die Datei aus „Alle Neune“")

    def _import_json(self, text: str, apply: bool, replace: bool) -> dict[str, Any]:
        try:
            data = json.loads(text)
        except json.JSONDecodeError as err:
            raise HomeAssistantError("Die JSON-Datei ist kaputt") from err
        if not isinstance(data, dict) or "kegelclub" not in data:
            raise HomeAssistantError("Das ist keine Kegelclub-Sicherung")
        counts = {k: len(data.get(k) or []) for k in ("members", "strafen", "abende", "kasse")}
        res = {"format": "sicherung", "counts": counts, "applied": False}
        if not apply:
            return res
        if not replace:
            raise HomeAssistantError("Eine Sicherung ersetzt immer alles – bitte „ersetzen“ wählen")
        pin = self.data.get("pin")
        base = _empty()
        for k in ("members", "strafen", "abende", "kasse"):
            base[k] = [x for x in (data.get(k) or []) if isinstance(x, dict) and x.get("id")]
        base["settings"] = {**DEFAULT_SETTINGS, **{k: v for k, v in (data.get("settings") or {}).items() if k in DEFAULT_SETTINGS}}
        base["setup_done"] = True
        base["pin"] = pin
        base["log"] = self.data.get("log") or []
        self.data = base
        self._log({"type": "import"}, "📥 Sicherung eingelesen", None)
        self._changed()
        res["applied"] = True
        return res

    def _import_sqlite(self, raw: bytes, apply: bool, replace: bool) -> dict[str, Any]:
        """🎳 Datei aus der App „Alle Neune“ (Export der Datenbank). Kennt sie die Tabellen nicht, wird nur geschaut, was drin ist."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "import.db"
            path.write_bytes(raw)
            try:
                con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
                tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            except sqlite3.DatabaseError as err:
                raise HomeAssistantError("Die Datenbank ließ sich nicht lesen") from err
            need = {"spieler", "straftyp", "kegelabend", "kegelabendteilnehmer", "StrafeKegelabend", "buchung", "kegelclub"}
            if not need <= tables:
                con.close()
                return self._import_sqlite_generic(raw, apply, replace)
            try:
                plan = read_alle_neune(con)
            except (sqlite3.DatabaseError, KeyError, TypeError, ValueError) as err:
                raise HomeAssistantError(f"Die Datei aus „Alle Neune“ ließ sich nicht lesen ({err})") from err
            finally:
                con.close()
        preview = {
            "format": "alle_neune", "club": plan["club"], "applied": False,
            "counts": {"members": sum(1 for m in plan["members"] if not m["guest"] and m["active"]), "former": sum(1 for m in plan["members"] if not m["guest"] and not m["active"]),
                       "guests": sum(1 for m in plan["members"] if m["guest"]), "strafen": len(plan["strafen"]), "abende": len(plan["abende"]), "kasse": len(plan["kasse"])},
            "kasse_total": plan["kasse_total"], "first": plan["abende"][0]["date"] if plan["abende"] else None, "last": plan["abende"][-1]["date"] if plan["abende"] else None,
            "base_fee": plan["settings"].get("base_fee"),
            "strafen": [{"name": x["name"], "amount": x["amount"], "payer": x["payer"], "active": x["active"]} for x in plan["strafen"]],
        }
        if not apply:
            return preview
        if not replace and (self.data["abende"] or self.data["kasse"]):
            raise HomeAssistantError("Hier gibt es schon Abende oder Kassenbuchungen – bitte „alles ersetzen“ wählen")
        pin, log = self.data.get("pin"), self.data.get("log") or []
        base = _empty()
        base.update({k: plan[k] for k in ("members", "strafen", "abende", "kasse")})
        base["settings"] = {**self.data["settings"], **plan["settings"]}
        base["setup_done"] = True
        base["pin"], base["log"] = pin, log
        self.data = base
        c = preview["counts"]
        self._log({"type": "import"}, f"📥 Aus Alle Neune: {c['abende']} Abende, {c['members'] + c['former'] + c['guests']} Personen, {c['kasse']} Kassenbuchungen", None)
        self._changed()
        preview["applied"] = True
        return preview

    def _import_sqlite_generic(self, raw: bytes, apply: bool, replace: bool) -> dict[str, Any]:
        """🔎 Unbekannte Datenbank: Tabellen ansehen und Mitglieder + Strafen herausfischen.

        Ehrlich: Den genauen Aufbau der App-Datenbank kennen wir (noch) nicht. Darum sucht der Import nach
        Tabellen, deren Namen nach Mitgliedern/Strafen klingen, und zeigt vorher, was er gefunden hat."""
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "import.db"
            path.write_bytes(raw)
            con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
            try:
                con.row_factory = sqlite3.Row
                tables = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'android_metadata'")]
                info = []
                found_members: list[dict[str, Any]] = []
                found_strafen: list[dict[str, Any]] = []
                for tb in tables:
                    cols = [r[1] for r in con.execute(f'PRAGMA table_info("{tb}")')]
                    try:
                        rows = con.execute(f'SELECT COUNT(*) FROM "{tb}"').fetchone()[0]
                    except sqlite3.DatabaseError:
                        rows = 0
                    info.append({"name": tb, "rows": rows, "cols": cols[:20]})
                    low = tb.lower()
                    name_col = next((c for c in cols if c.lower() in ("name", "vorname", "bezeichnung", "title", "titel")), None) or next((c for c in cols if "name" in c.lower()), None)
                    if not name_col:
                        continue
                    if re.search(r"mitglied|member|kegler|spieler|person|player|gast|guest", low):
                        guest_col = next((c for c in cols if re.search(r"gast|guest", c.lower())), None)
                        last_col = next((c for c in cols if c.lower() in ("nachname", "lastname", "last_name", "surname")), None)
                        for r in con.execute(f'SELECT * FROM "{tb}" LIMIT 500'):
                            nm = " ".join(str(r[c]).strip() for c in (name_col, last_col) if c and r[c] not in (None, ""))
                            if nm:
                                guest = bool(r[guest_col]) if guest_col else bool(re.search(r"gast|guest", low))
                                found_members.append({"name": nm[:60], "guest": guest})
                    elif re.search(r"strafe|penalt|fine|suende|sünde|vergehen", low):
                        amt_col = next((c for c in cols if re.search(r"betrag|amount|preis|price|kosten|cost|wert|value|euro|geld", c.lower())), None)
                        for r in con.execute(f'SELECT * FROM "{tb}" LIMIT 300'):
                            nm = str(r[name_col] or "").strip()
                            if not nm:
                                continue
                            amount = 0.0
                            if amt_col is not None and r[amt_col] is not None:
                                try:
                                    amount = parse_money(r[amt_col])
                                    if isinstance(r[amt_col], int) and amount >= 20:  # 🪙 ganze Zahl, sieht nach Cent aus
                                        amount = round(amount / 100, 2)
                                except HomeAssistantError:
                                    amount = 0.0
                            found_strafen.append({"name": nm[:60], "amount": amount})
            except sqlite3.DatabaseError as err:
                raise HomeAssistantError("Die Datenbank ließ sich nicht lesen") from err
            finally:
                con.close()

        def dedupe(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
            seen: set[str] = set()
            out = []
            for it in items:
                k = it["name"].casefold()
                if k not in seen:
                    seen.add(k)
                    out.append(it)
            return out

        found_members, found_strafen = dedupe(found_members), dedupe(found_strafen)
        res = {"format": "alle_neune", "tables": info, "members": found_members, "strafen": found_strafen, "applied": False}
        if not apply:
            return res
        if replace:
            self.data["members"] = [m for m in self.data["members"] if any(m["id"] in (e.get("status") or {}) for e in self.data["abende"])]
            self.data["strafen"] = [s for s in self.data["strafen"] if any(s["id"] in (per or {}) for e in self.data["abende"] for per in (e.get("counts") or {}).values())]
        have_m = {m["name"].casefold() for m in self.data["members"]}
        have_s = {s["name"].casefold() for s in self.data["strafen"]}
        added_m = added_s = 0
        for m in found_members:
            if m["name"].casefold() not in have_m:
                self.data["members"].append({"id": new_id(), "name": m["name"], "guest": m["guest"], "active": True})
                added_m += 1
        for s in found_strafen:
            if s["name"].casefold() not in have_s:
                self.data["strafen"].append({"id": new_id(), "name": s["name"], "amount": s["amount"], "payer": "self", "icon": "mdi:bowling", "active": True})
                added_s += 1
        self.data["setup_done"] = True
        self._log({"type": "import"}, f"📥 Aus Alle Neune: {added_m} Mitglieder, {added_s} Strafen", None)
        self._changed()
        res.update({"applied": True, "added_members": added_m, "added_strafen": added_s})
        return res


def today_iso() -> str:
    return datetime.now().date().isoformat()


# 🎨 passende Symbole zu typischen Strafen-Namen (sonst ein Kegel)
_ICONS = [(r"pump", "mdi:arm-flex-outline"), (r"neun|neuen", "mdi:target"), (r"kling|glock", "mdi:bell-ring-outline"), (r"schnaps", "mdi:numeric"),
          (r"durchl|durchkeg", "mdi:sync"), (r"versp|zu sp|spät", "mdi:clock-alert-outline"), (r"handy|telefon", "mdi:cellphone"), (r"kranz", "mdi:crown-outline"),
          (r"kugel", "mdi:circle-outline"), (r"rinne|gosse", "mdi:arrow-down-bold-outline")]


def guess_icon(name: str) -> str:
    low = name.lower()
    return next((ic for rx, ic in _ICONS if re.search(rx, low)), "mdi:bowling")


def _nice_name(name: str) -> str:
    """„Mustermann, Max“ → „Max Mustermann“ (so steht es in der App)."""
    name = re.sub(r"\s+", " ", str(name or "")).strip()
    if name.count(",") == 1:
        last, first = (x.strip() for x in name.split(","))
        if first and last:
            return f"{first} {last}"
    return name


def _ts(text: Any) -> int:
    """„2026-09-19 22:20:45.0“ → Millisekunden."""
    raw = str(text or "").replace("T", " ")
    for fmt, n in (("%Y-%m-%d %H:%M:%S", 19), ("%Y-%m-%d", 10)):
        try:
            dt = datetime.strptime(raw[:n], fmt)
            return int(dt.replace(tzinfo=dt_util.DEFAULT_TIME_ZONE).timestamp() * 1000)
        except ValueError:
            continue
    return 0


def read_alle_neune(con: sqlite3.Connection) -> dict[str, Any]:
    """🎳 Liest die Datenbank der App „Alle Neune“ und baut daraus unsere Daten.

    So ist die App aufgebaut (Beträge immer in Cent):
    - spieler: alle Personen · kegelclubmitglied = 1 → Mitglied, sonst Gast/Ehemalig · kegelclubmitglieder: wer je Mitglied war
    - straftyp: Strafen · „X (Andere)“ = das zahlen alle anderen (die App bucht es direkt bei den Zahlern)
    - kegelabend + kegelabendteilnehmer: wer an welchem Abend da war
    - StrafeKegelabend: wie oft wer welche Strafe hatte · buchung: die ganze Kegelkasse
    """
    con.row_factory = sqlite3.Row
    club = con.execute("SELECT * FROM kegelclub ORDER BY kegelclub_id LIMIT 1").fetchone()
    if club is None:
        raise ValueError("kein Kegelclub in der Datei")
    cid = club["kegelclub_id"]
    cols = {r[1] for r in con.execute("PRAGMA table_info(kegelclub)")}
    settings: dict[str, Any] = {}
    if "startgeld" in cols and club["startgeld"] is not None:
        settings["base_fee"] = round(int(club["startgeld"]) / 100, 2)
    if "abwesendeAbrechnung" in cols and club["abwesendeAbrechnung"] is not None:
        settings["missing_pays"] = int(club["abwesendeAbrechnung"]) != 0
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}

    # 👥 Personen
    ever = {r[0] for r in con.execute("SELECT spieler_id FROM kegelclubmitglieder WHERE kegelclub_id=?", (cid,))} if "kegelclubmitglieder" in tables else set()
    members, mid_of = [], {}
    for r in con.execute("SELECT * FROM spieler WHERE kegelclub_id=? OR kegelclub_id IS NULL ORDER BY spieler_id", (cid,)):
        now_member = bool(r["kegelclubmitglied"])
        guest = not now_member and r["spieler_id"] not in ever
        mid = f"an{r['spieler_id']}"
        mid_of[r["spieler_id"]] = mid
        members.append({"id": mid, "name": _nice_name(r["name"])[:60], "guest": guest, "active": now_member or guest, **({} if now_member or guest else {"left": True})})
    order = {False: 0, True: 1}
    members.sort(key=lambda m: (order[m["guest"]], not m["active"], m["name"].casefold()))

    # 💸 Strafen – „X (Andere)“ wird mit „X“ zusammengelegt: eine Strafe, die alle anderen zahlen
    active_ids = {r[0] for r in con.execute("SELECT straftyp_id FROM kegelclubstrafe WHERE kegelclub_id=?", (cid,))} if "kegelclubstrafe" in tables else None
    rows = list(con.execute("SELECT * FROM straftyp ORDER BY straftyp_id"))
    by_name = {re.sub(r"\s+", " ", str(r["bezeichnung"])).strip().casefold(): r for r in rows}
    others_of: dict[int, int] = {}  # „(Andere)“-ID → Haupt-ID
    for r in rows:
        m = re.fullmatch(r"(.+?)\s*\(\s*andere\s*\)", str(r["bezeichnung"]).strip(), re.I)
        if m and m.group(1).strip().casefold() in by_name:
            others_of[r["straftyp_id"]] = by_name[m.group(1).strip().casefold()]["straftyp_id"]
    main_of_others = {v: k for k, v in others_of.items()}
    strafen, sid_of, prices = [], {}, {}
    for r in rows:
        tid = r["straftyp_id"]
        if tid in others_of:
            continue
        name = re.sub(r"\s+", " ", str(r["bezeichnung"])).strip()
        payer, cents = "self", r["betrag"] or 0
        if tid in main_of_others:
            payer = "others"
            cents = next((x["betrag"] for x in rows if x["straftyp_id"] == main_of_others[tid]), cents) or 0
        active = active_ids is None or tid in active_ids or main_of_others.get(tid) in (active_ids or set())
        sid = f"an{tid}"
        sid_of[tid] = sid
        if tid in main_of_others:
            sid_of[main_of_others[tid]] = None  # 🎯 die „(Andere)“-Zeilen sind nur die Gegenbuchung
        amount = round(int(cents) / 100, 2)
        strafen.append({"id": sid, "name": name[:60], "amount": amount, "payer": payer, "icon": guess_icon(name), "active": bool(active), **({} if active else {"left": True})})
        prices[sid] = [amount, payer]
    strafen.sort(key=lambda x: not x["active"])

    # 🎳 Abende
    abende = []
    attend: dict[int, set[int]] = {}
    for r in con.execute("SELECT kegelabend_id, spieler_id FROM kegelabendteilnehmer"):
        attend.setdefault(r[0], set()).add(r[1])
    counts: dict[int, dict[str, dict[str, int]]] = {}
    for r in con.execute("SELECT kegelabend_id, spieler_id, straftyp_id, anzahl FROM StrafeKegelabend WHERE anzahl > 0"):
        sid = sid_of.get(r[2])
        mid = mid_of.get(r[1])
        if sid and mid:
            per = counts.setdefault(r[0], {}).setdefault(mid, {})
            per[sid] = per.get(sid, 0) + int(r[3])
    paid: dict[int, dict[str, float]] = {}
    absent: dict[int, set[str]] = {}
    for r in con.execute("SELECT kegelabend_id, spieler_id, buchungBetrag, buchungBezeichnung FROM buchung WHERE kegelabend_id IS NOT NULL AND spieler_id IS NOT NULL"):
        mid = mid_of.get(r[1])
        if not mid:
            continue
        p = paid.setdefault(r[0], {})
        p[mid] = round(p.get(mid, 0.0) + int(r[2]) / 100, 2)
        if "nicht anwesend" in str(r[3]).lower():
            absent.setdefault(r[0], set()).add(mid)
    for r in con.execute("SELECT * FROM kegelabend WHERE kegelclub_id=? ORDER BY datum", (cid,)):
        aid = r["kegelabend_id"]
        status = {mid_of[s]: "play" for s in attend.get(aid, set()) if s in mid_of}
        for mid in absent.get(aid, set()):
            status.setdefault(mid, "excused")
        ts = _ts(r["datum"])
        abende.append({"id": f"an{aid}", "date": str(r["datum"])[:10], "started": ts, "closed": True, "closed_ts": ts, "hours": 0.0, "note": "",
                       "status": status, "status_ts": {}, "counts": counts.get(aid, {}), "prices": dict(prices),
                       "rules": {**rules_of({**DEFAULT_SETTINGS, **settings}), "lane_mode": "off"}, "imported": True, "app_paid": paid.get(aid, {})})

    # 🏦 Kasse
    kasse, total = [], 0
    for r in con.execute("SELECT * FROM buchung ORDER BY erstellZp, buchungId"):
        cents = int(r["buchungBetrag"] or 0)
        total += cents
        if not cents:
            continue
        kasse.append({"id": f"an{r['buchungId']}", "ts": _ts(r["erstellZp"]), "kind": "out" if cents < 0 else "in", "amount": round(abs(cents) / 100, 2),
                      "name": re.sub(r"\s+", " ", str(r["buchungBezeichnung"] or "")).strip()[:80] or ("Ausgabe" if cents < 0 else "Einnahme"),
                      "member": mid_of.get(r["spieler_id"]) if cents > 0 and r["spieler_id"] else None, "abend": f"an{r['kegelabend_id']}" if r["kegelabend_id"] else None,
                      "imported": True})
    settings["start_balance"] = 0.0
    return {"club": str(club["name"] or ""), "settings": settings, "members": members, "strafen": strafen, "abende": abende, "kasse": kasse, "kasse_total": round(total / 100, 2)}
