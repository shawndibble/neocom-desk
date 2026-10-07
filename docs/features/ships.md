# Ships

Nav section `/ships` (CONTEXT.md "Ships"): two tabs, Fittings (library + editor + Compare, see `fittings.md`) and Ship Tree. This file covers the section shell, redirects, and the Ship Tree tab with its Ship Info window. Scope decision: `docs/context/decisions/20260926-135538-fittings-ship-tree-tab-and-ship-info-window.md`; map zoom: `20260927-100237-ship-tree-map-100-default-zoom-and-pinch.md`; URL model ADR 0015.

User goal (Ship Tree): "which hulls can I fly, how long until I can, what Mastery do I have, what do I train/build next". Mirrors the in-game ISIS tree.

| Feature                                                  | Where                                                                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Section shell, two tabs                                  | `src/routes/Ships.tsx`, `ShipsTabBar.tsx`, `shipsTabs.ts`                                                  |
| Ship Tree tab (view switch, load states)                 | `shipTree/ShipTreeTab.tsx`, `useShipTreeData.ts`                                                           |
| Map view (pan/zoom canvas, search, faction grid, legend) | `shipTree/ShipTreeMap.tsx`, `mapCamera.ts`, `MapSearch.tsx`, `FactionGrid.tsx`, `Legend.tsx`               |
| Ladder view (filter, only-flyable, nested sections)      | `shipTree/ShipTreeLadder.tsx`                                                                              |
| Faction bar                                              | `shipTree/FactionBar.tsx`                                                                                  |
| Ship Info window (4 tabs)                                | `shipTree/ShipInfoWindow.tsx`, `DescriptionTab`, `FittingTab`, `SkillsMasteryTab`, `BlueprintTab`          |
| Legacy redirects                                         | `LegacyShipsRedirect.tsx`, `fittingRoutes.ts`                                                              |
| Engine                                                   | `src/engine/shipTree/{status,rules,layout,templates,types}.ts`, `src/engine/tierLadder.ts`                 |
| Mastery/plan helpers                                     | `shipTree/shipTreeModel.ts`, `src/features/skills/ships/{scheduleEntries,fitCheckRows,unifiedShipRows}.ts` |

All paths under `src/features/fittings/` unless stated.

## 1. Routes, URLs, gating

- Tabs are path segments (ADR 0015, `docs/adr/0015-tab-is-a-path-segment-url-holds-view-state.md`). `SHIPS_TABS` (`shipsTabs.ts`, base `/ships`): `fittings` (default, first), `tree`, and standalone `fittings/edit` (the editor; not in the bar). Unknown segment -> default tab (`Ships.test.tsx:103`).
  - `/ships` and `/ships/fittings`: Fittings Start screen.
  - `/ships/fittings/edit`: editor, same mounted `<Fittings />` as the library so state carries across the navigation (`Ships.tsx`, `Ships.test.tsx:72`).
  - `/ships/fittings/compare`: ordinary nested route (`src/app/App.tsx:172`), shares no state.
  - `/ships/tree`: Ship Tree. Only query param: `?faction=<int>` (`intParam(DEFAULT_FACTION_ID, {min: 0})`, `ShipTreeTab.tsx:31`). Default faction Caldari (`shipTreeModel.ts:25`). Unknown/missing id -> `resolveFactionID` falls back to Caldari (test `ShipTreeTab.test.tsx:176`).
- Nav: `progression` group, `mobileTab: true`, `gating: 'scope'` but route requirement `UNGATED` (`src/app/navDestinations.ts:165`, `src/app/routeScopes.ts:107`): no ESI scope needed to open; Tree works with no Character.
- Header: `Ships` draws `PageHeader` + `ShipsTabBar` for the Tree tab only; `Fittings` draws its own header and tab bar on its Start screen only (an open Fitting shows neither). Header title is `nav.ships` on both tabs.
- Legacy redirects (`LegacyShipsRedirect` = `Navigate replace`, keeps search/hash/state so old `/fittings?f=` Share Codes keep working; `legacyShipsLocation`, `fittingRoutes.ts:54`): `/skills/ships` -> `/ships/tree` (the old Skills > Ships page is gone); `/fittings/compare` -> Compare path; any other `/fittings/*` -> editor when a share code is present, else `/ships/fittings`. Mounted at `App.tsx:165,175`. `fittingsRedirect` also bounces `/ships/fittings?f=` -> edit, and edit without a code -> Fittings. Redirects are permanent by decision (every share code ever copied is `/fittings?f=`).

