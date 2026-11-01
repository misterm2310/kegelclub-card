"""Feste Werte für die Kegelclub-Integration. 🎳"""

from __future__ import annotations

import json
from pathlib import Path

DOMAIN = "kegelclub"
VERSION: str = json.loads((Path(__file__).parent / "manifest.json").read_text(encoding="utf-8"))["version"]

STORAGE_KEY = DOMAIN
STORAGE_VERSION = 1

STATIC_URL = "/kegelclub/files"
CARD_FILENAME = "kegelclub-card.js"
PANEL_FILENAME = "kegelclub-panel.js"
PANEL_URL_PATH = "kegelclub"
APP_URL = "/kegelclub/app/"

CONF_SIDEBAR = "sidebar"
DEFAULT_OPTIONS = {CONF_SIDEBAR: False}

SIGNAL_UPDATE = f"{DOMAIN}_update"

# 🎳 Wie war jemand an dem Abend da?
#   play    = kegelt mit
#   watch   = ist da, kegelt aber nicht (Zuschauer)
#   excused = fehlt, hat sich passend abgemeldet
#   absent  = fehlt, NICHT (passend) abgemeldet
STATUSES = ("play", "watch", "gone", "excused", "absent")  # 🚪 gone = früher gegangen

# 💸 Wer zahlt eine Strafe?  self = der, der sie „geschafft“ hat · others = alle anderen, die mitkegeln (z. B. „Alle Neune“)
PAYERS = ("self", "others")

# 🏦 Kegelbahn: aus der Kasse bezahlen · auf die Anwesenden aufteilen · gar nicht erfassen
LANE_MODES = ("kasse", "split", "off")

DEFAULT_SETTINGS = {
    "base_fee": 7.5,          # 💶 Grundbetrag pro Person und Abend
    "watch_pays": True,       # 🪑 Zuschauer zahlen den Grundbetrag
    "missing_pays": True,     # ❌ Fehlende Mitglieder zahlen den Grundbetrag (Gäste nie)
    "unexcused_extra": 5.0,   # 🚷 extra, wenn jemand nicht (passend) abgemeldet ist
    "lane_mode": "kasse",     # 🏦 Kegelbahn aus der Kasse
    "lane_rate": 10.0,        # ⏱️ Kegelbahn pro Stunde
    "lane_hours": 3.0,        # ⏱️ so viele Stunden schlägt ein neuer Abend vor
    "start_balance": 0.0,     # 🐷 Kassenstand, bevor es losging (Anfangsbestand)
    "currency": "EUR",
    "log_on": True,           # 📜 Verlauf: wer hat wann was geändert
    "labels": False,          # 🔤 Beschriftungen unter den Symbol-Knöpfen
    "veil": False,            # 🙈 Kassenstand verschwommen (antippen = 4 Sekunden zeigen)
    "lock_all": False,        # 🔒 ganze Karte mit PIN sperren
    "view": {},               # 👁️ Ansicht für alle: Abschnitt → False = ausgeblendet
    "club_info": {},          # 🏠 Über den Club: Name, Gründung, Bahn/Ort, Termin, Notiz
}

# 💸 Beispiel-Vorlage (nur wenn man sie beim Einrichten lädt) – alles änderbar
TEMPLATE_STRAFEN = [
    {"name": "Pumpe", "icon": "mdi:bowling", "amount": 0.10, "payer": "self"},
    {"name": "Klingeln", "icon": "mdi:bell-ring-outline", "amount": 1.00, "payer": "self"},
    {"name": "Schnapszahl", "icon": "mdi:numeric", "amount": 0.50, "payer": "self"},
    {"name": "Alle Neune", "icon": "mdi:target", "amount": 0.10, "payer": "others"},
    {"name": "Durchlauf", "icon": "mdi:sync", "amount": 0.10, "payer": "self"},
    {"name": "Handy am Tisch", "icon": "mdi:cellphone", "amount": 0.50, "payer": "self"},
]

MAX_LOG = 300             # 📜 Verlauf: so viele Einträge merken
MAX_SEEN_OPS = 3000       # 🔁 schon verarbeitete Änderungen (gegen doppeltes Nachschicken aus der Offline-App)
MAX_IMPORT_BYTES = 8 * 1024 * 1024  # 📥 größte Import-Datei

# 💱 Währungen: Code → Zeichen (für Texte im Verlauf)
CURRENCIES = {"EUR": "€", "CHF": "CHF", "USD": "$", "GBP": "£", "PLN": "zł", "CZK": "Kč", "DKK": "kr", "SEK": "kr", "NOK": "kr", "HUF": "Ft"}
