# Scope decisions — The Industry Logs tab shows only once a Production Run is logged

_Recorded 2026-10-13._

- **The Records tab is renamed Logs (`/industry/logs`; `/industry/records` redirects) and is left out of the Industry tab strip, the rail and the command palette until the active Character has at least one Production Run.** The page holds only the Production Log, so before a run is logged it is an empty state with nothing to act on, and "Records" read as something broader than it is. It stays in the strip while it is the open tab, so a direct visit never loses its own tab. This is the one deliberate exception to "every page keeps its tab strip" (`20261013-122802-phones-keep-the-tab-strip-no-view-picker`): that rule is about the strip's shape on a phone, not about listing a tab with nothing behind it.
