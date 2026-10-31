# Scope decisions — Palette market item pick opens the Market Browser

_Recorded 2026-10-31._

- **Picking a Market Items row navigates to the Market Browser on that item, not Item Detail over the page.** It carries the hub or region the browser is already on (`marketLinkParams`). Item Detail stays one click away from the browser. This replaces the earlier "sits over the current page, no navigation" behaviour; the host no longer owns an Item Detail modal.
