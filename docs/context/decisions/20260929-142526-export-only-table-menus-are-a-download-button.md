# Scope decisions — Export-only table menus are a download button, not a ⋯ submenu

_Recorded 2026-09-29._

- **A menu whose only item would be "Export table" is an export button
  instead.** It shows a download icon ("Export {name}") and opens straight
  to Download CSV / Download Excel (.xlsx) / Copy for Google Sheets / Excel.
  This applies to every title-bar `TableActionsMenu` today and to the
  table-wide right-click menu on a table with no row menus. A ⋯ that opens
  to a single submenu is a wasted click. This supersedes the "⋯
  `TableActionsMenu` with an 'Export table ▸' submenu" wording in
  `20260929-085650-every-table-exports-csv-xlsx-and-clipboard-through.md`.
  It is still the one shared export entry point, not a per-surface
  "Export CSV" button.
- **"Export table ▸" stays a submenu only where the menu has other
  actions:** row right-click and "More actions" menus, and a
  `TableActionsMenu` given `children` (which then shows ⋯).
