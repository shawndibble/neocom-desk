# Travel (Route Safety, Thera / Turnur, Travel Settings)

Intel group page `/travel`. Two tabs (`TRAVEL_TABS`, `src/app/pageTabs.ts:29`): Route Safety (`/travel/route`, default for bare `/travel`) and Thera / Turnur (`/travel/thera`). Pilot Lookup left Travel for `/pilot-lookup` (see `docs/features/pilot-lookup.md`). Settings > Travel edits the same stores as the Route rules panel.

Glossary terms (CONTEXT.md): Route Safety, Route strip, Quiet stretch, Stop, Leg, Hole jump, Ansiblex, Way to fly, Pinned way, Avoided Systems, Route Preference, Travel Settings, Jump Basis, Gank Chokepoint, Current System.

Principle in every scope decision: conditions, never verdicts (`20260912-172628`). No system, route or way is called safe/unsafe/better. Unknown is never zero.

## Feature summary

| Feature                              | Where                                                  | Notes                                                                                                                                                            |
| ------------------------------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Route Safety itinerary               | `/travel/route`                                        | One row per system on a stargate route: security, region, last-hour ESI jumps/ship/pod/NPC kills, zKillboard kills. Local graph, no per-row ESI.                 |
| Start picker (From)                  | Stops panel                                            | Defaults to Current System; saved in link `from`.                                                                                                                |
| Stops (up to 10)                     | Stops panel                                            | Add, remove, drag-reorder (keyboard: Space + arrows). Link `stops`.                                                                                              |
| Optimize stop order                  | Stops panel                                            | Exact Held-Karp under active route rules. Options: Return to start, Keep last stop last.                                                                         |
| Route rules panel                    | left column / below route on < xl                      | Route Preference, security penalty, EDENCOM / Triglavian / pod-kill avoid, Avoided Systems, Thera/Turnur holes, Ansiblex. Edits synced Travel Settings in place. |
| Facts chips                          | top of route Panel                                     | Jumps, by gate / wormholes / bridges, high/low/null counts, lowest sec, last-hour kills, chokepoints.                                                            |
| Route strip                          | below facts                                            | One cell per system, security-coloured; chokepoint line, kill dot, hatched hole cell, dashed bridge cell.                                                        |
| Quiet-stretch fold                   | route table                                            | 2+ consecutive middle systems with known-zero figures fold into one row; opens in place.                                                                         |
| Route table                          | route Panel                                            | DataTable: System, Sec., Region, Last hour (ships · pods · jumps), zKillboard kills, Avoid. Row expands for NPC kills + off-route kill spots.                    |
| Avoid system dialog                  | row action                                             | Preview whole trip with system avoided; then save to Avoided Systems.                                                                                            |
| Legs                                 | multi-stop                                             | Collapsible per-leg sections with own header, table, ways panel.                                                                                                 |
| Ways to fly                          | beside each leg                                        | Gates only / Via Thera / Via Turnur / Via Ansiblex / planner's pick; Use for this leg pins one (`pin`).                                                          |
| Hole jump rows                       | route table                                            | Own row: warp-to system + signature + Copy, type, size, life, EVE-Scout age.                                                                                     |
| Ansiblex bridges                     | rules panel + dialog                                   | Device-local list; find via character structure search or paste. One-jump connections.                                                                           |
| Set waypoints in game                | facts line                                             | Sends Stops to EVE client autopilot. Needs `esi-ui.write_waypoint.v1`.                                                                                           |
| Share link                           | URL                                                    | Every setting in query params (see Link parameters).                                                                                                             |
| Thera / Turnur table                 | `/travel/thera`                                        | EVE-Scout open holes: exit, sec, region, fits, life left, jumps, signature, Route via.                                                                           |
| Thera filters                        | Thera tab                                              | From, Hub (with counts), Exit, Fits, Route Preference; Reset filters.                                                                                            |
| Route via                            | Thera row                                              | Opens Route Safety from the origin with that hole pinned for leg 1.                                                                                              |
| Jumps links elsewhere                | Assets, Market, Courier, BPC, PI Hauling, entity links | Jump count opens Route Safety to that system.                                                                                                                    |
| Set waypoint / View route menu items | Market + BPC row menus, order detail                   | One-place autopilot destination via `postAutopilotWaypoint`.                                                                                                     |
| Travel Settings                      | Settings > Travel                                      | Preference, penalty, avoid rules, wormhole/bridge defaults, Avoided Systems.                                                                                     |
| Command palette                      | Ctrl/Cmd+K                                             | Only generic Pages entries; no travel commands.                                                                                                                  |

## Routing, access, scopes

- Route `/travel` gating `ungated` (`src/app/routeScopes.ts:216`): public ESI + local stargate graph, no scope can lock it. Still requires a signed-in Character: `Travel.tsx` waits for `hydrated`, then `Navigate to /characters` when `activeCharacterId === null` (`src/routes/Travel.tsx:35-40`). Logged-out access noted as a possible follow-up (`20260929-234357`).
- Nav: Intel group, `mobileTab: true` (`src/app/navDestinations.ts:234`). Document title `travel.title`.
- Legacy: a defaulted `/travel?pilot=<id>` link redirects to `/pilot-lookup` (only when the tab was defaulted, not explicit): `src/routes/Travel.tsx:25-31`.
- Optional scopes:
  - `esi-ui.write_waypoint.v1` (Permission "Autopilot waypoints", default-on in Base Grant, fifth write exception): Set waypoints / Set waypoint in game. Decision `20261003-175151`.
  - `esi-search.search_structures.v1` + `esi-universe.read_structures.v1`: Ansiblex structure search only (`ANSIBLEX_SEARCH_ENDPOINTS`, `src/features/travel/ansiblexGates.ts`).
- Tab bar `Tabs` label `travel.title`; tab state via `usePageTab(TRAVEL_TABS)`.

## Data sources

| Source                                                                | Used for                                                                                                                                              | Code                                                                        |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Local stargate graph (SDE snapshot)                                   | Route, jumps, ways, distances                                                                                                                         | `src/engine/route/jumpRoute.ts`, `src/features/route/localRoute.ts`         |
| ESI `GET /universe/system_kills/`, `/universe/system_jumps/` (public) | Last-hour ship/pod/NPC kills and jumps for every system; 2 requests per visit, ETag, global cache (not per Character)                                 | `src/features/travel/routeSafetyData.ts`                                    |
| ESI `POST /universe/names`                                            | Region names not in `regions.json`                                                                                                                    | `loadRouteRegionNames`                                                      |
| ESI `GET /universe/stargates/{id}`                                    | Names a kill's gate + `destination.system_id` for "on your path"; once per session                                                                    | `routeKillsData.ts`                                                         |
| zKillboard `kills/regionID/{id}/pastSeconds/3600/`                    | Player kills last hour per region; concurrency 3, 5 min cache per region, paged (1,000/page, 10-page backstop), per-system fallback if region unknown | `src/lib/zkillboard.ts:450`, `useRouteKills.ts`, decision `20261005-125019` |
| EVE-Scout `api.eve-scout.com/v2/public/signatures`                    | Thera/Turnur holes; 5 min memory cache; plain fetch, no custom headers; failed refresh keeps last good list                                           | `src/lib/eveScout.ts`                                                       |
| Dexie `ansiblexGates`                                                 | Known Ansiblex list; device-only, never synced/logged                                                                                                 | `ansiblexGates.ts`                                                          |
| Synced settings (Firestore via `createSyncedSetting`)                 | Route Preference, penalty, avoid rules, hole settings                                                                                                 | `src/features/route/routeRules.ts`, `routeHoleSettings.ts`                  |
| Local setting                                                         | Use jump bridges switch (`routeBridges`); picked Current System                                                                                       | `routeBridgeSettings.ts`, `currentSystem.ts`                                |
| ESI `POST /ui/autopilot/waypoint` (`group: autopilot`)                | Set waypoints                                                                                                                                         | `sendWaypoints.ts`, registry `postAutopilotWaypoint`                        |
| ESI `GET /characters/{id}/search`, `/universe/structures/{id}`        | Ansiblex find                                                                                                                                         | `ansiblexGates.ts`                                                          |

