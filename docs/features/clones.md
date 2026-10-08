# Clones

Route `/clones` (`src/routes/Clones.tsx`). Second tab of the Character overview (`OverviewSubNav`). Sub-view of Overview in nav (`src/app/navDestinations.ts:117`), not a rail item.

| Feature                                                     | Where                                   |
| ----------------------------------------------------------- | --------------------------------------- |
| Shared Character header + sub-nav                           | `CharacterHeader`, `OverviewSubNav`     |
| Top strip: shared Jump Cooldown, You are in, Respawn        | `Clones.tsx`, `src/engine/cloneJump.ts` |
| Clone list: Wearing now first, then one card per jump clone | `CloneCard`                             |
| Implant link (Show Info) + description tooltip              | `ImplantLink`                           |
| Implant count and ISK value (hub sell, region fallback)     | `CloneCard`, `engine/implantValue.ts`   |
| Jumps away (route-planner link) per place                   | `JumpsAwayText`                         |
| Data age, Refresh, Export (CSV/XLSX/copy)                   | `Panel actions`, `clonesCsv.ts`         |
| Re-login banners (clones grant, implants grant)             | `GrantBanner`                           |

## Purpose / user goal

See where the active Character's home clone and jump clones are, what is fitted in each, and when the next jump is allowed.

## Controls

- Refresh icon (disabled while loading), data-age badge, table actions menu (Download CSV, Download Excel, Copy for Sheets/Excel).
- Top strip (three blocks on desktop, stacked on a phone): the Jump Cooldown stated once and labelled as shared by every clone (countdown chip, progress bar, last jump, Infomorph Synchronizing reduction); You are in (current system, security, worn implant count and ISK "at risk if podded"); Respawn (home clone place, security, jumps link, last moved).
- List: a "Wearing now" card first (when the implants read worked), then one card per jump clone in the Character's own order. Each card: name (dimmed "Unnamed" when blank) and place, security, jumps link, implants as links, implant count and ISK value. No row click, no menu: the links carry every action (DESIGN §6c restraint).
- Implant names: entity link to Show Info (no new modal); hover/focus tooltip with markup-stripped description when one exists. Touch-sized below `md`.
- Value: sum of lowest sell at the Market Hub, else lowest in its region; implants with no price are counted ("N unpriced"), never treated as free. Loaded after first paint.
- Unresolved place = "Station #id" / "Structure #id". Security shows only where the clone's system resolved.
- CSV columns: Name, Location, Implants (names joined `; `, `Type #id` fallback). Surface `clones`.

## Persistence / sync

ESI cache (Dexie) key `clones`; route snapshot `cacheKey: 'clones'`. No settings, no URL state, nothing synced. Shared SP header falls back to `getLastKnownSpSummary` (session store).

## States

Spinner (first load, until hydrated) -> no active Character: `Navigate('/characters')` -> reauth `GrantBanner` (list hidden, export empty) -> load error (`common.loadFailedTitle`) -> no data ("No jump clones cached / Reconnect...") -> data with zero clones (`CachedEmptyState`, "No jump clones" if fetched) -> list. Offline: warning "Offline" line when `fromCache`. The top strip and Wearing now show whenever clones data loaded, even with zero jump clones (the empty state sits below them).

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

- `Clones.test.tsx`: cooldown stated once, labelled shared, one progress bar; Wearing now card first with implant link target, count, value and "unpriced"; lists clones with resolved locations/implant names; implant names link to Show Info; description tooltip on hover while still linking; home station + last-change date; implants stay "Type #id" when the names batch is rate-limited (no fan-out); inaccessible structure shows id fallback with no reauth banner; named clone shown beside trimmed location, blank name ignored; empty state; same header as Overview, data age/Refresh below tabs; Refresh offered when empty; re-login prompt when scope revoked.
- `clones.test.ts`: fetch+cache, offline cache fallback, `needsReauth` on 403 with empty cache; `loadImplantDescriptions` strips markup and omits failures/empties.
- `engine/implantValue.test.ts`: implant value sums priced ones and counts unpriced; cooldown progress clamps 0..1.
- `e2e/clonesNames.spec.ts`: names beside place, long name wraps, no horizontal overflow at 1440/1024/390.
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

- "You are in" shows the current solar system, not the station or structure: the cached location read keeps only the system id.
- No search/filter, no sort control (nearest-first is a later ticket); Clone State (Alpha/Omega) not shown.
- `clones.emptyHint` says "Reconnect" even when nothing is wrong beyond an empty cache.
- SP header chips depend on `/skills`, so can read unknown while the clones grant exists.
- Worn implants need `esi-clones.read_implants.v1`; without it the Wearing now card and "at risk" figure are absent and a banner offers login.

## Improvement ideas

- Verdict and nearest-first sort; show the station for "You are in".
