# Scope decisions — Automatic blueprint pricing weighs every source the tier modal lists

_Recorded 2026-09-29._

- **A Build Plan never opens with an empty Blueprint Acquisition price while
  something the app can see sells the blueprint.** Automatic tier selection
  (`selectBlueprintTier`) now weighs contract originals, the cheapest sell
  order anywhere in the blueprint's market region (the Trade Hub's, or its
  Global Market Region — the same region the tier modal reads), and every LP
  Store redemption any of the account's Characters could make (an alt's LP
  buys a copy the builder can be handed — the Market-Wide scan's own reach),
  alongside the hub-region copies and hub BPO sell
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
  unpriceable rather than cheaper than it is. The tier modal's LP rows carry
  the same turn-in cost, so a picked row writes the price automatic pricing
  would. A redemption with no ISK side is genuinely free at LP Value 0 and
  prices at 0 — unlike a zero-ISK contract, which is a barter. ESI gives an LP copy no runs,
  so each copy counts as one run — conservative for a many-run node. Owned
  turn-ins are not pooled across blueprints: two offers wanting the same hull
  each see it as owned.

- **An LP Store "Plan in Industry" seeds its redemption as the plan's
  Blueprint Acquisition** — the same ME0/TE0 pick with its price the tier
  modal writes, so it reads as an Override and resets the same way. The
  pilot is looking at the LP Store, so that is where the blueprint comes
  from. The price rides the URL (`?bpPrice=`). A plan already carrying an
  ME0/TE0 priced pick is reused with its price refreshed — the price drifts
  with hub prices, LP Value and assets, and exact matching would pile up a
  plan per drift — otherwise a new "(LP Store)" plan is created beside any
  plain one.

- **Build Opportunities' Market-Wide scan is unchanged.** Its Blueprint
  column names where the blueprint comes from; a plan started from a row now
  prices its blueprint from that source through the rules above, so no scan
  change was needed. Build Opportunities (owned blueprints) stays free at the
  top level per `20260926-222310`.

- **Known gaps, left as they are:** a Market-Wide row can name a source the
  plan still can't price — contracts that are only auctions or PLEX barters,
  a blueprint NPC-seeded only outside the hub's region, or one owned only by
  an alt (a plan counts its own Character's blueprints). The contract data
  records PLEX requests only, so a contract asking for other items in
  exchange still reads as a plain ISK ask.
