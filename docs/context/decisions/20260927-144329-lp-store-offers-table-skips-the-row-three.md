# Scope decisions — LP Store offers table skips the row three-dot menu

_Recorded 2026-09-27._

- **The LP Store offers table (`src/routes/LoyaltyStore.tsx`) does not render the
  row's "More actions" three-dot button (`DataTable`'s `rowMoreActions`
  prop), even though it still offers the same actions via right-click
  (`rowContextMenu`).** Elsewhere `rowMoreActions` exists as the
  keyboard/screen-reader-accessible equivalent of a right-click menu (WCAG
  2.1.1, issue #1497). It was tried here too, but the LP Store's item
  context menu doesn't carry enough LP-Store-specific actions to justify an
  always-visible button on every row — it's just the same handful of
  generic item actions (Show info, Add to Compare, View in Market, etc.)
  already reachable elsewhere for these items, so the button was pure
  clutter. Don't re-add `rowMoreActions` to this table without first
  growing the context menu to include entries that are actually
  loyalty-store-specific and worth a permanent per-row button.
