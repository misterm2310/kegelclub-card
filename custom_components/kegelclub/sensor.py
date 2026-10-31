"""📊 Sensoren: Kegelkasse, Offen, Letzter Abend – für Dashboard und eigene Automationen."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

from homeassistant.components.sensor import SensorDeviceClass, SensorEntity, SensorEntityDescription, SensorStateClass
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback

from .const import DOMAIN, VERSION


@dataclass(frozen=True, kw_only=True)
class KcSensorDescription(SensorEntityDescription):
    value: Callable[[dict[str, Any]], Any]
    attrs: Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]] | None = None


def _money(key: str, name: str, icon: str, attrs=None) -> KcSensorDescription:
    return KcSensorDescription(
        key=key, name=name, icon=icon, device_class=SensorDeviceClass.MONETARY,
        native_unit_of_measurement="EUR", state_class=SensorStateClass.TOTAL, suggested_display_precision=2,
        value=lambda s, k=key: s[k], attrs=attrs,
    )


def _open_attrs(s: dict[str, Any], d: dict[str, Any]) -> dict[str, Any]:
    """💸 Wer schuldet der Kasse wie viel (nur wer wirklich etwas offen hat)."""
    debts = {p["name"]: p["debt"] for p in sorted(s["people"], key=lambda p: -p["debt"]) if p["debt"] > 0}
    return {"anzahl": len(debts), "personen": debts}


def _kasse_attrs(s: dict[str, Any], d: dict[str, Any]) -> dict[str, Any]:
    return {"offen": s["open"], "soll_mit_offenen": s["soll"], "kegelbahn_gesamt": s["lane_total"], "abende": s["evenings"]}


def _last_attrs(s: dict[str, Any], d: dict[str, Any]) -> dict[str, Any]:
    last = s.get("last") or {}
    return {"datum": last.get("date"), "summe": last.get("total")}


SENSORS = [
    _money("kasse", "Kegelkasse", "mdi:treasure-chest-outline", _kasse_attrs),
    _money("open", "Offen", "mdi:account-cash-outline", _open_attrs),
    KcSensorDescription(key="last", name="Letzter Abend", icon="mdi:bowling",
                        value=lambda s: (s.get("last") or {}).get("date") or "noch keiner", attrs=_last_attrs),
    KcSensorDescription(key="evenings", name="Abende", icon="mdi:calendar-check-outline",
                        state_class=SensorStateClass.TOTAL, value=lambda s: s["evenings"]),
]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry, async_add_entities: AddEntitiesCallback) -> None:
    async_add_entities(KcSensor(hass, entry, d) for d in SENSORS)


def device_info(entry: ConfigEntry) -> DeviceInfo:
    return DeviceInfo(identifiers={(DOMAIN, entry.entry_id)}, name=entry.title or "Kegelclub", manufacturer="Mister-M",
                      sw_version=VERSION, entry_type=DeviceEntryType.SERVICE)


class KcSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_should_poll = False

    def __init__(self, hass: HomeAssistant, entry: ConfigEntry, desc: KcSensorDescription) -> None:
        self.hass = hass
        self.entity_description = desc
        self._attr_unique_id = f"{entry.entry_id}_{desc.key}"
        self._attr_device_info = device_info(entry)
        self._entry_id = entry.entry_id
        self.entity_id = f"sensor.{entity_prefix(hass, entry)}_{_slug(desc.name)}"

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(async_dispatcher_connect(self.hass, self._m.signal, self._update))

    @callback
    def _update(self) -> None:
        self.async_write_ha_state()

    @property
    def _m(self):
        return self.hass.data[DOMAIN]["books"][self._entry_id]

    @property
    def native_unit_of_measurement(self) -> str | None:
        """💱 Geld-Sensoren nehmen die Währung aus ⚙️ (EUR, CHF …)"""
        if self.entity_description.device_class != SensorDeviceClass.MONETARY:
            return None
        return (self._m.data.get("settings") or {}).get("currency") or "EUR"

    @property
    def native_value(self) -> Any:
        return self.entity_description.value(self._m.summary())

    @property
    def extra_state_attributes(self) -> dict[str, Any] | None:
        if self.entity_description.attrs is None:
            return None
        return self.entity_description.attrs(self._m.summary(), self._m.data)


def entity_prefix(hass: HomeAssistant, entry: ConfigEntry) -> str:
    """🏠 Erster Club: sensor.kegelclub_… (wie bisher) · weitere: sensor.kegelclub_<name>_…"""
    m = hass.data[DOMAIN]["books"][entry.entry_id]
    return "kegelclub" if m.primary else f"kegelclub_{_slug(entry.title)}"


def _slug(name: str) -> str:
    out = name.lower()
    for a, b in (("ä", "ae"), ("ö", "oe"), ("ü", "ue"), ("ß", "ss"), (" ", "_")):
        out = out.replace(a, b)
    return "".join(c if c.isalnum() or c == "_" else "_" for c in out).strip("_")
