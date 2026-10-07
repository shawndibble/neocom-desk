# Calendar

`/calendar` (nav: Social group, phone tab). The Character's "Coming Up" surface: the in-game calendar events plus every other clock the Character can read (skill queue, industry jobs, PI extractors, moon chunks, contracts, market orders, optional projected skill plan), shown as a **Calendar Map** (grid) beside the **Coming Up Rail** (list). Replaced the old Month/Week/Agenda tabs (scope decision `20260907-123312-calendar-becomes-the-characters-coming-up-surface`).

Code: `src/routes/Calendar.tsx`; `src/features/character/{calendarBoardData,calendarBoardSources,calendar,calendarMoonChunks,calendarSkillPlan,calendarKindFilter,calendarKindLabels,calendarViewPref,calendarWeekStart,calendarCsv,calendarResponseTone}.ts`; components `CalendarMap`, `CalendarDayTicker`, `ComingUpRail`, `CharacterBoardRow`, `CalendarKindFilterMenu`, `EventDetailModal`, `EventContextMenu`; engine `src/engine/character/{board,deadlines,calendarRetention}.ts`; grid math `src/lib/calendarGrid.ts`; export `src/lib/calendarExport.ts`.

## Summary

| Feature               | What                                                                                             | Where                                       |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Calendar Map          | 7-col grid of day buttons, count + kind dots per day; Month (42 cells) or Fortnight (14) density | `CalendarMap.tsx`, `Calendar.tsx:~330`      |
| Day Ticker            | Phone replacement: horizontally scrolling rolling 14 days from anchor                            | `CalendarDayTicker.tsx`                     |
| Coming Up Rail        | List grouped by day (sticky headings, Today/Tomorrow), sorted by deadline                        | `ComingUpRail.tsx`                          |
| Day select            | Click a day to filter the rail; click again or "Show all days" to clear                          | `Calendar.tsx:selectedDayMs`                |
| Period nav            | Prev / Today / Next (month or fortnight; phone steps 14 days), URL `anchor=YYYY-MM-DD`           | `Calendar.tsx:step`                         |
| Density toggle        | Month / Fortnight, device-local, desktop only                                                    | `useCalendarDensity`                        |
| Event types filter    | Checkbox menu per kind with counts, legend swatches, "Show all types"                            | `CalendarKindFilterMenu.tsx`                |
| Skill plan projection | Choose one Skill Plan per Character to project its steps onto the board                          | `calendarSkillPlan.ts`                      |
| Event detail modal    | Opens for calendar events: time, text, RSVP, export                                              | `EventDetailModal.tsx`                      |
| RSVP                  | Accept / Decline / Tentative (ESI write)                                                         | `respondToCalendarEvent`                    |
| Add to calendar       | `.ics` download, Google Calendar URL                                                             | `EventDetailModal.tsx`, `calendarExport.ts` |
| CSV export            | Calendar events only: date, title, response                                                      | `calendarCsv.ts`, `TableActionsMenu`        |
| Row context menu      | Calendar event rows: Copy event ID                                                               | `EventContextMenu.tsx`                      |
| Contract row link     | Contract expiry rows link to `/contracts/history?highlight=<id>`                                 | `CharacterBoardRow.tsx`                     |
| Week start            | Monday or Sunday, Settings > Display                                                             | `calendarWeekStart.ts`, `Settings.tsx:1057` |
| Refresh / Data Age    | Header refresh icon; badge = oldest source fetch time                                            | `Calendar.tsx:~355`                         |

## Page structure and states

- Route `/calendar`, no tabs. Ungated at route level (`routeScopes.ts:212`): each source fails on its own; no page-wide re-login banner. Redirect to `/characters` with no active Character.
- Loading with no data: spinner. Load error: `EmptyState`.
- From cache: amber offline line.
- Sources refused (401/403 / `needsReauth`): single amber line "needs login: <kind names>" above the panes, and the filter menu marks each as "Not granted".
- Rail empty states: no kinds selected ("no kinds" hint), nothing upcoming, nothing on the selected day.
- Desktop (`md+`): Map panel (38rem wide, titled "Calendar", period controls in panel actions) + rail side by side. Phone (`isNarrow`): one panel with period label, controls and the Day Ticker; the rail below. Past-day hint caption under both.

