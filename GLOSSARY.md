# Neocom Desk — Glossary

## Glossary

The project's shared vocabulary. Use these terms exactly.

Sorted by term, and kept that way deliberately: a new term inserted in
alphabetical position lands mid-file, so two agents adding terms at once do not
collide the way appending to the end always did. Scope decisions do not belong
here — they go one per file in `docs/context/decisions/`.

- **Accelerator**: A Character's running cerebral accelerator as the pilot told us
  about it: a bonus to all five attributes and the instant it runs out, saved
  once per Character and shared by every **Skill Plan** and the Characters
  table's Accelerator column. Typed-in wins while it has not run out; after
  that it is deleted and a **Detected Accelerator** (a guess, no expiry) applies
  again. It is the first **Booster** of the plans costed for that Character.
- **Abyssal type**: The item type a **Mutaplasmid** makes — "Heavy Abyssal
  Energy Neutralizer", "Light Mutated Drone". One abyssal type is made from
  many base modules, so the type alone never says which base an item came
  from, nor what it rolled: those belong to the **Mutated module** itself.
- **Account**: UI-level grouping of a user's Characters. Has no storage, no
  sync and no server-side identity, because EVE SSO exposes no account
  identifier. Never surfaced to the user as a thing to manage.
- **Achievement score**: A Character's total score from EVE's in-game
  achievements, from its public record (`achievement_score`). Shown with the
  **Character title** as one line, "Title · 1,240 points", and as the optional
  Title / Score column on Characters and Contacts. Not a standing and not
  skill points.
- **Acquisition Verdict**: Whether a Build Plan's product costs less to build
  than to buy outright at the trade hub. A personal-use comparison — no
  sales tax or broker fee applies, because nothing is being sold. Stated in
  Costs & revenue as "Buying <product> instead", not in the **Verdict Hero**.
- **Agent access**: Which mission agent levels a pilot's NPC standings open, shown on an NPC faction's or corporation's info modal as five pips (levels 1 to 5, the standing each needs underneath) and what the next level takes. Level 1 is always open; levels 2 to 5 need 1.0, 3.0, 5.0 and 7.0 of the best effective standing in the **Standing chain**, and none of them is open while any link is at -2.0 or lower. On an agent's modal it answers "Can you use this agent?" for that agent's own level. Storyline, research and COSMOS agents follow other rules and are not covered.
- **Agreed rate**: What the **Collector** set as a **Feeder**'s **Owner rate**. When one exists it wins over the **Requested rate**. Player-facing: "your rate" or "their rate".
- **Alert**: One fired Notification Event as it appears in the Notification
  Feed and in the bell panel, grouped by _type_ (the EVE notification type, or
  the event id otherwise). A danger type nobody has acknowledged also raises
  the **Danger banner**. Distinct from the browser notification the same
  fire may also raise: two delivery channels, one event.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend — except the blueprints and **Fitting**s a **Member** opts to share with a **Community** (ADR 0018), and a corporation's **Corp Tax Book** (ADR 0023).
- **Appraisal**: A Market page tab that prices a pasted pile of items — loot,
  a haul, a shopping list, or a whole EFT ship fit — at a **Trade Hub**, on
  both sides of the book at once: what it fetches sold into buy orders, and
  what it costs bought off sell orders. Scaled by a **Price Percent**.
  Distinct from **Compare**, which puts the items in the **Compare Set** side
  by side on their own prices: an Appraisal answers "what is this pile
  worth", Compare answers "which of these is cheaper". Its "Compare hubs"
  section prices the same pile at the five empire Trade Hubs ("where is it worth the
  most") and is not the **Compare** drawer. Its optional "Split each" column
  is the **split**: the midpoint of a line's buy and sell price, also shown
  on a **Shared Appraisal**.
- **Collector**: A corporation whose **Corp Tax Book** also collects moon mining tax for moons it does not own, billing the miners and accounting to each **Feeder**. Dev term: to a moon owner it is "the accounting corporation".
- **Coverage period**: A run of UTC days (`from`, optional `to`, both inclusive) during which a **Feeder**'s mined volume counts toward a **Collector**'s book; a rejoin adds a new one on the same record, and rows outside every period owe nothing.
- **Disconnected**: A **Feeder**'s status after 30 days of a stale grant. Player-facing: "Disconnected".
- **Feeder**: A moon-owning corporation whose mining ledger a **Collector** reads. Dev term: player-facing, "moon owner".
- **Feeder view**: What a **Feeder** sees of the **Collector**'s book: its own mined volume, rate, amount due and payouts, never the miner debts, **Miner rate** or margin. Player-facing: the moon owner's page.
- **Miner rate**: What miners pay in a **Collector**'s book, with a per-**Feeder** tier in its chain. Never shown to a **Feeder**. Player-facing: "miner rate".
- **Omega coverage**: Overview widget: how many Omega subscriptions ("accounts") a pilot's net ISK income per rolling 7, 30 or 90 days (the widget range; 30 by default) could pay for, at PLEX's price, against one account's cost for that window. Its "accounts" are EVE subscriptions counted from ISK, not the **Account** UI grouping of Characters.
- **Open in EVE**: A button or menu item that asks the running EVE client to open a window (the information window for a character, corporation or alliance; an item's market window; or a contract) through `esi-ui.open_window.v1`. A write only in that it reaches the game: nothing in EVE changes. Its own opt-in **Permission**, "Open in EVE", in **Write to EVE**.
- **Spool weapon**: A Precursor weapon (a disintegrator) whose damage grows every cycle up to a cap. The Offense row shows its unspooled and fully spooled DPS; totals, Applied DPS and Improve use fully spooled.
- **Write to EVE**: The off-by-default section of **Permission**s that change something in EVE or open a window in its client: send mail, mark mail read, calendar RSVP, save a Fitting to EVE, set autopilot waypoints, Open in EVE. One Permission per feature, marked `section: 'write'` in the registry. A plain login asks for none; each is asked for the first time a Character uses its feature.
- **Owner rate**: What a **Feeder** is owed, kept as its own effective-dated history: the **Agreed rate** if one exists, else the **Requested rate**. Player-facing: "their rate" or "your rate".
- **Payout**: ISK a **Collector** sent a **Feeder** for what it is owed. Distinct from a **Tax Payment**. Player-facing: "payment".
- **Pending removal**: A **Collector**-started removal of a **Feeder** while it waits out its 24 hours. Player-facing: "Removal pending".
- **Place Nickname**: The user's own short name for a station or structure ("Home market", "Staging"), shown on the Assets page beside the real name. Personal: it never replaces the real name anywhere another person, a share or an export would see it. Distinct from a **Station Pin**, which orders locations but does not rename them.
- **Price Percent**: The fraction of market an **Appraisal** is quoted at —
  100 is the order book untouched, and a buyer quoting loot pays some fraction
  of it.
- **Asset Category**: The top-level market group an item sits under ("Ships", "Ship Equipment", "Blueprints & Reactions"), as Assets, Corp Assets and the LP Store landing's Category filter use it. Not EVE's own inventory category. An item outside the market tree has none and reads "Not on the market".
- **Assignment**: Links a Mining Ledger Entry (or a split slice of its ore) to
  a Payee, snapshotting the tax % and ISK value at assignment time. It acts
  like an invoice thereafter: a later price move or an edited Payee default
  does not change what it shows as owed. If ESI later reports more ore for the
  entry, an Outstanding Assignment absorbs the growth, while a Paid or
  dismissed one flips to `needs-review` with a before/after diff. A
  `dismissed` Assignment ("I don't pay tax on this entry") carries no Payee
  but still surfaces growth.
- **Attribute-Modifying Skill**: A skill that changes the effective value of
  an item's attribute it does not itself require — Sharpshooter boosts
  Optimal Range on any item requiring Gunnery, without Sharpshooter itself
  being required. Distinct from a required skill, which gates whether an item
  can be used at all rather than changing its numbers.
- **Auto Build**: A one-shot bulk action on a **Build Plan** or every member
  of a **Build Group**: walk the material tree to its full depth, within the
  enabled **Craft Scope**, applying one **Build Strategy** to decide
  build-or-buy for every material reached. The choices are applied once and
  never enforced afterward — running it again overwrites whatever craft/buy
  choices, hand-picked ones included, were there before.
- **Base Grant**: What the plain "Log in" button asks a Character for: the
  **Core Grant** plus every **Permission** that is on by default. Distinct
  from the Core Grant, which is only the part that cannot be unchecked.
- **Core Grant**: The scopes every Character must grant, shown checked and
  locked when customizing permissions: skills, the skill queue, and structure
  lookup (names and search). Leaving them out makes other numbers silently
  wrong or leaves structures unnamed across the app.
- **Base sheet** — the character's attributes as base + remap alone: five
  values, each 17..27, totalling exactly 99. The only thing a remap can
  change, and the space the optimizer searches. Distinct from the _effective_
  values ESI reports, which fold in implants and any cerebral accelerator on
  top.
- **Bigger chain**: a P3 or P4 that Plan recommends making across several of
  the pilot's planets, in its own "Bigger chains" section. It appears only
  when the pilot opted in to **Haul between planets**, is limited to the
  planet types they already run, and is recommended only when it beats the
  same number of planets on their best one-planet picks. It never enters a
  pick, a **Quick win** or a total. Distinct from a **Chain estimate**, the
  bare figure shown for every P3/P4 everywhere.
- **Below market**: Contract Search's Item search view (a chip, not a
  filter) that lists one row per public item-exchange contract worth more
  than it asks: each line at the default **Trade Hub**'s best buy minus sales
  tax, a line with no market at the cheapest of at least three other offers.
  Contracts that ask for items, and auctions with no buyout, are left out.
- **Billable**: A day in a **Corp Tax Book** that can go on a **Statement**: the UTC day has ended, the book's grace period (30 minutes by default) has passed, and an officer has synced after that, so no more ore can still arrive for it. Before that the day is part of **Today's mining** and owes nothing.
- **Next Statement**: The **Billable** days of a **Corp Tax Book** that are not on a **Statement** yet; what the next Statement run will bill. Distinct from **Today's mining**, which is not Billable yet.
- **Today's mining**: A **Corp Tax Book** day that is not **Billable** yet, so it owes nothing and is on no **Statement**: mostly today, and yesterday too until the first sync after the grace. Shown on a Miner's page, above **Next Statement**.
- **Blueprint Acquisition**: A Build Plan materials-table row — the
  blueprint's own type ID, distinct from the product's — priced whenever a
  buildable node isn't fully covered by an owned **BPO**. It takes whichever
  owned-or-purchasable ME/TE tier makes the node's total cost lowest, trying
  **BPC Sourcing** first, then the BPO's ordinary sell price. A
  **Community Offer** joins the same tier pool at 0 ISK, so the
  **Acquisition Verdict** can flip to build; the row reads "from <name>" and
  shows stale. Ranking: an owned BPO beats a Community Offer, which beats any
  priced contract offer. A reaction-activity node only ever considers a BPO,
  and a **Member**'s reaction formula is never a source. A Tech II
  blueprint's sources include invention, at its expected cost per copy.
- **Boot Update**: A new app build (a waiting service worker) applied behind
  the boot screen on a cold start or browser reload, never mid-session: no
  route-change reload, and no "update ready" indicator.
- **Booster**: Cerebral accelerator; user adds it manually, entering the time
  left as EVE's tooltip shows it, for training-time math. The one running now
  is the Character's **Accelerator**, shared across plans; a plan holds only the
  Boosters it queues behind it. A Skill Plan holds
  an ordered list of Boosters run one after another, since EVE has a single
  booster slot; a queued one starts when the one before it expires.
- **BPC**: An owned Blueprint Copy — an ESI blueprint instance with a finite
  number of runs remaining. Distinct from a **BPO**, which never depletes.
  Circulates only via player contracts in EVE, never ordinary market
  orders — see **BPC Sourcing**.
- **BPC Sourcing**: Industry's third tab. Search over every publicly
  contracted Blueprint Copy for sale across all of New Eden — item type,
  region, ME/TE, runs, price. Not per-Character: it reads the shared,
  read-only **Public Contract Offers snapshot**, narrowed to blueprint copies.
  Distinct from **Contract Search**, the Contracts page's own tab over the
  same snapshot unnarrowed, and from the History tab, which is one
  Character's own contracts read straight from ESI.
- **Offer** (BPC Contract Search): one for-sale row of that snapshot — in BPC Sourcing, a single blueprint copy listing at a single price. Not a **copy**: one contract can offer `quantity: 3` copies at one price, so a count of offers is smaller than a count of copies. Every count on the search says "offers", because an offer is what a buyer chooses between.
- **BPO**: An owned Blueprint Original — an ESI blueprint instance with
  unlimited runs. Distinct from a **BPC**, which depletes. Unlike a BPC, a BPO
  is sometimes an ordinarily marketable item (mostly T1). The only acquisition
  target for a reaction-activity node, since reaction formulas have no copies.
- **Build Group**: A named collection of **Build Plan**s belonging to one
  Character, which also totals as one — open a member and it behaves like any
  other Build Plan; open the group and every material across its members is
  added up and costed (see **Group Rollup**). Membership is exclusive and
  groups do not nest. Written in full ("Build Group") where a bare "group"
  would collide with **Market Group** or an item's **Group**.
- **Build Location**: The search at the head of a Build Plan's Location &
  market group, over the stations and structures the Character can dock at.
  Picking one fills facility, **Build System** and security band in a single
  edit. The name is a label only — every number reads the plan's own values.
  A manufacturing-activity plan can additionally carry a **Reaction
  Location**, a second, independent instance of this control, gated by
  **Include Reactions**.
- **Build Opportunities**: Industry's fourth tab. Ranks every manufacturing
  blueprint original or copy the chosen Character(s) own by ISK/hour,
  owned-materials-adjusted, at the default Trade Hub — the same costing a
  hand-made Build Plan gets, run over every owned blueprint. Reaction
  blueprints are excluded. Selecting rows seeds them into **Build Plan
  Compare** as ordinary Build Plans. Sits beside **Market-Wide Build
  Opportunities**, the tab's ownership-independent sibling panel. Its panel
  is titled "Build" and has three views: Ranked, All owned and **Corp
  projects**.
- **Corporation Project**: A job the game's corporation project board offers
  members: a fixed ISK reward per contributed unit, paid from a pool, with a
  per-Character cap and an end date. Only the manufacture kind is read (mining,
  delivery, combat, loyalty and unknown kinds are left to the game client). In
  **Build Opportunities** it is a buyer: the **Corp projects** view lists each
  open one the chosen Characters can still contribute to, with the reward,
  the build cost, where the blueprint comes from and the profit at the cap.
  Read with the opt-in **Permission** "Corporation projects"; the view is
  absent without it.
- **Build Plan**: An industry plan for one blueprint or reaction formula:
  materials needed, costs, fees/taxes, time, and two independent verdicts — an
  **Acquisition Verdict** and a **Sale Profitability** read. Covers
  manufacturing and reactions. Invention prices a Tech II copy as a
  **Blueprint Acquisition** source, not a plan of its own; research and
  copying plans are out of scope. Which activity a plan runs is derived from the picked blueprint or
  formula, never a separate field.
- **Build Strategy**: Which rule an **Auto Build** pass applies to every
  material it reaches within its **Craft Scope** — `buy` (force buy),
  `build` (force craft), or `cost-effective` (build only where cheaper —
  the default).
- **Build System**: The solar system a Build Plan's job runs in. Sets the
  **Cost Index** the job fee is charged at and the security band the rig bonus
  reads. Materials are still priced at the plan's trade hub. Empty means "the
  hub's own system".
- **Calculation Breakdown**: The modal behind a Build Plan's results that
  restates every figure on screen as a rule plus that rule with the plan's own
  live values substituted in — including why an **Acquisition Verdict** and a
  **Sale Profitability** read differ off one hub price. The deep layer under
  the short per-row tooltips.
- **Calendar Map**: The calendar page's grid — each day cell carries its date,
  a count, and one dot per **Clock Kind** landing on it, and nothing else. The
  detail lives in the **Coming Up Rail** beside it. Days before today are
  hatched because ESI returns calendar events from now only, so a past cell is
  normally incapable of holding anything, which differs from "nothing on".
- **Certificate**: One of CCP's combat certificates (Armor Tanking, Navigation,
  Medium Missiles, …) — a five-grade ladder of skill levels, Basic, Standard,
  Improved, Advanced, Elite. The same ladders CCP assembles ship **Masteries**
  from, kept whole so a pilot can be graded by area rather than by hull. A
  grade counts as reached when its levels, and every lower grade's, are all
  trained. Only combat certificates are included.
