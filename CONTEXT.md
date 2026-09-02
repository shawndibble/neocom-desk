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
- **What-If Implants**: Optimizer override that assumes a hypothetical implant set (+3/+4/+5) instead of the clone's current implants.
- **Booster**: Cerebral accelerator; user toggles it on manually with an expiry date for training-time math.

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
- Multi-scope routes (`/overview`, `/skills`, `/industry`) must degrade per
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
- **No plan-switcher sidebar** on the editor page — a back link plus a
  toolbar pinned above the entry list substitute for it. Import (from
  in-game queue / from clipboard) and Export live in their own compact area,
  separate from the pinned toolbar, which carries only reorder/optimize/
  marker actions — the ones used while actively working the list.
- **"Your entries" and "Computed queue" merge into one list**: one row per
  plan entry (not exploded per individual level), draggable, with priority,
  target level, and an icon-only remove button, plus per-level and cumulative
  training time. Prerequisite skills the user did not add directly still
  appear as their own dimmed, non-interactive rows, positioned where the
  schedule actually trains them.
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
  label, also returned by the same endpoint but not surfaced in the v1 Mail
  page.

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
- **Calendar, SkillPlans and Industry stay vertically-stacked
  master-detail** (list Panel above detail Panel/editor) — they are
  Mail-shaped (Industry's materials table already needed its own
  `overflow-x-auto` at 768px, the clearest evidence of the three), but
  converting them to a real side-by-side pane is deferred as its own
  follow-up per page, not bundled into a width pass.
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
