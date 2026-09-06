# Scope decisions — Advisor cards say what to do, not what would fit

_Recorded 2026-09-06._

- **The "Room for" row is replaced by a "Do this" action list, and the capacity
  figures survive only as a footnote under it.** The row reported, per pin kind,
  what the leftover budget would hold. Every number in it was correct — the
  counts reconcile against a colony's measured load to the megawatt — and it
  still failed, because "6x High-Tech Production Plant would fit" is not an
  answer to a pilot who makes no P2 and therefore has nothing to put in one. The
  reporting pilot said so three times in escalating terms, ending at "I need to
  know what I should be doing on each planet. Not all the various options
  available to me." This rules out filtering the row to only feedable kinds,
  which was the first fix considered: a shorter menu is still a menu.

- **A pin is offered only with what goes in it, what comes out, and what that is
  worth.** Each "add" line names the product, the inputs, where each input comes
  from and the ISK an hour after customs. This rules out ever naming a pin kind
  on its own, which is what made the old row unactionable.

- **An input's source is stated as one of three things: already made here, routed
  in from another colony, or bought at the hub.** They cost the same — `chainCost`
  charges the hub price for a sourced line either way, because routing a P1 you
  grew forgoes selling it for exactly that — but the _work_ differs: a link, a
  customs boundary, or a shopping trip. The pilot asked to be told which.

- **`planNetwork` may source inputs no colony makes from the market, and now
  enumerates P3 as well as P2.** Without this a pilot whose colonies make no P2
  gets silence about an Advanced Industry Facility and a High-Tech Production
  Plant, which is what left the card offering pins it could not fill. Colony
  material stays a scarce pool; bought material constrains only the wallet, so it
  does not enter the supply bound.

- **Superseded — see the buy-side bullet below.** This entry originally read
  "Prices are lowest hub sell on both sides, and the card says so", and ruled
  out a buy-side basis on the grounds that "a Build Plan and a planetary chain
  must agree about what a thing costs, and two paths is how they stop agreeing".
  That rationale was wrong on the facts: `MarketSnapshot` already carries
  `hubBuyPrices` out of the same `getHubPrices` aggregate, already read by Build
  Plans' `'buy'` basis and the LP store. There was never a second path to build.

- **Revenue is valued at the hub's highest buy; cost at its lowest sell.** What
  an input costs is the ask, because that is what you pay. What an output earns
  is the bid, because that is what someone pays you. Quoting the ask on both
  sides credits the whole spread on every unit, twice over on a chain that both
  buys and sells. Material you already made and route rather than sell is
  charged at the bid too — the cost of consuming it is the sale forgone, and you
  would have sold into a buy order, not at your own ask (`chainCost`'s
  `sourcedBasis: 'own'`).

  It is not a rounding difference. Water-Cooled CPU quotes 713 bid against 7,470
  ask at Jita — a 90% spread on a market with no real buyers — and the one-sided
  basis valued it at the ask, which is how it reached the candidate list at all.

- **An idle facility is one decision, not two suggestions: remove it, or buy the
  extraction that feeds it.** The Advisor previously only offered removal, which
  is the wrong half on a colony whose own card says _keep selling this P1 raw_ —
  every extra unit reaching an idle facility is another P1 sold. `extractionUpgrade`
  sizes the alternative, and because both want the same Powergrid it reports
  whether extraction fits now, only after removal, or not at all. An Extractor
  Control Unit is 2,600 MW before a single head, so on a Command Center level 5
  colony the answer is usually "only after removal" — which is advice, where
  silence was not.

- **The extraction rate for a new head is measured, and only on a colony
  extracting a single resource.** Total extraction over head count is that
  resource's rate per head only when there is one resource; with two it is an
  average across ores and would size the purchase wrong. No richness figure
  exists in ESI to derive one from, so the alternative is not offered rather than
  guessed — the same refusal `chain.ts` makes.

- **A product may be named on both the "Together" panel and its host planet's
  card.** That is a summary and its detail, not a duplicate recommendation: the
  panel says the set can reach it, the card says to build it and carries the
  routes and the ISK. The pilot reads the card.

- **Pin kinds use `CONTEXT.md`'s glossary terms exactly** — Basic Industry
  Facility, Advanced Industry Facility, High-Tech Production Plant, Storage
  Facility, Launchpad, Extractor Control Unit. The UI had been saying "basic
  factory" and "high-tech plant", which are not what the client calls them.