## Board sources (what lands on the map and rail)

Eight kinds, sorted by deadline then kind rank then id (`buildCharacterBoard`). Hue per kind (`kindTone`), glyph per kind (`CharacterBoardRow`).

| Kind (label)                    | Deadline                                                                              | Source / loader                                    | Scope                                                                                                                                |
| ------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `calendarEvent` Calendar events | `event_date`; shows response and "Important" (importance > 0); past = "Started"       | `GET /characters/{id}/calendar` (<= 50 from now)   | `esi-calendar.read_calendar_events.v1`                                                                                               |
| `skillTraining` Skill queue     | each entry's `finish_date`                                                            | skill queue                                        | `esi-skills.read_skillqueue.v1`                                                                                                      |
| `industryJob` Industry jobs     | `end_date` of active/ready jobs; past = "ready to deliver"                            | industry jobs                                      | `esi-industry.read_character_jobs.v1`                                                                                                |
| `planetExtraction` Planets      | each extractor pin `expiry_time` (cached colony details only)                         | planets                                            | `esi-planets.manage_planets.v1`                                                                                                      |
| `moonChunk` Moon chunks         | chunk arrival, then natural decay if not fractured                                    | corp mining extractions (+ structures for names)   | corp scope `esi-industry.read_corporation_mining.v1` and Corp Capability `canReadMoonExtractions`; menu row hidden when not readable |
| `contractExpiry` Contracts      | active contracts: courier delivery deadline, else `date_expired`; type + route detail | contracts (+ location names for untitled couriers) | `esi-contracts.read_character_contracts.v1`                                                                                          |
| `orderExpiry` Market orders     | `issued + duration` days; buy/sell detail                                             | orders                                             | `esi-markets.read_character_orders.v1`                                                                                               |
| `skillPlan` Skill plan          | projected completion of un-queued plan steps; tagged "Projected"                      | chosen Skill Plan from Dexie + schedule            | none (local)                                                                                                                         |

Overdue rows show a kind-specific past label ("overdue" / "Started" / "ready to deliver") instead of a countdown. Countdown reads "due in <duration>".

## Calendar Map and Day Ticker

- Each day cell is a button (`aria-pressed`, label like "<date> - N due: <kinds>" or "nothing due"); shows day number, count, and a dot per kind present. Today ring, selected tint, out-of-month tint, hatched past days with no load.
- Plain grid of buttons, not `role="grid"` (a11y decision in code comment). No arrow-key grid navigation; each cell is its own tab stop.
- Weekday header row hidden from AT. Week alignment from `weekStart` (monday default). Fortnight density = 14 days containing the anchor, week aligned. Month = 42-cell grid.
- Ticker cells (phone): weekday + date + one segment per kind + count; today labelled "Today"; scrolls horizontally.
- "Today" button resets anchor and clears the day selection. Prev/Next label switches between month and fortnight; anchor lives in URL `anchor` (invalid date -> today; equals today -> param omitted). Two quick clicks step from each other (anchor ref).

## Coming Up Rail

- Title "Coming Up", count in meta, "Show all days" when a day is selected.
- Day groups: heading "Today · Tue 6 Oct" / "Tomorrow · ..." / short date, with item count; `ul aria-label`.
- Row (`CharacterBoardRow`): kind glyph, countdown, optional "Projected"/"Important" tags, response label (calendar events: accepted/declined/tentative/not responded, colour-toned), subject, time of day, kind label, detail.
- Only calendar-event rows are buttons (open detail modal). Contract rows are links to the contract history row. Every other kind is read-only text.
- No forward window cap: everything each source returns is on the board.

## Event types filter menu

