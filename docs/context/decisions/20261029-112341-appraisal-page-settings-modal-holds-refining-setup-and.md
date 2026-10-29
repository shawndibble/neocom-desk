# Scope decisions — Appraisal page settings modal holds refining setup and hauling ship

_Recorded 2026-10-29._

- **The Appraisal tab's page settings (a gear before Refresh, like Planetary Industry) hold only the Refining Setup (Facility Yield, Reprocessing Tax) and the hauling ship.** These are set-once preferences. Price %, the Trade Hub, "Minus owned" and the Columns picker are per-appraisal or per-result and stay beside what they change; opening a modal for them would slow the on-the-fly use they exist for.
- **The Refine total chip stays in the result header, but the yield and tax chips are gone from it.** The total already moves when the setup changes. The buy-ore and ore-decision dialogs keep their own chips.
- **The "Pick hauling ship" actions-menu item and its modal are removed.** The settings modal holds the same picker, always, so a pilot with no ship set has one place to set it. The hold bar's ship-name popover stays for changing it in place.
