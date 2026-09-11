# Neocom Desk — Ubiquitous Language

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
- **Alert**: One fired Notification Event as it appears in the Notification
  Feed and on `/alerts`. Grouped there by _type_ — the `eveType` for an EVE
  notification, the event id otherwise — because a device back from a week
  away holds hundreds of fires across a dozen-odd types, and the type is the
  unit a reader mutes, dismisses or acts on. Distinct from the browser
  notification the same fire may also raise: two delivery channels, one event.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend.
- **Appraisal**: A Market page tab that prices a pasted pile of items — loot,
  a haul, a shopping list — at a **Trade Hub**, on both sides of the book at
  once: what it fetches sold into buy orders, and what it costs bought off
  sell orders. Scaled by a **Price Percent**. Distinct from **Compare**, which
  puts a handful of Quickbar items side by side on their own prices: an
  Appraisal answers "what is this pile worth", Compare answers "which of these
  is cheaper". Its collapsible "Compare hubs" section (issue #689) prices the
  same pasted pile at all 5 Trade Hubs side by side — a different question
  again ("where is this pile worth the most") from either of the above, and
  not the **Compare** tab under another name: it shares no state, code path,
  or Quickbar dependency with it.
- **Price Percent**: The fraction of market an **Appraisal** is quoted at —
  100 is the order book untouched, and a buyer quoting loot pays some fraction
  of it.
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
- **Auto Build**: A one-shot bulk action on a **Build Plan** or every member
  of a **Build Group** (issues #694/#695/#696, generalized from #652's
  original depth-only pass): walk the material tree — the plan's or each
  member's own full depth, no longer a player-chosen setting since issue
  #798 — within the enabled **Craft Scope**, applying one **Build Strategy**
  to decide build-or-buy for every material reached. Patches `buildHere`
  immediately and is never enforced afterward — running it again fully
  overwrites whatever craft/buy choices, hand-picked ones included, were
  there before. The Build Group surface asks a generic overwrite
  confirmation before applying, never a computed preview; the single-plan
  surface applies immediately with no confirmation and no separate re-run
  control, since a plan's own fields already recompute live. Named "Craft
  Sweep" before issue #798's rename — see
  `docs/context/decisions/20260909-212715-craft-sweep-bulk-build-depth-strategy-control-for.md`
  and
  `docs/context/decisions/20260910-225409-rename-craft-sweep-to-auto-build-sweep-strategy.md`.
  Distinct from **Build Opportunities**' own former "Auto Build Depth"
  control (issue #652), removed as unused ahead of this rename — see the
  same 20260910 decision file.
- **Base Grant**: What every Character is asked for at sign-in — `SCOPES`, and
  nothing from any Scope Group.
- **Base sheet** — the character's attributes as base + remap alone: five
  values, each 17..27, totalling exactly 99. The only thing a remap can
  change, the space the optimizer searches, and the input `computeSchedule`
  and `placeRemaps` expect. Distinct from the _effective_ values ESI reports,
  which fold in implants and any cerebral accelerator on top.
- **Blueprint Acquisition**: A Build Plan materials-table row — the
  blueprint's own type ID, distinct from the product's — priced whenever a
  buildable node (the top-level plan or any nested sub-build) isn't fully
  covered by an owned **BPO**. Tries **BPC Sourcing** at the node's own
  Trade Hub first, then that BPO's ordinary sell price there; always
  overridable like any material (`overridePrice`). Picks whichever
  owned-or-purchasable ME/TE tier makes the node's total cost lowest and
  reseeds the node's own `me`/`te` to match — tiers never mix within one
  node. A reaction-activity node only ever considers a BPO, since reaction
  formulas cannot be copied. See
  `docs/context/decisions/20260911-073307-blueprint-acquisition-cost-as-a-tier-optimized-material.md`
  (issue #838).
- **Booster**: Cerebral accelerator; user toggles it on manually with an expiry date for training-time math. Stored on the Skill Plan and synced with it, like What-If Implants above (round 33).
- **BPC**: An owned Blueprint Copy — an ESI blueprint instance with a finite
  number of `runs` remaining (`CharacterBlueprint.runs`,
  `esi/endpoints.ts`). Distinct from a **BPO**, which never depletes.
  Circulates only via player contracts in EVE, never ordinary market
  orders — see **BPC Sourcing**.
- **BPC Sourcing**: Industry's third tab (Build Plans / Records / BPC Sourcing). Search over every publicly contracted Blueprint Copy for sale across all of New Eden — item type, region, ME/TE, runs, price (issue #608, ADR 0013). Not per-Character: a scheduled backend job crawls EVE Ref's public-contracts dataset (ESI itself has no search over public contracts) and republishes a small, shared, read-only snapshot every 30 minutes for every signed-in Character to search. Distinct from the personal **Contracts** view, which is one Character's own issued/accepted contracts read straight from ESI.
- **Offer** (BPC Contract Search): one contract row in that snapshot — a single blueprint copy listing at a single price. Not a **copy**: one contract can offer `quantity: 3` copies at one price, so a count of offers is smaller than a count of copies. Every count on the search says "offers", because an offer is what a buyer chooses between.
- **BPO**: An owned Blueprint Original — an ESI blueprint instance with
  unlimited runs (`runs: -1`). Distinct from a **BPC**, which depletes.
  Unlike a BPC, a BPO is sometimes an ordinarily marketable item (mostly
  T1); **Blueprint Acquisition** falls back to its sell price when no BPC
  Sourcing offer is listed. The only acquisition target for a
  reaction-activity node, since reaction formulas have no copies at all.
- **Build Group**: A named collection of **Build Plan**s belonging to one Character, which also totals as one — open a member and it behaves exactly like any other Build Plan; open the group and every material across its members is added up and costed (see **Group Rollup**). Membership is exclusive and groups do not nest. Membership lives only on the plan, as `buildGroupId`; the group's name, order and mere existence live in the `sync.industryBuildGroups` setting, so an emptied group survives having no members and no merge can hand one plan to two groups. Deleting a group orphans its plans rather than deleting them, and a `buildGroupId` naming a group that is gone renders as an ordinary ungrouped plan — the same rule the Mining Tax `groupId` follows. Written in full in code and docs, where a bare "group" would collide with **Market Group** or an item's **Group**; the Industry plan list's own copy says "group", since neither of those can be meant there. See **Auto Build** and **Group Owned Overlay** for two of a group's own operations, distinct from what it merely displays via **Group Rollup**.
- **Build Location**: The search at the head of a Build Plan's Location & market group, over the stations and structures the Character can dock at. Picking one fills facility, **Build System** and security band in a single edit, and the plan remembers which place it was so the box can still name it after a reload. That name is a label only — every number reads the plan's own values, and any edit that moves the job elsewhere drops it. "Override" unfolds the fields behind the box. A manufacturing-activity plan can additionally carry a **Reaction Location** — a second, independent instance of this same control, gated by **Include Reactions**.
- **Build Opportunities**: Industry's fourth tab (Build Plans / Records / BPC Sourcing / Opportunities, issue #642). Ranks every manufacturing blueprint original or copy the chosen Character(s) own by ISK/hour, owned-materials-adjusted, at the default Trade Hub — the same costing `computeBuildPlan`/`buildVsBuy` already do for a hand-made Build Plan, run over every owned blueprint instead of one. Reaction blueprints are excluded; invention/research/copying stay out of scope, same as **Build Plan**. Selecting rows seeds them into **Build Plan Compare** as ordinary Build Plans. See **Order Depth** for its own new vocabulary — the row-ranking auto-build depth setting this tab once had (issue #652) was removed as unused ahead of the **Auto Build** rename (issue #798). Sits beside **Market-Wide Build Opportunities** (issue #819), the tab's ownership-independent sibling panel.
- **Build Plan**: An industry plan for one blueprint or reaction formula: materials needed, costs, fees/taxes, time, and two independent verdicts — an **Acquisition Verdict** and a **Sale Profitability** read (see round 15). Covers manufacturing and reactions (issue #460); invention and research/copying are still out of scope (`.out-of-scope/`). Which activity a plan runs is derived from the picked blueprint/formula's own `activity`, never a separate field on the record.
- **Build Strategy**: Which rule an **Auto Build** pass applies to every
  material it reaches within its **Craft Scope** — `buy` (force buy),
  `build` (force craft), or `cost-effective` (build only where cheaper —
  the default, reusing the same per-material cost compare
  `makeOrBuy` uses elsewhere). Named "Sweep Strategy" before issue #798's
  rename.
- **Build System**: The solar system a Build Plan's job runs in, named on the plan. Sets the **Cost Index** the job fee is charged at _and_ the security band the rig bonus reads — both follow from the system, so neither is a separate field. Materials are still priced at the plan's trade hub. Empty means "the hub's own system", which is how every plan behaved before the field existed.
- **Calculation Breakdown**: The modal behind a Build Plan's results that
  restates every figure on screen as a rule plus that rule with the plan's own
  live values substituted in — price bases, Material cost, Job Fee, revenue,
  fees, profit, break-even, and why an **Acquisition Verdict** and a **Sale
  Profitability** read differ off one hub price. The deep layer under the
  per-row tooltips. Those stay short — a verdict line, the two numbers behind
  it, and what clicking does — never a panel.
- **Calendar Map**: The `/calendar` grid, demoted from a container to a map —
  each day cell carries its date, a count, and one dot per **Clock Kind**
  landing on it, and nothing else. The detail lives in the **Coming Up Rail**
  beside it. Days
  before today are hatched and captioned rather than merely empty: ESI returns
  calendar events from now only, so a past cell is normally incapable of
  holding anything, which is a different statement from "nothing on". The hatch
  answers to that emptiness, not to the date — a past day that does hold
  something is drawn as an ordinary day, because a retained event ESI dropped
  the moment it started (end of its day, or six hours, whichever is later) can
  leave a late-night op sitting in yesterday's cell until the small hours. Drawn at one of two densities — a month, or the
  fortnight around today.
- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Character Board Item**: One clock on the `/calendar` board, from any of six
  sources — a calendar event, a skill-queue completion, an industry job
  delivery, a PI extractor program end, a contract expiry or a market-order
  expiry. The character-side counterpart of a **Corp Board Item**, and
  deliberately the same shape: heterogeneous sources in, one deadline-ordered
  list out, severity from time remaining alone. A source that could not be read
  contributes nothing _and says so_; a source that read fine with nothing due
  shows a zero — the two must never look alike.
- **Character Not Training**: Fires when a Character's skill queue shows no
  active training (the head entry has no live `finish_date`) — whether from
  an empty queue or a stalled/alpha-incapable queue head. ESI exposes no
  Omega/Alpha or subscription field at all (confirmed on CCP's own forums —
  deliberately excluded so characters can't be correlated to one account), so
  the _cause_ can never be distinguished; only this one unified symptom is
  detectable. Distinct from **Skill Level Complete**, which fires per
  finished queue entry while training continues.
- **Clock Kind**: Which of the six sources a **Character Board Item** came
  from. The `/calendar` page's one colour scale names this and nothing else —
  a **nominal** palette (`--color-kind-*`, DESIGN.md §1), unlike every other
  colour in the app, which encodes a magnitude or a status. Carried by the
  rail's countdown and glyph, one dot per kind in the **Calendar Map**, a
  segment in the **Day Ticker**, and a swatch in the filter menu, which is the
  legend for the set. Never the only signal: the kind is always also named.
- **Coming Up Rail**: The `/calendar` list beside the **Calendar Map**: every
  **Character Board Item** the pilot can read, deadline-ordered under relative
  day headings, each row carrying a countdown. The half of the page that
  answers "what happens next", where the map answers "what shape is the month".
  Scoped to one day when a map cell is selected, and otherwise unbounded ahead
  — the board has no forward horizon, because a cap makes the map's cells past
  it look empty for a reason that is not about the pilot's data. Map, ticker
  and rail all read the same board, so a day cannot show a dot for something
  the rail declines to list.
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
- **Craft Scope**: Which **Industry Activity** types an **Auto Build** pass
  is allowed to mark buildable — a multi-select, not a hardcoded
  manufacturing-only filter. Only Manufacturing is functional today;
  Reactions and Planetary (PI) are reserved slots the same control will grow
  into as their own tickets land, not a redesign of this one. A material
  outside the enabled scope is priced as bought, but the pass does not stop
  there — it keeps walking into that material's own inputs looking for
  further in-scope materials underneath. See
  `docs/context/decisions/20260909-212715-craft-sweep-bulk-build-depth-strategy-control-for.md`.
  Reactions' own path to becoming a real, selectable option is decided —
  see **Include Reactions** and **Reaction Location**.
- **Dark**: A member with no login for the corp's inactivity span or more —
  the pilot's own setting (14/30/60/90 days), defaulting to
  `DARK_AFTER_DAYS` (30). `engine/corp/members.ts` still owns the default and
  takes the span as an argument; one value is threaded from the view boundary
  so the table's tone, the rail's count and the roster's dark-only filter can
  never hold a second opinion about what dark means. A member who joined and
  has never logged in is counted from the day they joined, not excluded.
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
- **Day Ticker**: The **Calendar Map** on a phone — one horizontally scrolled
  row of day columns, each with its weekday, date, a count and a bar segmented
  by **Clock Kind**,
  in place of a 7x6 grid that would take the width the **Coming Up Rail** needs.
  The same day buckets the wide grid reads, sliced rather than re-bucketed, on
  the `CorpDeadlineStrip` precedent.
- **Deadline Strip**: The `/corp` overview's bar per local calendar day, each
  counting the Corp Board Items falling due on it and coloured by the worst
  Board Severity landing there. Exists to pay for what Kind Cards give up: four
  cards can each look calm while, between them, they hide one bad day.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, Production Runs, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **EIV (Estimated Item Value)**: The SCC's reference price for the materials
  a manufacturing job consumes, at ME0 quantities. Used only to size the
  **Job Fee** — it is not what the materials actually cost to buy.
- **Error Budget**: ESI's allowance of 100 non-2xx/3xx responses per 60
  seconds, counted **globally across every route** for the whole client — not
  per endpoint and not per Character. Spend it and ESI answers 420 to
  everything until the window rolls over, so one page's fan-out of forbidden
  structures can throttle every other Character's mail, contracts and jobs
  (issue #655). Distinct from the **rate** limit (429, `X-Ratelimit-*`), which
  is about request volume rather than errors. `src/esi/budget.ts` is the app's
  one reading of it: it tracks `X-ESI-Error-Limit-Remain`/`-Reset` off every
  response, spaces requests out before the budget is gone, and shuts a
  **circuit** on a 420/429 so callers fail fast into the cache instead of each
  retrying into a closed door.
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
- **Fit Import**: Pasting EFT fit text into Industry to get a **Build Group** holding one **Build Plan** per buildable item in the fit, named from the paste's own `[Ship, Fit]` header. Counts quantities the way a fit expresses them — one line per copy fitted _and_ the `xN` suffix, both reaching the same total — and reports what it could not build (faction, named and meta modules have no blueprint, and a fifth of a routine paste is normally one of those) rather than dropping it silently. New plans take their ME from the assumed-ME preference and their TE from the assumed-TE one rather than 0, since most of a T2 fit needs an invented BPC (ME2 / TE4 without a decryptor) and quoting it unresearched overstates the group's cost and understates its job time. Distinct from the Skill Planner's clipboard import, which reads the same text for the skills it demands; the two share `parseEftFit` and nothing else.
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
- **Group Owned Overlay**: A **Build Group**'s own "I own this" ledger —
  manual entry or ESI-asset auto-detection with a location scope, the same
  detect-plus-scope mechanism a Build Plan's own owned-stock entry already
  offers, but scoped to the group's aggregate material list rather than one
  plan's. Display-only: nets against the **Group Rollup** total to show
  what's still needed, and never writes into any member's own
  `materialSourcing`. Once this exists, the group total ignores each
  member's own owned-stock entry entirely — group-level ownership is the
  sole deduction the group total ever applies, regardless of what any
  individual plan has entered for itself. See
  `docs/context/decisions/20260909-212724-group-ownership-overlay-replaces-per-plan-owned-stock.md`.
- **Group Rollup**: What a **Build Group** shows when opened instead of one of its members: every member's materials merged by type, and the costs summed. A forward estimate only — Production Runs carry no group, so it never claims to say what a fit actually cost. Each member's tree is re-resolved with owned-stock deduction disabled before merging, so a member's own per-plan owned quantity never reaches the group total; the group's only owned-stock opinion is its own **Group Owned Overlay** ledger, netted once against the merged total. A member's own individual page is unaffected — it keeps netting its own `materialSourcing` and can disagree with the group total, which is expected now that group-level ownership is the sole deduction the group applies. Reports a mixture rather than resolving it: members sitting on different trade hubs still total in ISK, and since multibuy is per-station the paste is split rather than withheld — one list per hub, each copied on its own, with the hubs named. Nothing is re-homed to make the group tidy; the hub is the member plan's own fact.
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
- **High-Tech Production Plant**: The planetary pin that makes a P3 from two P2s. The tier above an **Advanced Industry Facility**, and the reason the Advisor will not offer one to a pilot whose colonies make no P2: it has nothing to put in it unless the P2s are bought at a hub and hauled in.
- **Include Reactions**: A manufacturing-activity Build Plan's own toggle,
  off by default, for whether a reaction-produced sub-input anywhere in its
  material tree can be recursively built rather than only marked advisory.
  Off, none of **Reaction Location**'s fields exist on screen at all — not
  merely inert. On, a reaction material becomes selectable in **Craft
  Scope** and hand-toggleable in the materials table the same way a
  manufacturing one already is. Never shown on a plan whose own top-level
  **Industry Activity** is already `reaction` — such a plan reuses its own
  location for a nested reaction sub-build instead. See
  `docs/context/decisions/20260910-082559-reaction-location-a-second-facility-context-lets-craft.md`.
- **Industry Activity**: Which job a **Build Plan** runs — `'manufacturing'` or `'reaction'` (issue #460). Never a field on `BuildPlanRecord`; always derived from the picked blueprint/reaction formula's own `activity`, tagged onto it from the SDE (`industryActivity.csv`'s activity ID 1 vs 11) at build time. Determines which **Facility Preset**s and reactor/engineering rig security multipliers apply — a facility hosts one activity, never both.
- **Install Prompt**: A one-time, in-app call-to-action to install Neocom
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
- **Kind Card**: One `/corp` overview panel per kind of Corp Board Item — Fuel,
  Structure timers, Moon chunks, Industry jobs — showing that kind's most urgent
  few and counting the rest. Fed by the one engine ranking, never a second one,
  and gated on the Corp Capability that opens its own read.
- **Location Mode**: The Market Browser's one location control, in one of two
  mutually exclusive modes — **Region** (every station in that region) or
  **Trade Hub** (that hub's region, filtered to the hub's station).
- **Market Browser**: General item price lookup page (any item, prices at chosen Trade Hub). Separate from a character's own **Market Orders** (open + history).
- **Market Group**: A node in EVE's own market browse tree (`invMarketGroups`:
  `Ships → Frigates → Standard Frigates`). Distinct from an item's **Group**
  (`invGroups`, a taxonomy that is not the market's). Only Market Groups with
  `hasTypes` hold items; the rest are branches.
- **Market-Wide Build Opportunities**: The Opportunities tab's second panel
  (issue #819) — ranks manufacturable products across the whole SDE by
  ISK/hour, independent of ownership or material overlap with anything the
  chosen Character owns; **Build Opportunities** itself only ever ranks
  blueprints the Character(s) already hold. Reactions and PI stay excluded,
  same as **Build Opportunities**. Opt-in ("Run market scan"), never
  auto-computed. Candidates are bounded by a **Liquidity Floor** and a fixed
  top-N per **Market Group**, computed against material trees precomputed at
  SDE-build time (`public/data/marketWideTrees.json`,
  `scripts/build-sde.mjs`) rather than resolved live — an ME-0 approximation;
  selecting a row still opens a real Build Plan for exact numbers.
- **Liquidity Floor**: The minimum sell-order ISK a product must carry at the
  hub to be considered at all in **Market-Wide Build Opportunities** — the
  same `sellPrice * sellVolume` depth `classifyOrderDepth` (**Order Depth**)
  already reads, applied here as a hard cutoff before any material pricing
  runs, not just a classification of a row already priced.
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
- **Manual Ore Tag**: A pilot's hand-classification of an ore type the
  SDE-derived allowlists don't recognise, made from the Moon Mining Tax
  ledger's "unclassified ore" banner. Two independent lists — "Tag as moon
  ore" (group it into **Mining Ledger Entries** from now on) and "Ignore"
  (treat it as ordinary ore/ice: stop flagging it, never group it). Device-
  local and never synced: a stop-gap for the window between a CCP patch and
  the next `npm run sde:build`, not Editable Data. Reversible from the
  ledger's **Ore tags** dialog — an uncorrectable correction is worse than
  the misclassification it fixes.
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
- **Offline Services**: The `/corp` overview's strip for the board's one untimed
  kind. A structure service that is off is a standing fault with no instant, so
  it has no place in a Kind Card's ordering or on the Deadline Strip, and it
  gets a surface with no clock instead.
- **Optimize Modes**: Skill Plan optimizer actions — "optimize now" (optimizer chooses remap placement, keeps order), "optimize at remap points" (user drags **Remap Markers** into the plan; optimizer computes the best attribute spread for each marker-delimited segment), "suggest full reorder" (attribute-grouped reorder honoring prerequisites; user accepts or rejects). Reorder never applies silently.
- **Order Book**: The live buy and sell orders for one item in one Region, read
  from ESI. Rows, not a summary — each row is one order with its price,
  quantity, location, range and expiry. Replaces the single best bid/ask that a
  **Price Aggregate** gives.
- **Order Floor**: The lowest price a sell order is worth taking, from
  `src/engine/market/orderFloor.ts`. Two numbers: `relist` (sales tax plus a
  broker fee charged again on the edit — the lowest price worth
  RE-PRICING to) and `fill` (sales tax only, since the broker fee was
  already paid at listing). Only `relist` is ever shown as a figure — the
  row and the modal's quick answer both read it alone; `fill` surfaces only
  inside the deeper breakdown, because the smaller number matters only when
  deciding to leave an order alone rather than touch it. Null when nothing
  is linked to the order — never a guessed floor, since a floor of zero
  would make every rival look safe to follow.
- **Order Depth**: A **Build Opportunities** row's `deep`/`moderate`/`thin`/`unknown` read on how much sell-order ISK sits at the hub against that row's own build cost — `classifyOrderDepth` in `src/engine/industry/opportunities.ts`, a `ProblemThresholds`-style typed threshold object (see **Order Problem**) since no such convention existed before this ticket. `unknown` when the product itself has no hub sell price, never guessed as thin.
- **Order Problem**: The one thing wrong with an open order, from
  `src/engine/market/orderProblems.ts`, and the Open Orders page's spine:
  `belowFloor`, `undercutStation`, `undercutSystem`, `undercutRegion`,
  `expiringOrStale`, `outbid`, `healthy`, in that precedence. Each order is
  filed under exactly one — its worst — for grouping, while filters match
  against every problem an order has, since those can overlap.
- **Reprocessing Yield**: What one type breaks down into when refined, baked
  from the SDE into `public/data/reprocessing.json` (issue #537). Quantities
  are per portion size, not per unit, so a part portion refines into
  nothing at all — the portion size rides inside each entry so the quantities
  cannot be read without it. `src/engine/industry/reprocessing.ts` turns a
  yield plus the character's Reprocessing, Reprocessing Efficiency and
  Scrapmetal Processing levels into an expected output. What it deliberately
  does NOT model: a structure's own refining rate, its rigs, and the
  standings-based station tax — none is readable from ESI for an arbitrary
  location, so the base 50% station rate is stated on screen as an assumption
  rather than presented as fact.
- **Order Slots**: How many market orders a character may keep open at once —
  a base 5, plus 4 per level of Trade, 8 per Retail, 16 per Wholesale and 32
  per Tycoon, so 305 with all four at V. ESI reports the open orders but never
  this ceiling, so it is derived from trained skills
  (`src/engine/market/orderSlots.ts`) and shown as the denominator of the
  Overview's Open orders tile.
- **Payee**: Who the Moon Mining Tax ledger owes — user-managed `{name,
default tax %, optional moon/system tag, optional Trade Hub}`. The
  moon/system tag lets the UI
  auto-suggest (and pre-fill) the Payee and rate for a future Mining Ledger
  Entry from that system: "pick the moon, the corp, or the person, whichever
  is memorable" (issue #523). The Trade Hub is the order book this Payee's ore
  is valued at (absent means Jita); it lives on the Payee rather than on the
  device because the tax owed is a bill one player sends another, and it is
  deliberately not the Market Browser's own hub preference. Optionally also carries `entityId`, the EVE
  character or corporation the ISK actually goes to — never asked for, since a
  Payee is a free-text label, but **learned** the first time a Made Payment to
  that recipient is confirmed as settling this Payee's entries, after which
  recipient identity (not amount or date) is the primary match signal
  (issue #540).
- **Pending Login**: One authorize round trip this tab has started and not yet
  finished — its PKCE verifier, its **Requested Scopes**, and when it began —
  stored by `startLogin` under its own `state` and taken by `completeLogin`.
  Per-`state` rather than one shared slot so two round trips started close
  together both stay valid; whichever SSO returns is the one that completes.
  Bounded by a TTL, enforced when it is redeemed as well as when a later login
  prunes, and by a maximum count — so an abandoned one is forgotten.
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
  button (Link Past Sale / Watch Open Order / Manual Sale, plus Delete
  production run) the per-plan panel does, so a run can be linked to a sale —
  or dropped when it was logged in error — without leaving Records. That menu
  item is Records' only delete: its rows navigate, so there is no edit modal
  here to hold a danger button like the per-plan panel's.
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
- **Pull Cursor**: How far a sync pass has read one remote collection for one
  Character — the highest `updatedAt` it has actually observed there, plus when
  it last read that collection unfiltered. The next pass asks Firestore only
  for documents above the mark instead of re-reading the whole collection, and
  falls back to an unfiltered read once the unfiltered one is older than the
  tombstone TTL. A Pull Cursor is a statement about what this device has seen,
  never about the current time: it never advances past the newest document in
  the response.
- **Quickbar**: The user's saved item shortcuts in the Market Browser's left
  column. Replaces the pin-to-compare grid; the comparison itself becomes a tab.
- **Ratio Block**: The smallest whole-pin set that runs a chain once — one
  Advanced Industry Facility making a P2 fed by exactly two Basic Industry
  Facilities, because one P1 factory's 40/hr is precisely what one P2 factory
  eats. A colony is sized by subtracting the fixed overhead (a mandatory
  Launchpad, plus a Storage Facility if the layout buffers through one) and
  dividing what is left by one block.
- **Reaction Location**: A manufacturing-activity Build Plan's second,
  independent location — same shape as **Build Location** (search
  restricted to Athanor/Tatara, reactor rig fit, tax, security band read off
  the pick), revealed only when **Include Reactions** is on. Not derived
  from the plan's own primary location; a fresh plan's first one is
  pre-filled from its own Settings-level default rather than carried forward
  from whichever plan was last edited (issue #456's precedent for the
  primary Build Location), since a pilot's manufacturing location turns over
  far more often than their one dedicated reactor. See
  `docs/context/decisions/20260910-082559-reaction-location-a-second-facility-context-lets-craft.md`.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Remap Marker**: A user-placed row in a Skill Plan marking where the character will remap attributes. Draggable like a plan entry.
- **Remaps Available**: How many attribute remaps the character can spend: bonus remaps (new characters get several) plus the yearly remap when off cooldown. Read from the API (bonus_remaps, last_remap_date, cooldown); user may override. Optimizer must support the common single-remap case: train a leading segment on current attributes, then remap at the optimizer-chosen point.
- **Requested Scopes**: What one authorize round trip asked SSO for, carried on
  its **Pending Login** and read back by `completeLogin`. The baseline the login
  path judges revocation against; the refresh path has none and uses the stored
  grant instead.
- **Reset Run**: The unit of planetary work — every colony a pilot resets in
  one sitting. Because they are installed back to back, their extractor
  programs come to share an expiry give or take the minutes it took to walk
  the list, so the Triage Board groups them into one row rather than one per
  colony (`engine/pi/colonyBatches.ts`). A colony is what the Colonies table
  lists; a Reset Run is what a pilot actually goes and does.
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
- **Seeded Build Plan**: A **Build Plan** opened from a BPC Sourcing **Offer**,
  or from a blueprint line in a BPC contract's contents list, at that copy's
  own ME, TE and runs rather than at the usual defaults, so a pilot shopping
  or bundle-checking a copy sees what _that_ copy builds (issues #637, #638).
  A contract line seeds only when ESI reports all three numbers for it —
  optional there, unlike an Offer's, which always carries them. Named for the
  copy it quotes ("Rifter 10/20 ×5"), since a Character can hold a plain plan
  and several seeded plans for one blueprint at once.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Standing (corp)**: The `/corp` overview's top panel: the figures a corp
  manager acts on — clocks due inside a day, Runway, 30-day net — beside the
  Deadline Strip. Degrades figure by figure on Corp Capability, so a Character
  holding one source and not the other sees fewer figures rather than empty
  ones.
- **Starred Character**: A Character the user has pinned to the top of the
  Characters page. Device-local and never synced, for the same reason an
  **Account** grouping is — a star is a statement about the roster, not about
  one Character, so no Character's sync scope owns it. Deliberately "starred",
  not "pinned": **Pin** already means a planetary structure (and a **Station
  Pin**), and this is neither. It floats a card within whichever group section
  the Character is already in — it does not lift it out of its group — and it
  layers on top of the chosen sort key rather than replacing it. User-created
  content, not view state: nothing clears a star but the user, except a star
  whose Character has left the device.
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
  as its own filter chip row in round 22, then removed again (see
  `docs/context/decisions/`, 2026-09-05) — the app does not currently filter
  on it. The four System Labels are the Mail page's folder filter: a
  multi-select toggle group, so any subset of them can be shown at once (see
  `docs/context/decisions/`, 2026-09-07).
- **Throughput** (planetary): a **second budget, independent of the Pin
  Budget** — whether the colony's links can carry the material flow and
  whether a buffer cycle fits in the Launchpad and Storage Facility. This, not
  a CPU optimisation, is what drove EVE University's worked "one extractor
  feeds three Basic Facilities" ratio: it is storage-overflow-driven. A layout
  can clear the Pin Budget and still stall.
- **Triage Board**: What `/overview` is — not a dashboard of figures but an
  answer to "is there anything I have to do before I log off", one card per
  domain, each linking to the page that fixes it. Its organising rule: numbers
  where the items are interchangeable, rows only where each item is genuinely
  its own thing. Distinct from the **Corp Ops Board** (`/corp`), which answers
  the same question for a corporation and shares the severity ladder but not
  the layout.
- **Trade Hub**: A market station/region the user picks for price lookups in a Build Plan.
- **Training Progress**: How much SP a Character has already banked toward
  the level it is training _right now_. Distinct from **Trained Skills**,
  which is levels finished. ESI reports it in two places that disagree:
  `/skills`' `skillpoints_in_skill` is frozen near where training began,
  while `/skillqueue` carries `training_start_sp`, `level_end_sp` and the
  window the level trains across — enough to interpolate the true figure,
  which is what the in-game queue itself displays.
- **Undercut Scope**: station, system or region, from
  `src/engine/market/undercut.ts`. Nested, not independent: a cheaper order
  at my station is also in my system and my region, so a row shows one
  severity — the tightest scope containing a rival. A scope absent from
  `byScope` was never checked; `null` means checked and clean —
  collapsing those two would make a loading state indistinguishable from a
  genuinely clean order. Station comes from batched aggregate prices on
  every refresh; system and region come from one region order book per
  item, fetched on demand.
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
- **What We Store**: The section of Settings' FAQ tab that tells a pilot, in
  their own words, what leaves their device. Not documentation — a
  **commitment**: `sync/characterPurge.ts`'s exported `REMOTE_COLLECTIONS` is
  the authoritative set, and `features/faq`'s test maps every entry in it to
  the line that mentions it, so a newly synced collection fails the suite until
  the copy accounts for it. Names its own exceptions (Notification Feed rows,
  Scheduled Push occurrences, crash reports) rather than rounding them off; a
  section a reader can catch overclaiming is worth less than none. Deep-linkable
  at `/settings#faq`.
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set instead of the clone's current implants. Five independent per-attribute bonuses (+0..+5 each), since EVE's attribute hardwirings are per slot — a clone can run +4 PER / +5 INT / +3 MEM and nothing in WIL or CHA. The matched sets (+1..+5 in every slot) remain one-click **presets** over those five values; see round 28. Stored on the Skill Plan and synced with it (round 33).
