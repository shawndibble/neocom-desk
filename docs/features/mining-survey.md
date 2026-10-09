# Mining Survey

Route `/mining/survey` (the third Mining tab) and, for anyone with the link, `/share/<id>`.

User goal: paste the in-game Survey Scanner results and see how much of the field is mined, how fast, and when it will be gone; post that to fleet chat in one tap; let other pilots watch and keep it updated, with no login.

| Piece                                          | Where                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tab, adopts `?survey=<id>`, routed paste       | `src/features/survey/SurveyTab.tsx`                                                   |
| Board: paste box, stats, charts, ores, buttons | `SurveyBoard.tsx`                                                                     |
| Charts (lazy Recharts): volume by ore, rate    | `SurveyCharts.tsx`, `surveyTones.ts`                                                  |
| Public page, listens for paste itself          | `SurveyShareScreen.tsx`, case `survey` in `src/routes/SharedLink.tsx`                 |
| Store, polling hook, current-survey pref       | `surveyStore.ts`, `useSurvey.ts`, `surveyPref.ts`                                     |
| Parse, series maths, chat message, ticks       | `src/engine/survey/`                                                                  |
| Your share: ledger read, system pref, line     | `yourShare.ts` (engine), `useYourShare.ts`, `surveySystemPref.ts`, `YourShareRow.tsx` |
| Copy chat message split button                 | `SurveyCopyButton.tsx`                                                                |
| Paste routing                                  | `survey` detector in `src/engine/import/pasteDestination.ts`                          |
| Rules and TTL                                  | `firestore.rules` (`shares/{id}/surveyScans`), `firestore.indexes.json`               |

## Behaviour

- A Survey Scanner copy is one row per rock, `ore  units  volume m3  ISK  distance`, tab separated (runs of spaces also read), with an ore-name header line above each group. The scanner prints a header for every grade even when it has no rocks, so a bare line is a header when a row of the same ore follows, or when it names a grade or an ore the scan has rows for and another bare line or the end follows. A bare line anywhere else, or a header with no rows at all, is not a scan. Anything else is not a scan: the parser needs every line to be one.
- Ctrl+V anywhere in the app with a scan on the clipboard goes to this tab (`survey` is the first paste detector, strict enough that no item list or fit matches). The first scan starts a Survey (a `survey` Share Link); later ones add to it. The paste box has no button: anything pasted into it is processed at once, and text that is not a scan says so. The text is checked before anything is sent, so a wrong paste never starts a survey. A write the server refuses (permission-denied, for example while the rules are not deployed) says "The server refused this scan" instead of the generic save error.
- Progress is volume mined of everything the scans have shown. Rocks are matched between scans by ore, biggest first, each taking the smallest earlier rock at least as big. A rock that shrank or vanished was mined; a rock never seen before extends the field. The scanner's range is far, so a rock drifting out of range is not handled.
- Each ore is shown against what the scans first showed of it (plus any that came into range), as a percent left; an ore mined out stays on the list at 0%. A scan whose rocks match any earlier scan is ignored, even with a newer scan in between: mining only removes ore, so the same rocks can't be a later state. ISK left is the scanner's own ISK column summed over the latest scan.
- Pace is volume mined over the last three intervals divided by their time; ETA is the volume left over that pace from the latest scan. One scan gives neither.
- Copy chat message is a split button: the button copies the message, and its caret menu has Copy link for the URL alone. The message is four lines, none wider than 56 visible characters (see the 20261009 decision), bold only. A cleared field is three lines with the total mining time.
- The chat message's "Left:" line names the three ores with the most ISK left (the scanner's own ISK column), each with its rock count, and groups the rocks of every other ore as "N other". The page's ore list follows the same order; each bar is coloured gray, blue, yellow or orange by ISK per m³ left against the richest ore (`valueTier.ts`; DESIGN.md "Ore value ramp"), with the ISK and percent printed beside it.
- Layout follows the chart-led mockup: a paste bar above the panel, then the percent, the chart legend, the two charts, large stat tiles, and the ore list. On a phone the Copy chat message button sits full width under the chart instead of in the panel header.
- Your share (Survey tab only): under the stats, how many m³ of the survey's ores the viewer's mining ledger shows in one system on the survey's UTC day(s), and the percent of what the survey says has been mined. The system is the Character's current one unless they type another; it is a device-local setting. The ledger has no times, so it is a running total, and the line is hidden when there is no ledger (the ledger is read before the system is asked for, so a pilot without the mining grant is never prompted to name one). Escape closes the system field.
- Anyone with the link can add a scan with no sign-in; the page re-reads every 20 s while visible.

## Persistence and sync

- Firestore `shares/{id}` (type `survey`, standard 7-day expiry) and create-only `shares/{id}/surveyScans/{auto}` with `text`, server `createdAt` and the survey's `expiresAt`. A TTL policy on `surveyScans.expiresAt` deletes them, because deleting the parent leaves subcollections behind.
- The tracked Survey id is a device-local setting (`miningSurveyCurrent`).
- The rules must be deployed by hand: CI ships Pages only.

## Decisions

`docs/context/decisions/20261008-175716-survey-scans-append-to-a-survey-share-link.md`, `docs/context/decisions/20261008-221334-survey-your-share-reads-the-mining-ledger-for.md`.

## Observed gaps

- Your share is a running total: ore mined in that system before the first scan counts, and it lags the game by a few minutes.
- A "Field cleared" state needs a scan with every rock at 0 m³. The scanner prints no rows for an empty field, so the finish message may never show; a "Mark cleared" control or clearing at the finish time are the fallbacks.
- A genuinely older scan that was never pasted before is read as the newest, because a scan's time is when it was pasted.
- A survey has no "stop sharing": a create-only share can only expire.
- A junk-paste flood is bounded only by the per-scan size cap and the 7-day expiry.

**Value.** Rocks are valued at market, not at the scanner's ISK column (`priceScans`, `useOrePrices`): units times the highest buy price of the ore's Compressed form at the pilot's default Trade Hub (Jita for a visitor with no session). An ore with no price has no value and reads gray.

**Moon tax.** On the Survey tab, a Survey with a moon ore shows a Payee and rate row (`MoonTaxRow`); "Open in Mining Tax" finds or creates the Payee and opens the Tax tab, whose Assign dialog then preselects that Payee. Not on the public page.

**Your share refresh.** The ledger is re-read when a newer scan arrives and every 60 seconds (ESI's own cache decides what is new). The system editor offers the systems the ledger shows you mined in on the survey's days, latest first, above the typed name.
