# Industry: Build Plans, plan page, group page (feature inventory)

Scope: Industry > Build Plans tab (`/industry/plans`), plan page (`/industry/plans/:planId`), group page (`/industry/groups/:groupId`), Build Plan + Build Group model, materials table, recipe modal, Blueprint Acquisition modal, Build Location pickers, Compare, Auto Build, Fit Import, Retarget, Production Runs panel on the plan page, assumed ME/TE + facility defaults, Calculation Breakdown, `computeBuildPlan` / `buildVsBuy` engine, ADR 0006. Records / BPC Sourcing / Opportunities / Active Jobs / tab shell: see `docs/features/industry-records-sourcing.md`. Settings form catalog: `docs/features/settings.md`.

Terms per `CONTEXT.md`: **Build Plan**, **Build Group**, **Group Rollup**, **Group Owned Overlay**, **Fit Import**, **Build Location**, **Build System**, **Reaction Location**, **Include Reactions**, **Remembered Location**, **Acquisition Verdict**, **Sale Profitability**, **Calculation Breakdown**, **Auto Build**, **Build Strategy**, **Craft Scope**, **Blueprint Acquisition**, **Seeded Build Plan**, **Production Run**, **Facility Preset**, **Industry Activity**, **Character Modifiers**. UI copy says "group" for Build Group (CONTEXT.md **Build Group**).

Prior docs this expands: ADR 0006 (`docs/adr/0006-build-plan-dual-verdict-and-profit-toggle.md`), ADR 0015 (tab = path segment), `docs/plans/build-groups.md` (Build Groups spec, partly stale, see Gaps), `docs/context/decisions/` (cited inline), `docs/UX-REVIEW.md` §6 (early plan-page review, jargon tooltips since added), `docs/research/competitors.md` §2.3 (Ravworks/EVE Tycoon recursive trees; now implemented).

## 1. Summary table

| Feature                                              | Where                                                                     | Notes                                                                                                |
| ---------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Plan list (ungrouped + groups)                       | `/industry/plans` `BuildPlanList.tsx`                                     | One flat `<ul>`; groups collapsed by default; per-row Profit / ISK/h / Margin / Verdict / Runs       |
| Create plan by blueprint search                      | `BlueprintPicker.tsx` over list                                           | Product-name substring, 20 results, "Owned" tag; stays on index                                      |
| Sort columns                                         | list header `SortHeader`                                                  | Profit, ISK/h, Margin; desc, asc, manual; within section only                                        |
| Drag plan into/out of group                          | `BuildPlanList.tsx`, `groupDrop.ts`                                       | dnd-kit, pointer only; handle appears after first group exists                                       |
| Row menu (also right-click / long-press / Shift+F10) | `PlanRow`, `GroupHeader`                                                  | Plan: Move to group, Rename, Duplicate, Delete. Group: Rename, Delete group                          |
| Inline rename                                        | double-click name or menu                                                 | Enter/blur commits, Esc cancels, blank ignored                                                       |
| Create group                                         | toolbar icon                                                              | "New group" (`industry.newGroupName`), expanded, empty group persists                                |
| Delete group                                         | menu + confirm modal                                                      | Confirm only when non-empty; deletes member plans too                                                |
| Fit Import                                           | toolbar icon, `FitImportDialog.tsx`, `fitImport.ts`                       | Paste EFT, preview, create group + plans; also opened by Fittings "Manufacture Plan"                 |
| Compare mode                                         | toolbar icon, `BuildPlanCompare.tsx`                                      | Check 2+ plans (or whole groups); table, CSV                                                         |
| Plan page: verdict hero                              | `PlanVerdictHero.tsx`                                                     | Net profit big number, qualifiers, Acquisition Verdict pill, Use-or-sell pill, Log Production        |
| Setup panel (fold)                                   | `BuildPlanDetail.tsx:1243`                                                | Read-only fact summary; "Edit" unfolds inputs                                                        |
| Runs input + Break-even runs                         | Setup > Blueprint                                                         | Break-even only when profit < 0                                                                      |
| Build Location picker + Override                     | `BuildLocationPicker.tsx`                                                 | ESI structure/station search; fills facility, system, band                                           |
| Facility / Build system / Rigs / Facility tax        | Setup > Location & market                                                 | Rig match helper modal; tax structures only                                                          |
| Trade hub + Material price basis                     | Setup > Location & market                                                 | Sell vs buy side for materials only                                                                  |
| Include Reactions + Reaction Location                | Setup (manufacturing plans)                                               | Second location + rigs + tax                                                                         |
| Use group target                                     | Setup heading (`GroupTargetLink.tsx`)                                     | Per-plan quick-fill from group's last Retarget                                                       |
| Materials panel (errand sections)                    | `MaterialsTable.tsx`                                                      | To buy / Building / Blueprint / Already have; desktop tables, phone ledger                           |
| Have / Price inline edit                             | materials rows                                                            | Commit on blur/Enter; revert-price icon; Undo toast                                                  |
| Build instead / Buy instead / Recipe                 | materials rows                                                            | Per-material `buildHere`; make-or-buy advice glyph + tooltip                                         |
| Auto Build (single plan)                             | `BuildPlanAutoBuildControl.tsx`                                           | Strategy select applies immediately, whole tree, no confirm                                          |
| Owned Material Source + Corp Assets + Use all/none   | `OwnedStockScopeControl.tsx`, `OwnedStockHint.tsx`                        | ESI asset detection; scope everywhere/locations                                                      |
| Copy shopping list                                   | Materials toolbar                                                         | Multibuy text, tab-separated, leaf materials, blueprints dropped (toast)                             |
| Materials CSV/table export                           | Materials toolbar `TableActionsMenu`                                      | 5 columns incl. make-or-buy                                                                          |
| Refresh prices                                       | Materials toolbar                                                         | Bumps `refreshTick`                                                                                  |
| Build recipe modal                                   | `BuildRecipeModal.tsx`                                                    | Runs, yield, inputs, time, fees, unit cost, ME; walk nested builds                                   |
| Blueprint Acquisition modal                          | `BlueprintAcquisitionModal.tsx`                                           | Owned, Contracts, Market, LP Store, Manual; "Use this blueprint"                                     |
| Costs & revenue ledger                               | `ResultsSummary.tsx` (collapsible)                                        | Job fee disclosure, tax, broker, net/gross toggle, break-even, use-or-sell                           |
| Calculation Breakdown modal                          | `CalculationBreakdown.tsx`                                                | Rule + live values per figure                                                                        |
| Production Runs panel                                | `ProductionRunsPanel.tsx`                                                 | Log Production, edit, link sales, watch orders, CSV                                                  |
| Log production from Active Jobs                      | `IndustryPlanPage.tsx:59-66`, `BuildPlanDetail.tsx:398`                   | Router state seeds Log Production form                                                               |
| Group page                                           | `/industry/groups/:id` `BuildGroupPanel.tsx`                              | Verdict band, Auto Build, Retarget, copy list (per hub), Members, Crafted, Materials + owned overlay |
| Retarget group dialog                                | `RetargetGroupDialog.tsx`                                                 | Two-step bulk write of hub/facility/security/system                                                  |
| Auto Build (group)                                   | `AutoBuildControl.tsx`                                                    | Strategy select + Apply... confirm; per-member                                                       |
| Group Owned Overlay                                  | group Materials panel                                                     | Ledger on group; nets against rollup                                                                 |
| Assumed ME / Assumed TE / Count blueprint cost       | Settings > Industry, gear on Plans tab                                    | Synced settings                                                                                      |
| Remembered location per activity                     | `facilityDefaults.ts`, `rememberLocationFromEdit.ts`                      | Where next plan starts; no Settings control                                                          |
| Deep links into plans                                | `Industry.tsx:235`                                                        | `?product=`, `?material=`, seed `me/te/runs/bpPrice`                                                 |
| Engine                                               | `computeBuildPlan` > `buildVsBuy`, `materials`, `jobCost`, `fees`, `time` | Pure; recursive sub-builds                                                                           |

## 2. Routes, entry points, link-ups