- Filter icon button in header; label shows "(N hidden)" and `pressed` when any are hidden. Menu: heading "Event types", one `DropdownMenuCheckboxItem` per kind (swatch legend + label + count), counts come from the unfiltered board; replaced by "Not granted" / "Unavailable" / "Choose a plan" / "Could not be scheduled" where applicable. Menu stays open on toggle.
- Hidden kinds are persisted in Dexie `calendarHiddenKinds` (stores what is hidden so new kinds default visible). Device-local.
- "Skill plan to project" section: one checkbox per Skill Plan of the Character (select again to clear), "No Skill Plans for this character" empty note, error reason if scheduling fails. Choice stored per Character in `calendarSkillPlanByCharacter`; choosing triggers a reload.
- "Show all types" button (disabled when none hidden).

## Event detail modal (calendar events only)

- `Modal` titled with the event title. Loads `GET /characters/{id}/calendar/{event_id}`. States: spinner; needs-reauth (`GrantBanner` for `getCharacterCalendarEvent`); failed (retry button); ready.
- Ready: kind-colour bar, local date-time (`formatCalendarTimestamp`), "Important" when importance > 0, body text (EVE markup stripped).
- Your response: three toggle buttons (Accept success tone, Decline danger, Tentative warning), `aria-pressed`, disabled while saving; "not responded" badge only while unanswered. Failure: inline `role="alert"` "rsvpFailed". 401/403 on write raises reauth (`putCharacterCalendarResponse`).
- RSVP effect: ESI `PUT .../calendar/{event_id}/` (`esi-calendar.respond_calendar_events.v1`, base grant); patches cached events, seen-events and detail rows; page keeps a local override until a snapshot that started after the RSVP replaces it.
- Export: "Download .ics" (file `<eventId>.ics`, UTC, description = stripped text, duration) and "Add to Google Calendar" (opens prefilled URL in new tab, `noopener`). No location (ESI has none).

## Retention rule for started events

ESI drops an event the moment it starts. `loadCalendarEvents` keeps previously seen events in a second cache row (`calendar:seen`) and retains an already-started event until the end of its local day or 6 hours after start, whichever is later (`engine/character/calendarRetention.ts`); an upcoming event missing from a fresh read is treated as deleted. Summary cache row is 2-minute fresh.

## CSV export

`TableActionsMenu` in header (`surface: 'calendar'`). Columns: Date (`event_date` as given), Title, Response (localised). Rows = raw calendar events in ESI order (including started ones kept by retention, with RSVP overrides applied); not the merged board, not filtered by kind or day.

## Preferences (all device-local Dexie settings, none synced)

| Setting key                                                                     | Control                             |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| `calendarView` (`month`/`fortnight`; legacy `week`->fortnight, `agenda`->month) | density icon button                 |
| `calendarHiddenKinds`                                                           | filter menu                         |
| `calendarSkillPlanByCharacter`                                                  | filter menu                         |
| `calendarWeekStart` (`monday`/`sunday`)                                         | Settings > Display "Week starts on" |

## Related

- Notification Events `newCalendarEvent` (high-water mark on event id) and `calendarEventStarting` (event start newly in the past); both route to `/calendar`; the latter is a Scheduled Push event. See `notifications.md`.
- Overview "next deadline" counts accepted/tentative calendar events (decision `20260927-070249`).
- Glossary: Calendar Map, Coming Up Rail.

## Observed gaps

- Past is not browsable: ESI returns only upcoming events and the cache only keeps what this device saw before start; past days with nothing hatch.
- ESI cap of 50 calendar events and 50 queue entries bounds the board; no paging.
- No search, no sort, no per-item actions on non-calendar rows except the contract link; skill, job, extractor, moon-chunk, order rows are not links.
- CSV covers calendar events only, ignoring kind/day filters and all other clocks.
- Day-grid is not keyboard-navigable as a grid (each cell is a tab stop; up to 42).
- Time zone setting (Local/EVE) is deliberately not applied to the Calendar grids (local-day buckets); event detail shows local time.
- Moon chunk kind needs corp scope + role and is silently hidden from the menu without them.
- Week-start lives in Settings, not on the page; density is hidden on phone.
- Event detail has no "open in game", no invitee list, and no location (ESI limitation).
- FAQ/Help panels do not mention Calendar.

## Persistence and sync

