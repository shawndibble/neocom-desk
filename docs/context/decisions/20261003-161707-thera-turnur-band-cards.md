# Scope decisions — Thera / Turnur band cards (issue #2473)

_Recorded 2026-10-03 · issue #2473._

- **Thera / Turnur is a card grid, not a table — an exception to DESIGN.md's
  "tables are the norm".** The question a pilot brings is "where can I come
  out", so the page groups holes into four columns by exit space (Highsec,
  Lowsec, Nullsec, J-space) and each column is short. A table sorted by
  jumps mixed the four together and needed an exit-space filter to read one
  band. The exception is this page's; it does not license card grids for other
  data lists.
- **Fits is a six-segment `SegmentedControl`, over DESIGN.md's 2–4 guideline.**
  The ship sizes are an ordered scale the pilot clicks between often, and
  with short labels (Any · S · M · L · XL · Cap) the group still fits a 390px
  phone. Hub (three options) is within the guideline.
- **A connection whose exit space can't be told is left out.** No security on
  record and no class letters in the feed means there is no column to put it
  in. The empty state then reads as "no open connections", not "no match".
- **The phone switcher is `Tabs` with counts**, per the ticket ("High 9 ·
  Low 6"), opening on the first band that has holes.
