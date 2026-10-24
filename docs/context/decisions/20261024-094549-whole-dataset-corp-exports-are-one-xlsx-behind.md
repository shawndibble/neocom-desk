# Scope decisions — Whole-dataset corp exports are one xlsx behind a download button (issue #4946)

_Recorded 2026-10-24 · issue #4946._

- **A whole dataset (the Corp Tax Book, SRP) exports as one .xlsx, a sheet per record
  type, from a plain labelled download button.** Not a table's `TableActionsMenu`: the
  file holds every record the officer can read, not the rows of one table on screen,
  and it has one format, so a menu would hold one item (decision `20260929-142526`).
  The "never a per-surface Export button" rule of `20260929-085650` still holds for tables.
- **One xlsx, not a .zip of CSVs or JSON.** It opens on a phone and in Google Sheets with
  every tab, and ESI times arrive as date cells. There is no import back, so JSON adds
  nothing.
- **The export reads only what the officer can already read** under the existing Firestore
  rules, straight from the client. No callable, no new reach. Verify links
  (`statementLinks`) stay out.
- **The Delete the book dialog offers the download but never requires it.** Delete holds
  only while a copy started there is still being read.
- **SRP's button is on Settings (Directors) and the Queue header**, so an Accountant who
  works the Queue can export too.
