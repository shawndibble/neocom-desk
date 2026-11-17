# Vetting: keep and browse all the raw data a review read

Mockup only, no product code. Issue #6341. Stories: `src/mockups/VettingRawData.stories.tsx` (title `mockups/VettingRawData`; the browser in `vettingRawDataBrowser.tsx`, report and consent parts in `vettingRawDataParts.tsx`, sample data in `vettingRawDataFixtures.ts`). Shots at 1440 and 390 (`-1440.png`, `-phone-390.png`); the phone shots are the base story rendered at 390px width (only the stories listed in `VettingRawData.stories.tsx` as `...Phone` are separate Storybook variants). Sample data, 4,652 wallet rows from a fixed seed; the ticket's text wins over the picture where they differ. The images match the stories. In a table cell a New component is a dashed outline with no label (the Flag link, `NewFlagLink`); hover shows its name.

The tall lists are shot at one screen (1,100px): the table is windowed (`DataTable virtualize`), so the rest only draws as you scroll. Open the story in Storybook to scroll all 4,652 rows.

One recommended design, with the decisions made in review at the end. It shares the review page with #6328 (Review a member): "Data we read" goes where that page's report is, below the flags, so the two merge without moving each other.

## Today vs proposed

| | Today | Proposed |
|---|---|---|
| Report | ![](report-today-1440.png) | ![](report-1440.png) |
| Report, phone | ![](report-today-phone-390.png) | ![](report-phone-390.png) |
| Consent (member) | ![](consent-today-1440.png) | ![](consent-proposed-1440.png) |
| Consent, phone | ![](consent-today-phone-390.png) | ![](consent-proposed-phone-390.png) |

| Part | Today | Proposed |
|---|---|---|
| What a review keeps | Flags, up to 10 evidence rows each, a few facts per character. Raw rows deleted on Send (ADR 0033). | Every row read, uncapped, kept with the review until the same deletion dates. |
| Report | Flags, checks, characters, About this report. Nothing else the read returned. | Adds "Data we read" (one row per source) and, under the flags, a link from each flag to its rows. |
| Browsing | None. | A page per review, `Data we read`, with a tab per source, a character switcher, search, a Type filter, a date range, sort on every column. |
| Flagged row | Only inside the flag's 10 rows. | Tinted in the list, with a Flag link back to the flag in the report. |
| Consent | Says what is read and that it is deleted 30/90 days after. Silent that rows survive Send (they do not today). | "Kept after you press Send", officers only, mail headers only, no key kept. |

## States

| State | 1440 | 390 |
|---|---|---|
| Wallet journal, 4,652 rows, no cap | ![](wallet-large-1440.png) | ![](wallet-large-phone-390.png) |
| Flagged rows, sorted by amount, linked to their flag | ![](wallet-flagged-row-1440.png) | ![](wallet-flagged-row-phone-390.png) |
| Flagged rows only | ![](wallet-flagged-only-1440.png) | ![](wallet-flagged-only-phone-390.png) |
| Contacts | ![](contacts-1440.png) | ![](contacts-phone-390.png) |
| Mail headers | ![](mail-headers-1440.png) | ![](mail-headers-phone-390.png) |
| Contracts, filtered (type, dates) | ![](contracts-filtered-1440.png) | ![](contracts-filtered-phone-390.png) |
| Skills, flagged row | ![](skills-1440.png) | ![](skills-phone-390.png) |
| Corporation history (with time there) | ![](corp-history-1440.png) | ![](corp-history-phone-390.png) |
| Empty source (shared, nothing found) | ![](empty-source-1440.png) | ![](empty-source-phone-390.png) |
| Filters match nothing | ![](no-match-1440.png) | ![](no-match-phone-390.png) |
| Consent terms alone | ![](consent-terms-only-1440.png) | ![](consent-terms-only-phone-390.png) |

## Design choices

