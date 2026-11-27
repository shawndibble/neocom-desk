# Scope decisions — table export and refresh go in the table's title bar, else the filter bar

_Recorded 2026-11-27._

- **A table's Export and Refresh sit in that table's title bar when it has one; with no title bar, Export joins its `FilterBar` `actions`.** Owner call on UX audit 2026-11 S-152: placement follows context, not sibling pages. A title bar is the table's `Panel` header, a section heading row, or the `PageHeader` (or `CharacterHeader`) of a page whose only content is that table (Members, Employment History). Order stays Export then Refresh. Settles DESIGN.md's `TableActionsMenu` row against the audit's CON-16, which both now say.
- **Clones' Export goes back to the Clones panel's title bar; its Refresh stays in the character header.** The panel has a title, so the rule puts Export there. Refresh renews the whole tab (the summary cards above the panel read the same clones data), so it stays in the header as on Employment History, and the data age stays at the end of the tab row.
- **Corp assets already fits.** Its tables sit in untitled panels under the page's tabs, and each tab's table brings its own export, so Export stays in the `FilterBar`. Its page-wide Refresh stays in the `PageHeader` beside the `DataAgeBadge` it renews: the `FilterBar` is gone while the page loads, fails, is empty, or shows the Move tab.
- **A whole-dataset workbook download is not a table export.** SRP's "Download SRP data (.xlsx)" stays a body button.
