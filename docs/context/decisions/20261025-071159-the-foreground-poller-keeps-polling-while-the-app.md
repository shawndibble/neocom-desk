# Scope decisions — The Foreground Poller keeps polling while the app is hidden (issue #5120)

_Recorded 2026-10-25 · issue #5120._

- **The poller's Tab Leader keeps polling while hidden.** The owner switches
  apps on the Play Store app for a few minutes and expects device pop-ups for
  in-app-only events (skyhook or incursion nearby, mail, fills). Before, the
  poller skipped every tick while `document.hidden` and the leader gave its lock
  up on hiding, so switching apps stopped all checks. This amends the
  2026-09-28 multi-tab decision for the poller only; the sweep is unchanged.
- **A tab being shown steals the poller lock (Web Locks `steal`); a displaced
  leader queues up again.** A visible tab always wins over a hidden one, which
  the browser may have frozen while still holding the lock. Only the transition
  to visible (and a visible boot) steals, so two shown tabs never trade the lock
  back and forth. A hidden tab leads only when nobody else does.
- **Best effort, not a substitute for push.** Android Chrome throttles and then
  freezes a background page within minutes, so this covers a short switch-away,
  not hours. A closed app is push's job (issues #5121, #5122).
- **Ruled out:** periodic background sync — ADR 0009 replaced it with push.
