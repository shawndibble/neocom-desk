# Scope decisions — Dimmed widget figure uses text-dim, not opacity; pointer hit floor is 24px (issue #6559)

_Recorded 2026-11-22 · issue #6559._

- **A widget showing its last-good figure after a failed load dims the figure with `text-text-dim`, never `opacity-45`.** The secondary line and the "Last updated" note stay at full colour. 45% opacity measured 2.4:1 (axe); `text-dim` clears 4.5:1. Gallery "soon" cards drop their `opacity-60` for the same reason; the badge says why.
- **Pointer text actions and inline links floor at 24px (`min-h-6`), not 36px.** WCAG 2.5.8's bar; the 36px tier stays on touch (`touch:`/below `md`). `text-text-faint` is never used for content (PlayersView's "no data" and unsigned count now `text-dim`). Disabled-control opacity (`opacity-40`) is unchanged: WCAG exempts disabled controls and §6c States defines it.
