# Alerts and notifications

Route `/alerts` (`src/routes/Alerts.tsx`): the record of every alert this device has fired, device-wide, grouped by type. Distinct from Settings > Notifications (`src/features/notifications/NotificationsPanel.tsx`), which holds preferences. UNGATED (`src/app/routeScopes.ts:89`): Dexie only; rows were written by the Foreground Poller or a Web Push. Primary nav group, mobile tab (`navDestinations.ts:126`); global shortcut `A`.

| Feature                                                           | Where                                                |
| ----------------------------------------------------------------- | ---------------------------------------------------- |
| Grouped list, expand per fire                                     | `Alerts.tsx`, `AlertGroupRow.tsx`, `alertGroups.ts`  |
| Search, Character filter, severity chips, Muted chip (URL-backed) | `alertsFilter.ts`, `Alerts.tsx:94,275-318`           |
| Mute/unmute type (feed channel only)                              | `AlertGroupRow.tsx`                                  |
| Dismiss one / type / all                                          | `feedSync.ts dismissFeedEntriesAndSync`              |
| Row click-through                                                 | `notificationUrlForSubject` (`notificationClick.ts`) |
| Unread badge (rail, app icon)                                     | `useUnreadAlertCount.ts`, `appBadge.ts`              |
| Delivery, preferences                                             | `notifications.md`                                   |

## Purpose and user goal

See everything that fired, including for Characters you were not looking at (`Alerts.tsx:11-15`), and un-mute a type without going to Settings. Overview shows a summarised column (`overview.md`).

## Controls

- Header: "Notification settings" link (to Settings notifications tab), "Dismiss all" icon (only when unmuted entries exist; focus then goes to a surviving muted row or the panel heading).
- Banner `alerts.feedOff` when master switch or feed channel is off: stored rows still listed, nothing new added. Page returns `null` until preferences hydrate.
- `FilterBar`: search (type label, title, body; case and space insensitive); Character `Select` (All or one; filters entries before grouping); severity chips watch/warning/critical with live counts (`clear` has no chip: it is the bulk and narrows nothing); "Muted types" chip with count. Active count = query + character + severities + muted.
- Group row: caret (`aria-expanded`), severity icon + count, label (one line, "Muted" tag only if muted for every Character it fired for), mute toggle (`aria-pressed`), dismiss-type x. Expanded fire row: body (link), age (hover = timestamp), Character pill when more than one Character exists, dismiss x; "Approximate time" tooltip on a provisional market fill (`fillTimeSettle.ts`: time is when noticed, exact time comes from wallet transactions, updated hourly).
- Focus after removal (WCAG 2.4.3): next row, previous row, then panel heading (`focusAfterRemoval`).
- Click-through: `?character=<id>` in the link; `AlertCharacterSwitch` (`src/app/AlertCharacterSwitch.tsx`) activates that Character, drops the param, announces "Switched to {name}". Tapped push: `notificationClick.ts` focuses an open window, only opens one if none.

## Persistence and sync

- URL (ADR 0015): `query`, `characterId`, `severities`, `showMuted`.
- Dexie `notificationFeed` rows: Occurrence Key id, `characterId`, `eventId`, optional `eveType`, `subjectId/typeId`, title, body, `firedAt`, `dismissedAt`. Dismiss is a flag; merge keeps max `dismissedAt`, min `firedAt` (`mergeFeedRecord`).
- Cap 300 local rows (`NOTIFICATION_FEED_LIMIT`); sync window 30 days / 100 rows (`FEED_SYNC_WINDOW_MS`, `FEED_SYNC_WINDOW_MAX_ROWS`, `feed.ts:55-61`), equal to the backend purge constant. Dismissals push on dismiss (`feedSync.ts`; decision `20260912-125743-alert-dismissals-push-on-dismiss-a-visible-tab.md`); the service worker cannot sync.
- Removing a Character deletes its rows and refreshes the badge (`removeCharacter.ts`).
- Preferences (master switch, channels, thresholds): `notifications.md`.

## States

Empty: "No alerts yet" + hint; filtered-empty: `noMatches` + "Reset filters" (only when filters active). Footer: "This device keeps the last 300 alerts, and syncs 30 days of them between your devices." Mobile: label one line; fire row stacks pill + age above body (CSS `order`, single DOM nodes).

## Scopes

Page needs none. Each event is polled only when its scope is granted (`hasEventScope`, `events.ts:266`); missing scope rows in Settings show "Needs the {permission} permission" + Grant (or re-authorize hint for Core Grant scopes); corp events also need an in-game role (`corpCapability`).

