# NeoCom Desk — Ubiquitous Language

## Glossary

- **Character**: One EVE Online character. The unit of login (EVE SSO) and of API data. App supports many Characters side by side from day one.
- **Account**: UI-level grouping of a user's Characters. Has **no storage, no sync and no server-side identity** — EVE SSO exposes no account identifier (`sub` is per-Character; `owner` is the owner hash and changes on transfer), so one cannot be verified. Groupings are device-local by decision, not by omission — see the parity plan §5.7, which also records why account-scoped sync is rejected rather than merely unchosen. Never surfaced to the user as a thing to manage.
- **Editable Data**: Data created inside the app (Skill Plans, Build Plans, settings). Synced across devices. Everything else is API-derived and re-pulled per device.
- **API-Derived Data**: Character data pulled from ESI (assets, mail, wallet, etc.). Cached locally per device for offline viewing. Never synced through the backend.
- **Skill Plan**: An ordered list of skill-level entries a user intends to train. User-editable (drag and drop). Distinct from the in-game **Skill Queue**, which is the game's actual training queue.
- **Remap**: In-game reallocation of a character's attributes. The optimizer suggests where in a Skill Plan remaps should be placed.
- **Build Plan**: An industry plan for manufacturing: blueprints needed, materials, costs, fees/taxes, time, and build-vs-buy comparison. v1 scope: manufacturing only (no invention/reactions).
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
- Hosting: https://shawndibble.github.io/neocom-desk (project page).
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
- The selected item also offers **related items** for price comparison and an
  **item detail modal** (fitting attributes: CPU, powergrid, volume, bonuses).

## Glossary (round 6 additions)

- **Item Detail**: The modal view of one item's own properties — fitting cost,
  volume, bonuses, description. Read live from ESI per item, not from the SDE
  snapshot, so it is the one Market Browser panel that needs the network.
- **Related Items**: The other items in the selected item's Market Group,
  offered beside it for price comparison.
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
  Related Items strip on a chosen item, is dropped: clicking a related item
  already replaces the selection, which re-anchors the strip as a side effect.
- **Related Items are Market Group siblings.** Meta/tech variants need a
  relation the SDE build does not emit yet; they are a later step.
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

## Scope decisions (round 15)

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
