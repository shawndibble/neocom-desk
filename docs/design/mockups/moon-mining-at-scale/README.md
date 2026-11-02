# Moon mining at scale

Source: `src/mockups/MoonMiningAtScale.stories.tsx` (data in `moonScaleFixtures.ts`). Story ids are `mockups-moon-mining-at-scale--<step>`. Sample data; the ticket text wins over the picture.

One officer's view of a corp whose heaviest miner (Varro Kestane, two characters) mined on 68 of 79 days, with both characters, across 20 moons and 57 pops (215 lines). Today is 18 Oct 2026 14:00 EVE; the Aug Statement went out 1 Sep, the Sep Statement 1 Oct (due 15 Oct). The Miner and Miner × pop pages are sums of the same generated lines, and the Pop page's focus pop ties to them. The Pop page's other Miners and other pops, and the Miners list (13 of 61 shown), are synthesized or asserted totals. The separate Corp Tax Book mockup's Statements page uses its own sample data, so its totals do not tie to these pages (a build must read both from one read model).

**The pop is the unit.** Each page names the next one as a link instead of repeating it: Miners → Miner → Miner × pop, and Pop → Miner. No new components: Panel, DataTable (month `groupBy`), StatChips, FilterChip, Modal.

Reviewed by a CEO persona, a UI/UX reviewer and a junior accountant (findings folded in below). "Credit held" in the adjust and dismiss dialogs is a proposal (an overpayment becomes credit on the next Statement); it is not decided. Open items for the build tickets: add "Pop" to the glossary or say Extraction (the glossary has no Pop), ageing buckets, a payment reference and unapplied-balance line, a Statement number linked from payments, and one read model so Statements and Miners totals tie.

Phone shots not named `-phone` are the same story rendered at 390: `npm run ui:shot -- mockups-moon-mining-at-scale--<id> --widths 390`.

| Step | 1440 | 390 |
|---|---|---|
| 1 · Miner: chips, pops folded by month (Statement and owed in each header), footing line, Payments, Activity | ![](miner-1440.png) | ![](miner-phone-390.png) |
| 1b · Miner, Owed filter | ![](miner-owed-1440.png) | |
| 1c · A payment selected: the table shows only the pops it cleared | ![](miner-payment-selected-1440.png) | |
| 2 · Miner × pop: days with unit price, price source, payments that cleared it | ![](miner-on-pop-1440.png) | ![](miner-on-pop-phone-390.png) |
| 3 · Pop: moon totals, who mined it, the moon's pops, footing, Activity | ![](pop-1440.png) | ![](pop-phone-390.png) |
| 3b · Pop with a scheduled rate change and Reverse | ![](pop-scheduled-rate-1440.png) | ![](pop-scheduled-rate-390.png) |
| 4 · Adjust a pop (rate or no tax); effect shows tax, owed and credit held | ![](change-pop-tax-1440.png) | ![](change-pop-tax-phone-390.png) |
| 4b · …for everyone except chosen Miners | ![](change-pop-tax-except-1440.png) | ![](change-pop-tax-except-390.png) |
| 4c · …for one Miner, by character, from the Miner × pop page | ![](adjust-for-one-miner-1440.png) | ![](adjust-for-one-miner-390.png) |
| 5 · Dismiss a whole pop's tax | ![](dismiss-pop-1440.png) | |
| 6 · Change a moon's rate from a date | ![](change-moon-rate-1440.png) | ![](change-moon-rate-phone-390.png) |
| 6b · …for all 20 moons | ![](change-all-moons-rate-1440.png) | |
| 7 · Miners: who gets the next Statement | ![](miners-need-statements-1440.png) | ![](miners-need-statements-phone-390.png) |
| 7b · Ticked rows: count-labelled Send Statements button | ![](miners-bulk-selected-1440.png) | ![](miners-bulk-selected-390.png) |
| 7c · Overdue filter: Send reminders | ![](miners-overdue-reminders-1440.png) | |
