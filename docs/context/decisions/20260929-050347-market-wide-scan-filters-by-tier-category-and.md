# Scope decisions — Market-wide scan filters by tier, category and blueprint source

_Recorded 2026-09-29._

- **"What's profitable to build" sits above Build Opportunities.** It answers the question most visits to the Opportunities tab come with; the owned-blueprint ranking narrows it to what the account already holds.

- **Tier, category and blueprint source filter before the top-N-per-Market-Group cut, so changing one re-runs the scan.** Hiding rows after the cut would leave a Market Group short: a faction product with deeper sell orders would take the slot a Tech I one would have filled. Product prices are cached from the first scan, so the re-run is cheap.

- **Max build cost filters the ranked rows, without a re-scan.** Build cost is only known once materials are priced, which happens after the cut. The presets (10M, 100M, 1B, 10B) are a budget cap, not a range.

- **Tier comes from the product's meta group (`market/variations.json`).** Structure Tech I, Tech II and Faction fold into Tech I, Tech II and Faction. Storyline, Officer, Deadspace, Abyssal, Premium, Limited Time and any meta group CCP adds later are one "Officer & special" tier: their blueprints come from drops, events or LP, never a steady supply. A product with no meta group is Tech I.

- **Category comes from the product's root Market Group (`market/groups.json`).** Structure Equipment and Structure Modifications count as Structures; roots with a handful of buildable products (Trade Goods, Special Edition Assets, Planetary Infrastructure, SKINs) are "Other".

- **Every filter starts all-on, and lives in the URL.** A filtered scan is a link a pilot can share or come back to; nothing is hidden until the pilot asks.
