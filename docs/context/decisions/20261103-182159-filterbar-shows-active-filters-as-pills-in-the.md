# Scope decisions — FilterBar shows active filters as pills in the slot its box opens into

_Recorded 2026-11-03._

- **While a `FilterBar`'s box is closed, the filters that are on show as one
  line of pills under its row.** Each pill reads "label: value" with its own
  remove, and Clear all ends the line. This extends the badge-only contract of
  `20260905-144941`, under which a closed bar said only how many filters were
  on, so a filter remembered from an earlier visit could hide rows with no
  visible reason.
- **One pill per filter, never one per value.** Several picks of one control
  fold into one value ("Highsec, Lowsec", "A, B +3"). The line never wraps:
  pills that do not fit fold into "+N" from the end, so each page lists its
  filters most important first.
- **The box opens into the pills' slot.** It slides down over where the pills
  were, so a setting shows as a pill or as its control, never both, and the
  list below moves down rather than being covered. Shawn rejected a design
  that showed both at once.
- **No second chip row.** The phone-only chip rows (Contracts History's
  statuses, BPC Sourcing's picks) and the Journal's chips beside its totals
  (#3908) repeated what the pills now show, and are gone.
- **A popover bar shows no pills**, because it sits in a bar that already says
  what it is set to (the order book's scope line). The search text is never a
  pill.
- **On a phone, the filter sheet's footer is Clear all plus a close button**
  that says what the picks leave ("Show 312 results", or "Done" with no count).
  Edits still apply as they are made.
