# Scope decisions — Assets place rows offer Rename in their menu (issue #5741)

_Recorded 2026-10-31 · issue #5741._

- **A station row's menu offers Rename; it supersedes "not on the location list rows" in `20261030-082351-place-nicknames-are-an-assets-only-personal-label.md`.** The row already carries the ⋮ menu (#5748), so Rename adds no control to the row, which was that decision's reason for keeping it off the list. The edit is still owned by `StationHeading`: the item drills in with router state and the heading opens its field, so there is one nickname editor. Rename stays off container, unresolved and corp rows.
- **The open-on-arrival flag lives in history state.** Back/forward onto that entry may reopen the field; accepted as harmless (Esc closes it).
