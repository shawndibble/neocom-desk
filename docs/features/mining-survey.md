# Mining Survey

Route `/mining/survey` (the third Mining tab) and, for anyone with the link, `/share/<id>`.

User goal: paste the in-game Survey Scanner results and see how much of the field is mined, how fast, and when it will be gone; post that to fleet chat in one tap; let other pilots watch and keep it updated, with no login.

| Piece                                          | Where                                                                   |
| ---------------------------------------------- | ----------------------------------------------------------------------- |
| Tab, adopts `?survey=<id>`, routed paste       | `src/features/survey/SurveyTab.tsx`                                     |
| Board: paste box, stats, charts, ores, buttons | `SurveyBoard.tsx`                                                       |
| Charts (lazy Recharts): volume by ore, rate    | `SurveyCharts.tsx`, `surveyTones.ts`                                    |
| Public page, listens for paste itself          | `SurveyShareScreen.tsx`, case `survey` in `src/routes/SharedLink.tsx`   |
| Store, polling hook, current-survey pref       | `surveyStore.ts`, `useSurvey.ts`, `surveyPref.ts`                       |
| Parse, series maths, chat message, ticks       | `src/engine/survey/`                                                    |
| Paste routing                                  | `survey` detector in `src/engine/import/pasteDestination.ts`            |
| Rules and TTL                                  | `firestore.rules` (`shares/{id}/surveyScans`), `firestore.indexes.json` |

## Behaviour

- A Survey Scanner copy is one row per rock, `ore  units  volume m3  ISK  distance`, tab separated (runs of spaces also read), with an optional ore-name header line above each group. Anything else is not a scan: the parser needs every line to be one.
- Ctrl+V anywhere in the app with a scan on the clipboard goes to this tab (`survey` is the first paste detector, strict enough that no item list or fit matches). The first scan starts a Survey (a `survey` Share Link); later ones add to it. Pasting into the box adds at once.
- Progress is volume mined of everything the scans have shown. Rocks are matched between scans by ore, biggest first, each taking the smallest earlier rock at least as big. A rock that shrank or vanished was mined; a rock never seen before extends the field. The scanner's range is far, so a rock drifting out of range is not handled.
- Pace is volume mined over the last three intervals divided by their time; ETA is the volume left over that pace from the latest scan. One scan gives neither.
- Copy chat message: four lines, none wider than 50 visible characters, bold only. A cleared field is three lines with the total mining time.
- Anyone with the link can add a scan with no sign-in; the page re-reads every 20 s while visible.

## Persistence and sync

- Firestore `shares/{id}` (type `survey`, standard 7-day expiry) and create-only `shares/{id}/surveyScans/{auto}` with `text`, server `createdAt` and the survey's `expiresAt`. A TTL policy on `surveyScans.expiresAt` deletes them, because deleting the parent leaves subcollections behind.
- The tracked Survey id is a device-local setting (`miningSurveyCurrent`).
- The rules must be deployed by hand: CI ships Pages only.

## Decisions

`docs/context/decisions/20261008-175716-survey-scans-append-to-a-survey-share-link.md`.

## Observed gaps

- "Your share" from the personal mining ledger (system and day granular), and ISK left from the scanner's ISK column, are not built.
- A survey has no "stop sharing": a create-only share can only expire.
- A junk-paste flood is bounded only by the per-scan size cap and the 7-day expiry.