- **Certified Plan**: One of CCP's own career skill plans (Explorer,
  Industrialist, Enforcer, Soldier of Fortune), as listed in the game under
  Skill Plans › Certified Plans. Never edited in the app: picking one creates
  an ordinary **Skill Plan** from it, minus what the Character has already
  trained, with no link back to the original.
- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Character Board Item**: One clock on the calendar board, from any of eight
  sources — a calendar event, a skill-queue completion, an industry job
  delivery, a PI extractor program end, a moon chunk arrival or decay, a
  contract expiry, a market-order expiry, or a projected step of the chosen
  Skill Plan (a forecast). The character-side counterpart of a **Corp Board
  Item**. A source that could not be read contributes nothing _and says so_; a
  source that read fine with nothing due shows a zero — the two must never
  look alike.
- **Character Modifiers**: One value built from a Character's snapshot — skill
  levels plus active-clone implants — that every pricing path (job time, job
  cost, refining yield) takes as input instead of loose bonus percentages. It
  owns which bonus applies to which activity: manufacturing time, reaction
  time, refining yield for ore versus scrap. Does not cover Clone State or
  training speed.
- **Character Not Training**: Fires when a Character's skill queue shows no
  active training, whether from an empty queue or a stalled queue head. The
  _cause_ (Omega/Alpha, subscription) can never be distinguished, since ESI
  does not expose it. Distinct from **Skill Level Complete**, which fires per
  finished queue entry while training continues, and from **Skill Queue
  Ending**, which warns ahead of this state rather than reporting it once
  reached.
- **Character title**: The cosmetic title a Character chooses to show,
  earned through achievements (`character_title_id`, a UUID; names from the
  SDE's `characterTitles`). Not the corporation title the same record carries
  as `corporation_title`, which is a role bundle in one corporation.
- **Charge Picker**: How a **Fitting**'s weapon group chooses its charge,
  ranking the options by this Fitting's own DPS, range and price, or by
  capacitor effect for a cap booster, or explaining crystals for a mining
  laser. **Fighting at** restates every figure at one target distance; quick picks name the most damage, the longest reach and the best value. A faction version that does no more for more ISK is "strictly worse" and names the version that beats it.
  Modules whose charges don't shoot (scripts, paste) keep a plain list.
- **Clock Kind**: Which of the eight sources a **Character Board Item** came
  from. The calendar page's one colour scale names this and nothing else — a
  **nominal** palette, unlike every other colour in the app, which encodes a
  magnitude or a status. Never the only signal: the kind is always also named.
- **Clone State**: Whether a Character is **Alpha** or **Omega**. ESI does
  not expose it (see **Character Not Training**), so the pilot sets it per
  Character. Alpha trains at half the Omega SP rate and cannot train past
  each skill's **Alpha cap** (the SDE's clone-grade skill levels).
- **Coming Up Rail**: The calendar list beside the **Calendar Map**: every
  **Character Board Item** the pilot can read, deadline-ordered, each row
  carrying a countdown. It answers "what happens next", where the map answers
  "what shape is the month". Scoped to one day when a map cell is selected,
  otherwise unbounded ahead.
- **Combined Entry**: Two or more Mining Ledger Entries the pilot billed as
  one obligation — almost always a mining session that ran past midnight UTC,
  which ESI's per-day ledger splits in two. Stored as ordinary Assignments on
  one Payee and one tax %; each day keeps its own ore and value.
- **Community**: A named set of **Members** under one admin, who pool
  chosen parts of their libraries — blueprints first. Joined only by an invite
  link; leaving or being removed deletes that Member's shared data at once.
  Distinct from a **Build Group**, which groups plans, not people. The UI
  says "Communities"; the bare word "Group" stays unused here because it
  already names the Build Group.
- **Join Request**: A Character that followed a **Community**'s invite link while the admin has "Approve new Members" on, and is waiting to be let in. It is not a **Member** and sees and shares nothing until the admin accepts it. A Character the admin mailed an invite to skips it. Distinct from a mail invite, which the admin sends.
- **Community Library**: The **Community** page's Blueprints tab: every blueprint the Community's Members share. This Character's own sharing opens over it in **My sharing**.
- **My sharing**: The slide-out on a **Community** content tab (Blueprints, Fittings, Skill plans) holding what this Character shares there and how: share-all, the shared list with Stop sharing, and Add. Opened from the tab's sharing line. Formerly the tab's Mine view.
  It opens on every **Shared Blueprint** with its **Member**, place, ME / TE
  and runs; its other filters list every blueprint against the **Members** who
  share it, with a "missing from the Community" filter. Those rows are every
  blueprint reachable by any route — market, contract-only or LP store — so a
  gap is a blueprint nobody in the Community holds.
- **Request**: A **Member**'s post in a **Community**'s Requests tab asking for items: one or more lines (item and quantity), an optional location and an optional one-line terms field. Any Member posts one; it carries no price. Its status (Open, Pledged, Part delivered, Delivered) is derived from its **Pledge**s; Closed is set by hand, and Expired follows 30 days after posting or the last Extend (Pledges do not push it); an expired or closed Request is kept 7 more days, then removed. The Community admin may remove any Request. Distinct from a **Join Request**, which asks to enter the Community. A **Standing Request** is the one exception to the 30-day expiry and the no-price rule: it never expires and carries a **Rate**.
- **Pledge**: A **Member**'s note on a **Request** line that they can provide a quantity of it. Non-exclusive: it reserves nothing and Pledges may add up to more than the need. It carries the delivered quantity, marked from the Member's own finished contracts, and an optional typed manual amount; the larger of the two is shown, never the sum. With nothing delivered, a Pledge not written for 14 days is stale: greyed, never released. The admin may remove a Pledge. Not a claim, which would imply a hold.
- **Fleet Payout**: A **Member**'s live loot split in a **Community**'s Payouts tab. The boss (its owner) pastes a fleet list and a loot pile priced by **Appraisal**, picks a split rule (equal, or weighted by a typed number) and an optional hold-back %, and the app writes one **Fleet Share** per pilot. Only the boss must be a Member; other pilots are typed names. Expires 30 days after posting. Distinct from a **Payout**, which is mining-tax ISK a **Collector** sent a **Feeder**. The tab label is "Payouts"; the bare word stays with mining tax.
- **Fleet Share**: One pilot's line on a **Fleet Payout**: whole ISK owed and a paid flag only the boss sets. A **Member** sees only their own; a typed-name pilot's is seen by the boss alone.
- **Standing Request**: A **Request** that is a buyback: a **Member** names a **Rate**, a Trade Hub and what the corp buys (item types or groups such as "all ore"), and it has no quantities and no expiry. It stays open until its owner closes it, and the daily sweep skips it. Members Sell to it for a **Quote**; nobody Pledges on it. Distinct from **Standing (corp)**, a retired Corp Ops figure.
- **Rate**: What a **Standing Request** pays, as a percent of a Trade Hub's buy or sell price, from 1 to 200 in tenths ("90% of Jita buy"). Distinct from an **Owner rate**, which a **Feeder** is owed.
- **Quote**: One price for a Member's pasted pile on a **Standing Request**: each line's hub price at the **Rate**, summed. It is held 14 days on the Member's own Pledge document, with the lines and the hub prices used; a second paste replaces it. A Quote is a price, never a promise to buy.
- **Community Offer**: A **BPC Sourcing** row sourced from a **Shared
  Blueprint** at 0 ISK, named for the **Member** holding it. Distinct from a
  contract **Offer**: nothing is listed or bought. A Shared BPO appears as
  "ask <name> to copy", and never as a source for a reaction formula, which
  cannot be copied.
- **Compare**: A resizable bottom drawer over the **Compare Set**, not a tab —
  it opens beside the order book, since comparing happens _while_ browsing.
  Shows Prices, Trade hubs and Attributes views. Distinct from **Appraisal**'s **Compare
  hubs**, which prices one pasted pile across the five empire trade hubs, and from
  **Fitting Compare**, which never touches the Compare Set.
- **Compare Set**: The short-lived selection of items being priced against each
  other right now — usually variants of one thing. Distinct from the
  **Quickbar**, which is the durable list of items the user returns to across
  sessions. Different lifetimes, so two lists, not one.
- **Completion Risk**: a condition that could stop a courier haul being delivered after its collateral is already put up — a delivery point that is a player structure, or an end no stargate route reaches. Stated as a condition and its consequence, never as a verdict about whether this player can complete it. A nullsec end is _not_ a completion risk; it is only noted informationally.
- **Contract Search**: The **Contracts** page's Item search and Courier tabs.
  Search over every for-sale line of every public item_exchange/auction
  contract in New Eden, by item name, region, price, quantity and contract
  type. Reads the same **Public Contract Offers snapshot** as **BPC
  Sourcing**, but whole rather than narrowed to blueprint copies, and only
  public-contract data. Shows one of two corpora per tab — **Items**, or
  **Courier**, the **Public Courier Contracts snapshot** — because a haul has
  no item, quantity or price and an offer has no route, reward or collateral.
  Distinct from the History tab, which is one Character's own contracts.
- **Corp Access**: The single resolved state for the active Character,
  composing Corp Capability with granted scopes: `unknown` (not resolved yet),
  `none` (no Corp Role), `roles-without-grant` (holds a role, corp scopes not
  granted), `ready` (holds a role and its scopes — or every scope but an
  additive Corp Capability's, which then stays off without hiding the rest;
  see `docs/context/decisions/20261018-141225-*`).
- **Corp Capability**: What a Character can actually _see_ — wallet,
  structures, members, industry — derived from their Corp Roles. The unit
  every consumer branches on; none compares role strings itself.
