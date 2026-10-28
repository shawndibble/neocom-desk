# Scope decisions — Improve header: More chip, Skills beside Search settings, total cost with delta

_Recorded 2026-10-27._

- **The selection summary leads with the fit's total cost after the ticks, with what they add in parentheses, at the right of the bar.** "Still to buy" is gone as a label; with owned stock counted the same figures are still net of it, and the label says "minus what you own". Refit mode, which has no total, shows the change alone. Rules out a separate still-to-buy comparison against inventory.
- **Implants are a one-line count with a link into the Implant Finder, not a list of rows.** They cost the fit nothing, so they stay out of the total.
- **Skills is a collapsed control with a count, right of Search settings, sharing one expansion area with it.** Opening one shuts the other; nothing is open by default. "More goals" is a "More" chip at the end of the goal chips. Rules out a Train section that pushes the results down.
- **The stats track is a fixed 22rem, shut or open, and the grid does not re-centre while Improve's column is open.** The editor column absorbs the change.
- **The stats column's Price follows the previewed rows (`current → after`) in buy mode without owned stock**, where a row's price change is exactly the fit's price change. Other modes keep the plain price.
