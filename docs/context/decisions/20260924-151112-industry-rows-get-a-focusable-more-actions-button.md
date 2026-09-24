# Scope decisions — Industry rows get a focusable More-actions button, not a discoverability hint (issue #1498)

_Recorded 2026-09-24 · issue #1498._

- **Rows and other elements whose actions live only in a right-click/long-press
  context menu now also render a small, visible "More actions" icon button
  (`ItemMoreActions` in `src/features/market/ItemContextMenu.tsx`, and
  per-surface siblings following the same shape) that opens the identical item
  list via a `DropdownMenu`.** This is a real keyboard focus target (WCAG
  2.1.1), not a discoverability hint — a prior attempt at context-menu
  discoverability, a "?" `ContextMenuHint` tooltip covering some of these same
  surfaces (Active Jobs, Industry Materials), was tried and then removed
  (`docs/context/decisions/20260908-130811-context-menu-discoverability-hint-reuses-each-panels-title.md`,
  commit `6f014389`) for adding visual noise without keyboard-operability
  value. This round is a different answer to a different problem: several of
  these surfaces (the Build Plan hero heading, the recipe modal's title and
  rows, the blueprint acquisition modal's title) had **no keyboard path to
  their actions at all**, since `ContextMenuTrigger asChild` wraps a bare
  `<h2>`/`<span>`/`<li>` with no focusable element of its own. The rest
  (`DataTable` rows) were already keyboard-operable via Shift+F10, so the
  button there closes a discoverability gap rather than a keyboard-access one
  — but every surface gets the same visible button regardless, so a reader
  never has to remember which pages the invisible path exists on.