| Route                       | Component                                              | Notes                                                                                                                                      |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/industry/plans`           | `Industry.tsx` Plans tab (`usePageTab(INDUSTRY_TABS)`) | Bare `/industry` resolves here. `src/app/App.tsx:166`                                                                                      |
| `/industry/plans/:planId`   | `IndustryPlanPage.tsx`                                 | `App.tsx:167`. Not-found / other Character's plan: redirect to Plans tab (`IndustryPlanPage.tsx:93`). No Character: redirect `/characters` |
| `/industry/groups/:groupId` | `IndustryGroupPage.tsx`                                | `App.tsx:168`. Missing group: redirect to Plans tab (`IndustryGroupPage.tsx:135`)                                                          |

- All three routes UNGATED (`src/app/routeScopes.ts:97,118,119`); panels gate their own scopes. Document title "Industry > Build Plans" for the plan and group routes (`src/app/documentTitle.ts:37-38`); bare `/industry` gets "Industry" (`:31`).
- Plan + group pages render `IndustryHeader` with `activeTab="plans"` and `tabsActivation="manual"`; picking another tab navigates to that tab's path (`IndustryPlanPage.tsx:112`).
- Page loads wait on `useIndustryWorkspace` hydration; plan page also waits on `pricingInputs.hydrated` (#2054) and catalog, group page on `buildGroupsHydrated`. Spinner while waiting. `workspaceLoadCache.ts` lets a second page start from the last load.
- Inbound link-ups (all land through `Industry.tsx` effects, `Industry.tsx:235-304`):
  - `/industry?product=<typeId>`: Market item menu, Assets, appraised rows, BPC Sourcing rows. Opens existing plan for that blueprint (matching seed if any) else creates one; `replace` navigate to plan page. Unknown typeId strips the param.
  - `?product=&me=&te=&runs=` (`planSeed.ts`): Seeded Build Plan from BPC Sourcing offer / contract line / Contract Search row. All-or-nothing, ME 0-10, TE 0-20. Name "Product me/te xruns" (`industry.seededPlanName`).
  - `?product=&bpPrice=<isk>` (`planSeed.ts:24`): LP Store "Plan in Industry". Writes the redemption price as the blueprint's `materialSourcing` override; reopening an existing LP plan refreshes a stale price (`Industry.tsx:255-266`).
  - `?material=<typeId>`: Assets "View in Industry as material"; opens first plan whose tree consumes it (`buildPlansByMaterialTypeID`); strips param if none.
  - Router state `fitImportText` (`lib/shortcuts.ts:30`): Fittings Export "Manufacture Plan" opens Fit Import dialog pre-filled and parsed (`Industry.tsx:136-153`).
  - Router state `logProductionFromJob` (Active Jobs "Log production..."): see sec 6.14.
  - Opportunities "Plan" (`StartPlanButton.tsx`, `handleStartPlan`, `Industry.tsx:526`): creates plan, opens plan page, busy until unmount. Opportunities "Add to compare" (`Industry.tsx:506`): creates plans, selects them, switches to Plans tab in comparing state.
  - Records row click (`openRunFromRecords`, `Industry.tsx:552`): expands containing group then opens plan page.
  - Global shortcut `go-to-industry` (`lib/shortcuts.ts:175`) is the only Industry keyboard shortcut; none inside plans/groups.
- Outbound: BPC Sourcing from acquisition modal (`bpcSourcingHref(typeId)`, `IndustryPlanPage.tsx`), item context menus (Market, Show info, Build Plan) via `ItemActionsProvider`/`usePageItemActions`.

## 3. Build Plans tab (`/industry/plans`)

Host: `src/routes/Industry.tsx` (Plans branch `Industry.tsx:653`). Chrome above the list: `PageHeader` "Industry" + gear (IndustrySettingsForm), Active Jobs panel, blueprints reauth banner, 4-tab strip (`IndustryHeader.tsx`).

### 3.1 States

- Loading: spinner until plans, catalog, `buildGroupsHydrated`, `expandedGroupsHydrated` (`Industry.tsx:573`).
- Empty (no plans, no groups): EmptyState "No build plans yet / Create a plan to price out a manufacturing job" (`BuildPlanList.tsx:946`). Picker + toolbar still shown. Empty group with no plans shows only its header.
- Plans exist: `AssumesBaseStandingsNote` above the picker (broker fee at 0 standing hint, `Industry.tsx:654`).
- Per-row figures loading, unpriceable or errored: all render "—" / Unknown tag (no distinct loading cell). `useComparedBuildResults` placeholder rows.
- Compare mode with <2 checked and "Compare" pressed: EmptyState "Select at least 2 plans" + hint "Check 2 or more build plans..." + Done (`Industry.tsx:642`).

### 3.2 Toolbar (Panel actions, `BuildPlanList.tsx:898-940`)

- Normal: Import a fit (clipboard icon, `fitImportOpen`), Create group (BuildGroup icon), Compare (icon, only when >1 plan). Icon-only to fit a phone (#626 comment).
- Compare mode: Cancel + "Compare (N)" primary, disabled below 2 checked.
- Compare mode flag in URL param `plans.compare` (`Industry.tsx:156`); turning it off (Back, bare link) clears ticks (`Industry.tsx:158-164`). Tick set and `comparing` view are component state only.

### 3.3 Blueprint picker (create)

`BlueprintPicker.tsx`: `SearchInput` (placeholder "Search and add…", aria "Add build plan"), `searchByProductName` = lower-case substring on product name over `catalog.entries` (`blueprintCatalog.ts:124`), first 20 (`MAX_RESULTS`), no "N more" hint, no arrow-key navigation (buttons), "Owned" tag if `findOwnedBlueprint` hits. Pick: `createPlan(entry)` then clears query, stays on index (`Industry.tsx:666`). Reaction formulas are in the same catalog (activity from SDE). Search is by product name only, not blueprint name.

`createPlan` (`Industry.tsx:174`, `newBuildPlan.ts`): ME from owned copy else assumed ME, TE from owned else assumed TE; location from Remembered Location for the plan's activity, else most recently updated plan's location when its facility hosts the activity, else NPC station / Athanor fallback; hub + material price basis from the most recently updated plan (#456). Seeds override ME/TE/runs/name.

### 3.4 Column strip + rows

Header strip (`BuildPlanList.tsx:979`): not a table (flat `<ul>` so screen readers do not hear nested lists).

| Column   | Plan row                                                                                                          | Group row                                                                       | Breakpoint | Sort |
| -------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------- | ---- |
| Name     | name button (click opens, double-click renames), tooltip full name                                                | name button + caret toggle                                                      | always     | no   |
| Profit   | `result.profit` after fees (same as plan hero), sign + tone, `IskAmount`                                          | sum of members' profit (`BuildGroupRollup.profit` via `computeGroupIndexStats`) | always     | yes  |
| ISK/h    | `iskPerHour`                                                                                                      | blank                                                                           | `lg` up    | yes  |
| Margin   | `marginPct` 1 decimal                                                                                             | blank                                                                           | `lg` up    | yes  |
| Verdict  | Build/Buy/Unknown tag from `result.recommendation` (Acquisition Verdict); tooltip build vs buy totals (tap opens) | same, group rollup verdict                                                      | `sm` up    | no   |
| Runs     | plan's own `runs` input ("—" when 0), not logged runs                                                             | blank                                                                           | `sm` up    | no   |
| Trailing | `RowMoreActions` ⋮                                                                                                | ⋮                                                                               | always     |      |

- Sort cycle per column: desc, asc, back to manual order (`cycleSort`, `BuildPlanList.tsx:782`). Unpriced rows sink either direction. Sorts members within each group and the ungrouped block; group rows keep manual order. Sort state is component state (lost on navigation).
- Group row order = `sync.industryBuildGroups` order; no UI to reorder groups. Plan manual order = Dexie return order; there is no plan reorder UI, only group moves.
- Row click opens plan page; whole row is tappable (`isRowOwnEvent`, `useLiftAfterHoldGuard` swallows the click after a hold that opened the menu). `aria-current` never set (`selectedId={null}`).
- Dangling `buildGroupId` renders as ungrouped (`BuildPlanList.tsx:813-830`).
- Plan menu items (`BuildPlanList.tsx:429-459`): Move to group (submenu: each group, disabled if current; "Remove from group"), Rename, Duplicate, separator, Delete (danger). Duplicate keeps group membership (spreads source, `buildPlanStore.ts:81`), name `industry.copySuffix`, stays on index. Delete: `removeBuildPlan`, no confirm, no undo (`Industry.tsx:419`).
- Group menu: Rename, Delete group. Delete group of a non-empty group opens confirm Modal "Delete this group? All build plans in it will also be deleted." (`Industry.tsx:462-475,695-713`; decision `20260923-132836-deleting-a-build-group-now-deletes-its-member`). Members deleted first, group record last (`buildGroupActions.ts:34`).
- Group header: caret toggles expanded set (`useExpandedGroups`, device-local, per Character, stores expanded ids so new groups arrive collapsed; `expandedGroups.ts`). In compare mode a header checkbox (indeterminate) selects all members, including hidden ones.
- Keyboard: ⋮ button + Shift+F10/Menu key on the row (`RowActionsMenu`); drag handle `tabIndex=-1`, `aria-hidden`; "Move to group" submenu is the keyboard/WCAG 2.5.7 alternative (comment `BuildPlanList.tsx:481-499`).

### 3.5 Drag and drop

dnd-kit `DndContext` (`BuildPlanList.tsx:953`): PointerSensor distance 4, `touch-none` handle (`gripHitAreaClassName`), collision = pointerWithin, then rectIntersection, then closestCorners, measuring Always, autoscroll 0.2/0.25 threshold. Handle visible only when at least one group exists. `resolveGroupDrop` (`groupDrop.ts`) decides: drop on a group header or any row of an expanded group moves in; drop on an ungrouped row moves out; same-group / self / outside is a no-op (no write, no `updatedAt` bump). Drop target highlight (accent "into", dashed "out") uses the same resolver as the write. `DragOverlay` shows plan name only. Move expands the target group (`Industry.tsx:477`). Writes `moveBuildPlan`.

### 3.6 Create group / rename / expand

`handleCreateGroup` (`Industry.tsx:448`): uuid, name "New group", appended via `addBuildGroup`, expanded. Rename: `RenameField` (Enter/blur commit, Esc abandon, trims). Empty groups persist (existence lives in the synced setting).

### 3.7 Compare (`BuildPlanCompare.tsx`)

Not a route: replaces the list in `Industry.tsx:626` while `comparing`. Panel "Compare" with `TableActionsMenu` (CSV, surface `build-plan-compare`) and Done.

- Prices each plan independently via `useComparedBuildResults` (own blueprint/ME/TE/facility/hub/snapshot, one batched `loadMarketSnapshots`, same `resolveBuildPlan` as the plan page).
- Columns (all sortable): Plan (sticky link to plan page, `onPlanLinkClick`; InfoTooltip when unresolved/unpriceable), Product, Runs, Time, Total cost, Profit (tone), Margin, ISK/h, Break-even price. `responsive="table"` (scrolls sideways on phone, plan pinned). Default sort plan asc. "…" while loading, "—" when unknown.
- CSV columns `buildPlanCompareCsv.ts`: plan, product, runs, time seconds, total cost, profit, margin %, ISK/h, break-even.
- Shows `AssumesBaseStandingsNote`. Opportunities-seeded compare uses ordinary plans created by `planForOpportunityCandidate`.

## 4. Fit Import (`FitImportDialog.tsx`, `fitImport.ts`, `engine/import/fitToBuildPlans.ts`)

Modal "Import a fit" (`industry.fitImportTitle`) opened from toolbar icon or router state `fitImportText`.

- Controls: textarea (mono, 10 rows, Ctrl/Cmd+Enter chord parses via `onSubmitChord`), "Paste from clipboard" (error alert `fitImportPasteFailed`), "Read fit" (`fitImportParse`, disabled when blank), preview, "Include loaded ammo, one run each" checkbox (re-parses in place), Apply "Create N plans" / "Create 1 plan" (disabled at 0).
- Preview sections: Will create (hull first, "Product xQty", "N runs", optional "spare M"), "No blueprint - not imported" (faction/named/meta items + quantities), "Loaded ammo - not imported" (when charges excluded), header-failed alert when no `[Ship, Fit]` header.
- Aggregation: one pass keyed by resolved blueprint (one-line-per-copy and `xN` suffix both count); runs = ceil(quantity / unitsPerRun), clamped to `MAX_JOB_RUNS`; hull gets its own plan.
- Apply (`Industry.tsx:482`, `applyFitImport`): group name "<fit> — <ship>" (`industry.fitImportGroupName`) / header / hull / "New group"; group record written first, then all plans in one `createBuildPlans`; plans take ME/TE from owned copy else assumed ME/TE, hub/price basis from the most recent plan, location from Remembered Location; `updatedAt` stepped newest-first so the hull defines the batch's "most recent" hub. Group expanded and the page navigates to the group page.
- Ammo is excluded by default; Remembered Location is never written by an import (CONTEXT.md **Remembered Location**).
- Parser is shared with Skill Planner clipboard import and Appraisal only via `parseEftFit`.

## 5. Group page (`/industry/groups/:groupId`)

`IndustryGroupPage.tsx` loads members with a live query on `buildGroupId`, then `BuildGroupPanel.tsx`.

### 5.1 Layout, top to bottom

1. Title row: `<h1>` group name (focus target for route focus), "N plans" count (`groupMemberCount`). No rename/delete here (list only).
2. Loading spinner while any member row loads. Empty group: EmptyState "This group is empty" / "Move plans in from the list, or import a fit..." (`industry.groupEmptyTitle/Hint`, `BuildGroupPanel.tsx:551`).
3. Verdict band: group Acquisition Verdict only (`view.savings` / `view.verdict`): "BUILD saves X ISK", "BUILD is cheaper by X ISK" (verdict unknown but savings positive), "BUY is cheaper by X ISK", or Unknown. Sub-line: "N% cheaper than buying [at hub]" / "N% more than buying" (percent + hub only when buy cost known; hub only if single), "material X", "total job cost X", duration, "volume X" ("volume at least X" when any unknown). `GroupSlotLine` joins demand per slot pool to the active Character's free slots.
4. Auto Build row (`AutoBuildControl`): Build Strategy select + Craft Scope chips (Reactions chip lit when any member eligible) + "Apply..." (disabled while applying or when no member tree has a recipe). Trailing: Retarget group (icon), Copy shopping list for multibuy (icon, enabled only when single hub, no member unresolved, non-empty list).
5. Copy failure alert; mixed-hub notice + one "Copy <hub> list" button per hub (`copyHubShoppingList`) (each disabled when that hub has an unresolved member or empty list) (`BuildGroupPanel.tsx:704`).
6. Unpriceable warning (`industry.groupUnpriceable`) and a red list of members that failed to resolve.
7. Two columns from `lg`: left 20rem Members + Crafted; right Materials.
   - Members panel ("Plans in this group"): each plan is a link (`planHref`, plain click navigates in-app) showing its own `totalCost` ("—" while loading) + descend chevron.
   - Crafted panel "Crafted in this group · N" (when any): materials a member's own build tree fully produces; "Crafted" tag + explanatory hint. These are excluded from the buy table.
   - Materials panel: `OwnedStockScopeControl` (location scope, Use all / Use none), then `DataTable` of buy rows: Material (sticky), Quantity (need), Volume (hidden on phone), Owned (inline `SourcingInput` ledger + "Use assets" hint; hidden on phone), Still to buy ("Covered" green at 0; "unpriced" tag). `responsive="table"`, `TableActionsMenu` CSV (`groupMaterialsCsv.ts`). Empty: "Nothing left to buy — every material is already owned." (only when also nothing crafted).
   - Estimate note: "An estimate... never reports what it actually cost."
8. Retarget dialog when open; owned-bulk toast with Undo (`useOwnedStockBulk`).

### 5.2 Group Rollup semantics (`engine/industry/groupRollup.ts`, `groupRollupView.ts`)

- Each member re-resolved with owned-stock deduction off (`computeGroupResult: true`), member trees flattened two ways (`shoppingListMaterials` leaves for the buy list, `materialTableRows` for the display table), merged by type via `mergeCostLines` (per-job rounding kept; first real unit price wins; unpriced sticky).
- Group Owned Overlay (`group.ownedStock`, `group.ownedStockScope`) nets once against both lists; display only, never writes to a member's `materialSourcing`. A member's own page can disagree with group totals (documented).
- Mixed hubs: totals still sum in ISK; multibuy split per hub (`shoppingByHub`); header copy disabled.
- Verdict/profit unknown while any member loading/failed or any unpriced leaf (`computeGroupRollup.complete`).
- List-row Profit (`computeGroupIndexStats`) = summed sale profit; page headline = Acquisition Verdict savings. Two different measures for one group.

## 6. Plan page (`/industry/plans/:planId`)

`IndustryPlanPage.tsx` shell + `BuildPlanDetail.tsx` (2008 lines). `key={plan.id}` remounts per plan. Order top to bottom below.

### 6.1 Verdict hero (`PlanVerdictHero.tsx`)

- Corner "More actions" + right-click item menu on product name `<h2>`; `SkillGateMarker` chip if no Character on the account can install the product blueprint (account-wide, #1231); "· N runs · profit after fees" (`heroTitle`).
- Big figure = Sale Profitability: net profit after sales tax + broker (ADR 0006), tone-coded, `IskAmount` (tap shows exact). "Unknown" when unpriced; spinner while prices load; "No price data yet" hint.
- Qualifier line: margin %, ISK/h, duration, break-even price (net, always).
- `PlanSlotLine`: "<Character>: uses 1 <pool> slot - N free - done by <EVE time> if started now" (hidden without slot data).
- Pills: Acquisition Verdict ("BUILD saves X ISK" / "BUY is cheaper by X ISK" / Unknown; no fees, ADR 0006), Use-or-sell verdict pill (only when owned stock > 0, instant-sell basis).
- `BpcCoverageWarning` when profit unknown because an owned BPC's runs < plan runs; one-click "Set runs to N".
- Log Production button (primary; disabled if blueprint has no product) opens the Production Runs form.
- No Breakdown button here; it lives on the Costs panel header.
- `AssumesBaseStandingsNote` beneath when revenue known.

### 6.2 Setup panel (`BuildPlanDetail.tsx:1243`)

Folded by default into a read-only fact list (Runs, ME/TE only when no blueprint row exists and manufacturing, Build location or facility - system - band, Rig + Tax for structures, Trade hub, Material price basis). "Edit" / "Done" toggles (`setupOpen`).
Unfolded:

- Blueprint group: `BpcCoverageWarning`; Runs (`SourcingInput`, commits blur/Enter, blank keeps value, min 1, integer); "Break-even runs" button when `pricesReady` and profit < 0 (`breakEvenRuns.ts`: double then bisect up to `MAX_JOB_RUNS`; may miss a profitable pocket); if none found shows "No break even found up to {{max}} runs." (role=status). ME/TE are not inputs (see 6.5 Blueprint row; #838).
- Location & market group, with `GroupTargetLink` ("Use group target", only when plan is in a group with a snapshot it does not match; tooltip names target) :
  - `BuildLocationPicker` (6.3) with Override fold: Facility select (only presets for the plan's activity: NPC station/Raitaru/Azbel/Sotiyo for manufacturing; Athanor/Tatara for reactions; changing it clears picked place and, for NPC, rigs + tax) and `BuildSystemInput`.
  - Rigs (structures only): 3 slot selects (None, ME T1, ME T2, TE T1, TE T2) + `RigMatchHelper` modal. Facility tax % (structures only, 0-100, decimal comma tolerated, InfoTooltip).
  - Trade hub select (`TRADE_HUBS`); Material price basis select (Sell orders / Buy orders; materials only; product always lowest sell; tooltip).
  - Include Reactions checkbox (manufacturing plans only; tooltip). On first enable pre-fills the Reaction Location from the remembered reaction default; off keeps the configuration.
  - Reaction Location (when on): second `BuildLocationPicker` (activity reaction, search restricted to Athanor/Tatara), facility select (`REACTION_FACILITY_PRESETS`), build system, 3 rig slots + rig match, tax.
- Every location edit passes `update()` which also writes Remembered Location (`rememberLocationFromEdit.ts`); `editPlan()` does not (used by the include-reactions pre-fill and derived fixes).
- `useDerivedSecurityBand`: security band follows the build system (or hub); reconciled on mount, written as `derived` change (not user edit). Same for Reaction Location (default highsec).

### 6.3 Build Location picker (`BuildLocationPicker.tsx`, `searchBuildLocations.ts`, `buildLocations.ts`, `buildLocationPatch.ts`, `buildLocationLabel.ts`)

- Label "Build location" (or "Reaction location"), combobox: input with `aria-autocomplete=list`, listbox, arrow keys + Enter (handleKeyDown), live-region count/"highlighted" announcements, 300 ms debounce, 3-character floor (ESI), spinner "Searching", "Nothing found. Try more of the name.", "Search failed. Check your connection and try again."
- Source: ESI `GET /characters/{id}/search` (`getCharacterSearch`, scope `esi-search.search_structures.v1`, in base grant) returns ids; stations resolved from the SDE snapshot (`loadStationSummary`), structures via ACL-checked `getUniverseStructure` (`esi-universe.read_structures.v1`) cached per Character; system name/security via `loadSystemName/loadSystemSecurity`. Results interleave structures and stations, capped at 15 total.
- Only places that can host the activity: NPC stations always; structures by type id (`FACILITY_KIND_BY_STRUCTURE_TYPE_ID`: engineering complexes for manufacturing; Athanor/Tatara for reaction). Citadels, Keepstars not offered.
- Pick writes facility, build system id/name, security band, picked place id/name (+ clears rig/tax for NPC) in one edit (`buildLocationPatch`). The label survives reload; any manual facility/system edit drops it.
- Summary line under the box "Facility - System - Security"; "Override" disclosure unfolds Facility and Build system. Missing scope (older token): hint + "Log in again" grant action (`useGrantedScopes`); Override fields remain.
- `BuildSystemInput`: typed exact system name resolved by ESI `/universe/ids` on blur/Enter (no autocomplete); a miss keeps the typed text and shows "No solar system by that name"; empty = build at the hub; security band shown under the field.
- Same picker is reused in Retarget dialog (manufacturing only).

### 6.4 Rig match helper (`RigMatchHelper.tsx`, `engine/industry/rigMatch.ts`)

Button "Match from in-game numbers" opens modal "Work out the rigs": steps text (Industry window: pick the structure as Facility, hover the material arrow and the job-duration hourglass, read each tooltip's Structure Role Bonus, with an annotated screenshot (`public/images/industry/rig-match-industry-window.webp`) marking the three spots; the structure info window's Services tab only shows facility tax), two inputs (Material bonus %, Time bonus %), reading uses the plan's security band (fix Build System first), results list each matching fit with basis ("rig bonus alone" vs "rigs plus structure's own bonus"), "Use this fit"; "No rig fit gives those numbers" / "More than one fit matches" copy. ESI exposes no structure fits.

### 6.5 Materials panel (`BuildPlanDetail.tsx:1689`, `MaterialsTable.tsx`)

Panel actions: `DataAgeBadge` (snapshot fetch time), Copy shopping list for multibuy, `TableActionsMenu` (CSV), Refresh, total job duration.

- Error / no result: danger text `industry.computeError` or engine error message.
- `ImplantsAssumedNote` (non-reaction plans): time implants not counted without Character details scope.
- `BuildPlanAutoBuildControl`: label "Build strategy" select (Cost-effective / Build / Buy) + Craft Scope chips (Reactions chip lit with Include Reactions or a reaction plan). Disabled until live prices (make-or-buy context) land or when the tree has no recipe. Applies on change, immediately, no confirmation, whole tree, fully overwrites `buildHere` (including hand picks). Re-running the same strategy needs picking another and back (noted in code). Skill-gated materials are forced to buy (account-wide `accountSkills`).
- `OwnedStockScopeControl` "Owned Material Source": select Everywhere / Selected locations (multi-select grouped Personal / Corp, search) from detected stock; plus Corp Assets `FilterChip` (disabled without Director role + info tooltip); plus Use all / Use none (`MaterialsTableHandle.fillAll/clearAll`, shared toast + Undo).
- `MaterialsTable` sections ("errands", `materialErrands.ts`, fixed precedence): **To buy** (subtotal, "+N unpriced"), **Building** (saves total), **Blueprint** (Blueprint Acquisition row), **Already have** (folded by default, shows names inline when folded). Rows move section after an edit; a section holds rows while focus is inside; every caused move is confirmed by a toast with Undo (`materialsEditSession.ts`).
- Desktop columns (`MaterialsTable.tsx:1064-1139`): Material (sortable; name = item info link + make-or-buy glyph + skill-gate chip + text action), Need, Have (inline `SourcingInput`, placeholder 0, accent when set, detected-stock offer "You own N / Use assets" hint), To buy, Price (one field: hub price is the value, typing is the override, accent + "Override"/"Owned"/"Unpriced" tag + revert icon), Volume m3 (dropped between `xl` and `2xl` when Costs sits beside Materials), Total (for built rows: "N runs"). Every column sortable except Have, Price.
- Phone (`useIsPhone`): per-section ledger rows (NEED | HAVE | BUY header), Have and Price are tap-to-edit text with pencil, actions on the left, sort picker (Plan order / Total / To buy / Name) in the first heading.
- Row actions (text links): Recipe (opens `BuildRecipeModal`), "Build instead" / "Buy instead" (`SwapButton`, per-material `buildHere` toggle; green + "saves X" when advice says build), "Change tier" (Blueprint row, opens acquisition modal), "Find blueprint" on an unpriced blueprint row. Allowed only when the recipe's method is in Craft Scope (`canBuildHere`).
- Make-or-buy marker (`MakeOrBuyMarker`): glyph per method (hammer manufacturing, flask reaction, planet planetary; cart = buy) with tooltip: verdict, both unit prices (2 decimals), blueprint cost, savings. Verdict is one level deep: recipe inputs at hub price, never recursive (`makeOrBuy.ts`); Blueprint Acquisition tier and blueprint cost folded in when available.
- Footnote (only when sub-builds exist): `subBuildSummary` (N of this plan's own materials built here: total), `subBuildSummaryComparison` (buying ready-made instead would cost Y), `subBuildTimeNote` (sub-jobs add T of job time before the main run can start).
- Item name click: Show info; right-click/⋮: item context menu (Market, Build Plan for that material, copy, compare). No row context menu of its own; "More actions" from `exportProps`.
- Shopping list copy (`shoppingList.ts`, `shoppingListMaterials`): `name<TAB>quantity` per leaf with remaining > 0; blueprints dropped (toast says N left out, #1778); disabled with no remainder / error; icon turns check/warn for 2 s.
- CSV (`materialsCsv.ts`): Material, Quantity, Unit price ISK, Line total ISK, Make or buy.

### 6.6 Build recipe modal (`BuildRecipeModal.tsx`)

Title "Build <material>" (item menu + More actions). Summary: runs, yield per run, units made vs needed, spare. Inputs list (job quantities, not table quantities; per-input item menu and "Build" button that swaps the modal to that input's recipe when it is itself built). Footer facts: job time (TE 0), job fees, unit cost, ME. Data from `subBuildPlan.buildRecipe(row)`; run sizing `sizeRuns` (whole runs, ceil).

### 6.7 Blueprint Acquisition modal (`BlueprintAcquisitionModal.tsx`, `blueprintAcquisitionSources.ts`, engine `blueprintAcquisition.ts`)

Opened by "Change tier" / "Find blueprint" on a Blueprint row (top-level plan or any nested build). Self-fetching on open.

- Trade hub select (modal-local; does not change the plan hub).
- Sections: **Owned** (tiers by ME/TE with run counts, unlimited for BPO, corp copies when plan's Corp Assets on; "Use automatic selection instead" clears the override), **Contracts** (public BPC/BPO from Public Contract Offers snapshot; hub region by default or all regions; starting bid / bundle / barter flags; "See all in BPC Sourcing"), **Market** (region sell orders; Global Market Region handling; "NPC-seeded not told apart; market originals unresearched"), **LP Store** (offers from the Character's LP corps; ISK + LP + required items, turn-in cost or "turn-ins not priced"), **Manual** (ME, TE, price).
- Each row: ME/TE, runs, price, per-run price, "Cheapest" tag, "Use this blueprint" (selected tag on current pick); sections truncate with "Showing X of Y".
- Pick writes `acquisitionTierOverride` (+ `overridePrice` unless owned) on the blueprint's own `materialSourcing`; on the top-level plan also sets plan runs to the pick's coverage (`runsForPickedRow`, `onPickRuns`).
- Loading spinners delayed 200 ms; each section has loading / unavailable / empty copy.
- Engine: cheapest total-cost tier (owned vs buy, BPO vs BPC, extend by buying), `purchasedRuns` credited back for later nodes using the same blueprint; reaction nodes get no BPC contract offers (formulas cannot be copied; BPC Sourcing never searched); far-region contracts are last resort.

### 6.8 Costs & revenue panel (`ResultsSummary.tsx`, collapsible, open by default at desktop width (`useIsDesktop`, 64rem), folded below it; pilot toggle overrides)

Folded summary: Total cost, Revenue, Net profit (full-precision `formatIsk`, #948). Header ⓘ ("Calculations?", `breakdownTrigger`) opens Calculation Breakdown.
Open:

- Warnings: unpriced materials count; product unpriced (Market link).
- Cost stack: Material cost; Job fee disclosure (EIV, Cost index fee, SCC surcharge 4%, Facility tax; tooltip "can be off by up to +/- X ISK" from 4-decimal index rounding); Total cost; Total volume (m3, "at least" when unknown); Time; Cost index at <system> (tooltip).
- Revenue table (product, quantity, unit price, total) + Sales tax, Broker fee (negative), Net revenue.
- Net / Gross toggle (FilterChips, local state, default Net; ADR 0006): Profit, Margin, ISK/h (tooltip). Hero always shows net.
- Break-even price (net, ⓘ opens breakdown) and current market price.
- Use or sell (only with owned stock): basis toggle Sell now (buy orders, sales tax only) / Sell order (sell side, tax + broker, 100 ISK min per stack), net from selling, build profit (always net), verdict line, per-material disclosure table (Material, Owned, Unit price, Net; sortable; CSV). Blueprint Acquisition row excluded from sale.
- Unavailable (offline / live adjusted prices or cost index failed): EmptyState "Couldn't load total job cost, profit..." (materials + time still show).

### 6.9 Calculation Breakdown modal (`CalculationBreakdown.tsx`)

Sections: Prices (materials basis, ore/owned/built rules, product), Materials (ME formula, reaction has none, formula with live material cost), Job fee (cost index + system, formula lines, total cost formula), Revenue (qty x price, assumption, tax/broker % from Accounting, Broker Relations, standings, formula), Profit (net/gross/ISK per hour), Break-even (formula, 100 ISK floor), Use or sell, Verdicts (Acquisition vs Sale). Tax/broker % read from `engine/industry/fees` (same source as result). `Section`/`Formula` also reused by `RealizedProfitBreakdown.tsx` for Production Runs.

### 6.10 Production Runs panel (`ProductionRunsPanel.tsx`, `productionRunColumns.tsx`, `productionRunSummary.ts`, `SaleLinkingControls.tsx`)

Panel "Production Runs", collapsible only once a run exists (folded by default then; with no runs it shows the empty state open), rollup in header ("N runs - profit - open"), `TableActionsMenu` CSV (`build-plan-runs`), Log Production button.

- Log Production modal (hero button, panel button, or Active Jobs seed): Quantity, Material cost, Job fee (`SourcingInput`s, no validation: blank = 0), live Total cost, Save. Defaults = plan's live quantity/material cost/job fee, or a job seed (job runs x yield, job fee; material cost stays the plan's estimate). Writes `productionRuns` (Dexie), `scheduleSync`.
- Table columns: Logged, Quantity, Total cost, Qty sold ("sold / made"), Realized profit (with `RealizedProfitBreakdown`; no separate revenue column), Status (new / open / closed), actions (Sold split button: link past sale, watch open order, manual sale; Edit). Empty state `industry.productionRunsEmptyTitle/Hint`.
- Edit run modal: same three fields, linked sales + watched orders lists with unlink / unwatch icons, "Delete run" danger button (no confirm in this modal; a confirm modal exists in `SaleLinkingControls.tsx:268` for the other path).
- Realized profit (`engine/industry/realizedProfit.ts`): confirmed sales only; sales tax on all, broker only on watched-order revenue. Full Records view: other doc.

### 6.11 Remaining plan-page notes

- Plan name is not shown anywhere on the page (hero shows product name) and cannot be edited here; no Duplicate, Delete, Move to group, or back-to-group control on the plan page.
- Item menus: product heading, materials, recipe + acquisition modals share `itemMenuFor`/`itemActionsFor` (right-click menu + visible More actions, #1498).
- `BlueprintAcquisitionModal` and `BuildRecipeModal` close themselves when their row stops existing (typeID resolves to null).
- Missing blueprint in catalog: EmptyState `industry.blueprintMissing`.

### 6.12 Job time, slots

`PlanSlotLine` (single plan) and `GroupSlotLine` use `usePlanJobSlots`/`engine/industry/jobSlots.ts` (1 free + Mass Production / Advanced Mass Production etc., per manufacturing / science / reaction pool) and `projectJobFinish`. Count includes every nested sub-job (`countJobsByCategory`).

### 6.13 Skill gate marker

`SkillGateMarker.tsx`: chip naming the missing skill (or "N skills"); popover for the closest Character: each missing skill (modal link), training time, Add to Skill Plan. Shown on the hero, built rows, and bought rows where advice says build; account-wide (any Character can install passes). No "can build" positive state.

### 6.14 Log production from Active Jobs (`LogProductionFromJobDialog.tsx`, `logProductionFromJob.ts`)

Row action in Active Jobs resolves the job's blueprint to the Character's plans: one match navigates straight to that plan page with router state `logProductionFromJob` (runs, job fee); none opens a dialog "Create plan" (`createBuildPlanForJob`, failure alert); many opens a picker. `IndustryPlanPage.tsx:59-66` strips state after read (keyed on `location.key`); `BuildPlanDetail.tsx:398` opens the Log Production form prefilled.

## 7. Dialogs and modals index

| Dialog                                                                         | Opened from                                 | Contents                                                                                                 |
| ------------------------------------------------------------------------------ | ------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Delete group                                                                   | list group menu                             | Confirm text, Cancel, Delete group (`Industry.tsx:695`)                                                  |
| Fit Import                                                                     | list toolbar, Fittings export               | sec 4                                                                                                    |
| Calculation Breakdown                                                          | Costs panel ⓘ, row ⓘ (break-even, sell net) | sec 6.9                                                                                                  |
| Build recipe                                                                   | materials "Recipe"                          | sec 6.6                                                                                                  |
| Blueprint Acquisition                                                          | materials Blueprint row                     | sec 6.7                                                                                                  |
| Rig match                                                                      | Setup rig row                               | sec 6.4                                                                                                  |
| Log Production / Edit run / Delete run / Link sale / Watch order / Manual sale | plan hero, Production Runs panel            | sec 6.10                                                                                                 |
| Retarget group                                                                 | group page Retarget icon                    | sec 8                                                                                                    |
| Auto Build confirm                                                             | group "Apply..."                            | "This will overwrite craft/buy choices on N plan(s) in this group — continue?" (`autoBuildConfirmGroup`) |
| Log production from job                                                        | Active Jobs                                 | sec 6.14                                                                                                 |
| Skill gate popover                                                             | gate chip                                   | sec 6.13                                                                                                 |
| Group Owned Overlay                                                            | (inline in group Materials, not modal)      | sec 5.1                                                                                                  |

## 8. Retarget group (`RetargetGroupDialog.tsx`, `retargetPatch.ts`, `buildGroupActions.ts:54`)

Two steps in one Modal "Retarget <group>".

1. Form: hint, `BuildLocationPicker` (activity manufacturing; Override: Facility select lists all six presets, Build system), Trade hub, Rig slots (structure only), Facility tax (structure only, blur commit, unedited = leave plans' own). Continue.
2. Preview: list of the group's plans with checkboxes (all checked by default) and each plan's current hub/facility/system; Back, Cancel, Apply.
   Apply: `patchBuildPlans` writes hub, facility, security, build system id/name, picked place, rig fit + tax (structure) or cleared rig/tax (NPC) to the checked plans only; saves `BuildGroupSnapshot` on the group (`withGroupSnapshot`), which seeds the next Retarget and the per-plan "Use group target" quick-fill (`GroupTargetLink` hides once the plan matches, `planMatchesSnapshot`). Not a continuing policy; each plan owns its values after.

## 9. Auto Build (`autoMakeOrBuy.ts`, `autoBuildGroup.ts`, `craftScope.ts`)

- Engine: walk tree to its full depth (`MAX_SUB_BUILD_DEPTH` 10 safety valve), skipping nothing; each material in Craft Scope gets `build` / `buy` / `cost-effective` (build when `makeOrBuy` says cheaper, with Blueprint Acquisition + blueprint cost in the quote); materials outside scope or forced buy still recurse into inputs. Result = plain typeID set written to `buildHere`.
- Craft Scope: manufacturing always; reaction when Include Reactions or plan is reaction; planetary reserved, not applied (`craftScope.ts`). One answer shared by engine gate, manual toggle, Auto Build.
- Single plan: applies on strategy change (no confirm). Group: `applyGroupAutoBuild` per member (skips members whose blueprint left the catalog; reads fresh BPC Sourcing rows via `loadBpcContractRows`), saves chosen strategy as `group.autoBuildDefault`, then `patchBuildPlans` `buildHere` per member. Depth choice removed (#798).
- Group select preselects `group.autoBuildDefault.strategy`; group select stays live while prices load, only Apply is gated.

## 10. Data model, storage, sync

- `BuildPlanRecord` (`src/db/index.ts:240`): id, characterId, name, blueprintTypeID, runs, me, te, facility, rigFit (3 slots; legacy `rigLevel` read via `resolveRigFit`), security, hubId, buildSystemId/Name, buildLocationId/Name, facilityTaxPct, materialPriceBasis, materialSourcing (per-typeID: ownedQuantity, overridePrice, acquisition tier/override), buildHere (typeIDs), ownedStockScope, includeCorpAssets, includeReactions + reaction* fields, buildGroupId, updatedAt. Additive optional fields, no Dexie version bump. Activity is never stored (derived from blueprint).
- All writes via `buildPlanStore.ts` (create, duplicate, patch, sourcing edits, move, remove): one transaction, `updatedAt` bump, one `scheduleSync`; `undefined` removes the key (Firestore). Deletes tombstone via `markBuildPlanDeleted`; deleting a plan does not delete its Production Runs.
- Plans sync as Editable Data (`sync/planSync.ts`).
- Groups: names/order/existence in synced setting `sync.industryBuildGroups` (`Record<characterId, {id,name,order,snapshot?,ownedStock?,ownedStockScope?,autoBuildDefault?}[]>`, `buildGroups.ts`); membership only on the plan; write order: group outlives its members.
- Device-local: expanded group ids (`expandedGroups.ts`), compare mode URL param, sort state (none persisted).
- Synced preferences: `sync.industryAssumedMe`, `sync.industryAssumedTe`, `sync.industryIncludeBlueprintCost`, remembered facility defaults per activity (`facilityDefaults.ts` manufacturing, `reactionFacilityDefaults.ts` reaction; `adoptRefineryDefault.ts` one-time migration of a refinery left in the old manufacturing default).

## 11. Settings that drive plans

| Setting                                                                                      | Where                                                                                                            | Effect                                                                                              |
| -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Assumed ME for blueprints you don't own                                                      | Settings > Industry; gear on Plans and (ME only) Opportunities tabs (`IndustrySettingsForm.tsx`, `assumedMe.ts`) | 0-10, default 0. New plans and every unowned sub-build quoted at it; owned copy always wins         |
| Assumed TE                                                                                   | same, Plans only (`assumedTe.ts`)                                                                                | 0-20, default 0. Seeds a new plan's own TE; sub-builds stay TE 0                                    |
| Count blueprint cost toward profit                                                           | same, Plans only (`includeBlueprintCost.ts`)                                                                     | Default on; off prices plans as if every blueprint owned; hits plan page, list Profit, group rollup |
| Remembered Location (manufacturing / reaction)                                               | no control; written by plan-page edits                                                                           | New plan's facility, rigs, tax, band, system, place                                                 |
| Corp Assets                                                                                  | per plan chip                                                                                                    | Needs corp Director role (`canReadAssets`, `corpOwnedStock.ts`)                                     |
| BPC Sourcing settings                                                                        | Sourcing tab                                                                                                     | Feeds Blueprint Acquisition offers                                                                  |
| Gear fields gate on store hydration (spinner) so a click cannot write the default over disk. |

## 12. Data sources and scopes

| Data                                                                       | Source                                                                                         | Scope / notes                                                                                        |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Blueprint catalog, types, pi.json, volumes                                 | baked SDE JSON (`loadBlueprintCatalog`, `loadPi`)                                              | none                                                                                                 |
| Hub sell/buy prices                                                        | Fuzzwork aggregates via `src/market/prices.ts` (`loadMarketSnapshots`, one call per hub batch) | none; ADR 0002                                                                                       |
| Adjusted prices (EIV)                                                      | ESI `GET /markets/prices`                                                                      | public                                                                                               |
| System cost indices                                                        | ESI `GET /industry/systems`                                                                    | public; TTL cache; null = offline signal                                                             |
| Owned blueprints                                                           | `getCharacterBlueprints`                                                                       | `esi-characters.read_blueprints.v1` (reauth banner)                                                  |
| Corp blueprints                                                            | `getCorporationBlueprints`                                                                     | `esi-corporations.read_blueprints.v1` (per-plan Corp Assets)                                         |
| Owned stock                                                                | `getCharacterAssets` (whole account)                                                           | `esi-assets.read_assets.v1`                                                                          |
| Corp stock                                                                 | `getCorporationAssets`                                                                         | `esi-assets.read_corporation_assets.v1` + Director role (`esi-characters.read_corporation_roles.v1`) |
| Skills, implants (modifiers)                                               | `getCharacterSkills`, `getCharacterImplants` (effective levels)                                | `esi-skills.read_skills.v1`, `esi-clones.read_implants.v1` (missing: implants note)                  |
| Standings (broker fee)                                                     | `getCharacterStandings`                                                                        | `esi-characters.read_standings.v1` (missing: "assumes base standings" note)                          |
| Location search / structures                                               | `getCharacterSearch`, `getUniverseStructure`                                                   | `esi-search.search_structures.v1`, `esi-universe.read_structures.v1`                                 |
| Job slots                                                                  | skills + industry jobs                                                                         | `esi-industry.read_character_jobs.v1` (other doc)                                                    |
| BPC contracts, LP offers, region market (acquisition)                      | Public Contract Offers snapshot (Firestore), LP store, order book                              | other doc                                                                                            |
| Plans, groups, runs                                                        | Dexie + Firestore sync                                                                         | local-first                                                                                          |
| Refresh tokens stay in Dexie only; none of the above sends them elsewhere. |

## 13. Engine (`src/engine/industry`, pure)

- Adapter `features/industry/computeBuildPlan.ts`: clamps runs 1..1,000,000, ME 0..10, TE 0..20; reactions forced to 0/0; drops `facilityTaxPct` for NPC stations; never throws (`{result:null,error}`). Wrapped by `resolveBuildPlan.ts` (every surface: plan page, list, Compare, groups) which wires corp blueprints, BPC offers, Reaction Location cost index, Blueprint Acquisition tier pools.
- Materials (`materials.ts`): `qty = max(runs, ceil(round2(runs * base * mod)))`, `mod = (1-ME/100)(1-structure%/100)(1-rig%*secMult/100)`; rounded per job.
- Job fee (`jobCost.ts`): `EIV x (costIndex x (1-structureBonus) + facilityTax% + SCC 4%)`, EIV = base (ME0) quantities x ESI adjusted prices x runs; NPC tax 0.25%.
- Time (`time.ts`): `base x runs x (1-TE) x (1-facility) x (1-rig TE x secMult) x Character Modifiers`.
- Facilities (`types.ts:216`): NPC station; Raitaru 1% mat / 15% time / 3% cost; Azbel 1/20/4; Sotiyo 1/30/5; Athanor 0/0/0; Tatara 0/25/0 time. Rigs: ME T1 2%, ME T2 2.4%, TE T1 20%, TE T2 24%; security x1 / 1.9 / 2.1 (manufacturing) or x1 / 1 / 1.1 (reactions).
- Fees (`fees.ts`): sales tax `7.5% x (1 - 0.11 x Accounting)`; broker `3% - 0.3%/Broker Relations - 0.03%/faction standing - 0.02%/corp standing`, min 100 ISK; break-even `cost / (1 - tax - broker)` with 100 ISK floor.
- `buildVsBuy.ts`: recursive `resolveMaterial` (owned pool shared across tree, unpriced poisons ancestors, `MAX_SUB_BUILD_DEPTH` 10), Blueprint Acquisition row prepended, `totalCost = materialCost + jobFee`. Revenue = product qty x runs x hub lowest sell (always sell side). `profit = revenue - tax - broker - totalCost`; `grossProfit = revenue - totalCost`; `recommendation = totalCost <= revenue ? build : buy` (Acquisition Verdict; buyCost == revenue). Unpriceable when any leaf or the product is unpriced; all profit figures then null.
- Sub-build sizing (`subBuild.ts`, `runSizing.ts`): whole runs, units made vs needed, spare; sized on remaining (non-owned) quantity; sub-job time quoted at TE 0.
- Owned stock detection (`ownedStock.ts`): packaged, not inside a ship; location-agnostic with placement breakdown; `ownedStockOffer.ts` defines offer + Use all/none; `ownedStockSale.ts` liquidation (instant vs order).
- `groupRollup.ts`, `mergeCostLines.ts`, `materialVolume.ts`, `jobSlots.ts`, `skillGate.ts`, `rigMatch.ts`, `breakEvenRuns.ts`, `craftScope.ts`, `autoMakeOrBuy.ts`, `makeOrBuy.ts`, `blueprintAcquisition.ts` (+`blueprintObtainability.ts` for the market-wide scan).
- ADR 0006: two separate verdicts (Acquisition Verdict has no market fees; Sale Profitability nets tax + broker) and Profit/Margin/ISK-h gross-net toggle; Break-even always net. Implemented: hero pills + Costs panel toggle + breakdown "Verdicts" section.

### 13.1 Exact formulas, thresholds, edge cases (verified against source)

Materials (`materials.ts:42-45`)

- `required = max(runs, ceil(round2(runs x baseQty x mod)))`. Rounding is per job, never per run; round-to-2-decimals first, then ceil. The `max(runs, ...)` floor means every material costs at least 1 unit per run even at ME10 + bonuses.
- `mod = (1 - ME/100) x (1 - structure%/100) x (1 - rig%/100)` (`materials.ts:38`). Rigs apply only when `facility.structure` is true (NPC station gets 0). ME range 0..10 else `RangeError` (adapter clamps first). Example: 10 runs, base 1000, ME10, Raitaru (1%), no rig: mod 0.891, qty 8,910. Nullsec ME T2 rig adds `2.4 x 2.1 = 5.04%`: mod 0.8461.
- Rig bonuses (`types.ts` RIG_KIND_BONUS): ME T1 2, ME T2 2.4, TE T1 20, TE T2 24 (percent). Multiple same-type rigs: sorted strongest first, stacking-penalty multipliers 1 / 0.869 / 0.571 (`STACKING_PENALTY_MULTIPLIERS`), then x security multiplier. Two ME T2 rigs: `2.4 + 2.4 x 0.869 = 4.4856`. Security multiplier manufacturing: high 1, low 1.9, null 2.1; reactions: high 1, low 1, null 1.1 (`types.ts` RIG_SECURITY_MULTIPLIER / REACTION_RIG_SECURITY_MULTIPLIER). Wormhole = null band. Legacy single-tier `rigLevel` still resolves via `resolveRigFit`.
- Facility presets (`types.ts:216-275`): NPC station mat 0 / time 0 / cost 0 / tax 0.25%; Raitaru 1 / 15 / 3; Azbel 1 / 20 / 4; Sotiyo 1 / 30 / 5 (tax default 0, user-entered); Athanor 0/0/0; Tatara time 25 only. Citadels absent: not industry-capable (`FACILITY_KIND_BY_STRUCTURE_TYPE_ID`: 35825/6/7 Raitaru/Azbel/Sotiyo, 35835/6 Athanor/Tatara).
- ME 0 for reactions always (`computeBuildPlan.ts:108-110`); TE likewise. Sub-builds of manufacturing nodes use the owned/assumed ME of that blueprint (`recipe.me`), or the Blueprint Acquisition tier's ME when one resolves; reaction nodes ME 0.

Job fee (`jobCost.ts:32-53`)

- `EIV = runs x sum(baseQty_ME0 x ESI adjusted_price)`; missing adjusted price counts 0 (`jobCost.ts:19-29`). ME does not reduce EIV. Cost index is a fraction (2.72% = 0.0272) from `/industry/systems` for the build system, else the hub's system (decision `20260905-000835`).
- `fee = EIV x costIndex x (1 - jobCostBonus%) + EIV x 4% (SCC) + EIV x facilityTax%`. Structure bonus hits only the index term. Worked: EIV 10,000,000, index 0.0272, Raitaru, tax 0: 263,840 + 400,000 + 0 = 663,840. NPC at same numbers: 272,000 + 400,000 + 25,000 = 697,000. Facility tax is the typed percent for structures, ignored for NPC (`computeBuildPlan.ts:111`). Alpha clone tax ignored.
- Sub-job fees: each nested job pays its own fee at its own `runs` (sized by `sizeRuns`) and its own EIV; rolled into `sub.totalFees`, and into the parent's `materialCost` via the unit cost (so `buildVsBuy.totalCost = materialCost + top-level fee` already includes every sub-job fee, `buildVsBuy.ts:104-105`). Reaction nodes use the Reaction Location context (`reactionCtx`) with its own index, tax, rigs.

Time (`time.ts:13-47`, `characterModifiers.ts:95-136`)

- `seconds = base x runs x (1-TE/100) x (1-facilityTime%) x (1-rigTE%) x characterMult`. TE 0..20.
- Character mult, manufacturing: Industry 4%/level x Advanced Industry 3%/level x each blueprint-listed science skill (1%/level, Mutagenic Stabilization 2%, `types.ts:422`) x BX-80x implant (BX-801 1%, 802 2%, 804 4%). All multiplicative. Reactions: Reactions skill 4%/level only; no Industry, science or BX. Missing skills/implants scope: treated as 0 (note `ImplantsAssumedNote`).
- Sub-job time: quoted at TE 0 (`subBuild.ts` passes `0`); `resolvedSubBuildSeconds` adds every nested job serially (no parallelism, no slot model in the sum). The footnote says sub-jobs add this before the main run can start.
- ISK/h = profit / (seconds/3600); null when seconds is 0 or unpriceable.

Fees on revenue (`fees.ts`)

- Sales tax % = `7.5 x (1 - 0.11 x Accounting)`: 3.375% at V. Broker % = `3 - 0.3 x BrokerRelations - 0.03 x factionStanding - 0.02 x corpStanding`, floored at 0, min 100 ISK per order (`brokerFee`, `fees.ts:61-70`; `value <= 0` -> 0). Levels must be integer 0..5. Standings arrive pre-resolved for the Trade Hub's NPC owner (#1238); absent = 0, shown by `AssumesBaseStandingsNote`.
- Break-even price per unit (`fees.ts:133-150`): `cost / (1 - (tax% + broker%)/100) / qty`; if that implies a broker fee under 100 ISK it re-solves as `(cost + 100) / (1 - tax%/100)` (the floor). Null when qty <= 0. Relist break-even uses the discounted broker rate (50% + 6%/level Advanced Broker Relations; 80% at V): a Market-side helper, not on the plan page.

Verdicts (`buildVsBuy.ts:107-154`)

- `revenue = productQty x runs x hubLowestSell` (product always from `hubPrices`, never the material price basis). `profit = revenue - tax - broker - totalCost`; `grossProfit = revenue - totalCost`; `margin = profit/revenue` (null at revenue 0); `recommendation = totalCost <= revenue ? build : buy` (ties go to build; no fees in it). `buyCost == revenue`: "what buying the product outright costs" equals its sell value by construction.
- Unpriceable: any unpriced leaf (at any depth) OR product unpriced -> profit, margin, ISK/h, gross*, recommendation all null/'unknown'; `breakEvenPrice` still computed. A built material whose subtree is poisoned reports its blocking leaf typeIDs via `unpricedLeafTypeIds`.
- Dual verdict (ADR 0006): Acquisition Verdict = `recommendation` (gross, "no market-selling fees apply since nothing is sold"); Sale Profitability = `profit` sign (net). They can disagree: totalCost <= revenue (build) while net profit < 0 when tax+broker exceed the margin. Gross/net toggle covers Profit, Margin, ISK/h; Break-even stays net.
- Per-material make-or-buy (`makeOrBuy.ts:307`): `build` iff `makeUnitPrice < buyUnitPrice` (strict; tie = buy). Quote = one job sized to what is left to buy (`sizeRuns`: `runs = max(1, ceil(needed/outputPerRun))`), TE 0, inputs priced at the plan's material price basis, inputs NOT recursively built, blueprint purchase cost (Acquisition tier) added to unit cost. `savings = |buy - make| x remainingQuantity`. Null (no advice) when no recipe, material unpriced, or any input unpriced. Skill-gated (no account Character can install) forces `buy`. Planetary: inputs at hub / cycle output, no ISK fee. Reaction with no Reaction Location and a manufacturing parent: falls back to an unfitted Athanor at the parent's security/index/tax.
- Recursive resolution (`materialResolution.ts`): a material builds only if remaining > 0, in `buildHere`, depth < 10, not its own ancestor, and a recipe exists. Owned units are claimed from one shared pool first (first branch wins, `claimOwned`), blueprint acquisition row bypasses the pool. Sub-build cost: `lineCost = remaining x (totalCost / unitsMade)`; spare units are not charged (cost is amortized over everything the job makes, only `remaining` billed). A material whose override price is set, or unpriced with no recipe, prices as a purchase. Bad recipe data never throws (falls back to buy).
- Auto Build `cost-effective`: same `makeOrBuy` compare per node, runs sized as above, whole tree down to depth 10; `build` strategy forces every in-scope node; `buy` forces none; skill-gated nodes forced buy and keep the gate marker.
- Break-even runs (`breakEvenRuns.ts`): start at current runs; if profit >= 0 returns start; else doubles (capped at `MAX_JOB_RUNS` 1,000,000) until profit >= 0, then bisects the (lo, hi] gap for the smallest profitable count; null when any probe is unknown or the cap is hit. Profit is not monotonic (ME rounding, blueprint bought once), so a profitable pocket between doublings can be missed; result is "a" break-even, not necessarily the minimum. Only offered when profit < 0.
- Blueprint Acquisition (`blueprintAcquisition.ts`): candidates = each owned ME/TE tier (runs summed, any BPO = infinite) + each purchasable tier (cheapest offer covering whole need) + hub BPO sell price as ME0 original. Cost per tier = material cost at that ME + shortfall purchase (`ceil(shortfall / (offer.runs x quantity))` whole copies x price). Tiers never mix within one node; an offer extends an owned tier only if ME/TE match. Rejected offers: runs 0 or negative (not -1), quantity <= 0, multi-type contract, price <= 0 (barter) unless an LP/extra source (free allowed). Last-resort offers (other regions) only when nothing else prices it. No options -> assumed ME, TE 0, unpriced line. Winner is the strictly cheapest priced option (first wins ties). Purchased runs beyond need go back to a per-tier pool for later nodes with the same blueprint. Owned copy that cannot be topped up -> `coverage` warning (#1775, `BpcCoverageWarning`). Count-blueprint-cost off zeroes the line only (`withoutAcquisitionCost`), tier still resolves.
- Use-or-sell (`ownedStockSale.ts`): instant = owned qty x hub buy-side price, sales tax only; order = sell side, tax + broker, 100 ISK min per stack. Compared to build profit (always net). Blueprint row excluded (`sellableMaterials`).
- Reprocessing/refine is NOT part of Build Plans or Group Rollup. It lives in `engine/industry/reprocessing.ts` and is consumed by Market Open Orders exits (`features/market/orderExits.ts`), Appraisal and mining-tax valuation. Formula there: `eff = stationRate (0.5) x (1+0.03 Reprocessing) x (1+0.02 Efficiency) x (1+0.02 specialisation) x (1+implant%)`; scrap = `rate x (1 + 0.02 Scrapmetal)` only; per-material `floor(qty x batches x eff)`, `batches = floor(units/portionSize)`, remainder yields nothing, unpriced outputs make the total a floor (`pricedAll=false`). No structure rate, rig or station tax (decision `20260906-180034`). Cross-ref the Market/Appraisal docs.

### 13.2 Why-decisions (rationale index)

| Decision                                                       | File                                                                               | Why                                                                                                                                                               |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two verdicts + gross/net toggle                                | `docs/adr/0006-build-plan-dual-verdict-and-profit-toggle.md`                       | Build-vs-buy is an acquisition question (no fees); sell profitability is a market question (net). They can disagree. Break-even stays net                         |
| Verdict-first page, Setup fold, ledger beside materials        | `20260906-091110-industry-page-reads-verdict-first.md`                             | A plan is edited once, read many times                                                                                                                            |
| Job fee uses build system not hub                              | `20260905-000835-*`                                                                | Hub-priced fee overstated 3x for builders away from their hub                                                                                                     |
| One-level sub-builds -> recursive                              | `20260904-235527-*` (superseded), `20260906-205900-*`                              | Component trees need depth; owned pool shared; unpriced leaf poisons ancestors                                                                                    |
| Blueprint cost is a material row, tier = cost-minimization     | `20260911-073307-*`                                                                | Free-blueprint assumption understated cost; row inherits `overridePrice` for free                                                                                 |
| Blueprint cost counts by default, everywhere                   | `20260911-150427-*`                                                                | Was only wired to plan page (a bug); toggle zeroes cost, never reverts tier                                                                                       |
| Assumed ME reaches sub-jobs; assumed TE seeds the plan only    | `20260909-090113-*`                                                                | Cost compounds down the tree; sub-job TE hardcoded 0 per sub-builds decision                                                                                      |
| Group membership on plan, names in synced setting              | `20260908-211916-*`                                                                | One writer per fact; empty groups persist                                                                                                                         |
| Group Owned Overlay replaces per-plan owned stock on groups    | `20260909-212724-*`                                                                | Avoids double-claiming one stock across members; display-only netting                                                                                             |
| Mixed-hub groups: multibuy per hub                             | `20260909-083512-*`                                                                | Group does not own hub; copy per hub instead of overriding                                                                                                        |
| Group delete cascades                                          | `20260923-132836-deleting-a-build-group-*`                                         | Supersedes the "orphan members" text in `docs/plans/build-groups.md`                                                                                              |
| Auto Build strategy/scope (no depth)                           | `20260909-212715-*`, `20260910-220447-*`, `20260910-225348-*`, `20260910-144945-*` | Depth was unused; single plan applies immediately                                                                                                                 |
| Reactions as activity + Reaction Location                      | `20260905-130600-*`, `20260910-082559-*`, `20260910-094623-*`                      | Second facility context so reaction sub-jobs do not inherit complex bonuses                                                                                       |
| Plan lenses (hub, price basis) are part of the plan            | `20260903-045635-*`, `20260905-223106-*`                                           | Same blueprint, different place/market = different plan                                                                                                           |
| New plans inherit last location                                | `20260905-195331-*`                                                                | Remembered Location per activity                                                                                                                                  |
| Plan times match in-game queue                                 | `20260902-205013-*`                                                                | Character skills, implants in time math                                                                                                                           |
| Seeded plans: listing's numbers win                            | `20260909-090559-*`                                                                | Offer ME/TE/runs/price override defaults                                                                                                                          |
| Dragging into group is pointer-only; menu is the keyboard path | `20260908-234014-*`                                                                | WCAG 2.5.7 alternative                                                                                                                                            |
| Spec for groups/Fit Import                                     | `docs/plans/build-groups.md`                                                       | Partly stale: owned-stock "sum, never re-net / over-claim warning" is replaced by the overlay; delete semantics replaced; group-row member count/hull never built |

### 13.3 Test-covered behavior (where to look)

- Engine (`src/engine/industry/*.test.ts`): `materials.test.ts` (per-job rounding, ME/structure/rig), `jobCost.test.ts`, `fees.test.ts` (tax/broker/floor/relist/break-even), `time.test.ts`, `characterModifiers.test.ts`, `buildVsBuy.test.ts` (504 lines: dual verdict, unpriceable, owned pool, sub-builds), `materialResolution.test.ts`, `makeOrBuy.test.ts`, `autoMakeOrBuy.test.ts`, `blueprintAcquisition.test.ts`, `breakEvenRuns.test.ts`, `groupRollup.test.ts`, `ownedStock*.test.ts`, `runSizing.test.ts`, `rigMatch.test.ts`, `rigFit.test.ts`, `skillGate.test.ts`, `jobSlots.test.ts`, `reprocessing.test.ts`, `realizedProfit.test.ts`.
- Features (`src/features/industry`): `BuildPlanList`, `BuildPlanDetail`, `PlanVerdictHero`, `MaterialsTable`, `BuildRecipeModal`, `BlueprintAcquisitionModal`, `BuildLocationPicker`, `BuildGroupPanel`, `AutoBuildControl`, `BuildPlanAutoBuildControl`, `OwnedStockScopeControl`, `BuildPlanCompare`, `FitImportDialog` component tests; `groupDrop`, `fitImport`, `buildPlanStore`, `buildGroupActions`, `expandedGroups`, `facilityDefaults(Writes)`, `planSeed`, `newBuildPlan`, `materialErrands`, `materialsEditSession`, `materialsCsv`, `groupMaterialsCsv`, `buildPlanCompareCsv`, `logProductionFromJob`, `computeBuildPlan`, `includeBlueprintCost`, `assumedMe/Te` unit tests. E2E (Playwright, `e2e/`): `buildPlanColumnAlignment`, `buildPlanGroupsNarrow`, `buildGroupDetailNarrow`, `buildPlanMaterialsFit` (invariants: no overlap/overflow, not pixel-exact).

### 13.4 Known engine limits

- One bonus table for manufacturing and reactor rigs; no per-rig names. Alpha tax, structure role-based tax tables, and Upwell structure reprocessing/fit are not read from ESI.
- Time is not slot-aware: sub-jobs summed serially, group seconds are a sum, not wall clock.
- Make-or-buy advice is one level deep; the real plan is recursive. A Cost-effective Auto Build can therefore differ slightly from the verdict marker's advice at deeper nodes.
- Fuzzwork price is region/hub aggregate (lowest sell / best buy), not volume-walked: large runs can be optimistic. Product revenue ignores market depth and listing time.
- EIV needs ESI adjusted prices; without them (or the cost index) the whole cost panel is "unavailable" and profit is hidden.
- Cost-index rounding: displayed index is 4-decimal, tooltip flags up to +/- ISK difference vs game.

## 14. Responsive behavior

- List: Profit + name always; Verdict/Runs from `sm`; ISK/h + Margin from `lg`; toolbar icon-only; drag handle size-9 on touch.
- Plan page: Hero row wraps (`xl` joins button column); Costs panel sits beside Materials from `xl` (Volume column hidden between `xl` and `2xl`); below `xl` stacked; Costs folded by default below 64rem (`useIsDesktop`, not only phones); Materials switches to the phone ledger below the phone breakpoint; Setup is a fold; inputs 2-3 col grid; rigs wrap.
- Group page: two columns from `lg`; Materials table drops Volume and Owned columns on phone (`phoneHidden`) and scrolls sideways; so Group Owned Overlay entry is not available on phone (only via Use all).
- Compare: scrolls sideways, plan pinned.
- Touch: row long-press = menu (`useLiftAfterHoldGuard`); info/tooltips use `openOnTap` where the row tap is otherwise inert.

## 15. Observed gaps (facts from code)

Plan page

- Plan name never rendered on the plan page and not editable there; no Duplicate / Delete / Move to group / back-to-group on the page (`BuildPlanDetail.tsx` never reads `plan.name`). Seeded names ("Rifter 10/20 x5") are visible only in the list.
- Plan ME/TE are not inputs; set only by the Blueprint Acquisition tier or Manual entry (`BuildPlanDetail.tsx:1302-1310`). With an owned BPO there is no blueprint row, so Setup shows read-only ME/TE chips (`BuildPlanDetail.tsx:1166-1172`) with no edit control on the page.
- "No break even found up to {{max}} runs." is rendered without a `max` value (`BuildPlanDetail.tsx:1298`; `en.json:2207`).
- Gross/net toggle and use-or-sell basis are local state, reset on every visit (`ResultsSummary.tsx:179-180`); hero is always net.
- Log Production form has no validation: blank/garbage saves 0 quantity and 0 cost (`ProductionRunsPanel.tsx:159-179`).
- Run delete in the edit modal fires with no confirm (`ProductionRunsPanel.tsx:366`) while the other delete path confirms (`SaleLinkingControls.tsx:268`).
- Make-or-buy advice is one level deep at hub prices while the plan resolves recursively; sub-build time quoted at TE 0 and assumed TE does not reach sub-builds (documented, `assumedTe.ts`, `makeOrBuy.ts`).
- Rig model has one bonus table (`types.ts` RIG_KIND_BONUS, sourced as Standup M-Set) shared by manufacturing and reactor rigs, 3 slots, no per-rig names beyond ME/TE T1/T2.
- Alpha clone tax ignored (Omega assumed, `jobCost.ts`).
- Prices need live adjusted prices + cost index; offline shows only materials + time.
  List
- No text filter / search over existing plans (the only search creates), no CSV export of the index, no column for blueprint/ME/TE/hub.
- Loading, unpriceable and error all render "—" / Unknown (no distinct loading state); no refresh control or Data Age on the index.
- Single plan Delete has no confirm and no Undo (`Industry.tsx:419`); duplicate/rename/delete stay on index with no toast.
- Group header shows no member count or hull although `docs/plans/build-groups.md:310-330` specified both; groups cannot be reordered in UI.
- Blueprint picker: 20 results, no "more" message, no arrow-key navigation, product-name search only.
- Sort state not persisted; plans have no manual reorder, only group moves.
- Drag handle is pointer-only and hidden until a group exists (menu path is the alternative).
  Group page
- No Price / Line total columns in the group buy table (only need, volume, owned, still to buy); headline is the Acquisition Verdict only, while the list row shows summed Sale Profitability for the same group (two different measures).
- No rename / delete / add plan on the group page; Members panel only links out.
- Phone hides Volume and Owned columns, so no per-row owned entry on phone.
- Retarget facility list is unfiltered (`RetargetGroupDialog.tsx:190`) and `retargetPatch` writes the facility to every checked plan without checking activity, so a manufacturing facility can land on a reaction plan or vice versa.
- Auto Build for group: generic overwrite confirm only, no preview; no per-member opt-out.
- Mixed-hub group: whole-group copy disabled by design; no way to re-home a member from the group page.
- `docs/plans/build-groups.md` stale: says delete orphans members (code cascades, decision `20260923-132836`), "Compare" selection model/lastOpenedPlan text predates routes per page.
  Compare
- `comparing` view and ticked ids are component state, not in the URL (only `plans.compare` bool is); not deep-linkable, lost on reload.
- Table shows no hub / facility / ME / TE column, so two plans priced at different places are not distinguishable; no gross/net toggle.
  Cross-cutting
- No Industry keyboard shortcuts beyond global `go-to-industry`.
- `docs/UX-REVIEW.md` §6 predates the verdict-first page; its chip/jargon findings are mostly resolved (tooltips + Calculation Breakdown), its owned-blueprint chip finding is now the Blueprint row.

## 16. Interview Q&A

1. Why can a plan say BUILD and still show a loss? Two separate verdicts (ADR 0006). Acquisition Verdict is `totalCost <= revenue` with no fees (`buildVsBuy.ts:140`); Sale Profitability is `revenue - tax - broker - totalCost` (`:134`). With 3.375% tax + ~1.5% broker, a build that saves under ~5% of revenue is BUILD but net-negative. UI: hero pills + Costs panel Net/Gross toggle.
2. Why does the product always price at hub lowest sell even when Material price basis is Buy orders? The basis applies to materials only; buying the product outright pays the lowest sell (`buildVsBuy.ts:11-13,108`). `buyCost` is literally `revenue`.
3. How is material quantity computed and why is ME applied per job? `max(runs, ceil(round2(runs x base x mod)))` (`materials.ts:44`). EVE rounds once per job, so 10 runs at ME10 can need fewer units than 10 separate 1-run jobs; the floor keeps at least 1 per run.
4. What does ME do to the job fee? Nothing. EIV uses ME0 base quantities x ESI adjusted prices (`jobCost.ts:19-29`, header). Only the cost index, structure job-cost bonus, facility tax and 4% SCC matter.
5. Which part of the job fee does a Raitaru's 3% cost bonus reduce? Only the index term: `EIV x index x (1-0.03)` (`jobCost.ts:43`). SCC (4% EIV) and facility tax are untouched.
6. Which solar system's cost index is used? The plan's Build System, else the trade hub's system (decision `20260905-000835`; `BuildPlanDetail.tsx:1148` names it). Reaction Location has its own index (`resolveBuildPlan.ts:152-156`).
7. How do rig bonuses combine? ME/TE rigs of the same type stack with penalty 1/0.869/0.571, strongest first, then scale by security (mfg 1/1.9/2.1, reactions 1/1/1.1), and only on player structures (`types.ts` `stackedRigBonusPct`, `rigBonusPct`; `materials.ts:35-37`). NPC stations ignore rigs and typed tax (`computeBuildPlan.ts:111`).
8. What does an unpriced material do? It poisons: `unitCost` null up the tree, profit/margin/ISK-h/recommendation null, plan "Unknown" (`materialResolution.ts:323-331`, `buildVsBuy.ts:110,133`). Never costed as zero. Lists show "-"/Unknown; the Costs panel counts unpriced materials.
9. How does owned stock interact with sub-builds? One shared pool per plan resolution; first branch claims, later branches see the rest (`materialResolution.ts:162-175`). Owned is deducted before deciding to build, so only the remainder is sized into runs. On groups, member trees re-resolve with owned stripped and a Group Owned Overlay nets once (`groupRollup.ts`, `computeGroupResult`).
10. Why can a sub-build cost differ from the make-or-buy glyph's quote? The glyph is one level deep at hub prices, TE 0, inputs bought (`makeOrBuy.ts:1-8`). The plan resolves recursively, with owned stock, per-material overrides, acquisition tiers. Savings in the tooltip are `|buy-make| x remaining` (`:310`).
11. How does Blueprint Acquisition choose? Cost-minimization over tiers: each owned tier and each purchasable tier, `materialCost(ME) + whole-copy shortfall x price`; strictly cheapest wins; BPO owned covers infinite runs but still competes (`blueprintAcquisition.ts:182-405`). Barter (price 0), multi-type, malformed offers dropped (`usableOffers`). Reaction nodes: no BPC contract offers. Cost can be hidden by Count blueprint cost = off, tier unchanged (decision `20260911-150427`).
12. How does Break-even runs work and when does it fail? Doubles from current runs to 1,000,000 then bisects (`breakEvenRuns.ts:14-47`). Can miss a pocket between doublings and returns "no break even" if none; the message renders without the `{{max}}` value (gap).
13. What is the break-even price and why is it always net? `cost / (1 - tax% - broker%)/qty` with a 100 ISK broker floor re-solve (`fees.ts:133-150`). ADR 0006: it answers "at what price do I stop losing ISK", true only after sale fees.
14. Why does Auto Build overwrite hand picks, and is group Auto Build undoable? It rewrites `buildHere` for the whole tree (single: immediately; group: confirm via "Apply...") and saves `autoBuildDefault` (`autoBuildGroup.ts`, decisions `20260910-225348`, `20260910-220447`). No undo and no preview (gap). Skill-gated materials always become buy.
15. How is job time computed and what is missing? `base x runs x (1-TE) x (1-facility) x (1-rig) x Industry(4%/lvl) x AdvIndustry(3%/lvl) x science(1%/lvl) x BX-80x` (reactions: Reactions 4%/lvl only) (`time.ts:13-47`, `characterModifiers.ts:112-136`). Sub-jobs TE 0, summed serially, no slot parallelism; implants unknown without clones scope (`ImplantsAssumedNote`).
16. Does a Build Plan model refining? No. Reprocessing is a separate engine (Open Orders exits, Appraisal, mining-tax valuation); formula and rules in section 13.1 (`reprocessing.ts:68-127`; decision `20260906-180034`).
17. What persists where? Plans in Dexie `buildPlans`, synced as Editable Data; group names/order/snapshot/overlay/autoBuildDefault in synced setting `sync.industryBuildGroups`; membership on the plan; expanded groups, sort, ticks, gross/net, use-or-sell basis are local (device or component state); refresh tokens Dexie only (`db/index.ts:240`, `buildPlanStore.ts`, `buildGroups.ts`).
18. What happens when ESI scopes are missing? Blueprints scope: reauth banner, no owned tiers (assumed ME); assets: no owned detection; standings: base-standing note, broker at 0 standing; implants: note; search/structures scope: picker hint + "Log in again", typed Override still works; corp assets need Director role (chip disabled with tooltip). All routes ungated (`routeScopes.ts:97,118,119`).
19. Why do groups sum two different "profit" figures? List row Profit = summed Sale Profitability (`computeGroupIndexStats`); group page headline = Acquisition Verdict savings (`groupRollupView.ts`). Gap, not a bug; documented under Gaps.
20. How does a Retarget differ from Use group target? Retarget bulk-writes location lenses to checked plans and stores a `BuildGroupSnapshot`; "Use group target" quick-fills one plan from that snapshot (`buildGroupActions.ts:54`, `GroupTargetLink.tsx`). Not a standing policy.

## 17. Improvement ideas

- Show plan name on the plan page with rename/duplicate/delete/move-to-group and a back-to-group link; add an editable ME/TE for owned BPO plans.
- Pass `max` into the "No break even found" string; add a cheap monotone-pocket scan (probe ME-rounding steps) or state "may miss pockets".
- Persist Net/Gross toggle and use-or-sell basis (localStorage per viewer) and list sort.
- Delete plan: confirm or Undo toast; confirm on run delete in Edit modal; validate Log Production inputs.
- Filter retarget facility list by each checked plan's activity; skip or warn on mismatches.
- Group page: price and line-total columns on the buy table; one headline measure matching the list (or label both); member count + hull on group header (spec already promised it).
- Group Auto Build: dry-run preview (n flips, cost delta) and per-member opt-out; make single-plan strategy re-runnable.
- Compare: hub/facility/ME/TE columns, gross/net toggle, URL-encoded selection.
- Plans list: text filter over existing plans, CSV export, loading vs unpriceable distinction, Data Age + refresh.
- Slot-aware duration (parallel jobs per pool) and real build-by-date from `PlanSlotLine`.
- Market depth: walk the order book for large runs instead of lowest sell; optional relist/undercut model for revenue.
- Extend assumed TE and make-or-buy to nest recursively so the glyph matches the engine; reconcile one-level advice vs recursive plan.
- Reprocess-vs-build: expose the refine engine as an owned-stock exit in Use-or-sell (it currently lists only instant/order sell).
- Keyboard: reorder groups, plan reorder, Industry shortcuts beyond `go-to-industry`.
