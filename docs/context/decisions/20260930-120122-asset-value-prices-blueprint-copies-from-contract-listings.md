# Scope decisions — Asset value prices blueprint copies from contract listings

_Recorded 2026-09-30._

- **A blueprint copy's estimated value on Assets and Corp Assets comes from
  the Public Contract Offers snapshot, never the market average price.** A copy shares its
  original's typeID, and ESI's average price for that typeID is the
  original's, so a pilot's 117M copy library read as 2.1T. Originals, and
  every non-blueprint item, keep the global average price.

- **Match the copy's own ME/TE, else ME0/TE0, else a mixed-ME/TE contract
  of the same blueprint, else 0.** No "nearest tier"
  guess between them. A copy whose blueprint record can't be read (the
  Character hasn't granted the blueprints scope, or the corp read needs
  Director) prices at ME0/TE0. A contract of this blueprint's copies at
  differing ME/TE is the last resort, used only when neither tier has an
  Offer. When nothing matches at all, the copy counts as 0, never at the
  original's price.

- **Median of the matching Offers, as ISK/run × the copy's remaining runs.**
  The median stops one lowball or troll ask from swinging a total. A copy
  with no known runs is worth the median ask per copy.

- **Only a contract selling one blueprint prices it.** A contract carrying
  any other item type is skipped, because its ask covers the whole bundle.
  A contract whose lines are all copies of the same blueprint divides its
  ask across every copy and run it sells. At one ME/TE it prices that tier;
  mixing ME/TE, it is the last-resort rate above. One that also sells the
  original is skipped: it shares the copies' typeID but
  is not the same blueprint, and its price would ride along.
  Auctions, PLEX asks and zero-price barters are skipped too, and so are BPOs
  sold by contract.

- **Global, not hub-region.** This matches the average price the rest of the
  asset total uses.
