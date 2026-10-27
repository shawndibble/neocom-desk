# Corp Tax Book: merged option (Final)

Issue #4056 (epic #4055). Source: `src/mockups/CorpTaxBookFinal.stories.tsx` (data in `corpTaxBookFixtures.ts`, officer dialogs in `corpTaxBookDialogs.tsx`, the member's tab and the verify page in `corpTaxBookMember.tsx`). Story ids are `mockups-corptaxbookfinal--<step>`, with `-phone` for the 390 variant. Built on option A with C's timeline, Needs you cards and Statement run, B's mail preview (now a dialog) and B's verify layout. Sample data; the ticket text wins over the picture.

One story throughout: today is 18 Oct 2026 14:00 EVE and an officer synced the book at 12:00 (2h ago), so every day through 17 Oct is Billable (day end + 30 min grace passed, then a sync) and 18 Oct is not. The Aug 2026 Statements went out on 1 Sep (due 15 Sep); the Sep 2026 Statements are about to be sent; Oct is open. Figures that show in several places (Miners table, Needs you, mail, verify page) are derived from the same lines and payments.

New components (dashed, labelled): ExtractionTimeline, NeedsYouQueue, StatementRun, StatementMailPreview, MailQueueChip (with its phone percent badge), CorpBookDiff, CorpBookSyncNote. The personal tab is today's Tax tab (real `OwedBalances`, `PriceBreakdownCard` and `AttentionStrip`; Open and History tables; same columns and row detail) with new `StatusPill` values.

| Step | 1440 | 390 |
|---|---|---|
| 1 · Extractions: chunk timeline, then the table; a strip under the tabs carries the sync age and the loud gap; a row opens the moon page | ![](f-01-extractions-1440.png) | ![](f-01-extractions-390.png) |
| 2 · Moon detail page: this extraction, who mined it, past cycles (not the current one) | ![](f-02-moon-detail-1440.png) | ![](f-02-moon-detail-390.png) |
| 3 · Miners: Needs you cards above the table | ![](f-03-miners-1440.png) | ![](f-03-miners-390.png) |
| 4 · Miner detail page: Days, Payments (with write-offs), Dismissals, Mail, Activity | ![](f-04-miner-detail-1440.png) | ![](f-04-miner-detail-390.png) |
| 5 · Dismiss dialog | ![](f-05-dismiss-1440.png) | ![](f-05-dismiss-390.png) |
| 6 · Record payment dialog (manual Tax Payment) | ![](f-06-record-payment-1440.png) | ![](f-06-record-payment-390.png) |
| 7 · Mark not tax dialog (all or part of a donation; the debt reopens) | ![](f-07-mark-not-tax-1440.png) | ![](f-07-mark-not-tax-390.png) |
| 8 · Reject declaration dialog (Needs you) | ![](f-08-reject-declaration-1440.png) | ![](f-08-reject-declaration-390.png) |
| 9 · Assign a donation dialog (Needs you, Unmatched) | ![](f-09-assign-donation-1440.png) | ![](f-09-assign-donation-390.png) |
| 10 · Statements: run at Check, periods and write-offs | ![](f-10-statements-1440.png) | ![](f-10-statements-390.png) |
| 11 · Preview mail (dialog): short table of lines, total, amount due, code, verify link | ![](f-11-preview-mail-1440.png) | ![](f-11-preview-mail-390.png) |
| 12 · Send, mail-limit notice | ![](f-12-send-notice-1440.png) | ![](f-12-send-notice-390.png) |
| 13 · Progress chip (phone: icon + % badge, warning badge for failures) | ![](f-13-progress-chip-1440.png) | ![](f-13-progress-chip-390.png) |
| 14 · Queue popover / sheet | ![](f-14-queue-1440.png) | ![](f-14-queue-390.png) |
| 15 · Queue done (100% badge stays) | ![](f-15-queue-done-1440.png) | ![](f-15-queue-done-390.png) |
| 16 · Member Tax tab (today's page + corp states) | ![](f-16-personal-tab-1440.png) | ![](f-16-personal-tab-390.png) |
| 17 · Row detail | ![](f-17-personal-row-detail-1440.png) | ![](f-17-personal-row-detail-390.png) |
| 18 · Compare with the book (dialog) | ![](f-18-personal-book-diff-1440.png) | ![](f-18-personal-book-diff-390.png) |
| 19 · Guest verify page | ![](f-19-guest-verify-1440.png) | ![](f-19-guest-verify-390.png) |
