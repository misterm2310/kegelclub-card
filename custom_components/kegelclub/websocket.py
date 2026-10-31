"""🔌 Verbindung zur Karte und zur Offline-App."""

from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.exceptions import HomeAssistantError

from .books import get_manager, list_books


def _manager(hass: HomeAssistant, msg: dict[str, Any] | None = None):
    """🏠 Der gewünschte Club (ohne Angabe: das erste). Gibt es das nicht → None."""
    try:
        return get_manager(hass, (msg or {}).get("book"))
    except HomeAssistantError:
        return None


@callback
def async_register(hass: HomeAssistant) -> None:
    websocket_api.async_register_command(hass, ws_subscribe)
    websocket_api.async_register_command(hass, ws_apply)
    websocket_api.async_register_command(hass, ws_import)
    websocket_api.async_register_command(hass, ws_pin_set)
    websocket_api.async_register_command(hass, ws_pin_check)
    websocket_api.async_register_command(hass, ws_health)
    websocket_api.async_register_command(hass, ws_errors_clear)
    websocket_api.async_register_command(hass, ws_factory_reset)
    websocket_api.async_register_command(hass, ws_books)


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/books"})
@callback
def ws_books(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """🏠 Alle Clubs (für den Karten-Editor)."""
    connection.send_result(msg["id"], {"books": list_books(hass)})


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/subscribe", vol.Optional("book"): vol.Any(str, None)})
@callback
def ws_subscribe(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Alles schicken – und bei jeder Änderung nochmal."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Kegelclub ist noch nicht eingerichtet (oder den Club gibt es nicht)")
        return

    @callback
    def push() -> None:
        connection.send_message(websocket_api.event_message(msg["id"], m.snapshot()))

    connection.subscriptions[msg["id"]] = m.add_listener(push)
    connection.send_result(msg["id"])
    push()


@websocket_api.websocket_command({
    vol.Required("type"): "kegelclub/apply",
    vol.Optional("book"): vol.Any(str, None),
    vol.Required("ops"): vol.All([dict], vol.Length(max=500)),
})
@websocket_api.async_response
async def ws_apply(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """Änderungen anwenden (auch nachgeschickte aus der Offline-App)."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Kegelclub ist noch nicht eingerichtet (oder den Club gibt es nicht)")
        return
    user = connection.user.name if connection.user else None
    connection.send_result(msg["id"], {"results": m.apply(msg["ops"], user)})


@websocket_api.websocket_command({
    vol.Required("type"): "kegelclub/import",
    vol.Optional("book"): vol.Any(str, None),
    vol.Optional("name", default=""): str,
    vol.Required("data"): str,
    vol.Optional("apply", default=False): bool,
    vol.Optional("replace", default=False): bool,
})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_import(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """📥 Datei aus der App „Alle Neune“ (oder eine Kegelclub-Sicherung) ansehen bzw. übernehmen."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Kegelclub ist noch nicht eingerichtet (oder den Club gibt es nicht)")
        return
    try:
        # SQLite und Temp-Dateien blockieren → ab in den Hintergrund
        res = await hass.async_add_executor_job(m.import_file, msg["name"], msg["data"], msg["apply"], msg["replace"])
        connection.send_result(msg["id"], res)
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "import_failed", str(err))


@websocket_api.websocket_command({
    vol.Required("type"): "kegelclub/pin/set",
    vol.Optional("book"): vol.Any(str, None),
    vol.Optional("pin"): vol.Any(str, None),
    vol.Optional("old"): vol.Any(str, None),
})
@websocket_api.async_response
async def ws_pin_set(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """🔒 PIN festlegen, ändern oder (leer) entfernen."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Club nicht gefunden")
        return
    try:
        m.set_pin(msg.get("pin"), msg.get("old"))
        connection.send_result(msg["id"], {"ok": True})
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "pin", str(err))


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/pin/check", vol.Required("pin"): str, vol.Optional("book"): vol.Any(str, None)})
@websocket_api.async_response
async def ws_pin_check(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Club nicht gefunden")
        return
    try:
        connection.send_result(msg["id"], {"ok": m.check_pin(msg["pin"])})
    except HomeAssistantError as err:
        connection.send_error(msg["id"], "pin", str(err))


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/health", vol.Optional("book"): vol.Any(str, None)})
@callback
def ws_health(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """🩺 Fehler-Protokoll, Speicher und Umfang."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Kegelclub ist noch nicht eingerichtet (oder den Club gibt es nicht)")
        return
    connection.send_result(msg["id"], m.health())


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/errors_clear", vol.Optional("book"): vol.Any(str, None)})
@callback
def ws_errors_clear(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    m = _manager(hass, msg)
    if m is not None:
        m.clear_errors()
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): "kegelclub/factory_reset", vol.Optional("book"): vol.Any(str, None)})
@websocket_api.require_admin
@callback
def ws_factory_reset(hass: HomeAssistant, connection: websocket_api.ActiveConnection, msg: dict[str, Any]) -> None:
    """💣 Werkseinstellungen (nur Admins) – nur die PIN bleibt."""
    m = _manager(hass, msg)
    if m is None:
        connection.send_error(msg["id"], "not_ready", "Kegelclub ist noch nicht eingerichtet (oder den Club gibt es nicht)")
        return
    m.factory_reset()
    connection.send_result(msg["id"], {"ok": True})