1. **A page of its own, not a panel on the report.** `/corp/vetting/open/:id/data/:source`, crumb back to the report. Thousands of rows need the full width and a stable URL (a flag links straight to its rows, a colleague can be sent the link). The report keeps one small table, "Data we read", whose row click and accent name open the source (section 6c: the row's primary action beats a name link; no Open button). In the list, a party's name opens its Show Info (`PublicInfoModal`) like every other entity name; the list row itself opens nothing.
2. **Tabs for sources, a joined group for characters.** Six sources are peers on one page, so `Tabs` with a count badge each. Characters switch what the table holds, so `SegmentedControl` ("All 3" first, then each name). The group allows 2 to 4 options: up to three characters fit. A review with more falls back to a `Select` with "All characters" first (decided; not drawn). A single-character review shows no switcher and no Character column.
3. **One windowed table, never a cap.** `DataTable` with `virtualize="auto"`, `density="compact"`, sort on every column. All 4,652 rows are reachable by scrolling; a line above says "All 4,652 rows read. Scroll for the rest." With a filter on it says "508 of 4,652 rows". Nothing is truncated, paged by button or "show more".
4. **Tables stay tables on a phone.** `responsive="table"`, the first column pinned, the rest scroll sideways. A dense card stack of thousands of rows is worse to scan than columns.
5. **Filters in the standard `FilterBar`.** Search stays in the row. The source's one kind filter (Type, Direction, Contract type, Standing, Skill group) and the date range sit inline on a pointer screen; on a phone everything goes in the sheet. Active filters show as pills, with Clear all. "Flagged rows only" is a chip behind the funnel. Sources with no dates (Contacts, Skills) show no date range rather than a dead one; Corporation history has none either, its dates are columns.
6. **Empty and no-match are different states, in different words.** Every character shares everything the read asks for (sharing is by character, never by source, and the EVE sign-in page has no per-scope choice), so there is no "not shared" state. Empty: "No wallet journal rows ... Empty is a result: the source was read." Filters matching nothing is a second state with Clear filters.
7. **Flag and row point at each other.** In the list: a tinted row and a Flag link (severity glyph and the flag's title) to `#flag-<check>` in the report. In the report: under the flag list, one link per flag to its rows ("Open the 3 rows in Wallet journal ... the flag shows up to 10; the journal has all 4,652"). In the build the link belongs inside each flag's own "rows behind this" disclosure; the mockup puts it under the list because the flag list is the real component. Flags still keep their 10-row evidence; the data is not a second copy of the flag.
8. **Mail is headers only, and the table says so.** Columns: sent time, direction, the other party, all recipients. No subject, no text, no preview column. A mail row has no flag today. The "Data we read" note repeats it.
9. **Officer-only, the same as flags.** No new UI for access: the report page and the data page are the same gate, each open is logged where the pilot sees it. The person who asked for the review and the person reviewed cannot open it, as today. Opening a source is covered by the report's own log line ("Opening a source is logged with the other opens"); each source open does not get its own line (decided).
10. **Consent says the true thing plainly.** The same two-column shape as today: what officers see (each source with its own scope: every row, every contact, every trained skill), a new "Kept after you press Send" group (every row, 30 days after the decision, 90 days if nobody decides, or when you delete it), "You stay in control" (officers only, you see who opened it, you can delete it), "Not read, not kept" (mail subject and text, your EVE login: "We do not keep your login"). No "Changed" note: nobody uses the tool yet, so there is no old wording to flag.

## New components

- `DataWeRead`: the report's section. A `Panel` + `DataTable` of six rows (source, rows read) and a note.
- `FlagDataLinks`: a flag's way into its rows. In the build, a link in each flag's disclosure, not a block.
- `RawDataBrowser`: the page's arrangement of `Tabs`, `SegmentedControl`, `FilterBar` and a windowed `DataTable`. No new primitive inside it.
- `NewFlagLink`: the browser's Flag column, a severity glyph and the flag's title linking to `#flag-<check>`.
- `ConsentTermsKept`: `VettingConsentTerms` with the new group.

The flag list and decision rail are the real components.

## Decisions made in review

1. **Row detail.** None. Every field shows in the row. A party's name opens its Show Info.
2. **More than three characters.** `Select` with "All characters" first. Not drawn.
3. **Logging.** One log line per review open, as today. No line per source.
4. **Export.** Not in this change. A CSV can come later (one Download in the Panel header, all rows, never filtered).
5. **Wallet window.** Stays 30 days. A longer window is a separate scope change (ADR).
6. **Sharing.** There is no "not shared" source. A character is added whole and the EVE sign-in page offers no per-scope choice, so the mockup has no per-source sharing state, no "Shared by" column and no "Covers" column (the consent terms already say what each source covers).
7. **Row cost.** 4,652 wallet rows for one busy trader. Storage and read paging are build concerns (subcollection, paged reads); the UI assumes the list loads in pages behind one scroll and never shows a page control.
