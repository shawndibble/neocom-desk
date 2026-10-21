# Scope decisions — Contracts Corp view is scope-gated, not role-gated, and lives on History (issue #4607)

_Recorded 2026-10-20 · issue #4607._

- **The Corp scope is a Character / Corp toggle on Contracts › History, shown when the corp contracts scope is granted, whatever the in-game roles.** ESI asks for no role on this read, so a plain member (hidden from `/corp`) reaches it here; the widget's title link points at it. Not granted: no toggle at all (hide, do not lock). Rules out a `useCorpAccess` gate, which would hide it from the members ESI allows.
- **`?scope=corp` is URL view state (ADR 0015), default omitted; its filter and sort keys are `corp.*`.** The tab stays `history`; Item search and Courier are public and have no scope.
- **Row-open reads the corp items route; bids are not read.** Corp widget and list cover courier and item-exchange; nothing in the detail view shows bids, so the bids route is left unwired until an auction view needs it.
