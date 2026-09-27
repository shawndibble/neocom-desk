# Scope decisions — Ship Tree map: 100% default zoom and pinch-zoom

_Recorded 2026-09-27._

- **The Map opens at 100% (native size), not shrunk to fit.** Applies both to
  first load of the tab and to every faction switch (the same points that
  used to auto-Fit). The manual **Fit** button is unchanged and still resets
  to the shrunk-to-fit view on demand. `initialCamera` in `mapCamera.ts`
  holds this; `fitCamera` is now only reached from the Fit button.
- **The Ladder view is untouched.** No zoom concept was added to it — it
  isn't a canvas, it's a scrollable disclosure list, and the reader who asked
  for this said explicitly it doesn't need one. Pinch-zoom is Map-only. The
  Map was already reachable on a phone via the existing Map/Ladder toggle
  (`ShipTreeTab.tsx`), so no routing change was needed to make pinch usable
  on mobile.
- **Pinch-zoom is touch-gated, not screen-width-gated.** A touchscreen
  laptop gets it; a mouse-only desktop is unaffected either way, since it has
  no second touch point to trigger it.
- **The Map's whole gesture layer (drag-pan, wheel-zoom, pinch-zoom) now runs
  through `@use-gesture/react`**, replacing the previous hand-rolled Pointer
  Events pan and raw non-passive `wheel` listener. This was a deliberate
  choice to unify the three gestures under one library rather than bolt
  pinch on next to two different one-off implementations — see
  `ShipTreeMap.tsx`'s gesture-binding comment.
  - Wheel-zoom and drag-pan intentionally **stopped preserving their old
    tuned feel** (the previous `wheelZoomFactor` unit/notch/cap math, and the
    previous no-momentum direct-follow pan). Both now use the gesture
    library's own deltas/defaults. This was an explicit trade for less
    one-off code, not an oversight; a return to custom tuning (e.g. adding
    momentum-free panning back, or a bespoke wheel curve) is a separate,
    later decision if the library's feel doesn't hold up.
  - `MIN_ZOOM`/`MAX_ZOOM` bounds are unchanged and still enforced (via the
    pinch gesture's `scaleBounds` and `zoomAround`'s existing clamp).
  - `wheelZoomFactor` was removed from `mapCamera.ts` along with its tests,
    since nothing calls it anymore.