- **SRP Claim**: A pilot's request, filed against one of their own killmails,
  that their corporation's ship replacement program (SRP) repay the loss. One
  per killmail, filed within 30 days of the loss by the Character that died,
  who must have been in the corporation at the time. States: Pending,
  Approved, Paid, Rejected. Distinct from a **Pledge**, which holds nothing,
  and from a **Group Stock Claim**, which is a hold on stock.
- **Reimbursement**: The ISK a corporation repays on an approved **SRP Claim**,
  worked out from the corp's **Hull Rule** and **Price Percent**s, which an
  officer may override with a reason. The corporation sends it in game. Distinct
  from a **Payout**, which is mining-tax ISK a **Collector** sent a **Feeder**.
- **Hull Rule**: A corporation's setting for one hull or hull class under SRP:
  **Pay** (a fixed ISK amount, or the corp's percent of value), **Not covered**
  (a pilot cannot file it), or **Officer decides**. A hull with no Hull Rule
  follows the corp's percent chain when one is set up; with none set up it has
  no computed amount and the officer types it.
- **Doctrine Fit**: A corporation's saved fit that SRP checks a claim's lost
  ship against, kept as the corp's own copy. A **Hull Rule** may list several;
  a claim must match one. Distinct from a **Fitting**, which is a pilot's own
  and private.
- **Off doctrine**: The flag on an **SRP Claim** whose lost ship matches none
  of its hull's **Doctrine Fit**s. The officer still decides the claim.
- **Corp Board**: `/corp`, a **Widget board** of corp **Widgets** the pilot
  chooses, sizes, orders, renames and removes, on the same engine as the
  Overview. Replaces the fixed Corp Ops Board (Standing, Deadline Strip, Kind
  Cards, Offline services, Money, People). Each kind is gated on its own Corp
  Capability: hidden, never locked. Formerly **Corp overview**; renamed so its
  name stands alone in the Corporation rail group (#4675).
- **Corp Board layout**: The ordered list of **Widgets** on the **Corp Board**. One per pilot, not per corporation or Character, synced as
  `sync.corpOverviewLayout` (key unchanged). Formerly **Corp overview layout**. Until the pilot edits it the page draws the full
  default and never saves it; each Character sees the widgets its Corp
  Capabilities open. No Role chooser.
- **Corp Role**: An in-game corporation role (Director, Accountant,
  Station_Manager, Factory_Manager, ...) held by a Character. A second,
  invisible access axis alongside granted scopes: CCP role-gates the
  corporation endpoints, so a Character can grant a corp scope and still be
  refused. Director implicitly holds every other role in game, and ESI does
  **not** expand that.
- **Automatic sync**: A **Corp Tax Book** setting: every 6 hours our server syncs and settles the book with a narrow-scope token one book editor (the holder) gave for their own Character, so the book stays current without an officer visiting. One holder per corporation. It never issues a **Statement** or sends mail. If the holder loses the role or the token dies it stops, and the book says why (ADR 0025).
- **Corp Tax Book**: A corporation's shared record of moon mining tax: its rates, start date, trade hub and Ore Form, every **Observed Mining Entry**, **Extraction**, **Tax Payment**, dismissal and sent **Statement**, and who did each. Kept for the corporation, not for one officer, so every officer sees the same book; a miner sees only their own lines. Mining before its start date is kept as history and owes nothing. Distinct from the personal Moon Mining Tax ledger, which a pilot keeps for themselves against a **Payee**.
- **Cost Index**: A solar system's current manufacturing activity level
  (read live from ESI). Higher activity in a system drives its Job Fee up;
  distinct from EIV, which prices the materials rather than the system.
  ESI lists none for a wormhole (J-Space) system, so the pilot types the figure
  they read in the in-game Industry window; it is remembered per facility.
- **Current System**: The solar system a **Jump Range** measures from. The
  active Character's ESI location by default; the pilot can pick another
  system when ESI is stale or silent. A pick is device-local, per Character,
  and clears itself once ESI reports the pilot has moved.
- **Daily Range**: One day's lowest and highest _executed_ price for an item in
  a Region, from ESI's market history. Drawn on **Price History** as a shaded
  band behind the average line, labelled "Traded range" in the chart. Distinct from the **Order Book**'s spread,
  which is what is being asked for right now; this is what was actually paid.
- **Craft Scope**: Which **Industry Activity** types an **Auto Build** pass
  is allowed to mark buildable — a multi-select. Only Manufacturing is
  functional today; Reactions and Planetary (PI) are reserved. A material
  outside the enabled scope is priced as bought, but the pass still looks into
  that material's own inputs for further in-scope materials. See **Include
  Reactions** and **Reaction Location**.
- **CSPA**: CONCORD Spam Prevention Act — a per-character charge (in ISK) a
  pilot can set to require from anyone outside their contact list who mails
  them. This app does not read, display, or pay it; a rejected send surfaces
  ESI's own error text and points the pilot at the in-game client.
- **Damage Profile**: The mix of EM, Thermal, Kinetic and Explosive damage a **Fitting**'s tank is measured against — uniform, one pure type, a common NPC faction's average, or one the pilot defines. Changes EHP, never raw HP or resists, except that a running Reactive Armor Hardener adapts its own resists to it. Distinct from a **Target Profile**, which is about what the Fitting shoots at.
- **Danger banner**: The red strip under the Overview's sub-nav while an
  unacknowledged danger **Alert** exists (a structure under attack, a Corp
  kick). Acknowledging it dismisses the whole danger type. Nothing else raises
  it.
- **War banner**: The red strip under the Overview's and the Corp Board's
  header while the pilot's corporation, or its alliance, has a war declared on
  it that is running or not yet started. Pressing it opens the war in a modal.
  Unlike the **Danger banner** it is not an **Alert** and is not acknowledged: it
  ends when the war does. A war the corporation declared itself never shows.
- **Dark**: A member with no login for the corp's inactivity span or more —
  the pilot's own setting, defaulting to 30 days. A member who joined and has
  never logged in is counted from the day they joined, not excluded.
- **Data Age**: Timestamp shown on every API-derived view; how old the cached data is. Refresh happens on app open + manual button only.
- **Data Owner** (retired): Whose rows a page's table showed — `personal` or
  `corporation` — picked by a Personal / Corporation switch. No page has one
  any more: corp data lives only on corp routes.
- **Depth Price**: A Build Plan material's unit price when its need is large against what its **Trade Hub** lists (at least 1% of the units for sale): the average paid walking the hub station's sell orders, cheapest first, until the need is filled, instead of the lowest sell. Sell **Material Price Basis** only, on the plan and Build Group pages only; the product is never walked. A Build Group walks its members' summed need.
- **Detected Accelerator** — a cerebral accelerator inferred from a base sheet
  that is over budget, by the size of the excess. Prefilled into the Booster
  control; not a separate mechanism.
- **Day Ticker**: The **Calendar Map** on a phone — one horizontally scrolled
  row of day columns, each with its weekday, date, a count and a bar segmented
  by **Clock Kind**, in place of a grid that would take the width the **Coming
  Up Rail** needs.
- **Deadline Strip**: The bar per calendar day (on the Time format clock: local, or UTC under EVE time) in the **Corp Board**'s
  Due soon **Widget**'s Chart **View**, each counting the Corp Board Items
  falling due on it and coloured by the worst Board Severity landing there.
  Exists so that several calm-looking lists cannot hide one bad day. It was a
  fixed panel on the Corp Ops Board before that became a widget grid.
- **Defense Choice**: **Improve**'s Keep as is / Shield / Armor setting. Shield or Armor frees only the other side's tank modules and tank rigs, and for tank goals both sides' best results are shown side by side. Never stored on the **Fitting**. Distinct from a **Damage Profile**, which is what shoots at the tank.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, Production Runs, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **Effective Skill Level**: The level this character can use right now: the
  lower of the trained level and the active level, each corrected for what the
  training queue has just finished. Trained alone overstates an Alpha-capped
  or lapsed-Omega clone; active alone understates a level just finished.
  The skill-gate marker deliberately stays on the raw active level.
  Used for PI, industry job time and fees, job slots and clone jump cooldown.
- **EIV (Estimated Item Value)**: The SCC's reference price for the materials
  a manufacturing job consumes, at ME0 quantities. Used only to size the
  **Job Fee** — it is not what the materials actually cost to buy.
- **Endpoint Space**: which of the four bands — highsec, lowsec, nullsec, wormhole — one end of a courier haul sits in. Describes an _endpoint_, never the route between two of them: a highsec pickup and a highsec delivery can still route through lowsec. An end that cannot be placed has no band at all.
- **Error Budget**: ESI's allowance of 100 non-2xx/3xx responses per 60
  seconds, counted **globally across every route** for the whole client — not
  per endpoint and not per Character. Spend it and ESI answers 420 to
  everything until the window rolls over. Distinct from the **rate** limit
  (429), which is about request volume rather than errors.
- **EVE Notification**: The single Notification Event covering everything
  ESI's character notifications endpoint pushes — a different source from
  every other Notification Event, which are synthesized by diffing other ESI
  endpoints. ESI's notification `type` list is open-ended, so each raw type
  gets its own independent opt-out underneath, discovered as it fires rather
  than enumerated from a closed list.
- **Event Entry**: The one declaration of a **Notification Event**'s
  behaviour: which poll domain's snapshot it reads, its diff, its live copy,
  whether it projects as a Scheduled Push, and the threshold fields it owns.
  Distinct from the event's catalog row (id, label, scope, default channels).
- **Exportable Rate**: What one PI colony has going spare an hour, by product
  — what its own factories make, less its **Local Draw**. This, never gross
  production, is what a **Colony Network** plan may spend. A product a colony
  wholly consumes is absent rather than zero.
- **Extraction**: One moon drill cycle at a corporation's refinery, in its in-game sense: Extracting until the chunk arrives (Ready), Fractured when the laser is fired or the chunk breaks on its own, and Expired once the asteroid field is assumed gone. Carries the chunk's estimated ore and ISK when its make-up is known.
- **Facility Preset**: Industry location model: NPC station or player structure type + rig level. Manufacturing structures and reaction structures (no NPC-station equivalent) each use their own **Industry Activity**'s rig bonuses and security multipliers; the two never mix on one facility. Drives ME/time/cost bonuses in a Build Plan.
- **Fit Import**: Pasting EFT fit text into Industry to get a **Build Group**
  holding one **Build Plan** per buildable item in the fit. Quantities count
  the way a fit expresses them, and items that cannot be built (faction, named
  and meta modules have no blueprint) are reported rather than dropped
  silently. New plans take ME and TE from the assumed-ME and assumed-TE
  preferences rather than 0. Distinct from the Skill Planner's clipboard
  import, which reads the text for the skills it demands, and from
  **Appraisal**, which reads it for what the loadout costs to buy.
- **Fitting**: One ship hull plus everything loaded into it — modules, charges, drones, fighters, cargo — under a name. Its numbers are worked out for the active Character's skills, so switching Character re-states the same Fitting for the new pilot. The implants and combat boosters in play are the set the Fitting itself carries when it carries one, and that Character's own clone otherwise. The exception is a **Fitting Share Code** or **Share Link** opened with nobody logged in, which is stated at every skill level V. Distinct from an **In-game Fitting**, which is a Fitting as the game itself stores it on a Character, and from **Fit Import**, which turns fit text into Build Plans.
- **Fleet boosts**: The Fittings stats section for what a command ship gives its fleet — each running command or mining foreman burst and an industrial core's compression. Only shown on a fit that has one. Distinct from **Support out**, which is what a fit's modules do to another ship (remote repair, webs, ewar), and from **Projected effects**, which is what other ships do to this one.
- **Fully Mined**: A flag an officer sets on an **Extraction** once its chunk is mined out, any time after it pops (who and when kept; ADR 0032). Flagged, the ore the ledger never shows is the **Residue**; unflagged, the loss shown is Residue plus ore never mined, and is labelled so.
- **Read Model**: A small document the server builds from the raw **Corp Tax Book** rows so a screen reads one doc, not thousands of rows (ADR 0032). Never the source of truth: it must always equal a full recompute from the rows, **Statements** and payments.
- **Requested rate**: The **Owner rate** a **Feeder** asks for, which stands only until the **Collector** sets an **Agreed rate**. Player-facing: "you asked for 6%".
- **Residue**: Ore that came off a moon chunk but was never delivered (strip-miner waste, which EVE turns into space dust). The ledger records only delivered ore, so Residue never appears in it; per moon and ore it is the chunk total minus the ledger's mined sum, shown as Residue only once the **Extraction** is **Fully Mined**. Distinct from the combined loss (Residue plus ore never mined) shown while a moon is not flagged **Fully Mined**.
- **Settled otherwise**: A **Feeder** mode in which it is compensated another way, such as fuel or rock access: nothing is due and no balance is kept. Player-facing: "Settled otherwise".
- **Skill Comparison**: The drawer over Skills › Trained that sets several **Character**s' trained skills against one **Baseline Character**, skill by skill, with saved selections. Opened by "Compare with…"; not a page or a tab. Distinct from Market **Compare**, Appraisal's **Compare hubs**, **Fitting Compare** and **Build Plan Compare**: it shares nothing with them.
- **Baseline Character**: The **Character** in a **Skill Comparison** every other column is measured against (`+2`, `−3`, `missing`). Defaults to the active Character; any selected Character can be set as it.
- **Fitting Compare**: The Ships section's page showing up to three **Fitting**s side by side, their stats worked out for the active Character's skills. The whole comparison lives in the URL as **Fitting Share Code**s. Distinct from Market **Compare** / **Compare Set**, Appraisal's **Compare hubs**, and **Build Plan Compare**: it shares nothing with them.
- **Fitting Share Code**: A **Fitting** compressed into its URL: hull,
  modules and their state, charges, drones, cargo, any implant set, and each
  **Mutated module**'s base, mutaplasmid and **Roll**s.
  Permanent and stateless; nothing is stored. Opened with nobody logged in, it
  shows the Fitting at every skill level V. Distinct from a **Share Link**,
  the short, expiring kind.
- **Foreground Poller**: Client-side interval that checks each enabled
  Notification Event's underlying ESI data while the app is open, including
  while it is hidden, for as long as the browser keeps the page running.
  The fast path for an open app, not the sole guarantee of delivery —
  Scheduled Push covers timestamped events for a closed or backgrounded app.
  It suppresses its own browser notification for an occurrence the
  Notification Feed already shows as delivered.
- **Freshness Window**: how long a cached row is served without asking ESI again. Ten minutes for a Character's own data, a day for game constants. Distinct from **Data Age**, which reports how old the shown data is; the window decides whether to go and get newer.
- **Gallery**: A **Widget board**'s "Add a widget" drawer: that board's
  **Widget Kinds** with search and category chips. A kind may be added more
  than once. On the **Corp Board** it never offers a kind whose Corp
  Capability the Character lacks. "Browse all" widens the same drawer into a
  category rail and a grid of previews, with Featured and "Not on your board".
- **Gank Chokepoint**: one of the named systems haulers are most often killed in — Uedama, Sivala, Aufay, Balle, Tama, Rancer, Ahbazon. A property of _traffic_, not of security status. An explicit list rather than a derived rule. States where a haul goes, never that anything will happen to the hauler there.
- **Goal Plan**: the PI Plan tab's answer to "here are my colonies and the products I want per day — what does each colony do?". Goals (products at a units/day rate) are expanded into demand, and a greedy solver assigns each enabled colony a role — extract and refine P0 to P1, host the P2+ factories, or sit idle. Measured against the **Baseline**: every colony selling the best P1 it can make by itself; the plan's **Lift** is its net ISK minus the Baseline. What it cannot cover is a **Shortfall**, either a **Type gap** (no enabled colony's planet type yields that P0) or a **Budget gap** (colonies that could yield it are full). Its output is a change list against what each colony runs today, never a fresh layout.
- **Chain estimate**: a P3 or P4's ISK a day as a whole multi-planet chain: the Goal Plan's solver run on new planets the pilot would add. Always labelled "multi-planet, needs hauling" and an estimate, and never ranked against one-planet figures, except in Plan's opt-in **Bigger chain** section.
- **Going Rate**: the median reward per m³ per jump across every outstanding public courier contract — the market's own price for hauling, computed from the snapshot. A haul's pay is shown as a multiple of it, and one at or above 8x is flagged. States a figure, never a verdict. Unavailable where a haul has no distance or stated volume, or the corpus is too small.
- **Group Owned Overlay**: A **Build Group**'s own "I own this" ledger — manual
  entry or ESI-asset auto-detection with a location scope, scoped to the
  group's aggregate material list. Display-only: nets against the **Group
  Rollup** total to show what's still needed. The group total ignores each
  member's own owned-stock entry; group-level ownership is the sole deduction
  it applies.
- **Group Rollup**: What a **Build Group** shows when opened instead of one of its members: every member's materials merged by type, and the costs summed. A forward estimate only, never what a fit actually cost. A member's own page keeps netting its own owned stock and can disagree with the group total. Members on different trade hubs still total in ISK, and the multibuy paste is split into one list per hub.
- **Growth Collector**: On a Mining Ledger Entry covered by two or more
  Assignments (a quantity split), the one Assignment that receives any ore
  ESI reports for that day _after_ the split. A sole Assignment always
  collects. Nothing on a split day is ever doubly claimed. A paid collector
  takes nothing (paid stays paid, ADR 0024): that ore stays unassigned until
  the pilot assigns it, and the new Assignment then takes over collecting.
- **Global Market Region**: A region that exists only to hold one item's
  cluster-wide market. PLEX is the only one today: its orders live in a region
  of their own, yet each order still points at an ordinary station. So a global
  market is a routing quirk, not a separate kind of place.
- **Gross Profit** / **Net Profit**: Sale Profitability before vs after sales
  tax and broker fee are subtracted. A Build Plan's own page shows Net only.
  **Break-even Price** — the sell price
  at which profit is exactly zero — is always a Net figure, since it answers
  "at what price do I stop losing ISK," which only holds net of the fees an
  actual sale pays.
- **Guardrail**: A stat an **Improve** run may not let fall past a limit while it chases its **Improve Goal**, such as "EHP stays above 90%". Shown as one plain line; not editable. Swaps that break one are listed as rejected, with the reason.
- **Guest**: In a **Corp Tax Book**, a character who mined at the corporation's refineries but whose corporation at the time was not that one. Billed like a corp member, under the Guest default rate when no more specific rate applies, and reached only by mail and the verify link, never by logging in. One who was a corp member and left is shown as "Left corp" instead.
- **Haul between planets**: The PI setting "I will haul between my planets" (`piSettings.haulBetweenPlanets`), off by default. Turning it on is the pilot's opt-in to **Bigger chain** recommendations on Plan; it changes nothing else.
- **High-Tech Production Plant**: The planetary pin that makes a P3 from two P2s. The tier above an **Advanced Industry Facility**.
- **Hub Station Price**: The highest buy order and the lowest sell order standing _at one Trade Hub station_ (Jita 4-4, not The Forge) at the end of one UTC day, for a mining type: ore, ice, gas, minerals. The hub station's day in the **Open Prices** (`open-prices/<typeId>.json` in R2), read per type. Only orders placed in the station count; a buy order's range is ignored. What Mining Tax, the Corp Tax Book and the Mining Yield Overview price a past day from (the tax ledgers' `saved` tier).
- **Implant Finder**: The "Find by goal" tab of a **Fitting**'s Implants & boosters window: the pilot picks what they want better (CPU, powergrid, missiles, speed) and sees every implant and combat booster that moves it on that Fitting, with where to get each. Distinct from **What-If Implants**, which are a Skill Plan's assumed attribute bonuses.
- **Improve**: The Fittings action (menu entry and panel titled "Improve Fit"), in the ⋮ More actions menu, that searches swaps and additions for a **Fitting** toward one **Improve Goal** and lists them as ticked suggestions: Train, Implants, No downside, Trade-offs. Every figure is a whole-fit recalculation under the Fitting's own conditions. Applying makes one unsaved edit. Distinct from **Make it fit**, which only brings an over-budget Fitting back under CPU, powergrid or calibration, and from **What to train**, which only changes skills.
- **Improve Goal**: What an **Improve** run tries to raise or lower: Best overall, More damage, Tankier, Faster, Longer reach, Cheaper, and role goals such as Mine more, Carry more, Repair more, Hold tighter, Explore better. Each is a score plus **Guardrails**, and only goals the Fitting can score are offered. Distinct from a **Goal Plan** (PI) and from the Implant Finder's "Find by goal".
- **Improve Reach**: How far **Improve** may change a fitted module: Upgrade (a variation of itself, the default), Rebalance (a different module doing the same job) or Rework (any module for that rack, never the last one doing a job the goal does not score). An empty slot is always free. Player-facing: "Reach".
- **Improve Job**: What the pilot flies the **Fitting** for, set once on **Improve**: PvE (the default), PvP or Explore (with a space, Dangerous by default or Safe). It frees module jobs the search may drop (PvE: scram and web), weights Best overall's stats, and caps how much a **Makeover** may give up of damage, speed, EHP or sustained tank. Explore Dangerous also keeps tank modules in place on every swap. Player-facing: "Job".
- **Improve Budget**: The one money setting in **Improve**'s settings: the total fit price may not pass it (**Improve** is always a shopping list; there is no mode for a ship the pilot already owns). Typed as an ISK amount (`100k`, `1M`, `1B` or digits) and grouped with the pilot's number-format separator as they type. Remembered on this device; suggestions over it are listed as rejected.
- **Makeover**: An **Improve** result made of several linked swaps across the whole **Fitting**, found by applying the best one-slot change and searching again from the result, so it can split two copies of a module into two different modules or pair a change with one that frees the CPU or powergrid it needs. Shown as one group whose figures are one whole-fit recalculation, and only when it beats the best single swap. Changes the fit's shape (Tech II, else Tech I, per module group); faction and officer steps stay single swaps. Distinct from a whole-tank conversion, which only follows the Defense choice. Player-facing name chosen with the #5548 mockups.
- **In-game Fitting**: A **Fitting** as the game stores it on one Character, read and written through ESI and never copied into the app's own storage. Carries less than a Fitting can: no module offline/overheat state, no charge-to-module binding, no implants. Corporation fittings are not In-game Fittings; they reach the app only as an exported file that is **Load**ed.
- **Include Reactions**: A manufacturing **Build Plan**'s own toggle, off by default, for whether a reaction-produced sub-input in its material tree can be built recursively rather than only marked advisory. Not offered on a plan whose own **Industry Activity** is already `reaction`.
- **Industry Activity**: Which job a **Build Plan** runs, `'manufacturing'` or `'reaction'`. Derived from the picked blueprint or reaction formula, never stored on the plan. A facility hosts one activity, never both.
- **Install Prompt**: A one-time, in-app call-to-action to install Neocom Desk as a home-screen app, shown on phones and tablets only. Shown once ever per device: accepting or dismissing it suppresses it permanently.
- **Item Detail**: The modal view of one item's own properties: fitting cost, volume, bonuses, description. Read from the baked SDE (cached ESI for a type the build doesn't carry), so it opens offline once that data is cached (first use or the background warm); only its market order book needs the network. Its **Made from** section shows the base recipe (inputs, output and time per run) of an item a blueprint or reaction makes. Its **Used in** section lists the products whose blueprint or reaction consumes the item. Both collapse: Made from opens by default, Used in opens only at 10 or fewer rows.
- **Item Actions**: What an item menu can do on its page: add to the Quickbar, find the blueprint behind Build Plan, and open the page's one **Item Detail** (Show info). One set per page, shared by every item menu on it.
- **ISK/jump**: What a public courier haul pays per stargate jump of the trip it asks for (reward divided by jump count), and the figure the Courier board ranks on. The count follows the reader's own **Route Preference**. A haul with an unplaced end, or two ends no stargate connects, has no rate, never zero.
- **ISK/m³**: What a public courier haul pays per cubic metre of cargo (reward divided by volume), the secondary rate beside **ISK/jump**. A haul stating no volume has none, never an infinite one. **Hauling Opportunities** carries the same rate for a trade run: profit per unit over the unit's hauled volume.
- **ISK/run**: What a listed blueprint copy costs per use: the contract's asking price divided by every run that ask buys (quantity as well as runs). A **BPC Sourcing** column. A row with no asking price, or a copy stating zero runs, has none, never an infinite rate.
- **Reverse Lane**: The way home from a public courier haul: the same region pair, run backwards, shown on the haul detail as a count that links to the swapped search. Paired region to region, not station to station. A haul with an end nothing local places has no lane to look up, never a count of zero.
- **Roll**: The value one attribute of a **Mutated module** came out at:
  the base module's own value times a uniform pick within that attribute's
  **Roll range**. Stated as the absolute attribute value, as the game shows
  it. A roll is good or bad in the attribute's own direction — a higher
  activation cost is a worse roll.
- **Roll range**: The span a **Mutaplasmid** lets one attribute roll in, as
  multipliers of the base module's value (0.8 to 1.3 of its activation cost,
  say).
- **Route Safety**: Travel's view of a stargate route: every system on it, in order, with its security, region, last-hour jumps and ship, pod and NPC kills, zKillboard's last-hour player kills, and a mark on any **Gank Chokepoint**. States conditions, never a verdict: no system or route is called safe or not. A figure that could not be supplied is unknown, never zero.
- **Route strip**: Route Safety's one-glance picture of a route: one cell per system, coloured by security, with each **Gank Chokepoint** and each system with recent kills marked.
- **Quiet stretch**: A run of two or more consecutive middle systems on a route or **Leg** that Route Safety folds into one row: no ship, pod or player kills in the last hour, no **Gank Chokepoint**, and no J-space. A figure still loading or unavailable never counts as zero. Named for the figures, never a verdict on the systems.
- **Stop**: One of up to ten systems a Route Safety trip visits after its start (the **Current System** unless the link names another), kept in the order typed. Optimize stop order may fly them in a cheaper order; the typed order stays as written. A stop may name a **station** (an NPC station, or a structure the pilot can see) in its system: it is a label on the stop — the gate route is the system's, the leg list shows the station name, and there is no docking or undock time. The `stops` link carries it as `system:station`.
- **Leg**: One route of a trip, by stargate (and, when enabled, through Thera / Turnur holes or over **Ansiblex**), from its start or a **Stop** to the next stop (with Return to start, the last stop home). Route Safety lists a trip leg by leg.
- **Haul route**: The ordered **Legs** a pilot flies to carry a Move plan to its destination: out to a pickup, on to the next while the hold has room, back to the destination, and again for what is left. Planned by volume under the **Jump Basis**, from each Character's **Current System**; a pickup is visited once per trip its volume needs, and visits count against the ten-**Stop** cap while returns do not. Whatever the cap leaves out is listed, never dropped. The **active haul** is its local snapshot, saved when the pilot clicks Show my route; recomputing the Move plan never changes it. Each Leg has a stable id, its index in the plan.
- **Max ISK per haul**: A saved limit on what any one haul of a **Move plan** may be worth. A haul is full when its volume or its value reaches it, so the plan splits into more hauls and the **Haul route** makes more trips. Only cargo counts, valued at the default Trade Hub's sell price; a packed ship is cargo, a ship flown out is not. A unit worth more than the limit is left behind ("over your ISK limit"), apart from stacks that do not fit the hauler. Empty means no limit.
- **Hole jump**: One jump of a Route Safety route through an open Thera or Turnur wormhole EVE-Scout lists, between the hole's exit system and its hub.
- **Ansiblex**: An alliance-built jump gate between two nullsec systems, named "SYS1 » SYS2 - …" in game. Route Safety may route over the ones in this device's list, each as one jump.
- **Way to fly**: One way a **Leg** can be flown, listed beside its rows: gates only, via Thera / Turnur, via Ansiblex, the planner's pick when it differs, and a **Pinned way**. Each states its facts side by side, never ranked.
- **Pinned way**: The **Way to fly** a pilot chose for one **Leg** with "Use for this leg", kept in the link. A pin that cannot be flown is reported on the leg, and the planner's pick flies it.
- **Pilot Lookup**: Travel's view of one pilot found by name: public ESI identity, zKillboard's all-time figures, and their newest kills and losses. Carries a **Threat** badge, otherwise only numbers; no pilot is called hostile or safe. Also groups a pasted or typed **Local list** by what each pilot means to you, or by alliance and corporation ("Group by", remembered per device).
- **Threat**: A pilot's colour-coded verdict badge (**Dangerous**, **Active**, **Low**, **Quiet**; shown as one short word, read in full as Low threat and "No recent kills"), read from their kills in the last 90 days and zKillboard's all-time ratios. Kills decide the level; a recent loss only keeps a pilot with no recent kill from reading Quiet. Says how threatening a pilot looks, never that one is safe: there is no green level. Read against where you are and who is in Local, it can move one level (a small arrow says so): lower for a pilot who has never killed in the kind of space you are in, or who kills in groups and has none of their own here; higher for a group killer with several of their own here.
- **Avoided Systems**: The solar systems a pilot keeps off their routes, entered by hand because ESI cannot read the game client's own autopilot avoidance list. Part of **Travel Settings**; not a **Route Preference**.
- **Route Preference**: Which trip a distance describes: the game's Prefer shorter, Prefer safer or Prefer less secure, one vocabulary app-wide. The pilot's default lives in **Travel Settings**; a page with its own picker opens on it and overrides it for that view only.
- **Travel Settings**: The in-game autopilot's route options, for planning: the default **Route Preference**, the security penalty, and what to avoid (the **Avoided Systems**, EDENCOM and Triglavian minor-victory systems, and systems over a pod-kill count in ESI's last-hour report).
- **Job Fee**: The ISK ESI charges to install a manufacturing job, separate from material cost. Sized from EIV, the system's **Cost Index**, a fixed SCC surcharge, and the facility's tax.
- **Journal Party**: The other side of a wallet journal line: the player, corporation or NPC (CONCORD, Secure Commerce Commission) that paid or was paid, never the user's own Character. A transfer between the user's own Characters has none; it is netted away. Distinct from a corp journal's **player**, the member who made the line.
- **Jump Basis**: The one set of rules every jump count in the app is worked out under: the Travel Settings plus Route Safety's saved Thera / Turnur hole and Ansiblex jump-bridge settings. It is how Assets, Market, BPC Sourcing, Contract Search and Courier agree with the route Route Safety draws.
- **Jump Range**: The distance filter on Market Browser, Contract Search's Items and **BPC Sourcing**: Any, the **Current System** only, or within a set number of stargate jumps of it. Counted on the local stargate graph under the **Jump Basis**. A row the app cannot place (a player structure) drops out once a range is set.
- **Kind Card**: Retired. One panel per kind of Corp Board Item on the old Corp Ops Board; the **Corp Board** now draws those kinds as **Widgets**.
- **Load**: Bringing a **Fitting** into the Ships section's Fittings tab from any outside source — EFT text, a DNA or in-game chat link, an exported fittings file, an **In-game Fitting**, a share link, another site's fit link, a killmail, a **Popular fit**, or an **EVE Workbench fit**. Loading stores nothing; only an explicit save does. Distinct from **Fit Import**, which turns fit text into Build Plans.
- **Local Draw**: What a PI colony's own factories take an hour off the products that colony makes, by input typeID. The subtrahend of the **Exportable Rate**.
- **Location Mode**: The Market Browser's one location control, in one of two mutually exclusive modes: **Region** (every station in that region) or **Trade Hub** (that hub's region, filtered to the hub's station). Region mode can also be **All regions**: the selected item's order book merged from every Market Region.
- **Market Browser**: General item price lookup page (any item, prices at chosen Trade Hub). Separate from a character's own **Market Orders** (open + history).
- **Market Group**: A node in EVE's own market browse tree (`Ships → Frigates → Standard Frigates`). Distinct from an item's **Group**, a taxonomy that is not the market's. Only some nodes hold items; the rest are branches.
- **Market-Wide Build Opportunities**: The Opportunities tab's second panel: ranks manufacturable products across the whole SDE by ISK/hour, not limited to blueprints the chosen Characters hold the way **Build Opportunities** is, but only products whose blueprint is obtainable (owned by any account Character, or buyable on the NPC market, a public contract, or an LP store). Reactions and PI excluded. Opt-in. Each row is priced at the ME/TE a Build Plan opened from it starts at (the owned copy's, else the assumed ME/TE), by the same pricing a Build Plan uses (its Blueprint Acquisition included), so a plan's figures match the row's at the Character's defaults; a row whose blueprint nothing prices is left out. The last scan is kept until its prices expire or an input changes, and its filters live in the URL; selecting a row opens a real Build Plan.
- **LP Store**: An NPC corporation's loyalty-point store: offers that trade LP earned with that corporation (plus ISK and sometimes items) for goods. Every NPC corporation that runs one is searchable offline, not only those a Character already holds LP with.
- **LP Value**: What one loyalty point is counted as worth, in ISK per LP, when an LP Store pick is priced as ISK cost + LP cost × LP Value. Defaults to each corporation's own market value; the pilot can type one figure instead, which applies to every store. LP no source prices is left unpriced, never counted free — except a blueprint's: with no LP Value of the pilot's own, a blueprint redeemed from an LP Store counts its LP as already earned and costs only its ISK and turn-ins (scope decision 20261024-203120). Distinct from one offer's ISK/LP, what that offer earns per LP spent.
- **CONCORD LP Exchange**: A station service converting CONCORD LP held in a Character wallet into a corporation's LP, at a per-corporation rate. The LP Store can value offers in ISK per CONCORD LP; a corporation with no exchange shows none. _Avoid_: LP conversion.
- **Liquidity Floor**: The minimum sell-order ISK a product must carry at the hub to be considered at all in **Market-Wide Build Opportunities**: a hard cutoff applied before any material pricing runs.
- **Market Order Filled**: Fires when any of a Character's market orders completes — a sell order being bought out, or a buy order being delivered. Both directions count as one event type, not two.
- **Made Payment**: ISK (or ore) the pilot has already sent, gathered so the Moon Mining Tax ledger can settle up backwards: "I already paid this; what did it cover?" Two sources only: an outgoing wallet-journal entry of a hand-sent kind, and an `item_exchange` contract the pilot issued at no price (payment in kind, cargo never priced). Offered only when it has a plausible target.
- **Market Region**: A region whose market ESI lists live orders in, probed at each SDE bake: most of known space, plus whichever wormhole regions currently have public player-structure markets (these come and go between bakes). Abyssal and the unreachable dev regions never do; having an NPC station is not the test.
- **Material Price Basis**: Which side of a Build Plan's **Trade Hub** order book its materials are costed at: sell orders (buy now) or buy orders (place orders and wait). Stored per plan; absent reads as sell. Materials only: the product is always valued at the hub's lowest sell. A material the chosen side cannot price is unpriceable, never re-quoted at the other side.
- **Manual Ore Tag**: A pilot's hand-classification of an ore type the SDE-derived allowlists don't recognise: "Tag as moon ore" (group it into **Mining Ledger Entries**) or "Ignore" (treat it as ordinary ore/ice). Device-local and never synced; a stop-gap until the next SDE build. Reversible.
- **Max price per item**: A Hauling filter: the highest origin unit price (the Buy column) worth buying at. Hides rows whose cheapest origin offer is dearer, and stops the **Trip Plan** buying any origin offer above it — in the table and in the fill alike. Blank is no limit.
- **Max spend**: A Hauling filter: the **Trip Plan**'s ISK budget for the whole trip. Limits what the plan buys; hides no rows. Blank is no limit.
- **Member**: One Character that has joined a **Community**, never a person:
  an account's alts join separately and appear separately. EVE exposes no
  account identity (see **Account**), so none is invented here.
