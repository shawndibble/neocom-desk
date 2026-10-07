# Characters

Route `/characters` (`src/routes/Characters.tsx`). The roster of every Character logged in on this device: stats, filtering, grouping, starring, add, remove. Picking one makes it active and navigates away. UNGATED (`src/app/routeScopes.ts:51`), cache-first from Dexie. Also the landing after adding an alt (`Callback.tsx`) and the fallback when Characters exist but none is active (`Root`). Shared pieces `CharacterHeader` and `CharacterFilterControl` are described at the end.

| Feature                                                            | Where                                                                |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| Card (default) / Table view toggle                                 | `Characters.tsx:1751`, `useCharacterViewMode` (`charactersViewMode`) |
| Search (name or corp)                                              | `FILTER_PARAMS.q`                                                    |
| Filters: queue state, corporation, group, starred only, has alerts | `Characters.tsx:1585-1671`                                           |
| Sort: name, SP, wallet, group, alerts + direction                  | `SORT_KEYS`, `groups.ts sortCharacterIds`                            |
| Starred-first layer                                                | `starredCharacters.ts`                                               |
| Groups (create, rename, reorder, delete, assign)                   | `GroupSectionHeader`, `overviewGroups.ts`, `groups.ts`               |
| Columns picker (table)                                             | `ColumnPickerMenu`, `characterColumns.ts`                            |
| Export CSV / XLSX / copy                                           | `charactersCsv.ts`, `TableActionsMenu`                               |
| Row menu (context menu / more actions)                             | `CharacterRowContextMenu.tsx`                                        |
| Refresh all (live)                                                 | `handleRefreshAll` `:1192`                                           |
| Add character (plain / custom permissions)                         | split button `:1501`, `loginFlow.ts`                                 |
| Remove character                                                   | modal `:1819`, `removeCharacter.ts`                                  |
| Density select                                                     | shared `useFontScale`                                                |

## Purpose and user goal

See which alts need attention (queue idle/ending, PI stopped, free job slots, alerts) and jump to one; manage the roster. Decisions: `20260907-092320-starred-characters-on-the-characters-page.md`, `20260909-130638-characters-table-view-mobile-scroll-roster-overview-split.md`, `20260925-230353-character-cards-gain-a-non-zero-attention-chip.md`, `20260927-071415-characters-table-gets-a-group-column-and-remove.md`, `20261005-202754-characters-table-remove-folds-into-the-row-menu.md`, `20260926-220722-character-removal-leaves-remote-data-to-the-inactivity.md`, `20260829-094708-multi-character-from-day-one.md`.

## Controls

