# Employment History

Route `/employment-history` (`src/routes/EmploymentHistory.tsx`). Third tab of the Character overview; sub-view of Overview in nav (`src/app/navDestinations.ts:118`). UNGATED: public endpoint (`src/app/routeScopes.ts:126`).

| Feature | Where |
|---|---|
| Shared header + sub-nav | `CharacterHeader`, `OverviewSubNav` |
| Table: Corporation, Joined, Duration | `EmploymentHistory.tsx:94` |
| "Current" badge | `EmploymentHistory.tsx:109-119` |
| Corporation name = Show Info link | `CorporationLink` |
| Default sort Joined desc, mobile sort | `DataTable defaultSort`, `mobileSort` |
| Data age, Refresh, Export | `Panel actions`, `employmentHistoryCsv.ts` |

## Purpose / user goal

See the active Character's corporation history and time spent in each.

## Controls

- Header-click sorts (Corporation by name, Joined by date, Duration by seconds); default Joined desc; mobile sort control.
- Corporation name opens Show Info (public info modal); never links to `/corp` (viewer may lack Corp Access).
- Refresh, data-age badge, export (CSV/XLSX/copy). Joined = `toLocaleDateString()`; Duration = `formatDuration`.
- Ongoing row tinted `bg-success/5`; "Current" badge only if ongoing AND `character.corporationId` equals it.
- CSV: Corporation, Joined (raw ESI timestamp), Duration (days, `floor(sec/86400)`); surface `employment-history`.

## Persistence / sync

ESI cache key `employment-history`; route snapshot key same. Nothing user-set, nothing synced, no URL state.

## States

Spinner (first load) -> `Navigate('/characters')` if no active Character -> load error -> empty (no data or zero rows: "No employment history cached / Reconnect...") -> table (+ offline warning line if from cache). Previous visit's rows render immediately while re-reading.

## Scopes

None: `getCharacterCorporationHistory` is `PUBLIC`; loaded with `loadWithCache` (no auth status). Header SP uses `loadCharacterSpSummary`, which skips the `/skills` read without that grant (chips show a dash) so no stale-grant notice appears here. Corp names via `resolveNames` (cache then ESI; `#id` fallback).

## Formulas

`deriveEmploymentHistoryRows(entries, now)`: sort by `start_date` desc; tenure = (next-newer record start, or load time for the newest) - start, clamped >= 0; `ongoing` only index 0.

## Decisions

`20261005-211423-employment-history-corporation-names-link-to-show-info.md` (row menu removed; amends round 49 `20260904-162201`); `20260930-104922` (other pilots via `/pilot-lookup`).

## Tests (what they assert)

- `EmploymentHistory.test.tsx`: most-recent first with resolved names and no granted scope; badge on ongoing row only when it matches the character record, none when corp differs; same header as Overview without reaching for a scope; cached history offline; previous visit's rows shown with no spinner while re-reading; empty state; every name links to Show Info with no row menu; `#id` link text when unresolved.
- `employmentHistory.test.ts`: sorts newest first and credits current corp time since start; past corp credited the gap to next; empty list; only newest flagged ongoing; fetch+cache keyed by character; offline cache fallback.
- `employmentHistoryCsv.test.ts`: column order; corp name with id fallback; raw timestamp; tenure as whole days number.

## Interview Q&A

1. Why no re-auth state? Public endpoint, no status variant.
2. How is tenure computed? Gap to next-newer record; newest to load time.
3. When does "Current" show? Newest row and matches Dexie character corp (avoids mislabel when record lags).
4. Why no `/corp` link? Viewer usually lacks Corp Access; Show Info instead (#729).
5. How does the header stay public-safe? SP read skipped without `/skills`.
6. What is exported? Name, raw start, whole days.
7. What persists? Only ESI cache.
8. Default sort? Joined desc.

## Observed gaps

- Empty hint says "Reconnect" for a public endpoint.
- No search, totals or corp-count summary; no alliance history.
- Joined uses `toLocaleDateString()`, ignoring the app time-zone setting (`useTimeZone` used on Clones).
- `#id` names have no retry beyond Refresh.
- Active Character only; others via `/pilot-lookup`.

## Improvement ideas

- Career length / stint summary; explain public-data empty state.
