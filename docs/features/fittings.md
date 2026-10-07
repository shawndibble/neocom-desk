# Fittings (Ships > Fittings tab, Compare, Shared view)

Fitting = one hull + modules, charges, drones, fighters, cargo, under a name (CONTEXT.md **Fitting**). Stats worked out for the active Character's skills by the pinned dogma engine (`@eveshipfit/dogma-engine`, `src/features/fittings/dogmaFittingEngine.ts`). Ship Tree tab is out of scope here (see ships.md).

## Summary

| Feature | Route | Notes |
|---|---|---|
| Start screen (library) | `/ships/fittings` | search, grouped by hull, preview pane, New from hull, Import |
| Editor | `/ships/fittings/edit?f=<code>` | Ring/List, Add panel, stats sections, header |
| Load (Import) | dialog / inline card | EFT, DNA, share code, eveship.fit, EVE Workbench, killmail, EVE XML |
| My Fittings | Dexie `fittings`, synced | Save / Update / Save as new / rename / delete / notes |
| In-game Fittings | ESI read + write | Save to EVE, overwrite = delete + create |
| Export | editor menu | Share Link, EFT, multibuy, EVE XML, Manufacture Plan, Appraise |
| Compare | `/ships/fittings/compare?f=&f=&f=` | up to 3 Fittings, 2 CSVs |
| Shared view | `/share/fitting?f=` (+ `/share/:id`) | read-only, no login, all skills V |
| Legacy redirects | `/fittings/*`, `/skills/ships` | permanent |

Scope gating: `/ships` and `/ships/fittings/compare` are UNGATED (`src/app/routeScopes.ts:104-111`); only In-game Fittings panel and Save to EVE gate on scope.

## Routes and URL state

- `src/features/fittings/shipsTabs.ts`: tabs `fittings`, `tree`, standalone `fittings/edit`. Editor and library are one mounted `<Fittings />` (`src/routes/Ships.tsx`) so workspace state carries across navigation.
- `fittingRoutes.ts`: `fittingsRedirect` sends `/ships/fittings?f=code` to editor; editor with no `f` goes to library. `legacyShipsLocation` keeps old `/fittings?f=` links (every Share Code ever copied) working; `LegacyShipsRedirect.tsx`.
- Open Fitting lives in the address bar as `?f=<Fitting Share Code>`; every edit is a history entry, so browser Back is undo (`shortcuts.onPageHint`).
- Too-large Fitting cannot be carried in a link: warning `fittings.load.tooLargeToShare`, reload loses it; Save to My Fittings and Compare-through-link disabled with tooltip.
- Router state `fittingLoadText` (`@/lib/shortcuts` `FittingLoadState`) lets `GlobalPasteRouter` (paste of EFT anywhere outside a field) open the Fittings tab and Load it (`src/routes/Fittings.tsx` effect ~line 200).

## Start screen (`FittingStartScreen.tsx`)

One list of every way into a Fitting: saved (My Fittings) + In-game rows.

- Header: page title, Ships tab bar, In-game data age + refresh IconButton (only when `getCharacterFittings` granted).
- Search box "Search by name or hull" (`filterMyFittings`), live match count; empty states: loading (spinner, avoids flashing "No fittings yet"), `emptyTitle`/`emptyHint`, `noMatches`.
- Grouped by hull (`groupByHull`); each row: name, Saved / In-game source tag, row menu (kebab + right-click) via `RowActionsMenu`.
- Desktop (non-phone) page: click selects, double-click or Enter opens, preview pane beside list. Phone, Open dialog, Compare picker: tap opens (down-arrow cue only when no row menu).
- Row menu (`useLibraryRowActions.tsx`, `fittings.libraryMenu`): Open, Compare with..., Duplicate (saved copy), Copy Fitting (EFT), Copy permanent link, Save to EVE..., Rename..., Delete.... Off in Compare picker (`rowMenus={false}`).
- Preview pane (`FittingPreview.tsx`): hull, source, Open, Compare (disabled when too large), Rename, Delete (saved only); sections Skills ("You can fly this" / missing skills with add-to-Skill-Plan), Offense, Defense (DPS, EHP, CPU, PG, calibration, drone bandwidth), Notes (editable textarea, saved with Fitting, sent as description by Save to EVE, max chars). Unreadable saved Fitting: warning, only rename/delete.
- Buttons: New from hull, Import... (hidden in some variants). A share-code error auto-opens Import.
- Starts downloading the dogma engine data on mount.
- In-game states: `GrantBanner` (re-login for `esi-fittings.read_fittings.v1`), load-failed hint.
- Variants: `page`, dialog (editor "Open a fitting"), Compare picker; `importInline` swaps list for Load card with Back.

### New from hull (`HullPicker.tsx`, modal `NewFromHullDialog`)
- Search hulls (placeholder "Vexor, Gila, heavy assault..."); prompt until query typed; no-match state.
- Pick, then Start fitting (double-click starts at once).
- Popular fits panel per hull (`PopularFitsPanel.tsx`): source tabs zKillboard / EVE Workbench.
  - zKillboard: recent hull losses with full fit (`@/lib/zkillboard` `fetchHullLosses` + ESI `getKillmail`), loss count, last seen, approx ISK value, Open.
  - EVE Workbench: fits from Firestore `workbenchFits` docs (Cloud Function `syncWorkbenchFits`, `workbenchFits.ts`), created age, price at default Trade Hub (partial price flag, unpriced count), out-of-date check against current game (`WorkbenchOutOfDate`, `workbenchSightings`), sighting badge.
  - Failure/empty/loading states each have copy; "Everything else still works".