Header: Refresh all icon (tooltip "Pulls live data for every character. This may take a moment for a large roster."; `aria-disabled` + spinner while running, guard in handler); Add split button: "Add" (icon only below `sm`) -> `beginAddCharacterLogin()` (whole Base Grant, not unioned with the active Character, #295); caret menu "Add with specific permissions..." -> `CustomizePermissionsDialog` (`auth-login.md`).

Filter bar (`FilterBar` funnel + search "Search by name or corporation..."): queue chips Training / Ending soon / Paused / Idle (toggle); Corporation `Select` (only with more than one corp, or when URL set one so it can be cleared); Group `Select` (only if groups exist; includes Ungrouped; stale id stays visible); chips Starred only, Has alerts; Sort by + direction. Table-only actions: Columns, export menu. Below: "New group" (inline input; Enter creates, Esc cancels, blur creates), density `Select` (Compact 0.875, Cozy 1, Comfortable 1.125, Spacious 1.25; app-wide text size, same as Settings > Display), Cards/Table toggle.

Card (`CharacterCard`): portrait (pointer-only), name button (select), "Active" label + `aria-current`, data-age dot (stalest read), corp and alliance text, star toggle (filled when starred), group `Select` (if groups exist), danger remove x, chips SP, Wallet, Queue, Alerts (if > 0), PI (idle or expiring soon). Starred first within a section, chosen sort underneath. Group header (card only): name (double-click rename), up/down (disabled at ends), rename, delete (modal: characters become ungrouped); empty group text. Grid `sm:2 / lg:3`.

Table: one flat `DataTable`, scrolls sideways at every width, sticky name (`responsive="table"`). Columns (default visible marked _): name_, corp, group* (only if groups exist; inline Select), spTotal, wallet, lastSynced*, training* (state or countdown, tooltip timestamp), open jobs Mfg/Sci/Rxn* (free slots; red when all idle, amber when >= half open; dash if unknown), pi* (label + countdown), spReady (only when SP monitoring on), alerts*, starred*. Header-click sort is separate (URL `table.sort`; a sort on a hidden column reads unsorted). Row click selects. Row menu (right-click or more-actions): Overview, Skills, Industry, Planetary Industry, Alerts (each sets active Character then navigates), danger Remove, plus Export table submenu. Export file holds every data column regardless of picker; countdowns exported as state plus ISO UTC timestamp columns ("Training finishes", "PI expires"); SP/wallet/alerts raw numbers; open slots as numbers.

## Persistence and sync

- URL (ADR 0015): `q, sort, dir, queue, corp, group, starred, alerts, table.sort`.
- Device-local Dexie settings: view mode, visible columns (`charactersVisibleColumns`; empty list rejected to defaults; migration flag `charactersColumnsMigratedGroupRemove` adds `group`, drops retired `remove`), starred ids (`starredCharacters.ts`), groups (own `updatedAt`, no `sync.` prefix, `overviewGroups.ts`). Density = shared synced font scale. None of groups/stars sync.
- Self-heal effects prune group members and stars whose Character left the device (`Characters.tsx:1117,1133`), including sold Characters.
- Data: roster core cache-only by default (`roster.ts`, `rosterView.ts`: wallet, skills with queue-corrected SP, queue state, job-slot skills); `live: true` composes per-Character loaders with `ESI_FANOUT_CONCURRENCY`, merging rows as each finishes. Attention (`rosterAttention.ts`): job counts + PI; planets scope checked up front per Character so a 403 never raises an app-wide banner. Public info batched (`usePublicInfo.loadMany`). Alert counts from the feed.

## States

No Characters: EmptyState "No characters yet". Filters empty everything: "No characters match this search or filter". Unknown stats: "unknown"/dash. Spinner while Dexie loads. Remove failure: `Toast` 5 s, nothing deleted. No ESI error UI on refresh all.

## Scopes

Page needs none; reads wallet (`esi-wallet.read_character_wallet.v1`), skills/queue (`esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`), jobs (`esi-industry.read_character_jobs.v1`), planets (`esi-planets.manage_planets.v1`); a missing scope shows as unknown or dash for that Character.

## Formulas and details

- `endingSoon`: tail finish within 24 h (`ENDING_SOON_MS`, `queueStatus.ts:226`); `unknown` (no cached queue) is not a filter option. Idle chip tone/rank respects `characterNotTraining` mute (`Characters.tsx:166-176`).
- Open slots = max (job-slot skills) - running; unknown if either missing.
- Card PI chip only for `idle`/`expiring-soon`; `decayed` table-only; passed expiry reads stopped (`piCardAttention`).
- Last synced = oldest of SP, wallet, queue fetch (`characterLastSynced`).
- Select navigates to `location.state.from` unless `/characters`, else Overview (#1764).

## Remove character

Modal copy states local deletion and that the synced copy stays. `removeCharacterAfterSync`: flush that Character's pushes (8 s cap), then one Dexie transaction (characters, tokens, `onRemoval: 'delete'` collections, order samples, drafts, mining history, feed rows, sync bookkeeping); after: badge refresh, ESI cache purge, shared structure cache purge if roster empty, push projection rebuild/unregister, reassign active to lowest id or clear. Remote copy purged after 90 days idle. Account-wide wipes live in Settings (`logoutAll.ts`, `deleteAllCharacterData.ts`).

## Shared pieces

`CharacterHeader`: `<h1>` name, corp/alliance entity links, total + unallocated SP chips (used by Overview, Clones, Employment). `CharacterFilterControl`: This / All Characters toggle emitting `'current'`/`'all'` (URL codec `characterFilterUrlParam.ts`, comma ids still parse; synced default `defaultCharacterFilter.ts`); used by Wallet, Assets, Contacts, Industry Active Jobs/Opportunities, Open Orders, Mining Tax tabs, Settings; hidden for one Character; icon-only on phone; decisions `20260908-192806`, `20260927-072408`.

## Tests (what they assert)

- `Characters.test.tsx`: cards from Dexie with portraits; only the active card has `aria-current` + Active; Alerts chip only with alerts; "PI Stopped" chip for an expired colony, never for `decayed`; one combined data-age badge (oldest field); idle queue warns like the alert and ranks with paused, but stays neutral when the alert is muted and sorts with unknown; corp/alliance plain text; selecting persists active and navigates to Overview.
- `characterColumns.test.ts`: `spReady` offered only with monitoring on, `group` only with groups; stored lists filtered without mutation; group appended once; `remove` dropped; defaults and persistence.
- `charactersCsv.test.ts`: column order like the table with timestamps as own columns in ISO UTC; SP/wallet/alerts raw; free slots numeric; unknown blank; expired PI = stopped; SP ready past threshold.
- `removeCharacter.test.ts`: deletes every local row incl. synced collections, not other Characters'; all-or-nothing on failure; reassign/clear active; shared structure cache purged only when last; pushes once before removing but removes even if push fails; no remote call; push projection re-upload vs unregister.
- `starredCharacters.test.ts`: toggle, floats starred first preserving order, prunes departed ids, rejects malformed stored value. `groups.test.ts`: prune, add, rename, remove (ungroups), move, reorder (out-of-range no-op), sorts.

## Interview Q&A

1. Why cache-only on open? No fan-out for large rosters; Refresh all is the explicit live pull with concurrency cap (`roster.ts`).
2. Missing planets scope? Dash; checked up front (`rosterAttention.ts`).
3. Why no group sections in table? `20260927-071415`: group column instead; management card-only.
4. Add vs re-auth? Add = whole Base Grant, no union (`loginFlow.ts`).
5. Removal semantics? Local transaction + purge; remote after 90 days (`removeCharacter.ts`).
6. "Starred" not "pinned"? CONTEXT.md reserves pinned for PI structures.
7. URL contract? Params above, ADR 0015.
8. Return after select? `from` state or Overview.
9. Dangling ids? Prune effects.
10. Why horizontal scroll on phone? `20260909-130638`.

## Observed gaps

- SP extraction: readiness only (`engine/spExtraction.ts`: 5,000,000 floor, 500,000 per extractor, count = floor((total - 5M)/500k), raw `total_sp` which excludes unallocated SP); no extractor cost or injector sale price, so no "worth it" figure (#2854). Opt-in and threshold live in Settings › Characters, not Notifications.

- No multi-select or bulk actions; group assignment per Character.
- Table has no group management; two sort controls (`sort` vs `table.sort`).
- No manual Character ordering.
- Row-menu "Alerts" sets active Character then opens a device-wide page without preselecting the alerts Character filter.
- Refresh all shows one spinner only; no per-Character progress or failure marker (`handleRefreshAll`).
- Re-adding an existing Character is a plain re-login with no account-wide backfill by design (`addCharacter.ts`).

## Improvement ideas

- Bulk select (group/remove/star), drag ordering, per-Character refresh and failure markers, Alpha/Omega and location on cards, sync groups and stars across devices.
