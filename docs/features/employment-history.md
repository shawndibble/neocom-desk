# Employment History

Route `/employment-history` (`src/routes/EmploymentHistory.tsx`). Third tab of the Character overview; sub-view of Overview in nav (`src/app/navDestinations.ts:118`). UNGATED: public endpoint (`src/app/routeScopes.ts:126`).

| Feature                                                                         | Where                                                            |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Shared header + sub-nav                                                         | `CharacterHeader`, `OverviewSubNav`                              |
| Summary figures, then the career timeline (also the Public Info Employment tab) | `EmploymentSummaryChips`, `EmploymentTimeline`                   |
| CURRENT / RETURNED / SHORT STAY words                                           | `EmploymentTimeline`, flags from `deriveEmploymentHistoryRows`   |
| Corporation name = Show Info link                                               | `CorporationLink`                                                |
| Data age (beside the name), Refresh and Export (beside the bell)                | `CharacterHeader` `aside` / `actions`, `employmentHistoryCsv.ts` |

## Purpose and user goal

See the active Character's corporation history and time spent in each.

- **Top jobs (ranked):** 1. "Which corps has this Character been in, and for how long?" 2. "What is that corp?" (Show Info).
- **Device and cadence:** desktop primary (owner, 2026-10-11); occasional; a sub-view of Overview reached from its tabs (`src/app/navDestinations.ts:113`), not a rail or tab-bar item. No phone-specific evidence.
- **Above the fold:** the summary figures and the timeline, newest first, with the Current badge.
- **Not for:** another pilot's history (Pilot Lookup / Public Info, `20260930-104922`).
- **Sources:** owner, 2026-10-11 (desktop primary, phone for one-off lookups); `20261005-211423`, `20260930-104922`; #30, #729.
- **Unconfirmed:** cadence; why a pilot checks their own history (e.g. a recruitment check).

### Mobbin brief

- **Fit:** high: a work-history list is a generic pattern.
- **Analog apps:** LinkedIn, Glassdoor, Indeed.
- **Screen queries:**
  - `web: work history list of organisations newest first with start date, tenure and a current badge`
  - `ios: profile experience section with organisation logos, dates and time spent at each`
- **Flow queries:** none.
- **Mobbin won't help with:** nothing notable.

## Controls

- No sorting: the timeline is always newest first. The panel has no title bar (the tab above names it); the data age sits beside the pilot's name and Refresh and Export sit level with the alerts bell at its size (`20261014-081757`).
- A stint's date range shows once: the gutter beside the rail from `md` up, under the name below `md` (the Public Info modal always shows it under the name, `20261014-075140`).
- Corporation name opens Show Info (public info modal); never links to `/corp` (viewer may lack Corp Access).
- Refresh, data-age badge, export (CSV/XLSX/copy), all in the header. Dates are "Mon YYYY" in UTC (`monthYear`); tenure is `formatTenure` ("2y 3mo").
- "Current" chip and the filled rail dot only if ongoing AND `character.corporationId` equals it. RETURNED = the corp appears in an earlier record; SHORT STAY = a finished stint under 14 days.
- CSV: Corporation, Joined (raw ESI timestamp), Duration (days, `floor(sec/86400)`); surface `employment-history`.

## Persistence / sync

ESI cache key `employment-history`; route snapshot key same. Nothing user-set, nothing synced, no URL state.

## States

Spinner (first load) -> `Navigate('/characters')` if no active Character -> load error -> empty (no data or zero rows: "No employment history cached / Reconnect...") -> summary + timeline (+ offline warning line if from cache). Previous visit's rows render immediately while re-reading.

## Scopes

None: `getCharacterCorporationHistory` is `PUBLIC`; loaded with `loadWithCache` (no auth status). The page draws no SP and never reads `/skills`. Corp names via `resolveNames` (cache then ESI; `#id` fallback).

## Formulas

`deriveEmploymentHistoryRows(entries, now)`: sort by `start_date` desc; tenure = (next-newer record start, or load time for the newest) - start, clamped >= 0; `ongoing` only index 0; `returned`, `shortStay` (never the ongoing stint) and `tenureRatio` (against the longest). `deriveEmploymentSummary(rows, now)`: time in game, distinct corporations, current tenure, longest stay (a tie goes to the more recent).

## Decisions

`20261005-211423-employment-history-corporation-names-link-to-show-info.md` (row menu removed; amends round 49 `20260904-162201`); `20261014-075140` (career timeline); `20261014-081757` (controls in the header, no SP, no title bar); `20260930-104922` (other pilots via `/pilot-lookup`).

## Tests (what they assert)

- `EmploymentHistory.test.tsx`: most-recent first with resolved names and no granted scope; badge on ongoing row only when it matches the character record, none when corp differs; header with data age, Refresh and export, no SP, and no scope reached for; date range shown once (md-only gutter vs under-name); cached history offline; previous visit's rows shown with no spinner while re-reading; empty state; every name links to Show Info with no row menu; `#id` link text when unresolved.
- `employmentHistory.test.ts`: sorts newest first and credits current corp time since start; past corp credited the gap to next; empty list; only newest flagged ongoing; fetch+cache keyed by character; offline cache fallback.
- `employmentHistoryCsv.test.ts`: column order; corp name with id fallback; raw timestamp; tenure as whole days number.

## Interview Q&A

1. Why no re-auth state? Public endpoint, no status variant.
2. How is tenure computed? Gap to next-newer record; newest to load time.
3. When does "Current" show? Newest row and matches Dexie character corp (avoids mislabel when record lags).
4. Why no `/corp` link? Viewer usually lacks Corp Access; Show Info instead (#729).
5. How does the page stay public-safe? It reads no SP and no scope.
6. What is exported? Name, raw start, whole days.
7. What persists? Only ESI cache.
8. Sorting? None: newest first.

## Observed gaps

- Empty hint says "Reconnect" for a public endpoint.
- No search; no alliance history.
- `#id` names have no retry beyond Refresh.
- Active Character only; others via `/pilot-lookup`.

## Improvement ideas

- Explain the public-data empty state.
