# Corp Tax Book: merged option (Final)

Issue #4056 (epic #4055). Source: `src/mockups/CorpTaxBookFinal.stories.tsx` (data in `corpTaxBookFixtures.ts`). Story ids are `mockups-corptaxbookfinal--<step>`, with `-phone` for the 390 variant. Built on option A with C's timeline, Needs you cards and Statement run, B's mail preview (now a dialog) and B's verify layout. Sample data; the ticket text wins over the picture.

New components (dashed, labelled): ExtractionTimeline, NeedsYouQueue, StatementRun, StatementMailPreview, MailQueueChip (with its phone percent badge), CorpBookDiff, CorpBookSyncNote. The personal tab is today's Tax tab (real `OwedBalances` card, same columns and row detail) with new `StatusPill` values.

| Step | 1440 | 390 |
|---|---|---|
| 1 · Extractions: chunk timeline, then the table; a row opens the moon page | ![](f-01-extractions-1440.png) | ![](f-01-extractions-390.png) |
| 2 · Moon detail page | ![](f-02-moon-detail-1440.png) | ![](f-02-moon-detail-390.png) |
| 3 · Miners: Needs you cards above the table | ![](f-03-miners-1440.png) | ![](f-03-miners-390.png) |
| 4 · Miner detail page | ![](f-04-miner-detail-1440.png) | ![](f-04-miner-detail-390.png) |
| 5 · Mark paid / not tax / dismiss (dialogs) | ![](f-05-mark-paid-not-tax-dismiss-1440.png) | ![](f-05-mark-paid-not-tax-dismiss-390.png) |
| 6 · Statements: run at Check | ![](f-06-statements-1440.png) | ![](f-06-statements-390.png) |
| 7 · Preview mail (dialog) | ![](f-07-preview-mail-1440.png) | ![](f-07-preview-mail-390.png) |
| 8 · Send, mail-limit notice | ![](f-08-send-notice-1440.png) | ![](f-08-send-notice-390.png) |
| 9 · Progress chip (phone: icon + % badge) | ![](f-09-progress-chip-1440.png) | ![](f-09-progress-chip-390.png) |
| 10 · Queue popover / sheet | ![](f-10-queue-1440.png) | ![](f-10-queue-390.png) |
| 11 · Queue done | ![](f-11-queue-done-1440.png) | ![](f-11-queue-done-390.png) |
| 12 · Member Tax tab (today's page + corp states) | ![](f-12-personal-tab-1440.png) | ![](f-12-personal-tab-390.png) |
| 13 · Row detail | ![](f-13-personal-row-detail-1440.png) | ![](f-13-personal-row-detail-390.png) |
| 14 · Compare with the book (dialog) | ![](f-14-personal-book-diff-1440.png) | ![](f-14-personal-book-diff-390.png) |
| 15 · Guest verify page | ![](f-15-guest-verify-1440.png) | ![](f-15-guest-verify-390.png) |
