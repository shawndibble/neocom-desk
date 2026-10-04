# Scope decisions — Thera / Turnur back to a slim table (issue #2499)

_Recorded 2026-10-03 · issue #2499._

- **Thera / Turnur is a table again; the band-cards exception no longer
  applies.** Shawn picked mockup B, a slim table of open holes (exit, sec,
  region, fits, life left, jumps, and a Copy action), over the four band
  columns of #2473. DESIGN.md's "tables are the norm" holds for this page
  again. This supersedes the card-grid bullet in
  `20261003-161707-thera-turnur-band-cards.md`, which stays as the record
  of what shipped then.
- **Exit is a filter again, in the URL as `space`.** Values: `kspace`
  (default), `highsec`, `lowsec`, `nullsec`, `wormhole`. Any other value,
  including the `all` older links carried, falls back to K-space. Pre-#2473
  links with `space=wormhole` still land on J-space.
- **Under K-space, J-space exits fold into a collapsed group under the
  table** ("8 exits into J-space · no gate route from you"), not into the
  table: none has a gate route, so in a jumps-sorted table they would only
  sink to the bottom. The J-space filter shows them as the table itself.
- **An exit whose band can't be told (no security on record, no feed class)
  is K-space.** Its name is not a J-space one, so it is a gated system; it
  shows under K-space and under no single band. This replaces #2473's "left
  out", which only existed because there was no column to put it in.
- **Exit is a five-segment `SegmentedControl`, Fits stays six — both over
  DESIGN.md's 2–4 guideline.** Short labels, ordered choices the pilot
  clicks between often, and on a phone each becomes a chip that opens its
  options as a menu, so the row wraps rather than scrolling sideways.
- **Hub counts follow the other filters.** Each Hub option's count is what
  the table would show with that hub picked, under the current Exit and
  Fits; the folded J-space group is not counted under K-space.
- **Rows with the same jump count (every J-space hole) read longest-lived
  first.** The page hands the table rows in that order and the jumps sort
  is stable, so Jumps ascending stays the default sort everywhere.
- **The phone card's third line is `stackEdge: 'below'`.** The signature
  pair and Copy do not fit the 11px meta line; rather than a new card
  style, the dense stack gained one more edge, a full-width line under the
  meta line.
