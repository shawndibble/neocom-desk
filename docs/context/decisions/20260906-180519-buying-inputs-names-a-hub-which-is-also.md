# Scope decisions — Buying inputs names a hub, which is also the price basis

_Recorded 2026-09-06._

- **Buying planetary inputs names a hub rather than being a checkbox, and
  that hub is the whole tab's price basis.** This supersedes decision
  20260906-143216's "market sourcing is a checkbox, off by default". The
  default is unchanged in substance — `'none'` is off, and the reasoning holds:
  buying assumes a trade hub the pilot can actually reach. What the checkbox
  could not express is _which_ hub, so every figure on the tab was priced at
  Jita whether or not Jita was the market they trade in.

- **One hub, both sides.** The selection is the permission to plan a purchase
  _and_ the market the output is valued at, so an Amarr pilot's margins are
  Amarr's rather than Jita's under an Amarr-shaped label. `'none'` keeps the
  reference hub for revenue — output still has to be priced somewhere — while
  refusing to plan a purchase. This rules out pricing inputs and revenue at
  different hubs, which would need two price loads to state one margin.

- **The stored key held a boolean, and an old value falls back to `'none'`.**
  `false` meant exactly that; `true` meant "Jita, because Jita was the only
  option", which is an assumption worth making the pilot restate now that it is
  a choice.
