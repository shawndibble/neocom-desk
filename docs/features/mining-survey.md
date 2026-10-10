# Mining Survey

Route `/mining/survey` (the third Mining tab) and, for anyone with the link, `/s/<id>`.

User goal: paste the in-game Survey Scanner results and see how much of the field is mined, how fast, and when it will be gone; post that to fleet chat in one tap; let other pilots watch and keep it updated, with no login.

| Piece                                       | Where                                                                                 |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| Tab, adopts `?survey=<id>`, routed paste    | `src/features/survey/SurveyTab.tsx`                                                   |
| Board: stats, charts, ores, buttons         | `SurveyBoard.tsx`                                                                     |
| Charts (lazy Recharts): volume by ore, rate | `SurveyCharts.tsx`, `surveyTones.ts`                                                  |
| Public page, listens for paste itself       | `SurveyShareScreen.tsx`, case `survey` in `src/routes/SharedLink.tsx`                 |
| Store, polling hook, current-survey pref    | `surveyStore.ts`, `useSurvey.ts`, `surveyPref.ts`                                     |
| Parse, series maths, chat message, ticks    | `src/engine/survey/`                                                                  |
| Your share: ledger read, system pref, line  | `yourShare.ts` (engine), `useYourShare.ts`, `surveySystemPref.ts`, `YourShareRow.tsx` |
| Copy chat message split button              | `SurveyCopyButton.tsx`                                                                |
| Paste routing                               | `survey` detector in `src/engine/import/pasteDestination.ts`                          |
| Rules and TTL                               | `firestore.rules` (`shares/{id}/surveyScans`), `firestore.indexes.json`               |

## Behaviour

- A Survey Scanner copy is one row per rock, `ore  units  volume m3  ISK  distance`, tab separated (runs of spaces also read), with an ore-name header line above each group. The scanner prints a header for every grade even when it has no rocks, so a bare line is a header when a row of the same ore follows, or when it names a grade or an ore the scan has rows for and another bare line or the end follows. A bare line anywhere else, or a header with no rows at all, is not a scan. Anything else is not a scan: the parser needs every line to be one.
- The public page uses the share frame: brand and login at the top, the `<h1>` "Mining Survey" once, and the board's panel titled "Field progress" (`SurveyBoard`'s `panelTitle`; the tab leaves it unset).
- Ctrl+V anywhere in the app with a scan on the clipboard goes to this tab (`survey` is the first paste detector, strict enough that no item list or fit matches). The first scan starts a Survey (a `survey` Share Link); later ones add to it. There is no paste box: a scan is pasted anywhere on the page, and a paste that fails says why in one line under the page's help text (`ScanFeedback`). The text is checked before anything is sent, so a wrong paste never starts a survey. A write the server refuses (permission-denied, for example while the rules are not deployed) says "The server refused this scan" instead of the generic save error.
- Progress is volume mined of everything the scans have shown. Rocks are matched between scans by ore, biggest first, each taking the smallest earlier rock at least as big. A rock that shrank or vanished was mined; a rock never seen before extends the field. The scanner's range is far, so a rock drifting out of range is not handled.
- Each ore is shown against what the scans first showed of it (plus any that came into range), as a percent left; an ore mined out stays on the list at 0%. A scan whose rocks match any earlier scan is ignored, even with a newer scan in between: mining only removes ore, so the same rocks can't be a later state. ISK left is the scanner's own ISK column summed over the latest scan.
- A pasted scan is an update when every ore in it was in the latest scan and none has more m³ than before (1% allowed for rounding; `classifyScan`). Belts don't spawn rocks while mined, so an update only shrinks the field. An update always joins the survey in view, for anyone with the link. Any other scan is a different field: on the Survey tab the owner is asked ("Create new survey", primary, or "Add to existing survey"), anyone else gets a new survey at once, and on the public page the scan is held until the visitor logs in (or opens the app), where it starts their own survey.
- A survey names its owner (`payload.owner`, a Character name). The account owns it when it holds a Character of that name (case-insensitive). It is a hint for the prompt above, not security; a survey made before owners has none and is nobody's.
- Pace is volume mined over the last three intervals divided by their time; ETA is the volume left over that pace from the latest scan. One scan gives neither: the Done at tile shows a dash and the chart area says "Add another scan to see the chart".
- The Chat message button (a copy icon, small size; its accessible name is "Copy chat message") is a split button: the button copies the message, and its caret menu has Copy link for the URL alone. The message is a "Neocom Desk Report" heading line (chat puts the speaker's name beside the first line) and an open, single-line box under it: the ETA set into the top rail, the bar with its percent, the Left line, and the link set into the bottom rail, each rail tapering off through `╌┄┈`. Nothing closes the right side. Rails and bar are sized in pixels from EVE's measured chat-font character widths (`chatFont.ts`, font size 12): a rail is never shorter than the content under it and under one character longer, as long as the Left line or the link's rail when that is longer, and its label sits centred. The Left line is held to 300px (`MAX_ROW_PX`; see the 20261009-1513 decision), and the message carries no bold. A cleared field is the heading and three rows with the total mining time in the top rail.
- The chat message's "Left:" line names the two ores with the dearest unit price (the order the page lists them in and the chart stacks them; compressed buy at the pilot's hub, whatever volume the paste holds), each with its rock count, and groups the rocks of every other ore as "N other". The page's ore list follows the same order; each bar is coloured gray, blue, yellow or orange by unit price between the cheapest and dearest ore (`valueTier.ts`; DESIGN.md "Ore value ramp"), with the ISK and percent printed beside it.
- Layout follows the chart-led mockup: the percent, the chart legend, the two charts, large stat tiles, and the ore list. On a phone the Copy chat message button sits full width under the chart instead of in the panel header.
- Your share (Survey tab only): under the stats, how many m³ of the survey's ores the viewer's mining ledger shows in one system on the survey's UTC day(s), and the percent of what the survey says has been mined. The system is the Character's current one unless they type another; it is a device-local setting. The ledger has no times, so it is a running total, and the line is hidden when there is no ledger (the ledger is read before the system is asked for, so a pilot without the mining grant is never prompted to name one). Escape closes the system field.
- Anyone with the link can add a scan with no sign-in; the page re-reads every 60 s while visible.

