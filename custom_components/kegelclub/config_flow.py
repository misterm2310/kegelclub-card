"""Einrichtung & Optionen. 🏠 Es lassen sich mehrere Clubs anlegen (z. B. Herren- und Damenclub).

Der erste Club heißt „Kegelclub“ (Name änderbar) und nutzt den Speicher „kegelclub“. Jedes weitere bekommt einen Namen und eigenen Speicher.
Alles andere stellt man in der Karte ein."""

from __future__ import annotations

import uuid
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, ConfigFlowResult, OptionsFlow
from homeassistant.core import callback
from homeassistant.helpers.selector import BooleanSelector, TextSelector

from .const import CONF_SIDEBAR, DOMAIN, STORAGE_KEY


def _schema(sidebar: bool) -> vol.Schema:
    return vol.Schema({vol.Optional(CONF_SIDEBAR, default=sidebar): BooleanSelector()})


class KegelclubConfigFlow(ConfigFlow, domain=DOMAIN):
    VERSION = 1

    async def async_step_user(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        entries = self._async_current_entries()
        first = not any(e.data.get("store", STORAGE_KEY) == STORAGE_KEY for e in entries)
        errors: dict[str, str] = {}
        if user_input is not None:
            name = str(user_input.get("name") or "").strip()[:40] or ("Kegelclub" if first else "")
            if not name:
                errors["name"] = "name_missing"
            elif any(e.title.casefold() == name.casefold() for e in entries):
                errors["name"] = "name_taken"
            else:
                data = {} if first else {"store": f"{DOMAIN}.{uuid.uuid4().hex[:10]}"}  # 🏠 eigener Speicher je Club
                options = {CONF_SIDEBAR: bool(user_input.get(CONF_SIDEBAR))} if first else {}
                return self.async_create_entry(title=name, data=data, options=options)
        if first:  # 1. Club: Name „Kegelclub“ vorgeschlagen + Seitenleiste
            schema: dict[Any, Any] = {vol.Optional("name", default="Kegelclub"): TextSelector(),
                                      vol.Optional(CONF_SIDEBAR, default=True): BooleanSelector()}
        else:      # weiterer Club: nur der Name
            schema = {vol.Required("name"): TextSelector()}
        return self.async_show_form(step_id="user", data_schema=vol.Schema(schema), errors=errors)

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        return KegelclubOptionsFlow()


class KegelclubOptionsFlow(OptionsFlow):
    async def async_step_init(self, user_input: dict[str, Any] | None = None) -> ConfigFlowResult:
        manager = self.hass.data.get(DOMAIN, {}).get("books", {}).get(self.config_entry.entry_id)
        primary = manager is None or manager.primary
        if user_input is not None:
            if user_input.get("reset_pin") and manager is not None:
                manager.clear_pin()  # 🔓 PIN vergessen? Hier setzt ein Admin sie zurück
            return self.async_create_entry(data={CONF_SIDEBAR: bool(user_input.get(CONF_SIDEBAR))} if primary else {})
        schema = _schema(bool(self.config_entry.options.get(CONF_SIDEBAR, False))) if primary else vol.Schema({})
        if manager is not None and manager.data.get("pin"):
            schema = schema.extend({vol.Optional("reset_pin", default=False): BooleanSelector()})
        return self.async_show_form(step_id="init", data_schema=schema)
