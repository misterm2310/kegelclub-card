// 📌 Seitenleisten-Ansicht: zeigt die Kegelclub-Karte über die ganze Seite (Option „In der Seitenleiste anzeigen“).
class KegelclubPanel extends HTMLElement {
  set hass(hass) { this._hass = hass; if (this._card) this._card.hass = hass; }
  set narrow(v) { this._narrow = !!v; if (this._menu) this._menu.style.display = this._narrow ? "" : "none"; }
  set panel(p) { this._panel = p; this._load(); }
  connectedCallback() { this._build(); this._load(); }
  _build() {
    if (this._built) return;
    this._built = true;
    this.style.cssText = "display:block;height:100%;background:var(--primary-background-color);overflow:auto;";
    const menu = document.createElement("button");
    menu.textContent = "☰";
    menu.setAttribute("aria-label", "Menü");
    menu.style.cssText = "font-size:24px;background:none;border:none;color:var(--primary-text-color);cursor:pointer;padding:8px 14px 0;";
    menu.style.display = this._narrow ? "" : "none";
    menu.addEventListener("click", () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true })));
    this._menu = menu;
    this._wrap = document.createElement("div");
    this._wrap.style.cssText = "max-width:760px;margin:0 auto;padding:8px 12px 24px;";
    this.append(menu, this._wrap);
  }
  async _load() {
    if (this._card || this._loading || !this._built) return;
    this._loading = true;
    try {
      if (!customElements.get("kegelclub-card")) await import(this._panel?.config?.card_url || "/kegelclub/files/kegelclub-card.js");
      await customElements.whenDefined("kegelclub-card");
      const card = document.createElement("kegelclub-card");
      card.setConfig({ title: "Kegelclub" });
      this._card = card;
      this._wrap.append(card);
      if (this._hass) card.hass = this._hass;
    } catch (err) {
      this._wrap.textContent = "Die Kegelclub konnten nicht geladen werden: " + (err?.message || err);
    } finally { this._loading = false; }
  }
}
if (!customElements.get("kegelclub-panel")) customElements.define("kegelclub-panel", KegelclubPanel);
