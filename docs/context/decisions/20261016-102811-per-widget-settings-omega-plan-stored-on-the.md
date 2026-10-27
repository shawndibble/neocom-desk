# Scope decisions — Per-widget settings: Omega plan stored on the widget (issue #3920)

_Recorded 2026-10-16 · issue #3920._

- **A widget's own numeric setting is a field on the `Widget` in the synced Overview Layout** (`plexPer30Days` on Omega coverage, 500 by default, stored only when changed, the `rowsPerPage` pattern), edited from the widget's ⋮ menu in a small dialog. It reaches the builder through the view request's key, so two widgets of one kind with different plans each get their own view. It rules out a second settings store for widgets. The value is worded as the pilot's plan, never a fact: Omega's PLEX price is in neither ESI nor the SDE.
