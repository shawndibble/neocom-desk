# Scope decisions — Automatic blueprint pricing weighs every source the tier modal lists

_Recorded 2026-09-29._

- **A Build Plan never opens with an empty Blueprint Acquisition price while
  something the app can see sells the blueprint.** Automatic tier selection
  (`selectBlueprintTier`) now weighs contract originals, the cheapest sell
  order anywhere in the Trade Hub's region, and every LP Store redemption the
  Character could make, alongside the hub-region copies and hub BPO sell
  price it read before. Replaces `20260911-073307`'s "BPC Sourcing, else the
  hub BPO price" cascade and `20260922-164023`'s "automatic tier selection is
  unchanged" bullet. The region-wide market price matters most: NPC-seeded
  originals sell at their seeding corps' stations, rarely at the hub's own.

- **Selection stays a total-cost minimization, not "cheapest blueprint".** An
  owned tier that covers the need is still free, and a pricier high-ME copy
  still wins when the materials it saves outweigh its price. What changed is
  the candidate set: one purchasable candidate per ME/TE tier, priced by the
  offer that covers the needed runs cheapest (a stack of 1-run copies loses
  to one original at the same tier), and the hub BPO price joins that pool
  instead of filling in only when no copy is listed.

- **Contracts in other regions are a last resort**, weighed only when
  nothing above prices the blueprint — a far-off listing beats a blank price,
  but never outbids a local one.

- **A contract prices only when a buyer can simply pay its ask:** never an
  auction (buyout or not) and never a contract asking for PLEX. Multi-type
  bundles and zero-price barters stay excluded as before.

- **An LP redemption costs ISK + LP × LP Value (default 0) + the turn-in
  items the pilot doesn't already hold, at hub sell price.** Turn-ins in the
  pilot's assets cost nothing; a remainder with no hub price makes the offer
  unpriceable rather than cheaper than it is. ESI gives an LP copy no runs,
  so each copy counts as one run — conservative for a many-run node. Owned
  turn-ins are not pooled across blueprints: two offers wanting the same hull
  each see it as owned.

- **An LP Store "Plan in Industry" seeds its redemption as the plan's
  Blueprint Acquisition** — the same ME0/TE0 pick with its price the tier
  modal writes, so it reads as an Override and resets the same way. The
  pilot is looking at the LP Store, so that is where the blueprint comes
  from. The price rides the URL (`?bpPrice=`); a plan already carrying that
  exact pick is reused, otherwise a new "(LP Store)" plan is created beside
  any plain one.

- **Build Opportunities' Market-Wide scan is unchanged.** Its Blueprint
  column names where the blueprint comes from; a plan started from a row now
  prices its blueprint from that source through the rules above, so no scan
  change was needed. Build Opportunities (owned blueprints) stays free at the
  top level per `20260926-222310`.
