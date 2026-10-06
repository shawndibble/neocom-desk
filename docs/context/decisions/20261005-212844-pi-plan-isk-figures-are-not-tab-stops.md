# Scope decisions — PI Plan ISK figures are not tab stops (issue #2710)

_Recorded 2026-10-05 · issue #2710._

- **The PI Plan's ISK figures are not tab stops.** The Plan had ~20 before its first action. `IskTabStopContext` (false) drops them; the exact figure stays as visually hidden text for screen readers and still shows on hover/tap. Rules out: a sighted keyboard-only user reading the exact figure by focus on the Plan. Accepted per the #2710 brief (one stop per row); every other surface keeps `IskAmount` focusable.
- **SlideOver focuses the panel, not Close, on open, and returns focus to its opener on close.** Fixes the Close tooltip eating the first Escape for every SlideOver, not only the PI explainer.
