"""Tests für den Kegelclub (echtes Home Assistant im Testmodus). Nur AUSGEDACHTE Namen und Zahlen!"""

import base64
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

import pytest
from freezegun.api import FrozenDateTimeFactory
from pytest_homeassistant_custom_component.common import MockConfigEntry

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util

from custom_components.kegelclub.const import DOMAIN
from custom_components.kegelclub.manager import bill_evening, parse_money

TZ = "Europe/Berlin"


@pytest.fixture
async def setup(hass: HomeAssistant, freezer: FrozenDateTimeFactory):
    await hass.config.async_set_time_zone(TZ)
    freezer.move_to(datetime(2026, 11, 7, 19, 0, tzinfo=dt_util.get_time_zone(TZ)))
    assert await async_setup_component(hass, "http", {})
    hass.config.components.update({"frontend", "lovelace"})
    entry = MockConfigEntry(domain=DOMAIN, title="Kegelclub", options={"sidebar": False})
    entry.add_to_hass(hass)
    with patch("custom_components.kegelclub.frontend.add_extra_js_url"):
        assert await hass.config_entries.async_setup(entry.entry_id)
        await hass.async_block_till_done()
    return entry


def mgr(hass):
    return hass.data[DOMAIN]["manager"]


def ok(m, *ops):
    res = m.apply([dict(o) for o in ops], "Test")
    assert all(r["ok"] for r in res), res
    return res


def club(m):
    """👥 Vier ausgedachte Mitglieder, ein Gast und zwei Strafen."""
    ok(m,
       *({"type": "member_save", "item": {"id": i, "name": n}} for i, n in (("a", "Anna"), ("b", "Bernd"), ("c", "Carla"), ("d", "Dieter"))),
       {"type": "member_save", "item": {"id": "g", "name": "Gast Gustav", "guest": True}},
       {"type": "strafe_save", "item": {"id": "pumpe", "name": "Pumpe", "amount": "0,10"}},
       {"type": "strafe_save", "item": {"id": "neun", "name": "Alle Neune", "amount": 0.1, "payer": "others"}})


def test_parse_money():
    assert parse_money("-1.234,56 €") == -1234.56
    assert parse_money("7,50") == 7.5
    assert parse_money("") == 0
    with pytest.raises(HomeAssistantError):
        parse_money("abc")


def test_bill_rules():
    """🧮 Grundbetrag, Zuschauer, abgemeldet/nicht abgemeldet, Gäste, „alle anderen zahlen“, Kegelbahn."""
    members = {x: {"id": x, "name": x} for x in "abcde"} | {"g": {"id": "g", "name": "G", "guest": True}, "h": {"id": "h", "name": "H", "guest": True}}
    strafen = {"p": {"id": "p", "amount": 0.1, "payer": "self"}, "n": {"id": "n", "amount": 0.1, "payer": "others"}}
    settings = {"base_fee": 7.5, "watch_pays": True, "missing_pays": True, "unexcused_extra": 5.0, "lane_mode": "kasse", "lane_rate": 10.0}
    ev = {"status": {"a": "play", "b": "play", "c": "watch", "d": "excused", "e": "absent", "g": "play", "h": "absent"},
          "counts": {"a": {"p": 3, "n": 2}, "c": {"p": 1}}, "hours": 3, "rules": dict(settings),
          "prices": {"p": [0.1, "self"], "n": [0.1, "others"]}}
    b = bill_evening(ev, members, strafen, settings)
    p = {k: v["total"] for k, v in b["people"].items()}
    assert p["a"] == 7.8          # 7,50 + 3 Pumpen; seine Neuner zahlt er nicht
    assert p["b"] == 7.7          # 7,50 + 2 Neuner von Anna
    assert p["g"] == 7.7          # Gast kegelt: gleiche Regeln
    assert p["c"] == 7.6          # schaut zu: Grundbetrag, keine Neuner der anderen, aber eigene Pumpe
    assert p["d"] == 7.5          # abgemeldet
    assert p["e"] == 12.5         # nicht abgemeldet: + 5,00
    assert p.get("h", 0) == 0     # Gast nicht da: zahlt nichts
    assert b["lane_kasse"] == 30
    ev["no_fines"] = True         # 🙏 Strafen erlassen
    b2 = bill_evening(ev, members, strafen, settings)
    assert b2["people"]["a"]["total"] == 7.5 and b2["people"]["b"]["total"] == 7.5
    ev["rules"] = {**settings, "missing_pays": False, "watch_pays": False, "lane_mode": "split"}
    del ev["no_fines"]
    b3 = bill_evening(ev, members, strafen, settings)
    assert b3["people"]["d"]["total"] == 0 and b3["people"]["e"]["total"] == 5.0
    assert b3["lane_kasse"] == 0 and b3["people"]["a"]["total"] == round(7.5 + 0.3 + 30 / 4, 2)  # Bahn geteilt durch alle, die da sind


