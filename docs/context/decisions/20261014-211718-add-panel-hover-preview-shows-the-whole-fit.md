# Scope decisions — Add panel hover preview shows the whole-fit change in a sticky readout (issue #3792)

_Recorded 2026-10-14 · issue #3792._

- **Hovering or focusing a Modules row previews the whole-Fitting change in a readout stuck to the bottom of the browser, not a floating bubble.** A bubble anchored to the row needs a multi-line stat list that `Tooltip` (one line, one focusable trigger) can't carry, and a readout that appears above or beside the rows would move them under the pointer. Rules out a per-row popover.
- **Pointer and keyboard focus only; never on touch.** §6c: hover reinforces but never carries a cue alone, and a long-press on a row opens its menu. Focus from a tap is ignored (`:focus-visible` only).
- **Modules tab only, up to six changed stats, then "and N more".** Charges, Drones and Cargo don't change the stats the way a module does; six keeps the readout short enough to read in one glance.
- **The candidate goes where a click would put it.** The chosen slot, else the first free one; a row a click would add nothing for (no free slot, drones) shows no preview — its warning triangle already says why.
