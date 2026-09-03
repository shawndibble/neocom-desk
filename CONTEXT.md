# NeoCom Desk — Ubiquitous Language

## Glossary

- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Account**: UI-level grouping of a user's Characters. Has **no storage, no sync and no server-side identity** — EVE SSO exposes no account identifier (`sub` is per-Character; `owner` is the owner hash and changes on transfer), so one cannot be verified. Groupings are device-local by decision, not by omission — see the parity plan §5.7, which also records why account-scoped sync is rejected rather than merely unchosen. Never surfaced to the user as a thing to manage.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Build Plan**: An industry plan for manufacturing: blueprints needed, materials, costs, fees/taxes, time, and two independent verdicts — an **Acquisition Verdict** and a **Sale Profitability** read (see round 15). v1 scope: manufacturing only (no invention/reactions).
- **Trade Hub**: A market station/region the user picks for price lookups in a Build Plan.

## Scope decisions (v1)

- Multi-character from day one.
- Corp/alliance: public info + the member's own view only. No director tooling.
- Read-only: no ESI write scopes (no mail send, no calendar respond). One
  scope reads otherwise on the consent screen: `esi-planets.manage_planets.v1`
  (planetary industry) is the only PI scope CCP publishes, and EVE renders it
  as "manage your planetary installations". The app calls two GETs with it and
  issues no writes, so this claim holds at the behaviour level; the wording is
  CCP's, not a widening of ours. Disclosed at login — see the parity plan §5
  decision 2.
- Industry: manufacturing only; model shaped so invention bolts on later.

## Glossary (round 2 additions)

- **Optimize Modes**: Skill Plan optimizer actions — "optimize now" (optimizer chooses remap placement, keeps order), "optimize at remap points" (user drags **Remap Markers** into the plan; optimizer computes the best attribute spread for each marker-delimited segment), "suggest full reorder" (attribute-grouped reorder honoring prerequisites; user accepts or rejects). Reorder never applies silently.
- **Remap Marker**: A user-placed row in a Skill Plan marking where the character will remap attributes. Draggable like a plan entry.
- **Remaps Available**: How many attribute remaps the character can spend: bonus remaps (new characters get several) plus the yearly remap when off cooldown. Read from the API (bonus_remaps, last_remap_date, cooldown); user may override. Optimizer must support the common single-remap case: train a leading segment on current attributes, then remap at the optimizer-chosen point.
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set instead of the clone's current implants. Five independent per-attribute bonuses (+0..+5 each), since EVE's attribute hardwirings are per slot — a clone can run +4 PER / +5 INT / +3 MEM and nothing in WIL or CHA. The matched sets (+1..+5 in every slot) remain one-click **presets** over those five values; see round 28. Stored on the Skill Plan and synced with it (round 33).
- **Booster**: Cerebral accelerator; user toggles it on manually with an expiry date for training-time math. Stored on the Skill Plan and synced with it, like What-If Implants above (round 33).

## Scope decisions (round 2)

- Sync backend: Firebase (Firestore + one Cloud Function for EVE-token → custom-token exchange). Free scale.
- EVE refresh tokens never leave the device; per-device SSO login.
- Trade hubs v1: Jita 4-4 (default), Amarr, Dodixie, Rens, Hek.
- i18n wired from day one (i18next), English-only catalog until stable.
- Hosting: https://neocomdesk.com (GitHub Pages, custom domain).
- Design system: docs/DESIGN.md + hidden /styleguide route; Photon-UI-inspired dark theme.

## Glossary (round 3 additions)

- **Market Browser**: General item price lookup page (any item, prices at chosen Trade Hub). Separate from a character's own **Market Orders** (open + history).
- **Facility Preset**: Industry location model: NPC station or player structure type (Raitaru/Azbel/Sotiyo) + rig level. Drives ME/time/cost bonuses in a Build Plan.
- **Data Age**: Timestamp shown on every API-derived view; how old the cached data is. Refresh happens on app open + manual button only.
- **Freshness Window** (round 25): how long a cached row is served without asking ESI again. Ten minutes for a Character's own data, a day for game constants. Distinct from **Data Age**, which reports how old the shown data is; the window decides whether to go and get newer.

## Scope decisions (round 3)

- Milestones: Foundation → Skills viewer + Skill Plans → Industry → remaining character views (mail, calendar, contracts, wallet, orders, assets).
- Skill Plans: multiple named plans per character; import from in-game queue; export to game clipboard format.
- Industry: facility presets + live system cost index (ESI) + character-skill-derived taxes/fees + owned-blueprint awareness.
- Repo: public, MIT + CCP third-party developer notice.

## Scope decisions (round 4)

- **The whole app sits behind authentication.** Every feature route requires a
  signed-in Character; only `/login`, `/callback` and the hidden `/styleguide`
  are reachable without one. Other EVE tools are fully open without auth, so we
  are not competing on that, and requiring a Character removes a class of
  anonymous-state handling from every view.
- **Auth-required and scope-required are separate.** A route can need a login
  but zero ESI scopes — `/market` reads only the SDE snapshot and Fuzzwork.
- Missing-scope handling is centralized, not per view: the **scope gate**
  compares the stored grant against the route's required scopes before any
  fetch, and a **runtime auth-failure sink** covers the window where that
  stored grant is stale (a revoke performed in EVE's third-party-application
  portal is invisible locally until the next token refresh).
- Multi-scope routes (`/overview`, `/skills/trained`, `/industry`) must degrade per
  panel rather than gating the whole page — one missing scope must not hide the
  panels that still work. Partly done: Overview's wallet panel degrades; its
  skills and queue panels, and the Skills and Industry panels, still fall back
  to an empty state and rely on the runtime auth-failure notice.

## Glossary (round 5 additions)