async def test_evening_flow(hass, setup):
    m = mgr(hass)
    club(m)
    ok(m, {"type": "abend_start", "op_id": "s1", "id": "ev1", "hours": 2})
    ev = m.open_evening()
    assert ev and set(ev["status"]) == {"a", "b", "c", "d"}  # Gäste nicht automatisch
    ok(m, {"type": "abend_status", "abend": "ev1", "member": "d", "status": "excused", "ts": 5},
       {"type": "abend_status", "abend": "ev1", "member": "g", "status": "play", "ts": 5},
       {"type": "abend_count", "abend": "ev1", "member": "b", "strafe": "neun", "delta": 1, "op_id": "x1"},
       {"type": "abend_count", "abend": "ev1", "member": "b", "strafe": "pumpe", "delta": 2})
    # 🔁 doppelt geschickt (Offline-App) → zählt nur einmal
    res = m.apply([{"type": "abend_count", "abend": "ev1", "member": "b", "strafe": "neun", "delta": 1, "op_id": "x1"}])
    assert res[0].get("duplicate")
    # ⏱ ältere Statusänderung verliert
    ok(m, {"type": "abend_status", "abend": "ev1", "member": "d", "status": "absent", "ts": 1})
    assert m.open_evening()["status"]["d"] == "excused"
    s = m.summary()
    assert s["running"] == "ev1"
    debt = {p["id"]: p["debt"] for p in s["people"]}
    assert debt["a"] == 7.6 and debt["b"] == 7.7 and debt["g"] == 7.6 and debt["d"] == 7.5
    ok(m, {"type": "abend_close", "abend": "ev1", "value": True})
    assert m.summary()["unbooked"] == "ev1" and m.summary()["kasse"] == 0  # 🏦 Bahn erst nach „In Kasse buchen“
    assert not m.apply([{"type": "abend_start", "id": "zu_frueh"}])[0]["ok"]  # ohne Buchen geht's nicht weiter
    ok(m, {"type": "abend_book", "abend": "ev1"},
       {"type": "pay", "member": "a", "amount": "7,60"},
       {"type": "kasse_add", "kind": "out", "name": "Blumen", "amount": 10})
    s = m.summary()
    assert s["running"] is None and s["last"]["date"] == "2026-11-07"
    assert {p["id"]: p["debt"] for p in s["people"]}["a"] == 0
    assert s["kasse"] == round(7.6 - 10 - 20, 2)  # Einzahlung − Blumen − 2 h Kegelbahn
    await hass.async_block_till_done()
    assert float(hass.states.get("sensor.kegelclub_kegelkasse").state) == s["kasse"]
    assert hass.states.get("binary_sensor.kegelclub_abend_laeuft").state == "off"
    assert hass.states.get("sensor.kegelclub_offen").attributes["personen"]["Bernd"] == 7.7


async def test_services(hass, setup):
    m = mgr(hass)
    club(m)
    await hass.services.async_call(DOMAIN, "abend_starten", {"stunden": 3}, blocking=True)
    await hass.services.async_call(DOMAIN, "strafe_buchen", {"mitglied": "bernd", "strafe": "Pumpe", "anzahl": 3}, blocking=True)
    await hass.async_block_till_done()
    assert hass.states.get("binary_sensor.kegelclub_abend_laeuft").state == "on"
    with pytest.raises(HomeAssistantError):
        await hass.services.async_call(DOMAIN, "strafe_buchen", {"mitglied": "Niemand", "strafe": "Pumpe"}, blocking=True)
    await hass.services.async_call(DOMAIN, "einzahlung", {"mitglied": "Anna", "betrag": 20}, blocking=True)
    res = await hass.services.async_call(DOMAIN, "daten_abrufen", {}, blocking=True, return_response=True)
    assert res["kasse"] == 20 and res["running"]  # Kegelbahn geht erst beim Abschließen raus
    await hass.services.async_call(DOMAIN, "abend_abschliessen", {}, blocking=True)
    assert m.open_evening() is None
    assert m.summary()["kasse"] == 20 - 30


