# Scope decisions — Mining Tax rows carry a row menu

_Recorded 2026-10-23._

- **Every Mining Tax row (Open and History) has a right-click / long-press menu and a trailing ⋮, View details first, then the actions its detail modal offers.** Shawn asked for it explicitly, so this is a deliberate exception to DESIGN.md §6c's "reachable nowhere else in one tap" restraint: a pilot working a long ledger settles, marks paid or unassigns without opening each row. The menu and the modal share the same host handlers, so they cannot drift in behaviour.
- **A row whose only action would be View details gets no menu and no ⋮** (a settled Corp Tax Book row): the row click already does that, and a one-item menu is noise.
- **Unassign from the menu opens the detail with its confirmation already showing**; it deletes, so it still asks.
- **A combined entry's extra actions sit in a chevron beside Edit**, the same split button a single entry's detail uses, not a ⋮ in the title.
