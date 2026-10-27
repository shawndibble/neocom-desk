# Scope decisions — ISK amounts stay a tab stop and read shorthand plus exact as text (issue #1487)

_Recorded 2026-09-24 · issue #1487._

- **A shorthand ISK figure reads as its shorthand, then its exact value, both as text.** `IskAmount` shows "1.3B" and puts "1,284,500,000.00 ISK" beside it in visually hidden (`sr-only`) text. It used to hide the shorthand and name a role-less `<span>` with an `aria-label`. ARIA forbids that, many screen readers ignore it, and an ISK cell could then read as empty. This rules out naming any role-less value span with `aria-label`. `AttributeChips` totals follow the same pattern, with their base + bonus breakdown as the hidden text.
- **Every shorthand ISK figure stays a tab stop.** The tooltip is the only way a sighted keyboard user gets the exact figure, and `Tooltip` opens on focus. Dropping `tabIndex` would cut keyboard users off from that value, and the tooltip rules don't allow hover-only content. The extra tab stops are the price of keeping the value reachable. The alternative, a single toggle that expands every figure on a page, was not taken.