| State                                                              | Storage                                                            | Synced?                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `anchor` (shown month/fortnight start)                             | URL query, omitted when = today at mount (ADR 0015)                | no                                                                                      |
| Density, hidden kinds, week start, skill-plan choice per Character | Dexie `settings` keys listed above                                 | no (device-local; decision `20260926-204446-calendar-week-start-day-is-a-device-local`) |
| Selected day, open event, RSVP overrides                           | React state                                                        | no                                                                                      |
| Events, seen events, event detail                                  | Dexie `esiCache` rows `calendar`, `calendar:seen`, `calendar:<id>` | no                                                                                      |

## Test-covered behaviours

`src/routes/Calendar.test.tsx` (page): moon chunk on board for a Character who can read extractions (:219); no extractions request and no moon row without the corp role (:227); map and rail shown together (:245); shown month kept in URL and restored (:253); garbage `anchor` falls back to today (:269); another clock source merges into the list (:278); day names the kinds landing on it, not a severity (:299), same on the Day Ticker (:322); other clocks keep rendering when one source is forbidden (:347); event detail opens from a calendar row (:363); RSVP reflected in rail without refetch (:378); fresh reload overrides the earlier local RSVP (:399); hiding a kind from the filter menu is remembered (:413); message when every kind deselected (:426); "nothing coming up" when all sources are empty (:445).

`features/character/calendar.test.ts` (loader, RSVP): fetch+cache (:29); offline cache fallback (:47); needsReauth on 403 with nothing cached (:63); event ESI dropped after start kept until its local day ends (:86); unparseable-date event kept (:116); seen row not rewritten when unchanged (:132); late-evening op carried past midnight then dropped after its run (:153); event vanished before start dropped as cancellation (:178); re-login state left alone when nothing readable (:196); `calendarEventStarting` fires for an event ESI dropped as it began (:228); retained event not re-announced as new (:269); event detail cached per-event key (:308); detail needsReauth on 403 (:330) vs plain failure offline (:340); RSVP PUTs `{response}` (:350), resolves true (:364), resolves false on failure (:375), signals reauth banner on 401/403 (:385) but not on network error (:402); patches list + seen caches (:417) and detail cache (:462); leaves caches alone when write fails (:494).

`calendarBoardSources.test.ts`: skill-plan rows dated startDate+cumulative seconds (:40), queued steps dropped (:52), empty list not undefined (:61); calendar sources carry RSVP and importance flag (:76), any non-zero importance important (:92), unparseable date dropped (:97); skill training names skill+level (:112), paused queue dropped (:124), keyed by queue position (:129); jobs name product else blueprint (:159), only active/ready kept (:171), detail cleared once past (:192) else status (:197); PI one program per extractor pin (:215), non-extractors ignored (:222), no program ignored (:231); moon chunk counts to arrival (:249) then decay (:255), drills distinct (:261); contract title/type label/route precedence (:289-307), only open contracts (:312), accepted courier = acceptance+allowed days (:329), may outrun offer expiry (:346), unaccepted courier uses offer expiry (:362), non-courier uses offer expiry (:371); orders expire at issued+duration days (:428), buy/sell detail (:433), bad issue date dropped (:438).

`calendarCsv.test.ts`: column order date/title/response (:19); `event_date` raw ISO (:28); response uses the list's translations (:36). `calendarKindFilter.test.ts`: shows all when none hidden, complement of hidden, unopinionated kind shown, can show nothing, toggle hide/show (:6-42). `calendarWeekStart.test.ts`: default monday, persists under `calendarWeekStart`, applies on hydrate, invalid stored value falls back (:15-31).

`engine/character/board.test.ts`: merges sources by deadline (:38); absent = empty source (:56); signed remaining time orders overdue (:65); ties by kind then id (:83); plan step last at tie (:97); only plan steps projected (:107); past-deadline word per kind (:119); RSVP/importance only on calendar events (:127); ids namespaced by kind (:142). `calendarRetention.test.ts`: keep started-today (:13), drop after local day (:18), late-evening kept at 01:00 (:30) and dropped after run (:36), early event not extended (:42), pre-midnight start dropped (:53), still-listed never retained (:60), not-yet-started vanished = cancellation (:65), starting exactly now kept (:71), ids once in seen order (:75), nothing when none seen (:84). `deadlines.test.ts`: local-day floor incl. non-24h day (:27,:38); counts per day (:47); kinds once in board order (:70); all kinds per day (:95); day grouping keeps order (:126); empty board (:145); Today/Tomorrow only (:151), calendar days not rolling 24h (:162); kind filter keeps order (:186), none selected -> nothing (:197); counts per kind (:203).

