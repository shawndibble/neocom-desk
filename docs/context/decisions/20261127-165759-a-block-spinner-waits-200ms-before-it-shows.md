# Scope decisions — A block spinner waits 200ms before it shows

_Recorded 2026-11-27._

- **`Spinner block="page" | "panel"` defaults `delayMs` to 200.** Most content loads (a Dexie
  read, a warm chunk) settle in under 100ms, and an arc drawn for a frame or two then swapped for
  content reads as a flicker (the one #5453 fixed for one page). Only 10 of 255 call sites passed a
  delay, so the default moves to the component instead of every call site. The held-back state is
  a same-size `aria-hidden` box, so nothing shifts when the arc appears.
- **Inline spinners stay immediate.** A `Spinner` with no `block` (`Button loading`, a row or
  field cue) answers a press the pilot just made, so it shows at once.
- **An explicit `delayMs` still wins, `0` included.** A caller that must show the arc at once
  passes `delayMs={0}`.
- **Reduced motion keeps the old immediate arc.** Under `prefers-reduced-motion: reduce` a block
  spinner gets no default delay, as before this change.
