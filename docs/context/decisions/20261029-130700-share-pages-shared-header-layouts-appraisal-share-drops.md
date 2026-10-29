# Scope decisions — Share pages: shared header layouts, appraisal share drops volume, phone totals in shorthand

_Recorded 2026-10-29._

- **`ShareShell` has three layouts.** `classic` is the original header and title row (the D-scan page and the Share Link loading, gone and failed states still use it). `compact` is the brand and login in one header row over a divider, the title kept for screen readers only, in the usual 768px frame; the shared Appraisal and the shared Mining Survey use it. `wide` is `compact` in a 896px frame, for the two-column shared Fitting. The visible title is gone from the new layouts: the page says what it is below the header.
- **The shared Appraisal drops the Volume column and the Total volume chip.** A recipient reads prices off a link; cargo volume stays on the live Appraisal tab, which still has both. Generated and Expires sit under the table after a divider, and Export sits on the totals row.
- **On a phone the shared Appraisal's Sell and Buy totals read as shorthand with the exact figure in the `IskAmount` tooltip**, not the full figure with copy-on-click that wider screens keep (`FullIskTotal`): the full figure does not fit beside the other chips at 390px.
