# Clones

Route `/clones` (`src/routes/Clones.tsx`). Second tab of the Character overview (`OverviewSubNav`). Sub-view of Overview in nav (`src/app/navDestinations.ts:117`), not a rail item.

| Feature                                             | Where                                       |
| --------------------------------------------------- | ------------------------------------------- |
| Shared Character header + sub-nav                   | `CharacterHeader`, `OverviewSubNav`         |
| Home Clone row (location, last moved)               | `Clones.tsx:317-330`                        |
| Jump Cooldown chip                                  | `Clones.tsx:331`, `src/engine/cloneJump.ts` |
| Jump clone table: Location (+ clone name), Implants | `Clones.tsx:195`                            |
| Implant link (Show Info) + description tooltip      | `ImplantLink`                               |
| Data age, Refresh, Export (CSV/XLSX/copy)           | `Panel actions`, `clonesCsv.ts`             |
| Re-login banner when scope missing                  | `GrantBanner`                               |

## Purpose / user goal

See where the active Character's home clone and jump clones are, what is fitted in each, and when the next jump is allowed.

## Controls

- Refresh icon (disabled while loading), data-age badge, table actions menu (Download CSV, Download Excel, Copy for Sheets/Excel).
- Table (`DataTable`, `mobileSort`, row key `jump_clone_id`): Location column sorts by name then location; Implants column sorts by count. No row click, no search.
- Implant names: entity link to Show Info; hover/focus tooltip with markup-stripped description when one exists.
- Location column: "name . location" for a named clone (trimmed; blank name ignored); unresolved location = "Station #id" / "Structure #id".
- CSV columns: Name, Location, Implants (names joined `; `, `Type #id` fallback). Surface `clones`.

## Persistence / sync

ESI cache (Dexie) key `clones`; route snapshot `cacheKey: 'clones'`. No settings, no URL state, nothing synced. Shared SP header falls back to `getLastKnownSpSummary` (session store).

## States

Spinner (first load, until hydrated) -> no active Character: `Navigate('/characters')` -> reauth `GrantBanner` (table hidden, export empty) -> load error (`common.loadFailedTitle`) -> no data ("No jump clones cached / Reconnect...") -> data with zero clones (`CachedEmptyState`, "No jump clones" if fetched) -> table. Offline: warning "Offline" line when `fromCache`. Home row shows whenever clones data loaded, even with zero jump clones.

## Scopes

`esi-clones.read_clones.v1` (`getCharacterClones`, group Character details), page-gated (`src/app/routeScopes.ts:243`, strings namespace `clones`). Missing grant: tab shows amber dot + "Needs a new login" tooltip (`OverviewSubNav.tsx ClonesTab`); `ScopeGate`/`GrantBanner` offer login. Infomorph level read via corrected skills with `skipQueueWithoutScope`; SP header via `loadCharacterSpSummary` (skips `/skills` read without grant). Structure names: a 403 means outside ACL, not revoked scope, so fallback id and no reauth. NPC station names from SDE, no ESI (#655).

## Formulas

- `cloneJumpCooldownHours(level) = max(0, 24 - level)`.
- `readyAt = lastCloneJumpDate + hours`; `onCooldown = readyAt > loadedAt`; no/unparseable date = ready (`cloneJump.ts`). Skill id 33399, effective level = min(queue-corrected trained, active) (#1236), 0 when unreadable.
- Chip: warning "Until {date} ({duration} left)" or success "Ready"; time uses the app time-zone setting.
- `cloneJumpReady` notification uses the same formula, fires once, never for a Character who never jumped (`CONTEXT.md` **Clone Jump Ready**).

## Decisions

`20260922-191151-alpha-clone-state-is-a-per-character-setting.md` (Clone State not on this page); `CONTEXT.md` **Clone State**; ADR 0015 (URL state, unused here).

## Tests (what they assert)

- `Clones.test.tsx`: lists clones with resolved locations/implant names and cooldown; implant names link to Show Info; description tooltip on hover while still linking; home station + last-change date; implants stay "Type #id" when the names batch is rate-limited (no fan-out); inaccessible structure shows id fallback with no reauth banner; named clone shown beside trimmed location, blank name ignored; empty state; same header as Overview, data age/Refresh below tabs; Refresh offered when empty; re-login prompt when scope revoked.
- `clones.test.ts`: fetch+cache, offline cache fallback, `needsReauth` on 403 with empty cache; `loadImplantDescriptions` strips markup and omits failures/empties.
- `clonesCsv.test.ts`: column order name/location/implants; name split from location (blank if unnamed); unresolved location labelled by type+id; implants by name with id fallback.
- `engine/cloneJump.test.ts`: 24h base, -1h per level, floor 0; never jumped = ready; ready once `readyAt` passed; on cooldown while future; unparseable date = no history.

## Interview Q&A

1. How is cooldown computed? `lastJump + (24 - Infomorph level)` h, level 0 if unreadable so late never early (`cloneJump.ts`).
2. Why effective not trained level? #1236: cooldown must never read shorter than usable.
3. Why does a structure 403 not prompt login? It is ACL, not scope (`Clones.tsx:109`).
4. Where do station names come from? SDE snapshot, no ESI.
5. What if the scope is missing? Amber tab dot, `GrantBanner`, empty export.
6. How does the header avoid blanking? Last-known SP fallback; SP loaded without queue scope.
7. What happens when the implant-name batch is rate-limited? Implants render "Type #id" rather than fanning out more calls (test above).
8. How does it relate to the Clone Jump Ready alert? Same formula, fires once.

## Observed gaps

- The page now also loads (#3001) the Character's current system, the worn clone's implants (`getCharacterImplants`, missing grant = a `GrantBanner` above the table, never replacing it) and the active skill queue (cached, nothing rendered from it yet). Only the jumps-away figures render so far: a Jumps away column and a figure on the home line, each a `PlaceJumpsLink` to the route planner on the saved route preference (no page picker). The worn clone's implants are still shown only on Skills › Trained; unnamed clones read dimmed "Unnamed".
- No Show Info/map link for clone locations; no search/filter.
- `clones.emptyHint` says "Reconnect" even when nothing is wrong beyond an empty cache.
- Cooldown is only 24h minus Infomorph level; Clone State not shown.
- SP header chips depend on `/skills`, so can read unknown while the clones grant exists.

## Improvement ideas

- Show current clone implants and totals; Alpha/Omega.
- Link locations to Show Info/map; cooldown countdown in strip or alert link.
