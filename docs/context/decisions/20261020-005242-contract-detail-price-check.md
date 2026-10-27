# Scope decisions — Contract detail price check

_Recorded 2026-10-20._

- **The contract detail panels share one layout and one "price check".** The
  header carries a status pill with the id, Copy ID and Open contract in EVE;
  a headline strip leads with the figure that matters (Acceptor pays, or Asking
  price); items come before logistics; a timeline replaces the separate date
  rows. Zero ISK rows (Acceptor receives, Collateral) are dropped, never
  printed as 0.00. The panel is a `SlideOver` capped near 28rem, a little over
  the phone's width, so every device shows the same panel.
- **A finished or cancelled own contract is checked at the Open Price of the
  UTC day it was issued, at the Trade Hub station of the pilot's chosen hub.**
  An outstanding own contract, a Contract Search result and a BPC Sourcing
  result are checked against the live book: for something that can still be
  taken, what it costs today is the useful figure. A day with no Open Price
  says "no price for that day", never 0. This reverses issue #717's rule that
  only an outstanding contract gets a market figure: a finished contract now
  answers "was it fair when it was made?", and the live sell-only row is gone,
  replaced by this check.
- **The reader chooses Buy or Sell by tapping the label**, a value that flips
  in place (DESIGN.md §6c). History defaults to Buy, Contract Search to Sell
  (what buying it outright costs).
- **For ISK the ask is compared to the items' value; for items for items,
  Included is compared to Requested**, both valued at the same hub and side.
  If either side cannot be priced the comparison is unavailable, not
  one-sided. Lines with no price are counted ("N items unpriced"), never
  valued at 0.
- **The percent is neutral colour, never `isk-pos`/`isk-neg`.** A contract does
  not say which side the reader is on.
- **Contract Search splits the value into "Your search" and "Other items"** so
  a bundle that is mostly something else says so in ISK, not as a percent.
  Nothing is tagged when no search is active.
- **A blueprint _copy_ never trades at the hub, so it is never valued from the
  hub book.** A copy shares its type with the _original_, whose book does exist
  (a BPO sells on the market), so pricing a copy by its type would silently
  value it at the BPO's price: a 1-run Raven copy against a billion-ISK
  original. A copy line is marked unpriceable and counted ("N items
  unpriced"); an original is priced from its type's book like any item.
  ESI marks a copy in an own contract with `raw_quantity` -2; the public
  snapshot flags it `isBlueprintCopy`.
- **A blueprint copy listing is held per run against similar copies** of the
  same blueprint (ME within 2, TE within 4), shown as median and cheapest, and
  only with at least three similar copies, in Contract Search as well as BPC
  Sourcing. BPC Sourcing's pool is every listed copy in the Public Contract
  Offers snapshot, not the filtered board: a tight ME, price or region filter
  must not shrink what a fair price is judged against. Contract Search's pool
  is the rows read for the search, which cannot see a bundle's other lines; a
  bundle can only raise a per-run rate, so the cheapest is safe and the median
  shrugs off the odd one. Comparing a copy to what it builds (product minus
  materials) is a different question, "is it worth buying at all", and is not
  part of this check.
- **A timeline ends where the contract's story ends.** Cancelled, deleted,
  rejected, failed and reversed contracts end on that outcome, with no
  "Accepted: Waiting" and no date (ESI gives none); a contract nobody accepted
  before its expiry reads "Expired" (ESI leaves it "outstanding"); the
  headline strip shows no expiry for a contract that can no longer be taken.
- **A contract that only asks for items (nothing included) gets no price
  check**, since there is no ask to hold against a value. PLEX is priced from
  its own market on a live check and is unpriced on a past day. An abyssal
  module is never in the hub figure; an own contract's line carries no item
  id, so it reads "not priced" with the reason, as before.
- **Contract Search and BPC panels drop the issuer and issue-date lines** the
  mockup drew: the public snapshot row carries neither.
- **Courier contracts are out of scope** here and keep their own panel.