def _fake_alle_neune() -> bytes:
    """🗄️ Eine ausgedachte Datei im Aufbau der App „Alle Neune“ (Beträge in Cent)."""
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "x.db"
        con = sqlite3.connect(p)
        con.executescript("""
        CREATE TABLE kegelclub (kegelclub_id INTEGER, name TEXT, startgeld INTEGER, abwesendeAbrechnung INTEGER);
        CREATE TABLE spieler (spieler_id INTEGER, name TEXT, kegelclubmitglied INTEGER, kegelclub_id INTEGER);
        CREATE TABLE kegelclubmitglieder (kegelclub_id INTEGER, spieler_id INTEGER);
        CREATE TABLE straftyp (straftyp_id INTEGER, bezeichnung TEXT, betrag INTEGER, sachbetrag INTEGER);
        CREATE TABLE kegelclubstrafe (kegelclub_id INTEGER, straftyp_id INTEGER);
        CREATE TABLE kegelabend (kegelabend_id INTEGER, datum TEXT, kegelclub_id INTEGER);
        CREATE TABLE kegelabendteilnehmer (kegelabend_id INTEGER, spieler_id INTEGER);
        CREATE TABLE StrafeKegelabend (kegelabend_id INTEGER, spieler_id INTEGER, straftyp_id INTEGER, anzahl INTEGER);
        CREATE TABLE buchung (buchungId INTEGER, kegelabend_id INTEGER, spieler_id INTEGER, buchungBetrag INTEGER, buchungBezeichnung TEXT, erstellZp TEXT);
        INSERT INTO kegelclub VALUES (1, 'Die Testkugeln', 750, 2);
        INSERT INTO spieler VALUES (1, 'Beispiel, Anna', 1, 1), (2, 'Muster, Bernd', 1, 1), (3, 'Alt, Otto', 0, 1), (4, 'Gast, Gerd', 0, 1);
        INSERT INTO kegelclubmitglieder VALUES (1, 1), (1, 2), (1, 3);
        INSERT INTO straftyp VALUES (1, 'Pumpe', 10, 0), (2, 'Neuner', 0, 0), (3, 'Neuner (Andere)', 10, 0), (4, 'Alte Strafe', 50, 0);
        INSERT INTO kegelclubstrafe VALUES (1, 1), (1, 2), (1, 3);
        INSERT INTO kegelabend VALUES (10, '2026-01-10', 1), (11, '2026-02-14', 1);
        INSERT INTO kegelabendteilnehmer VALUES (10, 1), (10, 2), (10, 4), (11, 1), (11, 2);
        INSERT INTO StrafeKegelabend VALUES (10, 1, 1, 3), (10, 2, 2, 2), (10, 1, 3, 2), (11, 2, 1, 1);
        INSERT INTO buchung VALUES
          (1, 10, 1, 800, 'Kegelabendstrafe von Anna', '2026-01-10 23:00:00'),
          (2, 10, 2, 750, 'Kegelabendstrafe von Bernd', '2026-01-10 23:00:00'),
          (3, 10, 3, 750, 'Otto (nicht anwesend)', '2026-01-10 23:00:00'),
          (4, 10, NULL, -3000, 'Kegelbahn', '2026-01-10 23:00:00'),
          (5, 11, 1, 750, 'Kegelabendstrafe von Anna', '2026-02-14 23:00:00'),
          (6, NULL, NULL, 1000, 'Überschuss', '2026-02-20 10:00:00');
        """)
        con.commit()
        con.close()
        return p.read_bytes()


