# Scope decisions — Header controls follow three tiers (issue #3061)

_Recorded 2026-10-08 · issue #3061._

- **Header controls follow three tiers.** Tier 1: a control that switches scope or mode always shows a text label at every width (the Character scope trigger shows a short label on a phone; the Net worth Layers picker reads as a dropdown). Tier 2: frequent actions (Columns, filter, export) show icon + text from `md` up and stay icon-only below it, via `IconButton`'s `visibleLabel`. Tier 3: rare actions live in one ⋮ "More actions" menu with text items, only with two or more real actions. Refresh stays a standalone icon. Presentation only: no control gains or loses a function.

- **Market scope bar funnel left icon-only for now.** The scope bar is already full at 1280 and its station name truncates; labelling it needs a width check at 1024/1280 before shipping, so `FilterBar's` `triggerLabel` is opt-in and Market does not use it yet.
