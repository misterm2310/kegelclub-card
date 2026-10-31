"""🎳 Kegelclub – Kegelabende, Strafen und Kegelkasse in Home Assistant (mit Offline-App)."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant, ServiceCall, ServiceResponse, SupportsResponse
from homeassistant.exceptions import HomeAssistantError
from homeassistant.helpers import config_validation as cv
from homeassistant.helpers.storage import Store
from homeassistant.helpers.typing import ConfigType

from . import websocket as ws
from .app_view import async_register_app
from .const import CONF_SIDEBAR, DOMAIN, STORAGE_KEY, STORAGE_VERSION
from .frontend import async_set_sidebar, async_setup_frontend
from .books import get_manager
from .manager import KegelclubManager

CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)
PLATFORMS = [Platform.SENSOR, Platform.BINARY_SENSOR]


async def async_setup(hass: HomeAssistant, config: ConfigType) -> bool:
    """Einmalig: Karte + Offline-App bereitstellen, Websocket und Aktionen anmelden."""
    hass.data.setdefault(DOMAIN, {})
    await async_setup_frontend(hass)
    async_register_app(hass)
    ws.async_register(hass)
    _register_services(hass)
    return True


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    store_key = entry.data.get("store", STORAGE_KEY)  # 🏠 erster Club = Speicher „kegelclub“, weitere bekommen einen eigenen
    manager = KegelclubManager(hass, store_key, entry.entry_id, entry.title)
    await manager.async_load()
    hass.data[DOMAIN].setdefault("books", {})[entry.entry_id] = manager
    if manager.primary:
        hass.data[DOMAIN]["manager"] = manager
    manager.async_start()
    entry.async_on_unload(manager.async_stop)
    entry.async_on_unload(entry.add_update_listener(_async_update_listener))
    if manager.primary:
        await async_set_sidebar(hass, bool(entry.options.get(CONF_SIDEBAR, False)))
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    unloaded = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unloaded:
        manager: KegelclubManager | None = hass.data[DOMAIN].get("books", {}).pop(entry.entry_id, None)
        if manager is not None:
            if manager.primary:
                await async_set_sidebar(hass, False)
                hass.data[DOMAIN].pop("manager", None)
            await manager.async_save_now()
    return unloaded


async def async_remove_entry(hass: HomeAssistant, entry: ConfigEntry) -> None:
    """🗑️ Ein weiterer Club gelöscht: seine Daten gleich mit wegräumen (der erste Club bleibt liegen)."""
    store_key = entry.data.get("store", STORAGE_KEY)
    if store_key != STORAGE_KEY:
        await Store(hass, STORAGE_VERSION, store_key).async_remove()


async def _async_update_listener(hass: HomeAssistant, entry: ConfigEntry) -> None:
    await hass.config_entries.async_reload(entry.entry_id)


async def _user_name(hass: HomeAssistant, call: ServiceCall) -> str | None:
    if not call.context.user_id:
        return None
    user = await hass.auth.async_get_user(call.context.user_id)
    return user.name if user else None


def _check(results: list[dict]) -> None:
    for r in results:
        if not r.get("ok"):
            raise HomeAssistantError(r.get("error") or "Das hat nicht geklappt")


def _register_services(hass: HomeAssistant) -> None:
    async def strafe(call: ServiceCall) -> None:
        m = get_manager(hass, call.data.get("club"))
        mem = m.find("member", call.data["mitglied"])
        st = m.find("strafe", call.data["strafe"])
        if mem is None:
            raise HomeAssistantError(f"Mitglied „{call.data['mitglied']}“ gibt es nicht")
        if st is None:
            raise HomeAssistantError(f"Strafe „{call.data['strafe']}“ gibt es nicht")
        op = {"type": "abend_count", "abend": call.data.get("abend"), "member": mem["id"], "strafe": st["id"], "delta": call.data["anzahl"]}
        _check(m.apply([op], await _user_name(hass, call)))

    async def start(call: ServiceCall) -> None:
        op = {"type": "abend_start"}
        if call.data.get("datum"):
            op["date"] = str(call.data["datum"])
        if call.data.get("stunden") is not None:
            op["hours"] = call.data["stunden"]
        _check(get_manager(hass, call.data.get("club")).apply([op], await _user_name(hass, call)))

    async def close(call: ServiceCall) -> None:
        _check(get_manager(hass, call.data.get("club")).apply([{"type": "abend_close", "abend": call.data.get("abend"), "value": True}], await _user_name(hass, call)))

    async def pay(call: ServiceCall) -> None:
        m = get_manager(hass, call.data.get("club"))
        mem = m.find("member", call.data["mitglied"])
        if mem is None:
            raise HomeAssistantError(f"Mitglied „{call.data['mitglied']}“ gibt es nicht")
        _check(m.apply([{"type": "pay", "member": mem["id"], "amount": call.data["betrag"]}], await _user_name(hass, call)))

    async def ausgabe(call: ServiceCall) -> None:
        _check(get_manager(hass, call.data.get("club")).apply(
            [{"type": "kasse_add", "kind": "out", "name": call.data.get("name", "Ausgabe"), "amount": call.data["betrag"]}], await _user_name(hass, call)))

    async def abrufen(call: ServiceCall) -> ServiceResponse:
        return get_manager(hass, call.data.get("club")).summary()

    club = {vol.Optional("club"): cv.string}
    hass.services.async_register(DOMAIN, "strafe_buchen", strafe, vol.Schema({**club, vol.Required("mitglied"): cv.string, vol.Required("strafe"): cv.string,
                                                                              vol.Optional("anzahl", default=1): vol.All(vol.Coerce(int), vol.Range(min=-50, max=50)), vol.Optional("abend"): cv.string}))
    hass.services.async_register(DOMAIN, "abend_starten", start, vol.Schema({**club, vol.Optional("datum"): cv.date, vol.Optional("stunden"): vol.All(vol.Coerce(float), vol.Range(min=0, max=24))}))
    hass.services.async_register(DOMAIN, "abend_abschliessen", close, vol.Schema({**club, vol.Optional("abend"): cv.string}))
    hass.services.async_register(DOMAIN, "einzahlung", pay, vol.Schema({**club, vol.Required("mitglied"): cv.string, vol.Required("betrag"): vol.Coerce(float)}))
    hass.services.async_register(DOMAIN, "ausgabe", ausgabe, vol.Schema({**club, vol.Optional("name"): cv.string, vol.Required("betrag"): vol.Coerce(float)}))
    hass.services.async_register(DOMAIN, "daten_abrufen", abrufen, vol.Schema(club), supports_response=SupportsResponse.ONLY)