async def test_import_alle_neune(hass, setup):
    m = mgr(hass)
    b64 = base64.b64encode(_fake_alle_neune()).decode()
    prev = await hass.async_add_executor_job(m.import_file, "x.db", b64, False, False)
    assert prev["format"] == "alle_neune" and not prev["applied"]
    assert prev["club"] == "Die Testkugeln" and prev["base_fee"] == 7.5
    assert prev["counts"] == {"members": 2, "former": 1, "guests": 1, "strafen": 3, "abende": 2, "kasse": 6}
    assert prev["kasse_total"] == 10.5  # 8 + 7,50 + 7,50 − 30 + 7,50 + 10
    neun = next(s for s in prev["strafen"] if s["name"] == "Neuner")
    assert neun["payer"] == "others" and neun["amount"] == 0.1
    assert m.data["abende"] == []  # Vorschau ändert nichts
    res = await hass.async_add_executor_job(m.import_file, "x.db", b64, True, True)
    await hass.async_block_till_done()
    assert res["applied"]
    names = {x["name"] for x in m.data["members"]}
    assert {"Anna Beispiel", "Bernd Muster", "Otto Alt", "Gerd Gast"} <= names
    s = m.summary()
    assert s["kasse"] == 10.5 and s["open"] == 0  # alte Abende: in der Kasse, aber keine offenen Beträge
    ev10 = next(e for e in m.data["abende"] if e["id"] == "an10")
    assert ev10["status"]["an3"] == "excused" and ev10["imported"]
    assert ev10["counts"]["an2"] == {"an2": 2}  # Bernds Neuner; die (Andere)-Gegenbuchung fällt weg
    # 🔁 nochmal einlesen ohne „ersetzen“ geht nicht – Daten sind da
    with pytest.raises(HomeAssistantError):
        await hass.async_add_executor_job(m.import_file, "x.db", b64, True, False)


async def test_backup_roundtrip(hass, setup):
    import json
    m = mgr(hass)
    club(m)
    ok(m, {"type": "pay", "member": "a", "amount": 5})
    backup = json.dumps(m.export_json())
    ok(m, {"type": "member_delete", "id": "c"})
    res = await hass.async_add_executor_job(m.import_file, "b.json", base64.b64encode(backup.encode()).decode(), True, True)
    await hass.async_block_till_done()
    assert res["applied"] and any(x["id"] == "c" for x in m.data["members"])
    with pytest.raises(HomeAssistantError):
        await hass.async_add_executor_job(m.import_file, "b.txt", base64.b64encode(b"hallo").decode(), False, False)


async def test_delete_used_member_only_hides(hass, setup):
    m = mgr(hass)
    club(m)
    ok(m, {"type": "abend_start", "id": "e"}, {"type": "abend_close", "abend": "e", "value": True})
    ok(m, {"type": "member_delete", "id": "a"}, {"type": "member_delete", "id": "g"})
    a = m.find("member", "a")
    assert a and a["active"] is False
    assert m.find("member", "g") is None  # nie dabei gewesen → ganz weg


async def test_pay_at_table_and_hand_fine(hass, setup):
    """💶 Grundbetrag am Anfang, ✍️ Strafe per Hand, Münze = Strafen bezahlt."""
    m = mgr(hass)
    club(m)
    ok(m, {"type": "abend_start", "id": "e1", "hours": 2})
    ok(m, *({"type": "pay", "member": x, "amount": 7.5, "abend": "e1", "tag": "base", "id": f"b{x}"} for x in "abcd"))
    ok(m, {"type": "abend_extra_add", "abend": "e1", "member": "a", "name": "Bier umgekippt", "amount": "2,00", "id": "x1"},
       {"type": "abend_count", "abend": "e1", "member": "a", "strafe": "pumpe", "delta": 3})
    res = m.apply([{"type": "abend_extra_add", "abend": "e1", "member": "g", "name": "?", "amount": 1}])
    assert not res[0]["ok"]  # Gast ist heute nicht dabei
    debt = {p["id"]: p["debt"] for p in m.summary()["people"]}
    assert debt["a"] == 2.3 and debt["b"] == 0
    k = next(x for x in m.data["kasse"] if x["id"] == "ba")
    assert k["abend"] == "e1" and k["tag"] == "base"
    ok(m, {"type": "pay", "member": "a", "amount": 2.3, "abend": "e1", "tag": "fines"})
    assert {p["id"]: p["debt"] for p in m.summary()["people"]}["a"] == 0
    ok(m, {"type": "abend_extra_delete", "abend": "e1", "id": "x1"})
    assert {p["id"]: p["debt"] for p in m.summary()["people"]}["a"] == -2.0  # Guthaben
    assert m.summary()["kasse"] == 30 + 2.3  # Bahn noch nicht abgezogen
    ok(m, {"type": "abend_status", "abend": "e1", "member": "d", "status": "excused"})  # 💶 doch nicht da → Grundbetrag zurück
    assert not any(k.get("member") == "d" and k.get("tag") == "base" for k in m.data["kasse"])
    assert {p["id"]: p["debt"] for p in m.summary()["people"]}["d"] == 7.5
    ok(m, {"type": "abend_close", "abend": "e1", "value": True}, {"type": "abend_book", "abend": "e1"})
    assert m.summary()["kasse"] == round(22.5 + 2.3 - 20, 2)


