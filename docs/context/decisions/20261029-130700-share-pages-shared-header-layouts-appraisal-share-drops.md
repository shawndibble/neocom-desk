# Scope decisions — Share pages: one shared header, appraisal share drops volume, phone totals in shorthand

_Recorded 2026-10-29._

- **Every Share Link page uses one `ShareShell` header**: the brand and login in one row over a divider, the title kept for screen readers only (the page says what it is below), in a 768px frame, or 896px with `wide` for the two-column shared Fitting. There is no second, classic header: the D-scan page, the shared Appraisal, the shared Mining Survey, the shared Fitting and the Share Link loading, gone and failed states all render in it, so a new share page adds content, never another header. A page's own action sits at the right of the row under the header, and an expiry is a chip at the bottom.
- **The shared Appraisal drops the Volume column and the Total volume chip.** A recipient reads prices off a link; cargo volume stays on the live Appraisal tab, which still has both. Generated and Expires sit under the table after a divider, and Export sits on the totals row. Item is the first column and Qty second, on the shared page and the live tab.
- **On a phone the shared Appraisal's Sell and Buy totals read as shorthand with the exact figure in the `IskAmount` tooltip**, not the full figure with copy-on-click that wider screens keep (`FullIskTotal`): the full figure does not fit beside the other chips at 390px.
