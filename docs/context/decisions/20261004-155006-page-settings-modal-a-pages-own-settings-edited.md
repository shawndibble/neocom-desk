# Scope decisions — Page settings modal: a page's own settings, edited in place

_Recorded 2026-10-04._

- **A page's settings open in a modal on the page, through the same form Settings renders.** `features/settings/*SettingsForm.tsx` is the one copy; Settings wraps it in a Panel, `PageSettingsModal` in a modal with an "All settings" link to that section. Rules out a second, page-local set of controls that could drift from Settings.
- **A page with a ⋮ menu gets a "Settings…" item; a page without one gets a gear in its header.** A ⋮ menu holding a single item is an extra click for nothing. Today that is Mining › Tax (⋮) and Industry and Planetary Industry (gear).
- **"Continue sessions across midnight UTC automatically" moves from the Tax tab's ⋮ menu into Mining tax settings.** It is a setting, not an action, and it was missing from Settings entirely. It stays device-local; its note says so, since the rest of that section syncs.
- **No gear on Mining › Overview.** Neither mining setting affects Overview, and its phone header already has a settings sheet for its view controls; a second "settings" there would be ambiguous.
- **No settings modal on Market.** Its page-relevant setting is the trade hub, and the Market page uses the hub picked last rather than the default. Settings › Market's other controls belong to other pages (courier collateral: Contracts; BPC sourcing filters: Industry). Those stay in Settings only for now.
