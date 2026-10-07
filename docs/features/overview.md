# Overview (triage board)

Route `/overview` (`src/routes/Overview.tsx`). Landing page for a signed-in Character: `Root` sends active-Character users here (`src/app/App.tsx:230`), first-ever login lands here (`Callback.tsx`). First of three Character-overview tabs (`OverviewSubNav`: Overview / Clones / Employment; see `clones.md`, `employment-history.md`). Page is UNGATED (`src/app/routeScopes.ts:95`); gating is per card because the page mixes skills, queue and wallet scopes.

| Feature | Where |
|---|---|
| Character header (portrait, name, corp/alliance links, SP) | `src/features/character/CharacterHeader.tsx` |
| Summary strip: next deadline, training, wallet, data age, refresh, edit cards | `src/features/overview/SummaryStrip.tsx` |
| 11 domain cards | `src/features/overview/cards.tsx` |
| Alerts column / folded line | `AlertsColumn` `cards.tsx:866` |
| "Everything else" folded card (phone) | `EverythingElseCard` `cards.tsx:969` |
| Edit cards popover (hide, drag reorder, show all, reset) | `CardPicker.tsx` |
| Severity, summary, layout, deadline model | `boardSeverity.ts`, `boardSummary.ts`, `boardLayout.ts` |

## Purpose and user goal

"Is there anything I must do before I log off." Numbers where items are interchangeable (orders, mining tax), rows only where each item is its own thing (industry jobs, one row per colony reset run). Every card links to the page that fixes it. Decisions: `20260907-153621-the-overview-becomes-a-triage-board-and-the.md`, `20260929-114130-overview-cards-can-be-hidden-by-the-pilot.md`, `20260929-145533-overview-cards-can-be-reordered.md`, `20260929-140431-six-more-overview-cards.md`, `20260925-203743-overview-contracts-row-feeds-next-deadline.md`. `docs/UX-REVIEW.md` (2026-08-29) predates the board; its Overview remarks are superseded.

