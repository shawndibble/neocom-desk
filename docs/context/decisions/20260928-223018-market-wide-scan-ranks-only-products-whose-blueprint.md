# Scope decisions — Market-wide scan ranks only products whose blueprint you own or can buy

_Recorded 2026-09-28._

- **"What's profitable to build" drops every product whose blueprint no source carries.** A product the pilot has no way to build is not an opportunity, however profitable. The sources are: owned by any Character on the account (original or copy), the NPC market, a public contract, and an LP store. Invention is not a source: the flattened tree carries no invention cost, so a T2 row reached only by inventing would be priced wrong.

- **The filter runs before the top-N-per-Market-Group cut.** Otherwise an unobtainable product with deeper sell orders takes the slot an obtainable one would have filled, and the group shows nothing.

- **"On the NPC market" means the blueprint is market-grouped (`market/types.json`), not that the hub has a live sell order.** CCP only market-groups the blueprints NPCs sell (T1, capital components, Upwell), and T2 and faction blueprints never are. An order-book check would be one ESI request per blueprint, per scan. Rules out a live check.

- **Contracts count in any region, copies and originals alike, multi-type bundles and auctions included.** Each is a way to get the blueprint. The price is not used, so only whether it is listed matters.

- **LP stores are read only for corps some Character holds points with.** ESI has no "who sells this type" search, so this is the same reach as Appraisal's LP lookup.

- **A source that could not be read is named on the panel, not hidden.** With sync not configured, no Character, a revoked scope, or offline and uncached, that source adds nothing. The panel then says its rows may be missing, instead of implying those products are not profitable.
