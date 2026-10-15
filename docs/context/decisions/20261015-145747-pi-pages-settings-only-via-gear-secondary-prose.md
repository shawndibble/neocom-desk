# Scope decisions — PI pages: settings only via gear; secondary prose behind tooltips

_Recorded 2026-10-15._

- **The PI pages' settings are reached only through the page header's gear.** The strip's "PI settings" link is gone: it duplicated the gear and cost a row on a phone.
- **State and figures stay visible; only explanation goes in a tooltip.** A count, an ISK figure, a risk (lowsec/nullsec jumps), an empty or failed state, a caveat such as "assumed" or "prices are down", and the result of a control (the restart rhythm) are visible text, short. Prose that explains why or how (basis of estimates, what a toggle does) may ride an `InfoTooltip`.
- **Why.** Tooltips are not reliable on touch and are never essential (DESIGN §6c); the first declutter pass hid load-bearing text behind them or `sr-only` below `lg`.