Scope: active Character, except Alerts (device-wide feed), Structures and Moon extractions (the Character's corp via roles), and Mining tax (all Characters, see gaps).

## Controls

Layout order: `CharacterHeader`, `OverviewSubNav`, `SummaryStrip`, "all cards hidden" notice, card grid (+ alerts column from `xl`). Grid `sm:grid-cols-2`; from `xl` a `2fr/1fr` split; below `xl` alerts stack under cards (`Overview.tsx:812`).

Summary strip (`SummaryStrip.tsx`):
- Next deadline (largest type): soonest clock across visible cards plus skill-training finish; links to the owning page. Empty: "Nothing on a clock". Hidden cards contribute none (`soonestDeadline`).
- Training now: active skill, time left, queued count; links `/skills/plans`. Queue scope lapsed: warning "unavailable". Idle queue: warning link unless `characterNotTraining` is muted for that Character (then dim; issue #1731).
- Wallet: balance, links `/wallet`; scope lapsed or load error show warning text.
- Data age badge (stalest of wallet, queue, visible-card reads), Edit cards, Refresh (reloads all 12 snapshots incl. hidden; disabled while a visible card loads).
- Phone only (`md:hidden`): offline line when any read came from cache or is older than 1 h.

Cards (severity via `boardSeverity.ts`; unreadable = warning):

| Card (key) | Body | Links | Severity | Source (scope) |
|---|---|---|---|---|
| Open orders (`orders`) | Tiles Undercut, Outbid, Relist; footer below-floor count + slots used/max | Header `/market/orders`; each tile to Orders pre-filtered to that problem + this Character | critical: below-floor; warning: undercut/outbid; watch: expiring/stale | `loadOpenOrdersSnapshot` filtered to active Character; `esi-markets.read_character_orders.v1`; slot max from corrected skills |
| Mining tax (`mining`) | Tiles ISK unpaid, Unassigned; footer payees + oldest unpaid days | `/mining/tax` | warning if oldest unpaid >= 30 d; watch if unpaid or unassigned | `loadMoonMiningTaxSnapshot` all ledgers (`getCharacterMining`, `esi-industry.read_character_mining.v1`) |
| Contracts (`contracts`) | Tiles In progress, Due; deadline note | `/contracts/history?history.status=in_progress` | critical overdue; warning due soon | `loadContracts`; `esi-contracts.read_character_contracts.v1` |
| Planetary (`planetary`) | One row per reset batch (max 4), colony count | `/planetary-industry` | worst batch | `loadCharacterPlanets` + details; `esi-planets.manage_planets.v1` |
| Industry (`industry`) | Done summary + up to 4 running jobs | `/industry` | warning any job done; watch completing in <= 1 h | `loadCharacterIndustryJobs`; `esi-industry.read_character_jobs.v1` |
| Structures (`structures`) | Counts Reinforced, Low fuel, Services offline; worst rows | `/corp` | `corpCards.ts` | `esi-corporations.read_structures.v1` + `canReadStructures` |
| Moon extractions (`moonChunks`) | Drill count; next chunks | `/corp` | `moonChunkSeverity` | `esi-industry.read_corporation_mining.v1` + `canReadMoonExtractions` |
| Coming up (`comingUp`) | Up to 4 committed events | `/calendar` | watch within 24 h | `esi-calendar.read_calendar_events.v1` |
| SP extraction (`spExtraction`) | Tiles spare SP, extractors; threshold footer | `/characters` | watch when ready | skills read; settings |
| Mail (`mail`) | Unread count + up to 4 newest | `/mail` | watch if unread | `esi-mail.read_mail.v1` |
| Price alerts (`priceAlerts`) | Hit vs watched Quickbar targets (max 4) | `/market` | warning if crossed | Dexie `quickbars` + poller price snapshot; no scope |
| Alerts (column) | Up to 7 groups, Dismiss all, "N more"/"Open alerts" | `/alerts` | worst group | Dexie `notificationFeed` via `visibleFeedEntries` (muted excluded) |

Edit cards (`CardPicker.tsx`): popover (not a menu, to avoid clashing with drag keys). Rows: drag handle, checkbox, name; Alerts row checkbox-only. Drag by pointer (4 px travel) or keyboard (space, arrows, space; Esc cancels and the popover leaves Esc to the drag); live-region announcements. Footer: Show all cards, Reset order (when customised).

## Persistence and sync

- Synced settings: `sync.overviewHiddenCards`, `sync.overviewCardOrder` (string arrays; unknown keys kept; `moveCard` back-fills missing keys then `arrayMove`), `sync.spExtractionMonitoringEnabled`, `sync.spExtractionThresholdSp`.
- Dexie ESI caches per loader (Freshness Window 10 min, CONTEXT.md); `useRouteSnapshot` per-card keys `overview:*` so each card restores independently. SP summary seeded via `rememberSpSummary` for Clones/Employment headers.
- No URL state.

## States

Spinner until wallet snapshot, hidden-cards and card-order stores hydrate; no active Character -> `Navigate('/characters')`. Every card renders in every state: loading ("Checking..."), re-auth (dashes, warning, re-login footer), clear/empty (e.g. `industryIdle`, `mailEmpty`, `planetaryEmpty`), stale (strip badge, phone offline line). Only a pilot hide removes a card; corp cards stay absent until Corp Access is `ready` and the capability held (`Overview.tsx:566,587`) to avoid flicker. Wallet read error -> strip "load failed", other cards keep last cache. No rate-limit UI (ESI lane/budget live in `src/esi`).

Mobile: first 2 cards in pilot order stay full (`PHONE_FULL_COUNT`, `Overview.tsx:176`), rest fold into "Everything else", alerts leads the folded list; pilot order, not severity ranking. Strip cells wrap (128 px basis). Card "Open" link min-h-11.

## Scopes

Page ungated; see card table. Missing scope: that card goes warning with a re-login footer, strip cell shows "unavailable"; nothing is hidden.

## Formulas and thresholds

- Severity rank critical < warning < watch < clear; `worstSeverity` takes minimum (`src/engine/severity.ts`). `severityForRemaining`: null warning; <= 24 h critical; <= 3 d warning; <= 7 d watch; else clear.
- SP extraction (`engine/spExtraction.ts`): floor 5,000,000 SP; `extractable = max(0,total-floor)`; extractor = 500,000 SP; ready when extractable >= threshold (default one chunk); off monitoring = clear.
- Contracts (`engine/contractsBoard.ts`): counts accepted couriers where this Character is acceptor; deadline = courier deliver-by, falls back to offer expiry; overdue = deadline <= now; due soon = within 24 h (`LISTING_WINDOW_MS`); own outstanding non-corp listings count only in their last 24 h; soonest drives strip clock.
- Industry: completing soon = remaining in (0, 1 h] (`features/industry/jobs.ts`); next-job clock severity fixed watch.
- Mining tax warning age `MINING_TAX_WARNING_DAYS = 30`.
- Coming up: only `accepted`/`tentative` (`engine/calendarDeadline.ts`); watch if within 24 h.
- Queue: active entry = [start,finish) spans now, else earliest future (BUG #10); depth empty / paused / training (`overviewQueue.ts`).

## Tests (what they assert)

- `Overview.test.tsx`: 137 undercut orders render as one number; tiles link to Orders narrowed to what they counted; zero is plain text (no link, no tone); four colonies sharing a timer fold into one reset run; hero deadline leads and links to the owning card, drops minutes past a day; courier and accepted calendar events can lead, un-accepted events are ignored; every card renders on an idle Character; SP the queue finished is added to the header total.
- `boardLayout.test.ts`: grid follows pilot order with alerts in its own column; hidden cards drop without moving others; unreadable card omitted; unordered cards go last; phone full slots go to first cards in order regardless of urgency; soonest clock ignores hidden/unreadable cards.
- `boardSeverity.test.ts`: null until loaded; lapsed grant = warning; mining watch under threshold, warning at it; calendar watch within a day; SP extraction watch at threshold and never when monitoring off; mail watch if unread.
- `boardSummary.test.ts`: "checking" before load, login prompt instead of zero on lapsed grant, below-floor leads order summary, ISK owed compacted, worst planetary batch named.
- `cardOrder.test.ts`, `hiddenCards.test.ts`: default order, stored-first ordering, unknown keys kept, alerts never in order, drop-on-self no-op, hide/show toggles without mutation.
- `corpCards.test.ts`: reinforcement/fuel-3-days/offline counts; clocks shorter than cache window skipped; chunk severity.
- `priceAlertsBoard.test.ts`: only targeted Quickbar items; crossed when last polled price passes target; price withheld after target changed; crossed first.
- `SummaryStrip.test.tsx`: idle queue warns+links when alert enabled, neutral when muted; cached/older-than-hour note shown, nothing when fresh. `BoardCard.test.tsx`: one help affordance per card; owed ISK as `IskAmount`.

## Interview Q&A

1. Why a triage board? Decision `20260907-153621`; counts for interchangeable items, rows for distinct ones (`Overview.tsx:11-18`).
2. Why does every card always render? A vanishing card looks like a failed load (`Overview.tsx:20-24`).
3. How is Next deadline chosen? `soonestDeadline` over visible cards plus skill finish (`boardLayout.ts`).
4. Missing scope? Per-card warning + re-login footer; page ungated (`routeScopes.ts:90-95`).
5. Why is Alerts a non-reorderable column? Different volume class, device-wide (`Overview.tsx:461-466`, `cardOrder.ts`).
6. Phone layout? Two full cards in pilot order, rest folded; no severity reshuffle.
7. How does Orders stay cheap? Shared snapshot, no deep competition inputs, filter to active Character (`Overview.tsx:324-356`).
8. Which card is not per-Character? Mining tax (`features/overview/boardData.ts:149`).
9. How is hide/order synced? `createSyncedSetting`; keys above.
10. Idle-queue warning vs alert? Strip mirrors `characterNotTraining` mute so the two never disagree (#1731).
11. No active Character? Redirect to `/characters` (`Overview.tsx:399`).

## Observed gaps

- Mining tax card is all-Character but the header comment lists only alerts/structures/moon as exceptions (`features/overview/boardData.ts:149`, `Overview.tsx:26`).
- Rows capped at `ROW_LIMIT = 4` (`cards.tsx:80`) and alerts at 7 groups (`cards.tsx:876`); overflow is only a link.
- Hidden cards still fetch on load and refresh (`Overview.tsx:752`).
- SP extraction card has `loading: false` always.
- Board omits `deepCompetition`/`structureCompetition` the Orders page uses (`Overview.tsx:338-345`), so its counts come from narrower input.
- One Refresh for all 12 snapshots; no per-card refresh.

## Improvement ideas

- Per-card refresh and age; skip fetching hidden cards; inline "show N more"; label or scope the Mining tax card; loading state and deep links for SP/Mining/Contracts tiles.
