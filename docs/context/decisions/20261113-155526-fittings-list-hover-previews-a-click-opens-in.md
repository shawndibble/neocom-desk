# Scope decisions — Fittings list: hover previews, a click opens, in the Open dialog too

_Recorded 2026-11-13. Replaces the desktop click-to-preview, double-click-to-open behaviour of `20260925-152418`, and that decision's "the dialog and picker have no use for one" for the editor's Open dialog; `20261001-210222` stands otherwise._

- **A click (or Enter) on a Fittings list row opens it, everywhere.** On the desktop Start page a click used to only pick the row for the preview, and opening took a double-click or the preview's Open fitting button: an extra step before the thing the pilot came to do.
- **On a desktop the preview follows the hovered or focused row.** The pointer has to rest on a row for 150 ms before the preview moves, so a pointer crossing other rows on its way to the preview's buttons (Compare, notes) leaves it be. Leaving the list keeps the last row previewed. The arrow keys move focus, and the preview with it. A touch has no hover, so on a touch screen a tap opens and the preview stays on the first row.
- **The editor's Open a fitting dialog previews too.** It is the Start page's list and preview at the `page` modal size, so switching fits shows the same ring, stats and skills as arriving on the page. Rules out the plain list it was, which named the fits but showed nothing about them.
- **The Compare picker stays a plain list,** and a phone still has no preview: a row there is only ever picked, and a phone has no room beside the list.