- **Miner**: In a **Corp Tax Book**, one or more characters billed together as one: payments and balance are kept at this level, and the Miner's main gets the mail. The default is one Miner per character; characters of one app account in the same corporation group automatically. Always "corp member" in prose, never **Member**, which is a **Community** term.
- **Mining Ledger Entry**: One row of the Moon Mining Tax ledger, derived (not stored) from ESI's personal mining ledger: every moon-goo row for one (character, EVE/UTC date, solar system), summed per ore type.
- **Multi-Type Contract**: A public contract whose for-sale lines span more than one distinct item type. Its price is a real, indivisible ask for the whole contract, never attributed to any single line as that item's own price.
- **Mutaplasmid**: The consumable that turns one base module or drone into a
  **Mutated module**, irreversibly. Each applies to a fixed set of bases, makes
  one **Abyssal type**, and gives each attribute it touches a **Roll range**.
  Its strain (Decayed, Gravid, Unstable, their Glorified forms, Exigent,
  Radical) sets how wide those ranges are.
- **Mutated module**: One module or drone a **Mutaplasmid** was applied to:
  an **Abyssal type** with its own base, mutaplasmid and **Roll**s. Each is a
  unique item, never a stack. Its rolls are known only from the game itself
  (ESI, by item id), a Pyfa EFT block or a **Fitting Share Code**; a
  killmail, an **In-game Fitting** or a bare EFT line names the abyssal type
  alone, and the app then states the module as unknown rather than guessing
  its base.
