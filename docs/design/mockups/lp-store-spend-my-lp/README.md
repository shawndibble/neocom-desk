# LP Store › Spend my LP (issue #6199)

Source: `src/mockups/LpStoreSpendPlan.stories.tsx` (`mockups-lpstorespendplan--*`). Sample data, rendered with the real `SpendPlanPanel` and `SpendLpButton`; the ticket text wins over the picture.

New components: `SpendLpButton` (beside the offers list's actions menu) and `SpendPlanPanel` (opens above the offers on press).

| State | Screenshot |
|---|---|
| Populated, stopped at the pilot's LP Value | ![](stopped-at-lp-value-1440.png) |
| Same, phone (390) | ![](stopped-at-lp-value-390.png) |
| Stopped at the wallet | ![](stopped-at-wallet-1440.png) |
| Stopped under 70% of the best (no LP Value, no market rate), wallet unknown | ![](stopped-at-best-share-1440.png) |
| Nothing profitable | ![](nothing-profitable-1440.png) |
| 0 LP: button aria-disabled, reason in a tooltip | ![](zero-lp-disabled-1440.png) |