## 2. Data and persistence

| Data                                                        | Source                                                                                                                              | Persist / sync  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| Ship tree (hulls, classes, class prereqs, factions, traits) | baked SDE `loadShipTree()` + `shipTreeSkillCatalog()` (static, no ESI, no network)                                                  | bundled         |
| Masteries (tiers I-V per hull)                              | baked `loadMasteries()` (CCP masteries = certificate grades; `tierLadder.ts`)                                                       | bundled         |
| Blueprint catalog                                           | baked `shipTreeBlueprintCatalog()`                                                                                                  | bundled         |
| Pilot's trained skills, attributes, implants                | `usePlanEditorData(characterId)` (`loadCorrectedSkills` = ESI skills + queue correction, attributes, implants, all cache-first)     | Dexie ESI cache |
| Clone state (Alpha/Omega)                                   | `useCloneStates`, synced setting `sync.skillCloneStates`                                                                            | synced          |
| Owned blueprints                                            | `loadCharacterBlueprints` (ESI, scope `esi-characters.read_blueprints.v1`, `src/esi/registry.ts:225`)                               | Dexie ESI cache |
| Hull and class art                                          | copied into `public/images/ship-tree/` (never hot-linked); hull renders `typeRenderUrl` (EVE image server, `crossOrigin=anonymous`) | static          |
| View choice Map/Ladder                                      | `createLocalSetting` `shipTreeView` (Dexie settings, device only; `null` = never chosen)                                            | device          |
| "Show missing" in Skills & Mastery                          | `shipInfoShowMissing` (default false)                                                                                               | device          |
| Target Skill Plan                                           | `useTargetPlan` (synced per Character)                                                                                              | synced          |
| Selected hull, ladder filter, only-flyable, map camera      | component state only                                                                                                                | not persisted   |

Scopes: none gate the page. Skills/attributes/implants reads are the Skills area's grants; blueprints tab needs the blueprints scope. When a scope is missing the corresponding data is simply absent (see states).

## 3. Status engine (exact rules)

`hullStatuses` (`src/engine/shipTree/status.ts:20`), per hull:

- `missing` = the hull's OWN `ship.required` skills where `trainedLevel < required level`. `canFly = missing.length === 0`.
- `secondsToFly` = 0 when flyable; else `computeSkillPlanSchedule(...).totalSeconds` for exactly those missing skills (attributes, implants, clone state, no boosters, no remap markers, start = page-load time `now`). It does not read the schedule's `alphaCappedSteps`, so an Alpha pilot missing an Omega-only level still gets a finite time (class-level Omega marks come from `classNeedsOmega` instead).
- `mastery` = `tiersReached(masteries[typeID], trainedLevel)` ONLY when flyable, else 0 (`status.ts:49`). `tiersReached` (`tierLadder.ts:17`) walks tiers in order and stops at the first unmet OR EMPTY tier (a hull with no tier V skills tops out at IV, never "Mastery V").
- Tile tone (`rules.ts:74`): `locked` (dim) if not flyable; `elite` (gold) only at Mastery V; else `canFly`.
- Class rules (`rules.ts`): `classUnlocked` = every class prereq for this faction trained (displayed or not; lights the class and its connector lines). `classNeedsOmega` = any class prereq level > the skill's Alpha max (cap 0 = Alphas cannot train it); drives the gold Omega marks. `parentEmpires` = for a pirate faction class with exactly two displayed empire prereqs, returns [bottom, top] sorted by descending faction id (Caldari above Gallente as in game); [] for empires, ORE, others.
- Tech marks (`techMark`, `shipTreeModel.ts:90`): T3 (`techLevel >= 3`, red III), T2 (orange II), else faction/Navy ◇ when `metaLevel >= 6` or the class is a stacked class or the faction is a pirate faction; shown always, independent of mastery.
- Flyable count per faction = hulls with `canFly` / total hulls (`flyableCount`).
- Status gating (`useShipTreeData.ts:84-87`): with a Character, no statuses are computed until its trained skills have been read (`trainedSkillsKnown`); until then everything renders dim rather than guessing. With no Character, statuses compute against zero trained skills (everything dim) and clone = Omega.
- Time `now` is captured once at mount (`useState(() => new Date())`), so "time to fly" does not tick.

