# SRP killmail modal (issue #5379)

Story: `mockups/SrpKillmail` → `combined` (desktop). The chosen layout combines "claim first" (payout on top) and "fit against doctrine" (two columns: facts left, doctrine-checked fit right). The other stories in that file (`claim-first`, `killmail-first`, `fit-against-doctrine` and their phone variants) are the rejected alternatives.

| Picture | Shows |
|---|---|
| `combined-1440.png` | Proposed modal: payout and Hull Rule on top, off-doctrine line, killmail facts left, fit right with green check / yellow exclamation marks (tooltips "Doctrine" / "Off doctrine"; the probe launcher, which the doctrine doesn't list, has no mark) |
| `officer-slide-over-today-1440.png` | Today's officer claim slide-over (`SrpClaimDetail`), which stays the decision surface; the ticket adds an "Open killmail" link and the appraisal comparison to it |

Not drawn: the officer's appraisal comparison (ship and fit vs doctrine fit, with % difference) and the sheet layout on a phone. The ticket text wins over the picture where they differ; amounts, doctrine name and the Hull Rule line are sample data. The `medium` Modal placement used here is new.