## Route Safety (`/travel/route`)

Component `src/features/travel/RouteSafetyTab.tsx`. Layout: grid, rail (Stops, Route rules) + route from `xl` (1280); below that rail dissolves so order is Stops, route, Route rules (#2591). `PageHeader` shows `DataAgeBadge` of the ESI activity fetch when a route is drawn.

### Link parameters (`src/features/travel/routeSafetyLink.ts:56`, `ROUTE_PARAMS`)

| Param                             | Meaning                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `from`                            | Start system id; absent = Current System                                                                   |
| `stops`                           | Ordered stop ids (max 10, dedup, order typed); legacy `to` still read                                      |
| `opt`, `ret`, `keep`              | Optimize stop order, Return to start, Keep last stop last                                                  |
| `pref`                            | Route Preference override; absent = saved default                                                          |
| `wh`, `whsize`, `whlife`, `whhub` | Hole switch, ship size, min life (0-24 h), hubs override                                                   |
| `jb`                              | Use jump bridges override                                                                                  |
| `pin`                             | Per-leg pinned way, comma tokens (`gates`, `thera`, `turnur`, `ansiblex`, hole id), empty = planner's pick |

Parameter edits `push` history (Back works). Unreadable pin tokens degrade to "not pinned".

Link builders: `routeToHref(systemId, fromId?, preference?)` (View route / jump links; `stops=[systemId]`); `routeViaHref(originId, holeId, preference?)` (Thera Route via; sets `wh=true` in link only, never saved, `pin=[holeId]`, no stop).

### Page states (`RouteBody`, `RouteSafetyTab.tsx:373`)

| State                        | Shown                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `incomplete`                 | EmptyState pickTitle / pickHint (or `ways.pickDestination` when a pin awaits a stop)                         |
| `same-system`                | EmptyState (one stop = start)                                                                                |
| `no-route`                   | EmptyState (no stargate route; single stop)                                                                  |
| `unknown`                    | EmptyState (stargate snapshot unreadable)                                                                    |
| `loading`                    | Spinner                                                                                                      |
| `route`                      | Panel with facts, strip, status lines, leg(s)                                                                |
| status lines (`role=status`) | holes loading; holes unavailable (route gates-only, said so); ESI activity loading; ESI activity unavailable |

Multi-stop: an unreachable stop shows its leg's no-route message while other legs draw; facts line/strip wait for every leg; Optimize disabled (`optimizeBlocked`).

### Stops panel (`StopsPanel.tsx`)

- Start row: `SolarSystemPicker` (button opens popover with local ranked search, 8 matches, combobox keyboard: Arrow/Home/End/Enter). Trigger text marks Current System.
- Stop rows: grip drag handle (dnd-kit; 4px activation; Space + arrows keyboard; screen-reader announcements), numbered badge, name + security, remove IconButton.
- Add stop picker (`showSecurity`, excludes start + listed stops); disabled at 10 with "full" note.
- Fieldset: Optimize stop order (switch; disabled with < 2 stops or blocked), Return to start, Keep last stop last (both only while optimizing). Status note names the flown order + typed vs real jumps when order changed (never written back; typed order kept in link).
- Phone: folds to one line "Start → N stops" with Edit/Done; stays open while no stops (#2519).
- Pins reset when start, stops or order options change, except first stop added to a Route via link.

### Route rules panel (`RouteRulesPanel.tsx`)

Two groups; waits for settings hydration (spinner) so a click cannot overwrite stored values.

1. Travel settings (synced, app-wide; same controls as Settings > Travel via `src/features/route/TravelRuleFields.tsx`):
   - Route Preference SegmentedControl (Prefer shorter / safer / less secure). On this page writes the saved default (`useDefaultRoutePreference`) and clears `pref` (decision `20261006-143832`, amends `20261003-161302`).
   - Security penalty 0-100 (disabled under Prefer shorter, with note).
   - Avoid EDENCOM systems / Triglavian minor-victory systems / systems with >= N pod kills in last hour (threshold 1-100, default 3; warning when pod-kill feed unavailable).
   - Avoided Systems switch + add picker + list with remove (per-row security).
2. Route Safety only (`RouteHoleFields`): Route through Thera / Turnur switch; My ship fits (Small..Capital; picking a hull in Ship I am moving sets it from the hull's SDE group via `engine/route/hullWormholeSize.ts` and shows "Set from <hull>" until the size is edited; industrials, barges, Orca and Rorqual leave it alone); Skip holes with under N h left (0-24, default 1); Hubs (all / Thera / Turnur); Use jump bridges switch (device-local) + "Manage Ansiblex (N)" button opening the dialog. Changing one saves default and drops link override.

Phone: panel folds with `ActiveRuleChips` summarising rules on (preference, penalty if not shortest, avoid chips, avoided count, hole hub, bridge count).

### Facts chips (`RouteFacts`)

Jumps; by gate / through wormholes / over Ansiblex (only when a hole/bridge flown); highsec / lowsec / nullsec counts (J-space excluded); lowest security; last-hour kills "ships · pods" (withheld if any system unknown); Gank Chokepoints list (warning tone when any). Set waypoints control closes the line.

### Route strip (`RouteStrip.tsx`)

`role=img` with spoken description; per-cell tooltip (name, security, kills). Cell colour = `securityStatusColor`; line above Gank Chokepoint; dot on systems with ESI or zKillboard kills; hatched cell per hole jump; dashed-edge cell per bridge jump. Key systems written out under: both ends, lowest security, every chokepoint, every stop (multi-stop).

### Route table (`RouteSystemsTable.tsx`)

| Column                   | Content                                                                                                                                                                                            |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System                   | Name; "Gank Chokepoint" tag with hint                                                                                                                                                              |
| Sec.                     | `SecurityStatus` (card corner on phone)                                                                                                                                                            |
| Region                   | Name, truncated with tooltip                                                                                                                                                                       |
| Last hour                | Ship kills (heat colour `shipKillHeatColor`: stops 3 yellow / 6 orange / 10 red) · pod kills (red when > 0) · jumps; J-space shows N/A with info tooltip; "—" for unknown                          |
| zKillboard (recentKills) | Count linking to `zkillboard.com/system/{id}`; on-path gate lines ("3 kills at Stargate (X), last one 32 min ago"), tags "Interdictor or HIC on the mail" (nullsec only) and "Smartbombs involved" |
| Avoid                    | Button per middle row (not start/stops/already-avoided)                                                                                                                                            |

- Row expand: NPC kills count; zKillboard kill locations off the route ("elsewhere in the system" pool for unnamed planets/moons/belts/structures).
- Quiet stretch fold header: "N systems, A → B, lowest X.X"; opens in place. Hole/bridge neighbours never fold; unknown/loading/J-space systems never fold.
- Hole row `HoleStepLine`: warp to system + signature (select-all) + Copy button (clipboard; falls back to selecting text), wormhole type, size, life left, "EVE-Scout, Xm ago". Phone keeps warp-to, size, life, Copy.
- Bridge row `BridgeStepLine`: "Ansiblex · A → B · gate name".
- Phone: dense cards; zero kill counts omitted.

### Legs (`TripLegs.tsx`)

Multi-stop trips: `ol` of legs; header button "Leg N · A → B · J jumps · lowest X · chokepoints"; first leg open, rest folded; keyed by leg endpoints so a new order opens on leg 1. Single stop renders one leg without header.

### Ways to fly (`LegWays.tsx`)

Per leg: boxes for Gates only (always), Via Thera / Via Turnur (hub has qualifying hole), Via Ansiblex (bridges on and a known gate on the way), planner's pick when different, any pinned way. Each box: jumps, lowest security, lowsec/nullsec counts, chokepoints passed; hole lines (from→to, fits, life left); bridge lines (from→to, gate name). "In use" badge on the flown way; "Use for this leg" pins it. With bridges on and no gates known, Via Ansiblex box offers "Find with a character" / "paste a list". With holes off, hint on how to compare. Pin note when a pinned way cannot be flown (hole closed, no qualifying hole, no route, list unavailable, no bridge). Panel sits beside rows at container >= `@5xl`, above them (2-3 across) when narrower; phone folds to one line with Compare/Hide.

### Avoid system dialog (`AvoidSystemDialog.tsx`)

Modal opened from a row's Avoid button. Preview = the page's trip planned again with one more avoid (same planner, pins/holes/bridges/optimize; `planWithAvoid`), saves nothing. States new jump count, signed delta ("+3", "-2", "+0"), lowest security; "no way around" when the trip still crosses it (avoidance is a cost, never a wall). Footnote: app-wide effect. Confirm adds to Avoided Systems. With the Avoided Systems switch off: explains, previews as if on, offers "Switch on and avoid" and plain "Add only" (with list-only outcome). Cancel.

### Ansiblex dialog (`AnsiblexGatesDialog.tsx`)

Opened from rules panel "Manage" (mode `search`), Via Ansiblex box ("find" `search` / "paste" `paste`), or Settings > Travel. Sections:

- Local-only notice (list never leaves the device).
- Find with a character: one row per Character with Find button (disabled while another search runs); "Find with all" when > 1 character; per-row status (searching, found N, systems it could not place, failed); Characters lacking scopes show "needs grant" + Grant button (`beginGrant`). Search term `" » "`; each id read via `/universe/structures/{id}`; a character's finds replace its earlier ones.
- Paste: textarea (Ctrl/Cmd+Enter submits), Add; per-line errors (`format`, `unknown`, `same-system`, `not-nullsec`).
- Known gates list: "A » B", full name, "pasted" or "found by <characters>", Remove each.

### Set waypoints in game (`SetWaypoints.tsx`)

- Button at facts line's right end (full width on phone). Character `Select` appears with > 1 character.
- Sends Stops in flying order (optimized order if on; ends at start with Return to start). First call clears client waypoints, rest add; strictly sequential; failure stops and reports "set X of Y". Max 11 calls.
- Client autopilot cannot fly a wormhole or bridge: waypoints cut at the first such hop's entrance; result names where to pick up ("Take the wormhole there, then set the rest from Atai"); first-hop non-gate sets nothing. Confirmation notes the client routes between waypoints with its own autopilot settings.
- Blocked states (button `aria-disabled` with tooltip): no Character; grant lacks scope (GrantBanner with Grant action for the chosen Character).
- Engine: `src/engine/route/waypoints.ts` (`waypointSequence`); hop kind from the row's own tag; stargate graph stays gates-only.

### Engine calcs (1-2 lines each)

- `jumpRoute.ts`: Dijkstra over ~8.5k systems; CCP per-jump costs: penalty cost = `exp(0.15 x penalty)`, nullsec (<= 0.0) twice that under biased preferences, wanted band 0.9, Shorter 1; Avoided Systems cost 1e12 (cost, never wall). Highsec line 0.45 raw.
- `routeSafety.ts`: row join (ESI absent system in a received response = 0; failed feed = unknown; J-space always unknown); `foldQuietStretches` (MIN_QUIET_RUN 2); `routeStripKeySystems`; trip summaries.
- `routeSafetyTrip.ts`: assembles legs, ways, hole/bridge steps (`RouteStep`), pin notes.
- `tripPlan.ts`: `MAX_STOPS = 10`; pairwise cost matrix from `routeSweepFrom`; Held-Karp exact order; typed order wins ties; directed costs.
- `legWays.ts`: ways per leg by stitching sweeps (route to hole end + hole jump + route on); `parseLegPin`.
- `routeHoles.ts`: filters EVE-Scout list by hub, ship size, min life; builds `extraConnections` + `freeSystems`. With switch on, entering a hub over a hole costs exactly 1 whatever its security; entrance and exit systems are charged normally (the hub-to-exit hop pays the exit system's normal cost); hub free only when reached via hole (decision `20261003-181618`). See "Route planner internals".
- `ansiblex.ts`: name parse "SYS1 » SYS2 - label" (type id 35841), nullsec-only validation, bridge connections.
- `recentKills.ts`: groups zKillboard kills by location; tags: Interdictor group 541 or HIC group 894 on mail (nullsec only), smartbomb group 72.
- `chokepoints.ts`: explicit list (not derived): Uedama, Sivala, Aufay, Balle (highsec); Tama, Rancer, Ahbazon (lowsec). Niarja, Perimeter, Hatakani deliberately absent.
- `avoidRules.ts`: `effectiveAvoid` merges Avoided Systems (if enabled), EDENCOM (`invasionSystems.ts`), Triglavian, pod-kill >= threshold; `avoidPreviewOutcome`, `listOnlyOutcome`.
- `killHeat.ts`: ship-kill colour ramp.

## Thera / Turnur (`/travel/thera`)

Components `TheraTab.tsx`, `TheraFilters.tsx`, `TheraTable.tsx`, `useTheraConnections.ts`. `PageHeader` shows `DataAgeBadge` (EVE-Scout list age).

Link params (`TheraTab.tsx:52`): `origin` (absent = Current System), `pref`, `hub` (all/thera/turnur), `space` (kspace default, highsec, lowsec, nullsec, wormhole; unknown value e.g. old `all` falls back to kspace), `size` (any/small/medium/large/xlarge/capital). Origin changes `push` history.

Filters (content-sized selects in one row, desktop): From (SolarSystemPicker), Hub (with per-hub counts that follow other filters), Exit, Fits, Route Preference (`PreferenceField`). Phone: From on own labelled line; other four become chips opening radio menus, accent when off default. "Reset filters" in empty state when any filter off default (origin and preference stay).

Table (`DataTable`, compact, default sort Jumps asc, `mobileSort`, expandable rows):

| Column    | Notes                                                                                                                                                   |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exit      | System + hub badge; sortable by name                                                                                                                    |
| Sec.      | `SecurityStatus`, or class letters (C1..) for J-space                                                                                                   |
| Region    |                                                                                                                                                         |
| Fits      | Max ship size                                                                                                                                           |
| Life left | Countdown; warning style at <= 2 h (`LIFE_WARNING_MS`); ticks per minute                                                                                |
| Jumps     | From origin to exit by gate (before taking the hole): number, "no gate route", or "—"; stable sort so ties (every J-space hole) stay longest-life-first |
| Signature | Hub-side signature, select-all; phone shows "hub sig -> exit sig"; Route via link                                                                       |

- Row expand: wormhole type, both signatures, exit's zKillboard page link, Route via.
- Route via (K-space exits with a known gate route only): link to Route Safety from the origin with the hole pinned for leg 1.
- Under K-space, J-space exits fold into a collapsed Disclosure under the table ("N exits into J-space"); J-space filter shows them as the table.
- Notes (single live `role=status`): no origin; jumps loading; origin ungated (e.g. Thera, J-space, no stargates); some jumps unknown.
- States: loading spinner; EVE-Scout unavailable EmptyState with Retry; EVE-Scout lists none; filters match none (with reset).
- Data: one `loadTheraConnections()` per 5 min window; one `localJumpDistances` sweep from origin (never per-row route request); exit security from system snapshot.
- Exit band: repo's security banding when snapshot knows it, else feed class (`hs/ls/ns/cN`); wormhole-named systems = J-space; unknown band is K-space but under no single band filter.
- Engine: `src/engine/route/theraConnections.ts` (`buildTheraConnectionRows`, `filterTheraConnections`, `countTheraConnectionsByHub`, `longestLifeFirst`, `jumpsSortValue`). Hubs: Thera 31000005, Turnur 30002086.

## Settings > Travel (`src/features/settings/TravelSettingsPanel.tsx`)

Section `travel` in the Settings rail (`src/features/settings/sections.ts:27`), path `/settings/travel`. Three panels:

1. Route planning: Default route preference (Select), security penalty (disabled under Prefer shorter), avoid EDENCOM / Triglavian / pod kills (+threshold). Waits for settings hydration.
2. Wormholes and jump bridges (`SavedRouteNetworkFields`): `RouteHoleFields bare` bound to saved defaults (no link override here); Ansiblex dialog.
3. Avoided Systems (`AvoidedSystemsPanel`): switch (off keeps the list), add via picker, name-sorted list with security and Remove; unnamable systems list as `#id`.

Settings keys: `sync.routePreference`, `sync.routeSecurityPenalty`, `sync.avoidedSystemsEnabled`, `sync.avoidEdencom`, `sync.avoidTriglavian`, `sync.avoidPodKills`, `sync.podKillThreshold`, `sync.routeHoles`, `sync.routeHoleShipSize`, `sync.routeHoleMinLife`, `sync.routeHoleHubs` (synced, one key each so devices cannot roll each other back); `routeBridges` (device-local). Avoided Systems list synced as ids. Legacy `assetsRoutePreference` adopted once.

Jump Basis (`src/features/route/jumpBasis.ts`): the one set of rules every jump count uses (Travel Settings + saved hole/bridge settings). Consumers: Assets, Market, BPC Sourcing, Contract Search, Courier, order detail. Deliberate exception: Thera table distance (measured before taking the hole).

## Entry points from other pages

| Place                                                                       | Control                                                                                                                        | Behavior                                                                                                                      |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `src/features/route/jumpsCell.tsx` -> `JumpsLink`                           | Jump-count cell of the Jump Range tables (Market Browser, Contract Search Items, BPC Sourcing), when the row passes a systemId | Count links to Route Safety to that system from Current System; tooltip "View route"; stops row click                         |
| `src/features/contractSearch/CourierResults.tsx:1225`                       | Courier jumps                                                                                                                  | Link from pickup system, with the board's Route Preference                                                                    |
| `src/features/pi/goalPlanResults/Hauling.tsx:154`                           | PI hauling jumps                                                                                                               | `JumpsLink systemId={to} fromId={from}`                                                                                       |
| `src/features/market/OrderBookScopeBar.tsx:274`                             | Scope bar jumps                                                                                                                | `JumpsLink` to scope system                                                                                                   |
| `src/features/character/assetBrowserRows.tsx:82`, `MarketOrderBook.tsx:161` | `PlaceJumpsLink`                                                                                                               | Resolves a station/structure to its system on click (`resolvePlaceSystemId`), then navigates; error text if structure off ACL |
| `src/features/entities/EntityLink.tsx:138` `SystemLink`                     | Any solar-system name (Contract modals, PI, Mining tax, Corp roster, hauling detail, etc.)                                     | Route Safety with that system as destination (DESIGN.md §6c entity default)                                                   |
| `SetDestinationButton` (`features/market/`)                                 | Order detail + order book                                                                                                      | "Set destination" (one waypoint, clears others) + `ViewRouteButton`                                                           |
| `SetWaypointMenuItem`                                                       | Order row context menu, Open orders panel, BPC Sourcing row menu                                                               | "Set waypoint in game" (menu stays open, shows outcome; disabled with reason without Character/scope) + `ViewRouteMenuItem`   |
| `useSetDestination` (`features/travel/useSetDestination.ts`)                | Shared hook                                                                                                                    | `locationId` must be a place (station/structure/system), never an item id; scope `esi-ui.write_waypoint.v1`                   |
| Thera table Route via                                                       | `routeViaHref`                                                                                                                 | See above                                                                                                                     |

`useViewRoute` (`useViewRoute.ts`): resolve place's system, `navigate(routeToHref(systemId, null, preference))`; failed state "unavailable".

## Command palette

`src/features/commandPalette/` (Ctrl/Cmd+K, `CommandPaletteHost.tsx`). Groups: Pages, Commands, Characters, plus contacts, assets, market items, LP stores. Travel appears only as Pages entries from the nav descriptor (`createPagesProvider`, `providers.ts:25`): "Travel", its tabs (Route Safety, Thera / Turnur) and "Pilot Lookup". Commands list (`PALETTE_COMMANDS`): open settings, keyboard shortcuts, add character, notification feed - none for routes, waypoints or systems.

## Where the route planner lives

Not a separate page: the planner is Route Safety. Split by layer.

| Layer       | Path                                                                                                                                             | Role                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Pure engine | `src/engine/route/jumpRoute.ts`                                                                                                                  | Dijkstra, step costs, sweeps                                                                                              |
|             | `tripPlan.ts`                                                                                                                                    | stops, legs, Held-Karp order                                                                                              |
|             | `legWays.ts`, `routeHoles.ts`, `ansiblex.ts`                                                                                                     | ways to fly, Thera/Turnur edges, bridge edges                                                                             |
|             | `routeSafety.ts`, `routeSafetyTrip.ts`                                                                                                           | rows, facts, folds, trip assembly, step tags                                                                              |
|             | `avoidRules.ts`, `chokepoints.ts`, `invasionSystems.ts`, `killHeat.ts`, `recentKills.ts`, `waypoints.ts`, `theraConnections.ts`, `jumpRange.ts`  | rules and per-row facts                                                                                                   |
| Adapters    | `src/features/route/localRoute.ts`                                                                                                               | loads graph (`sde/jumpGraph`) + security snapshot, calls engine (`findLocalRoute`, `localJumpDistances`, `planLocalTrip`) |
|             | `src/features/route/routeRules.ts`, `routeHoleSettings.ts`, `routeBridgeSettings.ts`, `jumpBasis.ts`                                             | settings stores and the one jump basis                                                                                    |
|             | `src/features/travel/useRouteSafety.ts`, `useRouteHoles.ts`, `useRouteKills.ts`, `routeSafetyData.ts`, `routeKillsData.ts`, `routeSafetyKeys.ts` | data hooks and stable request keys                                                                                        |
| UI          | `src/features/travel/RouteSafetyTab.tsx` and siblings                                                                                            | page                                                                                                                      |

Graph: static SDE snapshot (`market/jumps.json`, ~8.5k systems, ~14k edges), keyed for every system including gateless J-space (`[]`), so "in the graph, no edges" = no stargate route and "not in graph" = not a system (decision `20260912-130200`, `jumpRoute.ts:18-24`). Zero ESI requests per route.

## Route planner internals

### Flag options (what the user can set)

| Option                                                      | Values                                                                               | Default                                                       | Stored                                                                   | Effect on planner                                                                                       |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| Route Preference                                            | Prefer shorter / safer / less secure (`shortest`, `prefer-highsec`, `avoid-highsec`) | Prefer safer (`DEFAULT_ROUTE_PREFERENCE`, `routeRules.ts:37`) | synced `sync.routePreference`; link `pref` wins until the picker is used | step cost table below                                                                                   |
| Security penalty                                            | integer 0-100                                                                        | 50 (`DEFAULT_SECURITY_PENALTY`, `jumpRoute.ts:84`)            | synced `sync.routeSecurityPenalty`                                       | `penaltyCost = exp(0.15 x penalty)`; ignored under Prefer shorter                                       |
| Avoided Systems                                             | list of ids + switch (default on)                                                    | empty                                                         | synced list + `sync.avoidedSystemsEnabled`                               | +1e12 per avoided system entered                                                                        |
| Avoid EDENCOM                                               | switch                                                                               | off                                                           | synced                                                                   | adds the 53 fortress + minor-victory ids to avoid                                                       |
| Avoid Triglavian minor victory                              | switch                                                                               | off                                                           | synced                                                                   | adds that set (`invasionSystems.ts`, vendored from kybernaut.space; unchanged since 2020-10-13)         |
| Avoid pod-kill systems                                      | switch + threshold 1-100                                                             | off, 3                                                        | synced                                                                   | adds systems whose last-hour ESI pod kills >= threshold; refreshed every 15 min (`POD_KILL_REFRESH_MS`) |
| Thera/Turnur holes                                          | switch, ship size (small..capital), min life 0-24 h, hubs                            | off, medium, 1 h, all                                         | synced one key each; link `wh/whsize/whlife/whhub`                       | extra edges + free hub                                                                                  |
| Use jump bridges                                            | switch                                                                               | off                                                           | device-local `routeBridges`; link `jb`                                   | known Ansiblex as extra edges                                                                           |
| Optimize stop order / Return to start / Keep last stop last | switches                                                                             | off                                                           | link only (`opt/ret/keep`)                                               | Held-Karp                                                                                               |
| Pin per leg                                                 | gates / thera / turnur / ansiblex / hole id                                          | none                                                          | link `pin`                                                               | forces a way for that leg                                                                               |

Settings that are edited on this page (preference, penalty, avoid rules, hole/bridge defaults) are the saved defaults, so they change every jump count in the app (`20261003-161302` as amended by `20261006-143832`; `20261004-161245`).

### Step costs (`securityStepCost`, `jumpRoute.ts:116-130`)

Cost is charged for the system entered. `raw` security, highsec line `0.45` (`HIGHSEC_FROM`, rounds to 0.5 shown).

| Preference                              | raw <= 0.0 (null) | unknown security | in wanted band | in unwanted band |
| --------------------------------------- | ----------------- | ---------------- | -------------- | ---------------- |
| shortest, or no security lookup         | 1                 | 1                | 1              | 1                |
| prefer-highsec (wanted: raw >= 0.45)    | 2 x P             | P                | 0.9            | P                |
| avoid-highsec (wanted: raw < 0.45, > 0) | 2 x P             | P                | 0.9            | P                |

P = `exp(0.15 x penalty)`. Worked values: penalty 0 gives P=1 (null 2, wanted 0.9; so penalty 0 is not quite Prefer shorter); penalty 50 gives P ~ 1808 (null ~ 3616); penalty 100 gives P ~ 3.27e6 (null ~ 6.5e6). Unknown security is charged as unwanted (never claims safety). Under Prefer less secure, nullsec still costs 2 x P, so it routes through lowsec before nullsec. Avoided system adds `AVOIDED_PENALTY = 1e12` (`jumpRoute.ts:98`), chosen above any possible security total so crossing one fewer avoided system always wins; avoidance is a cost, never a wall; an avoided origin/destination changes nothing.

Search (`jumpRoute.ts:249`): Dijkstra with a binary heap; stargates relaxed before extra connections and `>=` check, so on a tie the gate wins. Jumps are tracked beside cost: displayed jump count is the flown route's length, not its weighted cost. Biased preferences without a security snapshot degrade to shortest. Same system = 1-element route, 0 jumps (also in gateless systems); unknown id = `no-route` (never 0 jumps). `routeSweepFrom` runs the same search to exhaustion, so one sweep per stop gives every pairwise cost and the legs are drawn from those same sweeps.

### Multi-stop and order optimization (`tripPlan.ts`)

- Up to `MAX_STOPS = 10` stops after start (`tripPlan.ts:21`); link parsing dedups and slices (`RouteSafetyTab.tsx:107`); pin tokens capped at 11 (`MAX_LEGS`).
- Cost matrix `[i][j]` is directed (entering cost), from one sweep per point; `null` when no stargate route joins a pair.
- `optimizeStopOrder` = exact Held-Karp over the free stops (bitmask DP, O(2^n n^2); ~100k steps at 10). Keep last stop last removes the final stop from the free set and adds `cost(stop,last)`. Return to start adds `cost(end,0)`.
- Tie rule: typed order wins unless the best order saves more than `TIE = 0.01` cost (`tripPlan.ts:65`, `:177`); absolute tolerance because sums reach ~1e13 with avoids.
- Any null pair means `unreachable`: no optimizing, typed order flown, that leg shows no-route, Optimize switch disabled (`optimizeBlocked`).
- Optimizer minimizes preference-weighted cost, not jumps; the note states real typed vs flown jumps (can be more jumps under a security preference).
- Return to start appends a leg home. Order change never written back to `stops`.

### Ways to fly a leg (`legWays.ts`)

- Always lists Gates only (`gatesOnlyOptions`: same preference/avoids, no holes/bridges), even if it has no route.
- Per hub with qualifying holes: `routeThroughHoles` tries, for each hole, (a) from -> exit, then hub -> to; (b) from -> hub some other way, then to -> exit reversed. Picks the lowest `routeCost`; rejects routes that revisit a system; never flies back out the hole it came in by.
- Via Ansiblex (`routeOverBridges`): plan with bridges as extra edges, no holes; if the result crosses no bridge it is `no-route` (it is just the gate way).
- Planner's own pick is listed when different from all of the above; flown way gets "In use" and is listed first.
- Pin semantics (`pinnedLegRoute`, `legWays.ts:248`): gates; hub (needs a qualifying hole else `no-hole`); hole id (looked up in every open EVE-Scout hole, not just qualifying, so a skipped-by-filter hole still flies; absent = `closed`); ansiblex (`no-bridge` when none known); any pin that cannot reach = `no-route`. While EVE-Scout list is absent a hub/hole pin shows `no-list` and the leg is flown as planned.
- Pins index legs by position; they reset when start, stops or order options change (except the first stop added to a Route via link).

### Holes and Ansiblex in the graph

- `routeHoles` (`routeHoles.ts:33`): keep hub match, `maxShipSize` known and >= chosen rank, `remainingMs > 0 and >= minLife`. Hole with unknown size is excluded. `holeNetwork` makes one edge exit<->hub per hole and marks each used hub free.
- Cost: entering a free hub over an extra edge costs 1 (`stepCostFor`, `jumpRoute.ts:143`), plus avoid penalty; every other landing (exit system, the hub when entered by gate, bridge landings) uses the normal step cost. Gate always beats a hole/bridge on the same pair, both in search order and in step tagging (`src/engine/route/routeSafetyTrip.ts:256`, decision `20261004-122315`).
- Ansiblex (`ansiblex.ts`): name `SYS1 » SYS2 [- label]` (first spaced `-` ends far system so `1DQ1-A` survives); only known-space nullsec ends (`securityBand == nullsec`, not J-space); same-system, unknown and not-nullsec lines are errors with line numbers; pair deduped either direction. Search term `" » "` (ESI needs >= 3 chars; substring match). Found structure accepted only when `type_id` is 35841 (or absent), the name parses, and the name's near system equals ESI's `solar_system_id`. Bridges are two-way edges, never free.

### Trip assembly and row facts (`routeSafety.ts`, `routeSafetyTrip.ts`)

- Row per system: security rounded 1 dp, band (shown >= 0.5 highsec; >= 0.1 lowsec; else nullsec), region, ESI jumps/ship/pod/NPC kills, `chokepoint`, plus `entry` tag (`gate` | `hole` | `bridge`; first row null).
- Unknown vs zero: a system absent from a received ESI response = 0 (ESI lists only active systems); a feed that failed (and had nothing cached) = null for every system; J-space ids 31,000,000-31,999,999 are always null (`routeSafety.ts:94`, `:124`).
- Summary: jumps = rows-1; band counts exclude J-space; lowest security excludes J-space (Thera -0.99 is not a nullsec system flown through); kill totals are null (hidden) if any system is null.
- Trip summary: jumps and band counts count every system crossed on every leg; kills and chokepoints count each distinct system once.
- Quiet fold (`foldQuietStretches`): middle row folds only if not J-space, not chokepoint, security known, ESI ship kills = 0, pod kills = 0, zKillboard count = 0 (known zero; loading/failed = not quiet), not pinned (hole ends / bridge ends). Run >= `MIN_QUIET_RUN = 2`. NPC kills ignored.
- Strip key systems: both ends, first system at the lowest K-space security, each chokepoint, each stop.
- Ship-kill heat colour (`killHeat.ts:13`): 0 none; 1-2 ramps text to yellow; 3 yellow; 6 midway orange; >= 10 full red. Pod kills red when > 0. Colour never the only signal.

### Chokepoints (`chokepoints.ts:26`)

Explicit list, not derived: highsec Uedama 30002768, Sivala 30002765, Aufay 30002641, Balle 30002634; lowsec Tama 30002813, Rancer 30002718, Ahbazon 30005196. Niarja (Pochven since 2020), Perimeter, Hatakani deliberately excluded. Why a list: Uedama raw 0.505 and Balle 0.461 show as 0.5 like hundreds of other systems; traffic, not security, makes a chokepoint.

### zKillboard column

- One request per region (`kills/regionID/{id}/pastSeconds/3600/`), `ZKILL_CONCURRENCY = 3`, regions walked nearest the start first, page follows `/page/n/` while a page holds 1,000 kills (`REGION_PAGE_SIZE`), 10-page backstop; any page failing, error body, or backstop hit fails the whole region (never a partial "quiet" hour). Kill appearing on two pages counted once. Cache 5 min per region (`RECENT_KILLS_TTL_MS`); an open page re-walks every 5 min. No known region: falls back to `kills/systemID/`. Failed row = "unavailable" and is not cached; no retry button.
- Per-system summary (`recentKills.ts`): group by zKillboard location (stargate / NPC station named; planet, moon, belt, structure pooled "elsewhere in the system"); busiest first, ties most recent; gate marked "on your path" only when its destination system is the previous or next route system; minutes since last = floor((now - time)/60s), clamped at 0.
- Tags: bubble hull = attacker ship group 541 (Interdictor) or 894 (HIC), only when the system's band is nullsec (unknown band never tags); smartbomb = attacker weapon group 72 in any band. Copy says a bubble hull was on the mail, not that a bubble was up.

### Waypoints (`waypoints.ts:43`, `sendWaypoints.ts:30`)

Sequence = each leg's end Stop in flying order (optimized order, plus home with Return to start); duplicates adjacent collapsed; cut at the first hole/bridge hop (adds the entrance only if it is not already the start/last waypoint); a leg with no route ends the sequence; first-hop non-gate sets nothing. Sending: sequential `POST /ui/autopilot/waypoint`, first `clearOtherWaypoints=true`; stops at first error and reports "set X of Y"; auth failure goes through `reportWriteAuthFailure` and offers Grant. At most 11 calls (10 stops + home).

## Thera / Turnur formulas (`theraConnections.ts`)

- Source rows: EVE-Scout `signature_type == wormhole`, `out_system_id` must be Thera 31000005 or Turnur 30002086; needs exit system id, parseable `expires_at`, id; `out_*` = hub side, `in_*` = exit side (`src/lib/eveScout.ts:59`). Unknown ship size stays null (filtered out when a Fits filter is set; excluded from routing).
- Row build: collapsed (`expiresAt <= now`) dropped; `lifeWarning = remaining <= 2 h` (`LIFE_WARNING_MS`, `:79`); clock ticks every 60 s.
- Exit band precedence (`exitSpaceOf`, `:99`): feed class `cN` -> wormhole; name `J######` -> wormhole; else if snapshot security known -> `classifySpace` (shown-security band); else feed class `hs/ls/ns`; else null (K-space but under no single band).
- Jumps (`jumpsTo`, `:108`): wormhole exit = no-route always; else origin sweep: reachable = known; absent = no-route; unreadable graph = unknown; no origin = no-origin. The sweep uses saved Travel rules but not holes/bridges (`localJumpDistances(originId, rules)`), because gate distance is measured before taking the hole.
- Sort: table sorted by Jumps asc over rows pre-ordered by remaining life desc then exit name (`longestLifeFirst`, `:216`), stable.
- Hub counts follow Exit and Fits filters but ignore the Hub filter.
- Cache: `loadTheraConnections` memory 5 min (`EVE_SCOUT_CACHE_MS`), in-flight deduped, failed refresh returns last good list else `unavailable`; plain `fetch`, no custom headers.

## Persistence and sync

| State                                                       | Where                                                                                                                                                                                                | Synced                                       |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Route Preference, penalty, avoid rules, threshold, switches | synced settings `sync.*` (Firestore via `createSyncedSetting`)                                                                                                                                       | yes, one key each                            |
| Avoided Systems ids                                         | synced `sync.avoidedSystems` (ids only)                                                                                                                                                              | yes                                          |
| Hole settings (4 keys)                                      | synced                                                                                                                                                                                               | yes                                          |
| Use jump bridges                                            | local setting `routeBridges`                                                                                                                                                                         | no                                           |
| Ansiblex list                                               | Dexie `ansiblexGates` (`src/db/index.ts:1445`), keyed `search:<structureId>` or `paste:<pair>`                                                                                                       | never (private structure access; not logged) |
| Picked Current System                                       | local setting `currentSystemPicks`, per Character; applies until the game reports a different system than when picked (`src/engine/route/jumpRange.ts:75`, `src/features/route/currentSystem.ts:36`) | no                                           |
| From, Stops, order flags, pins, per-view overrides          | URL query                                                                                                                                                                                            | via link only                                |
| ESI kills/jumps feeds                                       | Dexie cache, `GLOBAL_CACHE_CHARACTER_ID`, ETag conditional                                                                                                                                           | no                                           |
| zKillboard, EVE-Scout                                       | memory only                                                                                                                                                                                          | no                                           |
| Character's current system                                  | ESI cache `characterLocation`, fetched once per load                                                                                                                                                 | no                                           |

## State matrix (Route Safety)

| Condition                                                                    | Result                                                                                 |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No From and no game location (no `esi-location.read_location.v1` or offline) | picker label "Pick a system"; `incomplete` EmptyState                                  |
| Hydration (rules, holes, bridges, pod kills) not finished                    | route not planned (no "draw once on defaults")                                         |
| Stargate snapshot unreadable                                                 | `unknown` EmptyState (not "no route")                                                  |
| ESI feeds loading                                                            | route shows; status line; kill figures "—"                                             |
| One feed null                                                                | facts that need it withheld; figures unknown never zero; "activity unavailable" status |
| EVE-Scout loading (holes on)                                                 | gate route shown, status line says so; hole/hub pins show `no-list`                    |
| EVE-Scout unreachable                                                        | gates only, said so; Thera tab shows Retry EmptyState                                  |
| zKillboard row fails / 429                                                   | that row "unavailable"; walk continues; retry only on next walk                        |
| Stop unreachable (multi)                                                     | that leg no-route, other legs draw, facts/strip wait, Optimize off                     |
| Pod-kill feed unreadable with rule on                                        | rule drops; warning in rules panel                                                     |
| Settings hydrating                                                           | rules panel spinner, controls not clickable                                            |

## Mobile vs desktop

| Area            | Desktop                                          | Phone / narrow                                                          |
| --------------- | ------------------------------------------------ | ----------------------------------------------------------------------- |
| Layout          | rail (Stops, Route rules) + route from `xl` 1280 | rail dissolves; order Stops, route, Route rules (#2591)                 |
| Stops           | full list                                        | one line "Start -> N stops" with Edit/Done (open while no stops, #2519) |
| Route rules     | full                                             | folded with `ActiveRuleChips`                                           |
| Route table     | DataTable columns                                | dense cards, sec in corner, zero kill counts omitted                    |
| Ways            | beside rows at container >= `@5xl`               | above rows 2-3 across; phone folded with Compare/Hide                   |
| Set waypoints   | right end of facts line                          | full width                                                              |
| Thera filters   | selects in one row                               | From own line; four chips opening radio menus; sort via `mobileSort`    |
| Thera signature | sig                                              | "hub sig -> exit sig"                                                   |

## Permissions

| Feature                       | Scope                                                                     | Missing grant                                                                                |
| ----------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Route, Thera, strip, kills    | none (public ESI, zKillboard, EVE-Scout)                                  | n/a; page still needs an active Character (`Travel.tsx:36`, else redirects to `/characters`) |
| Current System (default From) | `esi-location.read_location.v1` (group characterDetails)                  | 403 not treated as auth failure; user picks a system by hand                                 |
| Set waypoints                 | `esi-ui.write_waypoint.v1` (Permission "Autopilot waypoints", default-on) | button `aria-disabled` + tooltip; GrantBanner with Grant for chosen Character                |
| Ansiblex find                 | `esi-search.search_structures.v1` + `esi-universe.read_structures.v1`     | Character shows "needs grant" + Grant; never searched; paste works                           |

## Test coverage map

| Behavior                                                                      | Test                                                                                                                                                            |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Penalty costs, avoid > penalty, gate tie, unknown id, sweep == pair           | `src/engine/route/jumpRoute.test.ts` (penalty 0/50 and 0.45 raw cases)                                                                                          |
| Held-Karp exact vs brute force, ties, return/keep, 10 stops fast, unreachable | `tripPlan.test.ts`                                                                                                                                              |
| Hole filters, free hub, holeBetween                                           | `routeHoles.test.ts`                                                                                                                                            |
| Ways, pins (`closed`, `no-hole`, `no-bridge`), never back out hole            | `legWays.test.ts`                                                                                                                                               |
| Unknown vs zero, J-space, fold rules, strip keys, trip dedup                  | `routeSafety.test.ts`                                                                                                                                           |
| Trip assembly, step tagging                                                   | `routeSafetyTrip.test.ts`                                                                                                                                       |
| Avoid list, preview outcome, list-only                                        | `avoidRules.test.ts`                                                                                                                                            |
| Ansiblex parse/errors/found rules                                             | `ansiblex.test.ts`, `ansiblexGates.test.ts`, `AnsiblexGatesDialog.test.tsx`                                                                                     |
| Waypoint cut-offs                                                             | `waypoints.test.ts`, `sendWaypoints.test.ts`, `SetWaypoints.test.tsx`                                                                                           |
| Thera bands, jumps states, filter, hub counts, ordering                       | `theraConnections.test.ts`                                                                                                                                      |
| Bubble/smartbomb tags, grouping, on-path                                      | `recentKills.test.ts`, `routeKillsData.test.ts`                                                                                                                 |
| Link codec                                                                    | `routeSafetyLink.test.ts`; keys `routeSafetyKeys.test.ts`                                                                                                       |
| Strip                                                                         | `RouteStrip.test.tsx`; jump links `jumpsCell.test.tsx`                                                                                                          |
| Heat ramp, chokepoint list                                                    | `killHeat.test.ts`, `chokepoints.test.ts`                                                                                                                       |
| Not covered by a dedicated test (from file list)                              | `RouteSafetyTab.tsx`, `StopsPanel.tsx`, `TheraTab.tsx`, `AvoidSystemDialog.tsx`, `TripLegs.tsx`, `LegWays.tsx` have no sibling `.test.tsx`; e2e specs may cover |

## Decision links (why)

| Decision                                                     | Gist                                                                                         |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `20260929-234357`                                            | Travel/Intel in scope; ungated but signed-in; two ESI requests per visit                     |
| `20260912-172628`                                            | conditions, never verdicts; unknown never zero                                               |
| `20260912-130200`                                            | local stargate graph; key per system incl. gateless                                          |
| `20260930-165116`                                            | one route vocabulary; CCP route costs                                                        |
| `20260930-153212`                                            | Avoided Systems hand-entered (ESI cannot read in-game list), synced, cost not wall           |
| `20260930-002219` / `20261005-125019`                        | zKillboard per region (supersedes per system); stargate names via `/universe/stargates/{id}` |
| `20261003-161302` / `20261006-143832`                        | rules panel edits Travel Settings in place; preference saves the default                     |
| `20261003-173108`                                            | up to 10 stops, exact optimizer, cost not jumps, typed order wins ties                       |
| `20261003-175151`                                            | waypoint scope as its own default-on Permission; stops in flying order; cut at hole/bridge   |
| `20261003-181618`                                            | hub entry free of security cost; Route Safety-only at the time                               |
| `20261004-161245`                                            | every jump count uses the local graph + saved hole/bridge settings (Jump Basis)              |
| `20261003-204009`                                            | Ansiblex find + paste, device-local                                                          |
| `20261004-122315`                                            | step kind decided once; gate beats hole/bridge                                               |
| `20261003-190356` / `20261004-213447`                        | Thera slim table, exit filter in URL `space`, filters as selects                             |
| `20261002-145653-lp-store-under-market-pilot-lookup-its-own` | Pilot Lookup left Travel                                                                     |

## Interview Q&A

1. How is a route computed and why local? Dijkstra over the SDE stargate graph in `src/engine/route/jumpRoute.ts:249`, no ESI per pair; static map data makes distance arithmetic and lets any table sort by jumps (decision `20260912-130200`). ESI `/route` treated avoids as a wall and gave Assets 31 where Route Safety showed 29 (`20261004-161245`), so it is no longer called.
2. Exactly what does "Prefer safer" cost? Entering raw >= 0.45 costs 0.9; lowsec/unknown costs `exp(0.15 x penalty)` (1808 at 50); raw <= 0 costs twice that (`jumpRoute.ts:116-130`). Penalty 0 is still not Prefer shorter (0.9 vs 1, null doubled).
3. Why can a "safer" route have more jumps, and what does the page show? The search minimizes weighted cost; jumps are tracked separately (`jumpRoute.ts:229`) and the jump count is the flown path length. Optimize's note quotes real typed vs flown jumps (`tripPlan.ts:224-237`).
4. Is an Avoided System ever a wall? No: +1e12 per entry (`jumpRoute.ts:98,145`), so fewer avoided crossings always win but an only-path destination still routes. The Avoid dialog shows "no way around" via `stillCrosses` (`avoidRules.ts:119`).
5. How does stop optimization work, and why 10? Exact Held-Karp over a directed pairwise cost matrix built from one sweep per point (`tripPlan.ts:71-187`); 10 stops is ~100k steps, instant on a phone; beyond that a heuristic would be presented as "the" order (`20261003-173108`). Typed order wins unless saving > 0.01 (`tripPlan.ts:65`).
6. What happens when one stop is unreachable? Matrix has a null, `unreachable` true, typed order flown, that leg no-route, other legs draw, Optimize disabled (`tripPlan.ts:206`, `RouteSafetyTab.tsx:313`).
7. How are Thera/Turnur holes costed? Exit<->hub edges; entering a hub over a hole is 1 whatever its security; exit landing charged normally; hub entered by gate charged normally; avoids still apply (`routeHoles.ts:60`, `jumpRoute.ts:143`). Strict costing would almost never pick Thera (-0.99) under default Prefer safer (`20261003-181618`).
8. Which holes qualify? Chosen hub, known max size >= chosen, life > 0 and >= min hours (default 1) (`routeHoles.ts:33-48`). A pinned hole is looked up in the full open list, so it flies even if filters would skip it (`legWays.ts:269`).
9. Why do Set waypoints stop early? The client autopilot cannot fly wormholes or bridges, so the sequence is cut at the first non-gate hop's entrance and the result tells where to continue (`waypoints.ts:43-64`). Needs `esi-ui.write_waypoint.v1`, its own Permission so earlier logins did not lose Character details (`20261003-175151`).
10. How are unknown and zero kept apart? Absent from a received ESI response = 0; failed feed = null; J-space ids always null (`routeSafety.ts:94,124-135`). Totals go null if any system is null (`:141`). Quiet fold requires known zeros everywhere including zKillboard (`:230`).
11. What are the ship-kill colour thresholds and the chokepoint rule? 3 yellow, 6 orange, 10 red (`killHeat.ts:13`); chokepoints are a 7-system hand list (`chokepoints.ts:26`) because traffic, not security, defines them.
12. How is zKillboard rate-limited? Per region, 3 concurrent, 5 min cache, nearest first, paged at 1,000 with a 10-page backstop; any failure marks the whole region's rows unavailable and is not cached (`zkillboard.ts:450-478`, `useRouteKills.ts:30`).
13. When is a bubble tag shown? Attacker hull in group 541 or 894 and system band nullsec only; smartbomb weapon group 72 anywhere (`recentKills.ts:68-81`). It says a bubble hull was on the mail.
14. What is the exit-band logic on the Thera tab? Feed `cN` or `J######` name = J-space; else shown-security band when the snapshot knows it, else feed `hs/ls/ns`; unknown band = K-space under no single band (`theraConnections.ts:99-106`, `20261003-190356`). J-space exits are never given a gate route.
15. Why does Thera's Jumps column ignore holes? It measures gate distance to the exit before taking the hole; letting holes in would make every exit one jump away (`jumpBasis.ts` header; `useTheraConnections.ts:91`).
16. Where is the Ansiblex list stored, and why? Dexie `ansiblexGates` only, never synced/logged: structure access is private alliance info (`ansiblexGates.ts` header; `20261003-204009`). Found gates are accepted only for type 35841 and names matching ESI's system (`ansiblex.ts:144-159`).
17. Which settings are device-local vs synced? Everything route-related syncs except `routeBridges` and the picked Current System (`routeBridgeSettings.ts`, `currentSystem.ts`); the Ansiblex list is Dexie only.
18. What does changing a setting on the Route page do to other pages? It writes the saved default, so Assets, Market, Courier, BPC and Contract Search counts change too (`RouteSafetyTab.tsx:321`, `jumpBasis.ts`).
19. Why does a link's `pref` beat the saved default? Links from Assets/Courier pass the preference they counted under, so the route opens as the number was worked out; using the picker saves the default and drops `pref` (`20261006-143832`).
20. How is the hour of ESI data cached? `system_kills` and `system_jumps` once each, global cache, ETag conditional; page re-asks per route request, a 304 inside the hour (`routeSafetyData.ts:51`).

## Observed gaps (from code)

- Command palette has no solar-system search or "route to <system>" / "set waypoint" command; only page entries (`providers.ts:69`).
- Thera table has no Copy button; decision `20261003-190356` lists "a Copy action" but `TheraTable.tsx` only offers select-all on the signature (Copy exists on Route Safety hole rows).
- No Set waypoints / View route on Thera rows or hole signatures.
- No CSV export or print of a route; no copy-route-as-text; sharing is the URL only.
- No saved/named routes; only link params.
- Stops are systems only: a station or structure cannot be a Stop, so waypoints set systems, not docks.
- Route page needs a signed-in Character even though ungated (`Travel.tsx:38`); logged-out access recorded as follow-up (`20260929-234357`).
- zKillboard failures (429 included) mark rows unavailable with no retry control; the walk only retries on next load (not cached).
- Gank Chokepoints list is hand-maintained, 7 systems (`chokepoints.ts:26`); no rule derives them.
- Avoid preview and waypoint set cannot account for the in-game client's own avoidance list (ESI cannot read it; `CONTEXT.md` Avoided Systems).
- J-space systems always show N/A for ESI figures; bubble tag only applies in nullsec.
- `travel.pilotTab` string remains in `src/i18n/locales/en.json` with no code using it (Pilot Lookup left Travel).
- Ansiblex list is per device only and needs re-find/paste on every other device (by design: `routeBridgeSettings.ts`).
- Use jump bridges is device-local while the other route settings sync; a link's `jb` can differ from what another device has.
- Optimize cap 10 stops; past it no heuristic by design (`20261003-173108`).
- Hub entry over a hole is costed as one plain jump (security waived), by owner decision (`20261003-181618`). Per `20261004-161245` every jump count (Assets, Market, Courier...) now also uses the saved hole and bridge settings through `useJumpBasis`; the only exception is the Thera table's distance column.
- ESI `POST /route/` (`postRoute`) is still in `src/esi/registry.ts` and `endpoints.ts` but no feature calls it any more (all counts are local).
- Security banding is rounded (`shownSecurity`, band nullsec = shown < 0.1) but the router's nullsec double-cost rule uses raw `<= 0.0`; a raw 0.01-0.049 system reads as nullsec in facts yet is costed as an ordinary unwanted/wanted step (`jumpRoute.ts:127` vs `securityStatus.ts:26`).
- Pod-kill avoid threshold is applied to the last-hour ESI pod count only; a feed failure silently drops the rule with a warning in the panel, never blocking routes.

## Improvement ideas

- Solar-system search and "route to X" / "set waypoint" commands in the palette.
- Station/structure Stops so waypoints land at docks.
- Copy Route as text / CSV; saved named routes.
- Retry control for zKillboard-unavailable rows and EVE-Scout holes.
- Thera table: Copy signature (decision `20261003-190356` promised it), Set waypoint/Route via with bridges.
- Optional heuristic (nearest neighbour + 2-opt) past 10 stops, clearly labelled non-optimal.
- Align router null rule (`<= 0`) with banding (shown < 0.1).
- Derive chokepoints from traffic data instead of a hand list, or expose a user list.
- Allow logged-out access to Travel (`20260929-234357` follow-up).
- Remove dead `postRoute` registry entry and `travel.pilotTab` i18n key.
