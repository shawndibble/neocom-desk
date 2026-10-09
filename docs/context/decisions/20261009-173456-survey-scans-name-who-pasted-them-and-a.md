# Scope decisions — Survey scans name who pasted them, and a first scan is checked for collapsed sections

_Recorded 2026-10-09._

- **<Decision>.** <Why, and what it rules out.>

- A Survey Scan records the active Character's name as `by` when the pasting
  pilot has one, and none for an anonymous visitor. Anyone with the link sees
  it: the chart tooltip for a scan ends with "Scanned by <name>" or
  "Scanned by Anonymous". This is the same exposure the Survey's owner name
  already has; it is the one Share Link content that names a person.
- A pilot's first scan on this device that is missing an ore the Survey has shown
  asks "<ore> is no longer on this report. Confirm that all mining survey result
  sections are expanded." with "All are expanded" and "Cancel upload". The
  scanner prints nothing for a collapsed group, so the board would otherwise
  count that ore as mined out. After any scan has been added on the device the
  pilot is trusted and never asked again, and choosing "Add to existing
  survey" skips it.
- `firestore.rules` now allows an optional `by` string (≤100) on a scan. The
  rules are not deployed by CI; until they are, a scan with a name is refused
  by the server.