## Interview Q&A

1. **Why a map + rail instead of month/week/agenda tabs?** ESI returns up to 50 events from now only and the cache replaces its row, so month grids spent most cells on days that cannot hold anything and paging back always said "No events"; grid became a map, list always beside it (`Calendar.tsx` header comment, decision `20260907-123312`).
2. **How are items ordered?** Deadline ascending, then `KIND_RANK` (order of `CHARACTER_BOARD_ITEM_KINDS`: calendarEvent, skillTraining, industryJob, planetExtraction, moonChunk, contractExpiry, orderExpiry, skillPlan), then id string compare (`engine/character/board.ts:140,212-226`).
3. **Why doesn't the page show a page-level re-login banner?** Eight independent sources; one revoked scope must not blank the others. Route is `UNGATED` (`routeScopes.ts:212`); refused sources are listed in an amber line and marked "Not granted" in the filter menu (`calendarBoardData.ts` `reauthKinds`).
4. **What happens to an event the moment it starts?** ESI drops it; `withStartedEventsRetained` keeps it from the `calendar:seen` row until `max(end of its local day, start + 6h)` (`calendarRetention.ts:52-55`, `calendar.ts` merge); upcoming events missing from a fresh read are treated as deleted. Summary freshness 2 min (`calendar.ts:135`).
5. **How does RSVP avoid flicker or being overwritten by a stale snapshot?** After the PUT it patches caches and records `{response, atMs}`; an override applies while `data.loadedAtMs <= atMs`, i.e. any snapshot that began loading before the RSVP; a later snapshot is trusted (`Calendar.tsx:~190-205`).
6. **Why store hidden kinds instead of shown ones?** A new kind added later would be absent from existing stored "shown" arrays and arrive switched off; as exclusions it shows on day one; unknown stored kinds are dropped (`calendarKindFilter.ts`).
7. **Why does the phone use a 14-day ticker?** A month grid on a phone puts six weeks of scroll before today; the ticker is a rolling 14 days from the anchor (`Calendar.tsx:102`, `buildDaysFrom`); density toggle exists only for the wide grid.
8. **What is "Projected"?** Un-queued steps of the chosen Skill Plan scheduled from `startDate + cumulativeSeconds`, excluding steps already in the queue (`calendarBoardSources.ts` `toSkillPlanSources`); tagged `Projected` via `isProjectedKind`; plan error surfaces in the menu, not as a page error.
9. **How are contract deadlines computed?** Active contracts only; courier uses `courierDeliveryDeadlineMs` (accepted + days to complete) else `date_expired`; untitled couriers named "start -> end" via location lookups (`calendarBoardSources.ts`, `calendarBoardData.ts:loadCourierRouteNames`).
10. **When does a moon chunk show?** Only when `resolveCorpReadAccess` says `canReadMoonExtractions`; before arrival the deadline is chunk arrival with detail "arrives", after it natural decay with "decays if not fractured" (`calendarMoonChunks.ts`, `toMoonChunkSources`).
11. **Why are grid days hatched?** Day before today with no load: no new calendar event can land there, though overdue items still show (`pastHint`, `CalendarMap.tsx`).

## Improvement ideas

- Keep an own history of seen events so past days can be browsed with a "partial" marker.
- Make non-calendar rows link to their pages (Skills queue, Industry job, PI colony, Orders).
- Export the merged board (ICS feed of all clocks) and apply kind filter to CSV.
- Arrow-key grid navigation; keyboard shortcuts for prev/next/today.
- Put week start and density in one popover on the page.
- Show invitee/owner info when ESI detail provides it; add reminder lead time per kind.