### Load / Import (`FittingLoadCard.tsx`, `loadFittingFromText.ts`, `engine/fittings/load.ts`)
- Paste box "Link or text" + Load. Accepts: EFT text, in-game fitting link / DNA string, Fitting Share Code or Share Link, eveship.fit link, EVE Workbench fit link, zKillboard killmail link (ESI killmail via hash from zKillboard).
- Errors: invalid link, newer-version code, unrecognised, workbench not-found/failed, killmail not-found/failed.
- Unresolved lines/items listed (EFT line number + reason), non-fatal.
- EVE fittings XML: file browse, lists each `<fitting>` with Open per entry and per-entry error (`resolveFittingXmlDocument`, `fittingXmlDocument.ts`); "not saved" note. Corporation fittings only reach app this way (ESI does not expose them).
- Loading stores nothing; only explicit save does.

## Editor (`src/routes/Fittings.tsx`)

Layout (`THREE_COLUMN_QUERY` 100rem):
- Wide: module browser (Add panel) | Ring or List | stats sections.
- Narrower desktop: Add panel is a left `SlideOver`, opened by an empty slot or "Add module".
- Below desktop (mobile): tabs Ring / List / Stats (`phoneTabs`), Add as a sheet `Modal`, rack sheets, drones sheet.
- Open Fitting shows no page header / tab bar.

### Header (`FittingHeader.tsx`)
- Fittings menu: New from a hull..., Import..., Open a fitting... (modal of the Start list), Compare.
- Fitting name with Rename; "Saved in My Fittings" badge; kebab "Fitting actions" (Export submenu, Compare).
- Header badges: Alpha chip (`AlphaCloneChip`: Alpha OK / Omega only by skill caps, with tooltip listing blockers), Mastery chip (`MasteryChip`: hull Mastery tiers, hide completed, suggested note, total time), Missing skills chip (`MissingSkillsChip`: count + train time, opens skill list with add-to-plan).
- Skill basis control (`SkillOverridesControl`): Own skills / All 0 / All V / Set levels... (per-skill overrides, search). Stats only; "can fly" still uses real skills.
- Implants control (`ImplantSetControl`): stats use the clone's implants until changed, then a Fitting-own set (implants + combat boosters, saved with Fitting/share code); Use my clone resets; booster side effects shown; Implant Finder ("Find by goal" / "Your set" tabs: tries every implant on this fit, ranks by goal, LP-store/hub price, cheapest fixes when over CPU/PG; `ImplantFinder.tsx`, `engine/fittings/implantFinder.ts`). `ImplantsAssumedNote` when Character details scope missing.
- Abyssal weather picker (`AbyssalWeatherPicker`): Normal space or kind x level; shown as "in <weather>".
- Tactical mode picker (`TacticalModePicker`) for Tactical Destroyers / Strategic Cruisers subsystems modes.
- Price hub select (`PriceHubSelect`), Manage.

### Save (`FittingSaveButton.tsx`)
- Save / Update (split button): Save as new... (name modal, default "<name> copy"), Save to EVE.
- Shortcuts: Mod+S save, Mod+Shift+S save as new (`useChord`; listed in Help > Shortcuts).
- Disabled states with reason: needs Character, too large, needs permission.
- My Fittings: Dexie table `fittings` (`id, characterId`), per-Character, synced like a Payee (`myFittings.ts`, `@/sync` `markFittingDeleted`/`scheduleSync`).
- Save to EVE (`SaveToEveDialog.tsx`, `saveToEve.ts`): name, target "New In-game Fitting" or "Replace <name>" (confirm text; delete after successful create; partial-failure dialog "Saved, but the old Fitting is still there"). Drops module state, charge binding, implants (`dropsNote`). Needs `esi-fittings.write_fittings.v1` (`GrantBanner` if absent); ESI POST/DELETE `/characters/{id}/fittings/`.

### Ring / List
- Ring (`FittingRing.tsx`, `engine/fittings/ringLayout.ts`): slot tiles by rack (high, medium, low, rig, subsystem), cargo tiles, CPU / powergrid / calibration / drone bandwidth gauges with over-by state, hardpoint counters (turret/launcher, over-hull warning), rack count and "N can't use" (missing skills) badges, drone count "x of y launched". Empty-slot click opens Add targeted at that slot. Keyboard-operable tiles.
- List (`FittingRackList.tsx`, `FittingModuleList.tsx`): same racks as rows with resource meters, state control, charge, remove, drag-to-move, variations; drones section (bay, launch squares, quantity); cargo section with hold m3.
- Ring/List toggle persisted as setting `fittingsView` (`fittingViewPreference.ts`).
- Drag and drop (pointer only; `fittingDrag.ts`): browser item onto slot/rack, module onto another slot, drone onto Drones to launch, charge onto module. Touch long-press is the row menu instead.
- Module/charge states: offline / online / active / overload (cycle via menu).
- Item menu (verified in `FittingItemMenu.tsx:164-260,440-610`; module items: State submenu (radio), Load charge/Same charge everywhere, Unload, Copy to all of this type, Swap for meta variant submenu, Copy module, Move up / Move down (disabled at ends) / Move to (disabled when <2 slots), Remove all of this type, Remove; drone items: Launch all (disabled when none in bay), Move to bay (disabled when none in space), Recall all, Show info, View in market, Remove; charge/cargo items: Load into..., Change quantity, Remove; browser items: Fit first free / Add to bay, Add to cargo (count); "No charges" disabled item when nothing loadable). Earlier summary kept below: State, Load charge from cargo (this module / all compatible), Change charge..., Unload, Copy to all of this type, Swap for meta variant, Copy module, Move up/down, Move to slot, Remove / remove all of this type, Show info (Item Detail), Swap for a variation...; empty slot: Add module (Browse..., Paste, Fill rack with last used); drones: Launch all, Move to bay, Recall all, Change quantity; cargo: Add cargo, Change quantity.
- Variations modal (`FittingVariationsPanel.tsx`, CSV `fittingVariationsCsv.ts`): meta variants with whole-fitting stat deltas, fits / can-fly / price columns, stat-by-stat change, swap.
- "Affected by" modal (`FittingAffectedByPanel.tsx`, `engine/fittings/affectedBy.ts`): every modifier on a module attribute (hull, mode, character, item, charge, skill, projected, fleet buff) with operator and stacking penalty.
- Drones/fighters: `FittingFightersPanel` (tubes, light/support/heavy, launch, add/remove), drone bay sheet with bandwidth limits.
- Over-budget flash (`useOverBudgetFlash`).

