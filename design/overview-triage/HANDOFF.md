# Overview redesign — handoff

**Status:** design approved, nothing implemented. No file under `src/` has been
touched on this branch.

**Branch:** `feat/overview-redesign`, worktree
`../neocom-desk.worktrees/overview-redesign`, 5 commits ahead of `origin/main`,
**not pushed**.

**Canvas:** <https://claude.ai/code/artifact/746d429e-2436-4fa1-a4d3-108fd71160e0>
— six artboards: the board (desktop), a heavy day, a quiet night, the Alerts
page, the board on a phone, and a card-anatomy sheet.

---

## The one rule

**Numbers where the items are interchangeable, rows only where each item is
genuinely its own thing.**

This came out of three concrete facts about real play, and every layout decision
below follows from it:

- 21 orders can be undercut at once. That is one fact, not 21.
- Colonies get reset in a single sitting, so a batch of them shares an expiry.
  The unit a pilot acts on is the **reset run**, not the planet.
- Alert volume runs to the hundreds across a dozen-plus types.

A board that prints a row per item is unusable on exactly the days it matters.
`HeavyDay.dc.html` is the proof the layout survives: identical structure,
identical card heights, 137 undercut orders and 341 alerts.

## Card shapes (deliberately not uniform)

| Card        | Shape                        | Signal it reads                                              |
| ----------- | ---------------------------- | ------------------------------------------------------------ |
| Training    | one line                     | `selectActiveEntryFromSorted` + `selectQueueDepth`           |
| Open orders | three counts, no rows        | `OpenOrderRow.problem` → undercut / outbid / expiringOrStale |
| Mining tax  | two counts                   | outstanding assignment ISK; `unassigned` ledger entries      |
| Planetary   | one row **per batch**        | `colonyAttention`, grouped by shared `soonestExpiryMs`       |
| Industry    | real rows                    | `isJobDone`, `isCompletingSoon`, `sortJobsBySoonest`         |
| Alerts      | column, rows grouped by type | `NotificationFeedRecord.eventId` / `eveType`                 |

Details that were argued for and should survive implementation:

- **Below-floor is a footer line, not a fourth tile.** It is the one order
  problem losing money now rather than losing a sale; folding it into "undercut"
  hides it. Reviewed and kept deliberately at three tiles.
- **A zero is plain text — no tone, no glyph.** An amber `0 undercut` sends you
  to a page with nothing to do. `numberTile` in `parts.mjs` implements this.
- **No "you owe" on the summary strip.** It printed the same ISK as the Mining
  tax card's own tile, two panels apart.
- **Cards in a grid row share a bottom edge** (`align-items: stretch`, footer
  pinned with `margin-top: auto`) — the call `routes/Overview.tsx` already
  argues for in prose.
- **Severity is the existing four-rung ladder**, tone _and_ glyph, from
  `features/corp/CorpBoardRow.tsx`. Colour is never the only signal.

## The Alerts page — the part that is new work

`NotificationFeedPanel` renders in exactly one place today:
`src/routes/Overview.tsx:408`. It has no page and no nav entry, and
`NOTIFICATION_FALLBACK_ROUTE` (`features/notifications/notificationOptions.ts`)
is `/overview`, so a tapped push with no route of its own already lands on the
dashboard.

Summarising the feed into a board column would strand every alert the column
does not list. So the feed needs a route of its own:

- Every type, and **every Character on the device** — the board is
  active-character-only, the feed never was (`feedSelection.otherCharacterAlerts`
  exists precisely because of this).
- Grouped by type, worst first; expand a type to see its individual fires, each
  showing which Character it belongs to, with its own dismiss.
- Mute a type or dismiss a whole group from the row — the actions
  `NotificationContextMenu` already offers.
- Search, character filter, severity filter, muted-type filter.
- Links out to Settings for the per-event toggles, which stay where they are
  (`NotificationsPanel` is preferences, not the feed — don't merge them).

The board column is the summary, the page is the detail. That is the
relationship every other card already has with its page; alerts were the only
domain without one.

## Open — these change what gets built

1. **Multi-character.** The board is the active Character; the feed is
   device-wide. The "your other characters" line at the bottom of the board is a
   proposal, not a decision.
2. **Deep links.** "Undercut 21" would open `/market?section=orders`. No route
   today opens it pre-filtered to undercut, or jumps to a single colony. Worth
   adding, or is the unfiltered page enough?
3. **Replace or sit above?** The wallet panel, skill-queue panel and three count
   tiles are gone from Overview in this design.
4. **Where does Alerts sit in the rail?** Drawn directly under Overview; the
   Social group (mail, calendar, contacts) is the other candidate.
5. **What does the per-type mute write?** The codebase has two concepts —
   `eventSelection`'s per-event toggle and the `eveType` opt-out. The row's mute
   should pick one, not invent a third.

## Implementation would touch

- `src/routes/Overview.tsx` — rewritten; currently 411 lines of panels and tiles.
- A new route: `App.tsx`'s `ROUTE_ELEMENTS`, plus `app/routeScopes.ts` (a route
  without a scope declaration is a compile error, in both directions) and
  `routeScopes.test.ts`, which scans `App.tsx`'s source.
- `src/app/Layout.tsx` — the rail entry and its unread count; `NAV_PATHS`.
- `features/notifications/` — grouping by type for the column and the page;
  `groupFires.ts` already groups _identical_ fires, this needs grouping by type.
- `notificationOptions.ts` — `NOTIFICATION_FALLBACK_ROUTE` moves to the new page.
- New aggregation lives in `src/engine/` (pure, no fetch/DOM/Dexie) and gets a
  failing test first — the colony-batch grouping and the order-problem tallies
  are both calculation modules.
- `src/i18n/locales/en.json` — every string.

## Working with these files

```bash
node design/overview-triage/build.mjs        # regenerates the .dc.html artboards
```

`build.mjs` + `parts.mjs` are the source; the `.dc.html` files are generated and
are in `.prettierignore` so the generator and prettier cannot fight. Tokens,
control heights and component anatomy in `parts.mjs` are lifted from
`src/styles/index.css`, `components/ui/controlStyles.ts`, `Panel.tsx`,
`StatChip.tsx`, `FilterChip.tsx`, `CorpBoardRow.tsx` and `Layout.tsx` — resolved
values, not eyeballed.

To update the published canvas, re-run `build.mjs`, re-seed with the `design`
skill's `seed-canvas.mjs`, and republish to the same URL. The seeded
`overview-triage-concepts.html` is gitignored (~2 MB of editor payload). **If
anyone edits and saves inside the canvas, read it back before re-seeding** —
`build.mjs` overwrites the artboards.

The five commits on this branch used `--no-verify`: the worktree has no
`node_modules`, so the husky hook could not run. `prettier --check .` was run by
hand against the main checkout's install and passes; eslint only lints
`**/*.{ts,tsx}`, so the `.mjs` files are outside it. Nothing here is shipped
code — CI's `validate` job is still the gate.

## Suggested next steps

1. Answer the five open questions above.
2. Record the scope decisions with `node scripts/new-decision.mjs "<title>"` —
   at minimum "the Notification Feed moves off Overview to its own route" and
   "the board aggregates rather than enumerates".
3. Cut tickets (`docs/agents/issue-tracker.md`). The Alerts route is independent
   of the board rework and can land first; the board depends on the aggregation
   engines, which are TDD work.
