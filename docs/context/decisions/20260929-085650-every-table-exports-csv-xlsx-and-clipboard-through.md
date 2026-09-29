# Scope decisions — Every table exports CSV, xlsx and clipboard through one menu

_Recorded 2026-09-29._

- **Every data table is exportable, from one menu.** A table block's title
  bar carries a ⋯ `TableActionsMenu` with an "Export table ▸" submenu
  (Download CSV / Download Excel (.xlsx) / Copy for Google Sheets / Excel).
  The same submenu is appended to every row's right-click and "More actions"
  menu, and a table with no row menus gets it on a table-wide right-click.
  The old one-off "Export CSV" icon buttons are replaced by it. Rules out a
  per-surface export control in a per-surface place.
- **Export is what's on screen: the filtered rows, in the displayed sort
  order.** Not the unfiltered dataset. A table that mounts only its first N
  rows behind "Show all" still exports every row (`source: 'rows'`).
- **CSV quotes every text field; numbers and dates stay bare.** A CSV opened
  in OpenOffice whose Text Import dialog kept a saved "Space" separator split
  item names across cells. The file was valid RFC 4180; quoting every text
  field keeps a name in one cell under more importer settings, and xlsx is
  the answer for the rest, since it has no import dialog at all.
- **ESI timestamps export as real dates** (`YYYY-MM-DD HH:MM:SS`, UTC — EVE
  time) in CSV/clipboard and as date cells in xlsx, so they sort and filter
  as dates. Detected from the value (`…T…Z`), so every column builder gets it
  without opting in.
- **xlsx is written in-house on `fflate`** (MIT, zip only, lazy-loaded on
  first xlsx export). SheetJS no longer publishes to npm and ExcelJS is
  ~1 MB; a single-sheet writer is ~150 lines.
- **Clipboard is tab-separated text**, which Sheets and Excel split into
  cells on paste and parse as typed (numbers and dates stay values).