## 4. Ship Tree tab

States (`ShipTreeTab.tsx`): loading spinner `ships.tree.loading`; failed (tree or catalog) `EmptyState` `ships.tree.loadFailed` + "Check your connection, then reload the page"; no Character: banner `ships.tree.noCharacter` ("every hull shows as untrained"), tree still drawn dim; credit footer (`ships.tree.credit`, CCP art via EVE University wiki). Masteries failing to load is swallowed (`useShipTreeData.ts:70-71`): the tree reads, badges are just empty, no notice.

View switch (`SegmentedControl`, label "Ship tree view"): Map | Ladder. Default Map on desktop, Ladder on phone (`resolveShipTreeView`, `shipTreeViewPreference.ts`); choice stored per device and never in the URL. On phone, or whenever view is Ladder, `FactionBar` shows above the view; on the desktop Map the faction picker is the in-canvas grid.

### Map (`ShipTreeMap.tsx`)

- Canvas: viewport `h-[calc(100dvh-17rem)] min-h-[28rem]`, pan by drag (ignored when the drag starts on a button), zoom by wheel (`exp(-deltaY x 0.002)`) and pinch (`@use-gesture/react`), zoom clamped 0.2 to 2.5 (`mapCamera.ts:19-20`). Opens at 100% (native) on first load and on every faction switch, even after the reader zoomed (`ShipTreeTab.test.tsx:155`); Fit is explicit (`fitCamera`: z = clamp(min(1, (width-40)/world.w, (height-40)/world.h), floor 0.25), centred).
- Toolbar: view switch, hull search, "{flyable}/{total} flyable" for the faction, Show hull names toggle, Zoom out / zoom % / Zoom in (step x1.2, disabled at limits), Fit ("Fit the whole tree"). Fit reserves 256px for the faction panel only when the canvas is wide enough (`showFactionGrid && viewport.width - 256 >= 480`).
- Camera remembered per faction while moved; others start at 100% or centred on a searched hull (`focusCamera`: zoom max(current, 0.8)).
- Layout (`src/engine/shipTree/layout.ts`): pure geometry, tiles 96px, gap 3, max 3 tile columns per class, lanes `main | branch | capital | industry | drop` (ISIS shape: main line left to right from a capsule; Navy classes stacked directly above, others stepped right; capitals a second trunk; industry the lower line; ORE Bowhead on a third row).
- Marks: class icon lit when `classUnlocked`, connector pipes bright when the child class is unlocked; one five-block bar per displayed class skill filled to trained level (`SkillBlocks`, label "{skill} {level} - have {have}"); gold Omega marker on the line into a class needing Omega; pirate classes show two parent-empire emblems that switch faction on click; every hull tile has tone, tech corner, winged mastery badge (empty until Mastery I). Tile aria-label "{name} - {Can fly | N to fly}".
- Hover = in-game style card (render, name, class, grouped bonuses, hint "Click for fitting, skills and blueprint"); click opens Ship Info. Legend (bottom-right on wide canvas): gold = Mastery V, bright = can fly, dim = can't fly yet, Omega = needs Omega.
- `FactionGrid` (desktop, in-canvas top-left, `FactionGrid.tsx`; verified): 5-column icon grid in in-game order (`inGameFactionOrder`, `aria-pressed` on the current one, tooltip "{name} - N of M flyable"), below it the current faction's emblem, name, flyable count and blurb. There are NO edge buttons in the grid. "Switch to {name}" buttons (`ships.tree.switchFaction`) are the pirate-class parent-empire emblems drawn by the map (`ShipTreeMap.tsx:350-362`) and the Ladder's pirate section chips (`ShipTreeLadder.tsx:253`).
- `MapSearch` (`MapSearch.tsx`): searches ALL factions' hulls by substring on hull name (`searchHulls`: ranked by match position, then name; empty/whitespace query returns nothing). `/` focuses it when not typing (`aria-keyshortcuts="/"`), Enter opens the first hit, Escape clears. Picking a hull of another faction switches `?faction=`, focuses the camera on it and opens Ship Info.

### Ladder (`ShipTreeLadder.tsx`)

The same tree read top to bottom. Each main-lane class is a collapsible `<details>` section (top level open by default, nested classes closed; `ladderSections`/`isNested` nest branch, capital and drop lanes under their parent). Per section: icon, name, "flyable of total", Omega chip where the Map would draw an Omega (test `ShipTreeTab.test.tsx:259` asserts they match), "Needs:" skill chips (displayed class skills with "have N"), hull list with tone/tech/mastery.

