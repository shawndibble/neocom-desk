# Scope decisions — CONCORD LP exchange rates follow a faction rule (issue #2912)

_Recorded 2026-10-08 · issue #2912._

- **The rate is a faction rule, not per-offer data.** ESI has no exchange-rate endpoint, so `concordRate` (`src/engine/loyalty/concordExchange.ts`) maps `factionId` to 0.8 (verified in game: Empire factions, Ammatar, Khanid) or 0.4 (assumed from the UniWiki, unverified: Intaki, ORE, Thukker, Sisters of EVE, Genolution/SoCT, Mordu's Legion, True Creations). The 0.4 is labelled "assumed" wherever it shows.
- **No exchange means no number.** CONCORD, pirate factions, Triglavians and the EverMark corps (Paragon, Inner Zone Shipping, Zero-G Research Firm, which pay EverMarks) show "No CONCORD exchange"; so do Food Relief and The Sanctuary, though they sit in the Sisters of EVE faction. A missing or unknown faction is the same.
- **Display only.** The LP Store's "Value in" option changes the ISK-per-LP column, its sort and the detail headline; profit, the engine and every other LP valuation (Blueprint Acquisition, Implant Finder, market LP value) stay in corporation LP. The station-only, Character-wallet-only rule is help text, not modelled. CSV export keeps corporation LP.
