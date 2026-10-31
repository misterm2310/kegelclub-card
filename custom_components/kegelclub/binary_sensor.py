"""🎳 Läuft gerade ein Kegelabend? (an = ja) – praktisch für Automationen, z. B. Licht oder Musik."""

from __future__ import annotations

from homeassistant.components.binary_sensor import BinarySensorEntity
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN
from .sensor import device_info, entity_prefix


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities([KcRunning(hass, entry)])


class KcRunning(BinarySensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Abend läuft"
    _attr_icon = "mdi:bowling"

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry) -> None:
        self.hass = hass
        self._attr_unique_id = f"{entry.entry_id}_running"
        self._attr_device_info = device_info(entry)
        self._entry_id = entry.entry_id
        self.entity_id = f"binary_sensor.{entity_prefix(hass, entry)}_abend_laeuft"

    @property
    def _m(self):
        return self.hass.data[DOMAIN]["books"][self._entry_id]

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, self._m.signal, self.async_write_ha_state))

    @property
    def is_on(self) -> bool:
        return bool(self._m.summary()["running"])

    @property
    def extra_state_attributes(self):
        s = self._m.summary()
        return {"datum": s["running_date"], "abend": s["running"]}