- Filter box "Search this faction..." (substring on hull names, current faction only); "Only ones I can fly" checkbox (`canFly === true`). Both are local state, lost on faction switch/reload.
- While a filter is active every section with a match is forced open and manual collapse is ignored (`open={searching || userOpen}`, `ShipTreeLadder.tsx:191`), restored when cleared (test `:279`, same file). Sections with no visible hull or descendant are hidden.
- "Other factions:" chip row while filtering: matches from other factions (`searchHulls` over hulls of other factions); tap switches faction and opens that hull (test `:319`). Empty: "No hulls match."
- No zoom in Ladder by decision (`20260927-100237`).

### Faction bar

Buttons per faction in game order with flyable counts from `statuses`; shown with Ladder and on phone. Switching writes `?faction=` (kept in history).

## 5. Ship Info window (`ShipInfoWindow.tsx`)

Opened by clicking any hull tile/row/search hit. Component state `selected` in `ShipTreeTab` only (not in URL).

- Verified (`ShipInfoWindow.tsx:95-122`, `src/components/ui/SlideOver.tsx`): from `sm` up (touch tablets too) a non-modal right `SlideOver`, `max-w-[40rem]`, Radix Dialog `modal={false}`, no backdrop, a click outside does NOT dismiss, so the tree behind stays live and clicking another hull retargets the window. Below `sm` (`useIsPhone`): bottom-sheet `Modal` (`placement="sheet"`, grabber, swipe down, scrim). Close on both: X, Escape, and Back (`useOverlayHistory(open, onClose, closeOnBack=true)` pushes a history entry so browser Back closes it; `SlideOver.tsx:55-56`).
- Header: 256px render (112px thumb), name, "faction - class - Tech N", fly dot + `flyLabel` ("Can fly" or "{duration} to fly"), mastery badge + "Mastery <roman>" or "No Mastery yet" (gold at V).
- Tabs (short labels on phone): Description, Fitting, Skills & Mastery, Blueprint. Tab state resets to Description on close; the tab body is keyed by hull so retargeting restarts each tab. Add-to-plan Undo toast lives at window level so it survives tab/hull switch (`useTimedToast`).

### Description (`DescriptionTab.tsx`)

Class and faction tags (tooltips with descriptions), bonuses via `TraitList` (verified): `traitGroups` groups by `skillTypeID` in first-seen order; each group headed "<Skill> bonuses (per skill level)" or, for `skillTypeID === null`, "Role bonus"; each line shows `bonus+unit` bold (or a dot when null) then text; then CCP's description (whitespace preserved). Class and faction tags are plain text with description tooltips.

### Fitting (`FittingTab.tsx`)

Base hull stats table: high/med/low slots, rig slots (+ size S/M/L/XL), turrets, launchers, CPU (tf), powergrid (MW), calibration, drone bay (m3), drone bandwidth (Mbit); note that figures are unskilled base values. Tech III with 0 high+med+low: slot rows hidden, note "slots come from subsystems". Buttons: Simulate (builds `newFitting(typeID, name)`, `encodeFittingShare`, navigates to `/ships/fittings/edit` with the payload in the URL; encode failure or throw -> role=alert `simulateFailed`), `PopularFitsPanel` (popular fits for the hull; opens in the editor; failure -> `popularFailed`). All disabled while busy.

### Skills & Mastery (`SkillsMasteryTab.tsx`)

- "Show missing" chip (Character only; device setting `shipInfoShowMissing`, persists across hulls): hides trained required skills / tier skills; "all trained" note when nothing is left.
- Required Skills section (`RequiredSkillsSection`): per skill trained level vs required, status icons, per-skill add to target Skill Plan (`useTargetPlan`).
- Mastery: tier picker I-V (default `min(5, mastery + 1)`); per-tier bundle lists ONLY the skills that tier asks a level of (`p.level > 0`); tier N "to add" is CUMULATIVE: `masteryTierEntries` merges tiers 1..N taking the max level per skill, minus trained (`shipTreeModel.ts:170`). Per skill training time and tier total come from `scheduleEntries` with the pilot's attributes, implants, clone state (`src/features/skills/ships/scheduleEntries.ts`); no times without a Character.
- Tier button states: complete (`tierComplete`: non-empty and all trained), planned (`tierPlanned`: all skills trained or covered by the target plan, `isEntryCovered`), otherwise "Add tier N to plan" adds only `unplannedTierEntries` to the target plan (creating a plan if none), toast with Undo. A covered tier shows "In plan" instead of a no-op Add (test `ShipInfoWindow.test.tsx:282`). No masteries -> `noMasteries`.

