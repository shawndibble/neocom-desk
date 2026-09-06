# NeoCom Desk — Ubiquitous Language

## Glossary

The project's shared vocabulary. Use these terms exactly.

Sorted by term, and kept that way deliberately: a new term inserted in
alphabetical position lands mid-file, so two agents adding terms at once do not
collide the way appending to the end always did. Scope decisions do not belong
here — they go one per file in `docs/context/decisions/`.

- **Account**: UI-level grouping of a user's Characters. Has **no storage, no sync and no server-side identity** — EVE SSO exposes no account identifier (`sub` is per-Character; `owner` is the owner hash and changes on transfer), so one cannot be verified. Groupings are device-local by decision, not by omission — see the parity plan §5.7, which also records why account-scoped sync is rejected rather than merely unchosen. Never surfaced to the user as a thing to manage.
- **Acquisition Verdict**: Whether a Build Plan's product costs less to build
  than to buy outright at the trade hub. A personal-use comparison — no
  sales tax or broker fee applies, because nothing is being sold.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend.
- **Assignment**: Links a Mining Ledger Entry (or a split slice of its ore —
  whole lines or part of a line's quantity, for the two-corps-one-system-
  one-day case, see Growth Collector) to a Payee, snapshotting
  the tax % and ISK value at assignment time — pilot-editable at that moment,
  not just prefilled, and invoice semantics thereafter: neither a later Jita
  price move nor an edited Payee default retroactively changes what it shows
  as owed. Re-diffed on every ledger refresh: if ESI reports _more_ ore for
  the same entry afterward, it flips to `needs-review` with an explicit
  before/after diff rather than silently absorbing the growth. A `dismissed`
  Assignment ("I don't pay tax on this entry") carries no Payee at all, but
  still re-diffs the same way — growth on it still surfaces rather than
  staying tax-free forever (issue #523).
- **Base Grant**: What every Character is asked for at sign-in — `SCOPES`, and
  nothing from any Scope Group.
- **Base sheet** — the character's attributes as base + remap alone: five
  values, each 17..27, totalling exactly 99. The only thing a remap can
  change, the space the optimizer searches, and the input `computeSchedule`
  and `placeRemaps` expect. Distinct from the _effective_ values ESI reports,
  which fold in implants and any cerebral accelerator on top.
- **Booster**: Cerebral accelerator; user toggles it on manually with an expiry date for training-time math. Stored on the Skill Plan and synced with it, like What-If Implants above (round 33).
- **Build Location**: The search at the head of a Build Plan's Location & market group, over the stations and structures the Character can dock at. Picking one fills facility, **Build System** and security band in a single edit, and the plan remembers which place it was so the box can still name it after a reload. That name is a label only — every number reads the plan's own values, and any edit that moves the job elsewhere drops it. "Override" unfolds the fields behind the box.
- **Build Plan**: An industry plan for one blueprint or reaction formula: materials needed, costs, fees/taxes, time, and two independent verdicts — an **Acquisition Verdict** and a **Sale Profitability** read (see round 15). Covers manufacturing and reactions (issue #460); invention and research/copying are still out of scope (`.out-of-scope/`). Which activity a plan runs is derived from the picked blueprint/formula's own `activity`, never a separate field on the record.
- **Build System**: The solar system a Build Plan's job runs in, named on the plan. Sets the **Cost Index** the job fee is charged at _and_ the security band the rig bonus reads — both follow from the system, so neither is a separate field. Materials are still priced at the plan's trade hub. Empty means "the hub's own system", which is how every plan behaved before the field existed.
- **Calculation Breakdown**: The modal behind a Build Plan's results that
  restates every figure on screen as a rule plus that rule with the plan's own
  live values substituted in — price bases, Material cost, Job Fee, revenue,
  fees, profit, break-even, and why an **Acquisition Verdict** and a **Sale
  Profitability** read differ off one hub price. The deep layer under the
  per-row tooltips, which stay one-liners.
- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Character Not Training**: Fires when a Character's skill queue shows no
  active training (the head entry has no live `finish_date`) — whether from
  an empty queue or a stalled/alpha-incapable queue head. ESI exposes no
  Omega/Alpha or subscription field at all (confirmed on CCP's own forums —
  deliberately excluded so characters can't be correlated to one account), so
  the _cause_ can never be distinguished; only this one unified symptom is
  detectable. Distinct from **Skill Level Complete**, which fires per
  finished queue entry while training continues.
- **Compare**: A tab that puts the Quickbar's items side by side on best sell,
  best buy, spread and volume, under the same **Location Mode** as the order
  book beside it.
- **Compare Set**: The short-lived selection of items being priced against each
  other right now — usually variants of one thing. Distinct from the
  **Quickbar**, which is the durable list of items the user returns to across
  sessions. Different lifetimes, so two lists, not one.
- **Corp Access**: The single resolved state `useCorpAccess()` returns for the
  active Character, composing Corp Capability with granted scopes: `unknown`
  (not resolved yet), `none` (no Corp Role), `roles-without-grant` (holds a
  role, corp scopes not granted), `ready` (holds a role and its scopes).
- **Corp Capability**: What a Character can actually _see_ — `canReadWallet`,
  `canReadStructures`, `canReadMembers`, `canReadIndustry` — derived from their
  Corp Roles in `engine/corpRoles.ts`. The unit every consumer branches on; no
  consumer compares role strings itself.
- **Corp Role**: An in-game corporation role (`Director`, `Accountant`,
  `Junior_Accountant`, `Station_Manager`, `Factory_Manager`, ...) held by a
  Character, read from `GET /characters/{character_id}/roles`. A second,
  invisible access axis alongside granted scopes: CCP role-gates the
  corporation endpoints server-side, so a Character can grant a corp scope and
  still take a permanent 403. `Director` implicitly holds every other role in
  game, and ESI does **not** expand that in the response.
- **Cost Index**: A solar system's current manufacturing activity level
  (read live from ESI). Higher activity in a system drives its Job Fee up;
  distinct from EIV, which prices the materials rather than the system.
- **Dark**: A member with no login for `DARK_AFTER_DAYS` (30) or more.
  `engine/corp/members.ts` owns the threshold as a named constant; nothing in
  the UI may hold a second opinion about what dark means. A member who joined
  and has never logged in is counted from the day they joined, not excluded.
- **Data Age**: Timestamp shown on every API-derived view; how old the cached data is. Refresh happens on app open + manual button only.
- **Data Owner**: Whose rows a page's table is showing — `personal` or
  `corporation`. Selected per page by the Personal / Corporation switch,
  device-local, never synced, and reset to Personal on a Character switch.
  `features/corp/owner.ts` owns the term and the rule; a page asks it for
  `available` rather than composing Corp Access, a Corp Capability and a
  corporation id itself.
- **Detected Accelerator** — a cerebral accelerator inferred from a base sheet
  that is over budget, by the size of the excess. Prefilled into the Booster
  control; not a separate mechanism.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, Production Runs, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **EIV (Estimated Item Value)**: The SCC's reference price for the materials
  a manufacturing job consumes, at ME0 quantities. Used only to size the
  **Job Fee** — it is not what the materials actually cost to buy.
- **EVE Notification**: The single Notification Event (`eveNotification`,
  issue #274) covering everything `GET /characters/{character_id}/notifications/`
  pushes — a different, non-overlapping source from every other Notification
  Event listed in round 20, which are all synthesized by diffing other ESI
  endpoints. ESI's own `type` enum underneath it is open-ended (254 values;
  CCP adds more without notice — see esi/esi-issues#1380), so it is
  deliberately **not** modeled as one `NotificationEventId` per type. Instead
  the single event is fetched/toggled like every other, and each raw `type`
  string gets its own independent opt-out underneath, discovered as it fires
  rather than enumerated from a closed list.
- **Facility Preset**: Industry location model: NPC station or player structure type + rig level. Manufacturing structures (Raitaru/Azbel/Sotiyo, engineering complexes) and reaction structures (Athanor/Tatara, refineries — no NPC-station equivalent) each use their own **Industry Activity**'s rig bonuses and security-multiplier table (issue #460); the two never mix on one facility. Drives ME/time/cost bonuses in a Build Plan.
- **Foreground Poller**: Client-side interval (5 minutes) that checks each
  enabled Notification Event's underlying ESI data while the app is open and
  the tab/window is visible; paused via the Page Visibility API when
  backgrounded, with an immediate catch-up check on regaining visibility. It
  is the fast path for an open app, not the sole guarantee of delivery —
  Periodic Background Sync, once its best-effort supplement, is retired
  (round 45); Scheduled Push (round 45) now covers timestamped events for a
  closed or backgrounded app. The two can independently observe the same
  occurrence, so the poller suppresses its own browser notification for one
  the Notification Feed already shows as delivered (Occurrence Key, round
  44/#360).
- **Freshness Window** (round 25): how long a cached row is served without asking ESI again. Ten minutes for a Character's own data, a day for game constants. Distinct from **Data Age**, which reports how old the shown data is; the window decides whether to go and get newer.
- **Growth Collector**: On a Mining Ledger Entry covered by two or more
  Assignments (a quantity split, issue #523), the one Assignment that
  receives any ore ESI reports for that day _after_ the split — flagged
  `collectsGrowth` on the record, chosen in the Split dialog. A sole
  Assignment always collects. Per ore type the residual is the entry's
  quantity minus every covering quantity; the collector owns it (flipping to
  `needs-review` as usual), so nothing on a split day is ever silently
  unassigned or doubly claimed (`engine/miningTax/ownership.ts`).
- **Global Market Region**: A region that exists only to hold one item's
  cluster-wide market. PLEX is the only one today: its orders live in a region
  of their own, none of them in the normal regional books, yet each order still
  points at an ordinary station — 267 of them at Jita 4-4. So a global market is
  a routing quirk, not a separate kind of place.
- **Gross Profit** / **Net Profit**: Sale Profitability before vs after sales
  tax and broker fee are subtracted. **Break-even Price** — the sell price
  at which profit is exactly zero — is always a Net figure, since it answers
  "at what price do I stop losing ISK," which only holds net of the fees an
  actual sale pays.
- **Industry Activity**: Which job a **Build Plan** runs — `'manufacturing'` or `'reaction'` (issue #460). Never a field on `BuildPlanRecord`; always derived from the picked blueprint/reaction formula's own `activity`, tagged onto it from the SDE (`industryActivity.csv`'s activity ID 1 vs 11) at build time. Determines which **Facility Preset**s and reactor/engineering rig security multipliers apply — a facility hosts one activity, never both.
- **Install Prompt**: A one-time, in-app call-to-action to install NeoCom
  Desk as a home-screen/desktop app, layered on top of the browser's own
  passive PWA affordance (already present via `vite-plugin-pwa`). Platform-
  appropriate: captures the native `beforeinstallprompt` event on Chrome/Edge
  desktop and Chrome Android; on iOS Safari, where `beforeinstallprompt`
  never fires, it's a static "tap Share → Add to Home Screen" instructional
  banner instead. Shown once ever per device — accepting or dismissing either
  one permanently suppresses it, no snooze or re-ask.
- **Item Detail**: The modal view of one item's own properties — fitting cost,
  volume, bonuses, description. Read live from ESI per item, not from the SDE
  snapshot, so it is the one Market Browser panel that needs the network.
- **Job Fee**: The ISK ESI charges to install a manufacturing job, separate
  from material cost. Sized from EIV, the system's **Cost Index**, a fixed
  SCC surcharge, and the facility's tax.
- **Location Mode**: The Market Browser's one location control, in one of two
  mutually exclusive modes — **Region** (every station in that region) or
  **Trade Hub** (that hub's region, filtered to the hub's station).
- **Market Browser**: General item price lookup page (any item, prices at chosen Trade Hub). Separate from a character's own **Market Orders** (open + history).
- **Market Group**: A node in EVE's own market browse tree (`invMarketGroups`:
  `Ships → Frigates → Standard Frigates`). Distinct from an item's **Group**
  (`invGroups`, a taxonomy that is not the market's). Only Market Groups with
  `hasTypes` hold items; the rest are branches.
- **Market Order Filled**: Fires when any of a Character's market orders
  completes — a sell order being bought out, or a buy order being delivered.
  Both directions count as one event type, not two.
- **Made Payment**: ISK (or ore) the pilot has already sent, gathered so the
  Moon Mining Tax ledger can run its settle-up backwards — "I already paid
  this; what did it cover?" (issue #540). Two sources only: an outgoing
  wallet-journal entry of a hand-sent kind (which already covers paying a
  landlord's ISK contract), and an `item_exchange` contract the pilot **issued**
  at no price — payment in kind, whose cargo is deliberately never priced, so
  it carries no amount and the pilot confirms one. A Made Payment is offered
  only when it has a plausible target (recipient identity, or an amount that
  agrees, inside the date window); one that matches nothing is never shown, which
  is what keeps the offer from becoming a nag without an ignore-list.
- **Market Region**: A region that can actually hold orders. Not every region
  qualifies — wormhole, Abyssal and the unreachable dev regions never do — and
  the test is not whether the region has an NPC station: 31 nullsec regions have
  none and still carry busy player-structure markets.
- **Material Price Basis**: Which side of a Build Plan's **Trade Hub** order
  book its materials are costed at — sell orders (what they cost to buy right
  now) or buy orders (what they cost if you place orders and wait). Stored per
  plan; absent reads as sell. Materials only: the product is always valued at
  the hub's lowest sell, because an **Acquisition Verdict** asks what buying it
  outright costs. A material the chosen side cannot price is unpriceable, never
  quietly re-quoted at the other side.
- **Mining Ledger Entry**: One row of the Moon Mining Tax ledger, derived (not
  stored) from ESI's personal mining ledger: every moon-goo row for one
  (character, EVE/UTC date, solar system), summed per ore type. This is also
  ESI's own granularity ceiling — no intra-day timestamp and no moon identity
  survive to the app, so two different corps' moons rented in the same system
  on the same day cannot be told apart; the split-payee Assignment flow is the
  mitigation, not a fix (issue #523).
- **Notification Allow-List**: The closed set of EVE Notification `type`
  strings the app delivers. A type outside it is dropped at the poller — not
  toggled off, not rendered generically, not recorded. Replaces round 34's
  open-ended "every type, generic body as the floor" model.
- **Notification Event**: One of a fixed catalog of character-state changes a
  user can be notified about — Skill Level Complete, Character Not Training,
  Industry Job Complete, New Mail, Planetary Extraction Done, Market Order
  Filled, New Calendar Event, Calendar Event Starting, Contract Accepted,
  Wallet Balance Changed. Each is independently toggleable per Character.
- **Notification Family**: A presentation grouping over the Notification
  Allow-List — Structures, War, Corp Governance, Bills, Moon Mining, PI. A
  Family is how Settings arranges the list and nothing more: it carries no
  defaults, gates no delivery, and a type acquires one in the same change that
  gives it a body.
- **Occurrence Key**: The deterministic identity of one notification
  occurrence, derived from the Character, the Notification Event and the
  natural id of the thing that happened (the queue entry's finish date, the
  `job_id`, the extractor's `expiry_time`, ESI's own `notification_id`). Two
  devices and the backend independently observing the same occurrence all
  compute the same key, which is what makes de-duplication possible across
  parties that cannot see each other's state. Distinct from the Notification
  Feed's row id, which round 20 minted randomly because nothing then needed
  two observers to agree.
- **Optimize Modes**: Skill Plan optimizer actions — "optimize now" (optimizer chooses remap placement, keeps order), "optimize at remap points" (user drags **Remap Markers** into the plan; optimizer computes the best attribute spread for each marker-delimited segment), "suggest full reorder" (attribute-grouped reorder honoring prerequisites; user accepts or rejects). Reorder never applies silently.
- **Order Book**: The live buy and sell orders for one item in one Region, read
  from ESI. Rows, not a summary — each row is one order with its price,
  quantity, location, range and expiry. Replaces the single best bid/ask that a
  **Price Aggregate** gives.
- **Order Slots**: How many market orders a character may keep open at once —
  a base 5, plus 4 per level of Trade, 8 per Retail, 16 per Wholesale and 32
  per Tycoon, so 305 with all four at V. ESI reports the open orders but never
  this ceiling, so it is derived from trained skills
  (`src/engine/market/orderSlots.ts`) and shown as the denominator of the
  Overview's Open orders tile.
- **Payee**: Who the Moon Mining Tax ledger owes — user-managed `{name,
default tax %, optional moon/system tag}`. The moon/system tag lets the UI
  auto-suggest (and pre-fill) the Payee and rate for a future Mining Ledger
  Entry from that system: "pick the moon, the corp, or the person, whichever
  is memorable" (issue #523). Optionally also carries `entityId`, the EVE
  character or corporation the ISK actually goes to — never asked for, since a
  Payee is a free-text label, but **learned** the first time a Made Payment to
  that recipient is confirmed as settling this Payee's entries, after which
  recipient identity (not amount or date) is the primary match signal
  (issue #540).
- **Pin Budget**: The CPU and Powergrid a Command Center supplies to one
  colony, and the fixed amount each pin draws from it. **This is the pin cap
  — the game defines no pin-count limit** — so "how many P1 pins, or fewer
  pins pushed to P2" is an arithmetic fit against two independent ceilings,
  and which ceiling binds is the useful half of the answer (Powergrid, almost
  always: an Extractor Control Unit and its heads are Powergrid-hungry and
  CPU-cheap, a Launchpad the reverse). Scales with the colony's own **Command
  Center upgrade level**, bought per colony with ISK — the **Command Center
  Upgrades** skill is only the ceiling on how far that level can go.
- **Prereq Promotion**: turning a derived prerequisite row in the Skill Plan
  editor into a real, user-owned plan entry at that position. Prereq rows are
  recomputed from the entry list on every schedule run, so they have no
  position of their own to save; promotion is what gives one. A promoted
  prereq is an ordinary entry from then on — same drag handle, priority
  control and remove button — and its own upstream prerequisites stay derived,
  moving with it.
- **Price Aggregate**: One best-bid/best-ask summary per station (Fuzzwork).
  Still the source for Build Plan pricing; no longer what the Market Browser shows.
- **Priority (Skill Plan)**: High/Normal/Low urgency a user assigns to a Skill
  Plan entry. A prerequisite's _effective_ priority is never less urgent than
  the most urgent entry that depends on it — the plan's banded view and the
  optimizer's "suggest full reorder" both key off this effective value, not
  each entry's own raw setting.
- **Plan Setup**: The folded block of a Build Plan's inputs — runs, ME/TE, build location, facility, rig, tax, trade hub, material price basis — read as a row of chips until "Edit setup" opens the controls. The same fields as before; only their default visibility changed (see docs/context/decisions, 2026-09-06 verdict-first).
- **Production Log**: The cross-plan, cross-item realized-profit rollup
  (issue #525) — every **Production Run** the character has logged,
  regardless of which Build Plan it came from, grouped by item. Distinct
  from the per-Build-Plan "Production Runs" panel on a Build Plan's own
  detail view, which is scoped to one plan's own runs; Production Log is the
  account-wide picture, including a per-run table (not just the by-item
  rollup) so a pilot can see which individual runs still need a sale linked,
  and a From/To date-range filter. Lives on `/industry`'s "Records" tab (a
  peer of the "Build Plans" tab, not a separate route or an always-visible
  panel). The per-run table names no Build Plan — a run outlives its plan
  (below) — so clicking a row jumps back to that run's own plan only when it
  still exists, and does nothing otherwise. It carries the same "Sold" split
  button (Link Past Sale / Watch Open Order / Manual Sale) the per-plan panel
  does, so a run can be linked to a sale without leaving Records.
- **Production Run**: A manual, pilot-entered snapshot of one production
  batch off a **Build Plan** — materials cost, job fee, and quantity as they
  stood at logging time, overridable at creation and never re-derived
  afterward (issue #525). Distinct from a Build Plan's own live `BuildResult`,
  which is a forward _estimate_ that moves with the market on every render; a
  Production Run holds still so realized profit can be measured against what
  was actually paid. This locking is also why deleting the Build Plan a run
  was logged under does not delete the run: the accounting record must
  outlive the plan, exactly so reusing or deleting that plan later (a
  blueprint's market price drifts, ME/TE changes) can never retroactively
  change a profit figure already booked. Deliberately correct-by-construction
  rather than reconstructed from ESI wallet history (see the decisions folder
  for why automated FIFO matching was rejected) — the pilot links what
  actually sold via "Link Past Sale" (a picker over cached wallet
  transactions), "Watch Open Order" (tracks one of the pilot's own open sell
  orders' `volume_remain` directly), or a "Manual / Private Sale" entry for a
  disposal ESI has no record of at all. Each linked sale or watched order is
  its own synced record, never a field on the run itself, so two devices
  linking different sales to the same run can never collide.
- **Projection**: The set of rows a device uploads describing every Scheduled
  Push that becomes due inside the Projection Horizon — one row per
  occurrence, carrying its **Occurrence Key**, its `fireAt`, and its
  already-rendered title and body. A Projection is a statement about the
  future made from data the device has read, not a copy of that data: the
  backend never learns what a Character's skill queue contains, only that
  something called "Gunnery V" comes due at a given instant.
- **Projection Horizon**: How far ahead a Projection reaches — 72 hours. A
  device that has not been opened inside that window stops receiving Scheduled
  Pushes until it is, which is the accepted consequence of holding no tokens
  server-side.
- **Quickbar**: The user's saved item shortcuts in the Market Browser's left
  column. Replaces the pin-to-compare grid; the comparison itself becomes a tab.
- **Ratio Block**: The smallest whole-pin set that runs a chain once — one
  Advanced Industry Facility making a P2 fed by exactly two Basic Industry
  Facilities, because one P1 factory's 40/hr is precisely what one P2 factory
  eats. A colony is sized by subtracting the fixed overhead (a mandatory
  Launchpad, plus a Storage Facility if the layout buffers through one) and
  dividing what is left by one block.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Remap Marker**: A user-placed row in a Skill Plan marking where the character will remap attributes. Draggable like a plan entry.
- **Remaps Available**: How many attribute remaps the character can spend: bonus remaps (new characters get several) plus the yearly remap when off cooldown. Read from the API (bonus_remaps, last_remap_date, cooldown); user may override. Optimizer must support the common single-remap case: train a leading segment on current attributes, then remap at the optimizer-chosen point.
- **Requested Scopes**: What one authorize round trip asked SSO for, stashed
  beside the PKCE verifier by `startLogin` and read back by `completeLogin`.
  The baseline the login path judges revocation against; the refresh path has
  none and uses the stored grant instead.
- **Roster Baseline**: The member list one observer last saw, per Character,
  device-local and never synced. Each observer keeps its own; the baseline
  records what _that_ observer has already reported.
- **Roster Diff**: Who joined and who left a corporation between two reads of
  `/corporations/{id}/members`. ESI publishes no join or leave event, so the
  change is only visible by comparing the current roster against a persisted
  previous one — the Roster Baseline.
- **Sale Profitability**: Whether building a Build Plan's product (manufacturing
  or reacting) and selling it on the market turns a profit, net of sales tax
  and broker fee.
  Distinct from the **Acquisition Verdict** — a product can be cheaper to
  build than buy while still losing ISK if resold, since selling fees only
  apply to the sale, not the build-vs-buy comparison.
- **Scheduled Push**: Delivery of a Notification Event from a timestamp the
  app already knew in advance, pushed by the backend rather than discovered by
  a poller. The complement of the diff-based detection round 20 describes: a
  diff answers "what changed since last time", a Scheduled Push answers "what
  becomes true at 14:32 on Thursday". Only events carrying a future timestamp
  in their own ESI data can be delivered this way.
- **Scope Group**: A named, opt-in set of OAuth scopes a Character is asked for
  only when they ask for the feature, rather than at sign-in with everyone
  else. Declared per endpoint in `esi/registry.ts` (`group: 'corp'`); absent
  means the Base Grant. `SCOPES` derives from the ungrouped endpoints and
  `scopesForGroup(group)` from the grouped ones, both from the same registry.
  `corp` is the only group today.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Sustained Extraction Rate**: An extractor program's whole output averaged
  over its whole length, off CCP's decay curve. The one honest
  units-per-hour summary of a program that in fact yields a different amount
  every cycle, and the number `chainCost` and `pinBudget` take as their
  extraction rate. CCP's own worked example averages ~5,580/hr against the
  13,930/hr `qty_per_cycle` alone implies.
- **System Label**: One of ESI's four built-in mail labels — Inbox, Sent,
  Corp, Alliance — returned by `/characters/{id}/mail/labels/` alongside
  their `unread_count`. Unrenamable/undeletable in-game; CCP does the
  routing (e.g. "is this corp mail"), the app doesn't reimplement it.
  Distinct from a **Custom Label**: a character's own user-created EVE mail
  label, also returned by the same endpoint. Deferred in round 18; surfaced
  as a filter chip row beneath the tab strip in round 22, then removed
  again (see `docs/context/decisions/`, 2026-09-05) — the app does not
  currently filter on it.
- **Throughput** (planetary): a **second budget, independent of the Pin
  Budget** — whether the colony's links can carry the material flow and
  whether a buffer cycle fits in the Launchpad and Storage Facility. This, not
  a CPU optimisation, is what drove EVE University's worked "one extractor
  feeds three Basic Facilities" ratio: it is storage-overflow-driven. A layout
  can clear the Pin Budget and still stall.
- **Trade Hub**: A market station/region the user picks for price lookups in a Build Plan.
- **Training Progress**: How much SP a Character has already banked toward
  the level it is training _right now_. Distinct from **Trained Skills**,
  which is levels finished. ESI reports it in two places that disagree:
  `/skills`' `skillpoints_in_skill` is frozen near where training began,
  while `/skillqueue` carries `training_start_sp`, `level_end_sp` and the
  window the level trains across — enough to interpolate the true figure,
  which is what the in-game queue itself displays.
- **Use-or-Sell Check**: A Build Plan's third read, alongside the
  **Acquisition Verdict** and **Sale Profitability**: is the stock the player
  already owns worth more sold than consumed? Compares the plan's profit
  (which counts owned units as free) against what those units would net if
  liquidated, on a chosen **Liquidation Basis**. Only exists when something is
  owned; no verdict at all when an owned material has no price on that side.
- **Verdict Hero**: The first panel of a Build Plan: net profit as one large figure, the margin / ISK-hour / duration / break-even line under it, and the Acquisition Verdict, Sale Profitability and Use-or-Sell Check as three labelled pills. It owns the Calculation Breakdown; the "Costs & revenue" ledger beside the materials holds the working.
- **Liquidation Basis**: How owned materials would be turned into ISK in the
  **Use-or-Sell Check** — `instant` (fill the hub's standing buy orders: sales
  tax only, since filling an order lists nothing) or `order` (list your own
  stack at the hub's sell price: sales tax plus broker fee, 100 ISK minimum per
  stack). Independent of a plan's material price basis, which is about buying.
- **Variations**: The selected item's Tech I/II/Faction/Storyline/Officer
  variation group, shown as a sortable table (Name, Tier, Sell, Buy) beside
  it for price comparison; falls back to its Market Group siblings when it
  has no variation data.
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set instead of the clone's current implants. Five independent per-attribute bonuses (+0..+5 each), since EVE's attribute hardwirings are per slot — a clone can run +4 PER / +5 INT / +3 MEM and nothing in WIL or CHA. The matched sets (+1..+5 in every slot) remain one-click **presets** over those five values; see round 28. Stored on the Skill Plan and synced with it (round 33).