- **Need Book**: The marker on a skill in the Trained board that the Character's ESI skills do not list at all, so its skill book is still to buy and inject. Not shown for a skill ESI lists at level 0 (injected, untrained). Cannot tell a book the Character owns but has not injected from one it lacks; that needs assets.
- **Notification Allow-List**: The closed set of EVE Notification `type` strings the app delivers. A type outside it is dropped at the poller.
- **Folded Wallet Change**: A Wallet Balance Changed line that a contract caused (ESI names the contract on the journal line), shown inside that contract's Contract Accepted / Completed / Failed alert instead of as its own alert. A Character choice under Wallet Balance Changed, on by default. Only folded when the contract alert is there to carry it; the ISK often arrives after the contract alert (the journal lags the contract list by up to an hour), so the contract's Feed row is revised rather than a second alert raised.
- **Notification Event**: One of a fixed catalog of character-state changes a user can be notified about — Skill Level Complete, Character Not Training, Industry Job Complete, New Mail, Planetary Extraction Done, Market Order Filled, New Calendar Event, Calendar Event Starting, Contract Accepted, Wallet Balance Changed. Each is independently toggleable per Character.
- **Notification Family**: A presentation grouping over the **Notification Allow-List** — Structures, War, Corp Governance, Bills, Moon Mining, PI. How Settings arranges the list and nothing more: it carries no defaults and gates no delivery.
- **Observed Mining Entry**: One row of a **Corp Tax Book**: everything one character mined at one of the corporation's refineries on one EVE/UTC date, summed per ore type, as the refinery itself recorded it. The corp-side counterpart of a **Mining Ledger Entry**, valued the same way, so both sides reach the same tax.
- **Occurrence Key**: The deterministic identity of one notification occurrence, derived from the Character (omitted for world-scoped events such as a nearby Incursion or raidable skyhook, which two Characters share), the **Notification Event** and the natural id of the thing that happened. Devices and the backend observing the same occurrence all compute the same key, which is what makes de-duplication possible. Distinct from the Notification Feed's row id.
- **Offline Services**: A structure service that is off: the one untimed kind of Corp Board Item, a standing fault with no instant. Listed by the Structures **Widget** (its Show: Problems only keeps every structure with one; the Offline services Widget folded into it); it has no place on the Deadline Strip.
- **Open Price**: The highest buy order and the lowest sell order standing _at a Trade Hub station_ (Jita 4-4, not The Forge) at the end of one UTC day, read from that day's final EVE Ref market-order snapshot (normally 23:45) and stored per item, every hub station in one object, at `open-prices/<typeId>.json` in R2. Only orders placed in the station count; a buy order's range is ignored. Drawn on **Price History** as the Buy and Sell lines ("Jita 4-4 buy") of the five Trade Hub Regions, each from its hub station. Distinct from ESI's daily average price, which is what was actually paid across the day, and from the live **Order Book**, which is what is standing right now.
- **Optimize Modes**: Skill Plan optimizer actions in one "Optimize" dropdown: "optimize for me" (the default: reorder, then place remaps on the new order), "reorder only" (honours prerequisites and **Plan Priority**, keeps current remaps), "place remaps only" (keeps current order), and "use my remap markers" (best attribute spread per segment between **Remap Markers**). Every mode previews; nothing applies silently.
- **Order Count**: How many orders ticked for an item in a Region on one day. A read on how many parties were trading, not on how much moved; **Traded Volume** answers that.
- **Order Book**: The live buy and sell orders for one item in one Region, read from ESI. Rows, not a summary: each is one order with its price, quantity, location, range and expiry. Distinct from a **Price Aggregate**'s single best bid/ask.
- **Order Detail**: The Open Orders modal's full breakdown of one open order.
- **Order Floor**: The lowest price a sell order is worth taking. Two numbers: `relist` (sales tax plus a broker fee charged again on the edit; the lowest price worth re-pricing to) and `fill` (sales tax only, the broker fee already paid). Null when there is no cost basis, never a guessed floor.
- **Wallet Cost Basis**: An unlinked personal sell order's cost, worked out FIFO from the character's own wallet buys and sells of that type; the unit cost is the weighted average of the newest units still held. Offered only when the history covers every unit on those orders. A linked Production Run always takes precedence.
- **Trading Profit**: The margin of the market sales in a date range, summed over the sales that have one and counted as "matched of total". Broker fees paid over the same dates sit beside it, never subtracted. Under **All characters** the margin is pooled FIFO across every Character's buys. Shown on Market History's strip and on the Overview's "Profit" widget, whose Source setting picks Builds (**Production Run** profit), Trading, or Both added up; the separate "Build profit" and "Trading profit" widgets merged into it.
- **Often Undercut**: The Open Orders badge for an order that reads `healthy` right now but has been undercut most of the times this page has watched it. Never an **Order Problem**: the row stays **Fine** (**Order Urgency**). Silent until there are enough samples to judge.
- **Order Depth**: A **Build Opportunities** row's `deep`/`moderate`/`thin`/`unknown` read on how much sell-order ISK sits at the hub against that row's own build cost. `unknown` when the product has no hub sell price, never guessed as thin.
- **Order Problem**: The one thing wrong with an open order: `belowFloor`, `undercutStation`, `undercutSystem`, `undercutRegion`, `expiringOrStale`, `outbid`, `healthy`, in that precedence. Each order is filed under exactly one, its worst, which decides its **Order Urgency**; filters match every problem an order has.
- **Order Urgency**: How soon an open order needs the pilot, the Open Orders fix list's three buckets. **Needs you**: `belowFloor`, `undercutStation`, `outbid`, `expiringOrStale`. **Watch**: `undercutSystem`, `undercutRegion`, and an order nobody could check (`notChecked`). **Fine**: `healthy`. The page's segments are Needs you, Watch and All (Fine shows under All).
- **Ore Form**: Whether mining ore, moon ore and ice are valued and named as their Compressed or Raw type. A synced setting, Compressed by default; a type with no Compressed counterpart is always Raw. Applies to Unassigned and Outstanding rows only; Paid rows keep the ISK they were paid at.
- **Reprocessing Yield**: What one type breaks down into when refined, per portion size rather than per unit. Combined with the character's skills into an expected output: ore, ice and moon ore use Reprocessing, Reprocessing Efficiency and their own specialisation skill; scrap uses Scrapmetal Processing only. The facility's own rate is the pilot's **Refining Setup**; with none set it is the base 50% NPC station rate with no tax (shown as an assumption).
- **Refining Setup**: The pilot's own account of the facility they refine at: a **Facility Base Yield** and a **Reprocessing Tax**, set once and read by every refining figure in the app. One setup, not one per station. Unset means an NPC station at 50% with no tax.
- **Facility Base Yield**: A refining facility's own yield before the pilot's skills and implants (50% at an NPC station; a structure's depends on its type, rigs and security), the "base yield" line in the EVE client's Reprocessing tooltip. Skills and implants then multiply it. Not the pilot's final yield: that is the **Reprocessing Yield**.
- **Reprocessing Yield**: The share of each portion's materials that actually comes back: the Facility Base Yield times the pilot's skills and implants. The headline "yield" in the EVE client's Reprocessing window (69.7% where the base is 51%), and the efficiency other appraisal tools ask for. Typing it into the Refine breakdown works the Facility Base Yield out from it.
- **Reprocessing Tax**: The fee a facility charges to refine, as a percentage of the refined output's value, paid in ISK. It never reduces the quantities that come out.
- **Order Slots**: How many market orders a character may keep open at once: a base 5, plus 4 per level of Trade, 8 per Retail, 16 per Wholesale and 32 per Tycoon, so 305 with all four at V. Derived from trained skills, since ESI never reports the ceiling.
- **Overdue**: A **Statement** that is still unpaid a set number of days after it was issued (14 by default; settable per book). No interest accrues, and reminders are sent by hand. A Miner's declaration that they paid another way pauses it for at most 14 days.
- **Overview Layout**: The ordered list of **Widgets** on the Overview, with
  each one's size, view, rename, character scope and range. One per pilot, not
  per Character, and synced as a whole. The **Corp Board** has its own, the
  **Corp Board layout**.
- **Owned-Stock Offer**: A materials row's "Use assets" offer: the owned quantity it would write (detected stock in the owned-stock scope, less any **Group Stock Claim** ahead of the plan, capped at what the row needs), or none. "Use all" is every row's offer at once; "Use none" clears every row. One rule for a Build Plan and a Build Group alike.
- **Group Stock Claim**: A Build Group member's set Have, read as a hold on the detected stock its owned-stock scope shares with another member. A member's **Owned-Stock Offer** leaves out the claims of members ahead of it (plan id order, the order the group page lists them); claims together past the stock show an amber warning on each claiming member. Display-only: never written into another plan, and separate from the **Group Owned Overlay**.
- **Payee**: Who the Moon Mining Tax ledger owes: user-managed name, default tax %, optional moon/system tag, optional Trade Hub. The tag lets the app suggest the Payee and rate for a future **Mining Ledger Entry** from that system. The Trade Hub is the order book this Payee's ore is valued at (absent means Jita). May also carry `entityId`, the EVE character or corporation the ISK goes to, learned when a **Made Payment** to that recipient is confirmed, or set by picking the Payee from the name search. Then it also carries `entityKind` (character, corporation or alliance), which marks it verified; a name that matches none stays an unverified free-text label (a moon or place), and Settle up opens a verified Payee in EVE.
- **Pending Login**: One authorize round trip this tab has started and not yet finished: its PKCE verifier, its **Requested Scopes**, and when it began, stored under its own `state`. Per-`state` so two round trips started together both stay valid; an abandoned one is forgotten.
- **PI Product Detail**: What a product or item name on the Planetary Industry tabs opens: the Map tab with that product's drawer open. How to make it (factory, planet types, inputs, the chain) and why or why not. The §6c "Entities" override for PI.
- **Pin Budget**: The CPU and Powergrid a Command Center supplies to one colony, and the fixed amount each pin draws from it. **This is the pin cap; the game defines no pin-count limit.** Scales with the colony's own **Command Center upgrade level**, bought per colony with ISK; the **Command Center Upgrades** skill only caps that level.
- **Prereq Promotion**: Turning a derived prerequisite row in the Skill Plan editor into a real, user-owned plan entry at that position. A promoted prereq is an ordinary entry from then on; its own upstream prerequisites stay derived.
- **Popular fit**: One distinct fit of a hull among its most recent zKillboard losses, grouped by the set of fitted modules (charges, drones and cargo don't split a group). Shows how many losses flew it, when it was last seen and roughly what it cost, and **Load**s the group's most recent loss.
- **EVE Workbench fit**: A fit a pilot published on EVE Workbench, listed for its hull in the Popular fits panel's EVE Workbench tab with its name, price and date created, linked to its page there. **Load**s from its EFT. Comes from our own synced copy of Workbench's public list.
- **Out-of-date fit**: An **EVE Workbench fit** that no longer works in today's game: it names a hull or item the game data doesn't have, or has more modules in a rack than the hull now has slots. CPU, powergrid and calibration never make a fit out of date. Never listed.
- **Seen on zKillboard**: A sighting badge on an **EVE Workbench fit** whose fitted modules exactly match one of its hull's **Popular fit**s. Shows how many of the hull's recent losses flew that group and when it was last seen. A fit that matches nothing shows nothing, never a warning.
- **Price History**: The Market Browser item tab charting one item's daily history in a Region: **Daily Range**, average price and its moving average, **Traded Volume** and **Order Count**. Up to four other Regions can be compared by average line. Every figure comes from ESI's daily rows except the Buy and Sell lines, which are **Open Prices**; none comes from the live **Order Book**.
- **Price Aggregate**: One best-bid/best-ask summary per station (Fuzzwork). Still the source for Build Plan pricing; no longer what the Market Browser shows.
- **Priority (Skill Plan)**: High/Normal/Low urgency a user assigns to a Skill Plan entry. A prerequisite's _effective_ priority is never less urgent than the most urgent entry that depends on it.
- **Permission**: The user-facing name for a **Scope Group**: one checkbox under "Customize permissions", labelled with the pages it unlocks. A declined Permission empties only the pages that need it. Never used for the **Core Grant**, which is not a choice.
- **Plan Milestone**: A named goal ("Fly Loki") pinned to a Skill Plan entry's skill level, not its position, so it survives any reorder. Reorder treats it as a hard deadline: its skills finish first. Projected, _reached_ (level already trained) or _orphaned_ (step gone, level never trained). Can also come from a saved Fitting (a _fit goal_), anchored to the latest step that Fitting needs.
- **Plan Setup**: The folded block of a Build Plan's inputs (runs, ME/TE, build location, facility, rig, tax, trade hub, material price basis), read as a row of chips until "Edit setup" opens the controls.
- **Dismissed delivery**: A delivered manufacturing or reaction job in the Jobs panel's History segment that the pilot marked "won't be logged". It stops counting as "not logged" everywhere (panel, Build Plan badge) and loses its Log production prompt, but stays listed, marked Dismissed, and can be restored.
- **Production Log**: The cross-plan, cross-item realized-profit rollup: every **Production Run** the character has logged, regardless of which Build Plan it came from, grouped by item, with a per-run table. Distinct from the per-Build-Plan "Production Runs" panel, which is scoped to one plan.
- **Run Loss**: Units of a **Production Run** destroyed or lost before they sold, recorded as their own record (several per run) with an optional insurance payout. The lost units are written off unsold cost and open inventory value, and the insurance counts as untaxed proceeds; the run's cost is still charged in full by Realized profit.
- **Production Run**: A manual, pilot-entered snapshot of one production batch off a **Build Plan**: materials cost, job fee and quantity as they stood at logging time, never re-derived afterward. Distinct from a Build Plan's live estimate, which moves with the market; a Production Run holds still so realized profit can be measured against what was actually paid. The pilot links what sold: a past sale, a watched open order, or a manual/private sale.
- **Projection**: The set of rows a device uploads describing every **Scheduled Push** that becomes due inside the **Projection Horizon**, one per occurrence, with its **Occurrence Key**, fire time and rendered title and body. Built per device from that device's own notification preferences; the backend learns when something comes due, never the data behind it.
- **Projection Horizon**: How far ahead a **Projection** reaches — 72 hours.
- **Public Contract Offers snapshot**: The shared, read-only snapshot holding every for-sale line of every public item_exchange/auction contract, any item type, from the twice-hourly EVE Ref crawl behind **BPC Sourcing**. A line the issuer is _asking_ for is not in it. Published to Cloudflare R2 as one object per item type plus an `index.json` (ADR 0019), its only store; a reader takes the index, then only the types it uses. A reader that needs every type, or every blueprint type, reads the index's few bundle shards instead. Read by **BPC Sourcing** and **Contract Search**; the **Public Courier Contracts snapshot** is its sibling for contracts that move an item.
- **Public Courier Contracts snapshot**: The shared, read-only snapshot holding every outstanding public courier contract as a route and a fee: origin, destination, reward, collateral, volume and days-to-complete. Published by the same crawl as the **Public Contract Offers snapshot**, to Cloudflare R2 as one content-addressed object plus an `index.json` (ADR 0019), its only store; **Contract Search**'s Courier mode is its one reader.
- **Published Snapshot**: A payload the backend republishes on its own clock and every signed-in client reads whole — the public contract offers and public courier contracts. Its **Freshness Window** matches the publish cadence, so it is longer than a Character's own data and unaffected by a manual Refresh.
- **Pull Cursor**: How far a sync pass has read one remote collection for one Character: the highest `updatedAt` it has actually observed there. The next pass reads only documents above that mark. It describes what this device has seen, never the current time.
- **Traded Volume**: Units of an item that changed hands in a Region on one
  day (ESI's `volume`). Not the item's cargo volume in m³ — the collision is
  EVE's, and this glossary keeps both words only because ESI does.
- **Quick win**: An in-place fix to a PI colony the pilot already runs, such as restarting a slowing extractor, adding a missing head, hauling before a launchpad fills, or repointing an idle factory. It adds to today's income without changing what the colony makes, except a storage win, whose figure is a saving.
- **Sell market**: Where a pilot's PI output is sold, and so what every PI ISK figure is priced at: a trade hub's buy orders (less sales tax), or the pilot's corp buyback at a percentage of the hub's price. One sell market applies across Plan, Map and Colonies.
- **Quickbar**: The user's saved item shortcuts in the Market Browser. Distinct from the **Compare Set**, which is what the **Compare** drawer compares.
- **Ratio Block**: The smallest whole-pin set that runs a chain once, such as one Advanced Industry Facility making a P2 fed by exactly two Basic Industry Facilities. A colony is sized by subtracting the fixed overhead and dividing what is left by one block.
- **Reaction Location**: A manufacturing-activity **Build Plan**'s second, independent location for reactions, the same shape as **Build Location**, used only when **Include Reactions** is on. Not derived from the plan's primary location; a fresh plan's is pre-filled from the **Remembered Location** for reactions.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Remap Marker**: A user-placed row in a Skill Plan marking where the character will remap attributes. Draggable like a plan entry.
- **Remaps Available**: How many attribute remaps the character can spend: bonus remaps (new characters get several) plus the yearly remap, counted even while it is on cooldown and usable from its cooldown date, not before. Plans always use the full count; there is no user override.
- **Remembered Location**: Where a new **Build Plan** starts. There is one per activity, manufacturing and reaction: the whole location the pilot last set from a Build Plan page (facility, rigs, tax, security band, **Build System** and **Build Location**). Each plan keeps its own location once created. Not a Settings control.
- **Requested Scopes**: What one authorize round trip asked SSO for, carried on its **Pending Login**. The baseline the login path judges revocation against.
- **Reset Run**: The unit of planetary work: every colony a pilot resets in one sitting, whose extractor programs therefore come to share an expiry. A colony is what the Colonies table lists; a Reset Run is what a pilot actually goes and does.
- **Role**: A first-run answer to "What do you do in EVE?" (Trader,
  Industrialist, Planetary industry, Miner, Fighter, Explorer and hauler) that
  maps to a set of **Widget Kinds** and seeds the first **Overview Layout**.
  Not a **Corp Role**, which is a permission in the game.
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
  Priced at the hub's lowest sell (a listed sell order); "Profit if sold now"
  in Costs & revenue states the same sale into the highest buy order instead,
  sales tax only.
- **Scheduled Push**: Delivery of a Notification Event from a timestamp the app already knew in advance, pushed by the backend rather than discovered by a poller. Where diff-based detection answers "what changed since last time", a Scheduled Push answers "what becomes true at 14:32 on Thursday".
- **Scope Group**: A named set of OAuth scopes granted or declined as one unit, called a **Permission** wherever the user sees it. Every scope outside the **Core Grant** belongs to exactly one group.
- **Seeded Build Plan**: A **Build Plan** opened from a BPC Sourcing **Offer**, a blueprint line in a BPC contract's contents, or a **Contract Search** item row, at that copy's own ME, TE and runs instead of the usual defaults. Named for the copy it quotes ("Rifter 10/20 ×5"); a Character can hold a plain plan and several seeded plans for one blueprint.
- **Survey**: A mining field tracked from pasted **Survey Scans**: how much is mined, how fast, and when it will be gone. Stored as a `survey` **Share Link**, so anyone holding the link can add a scan with no sign-in; it names its owner, the starting Character. A scan that only shrinks the field the Survey has shown is an update of it; any other scan is a different field.
- **Survey name**: The pilot's own short label for a Survey in their recents. Personal: kept with the pilot's recent-Surveys list, never on the Survey, so no one else sees it.
- **Survey connection** (also: Auto Assignment, its name in the UI): What "Assign Taxes" on a moon **Survey** sets up: until the Survey's ETA, that moon's ore in the Survey's system is assigned to the Survey's **Payee** at its rate as it reaches the Mining Ledger, so the pilot never assigns it by hand. Made by one Character, and only one runs at a time across the account: a new one stops the last. Synced across the pilot's devices, never on the Survey.
- **Survey info template**: A name for a saved set of a Survey's Additional information (location, moon tax payee and rate, notes), used to fill that panel in one step. Personal and synced across the pilot's devices, never on the Survey or its link.
- **Cleared marker** (also: mark field cleared): The scan with no rocks that ends a Survey, stored by a button because the scanner has nothing to copy once the last rock is gone.
- **Removed scan** (also: ignored scan): A Survey Scan its owner has set aside as a bad paste. It stays stored and listed but is left out of the Survey's totals, and the owner can restore it.
- **Survey Scan**: One copy of the in-game Survey Scanner results: a row per rock (ore, units, volume in m³, ISK value, distance), pasted as text and timed by the server's clock. Between two scans, rocks are matched by ore; a rock that shrank or is gone was mined, and one the earlier scan never showed extends the field. It keeps the Character name of whoever pasted it, if any.
- **Survey chart view**: One of the selectable presentations of a Survey's Survey Scans on its page, chosen from a select on the chart row: **Ore left** (the default: volume left by ore, with the mining rate under it), **Depletion by ore** (each ore's percent left) and **ISK left** (value left by ore). A view swaps the whole chart area, is not remembered, and is offered only once a Survey has a chart.
- **Survey chat message**: A four-line summary of a Survey for pasting into game chat: status with finish time and time left, a block bar with the percent, the rocks left by short ore name, and the link. Written in words and block characters because only bold works in game chat.
- **Share Link**: A short `/s/<id>` link to something a pilot chose to share, lasting a fixed 7 days from creation. Its type names the page it opens: a **Shared Appraisal**, a **Shared D-Scan**, a **Fitting**, or a **Survey**. It never names who shared it, except a Survey, which names its owner. A Fitting's Share Link wraps that Fitting's **Fitting Share Code**, which is permanent and is not itself a Share Link.
- **Shared Appraisal**: An **Appraisal** frozen at the prices it had when its **Share Link** was made, with its **Trade Hub**, **Price Percent** and the time it was priced. Never re-priced, read-only, and not a quote: it commits nobody to buying at those prices.
- **Shared Blueprint**: One blueprint instance a **Member** chose to share
  with a **Community** — type, ME/TE, runs (BPO or BPC) and the station or
  structure it sits in. Chosen per Community, none by default, and stamped
  with when it was last refreshed so a stale one reads as stale.
- **Shared Fitting**: A **Fitting** a **Member** chose to share with a
  **Community**, kept there as its name, hull and **Fitting Share Code** —
  never notes, never the sharer's skills. Others open it like a **Load**ed
  Fitting, stated for their own skills. A saved Fitting's copy follows its
  owner's saves; an **In-game Fitting**'s is a snapshot, "as of" when shared.
- **Shared Plan**: A **Skill Plan** a **Member** chose to share with a **Community**, kept there as its name and ordered skill targets only: never milestones, markers, implants, boosters or the sharer's skills. Shared one at a time, never all at once; it follows its owner's later edits, and others **Copy** it into a plan of their own that does not follow the original.
- **Shared D-Scan**: A pasted D-Scan stored in a **Share Link** as its raw scan text, never just the counts; the recipient's **Fleet board** is rebuilt from that text. Read-only, and cannot be revoked: expiry is the only end of the link.
- **Fleet board**: A D-Scan read as its ships grouped by role (Capitals, Industrial, Transport, Support, DPS, Drones and deployables, Structures and wrecks), with each role's count, percent and ship distances. Counts and distances only: D-Scan gives no bearing and never names a pilot.
- **Danger read**: The answer a D-Scan view opens with: "am I in danger, and what should I watch?" A level (Clear on scan, Watch, Danger, Busy), then **Watch these** (ranked groups of identical hulls that can pin, reinforce, hurt or find the pilot) and **Leave or re-check if**. Read for the pilot's own ship; the rest sits beneath as the **Full scan**. States a condition, never a verdict.
- **Ship Info window**: The per-hull window opened from the **Ship Tree**, after the game's own: description and bonuses, base fitting, required skills and Mastery, and blueprint. From it a pilot can simulate a new **Fitting**, add a Mastery tier to a **Skill Plan**, or start a **Build Plan**.
- **Ship Tree**: The Ships section's Tree tab: the in-game tree of hull classes, one faction at a time, marked with the active Character's progress. The game calls it ISIS (Interbus Ship Identification System).
- **Ships**: The section holding the **Fitting** tools and the **Ship Tree**, as two tabs.
- **Shorthand ISK**: An ISK figure rendered abbreviated (`1.3B`) with the exact value one gesture away. Used where width is scarce, such as dense comparison tables and stat chips; never where ISK is reconciled digit by digit against the game client (wallet journal, transaction lists, editable fields). A display treatment only: sorting, export and clipboard keep the underlying value.
- **Shared jump cooldown**: The single clone-jump cooldown a Character has, common to every Jump Clone (not per clone); the Clones page states it once.
- **Worn clone**: The clone a Character is in right now, whose implants are the Character's fitted implants; listed on the Clones page as "Wearing now" and distinct from its Jump Clones.
- **Clone Jump Ready**: Fires once when a Character's jump-clone cooldown ends: 24 hours minus the Effective Skill Level of Infomorph Synchronizing after the last clone jump. A **Scheduled Push** event; a Character who has never jumped never fires it.
- **Courier Delivery Due**: Fires once an accepted courier contract's deliver-by deadline (never its expiry date) falls within a Character's configured lead time. A **Scheduled Push** warning ahead of **Contract Failed**, which only arrives after the collateral is already forfeited. Only for contracts the Character themselves accepted.
- **Contract Expiring**: Fires once a contract the Character issued, still unaccepted (`outstanding`), has its expiry date inside their configured lead time, so they can relist it. A **Scheduled Push** warning. Never for a contract merely assigned to them; a courier in progress is **Courier Delivery Due**'s.
- **Mercenary Den**: A Character's own den on a skyhook, read per Character (ESI has no corporation den route). Carries a state, a development and an anarchy level, and a reinforcement timer while it is reinforced.
- **Mercenary Den Reinforced**: The **Notification Event** for a den's reinforcement exit: a warning at the Character's lead time and again at the exit. A hedged **Scheduled Push**, and the one critical personal event, so it reaches the Danger banner.
- **Mercenary Den Anarchy**: The **Notification Event** for a den's anarchy reaching the Character's threshold. Fires once per crossing and only while the app is open.
- **Orders Lapsing**: One batched alert, with a count, when the Character's own open market orders come within their configured lead time of lapsing. A single alert per window, never one per order; corp orders are excluded. A **Scheduled Push** warning.
- **Incursion Nearby**: Fires once when an Incursion's staging system comes within a Character's chosen number of jumps of their **Current System**, counted on Route Safety's jump basis. Edge-triggered per constellation; a changed Current System or jump count re-baselines silently.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Skill Plan schedule**: A **Skill Plan** costed in time: per-level steps with training seconds, plan total, projected finish, skill count, **Remap Marker** segments, **Booster**-boosted and Alpha-capped steps and effective **Priority (Skill Plan)**, computed in one pass from the plan, the Character's trained skills and attributes, **Clone State**, implants (or **What-If Implants**) and Booster. Every timing figure the plan editor shows reads from it, so none can disagree.
- **Skill Queue Ending**: Fires once the in-game **Skill Queue**'s last queued item will finish within a Character's configured lead time, warning ahead of the queue running dry. Distinct from **Character Not Training**, which fires only after the queue has _already_ gone idle or stalled; a paused or empty queue is that event's state, never this one's.
- **Size**: A **Widget**'s width on the Overview: S, M, L or Full, a share of
  one row. Not a height; its content sets that. Also sets how much a **View**
  shows.
- **Stale-Serve**: Showing a cached row whose **Freshness Window** has lapsed while the replacement is fetched behind it, rather than spinning until it lands. Signalled for a **Published Snapshot**, where a long window encodes a publish cadence; silent for a game constant, whose long window asserts the value cannot change. One that fails to revalidate must say so on the next read.
- **Standing (corp)**: Retired. The old Corp Ops Board's top panel of figures (clocks due inside a day, Runway, 30-day net); the **Corp Board**'s Due soon, Corp wallet and Cash flow **Widgets** carry them now.
- **Standing chain**: The NPC standings that govern one NPC entity, faction first: a faction alone; a corporation and the faction it belongs to; an agent, its corporation and their faction. There are no NPC alliances. The game uses the highest effective standing in the chain (the bold one in the info modal), except that a link at -2.0 or lower blocks level 2+ agents. Each link shows the effective standing (base lifted by Connections, Criminal Connections or Diplomacy) with the base on hover.
- **SP Farm**: A mark on a Character, set from the Characters table's SP Farm column or its row menu and synced across the pilot's devices, saying this Character is a skill-point farm. SP extraction readiness, its column and its alert apply only to marked Characters; with none marked, nothing shows as ready. Distinct from a **Starred Character**, which only floats a Character up the list.
- **Starred Character**: A Character the user has marked to float to the top of its group on the Characters page. Device-local, never synced. Called "starred", not "pinned", because **Pin** already means a planetary structure (and a **Station Pin**).
- **Statement**: One miner's bill from a **Corp Tax Book** for one billing period: what they mined, where and when, its value, the tax due, and what they have paid. What gets mailed to the miner.
- **Stock List**: A market the pilot stocks: the station or structure they sell at, and the **Stock Targets** it should have listed. Account-wide: it counts every Character's own sell orders there (listed) and their hangars at the same location (ready to list). Shared by link as a copy, never with the sender's counts. Called a "market" in the UI.
- **Stock Target**: One item on a **Stock List** with the whole number of units to keep listed. Always written in full in prose, never a bare "target", so it cannot be read as a **Target Profile**. Its status is measured by what is listed: Out (none), Low (under half), OK, or Over.
- **Shortfall**: How many units a **Stock Target** is short (target minus listed, never below zero). The part the hangar at the market covers is "ready to list"; the rest is "to buy or build".
- **Stopped**: A PI program (extraction or production) whose run has ended. Distinct from **Idle**, which names an unfed facility with nothing feeding it: a Stopped program has nothing left to run, an Idle facility has something to run and no input for it.
- **Sustained Extraction Rate**: An extractor program's whole output averaged over its whole length, off CCP's decay curve: the one honest units-per-hour summary of a program that yields a different amount every cycle.
- **Synced Collection**: One collection that leaves the device for Firestore under a Character's account: each **Editable Data** table, the Notification Feed's synced window, and synced settings. Each is declared once, and sync, tombstones, the owner-change wipe, Character removal and the encrypted backup all derive from that declaration, as does its **What We Store** line.
- **System Label**: One of ESI's four built-in mail labels — Inbox, Sent, Corp, Alliance — returned with their unread counts; unrenamable and undeletable in-game. Distinct from a **Custom Label**, a character's own user-created mail label. The four are the Mail page's folder filter, any subset shown at once.
- **Compose**: Writing a mail of any kind in the Mail page's one composer: a **New Mail** from scratch, a Reply, or a Forward. Full-pane on a phone, inline under the open mail on a wide screen. Recipients may be characters, corporations, alliances or mailing lists the character has joined.
- **Mail Draft**: The unsent state of the composer (recipients, subject, formatted body), kept on the device and cleared on send or discard. A Reply or Forward keeps one per mail; a **New Mail** keeps a single slot per character, reopened as left.
- **EVE Markup**: The formatting a mail body can carry, in the game's own tag language: bold, italic, underline, size, colour, links. What Compose sends and the reader shows, so a mail reads in the app as it does in the game. Counts toward the 10,000-character body limit, tags included. A table has no markup of its own: it is sent as pipe-separated rows and drawn as a real table by the reader.
- **Show-info Link**: A link in a mail body that opens an in-game information window. In the reader it opens the app's own modal for a character, corporation, alliance, item, skill or ship; a system opens **Route Safety**; kinds the app has no view for are shown as styled text.
- **ISK Waiting**: ISK the pilot does not hold in the wallet but is owed or has parked: sell-order stock, buy-order escrow and the contracts layer, read from each Character's newest **Net Worth Snapshot**. Shown on Wallet's Balance tab under the net worth chart.
- **Wallet Goal**: An ISK target a pilot sets on Wallet's Balance tab, with an optional name. Any number at once. The target is a typed ISK amount, or, when left blank, the sell price of a chosen **Fitting** at the pilot's Trade Hub, so it moves with the market. Progress is the summed wallet ISK of the picked Characters; the 30 day average is their wallet gain per day over the last 30 days of snapshots, and the ETA follows from that. Device-local, never synced.
- **Net Worth Snapshot**: One Character's wallet, asset value (at the chosen Trade Hub, PLEX excluded because the PLEX Vault is not in ESI), buy-order escrow and sell-order stock on one UTC day: numbers only, kept forever and synced as Editable Data. A day the app was not opened has no row and is never interpolated.
- **Tab Leader**: The one open tab that runs a piece of origin-wide background work, such as the **Foreground Poller** or the background sync sweep, so several open tabs do it once, not once each. The sweep's leader is always a visible tab: with every tab hidden nobody leads. The poller's leader keeps leading while hidden, until a tab is shown.
- **Target Profile**: The signature radius, speed and (optionally) resist to each damage type of an imagined target that a **Fitting**'s applied damage is worked out against — built-in NPC classes or one the pilot defines. Changes applied DPS and its graphs, never raw DPS. A profile with no resists resists nothing. Distinct from a **Damage Profile**, which is about what shoots at the Fitting.
- **Tax Payment**: ISK a miner sent the corporation, credited against what they owe in a **Corp Tax Book**, oldest debt first. Usually a donation into the corporation's wallet, found automatically; an officer can record one by hand, or mark one "not tax" when it turned out to be for something else. Distinct from a **Made Payment**, which is the pilot's own record of ISK sent.
- **Throughput** (planetary): A second budget, independent of the **Pin Budget**: whether the colony's links can carry the material flow and whether a buffer cycle fits in the Launchpad and Storage Facility. A layout can clear the Pin Budget and still stall.
- **Triage Board**: The Overview as it was before the widget grid: a fixed board
  with one card per domain. Retired; the Overview is now an **Overview Layout**
  the pilot builds. Distinct from the **Corp Board** (`/corp`), which
  answers the same question for a corporation.
- **Trade Hub**: A market station/region the user picks for price lookups in a Build Plan. Five empire hubs (Jita, Amarr, Dodixie, Rens, Hek) plus **Manifest**, Exordium's starter hub, which every-hub views leave out.
- **Hauling Opportunities**: The Market page's Hauling tab: items worth buying at one **Trade Hub** to sell at another, scanned per market category, priced at an **Expected Sell Price** and sized to a **Trip Plan**. Not a price-gap list.
- **Selling into buy orders**: (`instant` mode in code.) The **Hauling Opportunities** mode that sells the cargo instantly into the destination hub station's standing buy orders instead of listing it: priced at what those orders actually pay, after sales tax only, with no **Days to Sell** or demand.
- **Expected Sell Price**: What a hauler should expect per unit at the destination hub if they list to sell: the lower of one tick under the cheapest listing and the volume-weighted median price the item sold at recently. Never above today's cheapest listing.
- **Traded Price Ceiling**: The most an item's recent trades support at a hub: the higher of its volume-weighted median sale (last 7 days, or the 30-day window when the last week had none) and the latest day's lowest trade, the latter never past 3× the median so a unit sold to oneself cannot lift it. An LP offer's sale, or a bid it would sell into, counts at it when listed more than 1.25× above it. Not the **Expected Sell Price**, which a hauler lists under.
- **Days to Sell**: How long the units listed within 1% of the **Expected Sell Price** (they will relist below the hauler), plus about one day's worth of the hauler's own, take to sell at the region's recent sales rate. Not **Traded Volume** (units sold), and not a promise for the whole load.
- **Any hub**: A **Hauling Opportunities** From or To choice (`ANY_HUB` in code) that scans every other **Trade Hub** for that end and keeps each item on its single best lane. Allowed at one end only; a **Trip Plan** made with From on Any can buy at several hubs.
- **Cargo Space**: The holds a hauler can fill, each with its own m³, chosen once per device as a ship's base holds, a saved **Fitting**'s exact holds or a typed number. The general hold (cargo hold plus fleet hangar) takes anything; beside it sit any **Specialised Holds**. Optional. Hauled volume is the packaged volume where a type has one.
- **Specialised Hold**: A ship hold that takes only certain contents, such as an ammo, planetary commodities, command center, mineral, gas, mining, ice, fuel or infrastructure hold, as opposed to the general hold (cargo hold plus fleet hangar).
- **Consolidation Plan**: What each Character would have to move to bring their loose stock (not assembled, not inside a container or ship) to one destination station: per-Character packaged m3, trips against the saved **Cargo Space**, and a **Route Safety** link. A volume estimate, never a safety verdict.
- **Trip Plan**: The suggested load for one trip's **Cargo Space** on one route: a quantity per item capped by a week of sales, the units worth buying at all, the remaining **Cargo Space** and the optional **Max spend**, with the limit that applied named on each line. A suggestion the user can edit.
- **Training Progress**: How much SP a Character has already banked toward the level it is training _right now_. Distinct from **Trained Skills**, which is levels finished. Interpolated from the skill queue's training window, as the in-game queue displays it.
- **Unattributed**: Ore in a corp member's personal Moon Mining Tax ledger on a **Billable** day that no **Corp Tax Book** claims and that the member gave to no **Payee**. Owed to no one. Several books in one system on one day split the entry by the quantity each observed; what none observed stays Unattributed.
- **Undercut Scope**: Station, system or region: the nested scopes a rival's cheaper order can sit in. A row shows one severity, the tightest scope containing a rival. A scope absent from the result was never checked; a checked scope with no rival is recorded as clean, not absent.
- **Unmatched**: A donation into the corporation's wallet that a **Corp Tax Book** could not link to a **Miner**: it came from a character no Miner has, with no pay code. The player's own are claimed for them automatically when the books load (a failed claim keeps a manual Claim prompt); an officer can assign any other to a Miner.
- **Use-or-Sell Check**: Whether the stock the player already owns is worth more sold than consumed. On a Build Plan it is the **Profit Basis** `sellValue`: the **Verdict Hero**'s profit is net of what those units would fetch on the chosen **Liquidation Basis**, and the Costs & revenue ledger lists that forgone sale as a line.
- **Verdict Hero**: The first panel of a Build Plan: one verdict pill (Build, Build — close call, Loses money, or Sell your materials instead), **Sale Profitability** as the one large figure on the current **Profit Basis**, margin / ISK-hour / break-even beside it, the runs field and schedule in its title row, and the setup summary as its footer. The **Acquisition Verdict** is in Costs & revenue, not the hero.
- **Profit Basis**: How a Build Plan's hero counts the materials it takes from the player's own hangars: `sellValue` (charged at what they would net if sold — the default whenever the plan uses owned stock) or `free` (owned units cost 0, the plan's own figure). Switched in place from the line under the hero's figure.
- **Liquidation Basis**: How owned materials would be turned into ISK in the **Use-or-Sell Check**: `instant` (fill the hub's standing buy orders, sales tax only) or `order` (list your own stack at the hub's sell price, sales tax plus broker fee). Independent of a plan's material price basis, which is about buying.
- **vs 90d**: How far a product's latest full day's region daily average sits from the median of its daily averages over the last 90 days, as a signed whole percent. Amber from +20% (a profit that rests on a spike); blank when the item traded on too few of those days. Shown on Build Opportunities, the **Verdict Hero** (as a note, only when amber) and the Price watch widget.
- **Variations**: The selected item's Tech I/II/Faction/Storyline/Officer variation group, shown on its own item tab as a price comparison grouped by tier; falls back to its Market Group siblings when it has no variation data.
- **View**: How a **Widget** draws its data: Number, Chart or Table, whichever
  its **Widget Kind** has. Chosen in the widget's settings menu.
- **What We Store**: The section of Settings' FAQ tab that tells a pilot, in their own words, what leaves their device. Not documentation but a **commitment**: the **Synced Collection** registry is the authoritative set, and every synced collection must be accounted for. Names its own exceptions (Notification Feed rows, Scheduled Push occurrences, crash reports) rather than rounding them off.
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set instead of the clone's current implants: five independent per-attribute bonuses (+0..+5 each), since EVE's attribute hardwirings are per slot. The matched sets (+1..+5 in every slot) remain one-click **presets** over those five values. Stored on the Skill Plan and synced with it.
- **Widget**: One tile on a **Widget board** (the Overview or the **Corp Board**): an instance of a **Widget Kind** with
  its own **Size**, **View**, optional rename, character scope and range. The
  same kind may appear more than once. Always in one **Widget State**.
- **Widget board**: A page drawn as a **Widget** grid: the Overview or the
  **Corp Board**. One engine (grid, Customize, **Gallery**, menu) with the
  board's differences read from a context: which kinds it offers, which a
  Character may see, whether a widget has a character scope, and the default
  layout.
- **Widget Kind**: An entry in the one global catalogue of what a **Widget
  board** can show (Wallet, Orders, Planetary, Corp wallet...): its title,
  category, which **Views** it has, default **Size**, the ESI permission it
  needs and, for a corp kind, the Corp Capabilities that open it. Corp-only ids
  are prefixed `corp`; Structures and Moon extractions are on both boards. A
  kind not built yet is "coming soon": listed in the **Gallery**, not addable.
- **Widget Show**: A per-**Widget** setting that picks what a kind draws from
  its one feed, e.g. the Wallet on Balance or on Flow.
- **Widget State**: Which of five things a **Widget** is showing: loading,
  needs permission, failed, empty or ok.
- **Yours**: The pill on a **Feeder** whose corporation is one of the viewer's own, joined through "Add my other
  corps" (the CEO is a Character on the viewer's account) rather than an invite. It owes no owner rate and takes no
  payouts: the row is always settled otherwise.