### Add panel (`FittingAddPanel.tsx`)
- Tabs: Modules, Charges, Drones, Cargo. Search items. Filters: Fits this slot, Hull, Resources, Skills (tooltips), Meta level select; "N more hidden by filters - show".
- Row disabled reasons: missing skills, doesn't fit hull, no bay room, no free slot, too much CPU/PG/calibration. Hull check runs whole-catalogue in a Web Worker with cached results (`hullFitService.ts`, `hullFit.worker.ts`, `hullFitCache.ts`); search works before ship data is downloaded.
- Charges tab: charge-taker list with loaded state; `ChargePicker` / `ListChargePicker` group by type or faction or Chart (range vs damage), Sort range/damage/price, Tech I / In cargo / Usable filters, "Fighting at..." distance, quick picks (max damage, max range, best value), "strictly worse" notes, price per hub (`engine/fittings/chargeChoice.ts`). Cap booster guide (`CapBoosterGuide`, `capBoosterChoice.ts`: stable %, GJ/s, ISK/GJ, smallest stable / most GJ/s / best value). Mining crystal guide (`MiningCrystalGuide`, `crystalChoice.ts`: Type A/B/C help, ore families, yield, cycle, residue).
- Cargo tab: search any item, +N quantity, `CargoQuantityDialog`.
- Click fits; drag onto Ring/List.

