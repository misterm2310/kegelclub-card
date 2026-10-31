"""🏠 Mehrere Clubs: jeder Club = eigener Eintrag mit eigenen Daten, Sensoren und PIN."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.core import HomeAssistant
from homeassistant.exceptions import HomeAssistantError

from .const import DOMAIN

if TYPE_CHECKING:
    from .manager import KegelclubManager


def _slug(text: str) -> str:
    out = str(text or "").strip().lower()
    for x, y in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss")):
        out = out.replace(x, y)
    return "".join(c if c.isalnum() else "_" for c in out).strip("_")


def get_manager(hass: HomeAssistant, book: str | None = None) -> KegelclubManager:
    """🏠 Club finden: nichts angegeben = erster Club; sonst per Name (egal ob groß/klein) oder ID."""
    books: dict[str, KegelclubManager] = hass.data.get(DOMAIN, {}).get("books", {})
    if not books:
        raise HomeAssistantError("Kegelclub ist noch nicht eingerichtet.")
    if not book:
        return hass.data[DOMAIN].get("manager") or next(iter(books.values()))
    key = str(book).strip()
    for m in books.values():
        if key == m.entry_id or key.casefold() == m.title.casefold() or _slug(key) == _slug(m.title):
            return m
    raise HomeAssistantError(f"Club „{book}“ gibt es nicht")


def list_books(hass: HomeAssistant) -> list[dict]:
    books = hass.data.get(DOMAIN, {}).get("books", {})
    return sorted(({"id": m.entry_id, "title": m.title, "primary": m.primary} for m in books.values()), key=lambda b: (not b["primary"], b["title"].casefold()))