- **Market Group**: A node in EVE's own market browse tree (`invMarketGroups`:
  `Ships → Frigates → Standard Frigates`). Distinct from an item's **Group**
  (`invGroups`, a taxonomy that is not the market's). Only Market Groups with
  `hasTypes` hold items; the rest are branches.
- **Order Book**: The live buy and sell orders for one item in one Region, read
  from ESI. Rows, not a summary — each row is one order with its price,
  quantity, location, range and expiry. Replaces the single best bid/ask that a
  **Price Aggregate** gives.
- **Price Aggregate**: One best-bid/best-ask summary per station (Fuzzwork).
  Still the source for Build Plan pricing; no longer what the Market Browser shows.
- **Location Mode**: The Market Browser's one location control, in one of two
  mutually exclusive modes — **Region** (every station in that region) or
  **Trade Hub** (that hub's region, filtered to the hub's station).
- **Quickbar**: The user's saved item shortcuts in the Market Browser's left
  column. Replaces the pin-to-compare grid; the comparison itself becomes a tab.

## Scope decisions (round 5) — Market Browser rebuild

- **Two-column Market Browser**: left column is find-an-item (search box +
  Market Group tree + Quickbar); right column is the selected item.
- **Order source swaps to ESI region order books.** `/markets/{region_id}/orders`
  is public — `/market` still requires zero ESI scopes, so the round-4 decision
  holds in spirit while its "SDE snapshot and Fuzzwork only" wording is
  superseded. Build Plan keeps Fuzzwork (amends ADR 0002).
- **Buy and sell are separate tables**, never one blended list.
- **No "All Regions" option.** ESI has no cross-region endpoint; it would cost
  100+ requests per item.
- **New lazy-loaded SDE payloads** for `/market` only: Market Group tree and
  the published market types. `types.json` stays as it is, so Skills and
  Industry do not pay for the market catalogue.
- **Player-structure orders are shown, never hidden.** Their names need a scope
  the app does not take, so they render as an unknown structure — but with the
  solar system and security status, which the order payload always carries.
  Hiding the rows would misreport the best price.
- The selected item also offers **variations** for price comparison and an
  **item detail modal** (fitting attributes: CPU, powergrid, volume, bonuses).

## Glossary (round 6 additions)

- **Item Detail**: The modal view of one item's own properties — fitting cost,
  volume, bonuses, description. Read live from ESI per item, not from the SDE
  snapshot, so it is the one Market Browser panel that needs the network.
- **Variations**: The selected item's Tech I/II/Faction/Storyline/Officer
  variation group, shown as a sortable table (Name, Tier, Sell, Buy) beside
  it for price comparison; falls back to its Market Group siblings when it
  has no variation data.
- **Compare**: A tab that puts the Quickbar's items side by side on best sell,
  best buy, spread and volume, under the same **Location Mode** as the order
  book beside it.

## Scope decisions (round 6)

- **Radix is adopted for the primitives the app lacks** — context menu,
  dropdown, select — and only those. Working primitives stay: the native
  `<dialog>` Modal beats a library dialog, and `DESIGN.md` already forbids
  hand-rolled focus traps. Every Radix part is wrapped in `src/components/ui`
  so call sites never import Radix directly.
- **Item Detail reads ESI on open**, plus a small SDE dictionary of attribute
  names and units. Baking attributes into the snapshot would ship megabytes for
  a panel that is rarely opened.
- **Items answer to a context menu** wherever they appear — tree, search
  results, Quickbar, order rows: add to Quickbar, show info, compare, copy
  name, and jump to a Build Plan. A sixth candidate action, re-anchoring the
  Variations table on a chosen row, is dropped: clicking a row already
  replaces the selection, which re-anchors the table as a side effect.
- **Variations are sourced from the SDE variation relation**, resolved by
  `src/engine/market/variations.ts` from `public/data/market/variations.json`
  — the Tech I root plus every Tech II/Faction/Storyline/Officer sibling
  across the item's meta groups. Falls back to Market Group siblings when the
  selected item has no variation data (e.g. plain commodities/minerals).
- Compare ships with four fixed columns, but user-chosen columns are the
  expected direction, so the column set is modelled as a list, not as fixed
  table markup.

## Scope decisions (round 7)

- The Market Browser's state lives in the URL as query parameters
  (`/market?type=…&region=…`), so a view is shareable and survives a reload.
  Path parameters are not an option: routes are keyed by literal path.
- Order rows are capped at 15 per side, with "show all (N total)" to expand.
  Sell sorts cheapest first, buy sorts highest first; columns are click-sortable.
- An order book is fetched when an item is selected and held for the 300
  seconds ESI itself caches it. The **Data Age** badge states how old the shown
  book is, and only the manual refresh control refetches — the Market Browser
  keeps the same refresh promise as every other API-derived view.
- The Quickbar is **Editable Data** — it syncs across devices. The Location Mode
  is not; it stays a device-local view preference like the current hub setting.
- **Station Pins** (issue #84, Assets page) are also **Editable Data**: a
  three-state pin per station (unpinned / pinned for one Character / pinned
  account-wide) that sorts the pinned station to the top of the tree and
  starts it expanded. An account-wide pin has no shared account identity to
  key a single record off — Account has no storage or sync (see below) — so it
  fans out: one pin row per Character currently known on this device, each
  synced under that Character's own ownerHash rather than a new account-level
  identity (parity plan §5.7's "write under every Character" recipe).
- A context-menu jump to a Build Plan stays visible for items no blueprint
  produces, reading "No blueprint options" rather than vanishing.
- The rebuild ships in two passes. Pass 1: two-column layout, search, Market
  Group tree, order book, Location Mode. Pass 2: Quickbar sync, Compare,
  Item Detail, context menus, price history.

## Glossary (round 8 additions)

- **Compare Set**: The short-lived selection of items being priced against each
  other right now — usually variants of one thing. Distinct from the
  **Quickbar**, which is the durable list of items the user returns to across
  sessions. Different lifetimes, so two lists, not one.
- **Market Region**: A region that can actually hold orders. Not every region
  qualifies — wormhole, Abyssal and the unreachable dev regions never do — and
  the test is not whether the region has an NPC station: 31 nullsec regions have
  none and still carry busy player-structure markets.

## Scope decisions (round 8)

- **Compare opens as a resizable bottom drawer**, with a persistent
  `Compare (N)` handle and an expand-to-full-view control. Comparing happens
  _while_ browsing — a modal or a tab would hide the order book the user is
  cross-referencing on every single add.
- **Recharts draws the price history**, loaded only when its tab is opened.
  TanStack Charts is pre-alpha and not a production choice.
- **Search filters the tree in place**: the hierarchy stays, and a branch is
  hidden when nothing under it matches. It does not become a flat result list.
- **Narrow screens show one column at a time** — the finder, then the item, with
  a back control. Desktop keeps both columns side by side.
- With nothing selected, the item column prompts the user to search or browse.
  No stand-in default item.

## Scope decisions (round 9)

- Tree filtering starts at 3 characters, then caps the match count and says so
  on screen rather than truncating silently.
- Order-book columns follow the reference tool: sellers show quantity, price,
  location and expiry; buyers add order range and minimum volume. Security
  status reads inline in the location, not as its own column. No jumps-away
  column — that needs a pathfinding graph the app does not have.
- Order-book reduction (best price, spread, totals, per-station grouping) is
  **pure calculation and lives in the engine**, test-first. The ESI client for
  order books sits with the other price sources; state and components stay in
  the feature.
- Item Detail groups an item's attributes by category and shows all of them.
  A curated allow-list would silently drop whatever mattered for an item class
  nobody thought about.
- The Location Mode control sits in the page header, above both columns — it
  governs the Compare drawer as well as the order book, so it belongs to
  neither one.

## Scope decisions (round 10)

- The market catalogue payloads are kept **out of the install precache** and
  fetched on first visit to the Market Browser. Offline order books are not a
  thing the network can give us anyway, so paying ~1.2 MB on every install for
  a page most users never open is the wrong trade.
- An order row answers to its own context menu — copy the location, copy the
  price, show the item, and **filter the book down to that one station**, which
  is the move the whole tool exists to support.
- The Quickbar is a flat, drag-ordered list. Folders would be a second synced
  data model for what is a shortcut bar.
- Market group names and attribute names stay in English: they are game data,
  not UI copy. Only the app's own labels pass through i18next.

## Scope decisions (round 11) — final

- The list of **Market Regions** is baked at build time. A new region needs new
  systems and stations in the snapshot too, so the app redeploys either way; a
  scheduled refresh would keep one list current while the data around it aged.
- The rebuild ships in two passes:
  - **Pass 1** — the snapshot gains market groups, market types, solar systems,
    NPC stations and market regions; order-book math in the engine; the ESI
    order-book client; the two-column layout, the filtered tree, Location Mode
    in the header, the two order tables, unknown-structure locations, URL state,
    and the narrow-screen collapse.
  - **Pass 2** — the Radix-backed menus, the Quickbar, Compare, Item Detail,
    Related Items and price history.
- Sortable tables are the one pass-1 change that reaches outside the Market
  Browser: the shared table primitive has no sort state today, and giving it one
  touches every view that uses it.

## Glossary (round 12 addition)

- **Global Market Region**: A region that exists only to hold one item's
  cluster-wide market. PLEX is the only one today: its orders live in a region
  of their own, none of them in the normal regional books, yet each order still
  points at an ordinary station — 267 of them at Jita 4-4. So a global market is
  a routing quirk, not a separate kind of place.

## Scope decisions (round 12) — final

- **Items that trade in a Global Market Region resolve there automatically.**
  The build-time probe already learns which items those are, so when one is
  selected the book is read from its own region whatever the picker says, with
  a note on screen explaining why. Trade Hub mode keeps working unchanged,
  because those orders carry real station identifiers.
- Leaving this to the user was rejected: the picker asks where they want to
  look, and for PLEX there is exactly one truthful answer. Making them find a
  region called GPMR-01 is a puzzle, not a choice.

## Glossary (round 13 addition)

- **Priority (Skill Plan)**: High/Normal/Low urgency a user assigns to a Skill
  Plan entry. A prerequisite's _effective_ priority is never less urgent than
  the most urgent entry that depends on it — the plan's banded view and the
  optimizer's "suggest full reorder" both key off this effective value, not
  each entry's own raw setting.

## Scope decisions (round 14)

- **Jumps-away ships for the Assets page**, distinct from round 9's "no
  jumps-away column" call for the Market Browser's order book. That decision
  was about a large, always-rendered order-book table, where computing a route
  per row does not scale. The Assets page computes it lazily — only for
  pinned and currently visible/expanded stations, loaded after the rest of the
  page renders — via ESI's `/route/{origin}/{destination}/`, which resolves
  server-side and needs no local pathfinding graph. The two pages' call
  volumes and rendering models differ enough that this is not a reversal of
  the round 9 decision, just a narrower case it didn't rule out.

## Glossary (round 15 additions)

- **EIV (Estimated Item Value)**: The SCC's reference price for the materials
  a manufacturing job consumes, at ME0 quantities. Used only to size the
  **Job Fee** — it is not what the materials actually cost to buy.
- **Job Fee**: The ISK ESI charges to install a manufacturing job, separate
  from material cost. Sized from EIV, the system's **Cost Index**, a fixed
  SCC surcharge, and the facility's tax.
- **Cost Index**: A solar system's current manufacturing activity level
  (read live from ESI). Higher activity in a system drives its Job Fee up;
  distinct from EIV, which prices the materials rather than the system.
- **Acquisition Verdict**: Whether a Build Plan's product costs less to build
  than to buy outright at the trade hub. A personal-use comparison — no
  sales tax or broker fee applies, because nothing is being sold.
- **Sale Profitability**: Whether manufacturing a Build Plan's product and
  selling it on the market turns a profit, net of sales tax and broker fee.
  Distinct from the **Acquisition Verdict** — a product can be cheaper to
  build than buy while still losing ISK if resold, since selling fees only
  apply to the sale, not the build-vs-buy comparison.
- **Gross Profit** / **Net Profit**: Sale Profitability before vs after sales
  tax and broker fee are subtracted. **Break-even Price** — the sell price
  at which profit is exactly zero — is always a Net figure, since it answers
  "at what price do I stop losing ISK," which only holds net of the fees an
  actual sale pays.

## Scope decisions (round 16)

- **The item context menu (round 6) reaches the Assets page and gains a
  sixth action.** `ItemContextMenu` is now also the Assets tree's row menu
  (issue #83), not just the Market Browser's — so add to Quickbar, show
  info, compare, copy name and jump to Build Plan all work identically
  there. The new action, **View in Market**, jumps to the Market Browser
  with the item preselected, carrying over an existing region/hub URL param
  if the trigger page already had one. Assets rows also gain a hover
  tooltip (name, icon, quantity, estimated value, volume) — physical volume
  reads from the same slim SDE snapshot as everywhere else, so a type it
  doesn't cover (a market/asset-only type) shows as unknown rather than
  paying for a live ESI call per hover.

## Scope decisions (round 17) — Skills pages rework

- **Trained page**: skill groups start collapsed, one header toggle each,
  plus an "Expand all" control; expand/collapse state does not persist across
  visits. Search filters the group tree in place — the Market Browser's
  pattern (hide non-matching branches, auto-expand matches, 3-char minimum) —
  rather than becoming a flat result list. Every skill row carries a
  hover/focus tooltip with the skill's description (EVE markup stripped, same
  treatment `ImplantChip` already gives implant descriptions); the same text
  also appears at the top of `SkillInspector` once a skill is selected.
- **Skill Plan editing moves to its own route** (`/skills/plans/:planId`),
  off the list page. "New plan" creates the record immediately (unchanged)
  and redirects to it. The list page keeps the **Current skill queue** panel
  (in-game data, character-wide, not plan-specific) plus plan CRUD with
  icon-only row actions (edit/duplicate/delete) and an in-app `Modal`
  replacing `window.confirm` on delete.
- **The editor page is a sidebar plus the plan** (supersedes round 18's "no
  plan-switcher sidebar, pinned toolbar above the list", and #158's list pane
  beside the editor). The sidebar carries the plan list and, below it, a
  single **Plan Tools** panel of three labelled sections: Actions
  (reorder/optimize/marker, the ones used while working the list),
  **Attributes** (the character's current attributes, then the what-if
  implants/booster lenses over them), and Import / Export. The main column
  carries only the plan summary strip and the entry list. Rationale: five
  peer panels said the controls mattered as much as the plan, cost five panel
  header strips of chrome to say it, and left the sidebar empty below a short
  plan list.
  - The **Attributes** section is where the editor route shows the
    character's attributes, rendered by the same `AttributeChips` +
    `DataAgeBadge` pair as the plan list's Attributes panel. They belong on
    this route because they are what every estimate on it is costed against,
    and they belong _inside_ the tools panel because a fourth peer panel is
    what this round removed — and below `lg` it would land as a second
    always-open block above the entry list. Costing a tap on a phone is the
    accepted price. Chips show the clone's _real_ implants and never
    re-render through the what-if lens sitting under them: "current" has to
    keep meaning current, and the lens's effect is visible in the plan's own
    numbers. General character stats (total SP, wallet) stay off this route —
    they explain nothing here.
  - Below `lg` the sidebar is not built at all: the tools move into the one
    column as a **collapsed disclosure** above the entry list, so the whole
    tool set costs one row rather than three panels, and the plan leads the
    page. This supersedes #224's icon-only, sideways-scrolling toolbar — a
    full-width labelled row is a bigger touch target and self-describing.
  - The entry list is capped against the live viewport and scrolls inside its
    own box. The summary strip is the one remaining `position: sticky`
    element, pinned at a plain `top-0` — the window can still scroll when the
    sidebar outgrows the viewport, and the plan's headline numbers should
    survive that. What retires #221/#229 is that there is no second sticky
    panel below it needing its rendered height, so no offset has to be
    measured or kept in sync.
  - "Optimize remaps" and "Optimize at markers" results render inline in the
    Actions section, under the button that produced them, rather than as
    extra panels at the bottom of the page. Still read-only findings to
    consult, not a decision to commit.
- **"Your entries" and "Computed queue" merge into one list**: one row per
  plan entry (not exploded per individual level), draggable, with priority,
  target level, and an icon-only remove button, plus per-level and cumulative
  training time. Prerequisite skills the user did not add directly still
  appear as their own dimmed rows, positioned where the schedule actually
  trains them. (Round 31 supersedes "non-interactive": those rows are
  draggable, and dragging one is a **Prereq Promotion**.)
- **An entry row names the level range it trains, and discloses those levels
  on request.** A "Caldari Carrier V" entry queues I–V as five scheduled
  steps, but the row showed one aggregated time while each prerequisite got a
  dimmed row _per level_ — so a user reported that the entry's own levels
  "did not get added". They had been. The row is now labelled with the range
  it actually trains ("I–V"; "IV–V" for a character already at III — read off
  the schedule, never off the target level), and a caret in front of the name
  reveals one line per level with that level's own time — its running total
  folding to a tooltip below `md` exactly as the row above it does. Those
  lines nest inside the row rather than becoming siblings of it: the
  no-explosion decision above is what keeps the list draggable and scannable,
  so this makes it honest instead of reversing it.
- The merged list's optional columns (attribute-pair badge, priority,
  per-level time, cumulative time) are individually toggleable via a
  "Columns" control — a device-local view preference (not synced, not
  per-plan; same category as the Market Browser's Location Mode), all on by
  default. Narrow screens fold each row to two lines and show cumulative time
  as a tooltip on the per-level time cell rather than its own column.
- A grouping toggle switches the list between the existing priority-band
  grouping and a new attribute-pair grouping. Visual only — drag-and-drop
  still crosses group boundaries freely, same as priority bands today.
- **"Suggest reorder"'s preview becomes a `Modal`** (accept/reject a proposed
  mutation to the plan); "Optimize remaps" and "Optimize at markers" results
  stay inline — read-only findings to consult, not a decision to commit.
- Export (to clipboard / to CSV) collapses into one expandable "Export"
  control instead of two always-visible buttons.
- **"Optimize remaps" only evaluates the plan's current entry order** — it
  does not reorder, by design (CONTEXT.md already rules that reorder never
  applies silently). Its "no remap improves this plan" result, and the button
  itself, get an explanatory tooltip pointing at "Suggest reorder" for plans
  that aren't yet attribute-grouped. No change to the optimizer's math.
- Tooltips (skill descriptions, icon-button labels) get long-press support on
  touch, added once to the shared `Tooltip` component so every existing
  usage benefits — CSS `:focus-within` alone is unreliable on touch (notably
  iOS Safari does not reliably focus a plain `<button>` on tap).

## Glossary (round 18 addition)

- **System Label**: One of ESI's four built-in mail labels — Inbox, Sent,
  Corp, Alliance — returned by `/characters/{id}/mail/labels/` alongside
  their `unread_count`. Unrenamable/undeletable in-game; CCP does the
  routing (e.g. "is this corp mail"), the app doesn't reimplement it.
  Distinct from a **Custom Label**: a character's own user-created EVE mail
  label, also returned by the same endpoint. Deferred in round 18; surfaced
  as a filter chip row beneath the tab strip in round 22.

## Scope decisions (round 18) — Mail page rebuild

- **Tab bar over folder sidebar.** The existing `Tabs` component switches
  between System Labels (Inbox/Sent/Corp/Alliance) plus a synthetic **All**
  tab; list pane and reading pane sit side by side beneath it, the same
  two-region shape as the Market Browser. A persistent sidebar earns its
  keep at Gmail's folder counts, not five fixed ones.
- **Category buckets come from ESI's `/mail/labels/` endpoint**, not derived
  locally from `recipients`/`from` — authoritative, and its `unread_count`
  is used as-is rather than computed client-side from cached headers.
- **Custom Labels are out of v1.** A fixed 5-tab bar has no room for a
  character's unbounded custom labels without overflow handling (a "more"
  menu) — later ticket.
- **No `last_mail_id` pagination.** The Mail page keeps ESI's single-call
  50-most-recent cap, same as today; going beyond it is a separate feature
  (loading state, per-category cache interplay with an unfiltered
  `last_mail_id` stream), not what makes 30 items feel broken today.
- **No subject/sender search.** Once mail splits across up to 5 buckets, no
  single bucket is likely to need searching within it.
- **Tabs**: All (default), Inbox, Corp, Alliance, Sent — in that order, each
  carrying `/mail/labels/`'s `unread_count` as a badge. A header matching no
  recognized System Label folds into Inbox.
- **One-line mail row**: sender, subject, received date, and System Label
  tag all render on a single line (not the old two-line stack), same fields
  on every tab — including the tag on non-All tabs, traded for one row
  layout instead of a conditional one. **Narrow screens drop the date**
  from the row (mockup's `.phone .mail-date { display: none; }`): sender +
  subject + tag already compete hard for ~340px, and the date is the one
  field also visible in the reading pane once a mail is open, so it's the
  one that can go first.
- **List pane shrink-to-fits** up to a max-height, then scrolls internally;
  it does not take a fixed full-viewport height. The reading pane keeps its
  own independent scroll, so a long body never stretches the page.
- **Reading pane gains a "To:" line** above the body, names resolved the
  same way the existing sender name already is.
- **Narrow screens reuse the Market Browser's one-column-at-a-time
  pattern**: tab bar + list, replaced by reading pane + back control on
  selecting a mail. The tab strip itself scrolls horizontally within its own
  bar on narrow widths rather than gaining a second narrow-only rendering
  (icon-only tabs, wrapping, etc.).
- **Export CSV is removed**, not just re-scoped. Tab-filtered mail buckets
  make "export what I'm looking at" ambiguous enough (which tab? unioned
  across tabs?) that dropping the feature is cleaner than picking a scoping
  rule for a button that predates the tabs.

## Scope decisions (round 19) — app-wide page width

- Nearly every route sat at `mx-auto max-w-3xl` (768px) regardless of
  content, a pattern predating Market's and Mail's two-pane rebuilds. This
  round retiers that width, **widen only** — no page gets restructured as
  part of it.
- **Tiers**: `max-w-3xl` unchanged (Overview, Settings — nothing measurably
  cramped, more width is just dead space); `max-w-5xl` (1024px) for
  everything single-column that the content survey showed genuinely
  squeezed — Clones, EmploymentHistory, Contracts, Contacts, Wallet, Orders,
  Skills, Characters, Assets, PlanetaryIndustry, Calendar, SkillPlans,
  Industry; `max-w-6xl` unchanged for the two-pane pages (Market, Mail).
  **SkillCompare goes to a generous cap (`max-w-7xl`) with its `DataTable`
  wrapped in its own `overflow-x-auto` container** — same pattern
  `MaterialsTable` already uses. A capless `w-full` was considered and
  rejected: `DataTable` renders a bare `<table>` with no built-in scroll
  fallback, so uncapped width with unbounded per-character columns would
  either force the whole page to scroll sideways or produce absurdly wide
  rows on a large monitor, once enough characters are selected.
- **Calendar and Industry stay vertically-stacked master-detail** (list
  Panel above detail Panel/editor) — they are Mail-shaped (Industry's
  materials table already needed its own `overflow-x-auto` at 768px, the
  clearest evidence), but converting them to a real side-by-side pane is
  deferred as its own follow-up per page, not bundled into a width pass.
  SkillPlans got its own follow-up in round 21.
- **Assets** gets the `max-w-5xl` tier now (less name truncation, more room
  per tree-depth indent); replacing its hover-tooltip detail with a real
  detail pane (a tree+detail split, the same shape as the deferred
  Calendar/SkillPlans/Industry work) is separately deferred.
- **Characters' card grid gains a `lg:grid-cols-3` breakpoint** at the wider
  width (a real third column, not wider padding on two); PlanetaryIndustry's
  repeated colony panels get the same treatment where applicable.

## Glossary (round 20 additions)

- **Install Prompt**: A one-time, in-app call-to-action to install NeoCom
  Desk as a home-screen/desktop app, layered on top of the browser's own
  passive PWA affordance (already present via `vite-plugin-pwa`). Platform-
  appropriate: captures the native `beforeinstallprompt` event on Chrome/Edge
  desktop and Chrome Android; on iOS Safari, where `beforeinstallprompt`
  never fires, it's a static "tap Share → Add to Home Screen" instructional
  banner instead. Shown once ever per device — accepting or dismissing either
  one permanently suppresses it, no snooze or re-ask.
- **Notification Event**: One of a fixed catalog of character-state changes a
  user can be notified about — Skill Level Complete, Character Not Training,
  Industry Job Complete, New Mail, Planetary Extraction Done, Market Order
  Filled, New Calendar Event, Calendar Event Starting, Contract Accepted,
  Wallet Balance Changed. Each is independently toggleable per Character.
- **Character Not Training**: Fires when a Character's skill queue shows no
  active training (the head entry has no live `finish_date`) — whether from
  an empty queue or a stalled/alpha-incapable queue head. ESI exposes no
  Omega/Alpha or subscription field at all (confirmed on CCP's own forums —
  deliberately excluded so characters can't be correlated to one account), so
  the _cause_ can never be distinguished; only this one unified symptom is
  detectable. Distinct from **Skill Level Complete**, which fires per
  finished queue entry while training continues.
- **Market Order Filled**: Fires when any of a Character's market orders
  completes — a sell order being bought out, or a buy order being delivered.
  Both directions count as one event type, not two.
- **Foreground Poller**: Client-side interval (5 minutes) that checks each
  enabled Notification Event's underlying ESI data while the app is open and
  the tab/window is visible; paused via the Page Visibility API when
  backgrounded, with an immediate catch-up check on regaining visibility.
- **Background Sync Poller**: A hand-written service worker (`injectManifest`
  Workbox strategy, replacing the current auto-generated `generateSW` one)
  registered for the Periodic Background Sync API, so notifications can still
  fire when the app isn't open. Chrome/Edge desktop + Android only (no
  Safari/Firefox), requires the PWA installed, and runs on a browser-decided
  schedule with no fixed interval — a best-effort supplement to the
  Foreground Poller, never a replacement for it.

## Scope decisions (round 20) — Install prompt & notifications

- **No true server push.** Doing so would mean sending EVE refresh tokens
  off-device or standing up a real polling backend, reversing ADR 0001.
  Out of scope for this work.
- Event-detection logic (the "did X change" diff per Notification Event)
  lives in `src/engine` as pure, TDD'd code shared by both pollers; only the
  scheduling/permission/orchestration shell is service-worker-only and not
  unit-testable the way the rest of the app is.
- Notification preferences are **device-local** (`useLocalSetting`
  precedent), not synced Editable Data — browser permission is inherently
  per-device, so syncing "what I want to hear about" across devices would be
  misleading when each device's actual permission grant is independent.
- Preferences scope: one master, app-wide, device-level kill switch gates
  both the real OS `Notification` permission and every per-Character toggle
  beneath it; below that, every Notification Event is independently
  toggleable per Character, on by default.
- Settings UI: per-character collapsible sections (Trained-skills precedent,
  issue #108), each with a select-all/none checkbox for that character's
  event toggles, plus a text search that filters event types in place across
  all sections (Market Browser/Trained-skills search pattern).

## Scope decisions (round 21) — Skill Plans side-by-side layout

- SkillPlans is the first of round 19's three deferred pages (Calendar,
  SkillPlans, Industry) to convert from vertically-stacked master-detail to
  a real side-by-side pane, mirroring Mail's shipped two-pane shape
  (round 18): list left, detail right, each with its own independent
  scroll, `useIsDesktop`-driven `hidden`-class toggling on narrow screens,
  and a back control shown only when narrow. Calendar and Industry remain
  deferred.
- **The list/editor route split (round 17) is unchanged.** `/skills/plans`
  and `/skills/plans/:planId` stay separate routes — this round is purely
  about how the two are presented together, not about merging them. Both
  routes render the same `PlanListPane` (data + create/duplicate/delete/
  rename) in the left column; the right column is either the character's
  current attributes (list route — round 26 replaced this round's "select a
  plan" placeholder, which only repeated what the list beside it said) or
  the full `PlanEditor` (editor route).
  Navigating between the two routes still unmounts/remounts that pane like
  any other route change; only switching which plan is open _within_ the
  editor route (`:planId` changing on the same route element) keeps it
  mounted.
- `SkillPlanEditor` widens from `max-w-3xl` to `max-w-5xl`, matching
  `SkillPlans`' round 19 tier — the two need one shared width now that they
  render as columns of the same page shape.
- The desktop-breakpoint media-query hook (`DESKTOP_QUERY` + the
  `isDesktop` state/effect pair) was identical in `Mail.tsx` and
  `Market.tsx` already; adding a third copy for SkillPlans was the trigger
  to extract it to `src/lib/useIsDesktop.ts` instead, adopted by all three.

## Scope decisions (round 22) — Mail custom labels & pagination

- **Round 18's "Custom Labels are out of v1" and "No `last_mail_id`
  pagination" are both reversed** (issue #161). They were deferrals pending
  an overflow affordance and a cache story, not permanent exclusions; this
  round supplies both.
- **Custom Labels get a chip row, not tab-bar overflow.** Round 18 deferred
  them for want of a "more" menu; a `FilterChip` row beneath the fixed
  five-tab strip is the cheaper answer and reads better — the tabs stay the
  five authoritative System Label buckets, and the chips are visibly a
  second, additive filter surface rather than more of the same thing. Chips
  are absent entirely when the character has no Custom Labels.
- **Tab and chips compose as AND.** The tab picks the System Label bucket;
  selected chips then narrow that bucket to mail carrying any one of them
  (OR within the chips). Both filter surfaces persist across a manual
  refresh.
- **Pagination runs against the unfiltered stream, filtered client-side.**
  `last_mail_id` cursors the whole mailbox, not the active tab — ESI has no
  per-label cursor, and paging a filtered view against an unfiltered cursor
  would stall on a tab whose next match is 200 mails down. "Load more"
  therefore lengthens the underlying list; the active tab and chips re-filter
  it as they already do.
- **A full 50-row page is the only "more may exist" signal.** ESI returns no
  total count, so the control hides once a short page comes back. A failed
  fetch leaves the list untouched and keeps the control available to retry.
- **Names are resolved per page.** `/universe/names` is batched for each
  loaded page, not just the snapshot's first one — otherwise every row past
  the first 50 renders as "Unknown".

## Scope decisions (round 23) — navigation: character menu & Overview tabs

- The desktop rail's Character block moves from above the nav groups to a
  **pinned footer**, and stops being a link to `/characters`: it is a menu
  now (ADR 0004's `DropdownMenu`, as the plan editor's export menu already
  does) holding
  **Characters** and **Settings**, both of which leave the rail proper. Its
  accessible name is the pilot's own name — Radix supplies
  `aria-haspopup="menu"`, so a wrapper label would only make the name less
  useful. Deliberately _not_ called an account menu: an Account has no
  storage, no sync and no server-side identity, and is never surfaced as a
  thing to manage (glossary, round 1).
- **The General group is gone.** Removing Characters and Settings left it
  holding Market alone, and a heading over one item says less than the item
  does. Market moves into Economy and leads it: it is the one economy view
  that answers a question before you own anything. Overview keeps sitting
  ungrouped above the headings, so the rail is now Overview, Progression,
  Economy, Social.
- **Clones and Employment History become tabs of Overview**
  (`features/character/OverviewSubNav.tsx`) rather than rail entries, and
  keep their existing top-level paths — they are grouped _visually_, not
  re-parented under `/overview`. Nesting them would have forced a redirect
  for every existing bookmark and collapsed three independent `ScopeGate`
  decisions into one: `/clones` needs `esi-clones.read_clones.v1`, the other
  two are UNGATED, and a single gate over the trio would hide two working
  views whenever the clones grant is missing. Real routes, not a `Tabs`
  widget — same call as `SkillsSubNav`.
- The missing-scope marker travels with the route: `OverviewSubNav` renders
  it on the Clones tab, because the rail no longer lists `/clones` and round
  4's rule is that the affordance is centralized rather than per-view.
  Dropping the marker with the rail entry would have hidden a re-auth need
  behind a tab.
- The three tabs must share one width, or the page visibly resizes as you move
  between them — round 19's tiering assumed Overview stood alone, which as one
  of three tabs of a single page shape it no longer is. The app-wide
  `max-w-6xl` pass (#212) settled this on its own while this work was in
  flight, so nothing here changes a width; the constraint is recorded because
  reintroduce the jump.
- **The three tabs also share one header.** Everything above the tab strip is
  the same on all three: portrait, character name (the `<h1>`), corporation /
  alliance and the two SP chips — `features/character/CharacterHeader.tsx`.
  Nothing else — the header takes no controls slot, so the block above the
  tabs is the same on every tab down to the last pixel. A view's
  `DataAgeBadge` and its Refresh live on that view's `Panel` toolbar below the
  tabs, where Overview's panel badges already were; the panel wraps the
  loading, empty and failed branches too, since those are the states a
  Refresh exists for. Clones and Employment History previously opened with a `PageHeader`
  whose title merely restated the tab directly beneath it, so switching tabs
  swapped the identity block in and out — the same page visibly rebuilding, the
  width rule above in a different guise. The two scope-light tabs feed the SP
  chips from `features/character/characterSp.ts`, which **skips its /skills
  read entirely without the grant** and leaves the chips reading "—":
  Employment History is public and must not start demanding a scope, and a
  guaranteed 401 would raise the shell's stale-grant notice over it.
- The tab reads **"Employment"**, not "Employment History": the tab strip is
  the label's only home now, "history" is what a list of past corporations
  self-evidently is, and the shorter word keeps the three tabs on one line on
  a phone. The route (`/employment-history`), its module names and the view's
  own copy are unchanged.
- Mobile: the bottom bar drops Characters (Overview / Skills / Industry /
  More), and the More sheet leads with the Character disclosure. That
  disclosure is a hand-rolled `aria-expanded` row, **not** a `DropdownMenu`:
  `DropdownMenuContent` portals to `document.body`, outside the top-layer
  `<dialog>` the sheet opens with `showModal()`, so it would render and then
  refuse every click. It leads the sheet rather than trailing it because it
  is the only route to Settings on a phone.
- `nav.overview` is relabelled **"Home" -> "Overview"**, matching what the
  route, this document and the round 19 width table have called it all along.

## Scope decisions (round 25) — cache everything, warm it at boot

- **Every API-derived surface is cached in the browser and warmed on load.**
  Skills, industry, planetary industry, wallet, assets, orders, contracts,
  mail, calendar and contacts (plus clones, an Overview tab) are pulled into
  Dexie at app start and on each Character switch, so network slowness is
  invisible once the app is open rather than showing up as a spinner on
  whichever page is opened first.
- **The warm-up is eager, not tiered.** Assets, wallet journal, wallet
  transactions and order history are multi-page walks a given session may
  never open; warming them anyway was chosen deliberately over a
  cheap-endpoints-only first tier. ESI rate-limits on _errors_, not request
  count, so a burst of successful reads is not itself a hazard, and the
  concurrency cap (`ESI_FANOUT_CONCURRENCY`) bounds the burst regardless.
- **Ten minutes is the app-wide freshness floor**, overriding ESI's own
  shorter cache times (60s–300s on most character endpoints). It is a floor,
  not a ceiling: an endpoint ESI caches for an hour keeps the hour. Game
  constants — universe types, stations, systems, routes, PI schematics,
  structures, a delivered mail's body, an issued contract's item lines — get a
  day instead; refetching those on a ten-minute cadence would spend the
  prefetch budget re-learning things that do not change.
- **No bulk endpoint exists to shrink this.** ESI is one route per resource
  per Character with no batch form and no tunable page size; `POST
/universe/names` (already used) is the only bulk call in the API surface the
  app touches. Replaying **ETags** so a repeat fetch answers `304` with no
  body is the one real reduction left, and is deferred to its own change —
  the client already handles `If-None-Match`, but no loader persists an etag.
- **A manual refresh bypasses the window only while it runs.** The
  invalidation signal is one global timestamp; unbounded, one Refresh on
  Wallet would send the next visit to every other page back to the network.
- Prefetch progress gets **its own dot in the rail beside the sync dot**,
  present only while a run is outstanding. A second permanently-idle dot
  beside the first would say nothing.
- **Past the window a slow call gets a quarter second before the stored rows
  are shown instead.** The defect being closed is _slowness_, not staleness:
  offline fails fast, so the cache fallback was already quick, but a slow or
  hanging connection left the page on a spinner over data the device already
  held. Racing rather than substituting a stored row unconditionally is the
  deliberate choice — on a healthy connection the call wins comfortably, so
  the page shows _fresh_ data with no stale-then-swap flash, and every view
  keeps the auth-failure behaviour it had. A quarter second is under the
  threshold where a spinner would have appeared anyway.
- **A row substituted at the grace mark reads as current, not cached.** No
  offline banner appears while the call is still in flight — there is no bad
  news yet. If it then fails, the view re-reads and _does_ raise the banner
  (or the re-login prompt), so an optimistic render never becomes a permanent
  lie. That failure is remembered, which is also what stops the re-read
  starting another slow call and looping.
- **Two carve-outs from substituting a stored row.** A manual Refresh awaits
  the network — the user is watching the button and it must report what
  actually happened. Game constants are never substituted; a lapsed 24h row is
  a station name, and a re-render per distinct location for data that has not
  changed is all cost.

## Scope decisions (round 24) — Variations attribute compare

- **"Compare" now names two different things in the Market route**, and this
  is accepted rather than renamed (issue #146). Round 6/8's **Compare** is
  the Quickbar price comparison — a `Compare (N)` bottom drawer over an
  explicitly built set, comparing _prices across hubs_. This round's Compare
  is a button in the Variations section header opening a modal that compares
  _dogma attributes across an implicit set_ (whatever the Variations table is
  currently showing). Both match what the EVE client calls Compare in the
  same two places, so renaming either to disambiguate would cost more
  familiarity than the collision costs. They are distinguishable in context:
  one is a persistent drawer with a count, the other a modal opened from a
  section header.
- **The compared set is exactly the Variations table's rows** — the same
  capped array the table renders (round 19's `VARIATIONS_LIMIT`), not the
  uncapped total, and not including the selected item itself, which is not a
  row in that table either.
- **Price is a row, not a mode.** Estimated Price (best sell) is the first
  row under a synthetic "Worth" group rather than a separate tab or toggle,
  so one matrix answers both "what does it do" and "what does it cost". It
  reuses the order-book summaries the route already fetched for the table.
- **No relative best/worst coloring.** Deferred: it needs a "higher is
  better" classification per attribute that the SDE does not carry, and
  guessing it would be wrong for resistances, signature radius, and every
  other lower-is-better attribute.
- **Flavor text is excluded** from the matrix — multi-paragraph prose does
  not tabulate; it stays reachable via Show Info / `ItemDetailModal`.

## Scope decisions (round 25) — Industry side-by-side layout

- **Round 21's "Calendar and Industry remain deferred" is partly reversed**
  (issue #159). Industry is now the second of round 19's three deferred
  pages to convert from vertically-stacked master-detail to a real
  side-by-side pane, in the same shape SkillPlans took in round 21 and Mail
  in round 18: list left at `20rem`, detail right, `useIsDesktop`-driven
  `hidden`-class toggling on narrow screens, and a back control shown only
  when narrow. **Calendar remains deferred.**
- **The narrow-screen collapse keys on the explicit `selectedId`, not
  `effectiveSelectedId`.** Industry (unlike Mail and SkillPlans) falls back
  to auto-selecting the first plan so the desktop pane is never empty. That
  fallback must not drive the collapse, or a narrow-screen visitor would
  land inside whichever plan sorted first instead of on the list.
- **The detail subtree is not rendered at all while collapsed away**, rather
  than merely `hidden`. `BuildPlanDetail` fetches market prices for its
  plan's materials on mount; mounting it behind `hidden` would spend a
  narrow-screen visitor's bandwidth on a plan they never opened.
- **The detail pane's inner scroll is `lg:`-gated**, unlike the list pane's.
  `BuildPlanDetail` stacks three top-level Panels, so an unprefixed
  `max-h-[32rem]` would squeeze a viewport-sized editor into a nested
  scroll region on a phone — the same argument round 21 made for
  `SkillPlanEditor`. The list pane keeps the unprefixed cap it shares with
  `PlanListPane`.
- **The two-pane idiom is still not extracted into a shared component**, and
  this is now a deliberate, recorded choice rather than an omission. The
  breakpoint hook was worth extracting at copy three (round 21) because it
  was identical logic; the surrounding markup is not. Each of the four pages
  differs in what gates visibility (Mail and Industry on a selection, the two
  SkillPlans routes on the route itself), in whether the detail pane is
  wrapped in a `Panel`, in which pane owns the scroller, and in whether that
  scroller is `lg:`-gated. A component absorbing all four would take more
  props than the markup it replaces. Revisit if a fifth page wants the same
  shape.

## Scope decisions (round 26) — Skills opens on Plans

- **The Skills section opens on Skill Plans, not trained skills.** Planning is
  what a visitor comes to this section to _do_; the trained list is reference.
  `/skills` becomes an index route that redirects (`replace`) to
  `/skills/plans`, and the trained view moves to a route of its own,
  `/skills/trained`. A redirect rather than rendering the plan list at
  `/skills`: one view keeps one URL, which is what every existing "Back to
  plans" link and the editor route already point at. The rail and mobile-bar
  links stay on `/skills` (non-`end` `NavLink`s), so the section highlight
  still covers all three tabs.
- **`SkillsSubNav` puts Plans first**, ahead of Trained and Compare. A section
  that lands on its second tab reads as broken.
- **The list route's detail pane shows the character's current attributes**,
  replacing round 21's "select a plan, or create one" placeholder (issue: that
  box repeated what the list beside it already said). Attributes are the input
  every plan is costed against and the thing a remap changes, so they are the
  reference a planner wants beside the list. The pane stays desktop-only, as
  the placeholder was: below `lg` the list owns the column, and the editor
  takes it once a plan is open.
- **The attribute chips are one component, shared** (`AttributeChips`), rather
  than the trained view's markup copied. ESI reports the _effective_ value, so
  base is what's left once the implant bonus comes off; that arithmetic now
  lives once.
- **A display of the character's sheet never falls back to defaults.**
  `usePlanEditorData` keeps its `DEFAULT_ATTRIBUTES` fallback so the scheduler
  always has numbers, and additionally exposes ESI's own nullable read
  (`attributesResult`) for anything that _shows_ attributes — a failed fetch
  renders unknown, not a plausible-looking sheet.

## Scope decisions (round 27) — Industry materials context menu

- **The item context menu (round 6) reaches the Build Plan materials table.**
  A material is an item like any other, so it answers to the same
  `ItemContextMenu` the Market Browser, Assets and Variations rows use — add
  to Quickbar, show info, add to Compare, view in Market, copy name, jump to
  a Build Plan. No Industry-specific menu, and no new strings: a seventh
  surface for the existing one.
- **"Build Plan" on a material means the material's own plan, not a nested
  sub-build.** The action takes the same `?product=<typeId>` round trip the
  Market Browser's does, landing back on `/industry` to create-or-select a
  plan for whatever blueprint manufactures that material. That answers
  "should I build this component instead of buying it" by putting two plans
  side by side in the list, which the round-25 layout already supports. A
  Bill-of-Materials rollup — one plan absorbing its components' costs
  recursively — is a different feature and stays out: `BuildPlanRecord` is
  one blueprint per plan, and v1 industry scope is manufacturing only.
- **Industry never shows the "Build Plan (checking…)" label.** Market and
  Assets load the blueprint catalog lazily when their menu opens, so they
  pass `undefined` while it is in flight; Industry already holds the catalog
  to render a plan at all, so its lookup is synchronous and the action
  resolves straight to "Build Plan" or "No blueprint options".
- **The Quickbar's Dexie write lives in one hook** (`useQuickbar`), not
  copied per page. Three surfaces now offer "Add to Quickbar", and the write
  is a `db.quickbars.put` plus an `isSyncConfigured()`-guarded sync schedule
  that a fourth surface could easily get half-right.

## Scope decisions (round 28) — per-attribute What-If Implants

- **A What-If Implant set is five independent bonuses, not one number.** The
  control only offered a uniform +1..+5 in every slot, which no real clone
  wears: hardwirings are fitted per attribute, so +4 PER / +5 INT / +3 MEM /
  nothing else is the ordinary case and was inexpressible. The presets stay
  exactly as they were — **None**, **Current** and the five matched sets are
  each still one click — and per-attribute editing is layered on top of them
  rather than replacing them, so the common case never costs five
  interactions.
- **A preset populates the five values; editing one value makes the selection
  Custom.** Picking a preset fills all five; editing a slot seeds a custom set
  from whatever the preset currently resolves to, changes that one slot and
  leaves the other four alone, and the picker flips to a **Custom** entry that
  exists only while it is in force — Custom is a readout of the values, never
  something to choose. The five inputs are always visible (one row of five
  under the picker, not a disclosure), because the whole point of the lens is
  that what the plan is being costed against is legible.
- **"Current" stays a distinct preset rather than becoming initial values.**
  It resolves late, against whatever the character is wearing when the
  schedule is computed, so it is always the clone's real fitted set and never
  a snapshot that goes stale when ESI re-reads the implants. That is also what
  makes it the one-click way back after experimenting, which is required: a
  hypothesis the user cannot undo is a trap.
- **The lens is not persisted, unlike the Columns and Group-by preferences
  beside it in the same pane** (superseded by round 33 — it is stored on the
  plan and syncs with it). Those are presentation-only; this one changes
  the numbers — the header's projected finish, the optimization badge and both
  optimizer results are all computed against it. Below `lg` the tools pane is
  a _collapsed_ disclosure, so a remembered "+5 everywhere" would silently
  inflate every figure on the page with nothing on screen saying why. It
  therefore resets to **Current** — the truth — on every mount.
- **The +0..+5 clamp lives in the resolver, not only on the input.** Bonuses
  are rounded and clamped as they are read, so a cleared field, a pasted word
  or an implausible stored value can never reach `computeSchedule`, which
  would otherwise add it to an attribute and report a NaN finish date. The
  resolver returns all five slots (`0` for an empty one) rather than a sparse
  map: every consumer already reads `implants[name] ?? 0`, and one shape means
  the control never has to ask whether a slot is absent or zero.
- **The what-if control and a display of the character's current attributes
  stay two things.** They share five attribute names but not a unit — the
  control edits _implant bonuses_ (0..5), an attributes display reads
  _effective attribute points_ (`20 + 4 = 24`, which `AttributeChips` already
  folds the bonus into). Merging them would either make the character's real
  sheet look editable or make the hypothesis look like fact, and round 26
  already rules that a display of the sheet never falls back to defaults while
  the planner's lens must always be operable.

## Scope decisions (round 29) — make-or-buy marker + planetary recipes

- **One glyph per material row, and it carries the verdict, not the source.**
  "Better to craft or buy" is what the marker answers: a hammer for a
  material worth producing, a cart for one worth buying, and nothing at all
  for a material nothing produces. Two distinct shapes rather than one shape
  in two tones, because the verdict has to survive greyscale and a screen
  reader (docs/DESIGN.md §7); how it is produced — a blueprint or a planetary
  schematic — is named in the label instead of taking a glyph of its own.
- **It is the deliberate one-level version of the rollup round 27 scoped
  out.** Each material is quoted on its own recipe with the inputs priced at
  the hub, never recursively: a component's own components stay at their
  market price. That is the read an industrialist actually makes at the shelf
  — "buy this part, or run a job for it" — and it needs no change to
  `BuildPlanRecord`, which is still one blueprint per plan.
- **A quote is sized to a real job, at the ME the character actually has.**
  Runs are `ceil(units still to buy / units per run)`, because EVE rounds
  material use once per job rather than per run, and ME comes from the best
  copy of the sub-blueprint the character owns (else 0) — the same rule the
  ME field's "Owned" hint already shows. The job fee is included; sales tax
  and broker fee are not, since a material is consumed by the parent job and
  never listed.
- **No verdict beats a bad verdict.** The marker is gated on the same live
  prices the results panel needs: without adjusted prices and a system cost
  index there is no job fee, and a fee-free quote would call almost
  everything worth building. A material with an unpriced recipe input, or no
  price of its own, is likewise left unmarked.
- **Planetary industry gets a recipe payload of its own** (`public/data/pi.json`,
  ~13 KB, precached): schematics keyed by the typeID they produce, with item
  names carried inline because most planetary commodities are referenced by
  no blueprint and so are absent from `types.json`. Its costing is the
  inputs at hub prices over one cycle's output — planet setup, cycle time and
  the customs-office export tax are outside the number, and said so in the
  label. The same payload answers "how is this made" in Item Detail, which
  is the question a planetary commodity's info panel exists for.

## Glossary (round 30 addition)

- **Training Progress**: How much SP a Character has already banked toward
  the level it is training _right now_. Distinct from **Trained Skills**,
  which is levels finished. ESI reports it in two places that disagree:
  `/skills`' `skillpoints_in_skill` is frozen near where training began,
  while `/skillqueue` carries `training_start_sp`, `level_end_sp` and the
  window the level trains across — enough to interpolate the true figure,
  which is what the in-game queue itself displays.

## Scope decisions (round 30) — a plan's times match the in-game queue

- **A part-trained level is charged for what is left of it, not for the whole
  level.** `computeSchedule` previously costed every step as a full level, so
  a plan opening on the skill the Character was training re-charged SP
  already paid for and read hours longer than the in-game queue for the same
  entry. The credit is `remainingSpForLevel`, and it applies only to the
  level actually in progress — `currentSp` is clamped into that level's own
  band, so no later level of the same skill is discounted.
- **Training Progress is a snapshot, not a live ticker.** It is interpolated
  once per load, in `applyTrainingProgress`, from the queue as of that
  moment. The alternative — a ticking clock the plan recomputes against —
  would make every number in the editor move while being read, for a
  precision nobody planning months of training needs. It is folded in
  alongside the existing completed-queue correction (round 4's issue #40
  work): that pass raises finished _levels_, this one raises the _SP_ inside
  the level still running, and neither is a widening of the other.
- **The credit is opt-in at the engine boundary**, an optional
  `ScheduleOptions.trainedSkills`. `placeRemaps` deliberately does not pass
  it: it takes its no-remap baseline from `computeSchedule` but costs its
  remap branches from `(rank, level)` alone, so crediting one side only would
  make the baseline artificially cheap and shrink reported savings toward a
  false "no remap improves this plan". A uniform overstatement on both sides
  cancels out of a difference, which is all that verdict reports.
- **The plan summary discloses a What-If Booster on the total.** Its
  arithmetic was never wrong — a +12 accelerator adds exactly `12 + 12/2 = 18`
  SP/min, around a third of a typical rate — but the headline training time is
  the number users check against the in-game queue, and it read a third fast
  with nothing on it to say why. `EntryList`'s per-row Booster mark already
  covered the rows; this covers the total. Shown only while the Booster is
  live, since `computeSchedule` ignores an expired one and disclosing it
  would be its own small untruth.

## Glossary (round 31 addition)

- **Prereq Promotion**: turning a derived prerequisite row in the Skill Plan
  editor into a real, user-owned plan entry at that position. Prereq rows are
  recomputed from the entry list on every schedule run, so they have no
  position of their own to save; promotion is what gives one. A promoted
  prereq is an ordinary entry from then on — same drag handle, priority
  control and remove button — and its own upstream prerequisites stay derived,
  moving with it.

## Scope decisions (round 31) — draggable prereq rows

- **Prereq rows are draggable, and dragging one promotes it** (supersedes
  round 17's "dimmed, non-interactive rows"). There is nowhere else for a
  dragged prereq row to persist a position to: the normalizer rebuilds those
  rows from the entry list every run and would discard any parallel ordering
  stored beside them. So the drag creates the entry rather than trying to
  remember the row — target level is the level of the row dragged, and if the
  skill is already an entry that entry is moved and its target raised rather
  than duplicated (one entry per skill, as `reorder.ts` requires).
- **Promotion has a non-drag path.** Every prereq row carries a "+" button
  that promotes it exactly where it already sits. Drag is a discovery problem
  on a phone and a dexterity problem for some users, and neither is a good
  reason to be unable to claim a prerequisite.
- **No automatic demotion.** An entry whose levels a later edit makes
  redundant stays an entry; it leaves the plan only via its own remove
  button. Promotion is the user taking ownership of a row, and silently
  handing it back would be the same class of surprise this round removes.
- **A drop the scheduler would silently undo is refused, with a reason.**
  Prerequisite order is enforced by construction in `plan.ts`, so dropping a
  skill after something that requires it never errored — it produced a
  zero-time ghost row while the schedule trained the skill where it always
  had. The editor now rejects that drop outright and names the entry that has
  to stay behind it, leaving the plan untouched. This covers ordinary entry
  drags too, not just promotions: the silent correction was the same one.
  It is the same principle as "reorder never applies silently" (round 12) read
  from the other side — the plan never _ignores_ a reorder silently either.

## Glossary (round 32 addition)

- **Base sheet** — the character's attributes as base + remap alone: five
  values, each 17..27, totalling exactly 99. The only thing a remap can
  change, the space the optimizer searches, and the input `computeSchedule`
  and `placeRemaps` expect. Distinct from the _effective_ values ESI reports,
  which fold in implants and any cerebral accelerator on top.
- **Detected Accelerator** — a cerebral accelerator inferred from a base sheet
  that is over budget, by the size of the excess. Prefilled into the Booster
  control; not a separate mechanism.

## Scope decisions (round 32) — accelerator-inflated attribute sheets

- **ESI reports effective attributes, and that includes a cerebral
  accelerator.** `GET /characters/{id}/attributes` folds in every modifier on
  the character. Round-1 code already subtracted fitted implants (the
  "Savings: 0m" fix); nothing subtracted an accelerator, because no ESI
  endpoint says one is running. A reported +12 therefore landed in the base
  sheet, and the same +12 landed again from the What-If Booster control — the
  double count behind a plan costed at 74.5 SP/min against the game's 56.5.
- **An out-of-budget base sheet is what silently zeroed the optimizer.** The
  user's sheet derived to 159 points against EVE's 99. `bestAttributes` can
  only offer allocations inside 17..27/99, so every one of them was slower
  than the character's own numbers, and `placeRemaps` — correctly, by its own
  contract that it never returns a plan slower than not remapping — kept them
  and reported zero savings. There is no bug in `src/engine/optimizer/`; a
  characterization block in `placeRemaps.test.ts` pins that down so nobody
  "fixes" it there. The fix belongs where the sheet is derived.
- **The accelerator is recovered by arithmetic, not by a table of known
  boosters.** A cerebral accelerator adds the _same_ bonus to all five
  attributes and a base sheet always totals 99, so the bonus is
  `(total - 99) / 5` — which covers every tier CCP has shipped or will ship,
  where a lookup of item names would need editing for each new one.
- **The recovery is accepted only when it verifies, and there is no third
  branch.** `deriveAttributeBaseline` takes the decomposition only if the
  bonus is a whole positive number _and_ all five attributes land back inside
  17..27. Anything else is reported as **impossible** and carries no
  attributes at all — the scheduler falls back to the same placeholder spread
  it already uses when ESI cannot be read, and the pane says so. A
  proportional or clamped approximation was considered and rejected: a wrong
  baseline is what caused this bug, and a wrong baseline derived more
  cleverly would be worse, because it would look right. `17..27` per attribute
  is not enough on its own either — clamping 29/38/34/29/29 gives 135, still
  over budget and still unbeatable.
- **A legal sheet is a total no-op.** No accelerator, no notice, no prefill,
  no changed number — that is the state almost every character is in almost
  all the time, and it is tested as its own case rather than as a corollary.
- **A detected accelerator is modelled as a Booster, prefilled and editable —
  never frozen into the base sheet.** It goes through the same `Booster`
  `computeSchedule` already splits a step at, so a bonus with a fortnight left
  stops paying after that fortnight instead of speeding up all 200 days of a
  long plan. Prefilling the control the user already knows is what makes the
  correction legible rather than magic; it seeds only while the control is
  untouched, and is theirs to change or clear afterwards. (Round 33 restates
  "untouched" as "the plan has stored no Booster", now that it stores one.)
- **The expiry is left blank on purpose, and called out.** No ESI endpoint
  exposes active boosters, so the app can read the accelerator's _size_ and
  not its _life_. Inventing one would be the same class of error as assuming
  it lasts forever. A blank expiry means no Booster is applied at all, so the
  plan is costed as if there were none — pessimistic, honest, and stated in
  the pane rather than left for the user to discover as an unexplained
  slowdown.
- **`AttributeChips` still reads `base = effective - implants`, one term short
  of the derivation.** On an accelerated sheet the chips show base plus the
  accelerator. Left as it is deliberately: it is the character's _reported_
  sheet, shown on three surfaces across two routes with their own data
  loading, and the Booster note beside it in the planner names the difference.
  Folding the accelerator in there is a display change for a later round, not a
  correctness one.

## Scope decisions (round 33) — the plan's lenses are part of the plan

- **What-If Implants and the Booster are stored on the Skill Plan and sync
  with it** (supersedes round 28's "the lens is not persisted … it therefore
  resets to Current on every mount"). Round 28 read the pair as presentation,
  next to Columns and Group-by. They are not: they decide what
  `computeSchedule` is handed, so the header's projected finish, the
  optimization badge and both optimizer results are all quoted under them —
  and a plan that reopened on a different lens quoted different numbers than
  the ones its owner left on screen, with nothing saying why. That is round
  28's own objection to remembering them, pointed the other way, and it is
  worse in the resetting direction: a figure the user chose, and can read off
  the pane, beats an unexplained slower one they did not.
- **Both are Editable Data, not device-local preferences.** Columns and
  Group-by stay device-local because they change what is _shown_; these
  change what is _computed_, which is the line the Editable Data entry
  already draws. They ride the existing `plans` collection as two additive,
  unindexed optional fields — no Dexie version bump, same as `markers`.
- **The Booster's expiry is stored as an instant, not as the control's
  wall-clock text.** The plan syncs, and `2026-09-10T14:30` names a different
  moment on a device in another timezone. The `datetime-local` control keeps
  editing local text and the conversion happens at the edge.
- **An empty expiry is committed on blur, never on change.** A native
  `datetime-local` reports an empty value for _any_ incomplete state — a
  cleared segment mid-retype included — so committing on change would erase a
  saved expiry, re-cost the plan and push the erasure to the user's other
  devices. Emptied-and-left means "no expiry"; emptied-and-still-editing
  means nothing yet, and the stored value stands until a complete one
  replaces it.
- **An absent stored Booster is what "the user has not answered" means**
  (refines round 32's "it seeds only while the control is untouched"). The
  accelerator prefill keys off the field's absence rather than off controls
  that happen to still read as default, which is what lets the legitimate
  answer — unticking the box, "that accelerator is gone" — survive a reload
  instead of being re-prefilled on the next one. Round 32 is otherwise
  unchanged: prefilled, editable, never frozen into the base sheet, expiry
  still blank on purpose.
- **Stored lenses are normalized on read and clamped on write.** They can
  arrive from an older build or another device, so an implausible value must
  never reach `computeSchedule` — the same reason round 28 put the +0..+5
  clamp in the resolver. Clamping the write as well is what keeps the stored
  plan saying what the plan is actually costed under, rather than a `+45` no
  screen ever showed.
- **Nothing changed for Build Plans**, which already synced every field a
  user enters, nested `materialSourcing` included. What both plan types
  gained is a pinned test: a fully-populated record whose key list is fixed,
  so a field added to either one fails the suite until its round trip is
  decided. The bug was never a wrong mapping — it was a field nobody
  remembered to map.

## Glossary (round 34 addition)

- **EVE Notification**: The single Notification Event (`eveNotification`,
  issue #274) covering everything `GET /characters/{character_id}/notifications/`
  pushes — a different, non-overlapping source from every other Notification
  Event listed in round 20, which are all synthesized by diffing other ESI
  endpoints. ESI's own `type` enum underneath it is open-ended (~100 values;
  CCP adds more without notice — see esi/esi-issues#1380), so it is
  deliberately **not** modeled as one `NotificationEventId` per type. Instead
  the single event is fetched/toggled like every other, and each raw `type`
  string gets its own independent opt-out underneath, discovered as it fires
  rather than enumerated from a closed list.

## Scope decisions (round 34) — EVE's own notification endpoint

- **Per-type default is feed-on/browser-off**, the opposite of every other
  event's absence-means-on-both-channels default (round 20). These are far
  more numerous and mostly informational, so a type has to be opted _up_ to
  an OS interruption rather than opted down from one; the default has to be
  expressed explicitly per type since it differs from the surrounding
  idiom.
- **Types are discovered from the feed, not enumerated up front.** Settings
  offers a per-type toggle only for a `type` this Character's Notification
  Feed has already recorded at least once — there is no closed catalog to
  list ahead of time, and a type has to have reached the feed before there
  is anything to toggle.
- **Rendering is one generic body for every type in v1**, not a per-type copy
  dictionary. AC2 only requires an unrecognised type to render without
  dropping or throwing; hand-written bodies for the handful of high-traffic
  types (bill amount, war target, structure name) are a follow-up, not
  required to ship the domain.
- **The Overview fallback route is a deliberate choice for this event**, not
  an inherited default: most of ~100 types have no corresponding page in the
  app, so `eveNotification` names `/overview` explicitly in
  `NOTIFICATION_ROUTES` rather than leaving a gap the fallback happens to
  catch.

## Scope decisions (round 35) — bodies for the corp-critical notification types

- **The generic body stays the floor, and a real body is an upgrade on top of
  it.** Round 34 called this the follow-up; issue #300 is it. Seventeen `type`
  strings get a hand-written body naming the thing at stake — the structure,
  the bill's amount and due date, the war's aggressor, the applicant. Every
  other type, including anything CCP ships tomorrow, still renders
  generically. `eveNotificationText.ts` routes _every_ failure back to that
  generic body: an unknown type, a payload field the body needed and did not
  get, a payload the parser made nothing of, a missing translation key, and
  anything thrown on the way. A renderer that threw or returned nothing would
  be a regression against round 34's AC2 even though it looks like an
  improvement.
- **The payload is parsed as a flat `key: value` subset, not with a YAML
  library.** The blob is YAML, but the part these bodies read is top-level
  scalars — a general parser would be a large runtime dependency for a dozen
  keys. `engine/eveNotificationPayload.ts` owns the three quirks that matter:
  the `&id001` anchor CCP attaches to every `structureID`, values that
  contain colons (`structureLink`), and indentation as the only marker
  separating a nested block's keys from top-level ones.
- **Name resolution is a separate, best-effort, time-boxed step that cannot
  hold a notification back.** `eveNotificationNames.ts` does the async lookups
  — structure names through the existing ACL-checked structure cache, entity
  ids through the existing bulk `postUniverseNames` path — catching each one
  on its own _and_ racing each against a fixed budget;
  `eveNotificationText.ts` stays synchronous and renders an id or a neutral
  phrase for anything it was not handed. Catching a rejection alone would not
  satisfy the rule: an ESI call that merely hangs delays the alert just as
  effectively as one that throws. A structure outside the Character's ACL is a
  normal outcome, not an error state.
- **`CorpBecameWarEligible` renders a fixed body, and that is not a violation
  of round 34's AC2.** Its payload really is empty (`{}`), so "an empty
  payload" is its _normal_ case rather than a degraded one; falling back to
  the generic body for it would mean it never gets a real body at all.
  `CorpOfficeExpirationMsg` is the near case: CCP publishes no schema for it
  and it appears in no public sample, so it reads `dueDate` opportunistically
  — the key every other billing type uses — and says the plain sentence when
  that is absent. Neither guesses at a key name it has no evidence for: a
  wrong expiry date would cost the office the notification exists to save.
- **A reinforcement timer is derived from the notification's own timestamp
  plus the payload's `timeLeft` duration**, not from the payload's sibling
  `timestamp` key. The envelope timestamp is the instant ESI vouches for, and
  the two agree on the sample where both can be checked — but only one of
  them is a field CCP can silently repurpose.