async def test_photo_and_pdf_share(hass, setup):
    """📸 Foto am Mitglied (nur echte, kleine Bilder) und 📄 PDF kurz bereitstellen für die HA-App."""
    from custom_components.kegelclub.pdf_share import get_pdf, store_pdf

    m = mgr(hass)
    club(m)
    pic = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8\xff" + b"x" * 300).decode()
    ok(m, {"type": "member_save", "item": {"id": "a", "name": "Anna", "photo": pic}})
    assert m.find("member", "a")["photo"] == pic
    res = m.apply([{"type": "member_save", "item": {"id": "a", "name": "Anna", "photo": "javascript:alert(1)"}}], "Test")
    assert not res[0]["ok"] and m.find("member", "a")["photo"] == pic
    ok(m, {"type": "member_save", "item": {"id": "a", "name": "Anna", "photo": ""}})
    assert "photo" not in m.find("member", "a")
    # 📄 PDF: nur echte PDFs, Link mit Zufallsschlüssel
    r = store_pdf(hass, base64.b64encode(b"%PDF-1.4 test").decode(), "Kegelabend 2026-11-07.pdf")
    token = r["url"].split("/")[4]
    assert r["url"].startswith("/api/kegelclub/pdf/") and r["url"].endswith("/Kegelabend-2026-11-07.pdf")
    assert get_pdf(hass, token)["data"].startswith(b"%PDF-")
    with pytest.raises(ValueError):
        store_pdf(hass, base64.b64encode(b"keine pdf").decode())


async def test_gone_early_club_info_email(hass, setup):
    """🚪 Wer früher geht, zahlt spätere Neuner der anderen nicht · 🏠 Club-Infos · ✉️ E-Mail."""
    m = mgr(hass)
    club(m)
    ok(m, {"type": "abend_start", "op_id": "s1", "id": "ev1", "hours": 0})
    ok(m, {"type": "abend_count", "abend": "ev1", "member": "a", "strafe": "neun"})  # Anna wirft eine Neun – alle anderen zahlen
    ok(m, {"type": "abend_status", "abend": "ev1", "member": "d", "status": "gone", "ts": 50})  # Dieter geht
    ok(m, {"type": "abend_count", "abend": "ev1", "member": "a", "strafe": "neun"})  # zweite Neun – ohne Dieter
    ok(m, {"type": "abend_count", "abend": "ev1", "member": "b", "strafe": "neun"})  # Bernd wirft eine – auch ohne Dieter
    members, strafen = m._maps()
    b = bill_evening(m.evening("ev1"), members, strafen, m.data["settings"])
    assert b["people"]["d"]["from_others"] == 0.1 and b["people"]["d"]["fee"] == 7.5
    assert b["people"]["c"]["from_others"] == 0.3  # Carla war die ganze Zeit da: 3 Neuner
    ok(m, {"type": "abend_status", "abend": "ev1", "member": "d", "status": "play", "ts": 60})  # doch noch da → zahlt wieder alles
    b = bill_evening(m.evening("ev1"), members, strafen, m.data["settings"])
    assert b["people"]["d"]["from_others"] == 0.3 and "d" not in (m.evening("ev1").get("gone") or {})
    # 🏠 Club-Infos
    ok(m, {"type": "settings", "settings": {"club_info": {"name": "Testclub", "founded": "2019-05-11"}}})
    ok(m, {"type": "settings", "settings": {"club_info": {"place": "Bahn 2"}}})
    assert m.data["settings"]["club_info"] == {"name": "Testclub", "founded": "2019-05-11", "place": "Bahn 2"}
    assert not m.apply([{"type": "settings", "settings": {"club_info": {"founded": "gestern"}}}], "Test")[0]["ok"]
    # ✉️ E-Mail
    ok(m, {"type": "member_save", "item": {"id": "a", "name": "Anna", "email": "anna@example.org"}})
    assert m.find("member", "a")["email"] == "anna@example.org"
    assert not m.apply([{"type": "member_save", "item": {"id": "a", "name": "Anna", "email": "kaputt"}}], "Test")[0]["ok"]


