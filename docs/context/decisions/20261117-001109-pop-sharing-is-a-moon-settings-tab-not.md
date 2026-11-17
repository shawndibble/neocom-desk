# Scope decisions — Pop Sharing is a Moon settings tab, not a page tab (issue #6304)

_Recorded 2026-11-17 · issue #6304._

- **Sharing is the fifth tab of Moon settings (`BookSettingsDialog`), not a tab of the Moons page.** It is a setting (audiences, Sharing default, Moon overrides), so it sits beside Rates, Billing, Extractions and Access. It still saves apart from the dialog's Save button, as before; the tab says so.
- **A link that opened the Sharing tab now opens Moon settings on Sharing.** `?settings=<tab>` on any Moons URL opens the dialog once and is then removed; `?highlight=<moonId>` rides along to scroll to and pulse a moon's row. `/corp/moons/sharing` redirects to `/corp/moons/overview?settings=sharing`. Rules out a second route for the same dialog.
