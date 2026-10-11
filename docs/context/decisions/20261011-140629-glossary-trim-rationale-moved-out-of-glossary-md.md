# Scope decisions — Glossary trim: rationale moved out of GLOSSARY.md

_Recorded 2026-10-11._

GLOSSARY.md entries were cut to plain definitions. The scope decisions and rationale they carried are preserved below, grouped by original term. The full prior text is in git history (`git show b45537f62:CONTEXT.md`).

## Dropped from the first third of the glossary

- **Account**: Groupings are device-local by decision, not omission. Account-scoped sync is explicitly rejected (not merely unchosen) because EVE SSO has no account id (`sub` is per-Character; `owner` hash changes on transfer), so an account cannot be verified. Recorded in parity plan section 5.7.
- **Alert**: Grouped by type because a device back from a week away holds hundreds of fires across a dozen-odd types; type is the unit a reader mutes, dismisses or acts on.
- **Appraisal**: "Compare hubs" shares no state or code path with the Compare drawer and never touches the Compare Set.
- **Assignment**: Snapshot is pilot-editable at assignment time, not just prefilled. Outstanding Assignment (combined or not) absorbs ESI growth immediately (re-snapshotted, re-priced); Paid or dismissed flips to `needs-review` with before/after diff and can be split from there. Dismissed Assignments still re-diff so growth never stays tax-free forever.
- **Auto Build**: Depth is the plan's/member's full depth, no longer a player setting. Build Group surface asks a generic overwrite confirmation, never a computed preview; single-plan surface applies immediately with no confirmation and no re-run control (fields recompute live). Renamed from "Craft Sweep"/"Sweep Strategy"; the former "Auto Build Depth" control on Build Opportunities was removed as unused. See decisions 20260909-212715 and 20260910-225409.
- **Base Grant**: Plain button asks for everything so nobody who takes it meets a later prompt; users wanting less use "Log in with custom permissions".
- **Core Grant**: Rationale: omission makes training time, industry time, fees silently wrong.
- **Bigger chain**: Its what-if (planet types not run, added: one at a time on Plan, ticked set on the Map) is decisions 20261006-162120 and 20261006-210121; see also 20261006-154532. Laid out on existing colonies or new planets in free slots.
- **Blueprint Acquisition**: Overridable like any material; tiers never mix within one node; reseeds the node's me/te to the chosen tier; reaction formulas cannot be copied. See decision 20260911-073307.
- **Booster**: Overlaps rejected in editor and clamped on read; no Starts field for queued ones; stored on the Skill Plan and synced with it.
- **BPC Sourcing**: Backed by a scheduled backend job crawling EVE Ref's public-contracts dataset (ESI has no public-contract search), republished every 30 minutes; the snapshot carries every item type and BPC Sourcing narrows in the browser rather than the crawl narrowing (ADR 0013).
- **BPO**: Blueprint Acquisition falls back to BPO sell price when no BPC Sourcing offer is listed.
- **Build Group**: Membership lives only on the plan (`buildGroupId`); group name, order and existence live in the `sync.industryBuildGroups` setting, so an emptied group survives and no merge can give one plan to two groups. Deleting a group deletes its member plans (20260923 decision). A dangling `buildGroupId` renders as an ordinary ungrouped plan. The Industry list UI says "group" since no collision there.
- **Build Location**: Plan remembers which place was picked so the box can name it after reload; setting it updates the **Remembered Location** new plans start at; any edit that moves the job elsewhere drops the name.
- **Build Plan**: Invention and research/copying out of scope (`.out-of-scope/`).
- **Calendar Map**: Hatch reflects "incapable of holding anything", not the date: a past day that holds a retained event (ESI drops events at end of day or six hours after start, whichever is later) draws as an ordinary day. Two densities: month or fortnight around today.
- **Certificate**: Only the nine combat groups are baked; industry, science and trade certificates excluded.
- **Certified Plan**: Baked from CCP's JSONL export since Fuzzwork CSVs lack it; milestones become Plan Milestones; fully trained plans hidden from the picker.
- **Character Modifiers**: Industry uses effective levels (min of trained and active); market/refining/mining use queue-corrected trained levels.
- **Character Not Training**: Omega/Alpha deliberately excluded from ESI exposure so characters can't be correlated to one account.
- **Coming Up Rail**: No forward horizon, because a cap would make map cells past it look empty for a reason unrelated to pilot data. Map, ticker and rail read the same board so a day cannot show a dot the rail declines to list.
- **Combined Entry**: UI vocabulary: "Combine" (never "Join"), "Take out of combined", "Continue the <date> session" one-tap offer. See decision 20261004-135551.
- **Compare**: Prices view uses the same Location Mode as the order book (Trade Hub's region when All regions).
- **Completion Risk**: App cannot read a structure's access list and will not probe one; nullsec end is never hidden by the control that removes the other two.
- **Contract Search**: Never merges in the Character's or corp's own assets (unlike BPC Sourcing); one corpus per tab so a merged table would not leave half its columns blank.
- **Corp Role**: ESI GET /characters/{id}/roles source.
- **Current System**: Pick clears when ESI reports a different system than when picked; fresh location wins.
- **Daily Range**: A mislisted order that was taken legitimately puts an outlier in the band; it is a fact about the day.
- **Craft Scope**: Reactions' path to selectable is decided (Include Reactions / Reaction Location). Decision 20260909-212715.
- **CSPA**: Decision (mail reply/forward): app does not read/pay CSPA; send omitting approved_cost against a charging recipient is rejected.
- **Damage Profile**: Reactive Armor Hardener adapts resists, shown labelled as adapted.
- **Dark**: Options 14/30/60/90 days, default 30; one value threaded from the view boundary so table tone, rail count and roster filter never disagree.
- **Data Owner**: Industry dropped its switch 2026-09-12, Wallet 2026-09-29.
- **Effective Skill Level**: The account-wide skill-gate marker on Build Plan/Opportunities rows deliberately stays on raw active_skill_level. See decision 20260922-193557.
- **Endpoint Space**: Classified from local SDE entry naming the system; unplaceable ends excluded by a narrowed band filter.
- **Error Budget**: One page's fan-out of forbidden structures can throttle every other Character's mail/contracts/jobs; client spaces requests, and opens a circuit on 420/429 so callers fail fast into cache.
- **EVE Notification**: ESI type enum is open-ended (254 values, CCP adds without notice), so deliberately not one NotificationEventId per type.
- **Fit Import**: ME2/TE4 default rationale: most of a T2 fit needs an invented BPC (without decryptor), so ME0 would overstate cost and understate job time. Counts both line-per-copy and `xN` suffix.
- **Fitting**: Implants decision 20261004-135042 (set the Fitting carries wins; dropping it reverts to the clone).
- **Fitting Compare**: Route moved from /fittings/compare to /ships/fittings/compare (old redirects); UI says only "Compare"/"Compare Fittings"/"Compare with…".
- **Foreground Poller**: 5-minute interval; paused when hidden with catch-up on visibility; Periodic Background Sync retired.
- **Gank Chokepoint**: Uedama and Balle show as ordinary 0.5 systems; the marker is on the row, route-through only named in haul detail.
- **Going Rate**: 8x threshold chosen to clear ordinary small-parcel work (~3.6x) while catching cheapest documented bait (~20x).
- **Group Owned Overlay**: Decision 20260909-212724 (replaces per-plan owned stock).
- **Group Rollup**: Each member's tree re-resolved with owned-stock deduction disabled before merging; Production Runs carry no group. Nothing is re-homed to tidy a group; hub is the member plan's own fact.
- **Growth Collector**: Chosen in the Split dialog; per ore type residual = entry quantity minus covering quantities.
- **Global Market Region**: 267 PLEX orders at Jita 4-4 (trivia).

## Haul between planets

- Frequent hauls are never assumed; off by default. Decision 20261006-154532.

## High-Tech Production Plant

- The Advisor will not offer one to a pilot whose colonies make no P2: nothing to put in it unless P2s are bought at a hub and hauled in.

## Implant Finder

- Decisions: 20261002-194757-implant-finder-finds-implants-by-trying-them-on; 20261002-231614-implant-finder-prices-lp-store-offers-and-searches (sources: Trade Hub sell orders, LP Store offers checked against pilot's LP and turn-ins; also shows cheapest ways back under CPU/powergrid when over).

## In-game Fitting

- The game has no edit, so saving a changed Fitting back replaces the In-game Fitting with a new one.
- ESI does not expose corporation fittings.

## Include Reactions

- Off means none of Reaction Location's fields exist on screen at all (not merely inert). On: reaction materials become selectable in Craft Scope and hand-toggleable like manufacturing ones. A reaction-activity plan reuses its own location for nested reaction sub-builds. Decision 20260910-082559-reaction-location-a-second-facility-context-lets-craft.

## Industry Activity

- Never a field on the plan record; tagged from SDE activity (ID 1 vs 11) at build time. Determines which Facility Presets and reactor/engineering rig security multipliers apply.

## Install Prompt

- Layered on the browser's passive PWA affordance; no snooze or re-ask. Later path: Settings > Data & storage > Install this app (ignores the "seen" flag).

## Item Actions

- Show info is URL-backed so an item name anywhere can open it without a page-owned host.

## ISK/jump

- Rationale: a hauler's cost is the trip, and the trip is jumps; volume is a gate ("does it fit my hull"), not a rate, hence a filter rather than the ranking figure.

## ISK/m³

- Deliberately secondary: answers the narrower question of filling one hold from several contracts along a lane, where space rather than distance is scarce. A stated 0 volume survives ingestion, hence "none" not infinite.

## ISK/run

- Deliberately NOT the ranking figure: the panel still sorts on price (the "cheapest listed offer" framing). An Offer is a contract row, not a copy, so three ten-run copies is one indivisible 30-run purchase. Unavailable rows show the unavailable marker and sort last.

## Reverse Lane

- Region-to-region pairing is coarse on purpose: with a few hundred contracts for all New Eden, station-level pairing would almost always be empty, so it reads as a prompt to go look, not a matched return trip. Count of zero would wrongly read "nobody is hauling back" where the truth is "we cannot tell".

## Route Safety

- Per-system zKillboard kills grouped by stargate/station (route-leading gates highlighted), tagged when an Interdictor/HIC (nullsec) or smartbomb was on the mail.

## Quiet stretch

- Folding rule thresholds: two or more consecutive middle systems; loading/unavailable figures never fold.

## Hole jump / Ansiblex / Way to fly / Pinned way

- Hole jump costing and applicability: decision 20261003-181618. Ansiblex: decision 20261003-204009 (list found by a character's structure search or pasted).
- Way to fly options: Via Thera/Turnur only when that hub has a qualifying hole; Via Ansiblex only with Use jump bridges on and a known gate on the way.
- Pinned way kept in the link (`pin`, by leg position); a pin that cannot be flown (hole closed, no qualifying hole) is reported on the leg and the planner's pick flies it.

## Pilot Lookup

- "No zKillboard history" and "zKillboard couldn't be reached" are deliberately different answers.
- Local list grouping order: red/orange contacts, killed in the kind of space you are in (Current System's), killed elsewhere, quiet for 30 days, friendly (corp, alliance, blue contacts) last. Rows show kills in high/low/null with recency.

## Threat

- Thresholds: Dangerous = 10+ recent kills and (danger ratio >= 50 or kills >= 60% of kills+losses); Active = 3+ recent kills; Low threat = fewer, or no kills but a ship lost in last 90 days; Inactive = neither. Missing ratios can never reach Dangerous. Local list rows look ratios up only for pilots with enough recent kills for Dangerous, and losses only for pilots with no recent kill. Scope decisions 20261008-181210 and 20261008-222917.

## Avoided Systems

- Synced across devices as ids.

## Route Preference

- Route Safety's own picker is the default itself: choosing there saves it. Other pages (Courier, Thera, Assets) override for that view only.

## Travel Settings

- Security penalty is the game's 0-100 slider, default 50. Avoided Systems switchable without clearing.

## Jump Basis / Jump Range

- Jump Range on Market Browser: a set range replaces the header's Trade Hub or region; the book is fetched from every region holding an in-range system, at every station. Contract Search and BPC Sourcing narrow what was already fetched. Options: 3, 5, 10, 15, 20 jumps.

## Local Draw

- Counted for every factory line whatever its status (a line with an imported input still eats the local one), at the same pin count the line's output is credited at.

## Location Mode

- Only the selected item's order book fans out in All regions; Variations, Compare, Item Detail and price history read the Trade Hub's region.

## Market-Wide Build Opportunities

- Filterable by tier, category, blueprint source, max build cost, sales frequency. A troll sell order is priced at CCP's average traded price. Candidates bounded by Liquidity Floor and a fixed top-N per Market Group, computed against material trees precomputed at SDE-build time rather than live (ME-0 approximation). Each row names its blueprint source.

## LP Value

- Market LP Value = what the store's best offers turn a point into at the Trade Hub being priced, after fees. Pilot override synced as sync.loyaltyLpValue (Blueprint Acquisition modal); 0 means use market. Decision 20261002-222635-lp-value-defaults-to-each-stores-market-rate.

## CONCORD LP Exchange

- Rate 0.8 verified for Empire factions, 0.4 assumed elsewhere; 1,000 LP costs 1,250 CONCORD LP at 0.8.

## Liquidity Floor

- Same sellPrice*sellVolume depth as Order Depth, but a hard cutoff before pricing, not a classification of an already priced row.

## Made Payment

- A Made Payment matching nothing is never shown: this keeps the offer from becoming a nag without an ignore-list. Wallet-journal kind also covers paying a landlord's ISK contract. Item-exchange cargo is deliberately never priced, so the pilot confirms an amount.

## Market Region

- 31 nullsec regions have no NPC station and still carry busy player-structure markets.

## Material Price Basis

- Product always valued at the hub's lowest sell because an Acquisition Verdict asks what buying it outright costs.

## Manual Ore Tag

- Two independent lists. Not Editable Data. Reversibility is deliberate: an uncorrectable correction is worse than the misclassification it fixes.

## Mining Ledger Entry

- This is also ESI's granularity ceiling: no intra-day timestamp or moon identity, so two corps' moons rented in the same system on the same day cannot be told apart; the split-payee Assignment flow is a mitigation, not a fix.

## Multi-Type Contract

- EVE exposes no per-line price, and apportioning would invent a number. BPC Sourcing's price cell marks it; ISK/run and Blueprint Acquisition's cheapest-tier selection treat it as unknowable. Contract Search item mode and both boards' max-price filters are unaffected (a bundle's whole ask is what they ask about).

## Notification Allow-List

- Replaces the earlier open-ended "every type, generic body as the floor" model; out-of-list types are not toggled off, rendered generically, or recorded.

## Notification Family

- A type acquires a Family in the same change that gives it a body.

## Occurrence Key

- Natural ids: queue entry's finish date, job_id, extractor expiry_time, ESI notification_id. Feed row id was random because nothing then needed two observers to agree.

## Optimize Modes

- Details of the default: attribute-grouped, priority-respecting reorder followed by remap placement on the new order, previewed and applied together.

## Order Floor

- Only `relist` is shown as a figure (row and modal quick answer); `fill` surfaces only in the deeper breakdown, since it matters only when deciding to leave an order alone. Null for linked Production Run or Wallet Cost Basis covering every unit; a floor of zero would make every rival look safe to follow.

## Wallet Cost Basis

- One pool per (character, type). When unavailable, says whether wallet was partial or short of history. Excludes the broker fee paid at the buy.

## Often Undercut

- Samples stored by the page itself; a boolean with no count; an OrderBadgeKind so rows already reading worse are unaffected.

## Order Depth

- Typed-threshold-object convention (see Order Problem's ProblemThresholds) introduced here.

## Reprocessing Yield

- Deliberately NOT modelled: structure refining rate, rigs, standings-based station tax (none readable from ESI for an arbitrary location); the base 50% station rate is stated on screen as an assumption. Scrap never gets Reprocessing or Reprocessing Efficiency. A part portion refines to nothing.

## Order Slots

- Shown as the denominator of the Overview's Open orders tile.

## Owned-Stock Offer

- "Use none" is deliberately wider than the offer. Stores: plan sourcing and the Group Owned Overlay. No offer for Blueprint Acquisition rows, no scoped stock, or row already at that number.

## Payee

- Trade Hub lives on the Payee, not the device, because the tax owed is a bill one player sends another; deliberately not the Market Browser's hub preference. entityId is never asked for (Payee is a free-text label) but learned on first confirmed Made Payment; thereafter recipient identity (not amount/date) is the primary match signal.
- Moon/system tag: "pick the moon, the corp, or the person, whichever is memorable".

## Pending Login

- Bounded by TTL (enforced at redeem as well as at prune) and a maximum count.

## Pin Budget

- Arithmetic fit against two independent ceilings; which ceiling binds is the useful half of the answer (Powergrid almost always: Extractor Control Unit and heads are Powergrid-hungry/CPU-cheap, Launchpad the reverse).

## Prereq Promotion

- Prereq rows are recomputed from the entry list on every schedule run, so they have no position of their own to save.

## EVE Workbench fit

- Synced by a Cloud Function because Workbench can't list fits by hull.

## Out-of-date fit

- Also: item not in the game's full type-name list. When every fit for the hull is out of date, the tab says so.

## Seen on zKillboard

- A fit with any line that doesn't load cleanly, or whose hull's losses can't be fetched, shows nothing. Exception: a line written with a count (x1) naming an item the game has but the app can't read (e.g. filament in cargo) can't be a fitted module, so the fit still matches.

## Price History

- Chart layout: range/average/MA above, volume and order count below, shared date axis.

## Priority (Skill Plan)

- Effective priority drives the plan's banded view and the optimizer's "suggest full reorder".

## Permission

- Banner on empty pages offers to log in again and grant it.

## Plan Milestone

- Does not reuse Remap Marker storage: a marker is an entry-list position, a milestone means "when these skills are done, wherever they end up". Plan header shows only the soonest still-projected milestone; an orphaned one has no date so never counts as "next". Orphaned (usually entry removed; also lowered target or catalog-unknown skill) is shown with a remove action, not dropped silently. Fit goal anchor is the latest step the Fitting's hull, modules, charges, drones and fighters need, kept current.

## Plan Setup

- Default visibility changed only (2026-09-06 verdict-first decision).

## Production Log

- Lives on /industry's Records tab (peer of Build Plans, not a separate route). Per-run table names no Build Plan since a run outlives its plan; clicking a row jumps to the plan only if it still exists. Same "Sold" split button as per-plan panel (Link Past Sale / Watch Open Order / Manual Sale, Delete production run); that is Records' only delete since rows navigate. From/To date-range filter.

## Dropped from the last third of the glossary

- **Production Run**: Deleting the Build Plan a run was logged under does not delete the run (the accounting record must outlive the plan, so a blueprint price drift or ME/TE change can never retroactively change booked profit). Deliberately correct-by-construction, not reconstructed from ESI wallet history (automated FIFO matching was rejected; see decisions folder). Each linked sale / watched order is its own synced record, never a field on the run, so two devices linking different sales to one run never collide.
- **Run Loss**: Reached from the Sold... menu's "Mark as lost...". Insurance payout is either a wallet-journal payout or typed ISK.
- **Projection**: Per device: an upload replaces only that device's rows, and each row is pushed only to that device.
- **Projection Horizon**: A device not opened inside the 72h window stops receiving Scheduled Pushes until it is: the accepted consequence of holding no tokens server-side.
- **Public Contract Offers snapshot**: Generalized past blueprint copies, which let the blueprint-only publicBpcContracts collection and sync be retired. BPC Sourcing and Contract Search read and cache it separately rather than sharing one full-size entry.
- **Public Courier Contracts snapshot**: Own collection only because courier contracts have no item lines. A row is published only when the archive states origin, destination, reward and volume: a blank CSV column converts to 0, which would publish a delivery to station 0 or a free haul indistinguishable from a stated one. A stated 0 is kept (a favour run can pay nothing). The guard is against schema change, so the sync logs outstanding vs kept courier counts. Courier mode names ends from local stations/systems snapshots, not ESI, so player structures stay unnamed ids rather than costing a request per haul.
- **Pull Cursor**: Also records when the collection was last read unfiltered; falls back to an unfiltered read once that is older than the tombstone TTL. Never advances past the newest document in the response.
- **Quick win**: Quick wins are listed before any rebuild on the PI Plan tab and a rebuild's gain is quoted on top of them (ADR 0012's split between tuning today's extraction and re-planning it). A colony's spare room is spent by one kind of Quick win. Ranked by ISK/day per minute of in-game work.
- **Sell market**: Customs is paid at the colony's own office either way; corp buyback has no sales tax and no route to market (collected at home).
- **Quickbar**: Replaced the pin-to-compare grid; comparing lives in the Compare drawer over the separate Compare Set.
- **Ratio Block**: One P1 factory's 40/hr is exactly what one P2 factory eats. Fixed overhead = mandatory Launchpad, plus a Storage Facility if the layout buffers through one.
- **Reaction Location**: Decision 20260910-082559 (a second facility context lets craft...). The Remembered Location for reactions also seeds the primary Build Location of a plan whose own Industry Activity is `reaction`, which has no Reaction Location field because the engine reuses that plan's facility for a nested reaction: one refinery, one answer, two places it lands.
- **Remaps Available**: Always planned with in full, no user override; a plan without readable ESI attributes falls back to a stored per-plan count. Yearly remap counted even on cooldown, usable only from its cooldown date. Optimizer must support the common single-remap case (train a leading segment on current attributes, then remap at the optimizer-chosen point).
- **Remembered Location**: Manufacturing plan's location is remembered for manufacturing; a reaction-activity plan's location or a manufacturing plan's Reaction Location is remembered for reactions. Only plan-page edits that move a location update it; plans written elsewhere (Opportunities, Fit Import, group Retarget, sync) never do. Not copied from the most recently updated plan (which still supplies hub and price basis). Decision 20261001-114015-new-plans-start-at-the-last-location-set.
- **Requested Scopes**: The refresh path has none and judges revocation against the stored grant instead.
- **Reset Run**: The Triage Board groups a Reset Run's colonies into one row rather than one per colony.
- **Scheduled Push**: Only events carrying a future timestamp in their own ESI data can be delivered this way.
- **Seeded Build Plan**: A contract line or search row seeds only when all three of ME, TE and runs are reported for it (optional in both, unlike an Offer, which always carries them).
- **Survey**: Standard 7-day Share Link life from creation; anyone with the link can add a scan, so a Survey carries on after its starting pilot leaves. Same-field rule: a scan is an update only if it only shrinks the field (each ore as of the newest scan that had it; no new ore, none with more m3), even if an ore dropped out of the latest scan. Shown on Mining > Survey tab and the link's public page.
- **Survey name**: Decision 20261010-203712-survey-a-surveys-name-is-the-pilots-own.
- **Survey info template**: Decision 20261011-124133-survey-info-templates. Also used to start a Survey from the empty page.
- **Cleared marker**: Who may press it: decision 20261009-233623-survey-the-field-is-marked-cleared-by-a.
- **Survey Scan**: A scanner group left collapsed pastes without its ore, so a pilot's first scan lacking an ore the Survey's latest scan showed must be confirmed ("All are expanded") before it is added. Pasting Character name shown in chart tooltip as "Scanned by".
- **Share Link**: Opening does not extend the expiry. A Fitting's link opened with nobody logged in shows the Fitting at every skill level V; a logged-in visitor goes straight to the editor.
- **Shared Appraisal / Shared D-Scan**: "Open Neocom Desk" carries the content into the live view for a visitor with a Character; one with none gets "Log in" with a "Choose permissions" link. D-Scan text is capped in size; rebuilt with the same parsing and role mapping as Pilot Lookup's live view.
- **Ships**: Was "Fittings" until the tree joined it; every old /fittings path redirects.
- **Shorthand ISK**: One-fraction-digit rounding is safe precisely because the display is cosmetic only; exact value is in the accessible name. A decisions-folder rule governs the rollout.
- **Clone Jump Ready**: Level 0 when skills can't be read, so it errs late, never early.
- **Courier Delivery Due**: Uses the deliver-by deadline, never date_expired; a deadline already past fires nothing. Default lead 6h.
- **Incursion Nearby**: Default 5 jumps; a changed Current System or N re-baselines silently rather than firing for Incursions already near.
- **Skill Queue Ending**: Default lead 24h, matching the roster's endingSoon window. ESI has no endpoint that writes the queue, hence a warning. Decision 20260923-230312-skill-queue-ending-notification explains why no separate "Skill Plan step completed" event exists alongside it.
- **Stale-Serve**: Signalled for a Published Snapshot so a mounted view re-reads fresher rows; silent for a game constant, whose refresh lands for the next read without re-rendering.
- **Standing (corp)**: Degrades per figure on Corp Capability, so a Character holding one source sees fewer figures rather than empty ones.
- **Starred Character**: Device-local for the same reason an Account grouping is: a star is a statement about the roster, not one Character, so no Character's sync scope owns it. Floats within the group section the Character is already in, layering on top of the chosen sort key. User-created content, not view state: nothing clears a star but the user, except when its Character has left the device.
- **Stock List**: Shown on Market > Stock.
- **Stock Target**: Inside the Stock tab a column header or field label may say "Target".
- **Shortfall**: Only the "to buy or build" part is priced (hub lowest sell) and sized into Build Plan runs by the Builder view.
- **Stopped**: The wording is used everywhere the "program has ended" condition shows (Overview PI card, Colonies attention chip and row state, Characters table PI column); one word per condition, not shared with Idle (the retired Advisor's idle chip).
- **Sustained Extraction Rate**: Is the number chainCost and pinBudget take as extraction rate. CCP's worked example averages ~5,580/hr vs the 13,930/hr qty_per_cycle alone implies.
- **Synced Collection**: firestore.rules and firestore.indexes.json are NOT derived from the declaration; they stay hand-written, with a test that fails until they cover a new collection.
- **System Label**: CCP does the routing (e.g. "is this corp mail"); the app doesn't reimplement it. Custom Label filtering was deferred in round 18, surfaced as a chip row in round 22, then removed again (decisions 2026-09-05); app does not filter on it. System Labels as a multi-select toggle group (decision 2026-09-07).
- **Net Worth Snapshot**: Written once a day by the Tab Leader.
- **Tab Leader**: Each job elects its own leader. Leadership is a Web Lock requested on becoming visible and released on becoming hidden; where the browser lacks Web Locks every tab is its own leader. Cache prefetch is not elected; it warms the tab it runs in.
- **Throughput**: Storage-overflow-driven rather than CPU optimisation is what drove EVE University's worked "one extractor feeds three Basic Facilities" ratio.
- **Triage Board**: Organising rule: numbers where items are interchangeable, rows only where each item is genuinely its own thing. Shares the Corp Ops Board's severity ladder but not its layout.
- **Hauling Opportunities**: Moved from Market (/market/hauling redirects to /travel/hauling). Scope: decisions folder, "Hauling Opportunities v1 scope".
- **Selling into buy orders**: Sized to the depth both books stay profitable to.
- **Expected Sell Price**: Deliberately never the cheapest listing that every other user of a price-gap tool sees too.
- **Cargo Space**: A Deep Space Transport carries most of its load in the fleet hangar, hence cargo hold + fleet hangar as the general hold. Without Cargo Space a Trip Plan stops only at sales and profitable supply.
- **Specialised Hold**: Which holds count and what each accepts: decision 20261004-101406-cargo-space-counts-specialised-holds-whose-contents-fit.
- **Training Progress**: ESI's /skills skillpoints_in_skill is frozen near where training began, while /skillqueue (training_start_sp, level_end_sp, training window) is enough to interpolate the true figure.
- **Undercut Scope**: Scopes are nested, so one severity per row. A scope absent from byScope was never checked; null means checked and clean (collapsing them would make loading indistinguishable from clean). Station comes from batched aggregate prices each refresh; system and region from one on-demand region order book per item.
- **Use-or-Sell Check**: Only exists when something is owned; no verdict at all when an owned material has no price on that side.
- **Verdict Hero**: Owns the Calculation Breakdown; the "Costs & revenue" ledger beside the materials holds the working.
- **Liquidation Basis**: `order` has a 100 ISK minimum broker fee per stack.
- **Variations**: Sortable table beside Order Book and Price History with Name, Tier, Sell, Buy and a signed "vs item" sell delta.
- **What We Store**: Registry is REMOTE_COLLECTIONS; each declaration names the line that mentions it, so a newly synced collection fails the suite until the copy covers it. A section a reader can catch overclaiming is worth less than none. Deep link /settings#faq.
- **What-If Implants**: Per-attribute (not matched-set-only) design added in round 28; stored on the Skill Plan and synced in round 33.

### Charge Picker

- **Fighting at** turns every figure into what lands at one target distance. Quick picks: most damage, longest reach, best value (cheapest per minute within 10% of the most damage). Surfaces: the Add panel's Charges tab and the "Change charge" menu (Ring tile, List row, Offense row). Charges group by type or faction, or plot range against damage.
- Cap boosters rate charges by capacitor (stable level or time to empty, GJ/s over reloads, boosts per load, ISK per GJ). Mining lasers explain crystals Type A/B/C per ore family instead of ranking them.