async def test_pin_offline_key(hass, setup):
    """📴 Offline-Schlüssel: Karte bekommt nur PBKDF2, nie die PIN; ältere PINs holen ihn beim ersten richtigen Eintippen nach."""
    import hashlib  # noqa: PLC0415

    m = mgr(hass)
    assert m.snapshot()["pin_off"] is None
    m.set_pin("4711")
    off = m.snapshot()["pin_off"]
    assert off and "4711" not in str(off) and off["iter"] >= 100_000
    assert hashlib.pbkdf2_hmac("sha256", b"4711", bytes.fromhex(off["salt"]), off["iter"]).hex() == off["hash"]
    m.data["pin_off"] = None  # wie eine PIN aus beta.9
    assert not m.check_pin("0000") and m.data["pin_off"] is None
    assert m.check_pin("4711") and m.data["pin_off"]
    m.factory_reset()
    assert m.data["pin_off"]
    m.clear_pin()
    assert m.snapshot()["pin_off"] is None


async def test_buchen_loeschen_mit_kasse_und_buchung_aendern(hass, setup):
    """🏦 In Kasse buchen, 🗑️ Abend löschen nimmt Kassenbuchungen mit (Rückgängig holt sie zurück), ✏️ Buchung ändern."""
    m = mgr(hass)
    club(m)
    ok(m, {"type": "abend_start", "id": "e1", "hours": 2, "date": "2026-11-07"})
    ok(m, {"type": "pay", "member": "a", "amount": 7.5, "abend": "e1", "tag": "base", "id": "k1"},
       {"type": "kasse_add", "kind": "in", "name": "Spende", "amount": 5, "id": "k2"})
    ok(m, {"type": "abend_close", "abend": "e1", "value": True})
    ev = next(e for e in m.data["abende"] if e["id"] == "e1")
    assert ev["booked"] is False
    ok(m, {"type": "abend_book", "abend": "e1"})
    assert ev["booked"] is True and m.summary()["kasse"] == 7.5 + 5 - 20
    # wieder öffnen → Merker weg, beim nächsten Abschließen wieder buchen
    ok(m, {"type": "abend_close", "abend": "e1", "value": False})
    assert "booked" not in ev
    ok(m, {"type": "abend_close", "abend": "e1", "value": True, "book": True})  # Aktion für Automationen bucht gleich mit
    assert ev["booked"] is True
    # 🗑️ löschen: Kassenbuchung k1 vom Abend geht mit, Spende bleibt
    item = {**ev, "kasse": [dict(k) for k in m.data["kasse"] if k.get("abend") == "e1"]}
    ok(m, {"type": "abend_delete", "id": "e1"})
    assert [k["id"] for k in m.data["kasse"]] == ["k2"]
    ok(m, {"type": "restore", "kind": "abend", "item": item})
    assert {k["id"] for k in m.data["kasse"]} == {"k1", "k2"}
    assert "kasse" not in next(e for e in m.data["abende"] if e["id"] == "e1")
    # ✏️ Buchung ändern: Name, Betrag, Datum, von wem
    ok(m, {"type": "kasse_edit", "id": "k2", "name": "Spende Wirt", "amount": "6,50", "date": "2026-10-03", "member": "b"})
    k2 = next(k for k in m.data["kasse"] if k["id"] == "k2")
    assert k2["name"] == "Spende Wirt" and k2["amount"] == 6.5 and k2["member"] == "b"
    from homeassistant.util import dt as dt_util
    assert dt_util.as_local(dt_util.utc_from_timestamp(k2["ts"] / 1000)).date().isoformat() == "2026-10-03"
    assert not m.apply([{"type": "kasse_edit", "id": "k2", "member": "gibtsnicht"}])[0]["ok"]
    assert not m.apply([{"type": "kasse_edit", "id": "k2", "date": "03.10.2026"}])[0]["ok"]
    # ⚙️ Maskottchen-Schalter
    ok(m, {"type": "settings", "settings": {"mascot": True}})
    assert m.data["settings"]["mascot"] is True
