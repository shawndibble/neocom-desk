# Scope decisions — Fitting editor: a right panel pushes the page when all three columns still fit

_Recorded 2026-11-09._

- **From 115rem (1840px) a right `SlideOver` open over the Fitting editor takes
  its 26rem off the page's right edge**, so the Pilot or Situation panel no
  longer covers the stats column. The Ring track (`minmax(0,52rem)`) absorbs
  it, shrinking toward its ~29rem floor; the browser and stats keep 20rem and
  22rem. Narrower than 115rem there is no room for all three columns beside the
  panel, so it overlays as before.
- **`SlideOver` carries `data-slide-over="left|right"`**, and the page reserves
  the room in CSS (`body:has([data-slide-over=right])`), so the panel, which
  portals out of the page, needs no state shared with it.
