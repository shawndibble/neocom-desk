# Scope decisions — Page settings modal: a page's own settings, edited in place

_Recorded 2026-10-04._

- **A page's settings open in a modal on the page, through the same form Settings renders.** `features/settings/*SettingsForm.tsx` is the one copy; Settings wraps it in a Panel, `PageSettingsModal` in a modal with an "All settings" link to that section. Rules out a second, page-local set of controls that could drift from Settings.
- **A page with a ⋮ menu gets a "Settings…" item; a page without one gets a gear in its header.** A ⋮ menu holding a single item is an extra click for nothing. Today that is Mining › Tax (⋮), and Industry (per tab, below) and Planetary Industry (gear).
- **"Continue sessions across midnight UTC automatically" moves from the Tax tab's ⋮ menu into Mining tax settings.** It is a setting, not an action, and it was missing from Settings entirely. It stays device-local; its note says so, since the rest of that section syncs.
- **No gear on Mining › Overview.** Neither mining setting affects Overview, and its phone header already has a settings sheet for its view controls; a second "settings" there would be ambiguous.
- **Each tab is its own page for settings: the gear shows the settings that tab reads, or no gear.** Industry's tabs share one header, but Build Plans and Opportunities read assumed ME/TE and blueprint cost, BPC Sourcing reads its starting filters, and Records reads none. One Industry-wide modal would show BPC Sourcing settings it doesn't use and hide the ones it does.
- **BPC Sourcing's hide-auctions / hide-PLEX defaults move from Settings › Market to Settings › Industry.** BPC Sourcing is an Industry tab, so its modal's "All settings" link lands on them.
- **No settings modal on Market.** Its page-relevant setting is the trade hub, and the Market page uses the hub picked last rather than the default. Courier collateral, the other Settings › Market control, belongs to Contracts and stays in Settings only for now.