### Stats sections (`FittingStatsSections.tsx:276-310`)
Collapsible sections with stable ids: assumptions ("Implants & skills"), whatToTrain, offense, appliedDps, defense, capacitor, support, mining, fleetBoosts, projected, targeting, navigation, drones, fighters, fitting, price. Open/closed map is a device-local setting `fittingsStatsSections` (`statsSectionsPreference.ts`, localStorage-backed `createLocalSetting`, never in URL, not synced): untouched sections follow the default (open on desktop for offense, appliedDps, defense, capacitor, support, mining, fleetBoosts, navigation, drones, fighters; assumptions/whatToTrain/projected/targeting/fitting/price start collapsed; everything collapsed on a phone). There is no reorder or hide control (verified: the key stores booleans only).
- Toolbar (`StatsToolbar.tsx`): Copy stats (plain text via `fittingStatsText.ts`), Overheat all (every figure overheated).
- Offense: per-weapon DPS/volley/range, total, unheated vs overheated, sustained with reload, "N weapons have no charge" hint, drones don't overheat.
- Applied DPS (`AppliedDpsPanel`, `AppliedDpsChart`, `engine/fittings/appliedDps.ts`): raw vs applied at best range, graphs vs range and vs target speed, overlay another Fitting; own calculation (not the engine's), assumptions text. Target profile picker (`TargetProfilePicker`, built-in NPC classes + custom: signature, speed, resists; synced settings `sync.fittingTargetProfiles`, `sync.fittingTargetProfileId`).
- Defense: EHP, per-layer HP/resists, RAH adapted resists, damage profile picker (built-in factions + custom; synced `sync.fittingDamageProfiles`, `sync.fittingDamageProfileId`), tank (burst/sustained, repair rates), capacitor stable % or empty time.
- Price: sell/buy at chosen hub (default Jita), unpriced count (`fittingPrice.ts`, `engine/fittings/fitSellPrice.ts`).
- Support out: remote rep, neutralizers, nos, cap transfer, webs, ECM, target painters; Projected effects: add other Fittings (command bursts, remote repair, ewar) landing on this one, count +/- ships, all skills V.
- Fleet boosts (`FittingFleetBoostStats`), Mining (yield per cycle, per hour, residue, hold fill time), Tank, Support stats.
- What to train (`FittingWhatToTrainPanel.tsx`, `engine/fittings/skillGains.ts`): ranks each skill's next level by effect on the fit, "Rank by" sort (21 keys), incl. prerequisites, Add to Skill Plan per skill, Tech II upgrades within a few skills (`moduleUpgrades.ts`); disabled with skill overrides on or no Character.
- Fitting section: CPU/PG %, unknown items ("N items have no data in this build").
- States: downloading ship data % (indeterminate), engine error with Try again, skills load error, "Not available".

### Other editor dialogs
- Appraisal modal (`FittingAppraisalModal.tsx`): item, qty, unit price, line total, basis "lowest <hub> sell order", Copy to multibuy.
- Rename (`SavedFittingModals`), Delete confirm ("can't be undone"), Save as new, Save to EVE, Open a fitting, Item variations/affected-by, Cargo quantity, Implants & boosters.

### Export menu (`FittingExportMenu.tsx`, `useFittingExport.ts`, `fittingExportText.ts`)
- Copy Share Link: short `/share/<id>` link via `features/share/shareStore` (same code gives same link, expires; Firestore backed); too-large and failure notices.
- Copy Fitting (EFT), Copy multibuy list, Download EVE XML (`fittingXmlDocument.ts`), Manufacture Plan (router state to `/industry`, `@/lib/shortcuts`), Appraise in Market (router state to Market). Price preview Jita sell/buy in menu.

## Fixing an over-CPU / over-PG fit

No one-click "make it fit" or auto-fit exists (no such module in `src/features/fittings` or `src/engine/fittings`). Tools that avoid trying alternatives one by one:

| Tool | Where | What it shows |
|---|---|---|
| Gauge / Fitting section | Ring gauges, stats "Fitting" section | CPU/PG used vs total, over-by state, over-budget flash |
| Swap for meta variant / Variations modal | Item menu on a module | All meta variants in one table: whole-fitting stat changes, Fits / Doesn't fit, can-fly, price; click to swap; CSV |
| Add panel filters | Add panel > Modules | "Fits this slot", Resources filter, Meta level; rows disabled with reason "too much CPU/PG" |
| What to train | Stats section | Skill levels ranked by effect on the fit (CPU/PG skills included), Add to Skill Plan; Tech II upgrades within a few skills |
| Implant Finder | Header Implants control | Tries every implant on this fit; lists cheapest fixes when over CPU/PG (`implantFinder.ts`) |
| Skill basis: All V | Header Skill basis control | Stats only; shows if skills alone would fix it |

Unconfirmed: whether the Variations "Fits" column counts CPU and PG or hull/slot rules only (`FittingVariationsPanel.tsx:95-110`).

## Fitting Compare (`src/routes/FittingCompare.tsx`)

- Up to 3 Fittings (`MAX_COMPARE_SLOTS`), all in URL as repeated `?f=` (`compareUrl.ts`); each add/remove/replace is a history entry; updater form guards stale renders.
- "Compare with..." (disabled at 3) opens `FittingComparePicker` (My / In-game list, Load section, hull picker); Remove per column; link "Open in the editor" per Fitting.
- Per-Fitting header: name, fits-or-"Over <resource> by", can-fly yes/no/unknown for active Character; `CompareCanFlyByCharacter` expands to all Characters.
- Stats table (`FittingCompareTable.tsx`, `engine/fittings/fittingCompare.ts`): rows come from the shared `fittingStatFields` list (CPU/PG/calibration used and total, total DPS, volley, drone DPS/bandwidth/bay, EHP, per-layer HP and resonances, repair per layer, capacitor capacity/recharge, sensor strength, lock range/targets, scan resolution, signature, speed, agility, warp speed, cargo, etc.) plus a combined `capacitor` row, `appliedDps` and `bestRange` (vs the selected Target Profile) and `priceSell`/`priceBuy` (only when prices supplied). Best direction table `STAT_DIRECTION` (`fittingCompare.ts:17-57`): higher is best for DPS, volley, EHP, HP, repair, capacity, sensor strength, lock range/targets, scan res, speed, warp speed, cargo; lower for recharge time, signature, agility; no highlight for CPU/PG/calibration/mass. Also present: sustained and overheated DPS, burst and sustained tank, capacitor delta, sensor strength, mass (the compare-only ones flagged `compareOnly` in `fittingStatFields.ts`). Jump, compression and fuel rows do not exist. Best marked via sr-only text; "Show differences only" toggle.
- "Modules that differ" table (`FittingCompareModulesSummary`), counts per Fitting.
- CSV export of both tables (`fittingCompareCsv.ts`; every Fitting, not the phone page; capacitor exported as words; failed price blank).
- Phone: pager Previous/Next over columns (`compareWindow`).
- States: empty ("Nothing to compare yet"), per-slot share error, stats failed (remove it), profile load failed with Try again, prices loading/failed, applied-DPS assumptions note.
- Data: local SDE + dogma engine; prices from hub market data (`useComparePrice`); no own ESI endpoint.

## Shared view (`src/routes/FittingShared.tsx`)

- `/share/fitting?f=<code>` permanent URL; `/share/:shareId` short Share Link wraps same code (`routes/SharedLink.tsx` uses `FittingShareView`, shows expiry date). Outside `RequireCharacter`/`ScopeGate`.
- Visitor with a Character is redirected into the editor on the code.
- Logged out: banner "Shown at every skill level V, with no clone"; Fitting's own implant set applied if present (`resolveFittingShareView.ts`); read-only Ring, module list, stats sections, abyssal weather picker, target profiles.
- Buttons: Open in Neocom Desk (sets login return-to), Copy Fitting (EFT, copied/failed feedback).
- States: loading, invalid link, newer-version link, load failed.

## Data sources

| Data | Source |
|---|---|
| Hulls, modules, attributes | SDE / `loadSde`, pinned dogma engine assets (Cache Storage) |
| My Fittings, notes | Dexie `fittings` (synced) |
| In-game Fittings | ESI GET `/characters/{id}/fittings` (`esi-fittings.read_fittings.v1`), cached key `fittings:inGame` |
| Save to EVE | ESI POST/DELETE fittings (`esi-fittings.write_fittings.v1`) |
| Popular fits | zKillboard + ESI killmail; Firestore `workbenchFits` |
| Prices | market hub data (price hub setting) |
| Share Links | `features/share/shareStore` |
| Prefs | settings `fittingsView`, `fittingsStatsSections`, synced damage/target profile keys, charge picker settings |
| Skills / implants / clone | active Character's cached ESI data (`fittingPilotProfile.ts`) |

## Persistence and sync map

| State | Where | Synced |
|---|---|---|
| Open Fitting (the working state) | URL `?f=<Share Code>` on `/ships/fittings/edit`; every edit pushes a history entry, edits from one control within 1 s coalesce (`20260924-183346`, `useFittingWorkspace.ts:166-185`) | no (URL only) |
| Saved Fitting | Dexie `fittings` (`id, characterId`), record = name + code + optional notes + updatedAt (`myFittings.ts`) | yes, Firestore via `planSync` `fittingSpec`; deletes tombstoned by `markFittingDeleted` |
| In-game Fittings list | ESI cache key `fittings:inGame` (`inGameFittings.ts`, conditional fetch, ETag) | no (ESI re-pulled per device) |
| Ring / List choice | local setting `fittingsView` | no |
| Stats section open/closed | local setting `fittingsStatsSections`; default open on desktop per section list, collapsed on phone (`statsSectionsPreference.ts`) | no |
| Damage profiles, target profiles (custom + selected id) | settings `sync.fittingDamageProfiles/Id`, `sync.fittingTargetProfiles/Id` | yes |
| Hull-fit check results | Dexie `hullFitCache`, one row per hull + skill set, newest 40 kept (`hullFitCache.ts:12`) | no, rebuildable |
| Dogma engine WASM + `sde.dat` (~10 MB) | Cache Storage `dogma-engine-assets-<pin>`; stale pins deleted (`dogmaFittingEngine.ts`) | no |
| Short Share Links | Firestore share docs, TTL 7 days, reused if >24 h left (`shareStore.ts:23,69`) | server-side |
| Query-level state not persisted | Add-panel search text, filter chips, chosen slot never touch the URL | n/a |

## Formulas and limits (what the numbers mean)

Engine split: `@eveshipfit/dogma-engine` (WASM, ADR 0016) computes attributes, resists, DPS, CPU/PG, cap peak load. Everything below is the app's own pure code in `src/engine/fittings`.

- Heat: the engine has no heat or burnout model, only the overload bonus (ADR 0016 Consequences). "Overheated" = re-run `calculate` with every running heat-capable module (index < moduleCount) set to overload (`dogmaFittingEngine.ts:331-356`). Drones and fighters never overheat. "Overheat all" forces every figure heated (`overheatAll`, line 267).
- Applied DPS (`appliedDps.ts`): turret hit chance = 0.5^((angular*optimalSig/(tracking*targetSig))^2 + (max(0,d-optimal)/falloff)^2); no falloff and beyond optimal = 0; moving target at d<=0 or tracking<=0 = 0 (lines 88-107). Damage multiplier: wrecking chance = min(hit, 1%) at 3x; rest `(0.01+hit)/2+0.49` (lines 109-114). Missiles: `min(1, sig/explosionRadius, (sig/expRadius * expVel/targetVel)^DRF)`, 0 beyond range (116-124). Drones: 0 beyond drone control range; "keeps up" when speed > 1 and >= target speed (then hit chance 1), else turret formula (sentry speed reads 0). Fighters: raw DPS, unmodified. Final: each weapon's applied DPS x share through target resists (EM/Th/Kin/Exp). Graph x-axis rounds up to 5000 m, speed axis to 500 m/s (`appliedDps.ts:222,258`).
- Capacitor (`tank.ts`): peak recharge 10*C/tau*(sqrt(s)-s) maximal at 25% (=2.5*C/tau). Budget delta = peakRecharge + booster injection (reload-averaged via `reloadDuty` = cycles*cycleSeconds/(that+reload)) + nosferatu gain - drain; `deltaPct` = delta / peakRecharge. Stable level: load = drain*tau/(10C); stable iff load <= 0.25, then s = ((1+sqrt(1-4 load))/2)^2 (line 186-). Unstable: closed-form depletion time (tau/10)*(2/a)*atan(1/(2a)), a^2 = load - 0.25. It is an average model, not the engine's per-cycle simulation.
- Sustained local repair: each repairer's rate x reloadDuty (ancillary), x capFraction if it draws cap, capFraction = clamp((peakRecharge - (peakLoad - repairDraw))/repairDraw, 0, 1) (`tank.ts:155`).
- Resource check: over budget when used > total on CPU, powergrid or calibration (`skillGaps.ts:34-64`); unknown used/total counts as 0 overage. Hull/rack rules are separate (`candidates.ts` `fitsHull`, from the engine's rule-break report).
- Can fly: every hull/module/charge/drone requirement vs the pilot's Effective Skill Level (`computeSkillGaps`, `skillGaps.ts:66`; `fittingRequirementTypeIds` line 23). Stats can use overridden skills; "can fly" never does.
- Alpha-suitable (`alphaClone.ts:18`): walk required skills and all prerequisites at the highest needed level; blocker = needed level above the skill's `alphaMaxLevel` (0 = untrainable). Same test as EVE Workbench "Alpha Suitable"; ignores non-skill Alpha limits.
- What to train (`skillGains.ts`): candidates = every skill the engine lists as a modifier source anywhere on the fit (computed with all skills V) the pilot lacks V in; each re-evaluated at +1 level; skills with all metrics zero dropped; failed evaluations silently skipped (lines 395-403). Sort keys = overall + 7 combat (dps, ehp, activeTank, speed, align, capacitor, lockRange) + 13 role (optimal, falloff, tracking, miningYield, hold, remoteRepair, jumpRange, burst x4, compressionRange, coreFuel) = 21; ties by skill id (`rankSkillGains`, line 406). Training time = whole schedule incl. missing prerequisites, flagged.
- Tech II upgrades (`moduleUpgrades.ts`): only Tech I / meta-group-1 modules with a Tech II sibling for the same rack; all copies swapped as one; faction/officer/T2 never suggested.
- Charge choice (`chargeChoice.ts`): best value = cheapest per minute among charges with >= 90% of top damage (`BEST_VALUE_SHARE`); dimmed when under 50% of best at the set distance (`WEAK_SHARE`); faction charge flagged when > 10x Tech I cost per minute (`PRICEY_RATIO`); range uses a still 400 m-signature target.
- Price (`fitSellPrice.ts`): sum of hub sell min x qty at 100%; a type with no sell order is left out and the total is marked partial (never counted as 0 ISK); nothing priced = no price.
- Popular fits (`popularFits.ts`, `lib/zkillboard.ts:31`): last 40 hull losses; losses grouped by sorted multiset of fitted module ids (charges, drones, cargo, slot index ignored); a fit with fewer than 3 modules dropped; group value = mean of losses carrying a value; most recent loss supplies the Fitting. zKillboard HTTP failure or rate limit returns `ok:false` so "couldn't load" differs from "no losses".
- Share Code (`engine/fitting/fittingShare.ts`): version `2` (names; v1 still decodes), format `hull|modules|drones|fighters|cargo|implants|name`, base36 tokens, gzip + base64url; decode bounds: 8 slots per category, 50 drone stacks, 50 fighters, 500 cargo items, 10 implants, 10 boosters, 40 side effects, name 100 chars, encoded <= 20,000 chars, inflated <= 65,536 B. "Too large" means a count cap or `MAX_FITTING_SHARE_CODE_LENGTH = 20_100` (`fittingSharePayload.ts:15`), not a URL-length guess. Beyond it the Fitting stays editable locally but writes no `?f=`.
- Save to EVE (`saveToEve.ts:63-91`): name clamped to 50 code points, description (My Fittings notes) to 500; POST first, then DELETE old on overwrite; failed POST leaves the old Fitting; failed DELETE after POST returns `overwriteError` (pilot has both). A write auth failure runs `reportWriteAuthFailure`; `grant-needed` surfaces `needsPermission` (re-login with the Fittings write permission).
- Compare best marking (`fittingCompare.ts:85-110`): per-stat direction table (e.g. DPS higher, signature lower, agility lower, recharge time lower); fields without direction (CPU/PG/mass) never highlighted; nothing marked when all rounded values tie. Capacitor ranks stable above unstable, then higher stable % or longer depletion.
- Compare cap: 3 (`compareUrl.ts:9`); extra `f` values in a hand-edited URL are dropped (line 16).

## Scope and degraded behavior

| Need | Scope / data | When missing |
|---|---|---|
| Open, edit, stats, Compare, Share view | none (SDE + dogma) | ungated routes (`routeScopes.ts:104-114`) |
| Own skills in stats / can-fly | `esi-skills.read_skills.v1` | pilot profile load fails: "Couldn't load this Character's skills" with Try again (`usePilotProfile`); with no Character: All V profile |
| Clone implants in stats | `esi-clones.read_implants.v1` | `ImplantsAssumedNote`; stats assume none |
| In-game Fittings list | `esi-fittings.read_fittings.v1` | panel-level `GrantBanner`; rest of Start screen works |
| Save to EVE | `esi-fittings.write_fittings.v1` | Save to EVE dialog shows GrantBanner; ESI refusal also yields `needsPermission` |
| Popular fits / killmail Load | none (zKillboard public + ESI public killmail) | note only; Load shows killmail errors |
| No Character at all | none | Save disabled with reason; stats at all-V |

## Test-covered behavior (read from the tests; none run)
- Routes (`fittingRoutes.test.ts`): Fittings, editor and Tree live under `/ships`; a Share Link on the Fittings tab moves to the editor keeping the query; editor with no Fitting goes to the library; every old `/fittings?f=` link opens the editor in one hop; old library/editor/compare paths and old Skills > Ships go to their new homes keeping query and hash.
- Compare URL (`compareUrl.test.ts`): reads every `f` in order, drops empties, caps at 3, clearing removes `f`, other query keys untouched.
- Compare engine (`engine/fittings/fittingCompare.test.ts`): best is higher for DPS/volley/tank/repair, lower for signature radius/agility; no highlight for CPU used etc.; 3-way tie marks all indices; ties after rounding mean "not differing"; stable capacitor outranks unstable, then higher stable % / longer depletion; unstable encoded negative; price rows only when prices supplied.
- Compare table/page (`FittingCompareTable.test.tsx`, `routes/FittingCompare.test.tsx`): differences-only hides equal rows and shows a message when none differ; best flagged with sr-only text not colour; failed-stats column shows a dash; missing price shows dash, others ISK; undecodable slot shows its own Remove; page width max-w-6xl; one primary Add button in empty state.
- Session/URL sync (`fittingShareSession.test.ts`): a pasted link or Back/Forward resets state; own write matching the current code adopts the edit without decoding and keeps `savedId`; stale writes never adopted; coalescing of edits within a window by key (same key inside window coalesces, at exactly the edge it does not).
- Start screen (`FittingStartScreen.test.tsx`): Saved and In-game listed together under hull, one search covers name and hull, Enter opens and arrows walk the list, row menu has Open (+ Rename/Delete for saved only), Compare goes to compare with `?f=`, Import opens in a dialog and auto-opens for a broken share link, empty message, source tags.
- Save (`FittingSaveButton.test.tsx`): blocked state is `aria-disabled` with reason tooltip; Ctrl+S saves and prevents browser save; with Save off it still blocks the browser; Ctrl+Shift+S saves a copy only when an original exists; chord named for assistive tech.
- Shared view (`routes/FittingShared.test.tsx`): invalid/undecodable code messages; read-only view at All V with no session and Copy Fitting writes EFT; a visitor with a Character is redirected to the editor without computing stats; load-failure message; hull named above the Ring, cargo in list.
- Stats sections (`statsSectionsPreference.test.ts`): keeps booleans only, non-object = nothing stored, one toggle leaves others, untouched section open on desktop/collapsed on phone, persisted under its own key. (`FittingStatsSections.test.tsx`): assumptions starts collapsed; weapon group charge change from cargo; right-click opens the same menu; drone rows have no weapon menu; per-group DPS/volley, sustained DPS never on drones; optimal/falloff shown.
- Popular fits (`engine/fittings/popularFits.test.ts`): groups losses by fitted modules (sorted multiset of typeIds), ignores charges/cargo/drone bay/slot, skips losses with <3 modules, tie broken by most recent, value averaged over losses carrying one, opens the most recent loss with charges kept and cargo dropped.
- Alpha (`engine/fittings/alphaClone.test.ts`): nothing flagged when all skills incl. prerequisites within caps; each blocker once at highest level; follows prerequisites; unknown skill skipped, not guessed Omega-only.
- Applied DPS (`appliedDps.test.ts`): full hit inside optimal, half at optimal+falloff, tracking term vs angular speed, wrecking shots counted, missiles dropped beyond flight range, never NaN, raw DPS unchanged by Target Profile.
- Tank/cap (`tank.test.ts`): reload-weighted uptime, cap drain/booster/nosferatu split with delta, booster charge interval to hold peak.
- Skill gains (`skillGains.test.ts`): unmaxed skills at next level, weighted score (damage/tank whole, mobility/reach half, cap time quarter), cap going stable counts in full.
- Sell price (`fitSellPrice.test.ts`): sum of count x sell, partial flag when an item has no sell order, no price (not 0) when nothing priced.
- Link loader (`linkLoader.test.ts`): own Share Link/editor/Ships paths, DNA, in-game link, eveship.fit, EFT, zKillboard/ESI killmail, EVE Workbench fit id; other Workbench pages rejected. EFT loader: unknown items reported by line, unresolvable hull stops, over-cap slot rejected.
- Hull-fit (`hullFitKey/Service/Cache/worker` tests): key stable regardless of skill order, concurrent callers share one check, repeat from memory then Dexie, newest 40 rows kept, newer request supersedes.
- Implant Finder (`ImplantFinder.test.tsx`): goals by fit problem, LP Store price when cheaper and redeemable, family keeps Remove, boosters for a weapon, slot-strip narrowing, info button.

## Decision links
ADR `docs/adr/0016-fitting-stats-from-eveshipfit-dogma-engine.md`. Scope decisions in `docs/context/decisions/`: `20260924-150509` (fitter after all), `20260924-183346` (edits push history), `20260924-191854` (My Fittings per Character), `20260924-195833` (killmail hash via zKillboard), `20260925-113331` (Load launches drones), `20260925-152418` + `20261001-210222` (one list, tap opens on phone), `20261002-191845` (bay count counts every carried drone; supersedes `20260930-184245`), `20261004-135042` (one implants control), `20261002-194757/231614` (Implant Finder), `20261003-173240` + `20261004-144240` (out-of-date Workbench fits never listed), `20261005-220111` (Ctrl/Cmd+S chords, Back is undo), `20261004-101406` (specialised holds, Industry side), `20260927-104634` (Manufacture Plan export).

## Interview Q&A

1. Where is an open Fitting stored, and why? In the URL as a versioned Share Code on `/ships/fittings/edit?f=` (`useFittingWorkspace.ts:166-185`). The URL is the working state, so sharing equals copying the address bar and Back is undo; each edit pushes a history entry (the one exception to ADR 0015's "writes replace history", `20260924-183346`); repeat edits within 1 s coalesce. Nothing is written to Dexie until an explicit Save (`myFittings.ts:1-6`).
2. Which engine computes stats and what does the app add? `@eveshipfit/dogma-engine` WASM + patched `sde.dat` behind one seam `dogmaFittingEngine.ts` (ADR 0016). App code adds applied DPS, capacitor stability, sustained repair, compare, what-to-train, price (`src/engine/fittings`), each labelled where it is not the engine's.
3. How is "overheated" derived given the engine lacks a heat model? Second `calculate` with every running module that can overheat set to overload; drones/fighters excluded (`dogmaFittingEngine.ts:331-356`).
4. Why can a Fitting be "too large to share" when it has few modules? Limits are structural caps (8 slots/category, 50 drone stacks, 500 cargo items, 10 implants...) plus code length 20,100 (`fittingShare.ts:136-143`, `fittingSharePayload.ts:15`). Over the cap there is no `?f=`, Compare-by-link and Share Link are disabled, and reload loses it unless saved (`useFittingWorkspace.ts:316,402`).
5. What exactly happens on "Save to EVE" with overwrite? POST new, then DELETE old (`saveToEve.ts:63-91`); a failed POST keeps the original; a failed DELETE leaves both and reports `overwriteError`. Module state, charge binding and implants are not representable in ESI's payload (`dropsNote`). Name 50 / description 500 code points.
6. How does a stats basis differ from "can fly"? Skill basis control (own / all 0 / all V / per-skill set) changes stats only; can-fly and missing-skills chip always use real Effective Skill Levels (`skillGaps.ts:66`). What to train is disabled while overrides are on.
7. How are implants decided for stats? One chip: Fitting's own set if it carries one, else the active clone; "Use my clone" is the only way back (`20261004-135042`). Editor seeds from the clone so added boosters stack; multibuy/price omit implants the clone already has.
8. Explain the applied DPS model. Turret hit chance = 0.5^(tracking^2 + range^2) terms, wrecking 1% at 3x, average multiplier `(0.01+h)/2+0.49` (`appliedDps.ts:88-114`); missiles use min(1, sig ratio, velocity ratio^DRF) (116-124); drones keep up if speed >= target; fighters fixed. Then resists weighting. It is the app's own calculation, flagged by `appliedDps.assumptions`.
9. How does capacitor "stable at X%" work? Closed-form on the game's recharge curve; stable iff drain*tau/(10C) <= 0.25 (`tank.ts:186-204`); cap boosters averaged over reloads (`reloadDuty`, line 40). Depletion time from the integral, not simulation, but consistent with the engine's delta by construction.
10. Why does the module browser work before ship data downloads? Hull-fit checks run in a Web Worker over the whole catalogue with results cached per hull and skill set in Dexie `hullFitCache` (40 rows) (`hullFitService.ts`, `hullFitCache.ts:12`); search itself is SDE-only. The ~10 MB engine data downloads lazily and is cached per pin in Cache Storage.
11. What does the Popular fits "zKillboard" tab actually show? 40 newest losses of the hull, grouped by module multiset, >=3 modules, mean value, newest loss as the Fitting; on failure "Couldn't load...Everything else still works" (no retry control exists in `PopularFitsPanel.tsx`).
12. How does Compare pick the "best"? Direction table per stat; ties and direction-less fields unhighlighted; capacitor stable > unstable (`fittingCompare.ts:85-110`). Max 3 Fittings in repeated `?f=`.
13. What does Load accept and how is a killmail resolved? EFT, DNA, share code, eveship.fit, Workbench links, EVE XML, zKillboard/ESI killmail. zKillboard URL carries only id so the hash comes from zKillboard `killID` API, then victim from ESI; destroyed + dropped quantities are summed (`20260924-195833`, `linkLoader.ts:41-49`).

## Observed gaps

Verified against code in this pass:
- Compare capped at 3 (`compareUrl.ts:9`); phone shows a window with Previous/Next, CSV includes all Fittings.
- Corporation fittings: no ESI source; EVE XML Load only.
- Save to EVE cannot keep module state, charge binding or implants; overwrite order is create-then-delete so a failed delete leaves both (`saveToEve.ts`).
- "Too large" is count/length based (see Formulas); such a Fitting cannot be linked, shared or compared by link and is lost on reload unless saved.
- Applied DPS is the app's own model; Projected effects assume all skills V; heat is overload-only, no burnout.
- What to train disabled while skill overrides are active; evaluation failures for single skills are silently skipped (`skillGains.ts:398-401`).
- No bulk actions on the library (no multi-select, bulk delete/export); CSV only in Compare and Variations.
- Drag and drop off on coarse pointers (`useMediaQuery(COARSE_POINTER_QUERY)` in `Fittings.tsx:137`); the row menu is the touch path.
- Popular fits: `getPopularFits` returns `{ok:false}` on any zKillboard/ESI failure (`popularFits.ts:77,85`); the panel renders one plain note `fittings.popular.failed` (`PopularFitsPanel.tsx:106`) with no retry control (re-verified; the workbench tab has its own `failed` note, :207). Switching source tab is the only re-trigger.
- Compare picker Loads open drones in the bay (verified by absence: no launch logic in `FittingComparePicker.tsx`/`FittingCompare.tsx`; decision `20260925-113331` says the launch rule lives only in the editor workspace; `launchDrones` exists only in editor item actions `useEditorItemActions.ts:26`).
- Saved-Fitting hull names require decoding every record on list load (`useHullNames`); an undecodable code shows an unreadable row.
- English only.

## Improvement ideas
- Retry control on Popular fits and a distinct rate-limited message.
- Library multi-select with bulk delete and bulk EFT/XML export; CSV of a single Fitting's stats.
- Optional ESI fitting write that preserves charges by emitting them as cargo/fitted charge flags, and show a diff before overwrite.
- A cheap capacity estimate for the "too large" case: split cargo into a separate payload so hull+modules always link.
- Burnout/heat model or at least label overheated figures as engine overload values.
- Remember last Compare set per Character; share Compare as one short link.
- Surface skipped what-to-train candidates instead of dropping them.
- Auto-launch drones in Compare picker Loads for parity with the editor.