## Formulas and thresholds

Group order: severity worst first, then newest fire (`compareGroups`). Severity per type (`alertGroups.ts`): critical = structure under attack/shields or armor lost/destroyed, orbital attacked/reinforced, corp kicked; warning = fuel/reagents, power, services offline, bills, war declared, `characterNotTraining`, `skillQueueEnding`, `structureFuelLow`, `corpWalletThreshold`, `planetaryExtractorExpiring`, `courierDeliveryDue`, `contractFailed`, `marketOrderUndercut`; watch = skill level done, industry job, clone jump ready, SP extraction, planetary extraction done, contract accepted, calendar, new mail, corp member joined/left, corp industry job; clear = market order filled, wallet changed, price alert, contract completed. Unlisted types floor at watch.

Event catalog, Foreground Poller, Scheduled Push, permission explainer and Settings > Notifications panel: see `notifications.md` (single source). Poll interval is 5 min (`foregroundPoller.ts:59`), first poll 10 s after mount.

## Decisions

`20260908-123516-an-alert-lands-on-its-row-not-just.md`, `20260912-125743-...`, `20260925-094242-settings-notifications-order-and-collapsible-all-characters.md`, `20260903-155950-the-corp-ops-board.md`, `docs/adr` 0007, 0009, 0010 (push), 0001 (tokens).

## Tests (what they assert)

- `Alerts.test.tsx`: many fires of a type collapse to one row with count; EVE notifications key by their own type; worst type first regardless of arrival order; severity stated in text; expanded fires name Characters; provisional fill marked only on the one fill; dismissed fires omitted; Reset filters restores list and is absent with no alerts; muted type hidden until chip; mute applies to every Character it fired for; dismissing a collapsed row dismisses all its fires; Character filter excludes others from counts.
- `alertsFilter.test.ts`: pass-through when empty; muted hidden until asked; query matches type name and alert text, case/space insensitive; empty severity set = all; severity applies to muted rows once shown; active count counts values not controls.
- `alertGroups.test.ts`: keying (eveType vs eventId), count, severity sort then newest tie-break, entries newest-first, characterIds, structure loss above bill, filled order/price alert = news, undercut = fault.
- `feed.test.ts`: cap trims oldest; sync window 30 days inclusive boundary, 100 row cap; same occurrence twice = one row; earliest `firedAt` wins whichever observer arrives first; a just-written back-dated row is not trimmed.
- `feedSync.test.ts`: dismiss locally and push once per Character; nothing for empty dismissal.
- Poller, push handler and click tests: `notifications.md`.

## Interview Q&A

1. `/alerts` vs Settings? Record vs preferences (`Alerts.tsx:17`).
2. Why device-wide? Poller runs for all Characters (`Alerts.tsx:11-15`).
3. Order and severity? Severity then newest; unlisted floors at watch because filing unknowns as clear is the wrong failure.
4. Why can you un-mute here? A feed row's mute is one-way from a vanishing row (`Alerts.tsx:163-168`); group muted only if muted for all its Characters.
5. Cross-device dismissal? `dismissedAt` max-merge + push on dismiss.
6. Retention? 300 local, 30 d / 100 rows synced.
7. Channel off? Banner; rows stay; badge uses the same visibility rule.
8. Tapping an alt's alert? `?character=` + `AlertCharacterSwitch`.
9. Why approximate fill time? Poll noticed it; wallet transactions give the exact time hourly.

## Observed gaps

- `/alerts` "Dismiss all" dismisses all unmuted entries for the chosen Character even when search/severity filters hide some (`Alerts.tsx:170-189,222-235`); the Overview column's has a different scope, same label.
- Settings feed copy still says Overview: `en.json:7726` `feedChannelLabel` "Overview notifications", `:7727` "A dismissible list on the Overview page", `:7734,7744,7752,7766` toggle labels; `appBadge.ts:2,23` "Overview feed". The feed lives on `/alerts`.
- Decision `20260903-155950-the-corp-ops-board.md:27` says ten minutes; poller is 5 minutes.
- No date filter, sort control, "dismiss older than", or undismiss.
- Corp, fill and undercut events are foreground-only; the Alerts page does not say so.
- Retention (300) not user-configurable.

## Improvement ideas

- Make Dismiss all respect visible filters or relabel; add date range/sort; fix Settings copy to "Alerts"; quiet hours; configurable retention; update the corp-ops decision note.
