# Scope decisions — Suggested order prices are legal 4-significant-figure ticks; sell undercuts one tick, floors round up (issue #1421)

_Recorded 2026-09-24 · issue #1421._

- **Every suggested order price in Open Orders is a legal EVE price — at most
  four significant figures, 0.01 ISK minimum — never the rival's raw price.**
  Since the March 2020 patch EVE has rejected any order price with a fifth
  significant digit, so a "match their price" suggestion priced at the
  rival's exact figure was never actually postable; the player had to round
  it themselves and re-check the math. A new pure engine,
  `src/engine/market/priceTick.ts`, is the one place that rounds a price to
  its own legal tick (worked in integer cents throughout, so float drift
  can't turn 999.9 into 999.8999999999999).
- **Beating a seller rounds DOWN one tick (undercut); beating a buyer rounds
  UP one tick (outbid); a safety floor rounds UP.** These are three different
  "safe directions" for the same rounding engine, not one rule: undercutting
  a seller must land strictly below them or it isn't an undercut, outbidding
  a buyer must land strictly above, and a break-even floor must never round
  down below the true cost or the number stops being a floor.
- **This supersedes the "matching is a price edit…" line in
  `docs/context/decisions/20260906-170442-open-orders-rows-say-what-is-happening-not.md`'s
  exits bullet.** That bullet assumed pricing the match exit at the rival's
  exact price was the honest number; it wasn't, since that price was never
  legal to actually list. The exit (renamed `undercutStation`, from
  `matchStation`) is now priced at `undercutPrice(rival)` — one legal tick
  under — and every other place that used to quote the rival's raw price as
  a suggestion (the row summary's match outcome, the verdict's `matchThem`/
  `letGo`, the "Never sell below" floor, `raisePrice`'s target) now quotes a
  legal price the same way. Rival prices, hub bids and appraisal prices
  themselves are untouched — those are facts already on the market, not
  suggestions this app is making up.
- **`belowFloor` detection stays exact.** Only the DISPLAYED/suggested number
  rounds (up, to stay safe); the underlying `OrderFloor.relist` an order is
  compared against for "is this order priced below cost" never rounds, so
  rounding-for-display can't accidentally hide a real below-floor order or
  flag a healthy one.
- **Every suggested price gets a one-tap copy button (`CopyablePrice.tsx`),
  putting PLAIN DIGITS on the clipboard** — `1233000`, or `12.34` with cents
  — never `formatIsk`'s comma-grouped on-screen text, which EVE's own price
  field would reject. `OpenOrdersPanel`'s row-level floor column is the one
  exception: text only, no copy button, since there's no room in the row.
