# Scope decisions — PI Plan ISK figures rove: one tab stop per panel (issue #2742)

_Recorded 2026-10-05 · issue #2742. Supersedes the first bullet of `20261005-212844-pi-plan-isk-figures-are-not-tab-stops.md` (#2710); restores `20260924-124017-isk-amounts-stay-a-tab-stop-and-read.md`._

- **ISK figures on the PI Plan are keyboard-reachable again.** Each Plan panel wraps its figures in `IskFigureGroup`: a roving tabindex, so Tab lands on one figure per panel and arrow keys / Home / End move between figures; each shows its exact value on focus. Tab-stop count before the first action drops from one per figure (~20+) to one per panel. Picked over one stop per row because rows have mixed real controls and a per-row reveal needs a new gesture; the roving group is a known grammar (§6c) and needs no new one. Arrow keys act only while a figure has focus, so inputs and selects in a panel keep theirs.
- **`IskTabStopContext` is removed**, replaced by `IskFigureGroupContext` (internal to `IskAmount`/`IskFigureGroup`). Other surfaces are unchanged: `IskAmount` outside a group stays its own tab stop.
