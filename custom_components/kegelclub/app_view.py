"""📱 Offline-App unter /kegelclub/app/ – eine eigene kleine Seite nur für die Kegelclub.

Die Seite selbst enthält KEINE Zahlen. Die kommen erst nach der Anmeldung über die normale,
geschützte Home-Assistant-Verbindung und werden dann im Handy gemerkt (für ohne Netz).
"""

from __future__ import annotations

from pathlib import Path

from aiohttp import web

from homeassistant.components.http import HomeAssistantView
from homeassistant.core import HomeAssistant, callback

from .const import APP_URL, DOMAIN, VERSION

APP_DIR = Path(__file__).parent / "www" / "app"
_TYPES = {
    "index.html": "text/html",
    "sw.js": "text/javascript",
    "manifest.webmanifest": "application/manifest+json",
    "icon-192.png": "image/png",
    "icon-512.png": "image/png",
    "icons.json": "application/json",  # Material Design Icons (Pictogrammers, frei), nur die paar Symbole der Karte
}


class AppView(HomeAssistantView):
    url = "/kegelclub/app/{file:.*}"
    name = "kegelclub:app"
    requires_auth = False

    async def get(self, request: web.Request, file: str = "") -> web.StreamResponse:
        file = file or "index.html"
        if file not in _TYPES:
            return web.Response(status=404)
        hass = request.app["hass"]
        body = await hass.async_add_executor_job((APP_DIR / file).read_bytes)
        if file in ("index.html", "sw.js"):
            body = body.replace(b"__KC_VERSION__", VERSION.encode())
        headers = {"Cache-Control": "no-cache"}
        if file == "sw.js":
            headers["Service-Worker-Allowed"] = APP_URL
        charset = None if file.endswith(".png") else "utf-8"
        return web.Response(body=body, content_type=_TYPES[file], charset=charset, headers=headers)


class AppRedirectView(HomeAssistantView):
    url = "/kegelclub/app"
    name = "kegelclub:app_redirect"
    requires_auth = False

    async def get(self, request: web.Request) -> web.StreamResponse:
        raise web.HTTPFound(APP_URL)


@callback
def async_register_app(hass: HomeAssistant) -> None:
    if hass.data[DOMAIN].get("app_registered"):
        return
    hass.data[DOMAIN]["app_registered"] = True
    hass.http.register_view(AppView())
    hass.http.register_view(AppRedirectView())