### Blueprint (`BlueprintTab.tsx`)

Resolves the hull's blueprint via `planTargetForItem`. Spinner while the baked catalog loads; `loadFailed`; hulls nothing manufactures -> `none`. Shows blueprint icon and name; with a Character and cached blueprints: "Own original" and/or "Own N copies" (`ownedBlueprintSummary`: runs `-1` = original, else copy; failure to read blueprints is silent). Links: "Find a copy" (BPC sourcing `bpcSourcingHref`), "View in market", "Plan build" -> `/industry` plans tab `?product=<typeID>`; disabled with note `planNeedsCharacter` when no Character.

## 6. Test-covered behavior (concrete assertions)

- `src/routes/Ships.test.tsx`: opens on Fittings; library and editor stay one mounted page; Compare has its own route; Tree tab sits under one Ships header and its tabs switch back; unknown segment -> Fittings; an old Share Link opens the editor.
- `ShipTreeTab.test.tsx`: opens on Caldari map with every faction in the bar; tiles carry tone + tech corner; exactly one Omega drawn, before the Interceptor, locked class dimmed; hover card groups bonuses as in game; zoom resets to 100% on faction switch even after zooming; faction kept in URL, unknown URL faction -> Caldari; search across factions switches faction and opens the hull; load failure message instead of endless spinner; nothing flyable until skills are read; Map/Ladder choice remembered; Ladder carries class counts, Omega chips (identical to the Map's), tech corners, tone, badge; sections forced open while searching; specialised classes nest under parents; "only ones I can fly" filter; other-faction chips on search; pirate class links to parent empires; tap opens Ship Info; no-Character render dims everything and says why; a hull with nothing to add to a plan.
- `ShipInfoWindow.test.tsx`: header (hull, standing, Mastery); Description grouped bonuses; Fitting base slots/resources, Simulate opens a new Fitting, Simulate encode failure message, popular fit opens, T3 "slots from subsystems"; Skills & Mastery required skills + Add tier N, covered tier shows In plan, tier lists only skills with a level, Show missing hides trained / says nothing left / hidden without Character, per-skill times + tier total, fully trained checks every tier; Blueprint ownership + Build Plan, catalog load failure, nothing manufactures it, no Character disables planning with hint.
- `mapCamera.test.ts`: native-100% centring, fit shrinks never below floor, inset handling, focus zooms to >= 80%, point under pointer stays fixed on zoom, wheel direction, zero delta no-op, zoom in/out round-trips.
- `src/engine/shipTree/status.test.ts`: 0s to fly when all trained; times only missing skills; Mastery = highest fully trained tier in order; V when all met; IV cap when tier V empty; 0 when not flyable or no data; a status per hull. `rules.test.ts`: class needs every faction prereq (displayed or not); Omega when any prereq > Alpha cap; pirate parents [bottom, top] by descending id, empty for empires/ORE, hidden prereqs ignored and de-duplicated; elite only at Mastery V; locked when not flyable.

## 7. Interview Q&A

1. **How does the app decide a hull is flyable and how long until it is?** Only the hull's own required skills count; `canFly` when all trained, else `computeSkillPlanSchedule` total seconds over just the missing skills using the pilot's attributes, implants and clone state, no boosters or remaps. `src/engine/shipTree/status.ts:20-50`.
2. **Why can Mastery show 0 on a flyable hull, and why not "V" for a hull with no tier V?** Mastery is only evaluated when the hull is flyable, and `tiersReached` stops at the first unmet or empty tier, so a missing/empty tier V caps at IV. `status.ts:49`, `src/engine/tierLadder.ts:17`.
3. **Why is the Ship Info tab's "Add tier N" cumulative?** CCP masteries are ladders of certificate grades; reaching tier N implies all lower tiers, so `masteryTierEntries` merges tiers 1..N at max level per skill, subtracts trained, and `unplannedTierEntries` drops what the target plan already covers. `shipTreeModel.ts:170-200`.
4. **What is in the URL vs not?** Only `?faction=` (plus the path tab). Selected hull, Ladder filter, only-flyable and camera are component state; Map/Ladder choice is a device Dexie setting. ADR 0015 says the URL holds view state, but a hull window is not linkable. `ShipTreeTab.tsx:31,59-62`, `shipTreeViewPreference.ts`.
5. **Why does Map open at 100% not fit-to-screen?** Decision: native size reads better and pinch-zoom exists; Fit is manual and only reached from the button. Applies on first load and every faction switch. `mapCamera.ts:54`, `20260927-100237`.
6. **How do the Omega marks work and are they accurate for an Alpha pilot?** Marks come from class prereq levels vs the skill's Alpha max (`classNeedsOmega`, cap 0 = untrainable), independent of the pilot's clone. Hull `secondsToFly` ignores Alpha caps. `rules.ts:40`, `status.ts:30-44`.
7. **What happens with no Character, or before skills have loaded?** The tree and catalog still load; with no Character statuses are computed against zero skills (dim), with a Character none are computed until `trainedSkillsKnown`, so the tree never guesses. `useShipTreeData.ts:70-86`.
8. **Does the Ship Tree call ESI?** The tree, masteries and blueprint catalog are baked SDE. ESI is only the pilot's skills/attributes/implants (cache-first, Skills area) and the Blueprint tab's owned blueprints (scope `esi-characters.read_blueprints.v1`). No scope gates the route. `useShipTreeData.ts`, `BlueprintTab.tsx:21-38`, `routeScopes.ts:107`.
9. **How does search work and what is its keyboard model?** Substring on hull name across all factions, ranked by match position then name; `/` focuses, Enter opens the first hit, Escape clears; a hit in another faction switches faction, centres the camera (zoom >= 0.8) and opens Ship Info. `shipTreeModel.ts:124`, `MapSearch.tsx:60-67`, `mapCamera.ts:59`.
10. **Why do old bookmarks still work?** `/skills/ships` and `/fittings/*` are permanent redirects preserving search/hash/state, because every Share Code ever copied was `/fittings?f=`. `fittingRoutes.ts:54`, `App.tsx:165,175`.
11. **Why one mounted component for library and editor?** Opening a Fitting must carry workspace state (name, record, Load warnings, drone launch) across the navigation; a standalone tab path under the Fittings tab keeps one instance. `shipsTabs.ts`, `Ships.test.tsx:72`.
12. **Why is the tree an exception to the design tokens?** It keeps the in-game palette (documented in `docs/DESIGN.md` Ship Tree section; only Mastery V and Omega golds are shared tokens); art is copied locally so the tree never depends on the wiki being up. `20260926-135538`.

## 8. Observed gaps

- Selected hull, Ladder filter and only-flyable are not in the URL; a Ship Info window cannot be linked (only `?faction=`).
- Masteries and owned-blueprint load failures are swallowed (`useShipTreeData.ts:70-71`, `BlueprintTab.tsx:57`): badges vanish or "own" text is absent with no notice.
- `secondsToFly` ignores Alpha caps (`status.ts`): an Alpha pilot is shown a finite time for a hull needing Omega-only levels; Omega marks exist only at class level.
- "Time to fly" and `now` are fixed at mount; no refresh control on the tab, so statuses lag until the Skills data refreshes elsewhere.
- Ship Tree has no sort, no export/CSV, no "flyable now" aggregate across factions; Ladder filter is faction-local and not remembered.
- Map search is Map-only; Ladder has a separate faction-local filter plus other-faction chips.
- No Ship Tree entry in Help/FAQ (`src/features/help`, `src/features/faq`); strings only under `ships.*` in `en.json`.
- Tile keyboard navigation beyond focus and the `/` search shortcut is not implemented (tiles are buttons with aria-labels; no arrow-key traversal found).

## 9. Improvement ideas

- Put the open hull (`?ship=<typeID>`) and tab in the URL so Ship Info is shareable; keep window state in sync with Back.
- Mark Alpha-impossible hulls (use `alphaCappedSteps` in `hullStatuses`) and show "Omega required" on the tile and window header.
- Show a quiet notice when masteries or blueprints failed to load, with retry.
- Add a "what can I fly now" cross-faction list/export and a Mastery progress summary.
- Persist the Ladder filter/only-flyable per device and add a refresh button or data-age badge on the tab.
- Arrow-key traversal and Enter-to-open on Map tiles; announce faction changes to screen readers.