## Persistence and sync

- Firestore `shares/{id}` (type `survey`, standard 7-day expiry) and create-only `shares/{id}/surveyScans/{auto}` with `text`, server `createdAt` and the survey's `expiresAt`. A TTL policy on `surveyScans.expiresAt` deletes them, because deleting the parent leaves subcollections behind.
- The tracked Survey id is a device-local setting (`miningSurveyCurrent`).
- Past surveys are a synced list of `{id, addedAt}` (`sync.surveyHistory`): ids only, added when the pilot creates or opens a Survey in the app, 7 days at most, dropped when the picker finds the link gone. The picker (Survey tab, top right of the page header, two or more entries) loads each label (main ore, percent mined, latest scan time) from the share link when it opens. Firebase gains no copy of a survey.
- A scan pasted on a share page that starts a new survey waits in local storage (`miningSurveyPendingScan`, 30 minutes, taken once) across the login; the Survey tab consumes it.
- The rules must be deployed by hand: CI ships Pages only.

## Decisions

`docs/context/decisions/20261008-175716-survey-scans-append-to-a-survey-share-link.md`, `docs/context/decisions/20261008-221334-survey-your-share-reads-the-mining-ledger-for.md`, `docs/context/decisions/20261009-114933-survey-names-its-owner-and-tracks-same-field.md`.

## Observed gaps

- Your share is a running total: ore mined in that system before the first scan counts, and it lags the game by a few minutes.
- A "Field cleared" state needs a scan with every rock at 0 m³. The scanner prints no rows for an empty field, so the finish message may never show; a "Mark cleared" control or clearing at the finish time are the fallbacks.
- A genuinely older scan that was never pasted before is read as the newest, because a scan's time is when it was pasted.
- A rock pulled into scanner range by flying closer reads as growth, so a paste after moving can be a "different field" when it isn't.
- A survey has no "stop sharing": a create-only share can only expire.
- A junk-paste flood is bounded only by the per-scan size cap and the 7-day expiry.

**Value.** Rocks are valued at market, not at the scanner's ISK column (`priceScans`, `useOrePrices`): units times the highest buy price of the ore's Compressed form at the pilot's default Trade Hub (Jita for a visitor with no session). An ore with no price has no value and reads gray.

**Moon tax.** A Survey with a moon ore shows a "Moon tax" panel under Field progress. On the Survey tab (`MoonTaxRow`) it reads as one line of text, "8% to Moon Corp"; clicking the rate or the name (accent text with the faint edit pencil after it) turns just that part into a field, and Enter or leaving it saves. "Open in Mining Tax" finds or creates the Payee and opens the Tax tab, whose Assign dialog then preselects that Payee. Once editing stops, a complete name and rate is stored on the Survey as a create-only doc in `shares/{id}/surveyTax` (newest wins; `firestore.rules` needs deploying for it), and the public page shows it read-only (`MoonTaxReadout`). Only the Survey's owner (the Character named in the payload, `ownsSurvey`) edits and stores it; any other pilot who opens the Survey in the app sees the stored tax read-only.

**Removing a scan.** The Survey's owner can set a bad paste aside. Right-click a node on the volume chart (touch-and-hold on a phone) for "Remove scan", or open the "N scans" disclosure, the last thing on the Survey tab (owner only), and press Remove; a removed scan keeps its row there, struck through, with Restore. A removed scan drops out of the totals, the chart and the "same field" check on the next paste. Each change is a create-only doc in `shares/{id}/surveyIgnores` (`scanId`, `ignored`; newest per scan wins; `firestore.rules` and `firestore.indexes.json` need deploying for it), so nothing is deleted. The public page applies the removals but offers none. Ownership is the same name hint as the moon tax, so the rules can't enforce it.

**Your share refresh.** The ledger is re-read when a newer scan arrives and every 60 seconds (ESI's own cache decides what is new). The system editor offers the systems the ledger shows you mined in on the survey's days, latest first, above the typed name.
