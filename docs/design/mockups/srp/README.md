# SRP mockups (epic #4608, mockups #4847)

Stories: `mockups/SrpMember`, `mockups/SrpOfficer`, `mockups/SrpSettings`, `mockups/SrpWidget`. Every story renders at desktop and phone (`useIsPhone`). The phone layouts use `DataTable`'s dense cards (DESIGN.md §4a), not labelled cards.

| Screen | Files (`-1440` / `-390`) | Shows |
|---|---|---|
| Member | `member-1-default` … `member-7-claim-detail` | Filing, lost-ships list, blocked hull and errors, empty, not set up, re-file sheet, claim detail (phone) |
| Officer | `officer-1-queue` … `officer-10-detail-overridden` | Queue with bulk approve, reject, override amount, Mark paid, detail, history and feed, empty, no-amount row, result toast |
| Settings | `settings-1-first-time` … `settings-3-validation` | First-time, configured with Hull Rules, validation |
| Widget | `widget-1-number` … `widget-4-not-turned-on` | Number, table, empty, not turned on |

Not drawn: the SRP nav item (the shell shows no rail in these stories), and the sticky bottom bars are in flow in the PNGs.

First draft mockup; sample data. The ticket briefs win over the picture where they differ.
